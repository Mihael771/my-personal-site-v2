import type { DailyBiometricLog, WatchActivityRecord } from '../types/fitness';

export const DEFAULT_HABIT_ITEMS: string[] = [
  'Креатин',
  '2.5+ л вода',
  'Разтягане / Мобилност',
  'Без захар / джънк',
];

export const DEFAULT_HARMFUL_HABIT_ITEMS: string[] = [
  'Алкохол',
  'Никотин / Цигари',
  'Късно лягане',
  'Джънк / Захар',
  'Висок стрес',
];

export const DEFAULT_DAILY_STEPS_GOAL = 10000;

export function sanitizeDailyStepsGoal(raw: unknown): number | undefined {
  const val = clampOptionalNum(raw, 1000, 100000, 0);
  return val !== undefined ? Math.round(val) : undefined;
}

function isValidYmd(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

function shiftYmd(dateKey: string, deltaDays: number): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

function clampOptionalNum(
  val: unknown,
  min: number,
  max: number,
  decimals: number = 1,
): number | undefined {
  if (val === undefined || val === null || val === '') return undefined;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num) || num < min || num > max) return undefined;
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

function sanitizeOptionalTimeHm(val: unknown): string | undefined {
  if (typeof val !== 'string') return undefined;
  const match = val.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return undefined;
  }
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function sanitizeHabitItemsArray(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim().slice(0, 60);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(trimmed);
  }
  return cleaned;
}

export function sanitizeWatchActivitiesArray(
  raw: unknown,
): WatchActivityRecord[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const cleaned: WatchActivityRecord[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<WatchActivityRecord>;
    const type =
      typeof obj.type === 'string' && obj.type.trim()
        ? obj.type.trim().slice(0, 40)
        : '';
    if (!type) continue;
    const name =
      typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim().slice(0, 120)
        : type;
    const distanceRaw = clampOptionalNum(obj.distance, 0, 500000, 0);
    const movingTimeRaw = clampOptionalNum(obj.moving_time, 0, 172800, 0);
    const elevRaw = clampOptionalNum(obj.total_elevation_gain, 0, 20000, 0);
    const avgHrRaw = clampOptionalNum(obj.average_heartrate, 30, 240, 0);
    const maxHrRaw = clampOptionalNum(obj.max_heartrate, 30, 240, 0);
    const maxSpeedRaw = clampOptionalNum(obj.max_speed, 0, 60, 2);
    const calRaw = clampOptionalNum(obj.calories, 0, 20000, 0);

    cleaned.push({
      ...(typeof obj.id === 'string' && obj.id.trim()
        ? { id: obj.id.trim().slice(0, 64) }
        : {}),
      type,
      name,
      ...(distanceRaw !== undefined ? { distance: Math.round(distanceRaw) } : {}),
      ...(movingTimeRaw !== undefined
        ? { moving_time: Math.round(movingTimeRaw) }
        : {}),
      ...(elevRaw !== undefined
        ? { total_elevation_gain: Math.round(elevRaw) }
        : {}),
      ...(avgHrRaw !== undefined
        ? { average_heartrate: Math.round(avgHrRaw) }
        : {}),
      ...(maxHrRaw !== undefined ? { max_heartrate: Math.round(maxHrRaw) } : {}),
      ...(maxSpeedRaw !== undefined ? { max_speed: maxSpeedRaw } : {}),
      ...(calRaw !== undefined ? { calories: Math.round(calRaw) } : {}),
      ...(typeof obj.start_date_local === 'string' && obj.start_date_local.trim()
        ? { start_date_local: obj.start_date_local.trim().slice(0, 40) }
        : {}),
    });
  }
  return cleaned.length > 0 ? cleaned.slice(0, 30) : undefined;
}

export function sanitizeDailyLogEntry(raw: unknown): DailyBiometricLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<DailyBiometricLog>;
  if (typeof obj.date !== 'string' || !isValidYmd(obj.date)) return null;

  const weightKg = clampOptionalNum(obj.weightKg, 20, 400, 1);
  const sleepHours = clampOptionalNum(obj.sleepHours, 0, 24, 1);
  const sleepStartTime = sanitizeOptionalTimeHm(obj.sleepStartTime);
  const sleepEndTime = sanitizeOptionalTimeHm(obj.sleepEndTime);
  const rawDeepSleep =
    obj.deepSleepSecs !== undefined
      ? obj.deepSleepSecs
      : (obj as { deepSleep?: unknown }).deepSleep;
  const deepSleepRawNum = clampOptionalNum(rawDeepSleep, 0, 86400, 2);
  const deepSleepSecs =
    deepSleepRawNum !== undefined && deepSleepRawNum > 0
      ? deepSleepRawNum <= 24
        ? Math.round(deepSleepRawNum * 3600)
        : Math.round(deepSleepRawNum)
      : undefined;
  const rawRemSleep =
    obj.remSleepSecs !== undefined
      ? obj.remSleepSecs
      : (obj as { remSleep?: unknown }).remSleep;
  const remSleepRawNum = clampOptionalNum(rawRemSleep, 0, 86400, 2);
  const remSleepSecs =
    remSleepRawNum !== undefined && remSleepRawNum > 0
      ? remSleepRawNum <= 24
        ? Math.round(remSleepRawNum * 3600)
        : Math.round(remSleepRawNum)
      : undefined;
  const sleepQualityRaw = clampOptionalNum(obj.sleepQuality, 1, 5, 0);
  const sleepQuality =
    sleepQualityRaw !== undefined ? Math.round(sleepQualityRaw) : undefined;
  const restingHrRaw = clampOptionalNum(obj.restingHr, 25, 220, 0);
  const restingHr = restingHrRaw !== undefined ? Math.round(restingHrRaw) : undefined;
  const hrv = clampOptionalNum(obj.hrv, 5, 300, 1);
  const rawCaloriesIntake =
    obj.caloriesKcal !== undefined
      ? obj.caloriesKcal
      : (obj as { caloriesIntake?: unknown }).caloriesIntake;
  const caloriesKcalRaw = clampOptionalNum(rawCaloriesIntake, 0, 20000, 0);
  const caloriesKcal =
    caloriesKcalRaw !== undefined ? Math.round(caloriesKcalRaw) : undefined;
  const proteinGrams = clampOptionalNum(obj.proteinGrams, 0, 1000, 1);
  const cardioDistanceKm = clampOptionalNum(obj.cardioDistanceKm, 0, 500, 2);
  const cardioDurationMinutesRaw = clampOptionalNum(
    obj.cardioDurationMinutes,
    0,
    1440,
    0,
  );
  const cardioDurationMinutes =
    cardioDurationMinutesRaw !== undefined
      ? Math.round(cardioDurationMinutesRaw)
      : undefined;
  const cardioElevationGainRaw = clampOptionalNum(
    obj.cardioElevationGainM,
    0,
    20000,
    0,
  );
  const cardioElevationGainM =
    cardioElevationGainRaw !== undefined
      ? Math.round(cardioElevationGainRaw)
      : undefined;
  const stepsRaw = clampOptionalNum(obj.steps, 0, 200000, 0);
  const steps = stepsRaw !== undefined ? Math.round(stepsRaw) : undefined;
  const activeCaloriesRaw = clampOptionalNum(obj.activeCalories, 0, 15000, 0);
  const activeCalories =
    activeCaloriesRaw !== undefined ? Math.round(activeCaloriesRaw) : undefined;
  const restingCaloriesRaw = clampOptionalNum(obj.restingCalories, 0, 10000, 0);
  const restingCalories =
    restingCaloriesRaw !== undefined ? Math.round(restingCaloriesRaw) : undefined;

  const completedHabits = Array.isArray(obj.completedHabits)
    ? Array.from(
        new Set(
          obj.completedHabits
            .filter((h): h is string => typeof h === 'string')
            .map((h) => h.trim())
            .filter(Boolean),
        ),
      )
    : [];

  const cleanNotes =
    typeof obj.notes === 'string' && obj.notes.trim()
      ? obj.notes.trim().slice(0, 500)
      : undefined;

  const watchActivities = sanitizeWatchActivitiesArray(obj.watchActivities);

  return {
    date: obj.date,
    ...(weightKg !== undefined ? { weightKg } : {}),
    ...(sleepHours !== undefined ? { sleepHours } : {}),
    ...(sleepStartTime !== undefined ? { sleepStartTime } : {}),
    ...(sleepEndTime !== undefined ? { sleepEndTime } : {}),
    ...(deepSleepSecs !== undefined ? { deepSleepSecs } : {}),
    ...(remSleepSecs !== undefined ? { remSleepSecs } : {}),
    ...(sleepQuality !== undefined ? { sleepQuality } : {}),
    ...(restingHr !== undefined ? { restingHr } : {}),
    ...(hrv !== undefined ? { hrv } : {}),
    ...(caloriesKcal !== undefined ? { caloriesKcal } : {}),
    ...(proteinGrams !== undefined ? { proteinGrams } : {}),
    ...(cardioDistanceKm !== undefined ? { cardioDistanceKm } : {}),
    ...(cardioDurationMinutes !== undefined ? { cardioDurationMinutes } : {}),
    ...(cardioElevationGainM !== undefined ? { cardioElevationGainM } : {}),
    ...(watchActivities !== undefined ? { watchActivities } : {}),
    ...(steps !== undefined ? { steps } : {}),
    ...(activeCalories !== undefined ? { activeCalories } : {}),
    ...(restingCalories !== undefined ? { restingCalories } : {}),
    completedHabits,
    ...(cleanNotes !== undefined ? { notes: cleanNotes } : {}),
    ...(typeof obj.watchSyncedAt === 'string' && obj.watchSyncedAt.trim()
      ? { watchSyncedAt: obj.watchSyncedAt.trim() }
      : {}),
    ...(typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
      ? { updatedAt: obj.updatedAt.trim() }
      : {}),
  };
}

export function sortDailyLogsNewestFirst(
  logs: DailyBiometricLog[],
): DailyBiometricLog[] {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date));
}

export function sanitizeDailyLogsArray(
  raw: unknown,
): DailyBiometricLog[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const byDate = new Map<string, DailyBiometricLog>();

  for (const item of raw) {
    const clean = sanitizeDailyLogEntry(item);
    if (clean) {
      byDate.set(clean.date, clean);
    }
  }

  return byDate.size > 0
    ? sortDailyLogsNewestFirst(Array.from(byDate.values()))
    : undefined;
}

export function upsertDailyBiometricLog(
  existing: DailyBiometricLog[],
  entry: DailyBiometricLog,
): DailyBiometricLog[] {
  const sanitized = sanitizeDailyLogEntry(entry);
  if (!sanitized) return existing;

  const byDate = new Map<string, DailyBiometricLog>();
  for (const item of existing) {
    byDate.set(item.date, item);
  }
  byDate.set(sanitized.date, {
    ...sanitized,
    updatedAt: new Date().toISOString(),
  });

  return sortDailyLogsNewestFirst(Array.from(byDate.values()));
}

export function deleteDailyBiometricLog(
  existing: DailyBiometricLog[],
  dateKey: string,
): DailyBiometricLog[] {
  return sortDailyLogsNewestFirst(existing.filter((item) => item.date !== dateKey));
}

export function computeProteinPerKg(
  proteinGrams: number | undefined,
  weightKg: number | undefined,
): number | null {
  if (
    proteinGrams === undefined ||
    weightKg === undefined ||
    !Number.isFinite(proteinGrams) ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0
  ) {
    return null;
  }
  return Math.round((proteinGrams / weightKg) * 100) / 100;
}

/**
 * Computes consecutive days streak for a given habit up to referenceDateKey.
 * If referenceDateKey doesn't have the habit checked yet, checks if yesterday
 * was checked so active streaks aren't lost mid-day before today's check-in.
 */
export function computeHabitStreak(
  dailyLogs: DailyBiometricLog[],
  habitName: string,
  referenceDateKey: string,
): number {
  if (!habitName.trim() || dailyLogs.length === 0) return 0;
  const normalizedTarget = habitName.trim().toLowerCase();

  const checkedDates = new Set<string>();
  for (const log of dailyLogs) {
    if (
      log.completedHabits.some(
        (h) => h.trim().toLowerCase() === normalizedTarget,
      )
    ) {
      checkedDates.add(log.date);
    }
  }

  if (checkedDates.size === 0) return 0;

  let cursor = referenceDateKey;
  if (!checkedDates.has(cursor)) {
    const yesterday = shiftYmd(referenceDateKey, -1);
    if (!checkedDates.has(yesterday)) {
      return 0;
    }
    cursor = yesterday;
  }

  let streak = 0;
  let guard = 0;
  while (checkedDates.has(cursor) && guard < 3660) {
    streak += 1;
    guard += 1;
    cursor = shiftYmd(cursor, -1);
  }

  return streak;
}

export function getLatestDailyWeight(
  dailyLogs: DailyBiometricLog[],
  fallbackWeightKg?: number | '',
): number | null {
  const sorted = sortDailyLogsNewestFirst(dailyLogs);
  for (const log of sorted) {
    if (log.weightKg !== undefined && log.weightKg > 0) {
      return log.weightKg;
    }
  }
  if (
    typeof fallbackWeightKg === 'number' &&
    Number.isFinite(fallbackWeightKg) &&
    fallbackWeightKg > 0
  ) {
    return fallbackWeightKg;
  }
  return null;
}

export function sanitizeOptionalAnalysisWeight(raw: unknown): number | undefined {
  return clampOptionalNum(raw, 20, 400, 1);
}

export function sanitizeSupplementCyclesMap(
  raw: unknown,
): Record<string, import('../types/fitness').SupplementCycleConfig> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: Record<string, import('../types/fitness').SupplementCycleConfig> = {};

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!val || typeof val !== 'object') continue;
    const obj = val as Partial<import('../types/fitness').SupplementCycleConfig>;
    const name =
      typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim().slice(0, 60)
        : key.trim().slice(0, 60);
    if (!name) continue;
    const mode = obj.mode === 'cyclic' ? 'cyclic' : 'continuous';
    const onWeeksRaw =
      typeof obj.onWeeks === 'number' && Number.isFinite(obj.onWeeks)
        ? Math.round(obj.onWeeks)
        : 8;
    const offWeeksRaw =
      typeof obj.offWeeks === 'number' && Number.isFinite(obj.offWeeks)
        ? Math.round(obj.offWeeks)
        : 2;
    const onWeeks = Math.max(1, Math.min(52, onWeeksRaw));
    const offWeeks = Math.max(1, Math.min(26, offWeeksRaw));
    const startDate =
      typeof obj.startDate === 'string' && isValidYmd(obj.startDate)
        ? obj.startDate
        : '';
    result[name] = {
      name,
      mode,
      onWeeks,
      offWeeks,
      startDate,
    };
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export interface EstimatedBmrResult {
  kcal: number;
  method: 'mifflin' | 'weight_22x';
}

/**
 * Computes Basal Metabolic Rate (resting calories) via Mifflin-St Jeor when both
 * weightKg and heightCm are available (defaulting age to 30), or falls back to
 * 22 × weightKg when height is not specified.
 */
export function estimateRestingCaloriesBmr(
  weightKg: number | null | undefined,
  heightCm?: number | '',
): EstimatedBmrResult | null {
  if (
    weightKg === undefined ||
    weightKg === null ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0
  ) {
    return null;
  }
  if (
    typeof heightCm === 'number' &&
    Number.isFinite(heightCm) &&
    heightCm >= 120 &&
    heightCm <= 250
  ) {
    const mifflin = Math.round(10 * weightKg + 6.25 * heightCm - 5 * 30 + 5);
    return {
      kcal: Math.max(800, mifflin),
      method: 'mifflin',
    };
  }
  return {
    kcal: Math.max(800, Math.round(22 * weightKg)),
    method: 'weight_22x',
  };
}

export interface DailyEnergySummary {
  effectiveRestingCalories: number | null;
  restingSource: 'manual' | 'mifflin' | 'weight_22x' | null;
  activeCalories: number | null;
  tdee: number | null;
  caloriesIntake: number | null;
  netBalance: number | null;
  status: 'deficit' | 'surplus' | 'balanced' | null;
  label: string | null;
}

export function computeDailyEnergySummary(params: {
  caloriesIntake?: number;
  activeCalories?: number;
  restingCalories?: number;
  weightKg?: number | null;
  heightCm?: number | '';
}): DailyEnergySummary {
  const { caloriesIntake, activeCalories, restingCalories, weightKg, heightCm } =
    params;

  let effectiveRestingCalories: number | null = null;
  let restingSource: DailyEnergySummary['restingSource'] = null;

  if (
    restingCalories !== undefined &&
    Number.isFinite(restingCalories) &&
    restingCalories > 0
  ) {
    effectiveRestingCalories = Math.round(restingCalories);
    restingSource = 'manual';
  } else {
    const est = estimateRestingCaloriesBmr(weightKg, heightCm);
    if (est) {
      effectiveRestingCalories = est.kcal;
      restingSource = est.method;
    }
  }

  const cleanActive =
    activeCalories !== undefined &&
    Number.isFinite(activeCalories) &&
    activeCalories >= 0
      ? Math.round(activeCalories)
      : null;

  const cleanIntake =
    caloriesIntake !== undefined &&
    Number.isFinite(caloriesIntake) &&
    caloriesIntake >= 0
      ? Math.round(caloriesIntake)
      : null;

  // TDEE requires smartwatch active calories (plus manual or estimated resting calories)
  // OR an explicit manual restingCalories value.
  let tdee: number | null = null;
  if (cleanActive !== null && effectiveRestingCalories !== null) {
    tdee = cleanActive + effectiveRestingCalories;
  } else if (
    restingSource === 'manual' &&
    effectiveRestingCalories !== null &&
    cleanActive === null
  ) {
    tdee = effectiveRestingCalories;
  }

  let netBalance: number | null = null;
  let status: DailyEnergySummary['status'] = null;
  let label: string | null = null;

  if (cleanIntake !== null && tdee !== null) {
    netBalance = cleanIntake - tdee;
    if (netBalance < -50) {
      status = 'deficit';
      label = `Дефицит: ${netBalance} kcal`;
    } else if (netBalance > 50) {
      status = 'surplus';
      label = `Излишък: +${netBalance} kcal`;
    } else {
      status = 'balanced';
      label = `Баланс: ${netBalance > 0 ? `+${netBalance}` : netBalance} kcal`;
    }
  }

  return {
    effectiveRestingCalories,
    restingSource,
    activeCalories: cleanActive,
    tdee,
    caloriesIntake: cleanIntake,
    netBalance,
    status,
    label,
  };
}

export type CheckInMode = 'morning' | 'evening' | 'all';

export type EveningMetricKind =
  | 'steps'
  | 'activeCalories'
  | 'caloriesIntake'
  | 'tdee'
  | 'protein'
  | 'habits';

export function hasMorningMetrics(
  log: DailyBiometricLog | null | undefined,
): boolean {
  if (!log) return false;
  return (
    (log.weightKg !== undefined && log.weightKg > 0) ||
    (log.sleepHours !== undefined && log.sleepHours > 0) ||
    (log.sleepQuality !== undefined && log.sleepQuality > 0) ||
    (log.restingHr !== undefined && log.restingHr > 0) ||
    (log.hrv !== undefined && log.hrv > 0)
  );
}

export function hasCompletedEveningEnergy(
  log: DailyBiometricLog | null | undefined,
): boolean {
  if (!log) return false;
  return (
    (log.steps !== undefined && log.steps > 0) ||
    (log.activeCalories !== undefined && log.activeCalories > 0) ||
    (log.caloriesKcal !== undefined && log.caloriesKcal > 0)
  );
}

/**
 * Determines whether a daily log entry should be included in evening/end-of-day
 * statistics (steps, calories, protein, habits).
 *
 * For `todayKey`, missing or zero values (or empty completedHabits) are excluded
 * so incomplete mid-day logs never drag down averages or streaks. As soon as a
 * real value (> 0 or at least one habit) is entered for today, it is included.
 */
export function isDateIncludedForEveningMetric(
  log: DailyBiometricLog | null | undefined,
  todayKey: string,
  metric: EveningMetricKind,
): boolean {
  if (!log) return false;
  const isToday = log.date === todayKey;

  switch (metric) {
    case 'steps':
      return log.steps !== undefined && (isToday ? log.steps > 0 : log.steps >= 0);
    case 'activeCalories':
      return (
        log.activeCalories !== undefined &&
        (isToday ? log.activeCalories > 0 : log.activeCalories >= 0)
      );
    case 'caloriesIntake':
      return (
        log.caloriesKcal !== undefined &&
        (isToday ? log.caloriesKcal > 0 : log.caloriesKcal >= 0)
      );
    case 'tdee':
      return isToday
        ? (log.activeCalories !== undefined && log.activeCalories > 0) ||
            (log.restingCalories !== undefined && log.restingCalories > 0)
        : log.activeCalories !== undefined ||
            (log.restingCalories !== undefined && log.restingCalories > 0);
    case 'protein':
      return (
        log.proteinGrams !== undefined &&
        (isToday ? log.proteinGrams > 0 : log.proteinGrams >= 0)
      );
    case 'habits':
      return isToday ? log.completedHabits.length > 0 : true;
  }
}

/**
 * Resolves the effective end date for evening/full-day rolling windows (e.g. 7-day
 * steps, calories, TDEE, or habit stats). If today has not yet logged real (> 0)
 * data for the metric, anchors to yesterday so full completed days are averaged.
 */
export function resolveEveningWindowEndDate(
  dailyLogs: DailyBiometricLog[],
  todayKey: string,
  metric: 'steps' | 'energy' | 'protein' | 'habits',
): string {
  const todayLog = dailyLogs.find((d) => d.date === todayKey);
  if (metric === 'steps') {
    return isDateIncludedForEveningMetric(todayLog, todayKey, 'steps')
      ? todayKey
      : shiftYmd(todayKey, -1);
  }
  if (metric === 'energy') {
    const hasTodayEnergy =
      isDateIncludedForEveningMetric(todayLog, todayKey, 'caloriesIntake') ||
      isDateIncludedForEveningMetric(todayLog, todayKey, 'activeCalories') ||
      isDateIncludedForEveningMetric(todayLog, todayKey, 'tdee');
    return hasTodayEnergy ? todayKey : shiftYmd(todayKey, -1);
  }
  if (metric === 'protein') {
    return isDateIncludedForEveningMetric(todayLog, todayKey, 'protein')
      ? todayKey
      : shiftYmd(todayKey, -1);
  }
  return isDateIncludedForEveningMetric(todayLog, todayKey, 'habits')
    ? todayKey
    : shiftYmd(todayKey, -1);
}

export interface AutoCheckInDateResolution {
  date: string;
  reason:
    | 'morning_today'
    | 'evening_yesterday_incomplete'
    | 'evening_today'
    | 'all_today';
}

/**
 * Selects the most logical date when the user switches check-in mode:
 * - Morning mode -> always today.
 * - Evening mode -> if local hour < 19 and yesterday has no steps/calories yet,
 *   automatically switches to yesterday; otherwise today.
 * - All fields mode -> today.
 */
export function resolveAutoCheckInDate(params: {
  mode: CheckInMode;
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  currentHour: number;
}): AutoCheckInDateResolution {
  const { mode, dailyLogs, todayKey, currentHour } = params;
  if (mode === 'morning') {
    return { date: todayKey, reason: 'morning_today' };
  }
  if (mode === 'evening') {
    const yesterdayKey = shiftYmd(todayKey, -1);
    const yesterdayLog = dailyLogs.find((d) => d.date === yesterdayKey);
    if (currentHour < 19 && !hasCompletedEveningEnergy(yesterdayLog)) {
      return { date: yesterdayKey, reason: 'evening_yesterday_incomplete' };
    }
    return { date: todayKey, reason: 'evening_today' };
  }
  return { date: todayKey, reason: 'all_today' };
}

/**
 * Determines the smart initial mode + date when opening „Дневен чек-ин“.
 * - Before 19:00: if today's morning biometrics aren't logged yet -> Morning mode for Today.
 *   If today's morning is already logged and yesterday's evening data is missing -> Evening mode for Yesterday.
 * - At/after 19:00: Evening mode for Today.
 */
export function resolveInitialCheckInContext(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  currentHour: number;
}): { mode: CheckInMode; date: string } {
  const { dailyLogs, todayKey, currentHour } = params;
  const todayLog = dailyLogs.find((d) => d.date === todayKey);
  const yesterdayKey = shiftYmd(todayKey, -1);
  const yesterdayLog = dailyLogs.find((d) => d.date === yesterdayKey);

  if (currentHour < 19) {
    if (!hasMorningMetrics(todayLog)) {
      return { mode: 'morning', date: todayKey };
    }
    if (!hasCompletedEveningEnergy(yesterdayLog)) {
      return { mode: 'evening', date: yesterdayKey };
    }
    return { mode: 'morning', date: todayKey };
  }
  return { mode: 'evening', date: todayKey };
}

/**
 * Merges a partial form submission for `mode` into any existing entry for the
 * same date so saving morning data never wipes out evening fields (and vice versa).
 */
export function mergePartialDailyLog(
  existing: DailyBiometricLog | null | undefined,
  draft: DailyBiometricLog,
  mode: CheckInMode,
): DailyBiometricLog {
  if (mode === 'all') {
    return draft;
  }

  if (mode === 'morning') {
    return {
      date: draft.date,
      weightKg: draft.weightKg,
      sleepHours: draft.sleepHours,
      sleepStartTime: draft.sleepStartTime ?? existing?.sleepStartTime,
      sleepEndTime: draft.sleepEndTime ?? existing?.sleepEndTime,
      deepSleepSecs: draft.deepSleepSecs ?? existing?.deepSleepSecs,
      remSleepSecs: draft.remSleepSecs ?? existing?.remSleepSecs,
      sleepQuality: draft.sleepQuality,
      restingHr: draft.restingHr,
      hrv: draft.hrv,
      caloriesKcal: existing?.caloriesKcal,
      proteinGrams: existing?.proteinGrams,
      cardioDistanceKm: existing?.cardioDistanceKm,
      cardioDurationMinutes: existing?.cardioDurationMinutes,
      cardioElevationGainM: existing?.cardioElevationGainM,
      watchActivities: existing?.watchActivities,
      steps: existing?.steps,
      activeCalories: existing?.activeCalories,
      restingCalories: existing?.restingCalories,
      completedHabits: existing?.completedHabits ?? [],
    };
  }

  // mode === 'evening'
  return {
    date: draft.date,
    weightKg: existing?.weightKg,
    sleepHours: existing?.sleepHours,
    sleepStartTime: existing?.sleepStartTime,
    sleepEndTime: existing?.sleepEndTime,
    deepSleepSecs: existing?.deepSleepSecs,
    remSleepSecs: existing?.remSleepSecs,
    sleepQuality: existing?.sleepQuality,
    restingHr: existing?.restingHr,
    hrv: existing?.hrv,
    caloriesKcal: draft.caloriesKcal,
    proteinGrams: draft.proteinGrams,
    cardioDistanceKm: draft.cardioDistanceKm,
    cardioDurationMinutes: draft.cardioDurationMinutes,
    cardioElevationGainM: existing?.cardioElevationGainM,
    watchActivities: draft.watchActivities ?? existing?.watchActivities,
    steps: draft.steps,
    activeCalories: draft.activeCalories,
    restingCalories: draft.restingCalories,
    completedHabits: draft.completedHabits,
  };
}

export interface Last7DayOverviewRow {
  date: string;
  isYesterday: boolean;
  hasLog: boolean;
  hasAnyData: boolean;
  isComplete: boolean;
  morningFilled: boolean;
  weightKg: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  stepsFilled: boolean;
  steps: number | null;
  caloriesFilled: boolean;
  caloriesIntake: number | null;
  tdee: number | null;
  netBalance: number | null;
  balanceStatus: DailyEnergySummary['status'];
  habitsCount: number;
  totalHabitsCount: number;
  notes: string | null;
  suggestedMode: CheckInMode;
}

/**
 * Merges a unified partial daily log submission onto an existing log for the
 * same date without wiping out previously saved fields that were left untouched.
 * Passing `clearedFields` allows explicit user edits/deletions from the UI.
 */
type OptionalDailyLogField =
  | 'weightKg'
  | 'sleepHours'
  | 'sleepStartTime'
  | 'sleepEndTime'
  | 'deepSleepSecs'
  | 'remSleepSecs'
  | 'sleepQuality'
  | 'restingHr'
  | 'hrv'
  | 'caloriesKcal'
  | 'proteinGrams'
  | 'cardioDistanceKm'
  | 'cardioDurationMinutes'
  | 'cardioElevationGainM'
  | 'watchActivities'
  | 'steps'
  | 'activeCalories'
  | 'restingCalories'
  | 'notes'
  | 'watchSyncedAt';

export function mergeUnifiedDailyLog(
  existing: DailyBiometricLog | null | undefined,
  draft: DailyBiometricLog,
  clearedFields?: ReadonlySet<string>,
): DailyBiometricLog {
  const pick = <K extends OptionalDailyLogField>(
    key: K,
  ): DailyBiometricLog[K] => {
    if (draft[key] !== undefined) return draft[key];
    if (clearedFields?.has(key)) return undefined;
    return existing?.[key];
  };

  const habits =
    clearedFields?.has('completedHabits') ||
    draft.completedHabits.length > 0 ||
    !existing
      ? draft.completedHabits
      : existing.completedHabits;

  return {
    date: draft.date,
    weightKg: pick('weightKg'),
    sleepHours: pick('sleepHours'),
    sleepStartTime: pick('sleepStartTime'),
    sleepEndTime: pick('sleepEndTime'),
    deepSleepSecs: pick('deepSleepSecs'),
    remSleepSecs: pick('remSleepSecs'),
    sleepQuality: pick('sleepQuality'),
    restingHr: pick('restingHr'),
    hrv: pick('hrv'),
    caloriesKcal: pick('caloriesKcal'),
    proteinGrams: pick('proteinGrams'),
    cardioDistanceKm: pick('cardioDistanceKm'),
    cardioDurationMinutes: pick('cardioDurationMinutes'),
    cardioElevationGainM: pick('cardioElevationGainM'),
    watchActivities: pick('watchActivities'),
    steps: pick('steps'),
    activeCalories: pick('activeCalories'),
    restingCalories: pick('restingCalories'),
    completedHabits: habits,
    notes: pick('notes'),
    watchSyncedAt: pick('watchSyncedAt'),
  };
}

export interface PreviousDayCopyResult {
  sourceDate: string;
  found: boolean;
  hasAnyData: boolean;
  beneficialHabits: string[];
  caloriesKcal?: number;
  proteinGrams?: number;
}

/**
 * Extracts beneficial habits, food calories, and protein from the day immediately
 * preceding `targetDateKey` for 1-click speed filling.
 */
export function extractPreviousDayNutritionAndHabits(
  dailyLogs: DailyBiometricLog[],
  targetDateKey: string,
  isBeneficialHabit: (habit: string) => boolean,
): PreviousDayCopyResult {
  const sourceDate = shiftYmd(targetDateKey, -1);
  const prevLog = dailyLogs.find((d) => d.date === sourceDate);
  if (!prevLog) {
    return {
      sourceDate,
      found: false,
      hasAnyData: false,
      beneficialHabits: [],
    };
  }

  const beneficialHabits = prevLog.completedHabits.filter((h) =>
    isBeneficialHabit(h),
  );
  const caloriesKcal = prevLog.caloriesKcal;
  const proteinGrams = prevLog.proteinGrams;
  const hasAnyData =
    beneficialHabits.length > 0 ||
    caloriesKcal !== undefined ||
    proteinGrams !== undefined;

  return {
    sourceDate,
    found: true,
    hasAnyData,
    beneficialHabits,
    caloriesKcal,
    proteinGrams,
  };
}

/**
 * Builds a compact 7-day overview of the last 7 completed days (from yesterday
 * backwards) so the user can see at a glance where morning metrics, steps, or
 * calories are still missing and click any day to fill it in.
 */
export function buildLast7CompletedDaysOverview(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  totalHabitsCount: number;
  fallbackWeightKg?: number | null;
  heightCm?: number | '';
}): Last7DayOverviewRow[] {
  const {
    dailyLogs,
    todayKey,
    totalHabitsCount,
    fallbackWeightKg,
    heightCm,
  } = params;
  const byDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    byDate.set(log.date, log);
  }

  const rows: Last7DayOverviewRow[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const date = shiftYmd(todayKey, -offset);
    const log = byDate.get(date);
    const morningFilled = hasMorningMetrics(log);
    const stepsFilled = log?.steps !== undefined && log.steps > 0;
    const caloriesFilled =
      (log?.caloriesKcal !== undefined && log.caloriesKcal > 0) ||
      (log?.activeCalories !== undefined && log.activeCalories > 0);
    const habitsCount = log?.completedHabits.length ?? 0;
    const notes = log?.notes?.trim() ? log.notes.trim() : null;
    const hasAnyData =
      morningFilled ||
      stepsFilled ||
      caloriesFilled ||
      habitsCount > 0 ||
      Boolean(notes) ||
      (log?.cardioDistanceKm ?? 0) > 0 ||
      (log?.cardioDurationMinutes ?? 0) > 0;
    const isComplete = morningFilled && (stepsFilled || caloriesFilled);

    const energy = log
      ? computeDailyEnergySummary({
          caloriesIntake: log.caloriesKcal,
          activeCalories: log.activeCalories,
          restingCalories: log.restingCalories,
          weightKg: log.weightKg ?? fallbackWeightKg,
          heightCm,
        })
      : null;

    let suggestedMode: CheckInMode = 'all';
    if (morningFilled && (!stepsFilled || !caloriesFilled)) {
      suggestedMode = 'evening';
    } else if (!morningFilled && (stepsFilled || caloriesFilled)) {
      suggestedMode = 'morning';
    }

    rows.push({
      date,
      isYesterday: offset === 1,
      hasLog: Boolean(log),
      hasAnyData,
      isComplete,
      morningFilled,
      weightKg: log?.weightKg ?? null,
      sleepHours: log?.sleepHours ?? null,
      restingHr: log?.restingHr ?? null,
      stepsFilled,
      steps: log?.steps !== undefined && log.steps > 0 ? log.steps : null,
      caloriesFilled,
      caloriesIntake:
        log?.caloriesKcal !== undefined && log.caloriesKcal > 0
          ? log.caloriesKcal
          : null,
      tdee: energy?.tdee ?? null,
      netBalance: energy?.netBalance ?? null,
      balanceStatus: energy?.status ?? null,
      habitsCount,
      totalHabitsCount,
      notes,
      suggestedMode,
    });
  }

  return rows;
}
