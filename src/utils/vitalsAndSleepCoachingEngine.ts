import type {
  DailyBiometricLog,
  HevyWorkout,
  WatchActivityRecord,
} from '../types/fitness';
import { getWorkingSetsCount } from './exerciseMuscleEngine';
import { isValidDateKey, shiftDateKey } from './fitnessMath';

// ============================================================================
// SHARED MATH & ZERO-NaN UTILITIES
// ============================================================================

function safeFinite(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((sum, v) => sum + v, 0) / valid.length;
}

/**
 * Linear-interpolated percentile (p in [0, 1]) over finite numeric samples.
 */
export function computePercentile(values: number[], p: number): number | null {
  const sorted = values
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const clampedP = clamp(p, 0, 1);
  const idx = clampedP * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const weight = idx - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function computeDeepRemPct(log: DailyBiometricLog | undefined | null): number | null {
  if (!log) return null;
  const sleepHours = safeFinite(log.sleepHours);
  if (sleepHours === null || sleepHours <= 0) return null;

  const deep = safeFinite(log.deepSleepSecs);
  const rem = safeFinite(log.remSleepSecs);
  if ((deep === null || deep <= 0) && (rem === null || rem <= 0)) {
    return null;
  }

  const totalSecs = sleepHours * 3600;
  const restorativeSecs = Math.max(0, deep ?? 0) + Math.max(0, rem ?? 0);
  if (totalSecs <= 0 || restorativeSecs <= 0) return null;
  return round1(clamp((restorativeSecs / totalSecs) * 100, 0, 100));
}

function buildLogsByDate(
  dailyLogs: DailyBiometricLog[],
): Map<string, DailyBiometricLog> {
  const map = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    if (log && isValidDateKey(log.date)) {
      map.set(log.date, log);
    }
  }
  return map;
}

function hasAnyNocturnalVital(log: DailyBiometricLog | undefined): boolean {
  if (!log) return false;
  return (
    (safeFinite(log.restingHr) ?? 0) > 0 ||
    (safeFinite(log.hrv) ?? 0) > 0 ||
    (safeFinite(log.sleepHours) ?? 0) > 0 ||
    computeDeepRemPct(log) !== null
  );
}

/**
 * Finds the most recent nocturnal log (today's morning sync if present, else
 * yesterday or up to 3 days back) so morning readiness cards always reflect
 * last night's sleep/biometrics without breaking if today isn't synced yet.
 */
function resolveLatestNocturnalLog(
  logsByDate: Map<string, DailyBiometricLog>,
  todayKey: string,
): { date: string; log: DailyBiometricLog } | null {
  for (let offset = 0; offset <= 3; offset += 1) {
    const dateKey = shiftDateKey(todayKey, -offset);
    const entry = logsByDate.get(dateKey);
    if (entry && hasAnyNocturnalVital(entry)) {
      return { date: dateKey, log: entry };
    }
  }
  return null;
}

function formatShortDayMonth(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${Number(parts[2])}.${Number(parts[1])}`;
}

const BG_WEEKDAY_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function getBgWeekdayShort(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return BG_WEEKDAY_SHORT[dt.getDay()] ?? '';
}

function isWeekendDate(dateKey: string): boolean {
  if (!isValidDateKey(dateKey)) return false;
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(y, m - 1, d, 12, 0, 0).getDay();
  return day === 0 || day === 6;
}

// ============================================================================
// MODULE 1: 🩺 APPLE VITALS (НОЩЕН ЗДРАВЕН РАДАР — 30-ДНЕВЕН IQR 25–75%)
// ============================================================================

export type AppleVitalMetricId =
  | 'restingHr'
  | 'hrv'
  | 'sleepHours'
  | 'deepRemPct';

export type AppleVitalStatus = 'in_range' | 'low' | 'high' | 'no_data';

export interface AppleVitalMetricItem {
  id: AppleVitalMetricId;
  label: string;
  shortLabel: string;
  unit: string;
  lastNightValue: number | null;
  q1: number;
  median: number;
  q3: number;
  baselineSamplesCount: number;
  isPersonalBaseline: boolean;
  status: AppleVitalStatus;
  statusLabel: string;
  isOutOfRange: boolean;
  deltaFromMedian: number | null;
  scaleMin: number;
  scaleMax: number;
  bandStartPct: number;
  bandEndPct: number;
  valuePct: number | null;
  detailNote: string;
}

export interface AppleVitalsReport {
  anchorNightDate: string | null;
  todayKey: string;
  hasLastNightData: boolean;
  metrics: AppleVitalMetricItem[];
  evaluatedMetricsCount: number;
  outOfRangeCount: number;
  hasMultiMetricAlert: boolean;
  alertMessage: string | null;
  overallStatus: 'normal' | 'caution' | 'alert' | 'insufficient';
  overallStatusLabel: string;
  baselineWindowDays: number;
}

export const APPLE_VITALS_MULTI_ALERT_TEXT =
  '⚠️ Vitals отклонение: 2+ нощни показателя извън личната ти норма — възможна скрита умора, висок кортизол или начално разболяване. Днес намали обема.';

interface VitalSpec {
  id: AppleVitalMetricId;
  label: string;
  shortLabel: string;
  unit: string;
  minIqrSpan: number;
  fallbackQ1: number;
  fallbackMedian: number;
  fallbackQ3: number;
  hardMin: number;
  hardMax: number;
  extract: (log: DailyBiometricLog) => number | null;
  formatVal: (v: number) => string;
  explainOut: (status: 'low' | 'high', val: number, q1: number, q3: number) => string;
}

const VITAL_SPECS: VitalSpec[] = [
  {
    id: 'restingHr',
    label: 'Нощен пулс в покой',
    shortLabel: 'Пулс (RHR)',
    unit: 'bpm',
    minIqrSpan: 3,
    fallbackQ1: 52,
    fallbackMedian: 57,
    fallbackQ3: 62,
    hardMin: 35,
    hardMax: 110,
    extract: (log) => {
      const v = safeFinite(log.restingHr);
      return v !== null && v > 0 ? Math.round(v) : null;
    },
    formatVal: (v) => `${Math.round(v)}`,
    explainOut: (status, val, q1, q3) =>
      status === 'high'
        ? `Нощният пулс (${Math.round(val)} bpm) е над типичната ти горна граница (${round1(q3)} bpm) — класически сигнал за симпатиково напрежение, недоизчистена умора или имунен стрес.`
        : `Нощният пулс (${Math.round(val)} bpm) е под 25-ия ти персентил (${round1(q1)} bpm) — силен парасимпатиков тонус; провери го заедно с HRV и свежестта.`,
  },
  {
    id: 'hrv',
    label: 'Нощен HRV',
    shortLabel: 'HRV',
    unit: 'ms',
    minIqrSpan: 6,
    fallbackQ1: 48,
    fallbackMedian: 60,
    fallbackQ3: 74,
    hardMin: 10,
    hardMax: 220,
    extract: (log) => {
      const v = safeFinite(log.hrv);
      return v !== null && v > 0 ? round1(v) : null;
    },
    formatVal: (v) => `${round1(v)}`,
    explainOut: (status, val, q1, q3) =>
      status === 'low'
        ? `Нощният HRV (${round1(val)} ms) падна под личната ти IQR долна граница (${round1(q1)} ms) — нервната система е под стрес и иска по-лек тренировъчен обем днес.`
        : `Нощният HRV (${round1(val)} ms) е над горната ти граница (${round1(q3)} ms) — висока вагална активност (обичайно супер възстановяване, но при силна умора следи и RHR).`,
  },
  {
    id: 'sleepHours',
    label: 'Обща продължителност на съня',
    shortLabel: 'Общ сън',
    unit: 'ч',
    minIqrSpan: 0.6,
    fallbackQ1: 7.0,
    fallbackMedian: 7.6,
    fallbackQ3: 8.3,
    hardMin: 3,
    hardMax: 12,
    extract: (log) => {
      const v = safeFinite(log.sleepHours);
      return v !== null && v > 0 ? round1(v) : null;
    },
    formatVal: (v) => `${round1(v)}`,
    explainOut: (status, val, q1, q3) =>
      status === 'low'
        ? `Спал си ${round1(val)} ч — под 25-ия ти персентил (${round1(q1)} ч). Недоспиването вдига кортизола и намалява експлозивността и силовата стабилност.`
        : `Спал си ${round1(val)} ч — над типичната ти горна граница (${round1(q3)} ч). Често е компенсаторен сън след натрупана умора или тежък тренировъчен блок.`,
  },
  {
    id: 'deepRemPct',
    label: 'Дял на Deep + REM съня',
    shortLabel: 'Deep + REM',
    unit: '%',
    minIqrSpan: 5,
    fallbackQ1: 35,
    fallbackMedian: 42,
    fallbackQ3: 50,
    hardMin: 10,
    hardMax: 85,
    extract: (log) => computeDeepRemPct(log),
    formatVal: (v) => `${Math.round(v)}`,
    explainOut: (status, val, q1, q3) =>
      status === 'low'
        ? `Възстановителните фази Deep + REM (${Math.round(val)}%) са под типичната ти норма (${Math.round(q1)}%) — по-слаб хормонален пик и непълно възстановяване на ЦНС.`
        : `Възстановителните фази Deep + REM (${Math.round(val)}%) са над 75-ия ти персентил (${Math.round(q3)}%) — силна дълбока регенерация и анаболна среда.`,
  },
];

export function computeAppleVitalsReport(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): AppleVitalsReport {
  const { dailyLogs, todayKey } = params;
  const logsByDate = buildLogsByDate(dailyLogs);
  const latest = resolveLatestNocturnalLog(logsByDate, todayKey);

  if (!latest) {
    const emptyMetrics: AppleVitalMetricItem[] = VITAL_SPECS.map((spec) => ({
      id: spec.id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      unit: spec.unit,
      lastNightValue: null,
      q1: spec.fallbackQ1,
      median: spec.fallbackMedian,
      q3: spec.fallbackQ3,
      baselineSamplesCount: 0,
      isPersonalBaseline: false,
      status: 'no_data',
      statusLabel: 'Няма запис',
      isOutOfRange: false,
      deltaFromMedian: null,
      scaleMin: spec.fallbackQ1 - spec.minIqrSpan * 2,
      scaleMax: spec.fallbackQ3 + spec.minIqrSpan * 2,
      bandStartPct: 28,
      bandEndPct: 72,
      valuePct: null,
      detailNote:
        'Синхронизирай часовника или запиши последната нощ, за да се активира личният здравен радар.',
    }));

    return {
      anchorNightDate: null,
      todayKey,
      hasLastNightData: false,
      metrics: emptyMetrics,
      evaluatedMetricsCount: 0,
      outOfRangeCount: 0,
      hasMultiMetricAlert: false,
      alertMessage: null,
      overallStatus: 'insufficient',
      overallStatusLabel: 'Очаква данни от последната нощ',
      baselineWindowDays: 30,
    };
  }

  // Gather last 30 completed nights strictly BEFORE anchorNightDate
  const baselineLogs: DailyBiometricLog[] = [];
  for (let offset = 1; offset <= 30; offset += 1) {
    const d = shiftDateKey(latest.date, -offset);
    const entry = logsByDate.get(d);
    if (entry) baselineLogs.push(entry);
  }

  let evaluatedMetricsCount = 0;
  let outOfRangeCount = 0;

  const metrics: AppleVitalMetricItem[] = VITAL_SPECS.map((spec) => {
    const lastNightValue = spec.extract(latest.log);
    const baselineSamples = baselineLogs
      .map((l) => spec.extract(l))
      .filter((v): v is number => v !== null);

    const isPersonalBaseline = baselineSamples.length >= 5;
    let q1 = spec.fallbackQ1;
    let median = spec.fallbackMedian;
    let q3 = spec.fallbackQ3;

    if (isPersonalBaseline) {
      const p25 = computePercentile(baselineSamples, 0.25);
      const p50 = computePercentile(baselineSamples, 0.5);
      const p75 = computePercentile(baselineSamples, 0.75);
      if (p25 !== null && p50 !== null && p75 !== null) {
        q1 = p25;
        median = p50;
        q3 = p75;
        // Apply minimal physiological span so flat 30d baselines don't trigger false alerts
        if (q3 - q1 < spec.minIqrSpan) {
          const half = spec.minIqrSpan / 2;
          q1 = Math.max(spec.hardMin, median - half);
          q3 = Math.min(spec.hardMax, median + half);
        }
      }
    }

    q1 = round1(q1);
    median = round1(median);
    q3 = round1(q3);

    let status: AppleVitalStatus = 'no_data';
    let statusLabel = 'Няма запис';
    let isOutOfRange = false;
    let deltaFromMedian: number | null = null;
    let detailNote =
      'Липсва стойност за последната нощ. Попълни или синхронизирай часовника.';

    if (lastNightValue !== null) {
      evaluatedMetricsCount += 1;
      deltaFromMedian = round1(lastNightValue - median);
      if (lastNightValue < q1) {
        status = 'low';
        statusLabel = 'Под нормата';
        isOutOfRange = true;
        outOfRangeCount += 1;
        detailNote = spec.explainOut('low', lastNightValue, q1, q3);
      } else if (lastNightValue > q3) {
        status = 'high';
        statusLabel = 'Над нормата';
        isOutOfRange = true;
        outOfRangeCount += 1;
        detailNote = spec.explainOut('high', lastNightValue, q1, q3);
      } else {
        status = 'in_range';
        statusLabel = 'В норма';
        detailNote = isPersonalBaseline
          ? `Стойността (${spec.formatVal(lastNightValue)} ${spec.unit}) е стабилно в личния ти 30-дневен IQR диапазон (${spec.formatVal(q1)}–${spec.formatVal(q3)} ${spec.unit}).`
          : `Стойността (${spec.formatVal(lastNightValue)} ${spec.unit}) е в референтната норма (${spec.formatVal(q1)}–${spec.formatVal(q3)} ${spec.unit}). Натрупват се още ${5 - baselineSamples.length} нощи за личен IQR.`;
      }
    }

    // Build visual scale centered generously around [q1, q3] and lastNightValue
    const span = Math.max(spec.minIqrSpan, q3 - q1);
    const pad = Math.max(spec.minIqrSpan * 1.1, span * 0.95);
    const rawMin =
      lastNightValue !== null
        ? Math.min(q1 - pad, lastNightValue - span * 0.35)
        : q1 - pad;
    const rawMax =
      lastNightValue !== null
        ? Math.max(q3 + pad, lastNightValue + span * 0.35)
        : q3 + pad;
    const scaleMin = Math.max(spec.hardMin * 0.7, rawMin);
    const scaleMax = Math.min(spec.hardMax * 1.25, Math.max(scaleMin + 1, rawMax));
    const totalRange = Math.max(0.1, scaleMax - scaleMin);

    const bandStartPct = clamp(((q1 - scaleMin) / totalRange) * 100, 6, 86);
    const bandEndPct = clamp(((q3 - scaleMin) / totalRange) * 100, bandStartPct + 8, 94);
    const valuePct =
      lastNightValue !== null
        ? clamp(((lastNightValue - scaleMin) / totalRange) * 100, 3, 97)
        : null;

    return {
      id: spec.id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      unit: spec.unit,
      lastNightValue,
      q1,
      median,
      q3,
      baselineSamplesCount: baselineSamples.length,
      isPersonalBaseline,
      status,
      statusLabel,
      isOutOfRange,
      deltaFromMedian,
      scaleMin: round1(scaleMin),
      scaleMax: round1(scaleMax),
      bandStartPct: round1(bandStartPct),
      bandEndPct: round1(bandEndPct),
      valuePct: valuePct !== null ? round1(valuePct) : null,
      detailNote,
    };
  });

  const hasMultiMetricAlert = outOfRangeCount >= 2;
  const overallStatus: AppleVitalsReport['overallStatus'] =
    evaluatedMetricsCount === 0
      ? 'insufficient'
      : hasMultiMetricAlert
        ? 'alert'
        : outOfRangeCount === 1
          ? 'caution'
          : 'normal';

  const overallStatusLabel =
    overallStatus === 'alert'
      ? `Отклонение (${outOfRangeCount}/${evaluatedMetricsCount} извън норма)`
      : overallStatus === 'caution'
        ? `1 отклонение (наблюдавай днес)`
        : overallStatus === 'normal'
          ? `Всички показатели в норма`
          : 'Очаква данни';

  return {
    anchorNightDate: latest.date,
    todayKey,
    hasLastNightData: evaluatedMetricsCount > 0,
    metrics,
    evaluatedMetricsCount,
    outOfRangeCount,
    hasMultiMetricAlert,
    alertMessage: hasMultiMetricAlert ? APPLE_VITALS_MULTI_ALERT_TEXT : null,
    overallStatus,
    overallStatusLabel,
    baselineWindowDays: 30,
  };
}

// ============================================================================
// MODULE 2: 📈 TRAINING LOAD (7-ДНЕВНО СРЕЩУ 28-ДНЕВНО УСИЛИЕ, СКАЛА 1–10)
// ============================================================================

export type EffortLoadSourceFilter = 'all' | 'strength' | 'cardio';

export type EffortLoadStatus =
  | 'below'
  | 'optimal'
  | 'above'
  | 'insufficient_data';

export interface ScoredWorkoutSession {
  id: string;
  date: string;
  source: 'strength' | 'cardio';
  title: string;
  effortScore: number; // 1.0 .. 10.0
  durationMinutes: number;
  setsCount?: number;
  avgHr?: number;
  elevationM?: number;
  summaryText: string;
}

export interface EffortDailyBar {
  date: string;
  shortLabel: string;
  weekdayShort: string;
  totalEffort: number;
  strengthEffort: number;
  cardioEffort: number;
  sessions: ScoredWorkoutSession[];
}

export interface EffortWeeklyPoint {
  weekIndex: number; // 0 = oldest, 3 = latest 7d
  label: string;
  startDate: string;
  endDate: string;
  totalEffort: number;
  strengthEffort: number;
  cardioEffort: number;
  sessionsCount: number;
  isCurrent7d: boolean;
}

export interface EffortTrainingLoadReport {
  windowStartDate: string;
  windowEndDate: string; // yesterday
  baselineStartDate: string;
  load7d: number;
  strengthLoad7d: number;
  cardioLoad7d: number;
  baseline28dWeekly: number;
  ratio: number | null;
  deltaPct: number | null;
  avgSessionEffort7d: number | null;
  sessionsCount7d: number;
  sessionsCount28d: number;
  status: EffortLoadStatus;
  statusLabel: string;
  headline: string;
  guidance: string;
  dailySeries7d: EffortDailyBar[];
  weeklySeries4w: EffortWeeklyPoint[];
  hasEnoughData: boolean;
}

function parseWorkoutDurationMinutes(workout: HevyWorkout, workingSets: number): number {
  const startMs = Date.parse(workout.startTime);
  const endMs = workout.endTime ? Date.parse(workout.endTime) : Number.NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    const mins = (endMs - startMs) / 60000;
    if (mins >= 8 && mins <= 240) return Math.round(mins);
  }
  return Math.max(20, Math.min(130, Math.round(workingSets * 2.7 + 8)));
}

export function scoreStrengthWorkoutEffort(workout: HevyWorkout): ScoredWorkoutSession {
  let workingSets = 0;
  let rpeSum = 0;
  let rpeCount = 0;

  for (const ex of workout.exercises ?? []) {
    const count = getWorkingSetsCount(ex.sets ?? []);
    workingSets += count;
    for (const set of ex.sets ?? []) {
      const rpe = safeFinite(set.rpe);
      if (rpe !== null && rpe >= 4 && rpe <= 10) {
        rpeSum += rpe;
        rpeCount += 1;
      }
    }
  }

  if (workingSets <= 0) {
    workingSets = Math.max(1, safeFinite(workout.totalSets) ?? 6);
  }

  const durationMinutes = parseWorkoutDurationMinutes(workout, workingSets);
  const avgRpe = rpeCount > 0 ? rpeSum / rpeCount : 7.5;

  // Effort 1–10: working sets (up to 5.2) + duration (up to 2.6) + RPE intensity (up to 2.2)
  const setsComponent = Math.min(5.2, workingSets * 0.22);
  const durationComponent = Math.min(2.6, (durationMinutes / 65) * 2.2);
  const intensityComponent = clamp((avgRpe - 5.2) * 0.52, 0.5, 2.2);

  const effortScore = round1(
    clamp(setsComponent + durationComponent + intensityComponent, 1.0, 10.0),
  );

  return {
    id: `hevy-${workout.id}`,
    date: workout.date,
    source: 'strength',
    title: workout.title?.trim() || 'Силова тренировка (Hevy)',
    effortScore,
    durationMinutes,
    setsCount: workingSets,
    summaryText: `${workingSets} раб. серии · ~${durationMinutes} мин`,
  };
}

export function scoreWatchActivityEffort(
  activity: WatchActivityRecord,
  date: string,
  index: number,
  athleteRestingHr: number,
): ScoredWorkoutSession {
  const durationSec = safeFinite(activity.moving_time) ?? 0;
  const durationMinutes = Math.max(5, Math.round(durationSec / 60));
  const avgHr = safeFinite(activity.average_heartrate);
  const elevationM = Math.max(0, safeFinite(activity.total_elevation_gain) ?? 0);

  const maxHrRef = 190;
  const rhrRef = clamp(athleteRestingHr, 42, 80);
  const hrr = Math.max(90, maxHrRef - rhrRef);

  let hrComponent: number;
  if (avgHr !== null && avgHr >= 65) {
    const hrrRatio = clamp((avgHr - rhrRef) / hrr, 0.12, 1.05);
    hrComponent = clamp(hrrRatio * 5.0, 0.8, 5.0);
  } else {
    const typeNorm = (activity.type || '').toLowerCase();
    if (typeNorm.includes('run') || typeNorm.includes('box')) hrComponent = 3.5;
    else if (typeNorm.includes('ride') || typeNorm.includes('ski')) hrComponent = 3.0;
    else if (typeNorm.includes('hike')) hrComponent = 2.6;
    else hrComponent = 1.9;
  }

  const durationComponent = Math.min(3.8, (durationMinutes / 60) * 2.7);
  const elevationComponent = Math.min(1.2, (elevationM / 600) * 1.2);

  const effortScore = round1(
    clamp(hrComponent + durationComponent + elevationComponent, 1.0, 10.0),
  );

  const parts: string[] = [`${durationMinutes} мин`];
  if (avgHr !== null) parts.push(`${Math.round(avgHr)} bpm`);
  if (elevationM >= 50) parts.push(`+${Math.round(elevationM)} м`);

  return {
    id: `watch-${date}-${activity.id ?? index}`,
    date,
    source: 'cardio',
    title: activity.name?.trim() || activity.type || 'Кардио активност',
    effortScore,
    durationMinutes,
    ...(avgHr !== null ? { avgHr: Math.round(avgHr) } : {}),
    ...(elevationM > 0 ? { elevationM: Math.round(elevationM) } : {}),
    summaryText: parts.join(' · '),
  };
}

export function computeEffortTrainingLoadReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  sourceFilter?: EffortLoadSourceFilter;
}): EffortTrainingLoadReport {
  const {
    dailyLogs,
    hevyWorkouts,
    todayKey,
    sourceFilter = 'all',
  } = params;

  const windowEndDate = shiftDateKey(todayKey, -1); // yesterday (completed days)
  const windowStartDate = shiftDateKey(windowEndDate, -6);
  const baselineStartDate = shiftDateKey(windowEndDate, -27);

  const logsByDate = buildLogsByDate(dailyLogs);

  // Reference athlete RHR from 30d median
  const rhrSamples = dailyLogs
    .map((l) => safeFinite(l.restingHr))
    .filter((v): v is number => v !== null && v > 0);
  const athleteRestingHr = computePercentile(rhrSamples, 0.5) ?? 58;

  // Map scored sessions by date across the 28-day window
  const sessionsByDate = new Map<string, ScoredWorkoutSession[]>();
  const pushSession = (s: ScoredWorkoutSession) => {
    if (s.date < baselineStartDate || s.date > windowEndDate) return;
    if (sourceFilter !== 'all' && s.source !== sourceFilter) return;
    const arr = sessionsByDate.get(s.date) ?? [];
    arr.push(s);
    sessionsByDate.set(s.date, arr);
  };

  for (const w of hevyWorkouts) {
    if (!w || !isValidDateKey(w.date)) continue;
    if (w.date < baselineStartDate || w.date > windowEndDate) continue;
    pushSession(scoreStrengthWorkoutEffort(w));
  }

  for (let offset = 0; offset < 28; offset += 1) {
    const dateKey = shiftDateKey(baselineStartDate, offset);
    const log = logsByDate.get(dateKey);
    if (!log) continue;

    if (Array.isArray(log.watchActivities) && log.watchActivities.length > 0) {
      log.watchActivities.forEach((act, idx) => {
        pushSession(scoreWatchActivityEffort(act, dateKey, idx, athleteRestingHr));
      });
    } else {
      const cardioMin = safeFinite(log.cardioDurationMinutes) ?? 0;
      const cardioDist = safeFinite(log.cardioDistanceKm) ?? 0;
      const cardioElev = safeFinite(log.cardioElevationGainM) ?? 0;
      if (cardioMin >= 10 || cardioDist >= 1) {
        const effectiveMin = cardioMin >= 10 ? cardioMin : Math.round(cardioDist * 7);
        const fallbackEffort = round1(
          clamp(
            2.4 + Math.min(3.8, (effectiveMin / 60) * 2.7) + Math.min(1.2, (cardioElev / 600) * 1.2),
            1.0,
            10.0,
          ),
        );
        pushSession({
          id: `cardio-summary-${dateKey}`,
          date: dateKey,
          source: 'cardio',
          title: 'Кардио / Разходка (дневно обобщение)',
          effortScore: fallbackEffort,
          durationMinutes: Math.round(effectiveMin),
          ...(cardioElev > 0 ? { elevationM: Math.round(cardioElev) } : {}),
          summaryText: `${Math.round(effectiveMin)} мин${cardioDist > 0 ? ` · ${round1(cardioDist)} км` : ''}`,
        });
      }
    }
  }

  // Build 4 weekly buckets (oldest -> latest 7d)
  const weeklySeries4w: EffortWeeklyPoint[] = [];
  let totalEffort28d = 0;
  let sessionsCount28d = 0;

  for (let wIdx = 0; wIdx < 4; wIdx += 1) {
    const wStart = shiftDateKey(baselineStartDate, wIdx * 7);
    const wEnd = shiftDateKey(wStart, 6);
    let wTotal = 0;
    let wStrength = 0;
    let wCardio = 0;
    let wSessions = 0;

    for (let dOffset = 0; dOffset < 7; dOffset += 1) {
      const dKey = shiftDateKey(wStart, dOffset);
      const daySessions = sessionsByDate.get(dKey) ?? [];
      for (const s of daySessions) {
        wTotal += s.effortScore;
        if (s.source === 'strength') wStrength += s.effortScore;
        else wCardio += s.effortScore;
        wSessions += 1;
      }
    }

    totalEffort28d += wTotal;
    sessionsCount28d += wSessions;

    weeklySeries4w.push({
      weekIndex: wIdx,
      label:
        wIdx === 3
          ? 'Последни 7д'
          : wIdx === 2
            ? 'Преди 1 седм.'
            : wIdx === 1
              ? 'Преди 2 седм.'
              : 'Преди 3 седм.',
      startDate: wStart,
      endDate: wEnd,
      totalEffort: round1(wTotal),
      strengthEffort: round1(wStrength),
      cardioEffort: round1(wCardio),
      sessionsCount: wSessions,
      isCurrent7d: wIdx === 3,
    });
  }

  // Daily breakdown for latest 7 completed days
  const dailySeries7d: EffortDailyBar[] = [];
  const allSessions7d: ScoredWorkoutSession[] = [];
  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = shiftDateKey(windowStartDate, offset);
    const daySessions = sessionsByDate.get(dateKey) ?? [];
    let strengthEffort = 0;
    let cardioEffort = 0;
    for (const s of daySessions) {
      allSessions7d.push(s);
      if (s.source === 'strength') strengthEffort += s.effortScore;
      else cardioEffort += s.effortScore;
    }
    dailySeries7d.push({
      date: dateKey,
      shortLabel: formatShortDayMonth(dateKey),
      weekdayShort: getBgWeekdayShort(dateKey),
      totalEffort: round1(strengthEffort + cardioEffort),
      strengthEffort: round1(strengthEffort),
      cardioEffort: round1(cardioEffort),
      sessions: daySessions,
    });
  }

  const currentWeek = weeklySeries4w[3];
  const load7d = currentWeek.totalEffort;
  const strengthLoad7d = currentWeek.strengthEffort;
  const cardioLoad7d = currentWeek.cardioEffort;
  const baseline28dWeekly = round1(totalEffort28d / 4);
  const avgSessionEffort7d =
    allSessions7d.length > 0
      ? round1(
          allSessions7d.reduce((sum, s) => sum + s.effortScore, 0) /
            allSessions7d.length,
        )
      : null;

  const hasEnoughData = sessionsCount28d > 0;
  const ratio =
    baseline28dWeekly > 0.01 ? round1((load7d / baseline28dWeekly) * 10) / 10 : null;
  const deltaPct =
    baseline28dWeekly > 0.01
      ? Math.round(((load7d - baseline28dWeekly) / baseline28dWeekly) * 100)
      : null;

  let status: EffortLoadStatus;
  let statusLabel: string;
  let headline: string;
  let guidance: string;

  if (!hasEnoughData) {
    status = 'insufficient_data';
    statusLabel = 'Натрупване на база';
    headline = 'Все още няма записани тренировки в 28-дневния прозорец';
    guidance =
      'Импортирай силови тренировки от Hevy или синхронизирай кардио активности от часовника, за да се изчисли 7-дневното спрямо 28-дневното усилие.';
  } else if (ratio === null || ratio > 1.22) {
    status = 'above';
    statusLabel = 'Над нормата';
    headline = `7-дневното усилие (${load7d} т.) е над 28-дневната база (${baseline28dWeekly} т./седм.)`;
    guidance =
      'Рязкото качване на общото усилие над 4-седмичната норма трупа системна умора. Планирай 1–2 по-леки дни, приоритетен сън и следи Apple Vitals за отклонения.';
  } else if (ratio < 0.82) {
    status = 'below';
    statusLabel = 'Под нормата';
    headline = `7-дневното усилие (${load7d} т.) е под 28-дневната база (${baseline28dWeekly} т./седм.)`;
    guidance =
      'Седмичното натоварване е по-леко от обичайното — отлично за разтоварване (deload), но при нормална свежест имаш резерв да добавиш 1–2 качествени сесии.';
  } else {
    status = 'optimal';
    statusLabel = 'Стабилно / Оптимално';
    headline = `7-дневното усилие (${load7d} т.) е в синхрон с 28-дневната база (${baseline28dWeekly} т./седм.)`;
    guidance =
      'Поддържаш устойчив тренировъчен ритъм без рязък скок в риска от претрениране — идеална зона за стабилна прогресия в сила и кондиция.';
  }

  return {
    windowStartDate,
    windowEndDate,
    baselineStartDate,
    load7d,
    strengthLoad7d,
    cardioLoad7d,
    baseline28dWeekly,
    ratio,
    deltaPct,
    avgSessionEffort7d,
    sessionsCount7d: allSessions7d.length,
    sessionsCount28d,
    status,
    statusLabel,
    headline,
    guidance,
    dailySeries7d,
    weeklySeries4w,
    hasEnoughData,
  };
}

// ============================================================================
// MODULE 4: 🦉 SLEEP COACHING И ХРОНОТИП (ЦИРКАДНА СТАБИЛНОСТ — 14 ДНИ)
// (Placed before Module 3 so Samsung Energy Score can consume circadian score)
// ============================================================================

export type ChronotypeId = 'lion' | 'bear' | 'wolf' | 'dolphin';

export type CircadianStabilityStatus =
  | 'stable'
  | 'moderate'
  | 'irregular'
  | 'insufficient';

export interface CircadianNightPoint {
  date: string;
  shortLabel: string;
  weekdayShort: string;
  bedtimeMin: number; // 0..1439
  wakeTimeMin: number; // 0..1439
  bedtimeLabel: string; // HH:MM
  wakeTimeLabel: string; // HH:MM
  sleepHours: number;
  deepRemPct: number | null;
  deviationMin: number; // circular distance from 14d anchor
  withinTarget30m: boolean;
  source: 'intervals' | 'estimated';
}

export interface SleepCoachingChronotypeReport {
  windowStartDate: string;
  windowEndDate: string;
  nightsAnalyzed: number;
  intervalsDirectNights: number;
  estimatedNights: number;
  hasEnoughData: boolean;
  chronotypeId: ChronotypeId;
  chronotypeEmoji: string;
  chronotypeTitle: string;
  chronotypeDescription: string;
  avgBedtimeMin: number | null;
  avgWakeTimeMin: number | null;
  avgBedtimeLabel: string;
  avgWakeTimeLabel: string;
  avgSleepHours: number | null;
  avgDeviationMin: number | null;
  targetDeviationMin: number; // 30 min
  withinTargetCount: number;
  stabilityStatus: CircadianStabilityStatus;
  stabilityLabel: string;
  recommendedBedtimeWindow: string;
  recommendedWakeWindow: string;
  deepSleepTip: string;
  nights: CircadianNightPoint[];
}

export function wrapMinutesOfDay(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0;
  const mod = Math.round(minutes) % 1440;
  return mod < 0 ? mod + 1440 : mod;
}

export function formatMinutesAsHm(minutes: number): string {
  const wrapped = wrapMinutesOfDay(minutes);
  const hh = Math.floor(wrapped / 60);
  const mm = wrapped % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseClockHmToMinutes(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (
    !Number.isInteger(hh) ||
    !Number.isInteger(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }
  return hh * 60 + mm;
}

/**
 * Circular mean for clock times (0..1439) so 23:45 and 00:15 average to 00:00.
 */
export function circularMeanMinutes(minutesList: number[]): number | null {
  const valid = minutesList.filter((m) => Number.isFinite(m));
  if (valid.length === 0) return null;

  let sinSum = 0;
  let cosSum = 0;
  for (const m of valid) {
    const angle = (wrapMinutesOfDay(m) / 1440) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }
  if (Math.abs(sinSum) < 1e-9 && Math.abs(cosSum) < 1e-9) {
    return wrapMinutesOfDay(valid[0]);
  }
  let meanAngle = Math.atan2(sinSum / valid.length, cosSum / valid.length);
  if (meanAngle < 0) meanAngle += 2 * Math.PI;
  return wrapMinutesOfDay((meanAngle / (2 * Math.PI)) * 1440);
}

/**
 * Shortest distance in minutes on a 24h clock (0..720).
 */
export function circularDistanceMinutes(a: number, b: number): number {
  const diff = Math.abs(wrapMinutesOfDay(a) - wrapMinutesOfDay(b));
  return Math.min(diff, 1440 - diff);
}

function extractLocalMinutesFromTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  const isoMatch = raw.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    const hh = Number(isoMatch[1]);
    const mm = Number(isoMatch[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }
  const spaceMatch = raw.match(/\s(\d{1,2}):(\d{2})/);
  if (spaceMatch) {
    const hh = Number(spaceMatch[1]);
    const mm = Number(spaceMatch[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
  }
  return null;
}

function estimateNightBedWakeTimes(params: {
  log: DailyBiometricLog;
  prevLog: DailyBiometricLog | undefined;
  dayWorkouts: HevyWorkout[];
  prevDayWorkouts: HevyWorkout[];
}): {
  bedtimeMin: number;
  wakeTimeMin: number;
  source: 'intervals' | 'estimated';
} | null {
  const { log, prevLog, dayWorkouts, prevDayWorkouts } = params;
  const sleepHours = safeFinite(log.sleepHours);
  const directStart = parseClockHmToMinutes(log.sleepStartTime);
  const directEnd = parseClockHmToMinutes(log.sleepEndTime);

  if (directStart !== null && directEnd !== null) {
    return {
      bedtimeMin: directStart,
      wakeTimeMin: directEnd,
      source: 'intervals',
    };
  }

  if (sleepHours === null || sleepHours <= 0) return null;
  const durationMin = Math.round(clamp(sleepHours, 2, 14) * 60);

  // If only one direct timestamp exists, derive the other via sleepHours
  if (directStart !== null) {
    return {
      bedtimeMin: directStart,
      wakeTimeMin: wrapMinutesOfDay(directStart + durationMin),
      source: 'intervals',
    };
  }
  if (directEnd !== null) {
    return {
      bedtimeMin: wrapMinutesOfDay(directEnd - durationMin),
      wakeTimeMin: directEnd,
      source: 'intervals',
    };
  }

  // Automatic reconstruction from available sleep duration, habits, and activity timestamps
  const weekend = isWeekendDate(log.date);
  let wakeTimeMin = weekend ? 7 * 60 + 35 : 7 * 60; // 07:35 weekend, 07:00 weekday

  // Check if user had an early morning activity/workout on `log.date`
  const morningStarts: number[] = [];
  for (const act of log.watchActivities ?? []) {
    const m = extractLocalMinutesFromTimestamp(act.start_date_local);
    if (m !== null && m >= 5 * 60 + 30 && m <= 10 * 60 + 30) {
      morningStarts.push(m);
    }
  }
  for (const w of dayWorkouts) {
    const m = extractLocalMinutesFromTimestamp(w.startTime);
    if (m !== null && m >= 5 * 60 + 30 && m <= 10 * 60 + 30) {
      morningStarts.push(m);
    }
  }
  if (morningStarts.length > 0) {
    const earliest = Math.min(...morningStarts);
    wakeTimeMin = clamp(earliest - 50, 5 * 60 + 10, 9 * 60);
  }

  let bedtimeMin = wrapMinutesOfDay(wakeTimeMin - durationMin);

  // Check late-night signals on the previous evening (`prevLog` & `prevDayWorkouts`)
  const hadLateBedHabit = Boolean(
    prevLog?.completedHabits?.some((h) =>
      h.toLowerCase().includes('късно лягане'),
    ) ||
      log.completedHabits?.some((h) =>
        h.toLowerCase().includes('късно лягане'),
      ),
  );

  let latestEveningEndMin: number | null = null;
  for (const w of prevDayWorkouts) {
    const m =
      extractLocalMinutesFromTimestamp(w.endTime) ??
      extractLocalMinutesFromTimestamp(w.startTime);
    if (m !== null && m >= 19 * 60 + 30) {
      latestEveningEndMin =
        latestEveningEndMin === null ? m : Math.max(latestEveningEndMin, m);
    }
  }
  for (const act of prevLog?.watchActivities ?? []) {
    const m = extractLocalMinutesFromTimestamp(act.start_date_local);
    if (m !== null && m >= 19 * 60 + 30) {
      const endEst = m + Math.round((safeFinite(act.moving_time) ?? 2400) / 60);
      latestEveningEndMin =
        latestEveningEndMin === null
          ? endEst
          : Math.max(latestEveningEndMin, endEst);
    }
  }

  if (hadLateBedHabit) {
    // Shift bedtime toward 00:30+ and wake proportionally
    bedtimeMin = wrapMinutesOfDay(bedtimeMin + 55);
    wakeTimeMin = wrapMinutesOfDay(bedtimeMin + durationMin);
  } else if (latestEveningEndMin !== null) {
    // Sleeping at least ~105 min after a late workout
    const minBedMin = latestEveningEndMin + 105;
    const currentBedExtended = bedtimeMin < 12 * 60 ? bedtimeMin + 1440 : bedtimeMin;
    if (currentBedExtended < minBedMin) {
      bedtimeMin = wrapMinutesOfDay(minBedMin);
      wakeTimeMin = wrapMinutesOfDay(bedtimeMin + durationMin);
    }
  } else if (morningStarts.length === 0) {
    // Subtle sleep-duration & quality drift (shorter sleep -> slightly later bedtime)
    const quality = safeFinite(log.sleepQuality);
    let shiftMin = 0;
    if (sleepHours < 6.5) shiftMin += 28;
    else if (sleepHours >= 8.4) shiftMin -= 16;
    if (quality !== null && quality <= 2) shiftMin += 14;
    if (shiftMin !== 0) {
      bedtimeMin = wrapMinutesOfDay(bedtimeMin + shiftMin);
      wakeTimeMin = wrapMinutesOfDay(bedtimeMin + durationMin);
    }
  }

  return {
    bedtimeMin,
    wakeTimeMin,
    source: 'estimated',
  };
}

export function computeSleepCoachingChronotypeReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): SleepCoachingChronotypeReport {
  const { dailyLogs, hevyWorkouts, todayKey } = params;
  const windowEndDate = shiftDateKey(todayKey, -1);
  const windowStartDate = shiftDateKey(windowEndDate, -13); // 14 completed days
  const logsByDate = buildLogsByDate(dailyLogs);

  const workoutsByDate = new Map<string, HevyWorkout[]>();
  for (const w of hevyWorkouts) {
    if (!w || !isValidDateKey(w.date)) continue;
    const arr = workoutsByDate.get(w.date) ?? [];
    arr.push(w);
    workoutsByDate.set(w.date, arr);
  }

  interface RawNight {
    date: string;
    bedtimeMin: number;
    wakeTimeMin: number;
    sleepHours: number;
    deepRemPct: number | null;
    sleepQuality: number | null;
    source: 'intervals' | 'estimated';
  }

  const rawNights: RawNight[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const dateKey = shiftDateKey(windowStartDate, offset);
    const log = logsByDate.get(dateKey);
    if (!log) continue;
    const prevDateKey = shiftDateKey(dateKey, -1);
    const resolved = estimateNightBedWakeTimes({
      log,
      prevLog: logsByDate.get(prevDateKey),
      dayWorkouts: workoutsByDate.get(dateKey) ?? [],
      prevDayWorkouts: workoutsByDate.get(prevDateKey) ?? [],
    });
    if (!resolved) continue;

    const sleepHours =
      safeFinite(log.sleepHours) ??
      round1(
        ((resolved.wakeTimeMin - resolved.bedtimeMin + 1440) % 1440) / 60,
      );

    rawNights.push({
      date: dateKey,
      bedtimeMin: resolved.bedtimeMin,
      wakeTimeMin: resolved.wakeTimeMin,
      sleepHours: round1(clamp(sleepHours, 0.5, 16)),
      deepRemPct: computeDeepRemPct(log),
      sleepQuality: safeFinite(log.sleepQuality),
      source: resolved.source,
    });
  }

  if (rawNights.length === 0) {
    return {
      windowStartDate,
      windowEndDate,
      nightsAnalyzed: 0,
      intervalsDirectNights: 0,
      estimatedNights: 0,
      hasEnoughData: false,
      chronotypeId: 'bear',
      chronotypeEmoji: '🐻',
      chronotypeTitle: 'Очаква данни за съня',
      chronotypeDescription:
        'Запиши или синхронизирай поне 3–4 нощи сън, за да определим твоя хронотип и циркадна стабилност.',
      avgBedtimeMin: null,
      avgWakeTimeMin: null,
      avgBedtimeLabel: '—',
      avgWakeTimeLabel: '—',
      avgSleepHours: null,
      avgDeviationMin: null,
      targetDeviationMin: 30,
      withinTargetCount: 0,
      stabilityStatus: 'insufficient',
      stabilityLabel: 'Натрупване на данни',
      recommendedBedtimeWindow: '22:45 – 23:15',
      recommendedWakeWindow: '06:30 – 07:00',
      deepSleepTip:
        'Постоянният час на лягане (±30 мин) синхронизира мелатонина и увеличава първите два цикъла дълбок сън.',
      nights: [],
    };
  }

  const avgBedtimeMin = circularMeanMinutes(rawNights.map((n) => n.bedtimeMin));
  const avgWakeTimeMin = circularMeanMinutes(rawNights.map((n) => n.wakeTimeMin));
  const avgSleepHours = mean(rawNights.map((n) => n.sleepHours));
  const qualityValues = rawNights
    .map((n) => n.sleepQuality)
    .filter((v): v is number => v !== null);
  const avgQuality = mean(qualityValues);

  const nights: CircadianNightPoint[] = rawNights.map((n) => {
    const bedDev =
      avgBedtimeMin !== null
        ? circularDistanceMinutes(n.bedtimeMin, avgBedtimeMin)
        : 0;
    const wakeDev =
      avgWakeTimeMin !== null
        ? circularDistanceMinutes(n.wakeTimeMin, avgWakeTimeMin)
        : 0;
    const deviationMin = Math.round((bedDev + wakeDev) / 2);
    return {
      date: n.date,
      shortLabel: formatShortDayMonth(n.date),
      weekdayShort: getBgWeekdayShort(n.date),
      bedtimeMin: n.bedtimeMin,
      wakeTimeMin: n.wakeTimeMin,
      bedtimeLabel: formatMinutesAsHm(n.bedtimeMin),
      wakeTimeLabel: formatMinutesAsHm(n.wakeTimeMin),
      sleepHours: n.sleepHours,
      deepRemPct: n.deepRemPct,
      deviationMin,
      withinTarget30m: deviationMin <= 30,
      source: n.source,
    };
  });

  const avgDeviationRaw = mean(nights.map((n) => n.deviationMin));
  const avgDeviationMin =
    avgDeviationRaw !== null ? Math.round(avgDeviationRaw) : null;
  const withinTargetCount = nights.filter((n) => n.withinTarget30m).length;
  const intervalsDirectNights = nights.filter((n) => n.source === 'intervals').length;
  const estimatedNights = nights.length - intervalsDirectNights;

  const stabilityStatus: CircadianStabilityStatus =
    nights.length < 3 || avgDeviationMin === null
      ? 'insufficient'
      : avgDeviationMin <= 30
        ? 'stable'
        : avgDeviationMin <= 50
          ? 'moderate'
          : 'irregular';

  const stabilityLabel =
    stabilityStatus === 'stable'
      ? 'Стабилен ритъм (под ±30 мин)'
      : stabilityStatus === 'moderate'
        ? 'Умерено отклонение (±31–50 мин)'
        : stabilityStatus === 'irregular'
          ? 'Циркаден джетлаг (над ±50 мин)'
          : 'Натрупване на нощи (под 3)';

  // Compute sleep midpoint (minutes after midnight) for chronotype classification
  const midpointMin =
    avgBedtimeMin !== null && avgSleepHours !== null
      ? wrapMinutesOfDay(avgBedtimeMin + Math.round((avgSleepHours * 60) / 2))
      : 3 * 60; // default 03:00

  // Shift midpoint to continuous [0..1440) where 03:00 = 180
  let chronotypeId: ChronotypeId;
  if (
    avgDeviationMin !== null &&
    avgDeviationMin > 55 &&
    ((avgSleepHours !== null && avgSleepHours < 6.7) ||
      (avgQuality !== null && avgQuality <= 2.7))
  ) {
    chronotypeId = 'dolphin';
  } else if (midpointMin < 2 * 60 + 35 || midpointMin >= 22 * 60) {
    chronotypeId = 'lion';
  } else if (midpointMin <= 3 * 60 + 50) {
    chronotypeId = 'bear';
  } else {
    chronotypeId = 'wolf';
  }

  const CHRONOTYPE_META: Record<
    ChronotypeId,
    {
      emoji: string;
      title: string;
      description: string;
      idealBedStart: number;
      idealBedEnd: number;
      deepTip: string;
    }
  > = {
    lion: {
      emoji: '🦁',
      title: 'Лъв — Ранен хронотип',
      description:
        'Пикът ти на фокус и хормонална бодрост е сутрин. Най-силният ти дълбок сън се случва при лягане преди 22:30 ч.',
      idealBedStart: 22 * 60,
      idealBedEnd: 22 * 60 + 30,
      deepTip:
        'Избягвай тежки вечерни тренировки след 19:30 ч. и затъмни осветлението 45 мин преди 22:15 ч., за да запазиш максимален Deep Sleep.',
    },
    bear: {
      emoji: '🐻',
      title: 'Мечка — Балансиран слънчев ритъм',
      description:
        'Ритъмът ти следва естествения светлинен цикъл — оптимална силова и боксова производителност между 10:00–13:00 и 16:30–19:00 ч.',
      idealBedStart: 22 * 60 + 45,
      idealBedEnd: 23 * 60 + 15,
      deepTip:
        'Заключи прозореца за лягане в 22:45–23:15 ч. дори през уикенда (отклонение под ±30 мин), за да удвоиш качеството на първия SWS цикъл.',
    },
    wolf: {
      emoji: '🐺',
      title: 'Вълк — Вечерен хронотип',
      description:
        'Естествено заспиваш по-късно и достигаш най-висока нервно-мускулна мощност в късния следобед и ранната вечер.',
      idealBedStart: 23 * 60 + 30,
      idealBedEnd: 24 * 60,
      deepTip:
        'Не насилвай лягане в 21:30 ч., но пази 15–20 мин сутрешна слънчева светлина веднага след ставане и постоянен час на лягане около 23:30–00:00 ч.',
    },
    dolphin: {
      emoji: '🐬',
      title: 'Делфин — Чувствителен и променлив сън',
      description:
        'Графикът ти на сън варира силно или сънят е по-къс/лек. Нервната система е чувствителна към вечерен стрес, екрани и късно хранене.',
      idealBedStart: 22 * 60 + 45,
      idealBedEnd: 23 * 60 + 15,
      deepTip:
        'Приоритет №1 е фиксиран час на събуждане (в рамките на ±20 мин всеки ден), последвано от 3 ч. пауза без храна и кофеин поне 9 ч. преди сън.',
    },
  };

  const meta = CHRONOTYPE_META[chronotypeId];
  const targetSleepMin = 7 * 60 + 45; // 7h 45m optimal athletic target
  const recWakeStart = wrapMinutesOfDay(meta.idealBedStart + targetSleepMin);
  const recWakeEnd = wrapMinutesOfDay(meta.idealBedEnd + targetSleepMin);

  return {
    windowStartDate,
    windowEndDate,
    nightsAnalyzed: nights.length,
    intervalsDirectNights,
    estimatedNights,
    hasEnoughData: nights.length >= 3,
    chronotypeId,
    chronotypeEmoji: meta.emoji,
    chronotypeTitle: meta.title,
    chronotypeDescription: meta.description,
    avgBedtimeMin,
    avgWakeTimeMin,
    avgBedtimeLabel:
      avgBedtimeMin !== null ? formatMinutesAsHm(avgBedtimeMin) : '—',
    avgWakeTimeLabel:
      avgWakeTimeMin !== null ? formatMinutesAsHm(avgWakeTimeMin) : '—',
    avgSleepHours: avgSleepHours !== null ? round1(avgSleepHours) : null,
    avgDeviationMin,
    targetDeviationMin: 30,
    withinTargetCount,
    stabilityStatus,
    stabilityLabel,
    recommendedBedtimeWindow: `${formatMinutesAsHm(meta.idealBedStart)} – ${formatMinutesAsHm(meta.idealBedEnd)}`,
    recommendedWakeWindow: `${formatMinutesAsHm(recWakeStart)} – ${formatMinutesAsHm(recWakeEnd)}`,
    deepSleepTip: meta.deepTip,
    nights,
  };
}

// ============================================================================
// MODULE 3: 🔋 SAMSUNG ENERGY SCORE (0–100) + SLEEPING HR DIP (%)
// ============================================================================

export type EnergyFactorId =
  | 'sleep'
  | 'circadian'
  | 'hrv'
  | 'restingHr'
  | 'activityBalance';

export interface EnergyScoreFactor {
  id: EnergyFactorId;
  label: string;
  weightPct: number;
  score: number | null; // 0..100
  valueText: string;
  note: string;
}

export type HrDipStatus = 'optimal' | 'low_dip' | 'deep_dip' | 'no_data';

export type HrDipDaytimeSource =
  | 'measured_watch'
  | 'baseline_14d'
  | 'physiological_baseline'
  | 'none';

export interface SamsungEnergyAndHrDipReport {
  anchorNightDate: string | null;
  todayKey: string;
  hasEnoughData: boolean;
  energyScore: number; // 0..100
  energyTier: 'excellent' | 'good' | 'moderate' | 'low';
  energyTierLabel: string;
  energySummary: string;
  factors: EnergyScoreFactor[];
  // Sleeping HR Dip
  sleepingHrBpm: number | null;
  daytimeHrBpm: number | null;
  hrDipPct: number | null;
  hrDipStatus: HrDipStatus;
  hrDipStatusLabel: string;
  hrDipSource: HrDipDaytimeSource;
  hrDipSourceLabel: string;
  hrDipWarning: string | null;
  hormonalPeakExplanation: string;
}

function estimateDaytimeAwakeHrFromActivities(
  activities: WatchActivityRecord[] | undefined,
): number | null {
  if (!Array.isArray(activities) || activities.length === 0) return null;
  let weightedHrSum = 0;
  let weightSum = 0;

  for (const act of activities) {
    const avgHr = safeFinite(act.average_heartrate);
    if (avgHr === null || avgHr < 55 || avgHr > 220) continue;
    const durWeight = Math.max(10, Math.round((safeFinite(act.moving_time) ?? 1800) / 60));
    // Map recorded activity HR onto mean awake daytime HR (walks sit closer to awake HR, runs sit higher)
    const typeNorm = (act.type || '').toLowerCase();
    const awakeEstimate =
      typeNorm.includes('walk') && avgHr <= 115
        ? clamp(avgHr * 0.74, 58, 92)
        : avgHr < 115
          ? clamp(avgHr * 0.72, 58, 92)
          : clamp(avgHr * 0.49, 58, 96);
    weightedHrSum += awakeEstimate * durWeight;
    weightSum += durWeight;
  }

  if (weightSum <= 0) return null;
  return Math.round(weightedHrSum / weightSum);
}

export function computeSamsungEnergyAndHrDipReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): SamsungEnergyAndHrDipReport {
  const { dailyLogs, hevyWorkouts, todayKey } = params;
  const logsByDate = buildLogsByDate(dailyLogs);
  const latest = resolveLatestNocturnalLog(logsByDate, todayKey);
  const sleepCoaching = computeSleepCoachingChronotypeReport({
    dailyLogs,
    hevyWorkouts,
    todayKey,
  });

  if (!latest) {
    return {
      anchorNightDate: null,
      todayKey,
      hasEnoughData: false,
      energyScore: 0,
      energyTier: 'low',
      energyTierLabel: 'Очаква данни',
      energySummary:
        'Запиши или синхронизирай последната нощ (сън, RHR, HRV), за да изчислим Samsung Energy Score и нощния спад на пулса.',
      factors: [
        {
          id: 'sleep',
          label: 'Качество и обем сън',
          weightPct: 30,
          score: null,
          valueText: '—',
          note: 'Очаква данни за съня.',
        },
        {
          id: 'circadian',
          label: 'Циркадна регулярност',
          weightPct: 15,
          score: null,
          valueText: '—',
          note: 'Очаква поне 3 нощи сън.',
        },
        {
          id: 'hrv',
          label: 'Нощен HRV',
          weightPct: 20,
          score: null,
          valueText: '—',
          note: 'Очаква HRV от часовника.',
        },
        {
          id: 'restingHr',
          label: 'Нощен пулс в покой',
          weightPct: 15,
          score: null,
          valueText: '—',
          note: 'Очаква resting HR.',
        },
        {
          id: 'activityBalance',
          label: 'Баланс на активността',
          weightPct: 20,
          score: null,
          valueText: '—',
          note: 'Очаква предходен ден.',
        },
      ],
      sleepingHrBpm: null,
      daytimeHrBpm: null,
      hrDipPct: null,
      hrDipStatus: 'no_data',
      hrDipStatusLabel: 'Няма пулсови данни',
      hrDipSource: 'none',
      hrDipSourceLabel: 'Липсва нощен пулс',
      hrDipWarning: null,
      hormonalPeakExplanation:
        'Нощният спад на пулса (Sleeping HR Dip от 10–20%) показва превключване от кортизоловата симпатикова ос към парасимпатиково възстановяване — точно в тази фаза се осъществява основният нощен синтез на тестостерон.',
    };
  }

  // Gather 30-day baselines strictly before anchorNightDate
  const rhrHistory: number[] = [];
  const hrvHistory: number[] = [];
  for (let offset = 1; offset <= 30; offset += 1) {
    const l = logsByDate.get(shiftDateKey(latest.date, -offset));
    if (!l) continue;
    const rhr = safeFinite(l.restingHr);
    if (rhr !== null && rhr > 0) rhrHistory.push(rhr);
    const hrv = safeFinite(l.hrv);
    if (hrv !== null && hrv > 0) hrvHistory.push(hrv);
  }
  const medianRhr30d = computePercentile(rhrHistory, 0.5);
  const medianHrv30d = computePercentile(hrvHistory, 0.5);

  // 1. Sleep factor (30%)
  const sleepHours = safeFinite(latest.log.sleepHours);
  const deepRemPct = computeDeepRemPct(latest.log);
  const sleepQuality = safeFinite(latest.log.sleepQuality);
  let sleepScore: number | null = null;
  let sleepValueText = '—';
  let sleepNote = 'Няма данни за съня от последната нощ.';

  if (sleepHours !== null && sleepHours > 0) {
    // Duration score: 7.5–8.5h = 95-100, 7h = 85, 6h = 62, 5h = 38
    const durScore =
      sleepHours >= 7.5 && sleepHours <= 9.0
        ? 96 + Math.min(4, (sleepHours - 7.5) * 4)
        : sleepHours > 9.0
          ? clamp(95 - (sleepHours - 9.0) * 8, 72, 95)
          : clamp(100 - (7.5 - sleepHours) * 24, 15, 96);

    let composite = durScore;
    let partsText = `${round1(sleepHours)} ч`;
    if (deepRemPct !== null) {
      const stageScore = clamp((deepRemPct / 42) * 100, 25, 100);
      composite = durScore * 0.65 + stageScore * 0.35;
      partsText += ` · ${Math.round(deepRemPct)}% D+R`;
    } else if (sleepQuality !== null) {
      const qScore = clamp((sleepQuality / 5) * 100, 20, 100);
      composite = durScore * 0.72 + qScore * 0.28;
      partsText += ` · свежест ${Math.round(sleepQuality)}/5`;
    }
    sleepScore = Math.round(clamp(composite, 0, 100));
    sleepValueText = partsText;
    sleepNote =
      sleepScore >= 80
        ? 'Силно нощно възстановяване — достатъчна продължителност и дълбочина.'
        : sleepScore >= 60
          ? 'Умерен сън — възстановителен, но с резерв за повече дълбок сън.'
          : 'Кратък или накъсан сън — потиска дневния енергиен заряд и хормоналния пик.';
  }

  // 2. Circadian regularity factor (15%)
  let circadianScore: number | null = null;
  let circadianValueText = '—';
  let circadianNote = 'Натрупват се нощи за оценка на циркадната регулярност.';
  if (sleepCoaching.avgDeviationMin !== null && sleepCoaching.nightsAnalyzed >= 2) {
    const dev = sleepCoaching.avgDeviationMin;
    circadianScore = Math.round(
      dev <= 20
        ? 96
        : dev <= 30
          ? 84 + ((30 - dev) / 10) * 12
          : dev <= 50
            ? 60 + ((50 - dev) / 20) * 24
            : clamp(60 - (dev - 50) * 0.7, 25, 60),
    );
    circadianValueText = `±${dev} мин (14д)`;
    circadianNote =
      dev <= 30
        ? 'Отлична циркадна дисциплина (в целта под ±30 мин).'
        : 'Колебанията в часа на лягане разстройват мелатониновия и тестостероновия ритъм.';
  }

  // 3. HRV factor (20%)
  const lastHrv = safeFinite(latest.log.hrv);
  let hrvScore: number | null = null;
  let hrvValueText = '—';
  let hrvNote = 'Няма измерен HRV за последната нощ.';
  if (lastHrv !== null && lastHrv > 0) {
    if (medianHrv30d !== null && medianHrv30d > 0) {
      const pctDiff = ((lastHrv - medianHrv30d) / medianHrv30d) * 100;
      hrvScore = Math.round(clamp(82 + pctDiff * 1.45, 20, 100));
      hrvValueText = `${round1(lastHrv)} ms (${pctDiff >= 0 ? '+' : ''}${Math.round(pctDiff)}%)`;
      hrvNote =
        pctDiff >= -4
          ? 'Парасимпатиковата нервна система е добре възстановена.'
          : 'HRV е под 30-дневната ти база — знак за натрупан стрес на ЦНС.';
    } else {
      hrvScore = Math.round(clamp((lastHrv / 65) * 85, 30, 98));
      hrvValueText = `${round1(lastHrv)} ms`;
      hrvNote = 'Измерен нощен HRV (натрупва се 30-дневна лична база).';
    }
  }

  // 4. Resting HR factor (15%)
  const lastRhr = safeFinite(latest.log.restingHr);
  let rhrScore: number | null = null;
  let rhrValueText = '—';
  let rhrNote = 'Няма измерен нощен пулс в покой.';
  if (lastRhr !== null && lastRhr > 0) {
    if (medianRhr30d !== null && medianRhr30d > 0) {
      const deltaBpm = lastRhr - medianRhr30d;
      rhrScore = Math.round(clamp(86 - deltaBpm * 6.5, 20, 100));
      rhrValueText = `${Math.round(lastRhr)} bpm (${deltaBpm >= 0 ? '+' : ''}${round1(deltaBpm)})`;
      rhrNote =
        deltaBpm <= 1.5
          ? 'Спокойно нощно сърдечно разтоварване в личната ти норма.'
          : 'Повишен нощен пулс спрямо 30-дневната база — по-висок сърдечно-съдов и кортизолов стрес.';
    } else {
      rhrScore = Math.round(clamp(100 - Math.max(0, lastRhr - 50) * 1.8, 35, 96));
      rhrValueText = `${Math.round(lastRhr)} bpm`;
      rhrNote = 'Нощен пулс в покой (натрупва се 30-дневна лична база).';
    }
  }

  // 5. Prior-day activity balance (20%)
  const priorDayKey = shiftDateKey(todayKey, -1);
  const priorLog = logsByDate.get(priorDayKey);
  const effortReport = computeEffortTrainingLoadReport({
    dailyLogs,
    hevyWorkouts,
    todayKey,
  });
  const priorDayBar =
    effortReport.dailySeries7d[effortReport.dailySeries7d.length - 1] ?? null;

  let activityScore: number | null = null;
  let activityValueText = '—';
  let activityNote = 'Няма записана активност за предходния ден.';
  const priorEffort = priorDayBar?.totalEffort ?? 0;
  const priorSteps = safeFinite(priorLog?.steps) ?? 0;

  if (priorEffort > 0 || priorSteps > 0 || effortReport.baseline28dWeekly > 0) {
    const dailyBaselineEffort = Math.max(2.5, effortReport.baseline28dWeekly / 7);
    const effortRatio = priorEffort / dailyBaselineEffort;

    if (priorEffort === 0 && priorSteps >= 5000 && priorSteps <= 14000) {
      activityScore = 88;
      activityValueText = `${Math.round(priorSteps).toLocaleString('bg-BG')} крачки (активен отдих)`;
      activityNote = 'Лек активен ден вчера — свеж енергиен баланс за днес.';
    } else if (effortRatio >= 0.5 && effortRatio <= 1.45) {
      activityScore = 90;
      activityValueText =
        priorEffort > 0
          ? `Усилие ${priorEffort}/10 вчера`
          : `${Math.round(priorSteps).toLocaleString('bg-BG')} крачки`;
      activityNote = 'Балансирано натоварване вчера — стимулира адаптация без преумора.';
    } else if (effortRatio > 1.45) {
      activityScore = Math.round(clamp(90 - (effortRatio - 1.45) * 28, 38, 86));
      activityValueText = `Високо усилие ${priorEffort} т. вчера`;
      activityNote =
        'Тежко вчерашно натоварване — тялото още регенерира гликоген и нервна система.';
    } else {
      activityScore = 76;
      activityValueText =
        priorSteps > 0
          ? `${Math.round(priorSteps).toLocaleString('bg-BG')} крачки`
          : 'Почивен ден вчера';
      activityNote = 'Ниска активност вчера — добър резерв за качествен стимул днес.';
    }
  }

  const factors: EnergyScoreFactor[] = [
    {
      id: 'sleep',
      label: 'Качество и обем сън',
      weightPct: 30,
      score: sleepScore,
      valueText: sleepValueText,
      note: sleepNote,
    },
    {
      id: 'circadian',
      label: 'Циркадна регулярност',
      weightPct: 15,
      score: circadianScore,
      valueText: circadianValueText,
      note: circadianNote,
    },
    {
      id: 'hrv',
      label: 'Нощен HRV',
      weightPct: 20,
      score: hrvScore,
      valueText: hrvValueText,
      note: hrvNote,
    },
    {
      id: 'restingHr',
      label: 'Нощен пулс в покой',
      weightPct: 15,
      score: rhrScore,
      valueText: rhrValueText,
      note: rhrNote,
    },
    {
      id: 'activityBalance',
      label: 'Баланс на активността',
      weightPct: 20,
      score: activityScore,
      valueText: activityValueText,
      note: activityNote,
    },
  ];

  let weightedSum = 0;
  let activeWeight = 0;
  for (const f of factors) {
    if (f.score !== null && Number.isFinite(f.score)) {
      weightedSum += f.score * f.weightPct;
      activeWeight += f.weightPct;
    }
  }

  const energyScore =
    activeWeight > 0
      ? Math.round(clamp(weightedSum / activeWeight, 0, 100))
      : 0;

  const energyTier: SamsungEnergyAndHrDipReport['energyTier'] =
    energyScore >= 82
      ? 'excellent'
      : energyScore >= 68
        ? 'good'
        : energyScore >= 52
          ? 'moderate'
          : 'low';

  const energyTierLabel =
    energyTier === 'excellent'
      ? 'Отличен заряд'
      : energyTier === 'good'
        ? 'Добър заряд'
        : energyTier === 'moderate'
          ? 'Умерен заряд'
          : 'Нисък заряд — приоритет възстановяване';

  const energySummary =
    energyTier === 'excellent'
      ? 'Нервната система, сънят и пулсът са в синхрон — днес имаш силен енергиен прозорец за прогресия.'
      : energyTier === 'good'
        ? 'Стабилен сутрешен заряд — можеш да изпълниш планираната тренировка с контролирано темпо.'
        : energyTier === 'moderate'
          ? 'Част от нощните фактори са под оптималното — фокусирай се върху техника и умерен обем.'
          : 'Енергийният резерв е нисък — намали обема и приоритизирай ранен сън и хранене.';

  // --------------------------------------------------------------------------
  // SLEEPING HR DIP (%) — per confirmed Q2 decision:
  // 1) Measured watch daytime HR on anchor/prior day
  // 2) 14-day personal watch daytime HR baseline fallback
  // 3) Physiological daytime reference from 30d median RHR + steps (clearly labeled)
  // --------------------------------------------------------------------------
  const sleepingHrBpm = lastRhr !== null ? Math.round(lastRhr) : null;
  let daytimeHrBpm: number | null = null;
  let hrDipSource: HrDipDaytimeSource = 'none';
  let hrDipSourceLabel = 'Липсва нощен пулс';

  if (sleepingHrBpm !== null) {
    const anchorDayWatchHr =
      estimateDaytimeAwakeHrFromActivities(latest.log.watchActivities) ??
      estimateDaytimeAwakeHrFromActivities(priorLog?.watchActivities);

    if (anchorDayWatchHr !== null) {
      daytimeHrBpm = anchorDayWatchHr;
      hrDipSource = 'measured_watch';
      hrDipSourceLabel = 'Измерен дневен пулс от часовника';
    } else {
      // 14-day personal daytime HR baseline from watch activities
      const watchDaytime14d: number[] = [];
      for (let offset = 1; offset <= 14; offset += 1) {
        const l = logsByDate.get(shiftDateKey(todayKey, -offset));
        const est = estimateDaytimeAwakeHrFromActivities(l?.watchActivities);
        if (est !== null) watchDaytime14d.push(est);
      }
      const avg14dWatchDaytime = mean(watchDaytime14d);
      if (avg14dWatchDaytime !== null) {
        daytimeHrBpm = Math.round(avg14dWatchDaytime);
        hrDipSource = 'baseline_14d';
        hrDipSourceLabel = `14-дневна база от часовника (${watchDaytime14d.length} дни)`;
      } else {
        // Physiological awake daytime reference anchored to 30d median RHR (independent of last night's spike!)
        const baseRhr = medianRhr30d ?? sleepingHrBpm;
        const stepsBonus = priorSteps >= 10000 ? 3 : priorSteps >= 6000 ? 1.5 : 0;
        daytimeHrBpm = Math.round(clamp(baseRhr * 1.17 + stepsBonus, 58, 95));
        hrDipSource = 'physiological_baseline';
        hrDipSourceLabel = 'Референтна дневна база (без кардио с пулс в посл. 14д)';
      }
    }
  }

  let hrDipPct: number | null = null;
  let hrDipStatus: HrDipStatus = 'no_data';
  let hrDipStatusLabel = 'Няма данни';
  let hrDipWarning: string | null = null;

  if (sleepingHrBpm !== null && daytimeHrBpm !== null && daytimeHrBpm > 0) {
    hrDipPct = round1(((daytimeHrBpm - sleepingHrBpm) / daytimeHrBpm) * 100);
    if (hrDipPct < 10) {
      hrDipStatus = 'low_dip';
      hrDipStatusLabel = 'Под оптимума (< 10%)';
      hrDipWarning =
        'Нощният спад на пулса е под 10% — сърцето не е превключило пълноценно в нощен режим. Най-честите причини са късно хранене (<2–3 ч. преди сън), стимуланти/кофеин, алкохол или невъзстановена нервна система.';
    } else if (hrDipPct <= 20) {
      hrDipStatus = 'optimal';
      hrDipStatusLabel = 'Оптимален спад (10–20%)';
    } else {
      hrDipStatus = 'deep_dip';
      hrDipStatusLabel = 'Дълбок спад (> 20%)';
    }
  }

  const hormonalPeakExplanation =
    hrDipStatus === 'low_dip'
      ? 'Когато нощният пулс остане висок (спад < 10%), симпатиковата активност и вечерният кортизол потискат пулсативното отделяне на лутеинизиращ хормон (LH) и режат нощния пик на тестостерон. Завършването на последното хранене 3 ч. преди сън директно възстановява този спад.'
      : 'Между 10% и 20% нощен спад на пулса сигнализира чиста парасимпатикова доминация по време на дълбокия сън — основното физиологично условие за максимален нощен синтез на тестостерон и растежен хормон.';

  return {
    anchorNightDate: latest.date,
    todayKey,
    hasEnoughData: activeWeight > 0,
    energyScore,
    energyTier,
    energyTierLabel,
    energySummary,
    factors,
    sleepingHrBpm,
    daytimeHrBpm,
    hrDipPct,
    hrDipStatus,
    hrDipStatusLabel,
    hrDipSource,
    hrDipSourceLabel,
    hrDipWarning,
    hormonalPeakExplanation,
  };
}
