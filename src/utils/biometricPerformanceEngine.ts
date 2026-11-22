import type {
  DailyBiometricLog,
  HevyWorkout,
  WatchActivityRecord,
} from '../types/fitness';
import { getWorkingSetsCount } from './exerciseMuscleEngine';
import {
  formatBgNumericDate,
  isValidDateKey,
  shiftDateKey,
} from './fitnessMath';
import {
  computeActivityVam,
  computeCardiacEfficiencyFactor,
  extractAllEnrichedWatchActivities,
  type EnrichedWatchActivity,
} from './mountainCardioEngine';
import { isBoxingWorkout } from './relativeStrengthAndBiorhythm';

// ============================================================================
// SAFE NUMERIC HELPERS (Zero-NaN protection for sparse / legacy database.json)
// ============================================================================

function isFinitePositive(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}

function safeMean(values: number[]): number | null {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((acc, v) => acc + v, 0) / valid.length;
}

function safeStdDev(values: number[], mean: number): number {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length < 2 || !Number.isFinite(mean)) return 0;
  const variance =
    valid.reduce((acc, v) => acc + (v - mean) ** 2, 0) / valid.length;
  return Number.isFinite(variance) && variance >= 0 ? Math.sqrt(variance) : 0;
}

function formatShortDayLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [, mm, dd] = dateKey.split('-');
  return `${dd}.${mm}`;
}

function buildDailyLogMap(
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

function buildWorkoutsByDateMap(
  workouts: HevyWorkout[],
): Map<string, HevyWorkout[]> {
  const map = new Map<string, HevyWorkout[]>();
  for (const w of workouts) {
    if (!w || !isValidDateKey(w.date)) continue;
    const list = map.get(w.date);
    if (list) list.push(w);
    else map.set(w.date, [w]);
  }
  return map;
}

function estimateWorkoutMinutes(w: HevyWorkout): number {
  if (w.startTime && w.endTime) {
    const startMs = Date.parse(w.startTime);
    const endMs = Date.parse(w.endTime);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const mins = (endMs - startMs) / 60000;
      if (mins >= 10 && mins <= 240) return Math.round(mins);
    }
  }
  let durationSec = 0;
  let setsCount = 0;
  for (const ex of w.exercises ?? []) {
    for (const s of ex.sets ?? []) {
      setsCount += 1;
      if (isFinitePositive(s.durationSeconds)) {
        durationSec += s.durationSeconds;
      }
    }
  }
  if (durationSec >= 600) {
    return clamp(Math.round(durationSec / 60), 15, 180);
  }
  return clamp(Math.round(Math.max(25, setsCount * 2.5)), 20, 120);
}

function getWorkoutWorkingSetsAndIntensity(w: HevyWorkout): {
  workingSets: number;
  heavySets: number;
  highRpeSets: number;
  tonnageKg: number;
  avgBestE1rmRatio: number;
} {
  let workingSets = 0;
  let heavySets = 0;
  let highRpeSets = 0;
  let tonnageKg = 0;

  for (const ex of w.exercises ?? []) {
    const ws = getWorkingSetsCount(ex.sets ?? []);
    workingSets += ws;
    for (const s of ex.sets ?? []) {
      if ((s.setType ?? '').toLowerCase() === 'warmup') continue;
      const weight = isFinitePositive(s.weightKg) ? s.weightKg : 0;
      const reps = isFinitePositive(s.reps) ? s.reps : 0;
      if (weight > 0 && reps > 0) {
        tonnageKg += weight * reps;
        if (reps <= 6 && weight >= 20) heavySets += 1;
      }
      if (typeof s.rpe === 'number' && Number.isFinite(s.rpe) && s.rpe >= 8) {
        highRpeSets += 1;
      }
    }
  }

  const intensityRatio =
    workingSets > 0 ? clamp((heavySets + highRpeSets * 0.8) / workingSets, 0, 1) : 0;

  return {
    workingSets,
    heavySets,
    highRpeSets,
    tonnageKg: Number.isFinite(tonnageKg) ? tonnageKg : 0,
    avgBestE1rmRatio: intensityRatio,
  };
}

function computeWatchActivityDrainPoints(act: WatchActivityRecord): number {
  const movingMin = isFinitePositive(act.moving_time) ? act.moving_time / 60 : 0;
  const elevM = isFinitePositive(act.total_elevation_gain)
    ? act.total_elevation_gain
    : 0;
  const avgHr =
    typeof act.average_heartrate === 'number' &&
    Number.isFinite(act.average_heartrate) &&
    act.average_heartrate >= 60
      ? act.average_heartrate
      : null;

  let hrFactor = 0.28;
  if (avgHr !== null) {
    if (avgHr >= 165) hrFactor = 0.5;
    else if (avgHr >= 150) hrFactor = 0.39;
    else if (avgHr >= 135) hrFactor = 0.3;
    else hrFactor = 0.21;
  } else {
    const t = (act.type ?? '').toLowerCase();
    if (t.includes('run')) hrFactor = 0.38;
    else if (t === 'hike') hrFactor = 0.26;
    else if (t === 'walk') hrFactor = 0.16;
  }

  const raw = movingMin * hrFactor + elevM / 75;
  return clamp(round1(raw), 0, 42);
}

// ============================================================================
// MODULE 1: ⚡ BODY BATTERY (0–100% Live Energy Reserve + 7-Day Curve)
// ============================================================================

export type BodyBatteryTier = 'peak' | 'solid' | 'moderate' | 'low';

export interface BodyBatteryDayPoint {
  date: string;
  shortLabel: string;
  isToday: boolean;
  morningPeak: number;
  eveningLevel: number;
  rechargeGain: number;
  totalDrain: number;
  strengthDrain: number;
  watchDrain: number;
  stepsDrain: number;
  sleepHours: number | null;
  restorativeSleepPct: number | null;
  restingHr: number | null;
  hrv: number | null;
  hasBiometrics: boolean;
}

export interface BodyBatteryReport {
  anchorDate: string;
  currentCharge: number; // 0-100
  morningPeakToday: number; // 0-100
  morningRechargeGain: number;
  todayTotalDrain: number;
  todayStrengthDrain: number;
  todayWatchDrain: number;
  todayStepsDrain: number;
  tier: BodyBatteryTier;
  tierLabel: string;
  barbellReserveText: string;
  boxingReserveText: string;
  summaryText: string;
  hasEnoughData: boolean;
  factors: {
    sleepHours: number | null;
    restorativeSleepPct: number | null;
    restingHr: number | null;
    baselineRhr30d: number | null;
    rhrDeltaBpm: number | null;
    hrv: number | null;
    baselineHrv30d: number | null;
    hrvDeltaPct: number | null;
    sourceDate: string | null;
  };
  series7d: BodyBatteryDayPoint[];
}

export function computeBodyBatteryReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): BodyBatteryReport {
  const { dailyLogs, hevyWorkouts, todayKey } = params;
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const logByDate = buildDailyLogMap(dailyLogs);
  const workoutsByDate = buildWorkoutsByDateMap(hevyWorkouts);

  // 30-day personal baselines (completed days up to yesterday)
  const rhr30Values: number[] = [];
  const hrv30Values: number[] = [];
  for (let i = 0; i < 30; i += 1) {
    const dk = shiftDateKey(yesterdayKey, -i);
    const entry = logByDate.get(dk);
    if (!entry) continue;
    if (
      typeof entry.restingHr === 'number' &&
      Number.isFinite(entry.restingHr) &&
      entry.restingHr >= 30 &&
      entry.restingHr <= 120
    ) {
      rhr30Values.push(entry.restingHr);
    }
    if (
      typeof entry.hrv === 'number' &&
      Number.isFinite(entry.hrv) &&
      entry.hrv >= 10 &&
      entry.hrv <= 250
    ) {
      hrv30Values.push(entry.hrv);
    }
  }

  const baselineRhr30d =
    rhr30Values.length > 0 ? round1(safeMean(rhr30Values) ?? 0) : null;
  const baselineHrv30d =
    hrv30Values.length > 0 ? round1(safeMean(hrv30Values) ?? 0) : null;

  function computeDayBiometricRechargeTarget(entry: DailyBiometricLog | undefined): {
    targetPeak: number;
    hasBiometrics: boolean;
    sleepHours: number | null;
    restorativePct: number | null;
    restingHr: number | null;
    hrv: number | null;
  } {
    if (!entry) {
      return {
        targetPeak: 68,
        hasBiometrics: false,
        sleepHours: null,
        restorativePct: null,
        restingHr: null,
        hrv: null,
      };
    }

    const sleepHours =
      typeof entry.sleepHours === 'number' &&
      Number.isFinite(entry.sleepHours) &&
      entry.sleepHours > 0
        ? clamp(entry.sleepHours, 1, 16)
        : null;

    const deepSecs = isFinitePositive(entry.deepSleepSecs)
      ? entry.deepSleepSecs
      : 0;
    const remSecs = isFinitePositive(entry.remSleepSecs) ? entry.remSleepSecs : 0;
    const restorativePct =
      sleepHours !== null && (deepSecs > 0 || remSecs > 0)
        ? round1(clamp(((deepSecs + remSecs) / (sleepHours * 3600)) * 100, 0, 85))
        : null;

    const restingHr =
      typeof entry.restingHr === 'number' &&
      Number.isFinite(entry.restingHr) &&
      entry.restingHr >= 30 &&
      entry.restingHr <= 120
        ? entry.restingHr
        : null;

    const hrv =
      typeof entry.hrv === 'number' &&
      Number.isFinite(entry.hrv) &&
      entry.hrv >= 10 &&
      entry.hrv <= 250
        ? entry.hrv
        : null;

    const hasBiometrics =
      sleepHours !== null ||
      restorativePct !== null ||
      restingHr !== null ||
      hrv !== null;

    if (!hasBiometrics) {
      return {
        targetPeak: 68,
        hasBiometrics: false,
        sleepHours: null,
        restorativePct: null,
        restingHr: null,
        hrv: null,
      };
    }

    // Weighted Garmin/Whoop style morning readiness-charge score (0..100)
    // Base neutral = 70, shifted by Sleep Duration, Deep+REM %, RHR delta vs 30d, HRV ratio vs 30d
    let score = 70;

    // 1. Sleep duration (-24 to +16)
    if (sleepHours !== null) {
      if (sleepHours >= 8.2) score += 16;
      else if (sleepHours >= 7.5) score += 12;
      else if (sleepHours >= 6.8) score += 4;
      else if (sleepHours >= 6.0) score -= 7;
      else if (sleepHours >= 5.0) score -= 16;
      else score -= 24;
    }

    // 2. Deep + REM % (-10 to +10), fallback to sleepQuality (1-5)
    if (restorativePct !== null) {
      if (restorativePct >= 42) score += 10;
      else if (restorativePct >= 35) score += 6;
      else if (restorativePct >= 28) score += 1;
      else if (restorativePct >= 22) score -= 5;
      else score -= 10;
    } else if (
      typeof entry.sleepQuality === 'number' &&
      Number.isFinite(entry.sleepQuality)
    ) {
      score += (clamp(entry.sleepQuality, 1, 5) - 3) * 3.5;
    }

    // 3. Morning RHR vs 30-day average (-14 to +8)
    if (restingHr !== null && baselineRhr30d !== null) {
      const delta = restingHr - baselineRhr30d;
      if (delta <= -2.5) score += 8;
      else if (delta <= 0.5) score += 4;
      else if (delta <= 2.5) score -= 3;
      else if (delta <= 4.5) score -= 9;
      else score -= 14;
    }

    // 4. Morning HRV vs 30-day baseline (-14 to +10)
    if (hrv !== null && baselineHrv30d !== null && baselineHrv30d > 0) {
      const pctDelta = ((hrv - baselineHrv30d) / baselineHrv30d) * 100;
      if (pctDelta >= 8) score += 10;
      else if (pctDelta >= -4) score += 4;
      else if (pctDelta >= -12) score -= 5;
      else score -= 14;
    }

    return {
      targetPeak: Math.round(clamp(score, 22, 100)),
      hasBiometrics: true,
      sleepHours,
      restorativePct,
      restingHr,
      hrv,
    };
  }

  function computeDayDrain(
    dateKey: string,
    entry: DailyBiometricLog | undefined,
    isToday: boolean,
  ): {
    strengthDrain: number;
    watchDrain: number;
    stepsDrain: number;
    totalDrain: number;
  } {
    const dayWorkouts = workoutsByDate.get(dateKey) ?? [];
    let strengthDrain = 0;

    for (const w of dayWorkouts) {
      if (isBoxingWorkout(w)) {
        const mins = estimateWorkoutMinutes(w);
        strengthDrain += clamp(round1(mins * 0.36), 12, 28);
      } else {
        const info = getWorkoutWorkingSetsAndIntensity(w);
        const setLoad = info.workingSets * 1.15;
        const intensityBonus = info.avgBestE1rmRatio * 6 + Math.min(6, info.tonnageKg / 4500);
        strengthDrain += clamp(round1(setLoad + intensityBonus), 6, 36);
      }
    }
    strengthDrain = clamp(Math.round(strengthDrain), 0, 48);

    let watchDrain = 0;
    if (entry?.watchActivities && entry.watchActivities.length > 0) {
      for (const act of entry.watchActivities) {
        watchDrain += computeWatchActivityDrainPoints(act);
      }
    } else if (entry && isFinitePositive(entry.cardioDurationMinutes)) {
      const elev = isFinitePositive(entry.cardioElevationGainM)
        ? entry.cardioElevationGainM
        : 0;
      watchDrain += entry.cardioDurationMinutes * 0.28 + elev / 80;
    }
    watchDrain = clamp(Math.round(watchDrain), 0, 46);

    let stepsDrain = 0;
    if (entry && isFinitePositive(entry.steps)) {
      stepsDrain = clamp(Math.round(entry.steps / 1100), 2, 18);
    } else if (!isToday && (entry || dayWorkouts.length > 0)) {
      // Standard completed day metabolic baseline drain even if steps weren't recorded
      stepsDrain = 8;
    }

    const totalDrain = clamp(strengthDrain + watchDrain + stepsDrain, 0, 72);
    return { strengthDrain, watchDrain, stepsDrain, totalDrain };
  }

  // Build 7-day curve: 6 completed past days + today (total 7 points ending on todayKey)
  const series7d: BodyBatteryDayPoint[] = [];
  let prevEvening = 42;
  let anyBiometricsIn7d = false;
  let latestMorningBiometricDate: string | null = null;
  let latestMorningBio: ReturnType<typeof computeDayBiometricRechargeTarget> | null =
    null;

  for (let offset = 6; offset >= 0; offset -= 1) {
    const dk = shiftDateKey(todayKey, -offset);
    const isToday = dk === todayKey;
    const entry = logByDate.get(dk);

    // For today: if today's own morning entry isn't logged yet (standard workflow: records up to yesterday),
    // inherit morning sleep/HRV/RHR charge from yesterday's logged night so Body Battery reflects today's live reserve!
    const rechargeSourceEntry =
      isToday && !entry?.sleepHours && !entry?.restingHr && !entry?.hrv
        ? logByDate.get(yesterdayKey) ?? entry
        : entry;

    const bio = computeDayBiometricRechargeTarget(rechargeSourceEntry);
    if (bio.hasBiometrics) {
      anyBiometricsIn7d = true;
      latestMorningBio = bio;
      latestMorningBiometricDate =
        isToday && rechargeSourceEntry?.date ? rechargeSourceEntry.date : dk;
    }

    // Carry-over inertia from previous evening (25%) + overnight recovery quality (75%)
    const rawMorningPeak = bio.hasBiometrics
      ? Math.round(clamp(prevEvening * 0.22 + bio.targetPeak * 0.85, 25, 100))
      : Math.round(clamp(prevEvening + 26, 35, 75));

    const rechargeGain = Math.max(0, rawMorningPeak - prevEvening);
    const drain = computeDayDrain(dk, entry, isToday);
    const eveningLevel = clamp(rawMorningPeak - drain.totalDrain, 5, rawMorningPeak);

    series7d.push({
      date: dk,
      shortLabel: isToday ? 'Днес' : formatShortDayLabel(dk),
      isToday,
      morningPeak: rawMorningPeak,
      eveningLevel,
      rechargeGain,
      totalDrain: drain.totalDrain,
      strengthDrain: drain.strengthDrain,
      watchDrain: drain.watchDrain,
      stepsDrain: drain.stepsDrain,
      sleepHours: bio.sleepHours,
      restorativeSleepPct: bio.restorativePct,
      restingHr: bio.restingHr,
      hrv: bio.hrv,
      hasBiometrics: bio.hasBiometrics,
    });

    prevEvening = eveningLevel;
  }

  const todayPoint = series7d[series7d.length - 1];
  const currentCharge = todayPoint ? todayPoint.eveningLevel : 50;
  const morningPeakToday = todayPoint ? todayPoint.morningPeak : 60;
  const morningRechargeGain = todayPoint ? todayPoint.rechargeGain : 0;

  let tier: BodyBatteryTier;
  let tierLabel: string;
  let barbellReserveText: string;
  let boxingReserveText: string;
  let summaryText: string;

  if (!anyBiometricsIn7d) {
    tier = 'moderate';
    tierLabel = 'Изчаква биометрика';
    barbellReserveText =
      'Синхронизирай часовника или запиши сън/пулс за вчера, за да изчислим точния резерв за щанга.';
    boxingReserveText =
      'При липса на сутрешни данни заложи на умерена техника (4–6 рунда) и следи усещането.';
    summaryText =
      'Все още няма достатъчно данни за сън, RHR или HRV през последните 7 дни. Body Battery ще се калибрира автоматично след първия запис.';
  } else if (currentCharge >= 80) {
    tier = 'peak';
    tierLabel = 'Висок заряд · Пиков резерв';
    barbellReserveText =
      'Пълен резерв за тежка щанга (RPE 8.5–9.5), базови упражнения и опити за личен рекорд.';
    boxingReserveText =
      'Енергия за 8–10 интензивни рунда на чувал или контролиран спаринг с висока експлозивност.';
    summaryText =
      'Нощното възстановяване е презаредило нервната система. Можеш да планираш ключовата си тренировка за седмицата днес.';
  } else if (currentCharge >= 60) {
    tier = 'solid';
    tierLabel = 'Стабилен заряд';
    barbellReserveText =
      'Добър резерв за стандартна силова тренировка (RPE 7.5–8.5) — запази 1–2 повторения в резерв.';
    boxingReserveText =
      'Подходящо за 6–8 рунда технически бокс / чувал с темпо без прекомерно закисляване.';
    summaryText =
      'Енергийният баланс е положителен. Работи по плана, но избягвай излишен „junk volume“ в края на сесията.';
  } else if (currentCharge >= 40) {
    tier = 'moderate';
    tierLabel = 'Умерен / Понижен заряд';
    barbellReserveText =
      'Намали тежките работни серии с 20–30% (RPE 7) или избери поддържаща сесия без опити за макс.';
    boxingReserveText =
      'Замени тежкия спаринг с 4–6 леки технически рунда (бой със сянка, движение с крака и защита).';
    summaryText =
      'Натрупано е частично изтощаване или по-плитък сън. Приоритет е качествената техника без да изцеждаш ЦНС.';
  } else {
    tier = 'low';
    tierLabel = 'Нисък резерв · Нужда от презареждане';
    barbellReserveText =
      'Пропусни тежката щанга днес — ЦНС и мускулният резерв са изчерпани и рискът от травма е висок.';
    boxingReserveText =
      'Без твърд спаринг и тежки рундове; избери разходка, мобилност и 8+ ч. сън довечера.';
    summaryText =
      'Батерията е под критичния праг (40%). Активното възстановяване днес ще отключи по-висока сила в следващите 48 ч.';
  }

  const latestRhr = latestMorningBio?.restingHr ?? null;
  const latestHrv = latestMorningBio?.hrv ?? null;

  const rhrDeltaBpm =
    latestRhr !== null && baselineRhr30d !== null
      ? round1(latestRhr - baselineRhr30d)
      : null;
  const hrvDeltaPct =
    latestHrv !== null && baselineHrv30d !== null && baselineHrv30d > 0
      ? round1(((latestHrv - baselineHrv30d) / baselineHrv30d) * 100)
      : null;

  return {
    anchorDate: todayKey,
    currentCharge,
    morningPeakToday,
    morningRechargeGain,
    todayTotalDrain: todayPoint?.totalDrain ?? 0,
    todayStrengthDrain: todayPoint?.strengthDrain ?? 0,
    todayWatchDrain: todayPoint?.watchDrain ?? 0,
    todayStepsDrain: todayPoint?.stepsDrain ?? 0,
    tier,
    tierLabel,
    barbellReserveText,
    boxingReserveText,
    summaryText,
    hasEnoughData: anyBiometricsIn7d,
    factors: {
      sleepHours: latestMorningBio?.sleepHours ?? null,
      restorativeSleepPct: latestMorningBio?.restorativePct ?? null,
      restingHr: latestRhr,
      baselineRhr30d,
      rhrDeltaBpm,
      hrv: latestHrv,
      baselineHrv30d,
      hrvDeltaPct,
      sourceDate: latestMorningBiometricDate,
    },
    series7d,
  };
}

// ============================================================================
// MODULE 2: 📊 HRV STATUS (30-Day Personal Baseline Corridor ±1 SD + 7d Rolling)
// ============================================================================

export type HrvStatusClassification =
  | 'calibrating'
  | 'balanced'
  | 'unbalanced'
  | 'low_recovery';

export interface HrvTrendPoint {
  date: string;
  shortLabel: string;
  dailyHrv: number | null;
  rolling7dAvg: number | null;
}

export interface HrvStatusReport {
  windowStartDate: string;
  windowEndDate: string;
  samplesCount30d: number;
  requiredCalibrationSamples: number;
  status: HrvStatusClassification;
  statusLabel: string;
  statusDetail: string;
  baselineMean30d: number | null;
  baselineStdDev30d: number | null;
  corridorLow: number | null;
  corridorHigh: number | null;
  current7dAvg: number | null;
  latestHrv: number | null;
  latestHrvDate: string | null;
  deltaFromMeanMs: number | null;
  deltaFromMeanPct: number | null;
  points30d: HrvTrendPoint[];
}

export function computeHrvStatusReport(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): HrvStatusReport {
  const { dailyLogs, todayKey } = params;
  const windowEndDate = shiftDateKey(todayKey, -1); // Completed days up to yesterday
  const windowStartDate = shiftDateKey(windowEndDate, -29); // 30-day personal corridor window
  const logByDate = buildDailyLogMap(dailyLogs);

  const valid30dValues: number[] = [];
  let latestHrv: number | null = null;
  let latestHrvDate: string | null = null;

  // Helper to read valid HRV for a date
  function getValidHrv(dateKey: string): number | null {
    const entry = logByDate.get(dateKey);
    if (
      entry &&
      typeof entry.hrv === 'number' &&
      Number.isFinite(entry.hrv) &&
      entry.hrv >= 10 &&
      entry.hrv <= 250
    ) {
      return round1(entry.hrv);
    }
    return null;
  }

  // Collect 30-day values & build daily + 7-day rolling series
  const points30d: HrvTrendPoint[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const dk = shiftDateKey(windowEndDate, -i);
    const val = getValidHrv(dk);
    if (val !== null) {
      valid30dValues.push(val);
      latestHrv = val;
      latestHrvDate = dk;
    }

    // 7-day rolling average ending on dk ([dk - 6d, dk])
    const rollingVals: number[] = [];
    for (let j = 0; j < 7; j += 1) {
      const rVal = getValidHrv(shiftDateKey(dk, -j));
      if (rVal !== null) rollingVals.push(rVal);
    }
    const rollingAvg =
      rollingVals.length >= 2
        ? round1(safeMean(rollingVals) ?? 0)
        : rollingVals.length === 1 && val !== null
          ? val
          : null;

    points30d.push({
      date: dk,
      shortLabel: formatShortDayLabel(dk),
      dailyHrv: val,
      rolling7dAvg: rollingAvg,
    });
  }

  const samplesCount30d = valid30dValues.length;
  const requiredCalibrationSamples = 7;

  // Latest 7-day rolling average (preferring windowEndDate, or the latest available point in last 7 days)
  let current7dAvg: number | null = null;
  for (let idx = points30d.length - 1; idx >= Math.max(0, points30d.length - 7); idx -= 1) {
    if (points30d[idx].rolling7dAvg !== null) {
      current7dAvg = points30d[idx].rolling7dAvg;
      break;
    }
  }

  if (samplesCount30d < requiredCalibrationSamples) {
    const partialMean =
      valid30dValues.length > 0 ? round1(safeMean(valid30dValues) ?? 0) : null;
    return {
      windowStartDate,
      windowEndDate,
      samplesCount30d,
      requiredCalibrationSamples,
      status: 'calibrating',
      statusLabel: 'Калибриране',
      statusDetail: `Събрани са ${samplesCount30d} от ${requiredCalibrationSamples} необходими сутрешни HRV записа през последните 30 дни. Продължи синхронизацията с часовника за отключване на личния базов коридор.`,
      baselineMean30d: partialMean,
      baselineStdDev30d: null,
      corridorLow: null,
      corridorHigh: null,
      current7dAvg,
      latestHrv,
      latestHrvDate,
      deltaFromMeanMs: null,
      deltaFromMeanPct: null,
      points30d,
    };
  }

  const rawMean = safeMean(valid30dValues) ?? 0;
  const baselineMean30d = round1(rawMean);
  const rawSd = safeStdDev(valid30dValues, rawMean);
  // Apply physiological floor of 3.0 ms so flat test/watch readings keep a meaningful corridor
  const effectiveSd = round1(Math.max(3, rawSd));
  const corridorLow = round1(Math.max(10, baselineMean30d - effectiveSd));
  const corridorHigh = round1(baselineMean30d + effectiveSd);

  const effective7d = current7dAvg ?? latestHrv ?? baselineMean30d;
  const deltaFromMeanMs = round1(effective7d - baselineMean30d);
  const deltaFromMeanPct =
    baselineMean30d > 0
      ? round1(((effective7d - baselineMean30d) / baselineMean30d) * 100)
      : null;

  let status: HrvStatusClassification;
  let statusLabel: string;
  let statusDetail: string;

  const lowRecoveryThreshold = Math.min(
    corridorLow - effectiveSd * 0.5,
    baselineMean30d * 0.87,
  );

  if (effective7d < lowRecoveryThreshold) {
    status = 'low_recovery';
    statusLabel = 'Ниско възстановяване';
    statusDetail = `7-дневната средна HRV (${effective7d} ms) е трайно под личния ти коридор (${corridorLow}–${corridorHigh} ms). Сигнал за кумулативна умора, стрес или недоспиване — планирай разтоварване.`;
  } else if (effective7d < corridorLow) {
    status = 'unbalanced';
    statusLabel = 'Небалансиран';
    statusDetail = `7-дневната средна HRV (${effective7d} ms) падна леко под долната граница (${corridorLow} ms). Организмът е под повишено натоварване — следи съня и намали тежките серии с 10–15%.`;
  } else if (effective7d > corridorHigh) {
    status = 'unbalanced';
    statusLabel = 'Небалансиран';
    statusDetail = `7-дневната средна HRV (${effective7d} ms) е над горната граница (${corridorHigh} ms). Може да означава силна суперкомпенсация след почивка или парасимпатикова преумора — сравни с пулса в покой.`;
  } else {
    status = 'balanced';
    statusLabel = 'Балансиран';
    statusDetail = `7-дневната средна HRV (${effective7d} ms) се движи стабилно в личния ти зелен коридор (${corridorLow}–${corridorHigh} ms). Автономната нервна система понася отлично текущия обем.`;
  }

  return {
    windowStartDate,
    windowEndDate,
    samplesCount30d,
    requiredCalibrationSamples,
    status,
    statusLabel,
    statusDetail,
    baselineMean30d,
    baselineStdDev30d: effectiveSd,
    corridorLow,
    corridorHigh,
    current7dAvg: effective7d,
    latestHrv,
    latestHrvDate,
    deltaFromMeanMs,
    deltaFromMeanPct,
    points30d,
  };
}

// ============================================================================
// MODULE 3: 🎯 TRAINING LOAD FOCUS (28d, 3 Zones) + ⚖️ DUAL STRESS METER (7d)
// ============================================================================

export type LoadZoneStatus = 'optimal' | 'shortage' | 'excess' | 'empty';

export interface TrainingLoadZoneItem {
  id: 'low_aerobic' | 'high_aerobic' | 'anaerobic';
  label: string;
  subtitle: string;
  loadPoints: number;
  sharePct: number;
  targetMinPct: number;
  targetMaxPct: number;
  status: LoadZoneStatus;
  statusLabel: string;
  colorHex: string;
}

export interface DualStressReport {
  windowStartDate: string;
  windowEndDate: string;
  muscularScore: number; // 0-100
  cardioScore: number; // 0-100
  muscularLabel: string;
  cardioLabel: string;
  muscularWorkingSets7d: number;
  muscularTonnage7dKg: number;
  muscularHeavySets7d: number;
  cardioMinutes7d: number;
  cardioAvgHr7d: number | null;
  cardioElevation7dM: number;
  divergenceType:
    | 'muscular_high_cardio_fresh'
    | 'cardio_high_muscular_fresh'
    | 'both_high'
    | 'balanced'
    | 'both_low';
  divergenceHeadline: string;
  divergenceAdvice: string;
}

export interface TrainingLoadFocusAndDualStressReport {
  loadWindowStart: string;
  loadWindowEnd: string;
  totalLoad28d: number;
  hasLoadData: boolean;
  zones: TrainingLoadZoneItem[];
  loadFocusHeadline: string;
  loadFocusAdvice: string;
  dualStress: DualStressReport;
}

function classifyLoadZoneStatus(
  sharePct: number,
  targetMin: number,
  targetMax: number,
  hasData: boolean,
): { status: LoadZoneStatus; statusLabel: string } {
  if (!hasData) return { status: 'empty', statusLabel: 'Няма данни' };
  if (sharePct < targetMin) return { status: 'shortage', statusLabel: 'Недостиг' };
  if (sharePct > targetMax) return { status: 'excess', statusLabel: 'Излишък' };
  return { status: 'optimal', statusLabel: 'В оптимум' };
}

function getStressBandLabel(score: number): string {
  if (score >= 78) return 'Претоварен';
  if (score >= 58) return 'Висок стимул';
  if (score >= 32) return 'Умерен';
  if (score >= 12) return 'Свеж / Лек';
  return 'Покой';
}

export function computeTrainingLoadFocusAndDualStress(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): TrainingLoadFocusAndDualStressReport {
  const { dailyLogs, hevyWorkouts, todayKey } = params;
  const windowEnd = shiftDateKey(todayKey, -1); // Completed days up to yesterday
  const loadWindowStart = shiftDateKey(windowEnd, -27); // 28 completed days
  const stressWindowStart = shiftDateKey(windowEnd, -6); // 7 completed days

  const logByDate = buildDailyLogMap(dailyLogs);
  const workoutsByDate = buildWorkoutsByDateMap(hevyWorkouts);

  // Build personal 28d best e1RM per exercise so we can score 7-day e1RM intensity pressure accurately
  const bestE1rmByExercise = new Map<string, number>();
  for (const w of hevyWorkouts) {
    if (!w || !isValidDateKey(w.date) || isBoxingWorkout(w)) continue;
    for (const ex of w.exercises ?? []) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      for (const s of ex.sets ?? []) {
        if ((s.setType ?? '').toLowerCase() === 'warmup') continue;
        if (isFinitePositive(s.weightKg) && isFinitePositive(s.reps)) {
          const e1rm = s.weightKg * (1 + Math.min(s.reps, 15) / 30);
          const prev = bestE1rmByExercise.get(key) ?? 0;
          if (e1rm > prev) bestE1rmByExercise.set(key, e1rm);
        }
      }
    }
  }

  let lowAerobicLoad28d = 0;
  let highAerobicLoad28d = 0;
  let anaerobicLoad28d = 0;

  // 7-day Dual Stress accumulators
  let muscularWorkingSets7d = 0;
  let muscularTonnage7dKg = 0;
  let muscularHeavySets7d = 0;
  let muscularE1rmPressurePoints = 0;
  let muscularE1rmSamples = 0;

  let cardioTrimpPoints7d = 0;
  let cardioMinutes7d = 0;
  let cardioElevation7dM = 0;
  const cardioHrSamples7d: number[] = [];

  for (let i = 0; i < 28; i += 1) {
    const dk = shiftDateKey(windowEnd, -i);
    const isIn7d = i < 7;
    const entry = logByDate.get(dk);
    const dayWorkouts = workoutsByDate.get(dk) ?? [];

    // 1. Hevy Workouts (Strength -> Anaerobic; Boxing -> High Aerobic + minor Anaerobic)
    for (const w of dayWorkouts) {
      if (isBoxingWorkout(w)) {
        const mins = estimateWorkoutMinutes(w);
        const boxingHighAero = mins * 1.35;
        const boxingAnaerobic = mins * 0.28;
        highAerobicLoad28d += boxingHighAero;
        anaerobicLoad28d += boxingAnaerobic;

        if (isIn7d) {
          cardioMinutes7d += mins;
          cardioTrimpPoints7d += mins * 1.45;
        }
      } else {
        const info = getWorkoutWorkingSetsAndIntensity(w);
        const avgSetAnaerobicWeight = 2.6 + info.avgBestE1rmRatio * 1.5;
        const sessionAnaerobic = info.workingSets * avgSetAnaerobicWeight;
        anaerobicLoad28d += sessionAnaerobic;

        if (isIn7d) {
          muscularWorkingSets7d += info.workingSets;
          muscularTonnage7dKg += info.tonnageKg;
          muscularHeavySets7d += info.heavySets;

          // Compute proximity to personal best e1RM across working exercises
          for (const ex of w.exercises ?? []) {
            const key = ex.title.trim().toLowerCase();
            const pb = bestE1rmByExercise.get(key) ?? 0;
            if (pb <= 0) continue;
            let exBest = 0;
            for (const s of ex.sets ?? []) {
              if ((s.setType ?? '').toLowerCase() === 'warmup') continue;
              if (isFinitePositive(s.weightKg) && isFinitePositive(s.reps)) {
                const e1rm = s.weightKg * (1 + Math.min(s.reps, 15) / 30);
                if (e1rm > exBest) exBest = e1rm;
              }
            }
            if (exBest > 0) {
              muscularE1rmPressurePoints += clamp(exBest / pb, 0.4, 1.05);
              muscularE1rmSamples += 1;
            }
          }
        }
      }
    }

    // 2. Watch Activities (Intervals.icu) & legacy cardio fallback
    if (entry?.watchActivities && entry.watchActivities.length > 0) {
      for (const act of entry.watchActivities) {
        const mins = isFinitePositive(act.moving_time) ? act.moving_time / 60 : 0;
        const elev = isFinitePositive(act.total_elevation_gain)
          ? act.total_elevation_gain
          : 0;
        const distM = isFinitePositive(act.distance) ? act.distance : 0;
        const avgHr =
          typeof act.average_heartrate === 'number' &&
          Number.isFinite(act.average_heartrate) &&
          act.average_heartrate >= 60
            ? act.average_heartrate
            : null;
        const maxHr =
          typeof act.max_heartrate === 'number' &&
          Number.isFinite(act.max_heartrate) &&
          act.max_heartrate >= 80
            ? act.max_heartrate
            : null;
        const typeLower = (act.type ?? '').trim().toLowerCase();
        const paceSecPerKm =
          distM >= 500 && mins > 0 ? (mins * 60) / (distM / 1000) : null;

        const isHighIntensityCardio =
          (avgHr !== null && avgHr >= 149) ||
          (paceSecPerKm !== null &&
            typeLower.includes('run') &&
            paceSecPerKm <= 330);

        if (isHighIntensityCardio) {
          highAerobicLoad28d += mins * 1.4 + elev * 0.055;
          if (maxHr !== null && maxHr >= 176) {
            anaerobicLoad28d += mins * 0.22;
          }
        } else {
          // Low aerobic: hikes, easy runs, Z1/Z2 walks & steady rides
          const lowMult = typeLower === 'walk' ? 0.55 : 0.9;
          lowAerobicLoad28d += mins * lowMult + elev * 0.045;
        }

        if (isIn7d) {
          cardioMinutes7d += mins;
          cardioElevation7dM += elev;
          if (avgHr !== null) cardioHrSamples7d.push(avgHr);
          // HR-weighted TRIMP-like cardiovascular stress score
          const hrZoneFactor =
            avgHr !== null
              ? avgHr >= 165
                ? 1.9
                : avgHr >= 150
                  ? 1.45
                  : avgHr >= 135
                    ? 1.05
                    : 0.72
              : isHighIntensityCardio
                ? 1.35
                : 0.8;
          cardioTrimpPoints7d += mins * hrZoneFactor + elev * 0.04;
        }
      }
    } else if (entry && isFinitePositive(entry.cardioDurationMinutes)) {
      const mins = entry.cardioDurationMinutes;
      const elev = isFinitePositive(entry.cardioElevationGainM)
        ? entry.cardioElevationGainM
        : 0;
      lowAerobicLoad28d += mins * 0.65 + elev * 0.04;
      highAerobicLoad28d += mins * 0.35;
      if (isIn7d) {
        cardioMinutes7d += mins;
        cardioElevation7dM += elev;
        cardioTrimpPoints7d += mins * 0.95 + elev * 0.035;
      }
    }
  }

  const lowPts = Math.round(lowAerobicLoad28d);
  const highPts = Math.round(highAerobicLoad28d);
  const anaPts = Math.round(anaerobicLoad28d);
  const totalLoad28d = lowPts + highPts + anaPts;
  const hasLoadData = totalLoad28d > 0;

  const lowShare = hasLoadData ? Math.round((lowPts / totalLoad28d) * 100) : 0;
  const highShare = hasLoadData ? Math.round((highPts / totalLoad28d) * 100) : 0;
  const anaShare = hasLoadData
    ? Math.max(0, 100 - lowShare - highShare)
    : 0;

  const lowStatus = classifyLoadZoneStatus(lowShare, 30, 50, hasLoadData);
  const highStatus = classifyLoadZoneStatus(highShare, 20, 40, hasLoadData);
  const anaStatus = classifyLoadZoneStatus(anaShare, 20, 40, hasLoadData);

  const zones: TrainingLoadZoneItem[] = [
    {
      id: 'low_aerobic',
      label: 'Нискоаеробно',
      subtitle: 'Планински преходи, леко кардио (Z1–Z2)',
      loadPoints: lowPts,
      sharePct: lowShare,
      targetMinPct: 30,
      targetMaxPct: 50,
      status: lowStatus.status,
      statusLabel: lowStatus.statusLabel,
      colorHex: '#38BDF8',
    },
    {
      id: 'high_aerobic',
      label: 'Високоаеробно',
      subtitle: 'Бокс, чувал, темпово кардио (Z3–Z4)',
      loadPoints: highPts,
      sharePct: highShare,
      targetMinPct: 20,
      targetMaxPct: 40,
      status: highStatus.status,
      statusLabel: highStatus.statusLabel,
      colorHex: '#F59E0B',
    },
    {
      id: 'anaerobic',
      label: 'Анаеробно',
      subtitle: 'Тежка щанга (Hevy) и експлозивност',
      loadPoints: anaPts,
      sharePct: anaShare,
      targetMinPct: 20,
      targetMaxPct: 40,
      status: anaStatus.status,
      statusLabel: anaStatus.statusLabel,
      colorHex: '#A855F7',
    },
  ];

  // Build concise load focus headline & advice
  let loadFocusHeadline = 'Балансиран 28-дневен тренировъчен фокус';
  let loadFocusAdvice =
    'И трите енергийни системи (аеробна база, боксов праг и анаеробна сила) са в целевите си рамки.';

  if (!hasLoadData) {
    loadFocusHeadline = 'Недостатъчно данни за последните 28 дни';
    loadFocusAdvice =
      'Импортирай Hevy тренировки и синхронизирай активности от часовника, за да се разпредели натоварването по 3-те зони.';
  } else {
    const shortages = zones.filter((z) => z.status === 'shortage');
    const excesses = zones.filter((z) => z.status === 'excess');
    if (shortages.length === 0 && excesses.length === 0) {
      loadFocusHeadline = 'Оптимален хибриден баланс (3/3 зони в цел)';
      loadFocusAdvice =
        'Поддържаш отлично съотношение между планинска/аеробна база, боксова интензивност и тежки силови серии.';
    } else if (shortages.some((z) => z.id === 'low_aerobic')) {
      loadFocusHeadline = 'Недостиг на Нискоаеробна база';
      loadFocusAdvice =
        'Добави 1–2 по-дълги леки сесии (планински преход или Zone 2 бягане 45–60 мин), за да ускориш възстановяването между рундовете и сериите.';
    } else if (shortages.some((z) => z.id === 'high_aerobic')) {
      loadFocusHeadline = 'Недостиг на Високоаеробен стимул';
      loadFocusAdvice =
        'Включи 1–2 боксови тренировки на чувал или интервално бягане, за да вдигнеш VO2max и лактатния праг.';
    } else if (shortages.some((z) => z.id === 'anaerobic')) {
      loadFocusHeadline = 'Недостиг на Анаеробна сила';
      loadFocusAdvice =
        'Увеличи тежките базови серии в Hevy (4–8 повт. при RPE 8+), за да поддържаш максималната сила и експлозивност.';
    } else if (excesses.length > 0) {
      const top = excesses[0];
      loadFocusHeadline = `Доминира зона „${top.label}“ (${top.sharePct}%)`;
      loadFocusAdvice =
        'Натоварването е концентрирано в една система — пренасочи част от седмичния обем към другите две зони за по-добър хибриден прогрес.';
    }
  }

  // Dual Stress Meter (0–100) for last 7 completed days
  // Muscular Stress: working sets (target heavy week ~75-95 sets -> 80 pts) + tonnage + e1RM proximity
  const avgE1rmProximity =
    muscularE1rmSamples > 0
      ? muscularE1rmPressurePoints / muscularE1rmSamples
      : 0;
  const setsStress = clamp((muscularWorkingSets7d / 85) * 58, 0, 62);
  const tonnageStress = clamp((muscularTonnage7dKg / 32000) * 24, 0, 24);
  const intensityStress =
    muscularWorkingSets7d > 0
      ? clamp(
          avgE1rmProximity * 12 + Math.min(8, muscularHeavySets7d * 0.65),
          0,
          18,
        )
      : 0;
  const muscularScore = Math.round(
    clamp(setsStress + tonnageStress + intensityStress, 0, 100),
  );

  // Cardio Stress: TRIMP points (280-360 weekly TRIMP = high 75-90 score)
  const cardioScore = Math.round(clamp((cardioTrimpPoints7d / 340) * 88, 0, 100));
  const cardioAvgHr7d =
    cardioHrSamples7d.length > 0
      ? Math.round(safeMean(cardioHrSamples7d) ?? 0)
      : null;

  let divergenceType: DualStressReport['divergenceType'];
  let divergenceHeadline: string;
  let divergenceAdvice: string;

  if (muscularScore >= 65 && cardioScore <= 45) {
    divergenceType = 'muscular_high_cardio_fresh';
    divergenceHeadline = 'Мускулите са претоварени, сърцето е свежо';
    divergenceAdvice =
      'Перфектен момент за леко Zone 2 кардио, планинска разходка или боксова техника (бой със сянка) без тежки тежести.';
  } else if (cardioScore >= 65 && muscularScore <= 45) {
    divergenceType = 'cardio_high_muscular_fresh';
    divergenceHeadline = 'Сърцето е претоварено, мускулите са свежи';
    divergenceAdvice =
      'Фокусирай се върху чиста силова тренировка с по-дълги почивки (2.5–3 мин) и ограничи високопулсовото кардио за 24–48 ч.';
  } else if (muscularScore >= 70 && cardioScore >= 70) {
    divergenceType = 'both_high';
    divergenceHeadline = 'Висок двоен стрес (Мускули + Сърце)';
    divergenceAdvice =
      'И двете системи са близо до лимита. Намали обема с 25% или планирай ден за активно възстановяване и сън.';
  } else if (muscularScore < 25 && cardioScore < 25) {
    divergenceType = 'both_low';
    divergenceHeadline = 'Свеж и в двете системи';
    divergenceAdvice =
      'Ниско 7-дневно натоварване — имаш широк резерв за прогрес както в залата, така и в бокса/планината.';
  } else {
    divergenceType = 'balanced';
    divergenceHeadline = 'Балансиран мускулен и кардио стрес';
    divergenceAdvice =
      'Сърдечно-съдовата и опорно-двигателната система се натоварват пропорционално без опасен дисбаланс.';
  }

  return {
    loadWindowStart,
    loadWindowEnd: windowEnd,
    totalLoad28d,
    hasLoadData,
    zones,
    loadFocusHeadline,
    loadFocusAdvice,
    dualStress: {
      windowStartDate: stressWindowStart,
      windowEndDate: windowEnd,
      muscularScore,
      cardioScore,
      muscularLabel: getStressBandLabel(muscularScore),
      cardioLabel: getStressBandLabel(cardioScore),
      muscularWorkingSets7d,
      muscularTonnage7dKg: Math.round(muscularTonnage7dKg),
      muscularHeavySets7d,
      cardioMinutes7d: Math.round(cardioMinutes7d),
      cardioAvgHr7d,
      cardioElevation7dM: Math.round(cardioElevation7dM),
      divergenceType,
      divergenceHeadline,
      divergenceAdvice,
    },
  };
}

// ============================================================================
// MODULE 4: 🏔️ ENDURANCE & HILL SCORE (0–100 + Month-over-Month Trend)
// ============================================================================

export interface EnduranceHillPeriodStats {
  startDate: string;
  endDate: string;
  score: number; // 0-100
  aerobicVolumeScore: number; // 0-40
  hillClimbScore: number; // 0-30
  cardiacEfficiencyScore: number; // 0-30
  activitiesCount: number;
  aerobicMinutes: number;
  distanceKm: number;
  elevationGainM: number;
  avgEfficiencyFactor: number | null;
  avgVamMetersPerHour: number | null;
  hasData: boolean;
}

export interface EnduranceHillScoreReport {
  current30d: EnduranceHillPeriodStats;
  previous30d: EnduranceHillPeriodStats;
  score: number;
  trendDelta: number | null; // null if previous 30d had no data
  trendDirection: 'up' | 'down' | 'flat' | 'new';
  tierLabel: string;
  summaryText: string;
}

function evaluateEnduranceHillWindow(
  activities: EnrichedWatchActivity[],
  startDate: string,
  endDate: string,
): EnduranceHillPeriodStats {
  const inWindow = activities.filter(
    (a) => a.date >= startDate && a.date <= endDate,
  );

  if (inWindow.length === 0) {
    return {
      startDate,
      endDate,
      score: 0,
      aerobicVolumeScore: 0,
      hillClimbScore: 0,
      cardiacEfficiencyScore: 0,
      activitiesCount: 0,
      aerobicMinutes: 0,
      distanceKm: 0,
      elevationGainM: 0,
      avgEfficiencyFactor: null,
      avgVamMetersPerHour: null,
      hasData: false,
    };
  }

  let aerobicMinutes = 0;
  let distanceKm = 0;
  let elevationGainM = 0;
  const efWeightedPairs: { ef: number; weight: number }[] = [];
  const vamValues: number[] = [];

  for (const act of inWindow) {
    const mins = isFinitePositive(act.movingTimeMin) ? act.movingTimeMin : 0;
    const dist = isFinitePositive(act.distanceKm) ? act.distanceKm : 0;
    const elev = isFinitePositive(act.elevationGainM) ? act.elevationGainM : 0;

    aerobicMinutes += mins;
    distanceKm += dist;
    elevationGainM += elev;

    const ef =
      act.efficiencyFactor ??
      computeCardiacEfficiencyFactor({
        distanceMeters: act.distanceMeters,
        elevationGainM: elev,
        movingTimeSec: act.movingTimeSec,
        averageHeartrate: act.averageHeartrate,
        type: act.type,
      });

    if (ef !== null && Number.isFinite(ef) && ef > 0) {
      efWeightedPairs.push({ ef, weight: Math.max(10, mins) });
    }

    const vam =
      act.vamMetersPerHour ?? computeActivityVam(elev, act.movingTimeSec);
    if (vam !== null && Number.isFinite(vam) && vam > 0) {
      vamValues.push(vam);
    }
  }

  // 1. Aerobic volume (0–40 pts): combines duration (600 min/30d ≈ strong 32 pts, 900+ min = 40) + distance
  const durationPts = clamp((aerobicMinutes / 780) * 32, 0, 32);
  const distancePts = clamp((distanceKm / 110) * 8, 0, 8);
  const aerobicVolumeScore = Math.round(clamp(durationPts + distancePts, 0, 40));

  // 2. Hill climb elevation gain (0–30 pts): 3,500m/30d ≈ strong 26 pts, 4,500m+ = 30 pts
  const elevPts = clamp((elevationGainM / 4200) * 26, 0, 26);
  const avgVam =
    vamValues.length > 0 ? Math.round(safeMean(vamValues) ?? 0) : null;
  const vamBonus =
    avgVam !== null ? clamp(((avgVam - 250) / 550) * 4, 0, 4) : 0;
  const hillClimbScore = Math.round(clamp(elevPts + vamBonus, 0, 30));

  // 3. Cardiac efficiency (0–30 pts): weighted EF (pace + climb per heartbeat)
  let avgEfficiencyFactor: number | null = null;
  if (efWeightedPairs.length > 0) {
    const totalW = efWeightedPairs.reduce((acc, p) => acc + p.weight, 0);
    if (totalW > 0) {
      avgEfficiencyFactor = round1(
        efWeightedPairs.reduce((acc, p) => acc + p.ef * p.weight, 0) / totalW,
      );
    }
  }

  let cardiacEfficiencyScore = 0;
  if (avgEfficiencyFactor !== null) {
    // EF typically ranges ~45 (easy walk) to ~150+ (strong mountain runner)
    cardiacEfficiencyScore = Math.round(
      clamp(((avgEfficiencyFactor - 35) / 105) * 30, 4, 30),
    );
  } else if (aerobicMinutes > 0) {
    // Graceful fallback when watch activities lack HR: estimate conservative efficiency from volume/VAM
    cardiacEfficiencyScore = Math.round(
      clamp(8 + (avgVam !== null ? Math.min(10, avgVam / 70) : 4), 6, 18),
    );
  }

  const score = Math.round(
    clamp(aerobicVolumeScore + hillClimbScore + cardiacEfficiencyScore, 0, 100),
  );

  return {
    startDate,
    endDate,
    score,
    aerobicVolumeScore,
    hillClimbScore,
    cardiacEfficiencyScore,
    activitiesCount: inWindow.length,
    aerobicMinutes: Math.round(aerobicMinutes),
    distanceKm: round1(distanceKm),
    elevationGainM: Math.round(elevationGainM),
    avgEfficiencyFactor,
    avgVamMetersPerHour: avgVam,
    hasData: true,
  };
}

export function computeEnduranceAndHillScore(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): EnduranceHillScoreReport {
  const { dailyLogs, todayKey } = params;
  const currentEnd = shiftDateKey(todayKey, -1); // Completed days up to yesterday
  const currentStart = shiftDateKey(currentEnd, -29); // 30 days
  const prevEnd = shiftDateKey(currentStart, -1);
  const prevStart = shiftDateKey(prevEnd, -29); // Previous 30 days

  const allActivities = extractAllEnrichedWatchActivities(dailyLogs);

  const current30d = evaluateEnduranceHillWindow(
    allActivities,
    currentStart,
    currentEnd,
  );
  const previous30d = evaluateEnduranceHillWindow(
    allActivities,
    prevStart,
    prevEnd,
  );

  const score = current30d.score;
  let trendDelta: number | null = null;
  let trendDirection: EnduranceHillScoreReport['trendDirection'] = 'new';

  if (previous30d.hasData) {
    trendDelta = current30d.score - previous30d.score;
    if (trendDelta > 0) trendDirection = 'up';
    else if (trendDelta < 0) trendDirection = 'down';
    else trendDirection = 'flat';
  }

  let tierLabel = 'Без кардио записи';
  let summaryText =
    'Синхронизирай планински преходи или бягания от часовника (Intervals.icu), за да се изчисли 30-дневният ти индекс.';

  if (current30d.hasData) {
    if (score >= 82) {
      tierLabel = 'Елитна планинска форма';
      summaryText = `Силен 30-дневен обем (${current30d.aerobicMinutes} мин, +${current30d.elevationGainM} м D+) и висока сърдечна ефективност до ${formatBgNumericDate(currentEnd)}.`;
    } else if (score >= 62) {
      tierLabel = 'Висока издръжливост';
      summaryText = `Стабилна аеробна и планинска база (${current30d.distanceKm} км · +${current30d.elevationGainM} м D+). Добави още изкачвания за пробив над 80 т.`;
    } else if (score >= 38) {
      tierLabel = 'Развиваща се база';
      summaryText = `Натрупани ${current30d.activitiesCount} активности (${current30d.aerobicMinutes} мин). Постепенното увеличаване на денивелацията ще вдигне рейтинга.`;
    } else {
      tierLabel = 'Начално ниво';
      summaryText = `Лек аеробен обем за последните 30 дни (${current30d.aerobicMinutes} мин). 2–3 редовни кардио/планински сесии седмично ще ускорят индекса.`;
    }
  }

  return {
    current30d,
    previous30d,
    score,
    trendDelta,
    trendDirection,
    tierLabel,
    summaryText,
  };
}
