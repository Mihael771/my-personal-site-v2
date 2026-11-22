import type { DailyBiometricLog, WatchActivityRecord } from '../types/fitness';

export const INTERVALS_API_TIMEOUT_MS = 3000;

export interface IntervalsWellnessPayload {
  id?: string;
  steps?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  sleepStart?: string | number | null;
  sleepEnd?: string | number | null;
  bedTime?: string | number | null;
  wakeTime?: string | number | null;
  deepSleepSecs?: number | null;
  deepSleep?: number | null;
  remSleepSecs?: number | null;
  remSleep?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  weight?: number | null;
  activeCalories?: number | null;
}

export interface IntervalsActivityPayload {
  id?: string;
  type?: string | null;
  sport_type?: string | null;
  name?: string | null;
  start_date_local?: string | null;
  distance?: number | null; // meters
  moving_time?: number | null; // seconds
  elapsed_time?: number | null; // seconds
  total_elevation_gain?: number | null; // meters
  average_heartrate?: number | null; // bpm
  max_heartrate?: number | null; // bpm
  max_speed?: number | null; // m/s
  calories?: number | null;
}

export interface ParsedWatchDayData {
  steps?: number;
  restingHr?: number;
  hrv?: number;
  sleepHours?: number;
  sleepStartTime?: string;
  sleepEndTime?: string;
  deepSleepSecs?: number;
  remSleepSecs?: number;
  sleepQuality?: number; // 1..5
  weightKg?: number;
  activeCalories?: number;
  cardioDistanceKm?: number;
  cardioDurationMinutes?: number;
  cardioElevationGainM?: number;
  watchActivities?: WatchActivityRecord[];
  hasAnyMetric: boolean;
}

export interface FetchIntervalsWatchResult {
  ok: boolean;
  offline: boolean;
  authError?: boolean;
  data?: ParsedWatchDayData;
}

const CARDIO_SUMMARY_TYPES = new Set([
  'run',
  'trailrun',
  'trail_run',
  'trail run',
  'hike',
  'walk',
]);

const WATCH_TRACKED_ACTIVITY_MAP: Record<string, string> = {
  run: 'Run',
  virtualrun: 'Run',
  trailrun: 'TrailRun',
  trail_run: 'TrailRun',
  'trail run': 'TrailRun',
  hike: 'Hike',
  walk: 'Walk',
  ride: 'Ride',
  virtualride: 'Ride',
  mountainbikeride: 'Ride',
  gravelride: 'Ride',
  cycling: 'Ride',
  alpineski: 'AlpineSki',
  alpine_ski: 'AlpineSki',
  'alpine ski': 'AlpineSki',
  backcountryski: 'BackcountrySki',
  backcountry_ski: 'BackcountrySki',
  'backcountry ski': 'BackcountrySki',
  nordicski: 'BackcountrySki',
  snowboard: 'Snowboard',
  snowboarding: 'Snowboard',
};

export function buildIntervalsWellnessUrl(dateKey: string): string {
  return `https://intervals.icu/api/v1/athlete/0/wellness/${encodeURIComponent(dateKey)}`;
}

export function buildIntervalsActivitiesUrl(dateKey: string): string {
  const encoded = encodeURIComponent(dateKey);
  return `https://intervals.icu/api/v1/athlete/0/activities?oldest=${encoded}&newest=${encoded}`;
}

export function buildIntervalsAuthHeader(apiKey: string): string {
  const raw = `API_KEY:${apiKey.trim()}`;
  const encoded =
    typeof btoa === 'function'
      ? btoa(raw)
      : Buffer.from(raw, 'utf-8').toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Converts Intervals.icu sleepScore (0–100) or sleepQuality (1–4, where 1=Great..4=Poor)
 * into the app's 1–5 subjective freshness scale.
 */
export function convertIntervalsSleepTo1To5(params: {
  sleepScore?: number | null;
  sleepQuality?: number | null;
}): number | undefined {
  const { sleepScore, sleepQuality } = params;

  if (typeof sleepScore === 'number' && Number.isFinite(sleepScore) && sleepScore > 0) {
    if (sleepScore >= 85) return 5;
    if (sleepScore >= 72) return 4;
    if (sleepScore >= 58) return 3;
    if (sleepScore >= 42) return 2;
    return 1;
  }

  if (
    typeof sleepQuality === 'number' &&
    Number.isFinite(sleepQuality) &&
    sleepQuality >= 1 &&
    sleepQuality <= 4
  ) {
    const rounded = Math.round(sleepQuality);
    // Intervals.icu standard: 1 = Great, 2 = Good, 3 = Average, 4 = Poor
    if (rounded === 1) return 5;
    if (rounded === 2) return 4;
    if (rounded === 3) return 3;
    return 2;
  }

  return undefined;
}

function positiveNum(val: unknown): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) {
    return undefined;
  }
  return val;
}

function isRunOrHikeActivity(activity: IntervalsActivityPayload): boolean {
  const candidates = [activity.type, activity.sport_type];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const norm = c.trim().toLowerCase();
    if (CARDIO_SUMMARY_TYPES.has(norm)) return true;
  }
  return false;
}

function resolveTrackedWatchActivityType(
  activity: IntervalsActivityPayload,
): string | null {
  const candidates = [activity.sport_type, activity.type];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const norm = c.trim().toLowerCase();
    if (WATCH_TRACKED_ACTIVITY_MAP[norm]) {
      return WATCH_TRACKED_ACTIVITY_MAP[norm];
    }
  }
  return null;
}

function extractSleepStageSecs(
  primarySecs: unknown,
  fallbackVal: unknown,
  maxTotalSecs?: number,
): number | undefined {
  const secVal = positiveNum(primarySecs);
  let resolved: number | undefined;
  if (secVal !== undefined && secVal <= 86400) {
    resolved = Math.round(secVal);
  } else {
    const fb = positiveNum(fallbackVal);
    if (fb !== undefined) {
      if (fb <= 24) {
        // Hours format (e.g., 1.6 hours)
        resolved = Math.round(fb * 3600);
      } else if (fb <= 86400) {
        // Seconds format (e.g., 5760 secs)
        resolved = Math.round(fb);
      }
    }
  }
  if (resolved === undefined || resolved <= 0) return undefined;
  if (maxTotalSecs !== undefined && maxTotalSecs > 0 && resolved > maxTotalSecs) {
    return Math.round(maxTotalSecs);
  }
  return resolved;
}

function extractClockHm(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const hm = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (hm) {
      const hh = Number(hm[1]);
      const mm = Number(hm[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
    const isoTime = trimmed.match(/T(\d{2}):(\d{2})/);
    if (isoTime) {
      const hh = Number(isoTime[1]);
      const mm = Number(isoTime[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
        return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      }
    }
  } else if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Seconds since midnight (0..86399) or epoch ms (> 1e11)
    if (raw >= 0 && raw < 86400) {
      const totalMin = Math.floor(raw / 60);
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
    if (raw > 1e11) {
      const dt = new Date(raw);
      if (!Number.isNaN(dt.getTime())) {
        return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
      }
    }
  }
  return undefined;
}

export function parseIntervalsWatchDayData(
  wellnessRaw: IntervalsWellnessPayload | null | undefined,
  activitiesRaw: IntervalsActivityPayload[] | null | undefined,
): ParsedWatchDayData {
  const w = wellnessRaw ?? {};
  const activities = Array.isArray(activitiesRaw) ? activitiesRaw : [];

  const stepsRaw = positiveNum(w.steps);
  const steps = stepsRaw !== undefined ? Math.round(stepsRaw) : undefined;

  const rhrRaw = positiveNum(w.restingHR);
  const restingHr =
    rhrRaw !== undefined && rhrRaw >= 25 && rhrRaw <= 220
      ? Math.round(rhrRaw)
      : undefined;

  const hrvRaw = positiveNum(w.hrv) ?? positiveNum(w.hrvSDNN);
  const hrv =
    hrvRaw !== undefined && hrvRaw >= 5 && hrvRaw <= 300
      ? Math.round(hrvRaw * 10) / 10
      : undefined;

  const sleepSecs = positiveNum(w.sleepSecs);
  const sleepHours =
    sleepSecs !== undefined
      ? Math.min(24, Math.round((sleepSecs / 3600) * 10) / 10)
      : undefined;

  const sleepStartTime = extractClockHm(w.sleepStart ?? w.bedTime);
  const sleepEndTime = extractClockHm(w.sleepEnd ?? w.wakeTime);

  const deepSleepSecs = extractSleepStageSecs(
    w.deepSleepSecs,
    w.deepSleep,
    sleepSecs,
  );
  const remSleepSecs = extractSleepStageSecs(
    w.remSleepSecs,
    w.remSleep,
    sleepSecs,
  );

  const sleepQuality = convertIntervalsSleepTo1To5({
    sleepScore: w.sleepScore,
    sleepQuality: w.sleepQuality,
  });

  const weightRaw = positiveNum(w.weight);
  const weightKg =
    weightRaw !== undefined && weightRaw >= 20 && weightRaw <= 400
      ? Math.round(weightRaw * 10) / 10
      : undefined;

  // Active calories: prefer wellness.activeCalories, otherwise sum calories across all day activities
  const wellnessActiveCal = positiveNum(w.activeCalories);
  let activityCaloriesSum = 0;
  let totalCardioMeters = 0;
  let totalCardioSeconds = 0;
  let totalElevationMeters = 0;
  let matchedCardioCount = 0;
  const watchActivities: WatchActivityRecord[] = [];

  for (const act of activities) {
    if (!act || typeof act !== 'object') continue;
    const cal = positiveNum(act.calories);
    if (cal !== undefined) {
      activityCaloriesSum += cal;
    }

    const trackedType = resolveTrackedWatchActivityType(act);
    if (trackedType) {
      const dist = positiveNum(act.distance);
      const movingTime =
        positiveNum(act.moving_time) ?? positiveNum(act.elapsed_time);
      const elev = positiveNum(act.total_elevation_gain);
      const avgHrRaw = positiveNum(act.average_heartrate);
      const maxHrRaw = positiveNum(act.max_heartrate);
      const maxSpeedRaw = positiveNum(act.max_speed);

      const cleanName =
        typeof act.name === 'string' && act.name.trim()
          ? act.name.trim().slice(0, 120)
          : trackedType;

      watchActivities.push({
        ...(typeof act.id === 'string' && act.id.trim()
          ? { id: act.id.trim().slice(0, 64) }
          : {}),
        type: trackedType,
        name: cleanName,
        ...(dist !== undefined ? { distance: Math.round(dist) } : {}),
        ...(movingTime !== undefined ? { moving_time: Math.round(movingTime) } : {}),
        ...(elev !== undefined ? { total_elevation_gain: Math.round(elev) } : {}),
        ...(avgHrRaw !== undefined && avgHrRaw >= 30 && avgHrRaw <= 240
          ? { average_heartrate: Math.round(avgHrRaw) }
          : {}),
        ...(maxHrRaw !== undefined && maxHrRaw >= 30 && maxHrRaw <= 240
          ? { max_heartrate: Math.round(maxHrRaw) }
          : {}),
        ...(maxSpeedRaw !== undefined && maxSpeedRaw <= 60
          ? { max_speed: Math.round(maxSpeedRaw * 100) / 100 }
          : {}),
        ...(cal !== undefined ? { calories: Math.round(cal) } : {}),
        ...(typeof act.start_date_local === 'string' && act.start_date_local.trim()
          ? { start_date_local: act.start_date_local.trim().slice(0, 40) }
          : {}),
      });
    }

    if (isRunOrHikeActivity(act)) {
      matchedCardioCount += 1;
      const dist = positiveNum(act.distance);
      if (dist !== undefined) totalCardioMeters += dist;
      const dur = positiveNum(act.moving_time) ?? positiveNum(act.elapsed_time);
      if (dur !== undefined) totalCardioSeconds += dur;
      const elev = positiveNum(act.total_elevation_gain);
      if (elev !== undefined) totalElevationMeters += elev;
    }
  }

  const activeCalories =
    wellnessActiveCal !== undefined
      ? Math.round(wellnessActiveCal)
      : activityCaloriesSum > 0
        ? Math.round(activityCaloriesSum)
        : undefined;

  const cardioDistanceKm =
    matchedCardioCount > 0 && totalCardioMeters > 0
      ? Math.round((totalCardioMeters / 1000) * 100) / 100
      : undefined;
  const cardioDurationMinutes =
    matchedCardioCount > 0 && totalCardioSeconds > 0
      ? Math.round(totalCardioSeconds / 60)
      : undefined;
  const cardioElevationGainM =
    matchedCardioCount > 0 && totalElevationMeters > 0
      ? Math.round(totalElevationMeters)
      : undefined;

  const hasAnyMetric =
    steps !== undefined ||
    restingHr !== undefined ||
    hrv !== undefined ||
    sleepHours !== undefined ||
    sleepStartTime !== undefined ||
    sleepEndTime !== undefined ||
    deepSleepSecs !== undefined ||
    remSleepSecs !== undefined ||
    sleepQuality !== undefined ||
    weightKg !== undefined ||
    activeCalories !== undefined ||
    cardioDistanceKm !== undefined ||
    cardioDurationMinutes !== undefined ||
    cardioElevationGainM !== undefined ||
    watchActivities.length > 0;

  return {
    ...(steps !== undefined ? { steps } : {}),
    ...(restingHr !== undefined ? { restingHr } : {}),
    ...(hrv !== undefined ? { hrv } : {}),
    ...(sleepHours !== undefined ? { sleepHours } : {}),
    ...(sleepStartTime !== undefined ? { sleepStartTime } : {}),
    ...(sleepEndTime !== undefined ? { sleepEndTime } : {}),
    ...(deepSleepSecs !== undefined ? { deepSleepSecs } : {}),
    ...(remSleepSecs !== undefined ? { remSleepSecs } : {}),
    ...(sleepQuality !== undefined ? { sleepQuality } : {}),
    ...(weightKg !== undefined ? { weightKg } : {}),
    ...(activeCalories !== undefined ? { activeCalories } : {}),
    ...(cardioDistanceKm !== undefined ? { cardioDistanceKm } : {}),
    ...(cardioDurationMinutes !== undefined ? { cardioDurationMinutes } : {}),
    ...(cardioElevationGainM !== undefined ? { cardioElevationGainM } : {}),
    ...(watchActivities.length > 0 ? { watchActivities } : {}),
    hasAnyMetric,
  };
}

/**
 * Fetches wellness & activities for `dateKey` in parallel via Promise.all
 * with a strict 3-second AbortController timeout. Never throws on network failure.
 */
export async function fetchIntervalsWatchDayData(params: {
  apiKey: string;
  dateKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<FetchIntervalsWatchResult> {
  const {
    apiKey,
    dateKey,
    fetchImpl = fetch,
    timeoutMs = INTERVALS_API_TIMEOUT_MS,
  } = params;

  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, offline: false };
  }

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Authorization: buildIntervalsAuthHeader(cleanKey),
    Accept: 'application/json',
  };

  try {
    const [wellnessRes, activitiesRes] = await Promise.all([
      fetchImpl(buildIntervalsWellnessUrl(dateKey), {
        method: 'GET',
        headers,
        signal: controller.signal,
      }),
      fetchImpl(buildIntervalsActivitiesUrl(dateKey), {
        method: 'GET',
        headers,
        signal: controller.signal,
      }),
    ]);

    if (wellnessRes.status === 401 || activitiesRes.status === 401 || wellnessRes.status === 403 || activitiesRes.status === 403) {
      return { ok: false, offline: false, authError: true };
    }

    const wellnessJson = wellnessRes.ok
      ? ((await wellnessRes.json()) as IntervalsWellnessPayload)
      : null;
    const activitiesJson = activitiesRes.ok
      ? ((await activitiesRes.json()) as IntervalsActivityPayload[])
      : null;

    if (!wellnessRes.ok && !activitiesRes.ok) {
      return { ok: false, offline: true };
    }

    const data = parseIntervalsWatchDayData(wellnessJson, activitiesJson);
    return {
      ok: true,
      offline: false,
      data,
    };
  } catch {
    return { ok: false, offline: true };
  } finally {
    clearTimeout(timerId);
  }
}

/**
 * Merges synced watch data into a DailyBiometricLog.
 * - Background mode (`overwriteExisting: false`): fills ONLY missing/empty fields.
 * - Manual sync mode (`overwriteExisting: true`): updates all fields returned by the watch.
 */
export function mergeWatchDataIntoDailyLog(params: {
  existing: DailyBiometricLog | null | undefined;
  dateKey: string;
  watchData: ParsedWatchDayData;
  overwriteExisting: boolean;
  syncedAtIso?: string;
}): {
  nextEntry: DailyBiometricLog;
  changedFieldsCount: number;
} {
  const {
    existing,
    dateKey,
    watchData,
    overwriteExisting,
    syncedAtIso = new Date().toISOString(),
  } = params;

  const base: DailyBiometricLog = existing
    ? { ...existing, date: dateKey, completedHabits: [...existing.completedHabits] }
    : { date: dateKey, completedHabits: [] };

  let changedFieldsCount = 0;

  const applyNumberField = <
    K extends
      | 'steps'
      | 'restingHr'
      | 'hrv'
      | 'sleepHours'
      | 'deepSleepSecs'
      | 'remSleepSecs'
      | 'sleepQuality'
      | 'weightKg'
      | 'activeCalories'
      | 'cardioDistanceKm'
      | 'cardioDurationMinutes'
      | 'cardioElevationGainM',
  >(
    key: K,
  ) => {
    const incoming = watchData[key];
    if (incoming === undefined) return;
    const current = base[key];
    if (overwriteExisting || current === undefined) {
      if (current !== incoming) {
        base[key] = incoming;
        changedFieldsCount += 1;
      }
    }
  };

  const applyStringField = <K extends 'sleepStartTime' | 'sleepEndTime'>(
    key: K,
  ) => {
    const incoming = watchData[key];
    if (incoming === undefined) return;
    const current = base[key];
    if (overwriteExisting || current === undefined) {
      if (current !== incoming) {
        base[key] = incoming;
        changedFieldsCount += 1;
      }
    }
  };

  applyNumberField('steps');
  applyNumberField('restingHr');
  applyNumberField('hrv');
  applyNumberField('sleepHours');
  applyStringField('sleepStartTime');
  applyStringField('sleepEndTime');
  applyNumberField('deepSleepSecs');
  applyNumberField('remSleepSecs');
  applyNumberField('sleepQuality');
  applyNumberField('weightKg');
  applyNumberField('activeCalories');
  applyNumberField('cardioDistanceKm');
  applyNumberField('cardioDurationMinutes');
  applyNumberField('cardioElevationGainM');

  if (watchData.watchActivities && watchData.watchActivities.length > 0) {
    const hasExisting =
      Array.isArray(base.watchActivities) && base.watchActivities.length > 0;
    if (overwriteExisting || !hasExisting) {
      const prevJson = JSON.stringify(base.watchActivities ?? []);
      const nextJson = JSON.stringify(watchData.watchActivities);
      if (prevJson !== nextJson) {
        base.watchActivities = watchData.watchActivities;
        changedFieldsCount += 1;
      }
    }
  }

  base.watchSyncedAt = syncedAtIso;

  return {
    nextEntry: base,
    changedFieldsCount,
  };
}
