import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
} from '../types/fitness';
import { computeDetailedMuscleRecovery } from './analysisPrep';

export interface WeatherCity {
  name: string;
  country?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export interface OutdoorWeatherRecommendation {
  status: 'outdoor_great' | 'outdoor_caution' | 'indoor';
  emoji: string;
  headline: string;
  suggestedEnvironment: 'street' | 'gym_or_home';
}

export interface WeatherDailySummary {
  date: string;
  weatherCode: number;
  conditionLabel: string;
  conditionEmoji: string;
  isWet: boolean;
  isStorm: boolean;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipProbabilityMax: number | null;
  windSpeedMaxKmh: number | null;
}

export interface WeatherForecastData {
  city: WeatherCity;
  fetchedAt: number;
  current: {
    temperatureC: number;
    apparentTemperatureC: number;
    precipitationMm: number;
    windSpeedKmh: number;
    weatherCode: number;
    conditionLabel: string;
    conditionEmoji: string;
  };
  today: {
    date: string;
    tempMaxC: number | null;
    tempMinC: number | null;
    precipProbabilityMax: number | null;
    windSpeedMaxKmh?: number | null;
  };
  tomorrow: {
    date: string;
    tempMaxC: number | null;
    tempMinC: number | null;
    precipProbabilityMax: number | null;
    windSpeedMaxKmh?: number | null;
  } | null;
  daily7d: WeatherDailySummary[];
  recommendation: OutdoorWeatherRecommendation;
}

export type WeeklyDayPlanMode = 'outdoor' | 'indoor' | 'recovery';

export type MountainIndexStatus = 'ideal' | 'windy_ridge' | 'unsuitable';

export interface MountainWeatherIndex {
  status: MountainIndexStatus;
  label: string; // ☀️ Идеално за преход | 💨 Силен вятър на билото | 🌧️ Неподходящо за планина
  highAltitudeTempMaxC: number | null; // cityTempMax - 6.5°C (~1000m elevation gain)
  highAltitudeTempMinC: number | null; // cityTempMin - 6.5°C
  estimatedRidgeWindKmh: number | null;
}

export interface WeeklyGymVsOutdoorDayPlan {
  date: string;
  dayShortLabel: string; // Пн, Вт, Ср...
  dayNumberLabel: string; // DD.MM
  isToday: boolean;
  mode: WeeklyDayPlanMode;
  emoji: string;
  actionLabel: string;
  reasonText: string;
  weatherEmoji: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipProbabilityMax: number | null;
  windSpeedMaxKmh: number | null;
  mountainIndex: MountainWeatherIndex;
}

export const DEFAULT_WEATHER_CITY: WeatherCity = {
  name: 'Карлово',
  country: 'България',
  admin1: 'Пловдив',
  latitude: 42.6333,
  longitude: 24.8,
};

export const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000; // 60 minutes
export const WEATHER_TIMEOUT_MS = 4000; // 4 seconds

const WEATHER_CITY_STORAGE_KEY = 'fizioprogres_weather_city_v1';
const WEATHER_CACHE_STORAGE_KEY = 'fizioprogres_weather_cache_v2';

interface WeatherCacheEntry {
  cityKey: string;
  data: WeatherForecastData;
}

function getCityKey(city: Pick<WeatherCity, 'latitude' | 'longitude'>): string {
  return `${city.latitude.toFixed(3)},${city.longitude.toFixed(3)}`;
}

function safeLocalStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private-mode errors silently
  }
}

export function loadSavedWeatherCity(): WeatherCity {
  const raw = safeLocalStorageGet(WEATHER_CITY_STORAGE_KEY);
  if (!raw) return DEFAULT_WEATHER_CITY;
  try {
    const parsed = JSON.parse(raw) as Partial<WeatherCity>;
    if (
      typeof parsed.name === 'string' &&
      parsed.name.trim().length > 0 &&
      typeof parsed.latitude === 'number' &&
      Number.isFinite(parsed.latitude) &&
      typeof parsed.longitude === 'number' &&
      Number.isFinite(parsed.longitude)
    ) {
      return {
        name: parsed.name.trim(),
        country: typeof parsed.country === 'string' ? parsed.country : undefined,
        admin1: typeof parsed.admin1 === 'string' ? parsed.admin1 : undefined,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      };
    }
  } catch {
    // Fallback to default city
  }
  return DEFAULT_WEATHER_CITY;
}

export function saveWeatherCity(city: WeatherCity): void {
  safeLocalStorageSet(WEATHER_CITY_STORAGE_KEY, JSON.stringify(city));
}

export function decodeWmoWeatherCode(code: number): {
  label: string;
  emoji: string;
  isWet: boolean;
  isStorm: boolean;
} {
  if (code === 0) {
    return { label: 'Ясно', emoji: '☀️', isWet: false, isStorm: false };
  }
  if (code === 1 || code === 2) {
    return { label: 'Предимно ясно', emoji: '🌤️', isWet: false, isStorm: false };
  }
  if (code === 3) {
    return { label: 'Облачно', emoji: '☁️', isWet: false, isStorm: false };
  }
  if (code === 45 || code === 48) {
    return { label: 'Мъгла', emoji: '🌫️', isWet: false, isStorm: false };
  }
  if (code >= 51 && code <= 57) {
    return { label: 'Ръмеж', emoji: '🌦️', isWet: true, isStorm: false };
  }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { label: 'Дъжд', emoji: '🌧️', isWet: true, isStorm: false };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { label: 'Снеговалеж', emoji: '❄️', isWet: true, isStorm: false };
  }
  if (code >= 95 && code <= 99) {
    return { label: 'Гръмотевична буря', emoji: '⛈️', isWet: true, isStorm: true };
  }
  return { label: 'Променливо', emoji: '⛅', isWet: false, isStorm: false };
}

export function evaluateOutdoorTrainingWeather(params: {
  temperatureC: number;
  precipitationMm: number;
  windSpeedKmh: number;
  weatherCode: number;
  precipProbabilityMax?: number | null;
}): OutdoorWeatherRecommendation {
  const {
    temperatureC,
    precipitationMm,
    windSpeedKmh,
    weatherCode,
    precipProbabilityMax = null,
  } = params;
  const decoded = decodeWmoWeatherCode(weatherCode);
  const roundedTemp = Math.round(temperatureC);
  const roundedWind = Math.round(windSpeedKmh);

  if (decoded.isStorm) {
    return {
      status: 'indoor',
      emoji: '⛈️',
      headline:
        'Гръмотевична буря навън — тренирай на закрито (зала или вкъщи).',
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (decoded.isWet || precipitationMm >= 0.2) {
    return {
      status: 'indoor',
      emoji: '🌧️',
      headline: `${decoded.label} (${roundedTemp}°C) — препоръчителна тренировка в зала или вкъщи.`,
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (windSpeedKmh >= 30) {
    return {
      status: 'indoor',
      emoji: '💨',
      headline: `Силен вятър (${roundedWind} km/h, ${roundedTemp}°C) — препоръчителна тренировка в зала или вкъщи.`,
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (precipProbabilityMax !== null && precipProbabilityMax >= 70) {
    return {
      status: 'indoor',
      emoji: '🌧️',
      headline: `Висок риск от дъжд (${precipProbabilityMax}%) — по-сигурен избор е тренировка в зала или вкъщи.`,
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (temperatureC < 2) {
    return {
      status: 'indoor',
      emoji: '🥶',
      headline: `Студено (${roundedTemp}°C) — препоръчителна тренировка в зала или вкъщи (ако си навън, загрей по-дълго).`,
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (temperatureC >= 33) {
    return {
      status: 'outdoor_caution',
      emoji: '🥵',
      headline: `Горещо (${roundedTemp}°C) — за лостове/бягане избери сутрин/вечер с повече вода, или тренирай в зала.`,
      suggestedEnvironment: 'gym_or_home',
    };
  }

  if (temperatureC < 10 || windSpeedKmh >= 20) {
    return {
      status: 'outdoor_caution',
      emoji: decoded.emoji,
      headline: `${roundedTemp}°C (${decoded.label.toLowerCase()}, вятър ${roundedWind} km/h) — става за лостове или бягане навън с ветровка и добра загрявка.`,
      suggestedEnvironment: 'street',
    };
  }

  return {
    status: 'outdoor_great',
    emoji: decoded.emoji,
    headline: `${roundedTemp}°C, сухо и тихо — отлични условия за лостове или бягане навън.`,
    suggestedEnvironment: 'street',
  };
}

export function buildForecastUrl(city: Pick<WeatherCity, 'latitude' | 'longitude'>): string {
  const lat = encodeURIComponent(String(city.latitude));
  const lon = encodeURIComponent(String(city.longitude));
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
}

export function buildGeocodingUrl(cityQuery: string): string {
  return `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityQuery.trim())}&count=1&language=bg`;
}

export function readCachedWeather(
  city: Pick<WeatherCity, 'latitude' | 'longitude'>,
  nowMs: number = Date.now(),
): WeatherForecastData | null {
  const raw = safeLocalStorageGet(WEATHER_CACHE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WeatherCacheEntry>;
    if (
      !parsed ||
      parsed.cityKey !== getCityKey(city) ||
      !parsed.data ||
      !Array.isArray(parsed.data.daily7d)
    ) {
      return null;
    }
    const ageMs = nowMs - (parsed.data.fetchedAt ?? 0);
    if (ageMs < 0 || ageMs > WEATHER_CACHE_TTL_MS) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedWeather(data: WeatherForecastData): void {
  const payload: WeatherCacheEntry = {
    cityKey: getCityKey(data.city),
    data,
  };
  safeLocalStorageSet(WEATHER_CACHE_STORAGE_KEY, JSON.stringify(payload));
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number = WEATHER_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timerId);
  }
}

export function parseOpenMeteoForecastResponse(
  raw: unknown,
  city: WeatherCity,
  nowMs: number = Date.now(),
): WeatherForecastData | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as {
    current?: {
      temperature_2m?: unknown;
      apparent_temperature?: unknown;
      precipitation?: unknown;
      wind_speed_10m?: unknown;
      weather_code?: unknown;
    };
    daily?: {
      time?: unknown[];
      weather_code?: unknown[];
      temperature_2m_max?: unknown[];
      temperature_2m_min?: unknown[];
      precipitation_probability_max?: unknown[];
      wind_speed_10m_max?: unknown[];
    };
  };

  if (!obj.current || typeof obj.current.temperature_2m !== 'number') {
    return null;
  }

  const temperatureC = Number(obj.current.temperature_2m);
  const apparentTemperatureC =
    typeof obj.current.apparent_temperature === 'number'
      ? Number(obj.current.apparent_temperature)
      : temperatureC;
  const precipitationMm =
    typeof obj.current.precipitation === 'number'
      ? Number(obj.current.precipitation)
      : 0;
  const windSpeedKmh =
    typeof obj.current.wind_speed_10m === 'number'
      ? Number(obj.current.wind_speed_10m)
      : 0;
  const weatherCode =
    typeof obj.current.weather_code === 'number'
      ? Math.round(obj.current.weather_code)
      : 0;

  const decoded = decodeWmoWeatherCode(weatherCode);

  const times = Array.isArray(obj.daily?.time) ? obj.daily!.time : [];
  const dailyCodes = Array.isArray(obj.daily?.weather_code)
    ? obj.daily!.weather_code
    : [];
  const maxTemps = Array.isArray(obj.daily?.temperature_2m_max)
    ? obj.daily!.temperature_2m_max
    : [];
  const minTemps = Array.isArray(obj.daily?.temperature_2m_min)
    ? obj.daily!.temperature_2m_min
    : [];
  const precipProbs = Array.isArray(obj.daily?.precipitation_probability_max)
    ? obj.daily!.precipitation_probability_max
    : [];
  const windMaxes = Array.isArray(obj.daily?.wind_speed_10m_max)
    ? obj.daily!.wind_speed_10m_max
    : [];

  const toNumOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  const daily7d: WeatherDailySummary[] = [];
  for (let i = 0; i < Math.min(7, times.length); i++) {
    const rawDt = times[i];
    const dt = typeof rawDt === 'string' ? rawDt : '';
    if (!dt) continue;
    const codeVal = toNumOrNull(dailyCodes[i]);
    const dayCode = codeVal !== null ? Math.round(codeVal) : i === 0 ? weatherCode : 0;
    const dayDecoded = decodeWmoWeatherCode(dayCode);
    daily7d.push({
      date: dt,
      weatherCode: dayCode,
      conditionLabel: dayDecoded.label,
      conditionEmoji: dayDecoded.emoji,
      isWet: dayDecoded.isWet,
      isStorm: dayDecoded.isStorm,
      tempMaxC: toNumOrNull(maxTemps[i]),
      tempMinC: toNumOrNull(minTemps[i]),
      precipProbabilityMax: toNumOrNull(precipProbs[i]),
      windSpeedMaxKmh: toNumOrNull(windMaxes[i]),
    });
  }

  const todayPrecipProb = toNumOrNull(precipProbs[0]);
  const todayWindMax = toNumOrNull(windMaxes[0]);

  const recommendation = evaluateOutdoorTrainingWeather({
    temperatureC,
    precipitationMm,
    windSpeedKmh,
    weatherCode,
    precipProbabilityMax: todayPrecipProb,
  });

  const tomorrow =
    typeof times[1] === 'string'
      ? {
          date: times[1],
          tempMaxC: toNumOrNull(maxTemps[1]),
          tempMinC: toNumOrNull(minTemps[1]),
          precipProbabilityMax: toNumOrNull(precipProbs[1]),
          windSpeedMaxKmh: toNumOrNull(windMaxes[1]),
        }
      : null;

  return {
    city,
    fetchedAt: nowMs,
    current: {
      temperatureC,
      apparentTemperatureC,
      precipitationMm,
      windSpeedKmh,
      weatherCode,
      conditionLabel: decoded.label,
      conditionEmoji: decoded.emoji,
    },
    today: {
      date: typeof times[0] === 'string' ? times[0] : '',
      tempMaxC: toNumOrNull(maxTemps[0]),
      tempMinC: toNumOrNull(minTemps[0]),
      precipProbabilityMax: todayPrecipProb,
      windSpeedMaxKmh: todayWindMax,
    },
    tomorrow,
    daily7d,
    recommendation,
  };
}

export async function fetchOutdoorWeather(
  city: WeatherCity,
  options?: {
    forceRefresh?: boolean;
    fetchImpl?: typeof fetch;
    nowMs?: number;
  },
): Promise<{
  data: WeatherForecastData | null;
  fromCache: boolean;
  offline: boolean;
}> {
  const nowMs = options?.nowMs ?? Date.now();
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!options?.forceRefresh) {
    const cached = readCachedWeather(city, nowMs);
    if (cached) {
      return { data: cached, fromCache: true, offline: false };
    }
  }

  try {
    const json = await fetchJsonWithTimeout(
      buildForecastUrl(city),
      WEATHER_TIMEOUT_MS,
      fetchImpl,
    );
    const parsed = parseOpenMeteoForecastResponse(json, city, nowMs);
    if (!parsed) {
      return { data: null, fromCache: false, offline: true };
    }
    writeCachedWeather(parsed);
    return { data: parsed, fromCache: false, offline: false };
  } catch {
    return { data: null, fromCache: false, offline: true };
  }
}

export async function searchWeatherCity(
  cityName: string,
  options?: { fetchImpl?: typeof fetch },
): Promise<
  | { status: 'found'; city: WeatherCity }
  | { status: 'not_found' }
  | { status: 'offline' }
> {
  const trimmed = cityName.trim();
  if (!trimmed) return { status: 'not_found' };
  const fetchImpl = options?.fetchImpl ?? fetch;

  try {
    const json = (await fetchJsonWithTimeout(
      buildGeocodingUrl(trimmed),
      WEATHER_TIMEOUT_MS,
      fetchImpl,
    )) as {
      results?: Array<{
        name?: unknown;
        country?: unknown;
        admin1?: unknown;
        latitude?: unknown;
        longitude?: unknown;
      }>;
    };

    const first = Array.isArray(json?.results) ? json.results[0] : null;
    if (
      !first ||
      typeof first.name !== 'string' ||
      typeof first.latitude !== 'number' ||
      typeof first.longitude !== 'number'
    ) {
      return { status: 'not_found' };
    }

    return {
      status: 'found',
      city: {
        name: first.name,
        country: typeof first.country === 'string' ? first.country : undefined,
        admin1: typeof first.admin1 === 'string' ? first.admin1 : undefined,
        latitude: first.latitude,
        longitude: first.longitude,
      },
    };
  } catch {
    return { status: 'offline' };
  }
}

const BG_WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const;

function getBgShortWeekday(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return BG_WEEKDAYS_SHORT[dt.getDay()] ?? ymd;
}

function getShortDayMonth(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}.${parts[1]}`;
}

function shiftYmdLocal(ymd: string, deltaDays: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

function countConsecutiveTrainingDaysBefore(
  workoutDates: Set<string>,
  anchorDate: string,
): number {
  let streak = 0;
  for (let offset = 1; offset <= 7; offset++) {
    if (workoutDates.has(shiftYmdLocal(anchorDate, -offset))) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export const MOUNTAIN_ALTITUDE_LAPSE_C = 6.5; // ~6.5°C drop per ~1000m elevation gain (Stara Planina / Balkan above Karlovo)

/**
 * Computes the Balkan Mountain Index from city forecast:
 * - High-altitude temperature = city temperature - 6.5°C (~1000 m elevation gain)
 * - Ridge wind check + precipitation/storm check -> exact mountain hike verdict.
 */
export function evaluateMountainWeatherIndex(
  day: Pick<
    WeatherDailySummary,
    'tempMaxC' | 'tempMinC' | 'precipProbabilityMax' | 'windSpeedMaxKmh' | 'isWet' | 'isStorm'
  >,
): MountainWeatherIndex {
  const highAltitudeTempMaxC =
    day.tempMaxC !== null
      ? Math.round((day.tempMaxC - MOUNTAIN_ALTITUDE_LAPSE_C) * 10) / 10
      : null;
  const highAltitudeTempMinC =
    day.tempMinC !== null
      ? Math.round((day.tempMinC - MOUNTAIN_ALTITUDE_LAPSE_C) * 10) / 10
      : null;

  // Exposed Balkan ridge wind is typically ~1.35x valley wind
  const estimatedRidgeWindKmh =
    day.windSpeedMaxKmh !== null
      ? Math.round(day.windSpeedMaxKmh * 1.35)
      : null;

  const precip = day.precipProbabilityMax ?? 0;
  const valleyWind = day.windSpeedMaxKmh ?? 0;
  const ridgeWind = estimatedRidgeWindKmh ?? 0;

  if (
    day.isStorm ||
    day.isWet ||
    precip >= 45 ||
    (highAltitudeTempMaxC !== null && highAltitudeTempMaxC <= -4)
  ) {
    return {
      status: 'unsuitable',
      label: '🌧️ Неподходящо за планина',
      highAltitudeTempMaxC,
      highAltitudeTempMinC,
      estimatedRidgeWindKmh,
    };
  }

  if (valleyWind >= 22 || ridgeWind >= 32) {
    return {
      status: 'windy_ridge',
      label: '💨 Силен вятър на билото',
      highAltitudeTempMaxC,
      highAltitudeTempMinC,
      estimatedRidgeWindKmh,
    };
  }

  return {
    status: 'ideal',
    label: '☀️ Идеално за преход',
    highAltitudeTempMaxC,
    highAltitudeTempMinC,
    estimatedRidgeWindKmh,
  };
}

/**
 * Feature 4: Builds a 7-day „Зала срещу Навън“ weekly training schedule by combining
 * Open-Meteo's 7-day forecast with the user's current muscle recovery & training streak.
 *
 * Rules:
 * - Accumulated fatigue / after 3 consecutive training days -> 🧘 Активно възстановяване / Разходка
 * - Dry weather (precipProb < 40% & non-wet code), light wind (< 22 km/h), temp > 10°C
 *   -> 🤸 Лостове / Преход в Балкана
 * - Rain, strong wind (>= 22 km/h), or cold (<= 10°C)
 *   -> 🏋️ Тежка тренировка в зала / Вкъщи
 */
export function buildWeeklyGymVsOutdoorPlan(params: {
  daily7d: WeatherDailySummary[];
  hevyWorkouts?: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  todayKey?: string;
  customExerciseMappings?: CustomExerciseMappings;
}): WeeklyGymVsOutdoorDayPlan[] {
  const {
    daily7d,
    hevyWorkouts = [],
    dailyLogs = [],
    todayKey,
    customExerciseMappings,
  } = params;

  if (!Array.isArray(daily7d) || daily7d.length === 0) return [];

  const effectiveToday = todayKey || daily7d[0].date;
  const workoutDates = new Set(hevyWorkouts.map((w) => w.date));

  // Evaluate current muscle fatigue & freshness on day 0
  const parsedRefTs = Date.parse(`${effectiveToday}T18:00:00`);
  const refTimestampMs = Number.isNaN(parsedRefTs) ? Date.now() : parsedRefTs;
  const recoveryItems = computeDetailedMuscleRecovery(
    hevyWorkouts,
    refTimestampMs,
    dailyLogs,
    customExerciseMappings,
  );
  const fatiguedCount = recoveryItems.filter((m) => m.status === 'fatigued').length;
  const recoveredNames = recoveryItems
    .filter((m) => m.status === 'recovered')
    .slice(0, 2)
    .map((m) => m.label);

  // Check if recent sleep was critically short (< 6.0 h)
  const latestLog = dailyLogs
    .filter((l) => l.date <= effectiveToday)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const severeSleepDeficit =
    typeof latestLog?.sleepHours === 'number' && latestLog.sleepHours < 6.0;

  let consecutiveTrainDays = countConsecutiveTrainingDaysBefore(
    workoutDates,
    daily7d[0].date,
  );
  // If user already trained today, include today in streak for tomorrow's recovery calculation
  const trainedToday = workoutDates.has(daily7d[0].date);

  return daily7d.slice(0, 7).map((day, idx) => {
    const isToday = day.date === effectiveToday || idx === 0;
    const isHighFatigueToday =
      idx === 0 && (fatiguedCount >= 5 || (fatiguedCount >= 3 && severeSleepDeficit));
    const needsRecovery = consecutiveTrainDays >= 3 || isHighFatigueToday;

    const precip = day.precipProbabilityMax ?? 0;
    const wind = day.windSpeedMaxKmh ?? 0;
    const tempMax = day.tempMaxC ?? 15;

    const isDry = !day.isWet && !day.isStorm && precip < 40;
    const isLightWind = wind < 22;
    const isWarmEnough = tempMax > 10;

    let mode: WeeklyDayPlanMode;
    let emoji: string;
    let actionLabel: string;
    let reasonText: string;

    if (needsRecovery) {
      mode = 'recovery';
      emoji = '🧘';
      actionLabel = 'Активно възстановяване / Разходка';
      reasonText = isHighFatigueToday
        ? `Натрупана умора (${fatiguedCount} изморени зони)`
        : 'След поредни тренировъчни дни';
      consecutiveTrainDays = 0;
    } else if (isDry && isLightWind && isWarmEnough) {
      mode = 'outdoor';
      emoji = '🤸';
      actionLabel = 'Лостове / Преход в Балкана';
      const freshHint =
        idx <= 1 && recoveredNames.length > 0
          ? ` · Свежи: ${recoveredNames[0]}`
          : '';
      reasonText = `Сухо, ${Math.round(tempMax)}°C, вятър ${Math.round(wind)} km/h${freshHint}`;
      consecutiveTrainDays = idx === 0 && trainedToday ? consecutiveTrainDays + 1 : consecutiveTrainDays + 1;
    } else {
      mode = 'indoor';
      emoji = '🏋️';
      actionLabel = 'Тежка тренировка в зала / Вкъщи';
      const indoorReasons: string[] = [];
      if (day.isStorm) indoorReasons.push('буря');
      else if (day.isWet || precip >= 40) indoorReasons.push(`дъжд ${Math.round(precip)}%`);
      if (wind >= 22) indoorReasons.push(`вятър ${Math.round(wind)} km/h`);
      if (tempMax <= 10) indoorReasons.push(`студено ${Math.round(tempMax)}°C`);
      reasonText =
        indoorReasons.length > 0
          ? indoorReasons.join(', ')
          : 'По-добри условия на закрито';
      consecutiveTrainDays += 1;
    }

    const mountainIndex = evaluateMountainWeatherIndex(day);

    return {
      date: day.date,
      dayShortLabel: isToday ? 'Днес' : getBgShortWeekday(day.date),
      dayNumberLabel: getShortDayMonth(day.date),
      isToday,
      mode,
      emoji,
      actionLabel,
      reasonText,
      weatherEmoji: day.conditionEmoji,
      tempMaxC: day.tempMaxC,
      tempMinC: day.tempMinC,
      precipProbabilityMax: day.precipProbabilityMax,
      windSpeedMaxKmh: day.windSpeedMaxKmh,
      mountainIndex,
    };
  });
}
