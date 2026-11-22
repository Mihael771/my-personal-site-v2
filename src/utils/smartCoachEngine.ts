import type {
  CoachSubPriority,
  CustomExerciseMappings,
  DailyBiometricLog,
  HevySet,
  HevyWorkout,
  TodayScenarioId,
  TrainingGoalPhase,
  UserProfile,
} from '../types/fitness';
import { computeAcwrReport } from './analysisPrep';
import { computeDetailedWeeklyEffectiveVolume } from './exerciseMuscleEngine';
import {
  diffCalendarDays,
  isValidDateKey,
  shiftDateKey,
} from './fitnessMath';
import { classifyHabitPolarity } from './habitBodyImpact';
import { calculateEpley1RM } from './hevyProgress';
import {
  analyzeRelativeStrengthAndBoxing,
  isBoxingWorkout,
} from './relativeStrengthAndBiorhythm';

// ============================================================================
// Shared helpers
// ============================================================================

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function avg(arr: number[]): number | null {
  if (arr.length === 0) return null;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

function resolveAnchorDate(
  dailyLogs: DailyBiometricLog[],
  hevyWorkouts: HevyWorkout[],
  todayKey: string,
): string {
  const dates: string[] = [];
  for (const d of dailyLogs) {
    if (isValidDateKey(d.date)) dates.push(d.date);
  }
  for (const w of hevyWorkouts) {
    if (isValidDateKey(w.date)) dates.push(w.date);
  }
  if (dates.length === 0) return todayKey;
  dates.sort();
  const latest = dates[dates.length - 1];
  return Math.abs(diffCalendarDays(latest, todayKey)) > 14 ? latest : todayKey;
}

function getLatestWeightKg(
  dailyLogs: DailyBiometricLog[],
  profile: UserProfile,
): number | null {
  const sorted = [...dailyLogs]
    .filter(
      (d) =>
        isValidDateKey(d.date) &&
        typeof d.weightKg === 'number' &&
        Number.isFinite(d.weightKg) &&
        d.weightKg >= 30,
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length > 0) return sorted[0].weightKg as number;
  if (
    typeof profile.weightKg === 'number' &&
    Number.isFinite(profile.weightKg) &&
    profile.weightKg >= 30
  ) {
    return profile.weightKg;
  }
  return null;
}

/**
 * Estimates workout duration in minutes from Hevy startTime & endTime,
 * falling back to set count when endTime is missing.
 */
export function estimateWorkoutDurationMinutes(workout: HevyWorkout): number {
  if (workout.startTime && workout.endTime) {
    const startMs = Date.parse(workout.startTime);
    const endMs = Date.parse(workout.endTime);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
      const mins = Math.round((endMs - startMs) / 60_000);
      if (mins >= 10 && mins <= 240) return mins;
    }
  }
  // Check if sets have explicit durationSeconds
  let sumDurationSec = 0;
  for (const ex of workout.exercises) {
    for (const s of ex.sets) {
      if (typeof s.durationSeconds === 'number' && s.durationSeconds > 0) {
        sumDurationSec += s.durationSeconds;
      }
    }
  }
  if (sumDurationSec >= 600) {
    return clamp(Math.round(sumDurationSec / 60), 15, 180);
  }
  // Fallback based on rounds/sets
  if (workout.totalSets > 0) {
    return clamp(Math.round(workout.totalSets * 5), 25, 90);
  }
  return 50;
}

/**
 * Automatic duration-based boxing push-set equivalent (4 to 8 sets per boxing session):
 * <=35 min -> 4, 36-50 min -> 5, 51-65 min -> 6, 66-80 min -> 7, >80 min -> 8.
 */
export function computeBoxingEquivalentPushSets(durationMinutes: number): number {
  if (durationMinutes <= 35) return 4;
  if (durationMinutes <= 50) return 5;
  if (durationMinutes <= 65) return 6;
  if (durationMinutes <= 80) return 7;
  return 8;
}

// ============================================================================
// 1. Boxing Sessions Summary (for Analytics 3.1)
// ============================================================================

export interface BoxingSessionRecord {
  id: string;
  date: string;
  title: string;
  durationMinutes: number;
  equivalentPushSets: number;
  watchActiveCalories: number | null;
  watchRestingHr: number | null;
  nextMorningRhrDelta: number | null;
}

export interface BoxingSessionsSummary {
  sessionsCount30d: number;
  totalMinutes30d: number;
  avgDurationMinutes: number | null;
  avgActiveCaloriesOnBoxingDays: number | null;
  avgRestingHrOnBoxingDays: number | null;
  recentSessions: BoxingSessionRecord[];
}

export function analyzeBoxingSessionsSummary(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): BoxingSessionsSummary {
  const { hevyWorkouts, dailyLogs, todayKey } = params;
  const anchorDate = resolveAnchorDate(dailyLogs, hevyWorkouts, todayKey);
  const start30d = shiftDateKey(anchorDate, -29);

  const logsByDate = new Map<string, DailyBiometricLog>();
  const rhrAll: number[] = [];
  for (const log of dailyLogs) {
    if (!isValidDateKey(log.date)) continue;
    logsByDate.set(log.date, log);
    if (typeof log.restingHr === 'number' && Number.isFinite(log.restingHr)) {
      rhrAll.push(log.restingHr);
    }
  }
  const avgBaselineRhr = avg(rhrAll);

  const boxingWorkouts = [...hevyWorkouts]
    .filter((w) => isValidDateKey(w.date) && isBoxingWorkout(w))
    .sort((a, b) => b.date.localeCompare(a.date));

  const records: BoxingSessionRecord[] = boxingWorkouts.map((w) => {
    const durationMinutes = estimateWorkoutDurationMinutes(w);
    const sameDayLog = logsByDate.get(w.date);
    const nextDayLog = logsByDate.get(shiftDateKey(w.date, 1));
    const nextMorningRhrDelta =
      nextDayLog?.restingHr !== undefined && avgBaselineRhr !== null
        ? round1(nextDayLog.restingHr - avgBaselineRhr)
        : null;

    return {
      id: w.id,
      date: w.date,
      title: w.title,
      durationMinutes,
      equivalentPushSets: computeBoxingEquivalentPushSets(durationMinutes),
      watchActiveCalories:
        typeof sameDayLog?.activeCalories === 'number'
          ? Math.round(sameDayLog.activeCalories)
          : null,
      watchRestingHr:
        typeof sameDayLog?.restingHr === 'number'
          ? Math.round(sameDayLog.restingHr)
          : null,
      nextMorningRhrDelta,
    };
  });

  const in30d = records.filter((r) => r.date >= start30d && r.date <= anchorDate);
  const durations = records.map((r) => r.durationMinutes);
  const activeCals = records
    .map((r) => r.watchActiveCalories)
    .filter((v): v is number => v !== null);
  const rhrs = records
    .map((r) => r.watchRestingHr)
    .filter((v): v is number => v !== null);

  const avgDur = avg(durations);
  const avgCal = avg(activeCals);
  const avgHr = avg(rhrs);

  return {
    sessionsCount30d: in30d.length,
    totalMinutes30d: in30d.reduce((sum, r) => sum + r.durationMinutes, 0),
    avgDurationMinutes: avgDur !== null ? Math.round(avgDur) : null,
    avgActiveCaloriesOnBoxingDays: avgCal !== null ? Math.round(avgCal) : null,
    avgRestingHrOnBoxingDays: avgHr !== null ? round1(avgHr) : null,
    recentSessions: records.slice(0, 8),
  };
}

// ============================================================================
// 2. Boxing + Strength Push/Pull Shoulder Protection
// ============================================================================

export interface BoxingStrengthBalanceReport {
  windowStart: string;
  windowEnd: string;
  strengthPushSets: number;
  boxingSessionsCount: number;
  boxingPushEquivalentSets: number;
  totalPushSets: number;
  totalPullSets: number;
  pushOverPullPct: number | null;
  isImbalanced: boolean; // true when push exceeds pull by > 30%
  statusHeadline: string;
  recommendation: string;
  priorityPullExercises: string[];
}

export function analyzeBoxingStrengthBalance(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
}): BoxingStrengthBalanceReport {
  const { hevyWorkouts, dailyLogs, todayKey, customExerciseMappings } = params;
  const anchorDate = resolveAnchorDate(dailyLogs, hevyWorkouts, todayKey);
  const windowStart = shiftDateKey(anchorDate, -6);

  const strengthWorkouts = hevyWorkouts.filter((w) => !isBoxingWorkout(w));
  const boxingWorkouts7d = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      w.date >= windowStart &&
      w.date <= anchorDate &&
      isBoxingWorkout(w),
  );

  const detailedVol = computeDetailedWeeklyEffectiveVolume({
    hevyWorkouts: strengthWorkouts,
    startDate: windowStart,
    endDate: anchorDate,
    customExerciseMappings,
  });

  const PUSH_IDS = new Set(['chest', 'front_delts', 'triceps']);
  const PULL_IDS = new Set(['lats', 'traps_upper_back', 'rear_delts', 'biceps']);

  let strengthPushSets = 0;
  let totalPullSets = 0;

  for (const item of detailedVol) {
    if (PUSH_IDS.has(item.id)) strengthPushSets += item.effectiveSets;
    if (PULL_IDS.has(item.id)) totalPullSets += item.effectiveSets;
  }

  let boxingPushEquivalentSets = 0;
  for (const bw of boxingWorkouts7d) {
    const dur = estimateWorkoutDurationMinutes(bw);
    boxingPushEquivalentSets += computeBoxingEquivalentPushSets(dur);
  }

  strengthPushSets = round1(strengthPushSets);
  totalPullSets = round1(totalPullSets);
  const totalPushSets = round1(strengthPushSets + boxingPushEquivalentSets);

  let pushOverPullPct: number | null = null;
  if (totalPullSets > 0) {
    pushOverPullPct = round1(((totalPushSets - totalPullSets) / totalPullSets) * 100);
  } else if (totalPushSets > 0) {
    pushOverPullPct = 100;
  }

  const isImbalanced =
    totalPushSets >= 6 &&
    ((pushOverPullPct !== null && pushOverPullPct > 30) ||
      (totalPullSets === 0 && totalPushSets >= 6));

  const priorityPullExercises = [
    'Лицево дърпане (Face Pull) — 3 × 15–20 (задни рамене и ротатори)',
    'Гребане с щанга или дъмбел (Barbell / Dumbbell Row) — 4 × 8–10',
    'Набирания с контролирана пауза (Pull-Up / Chin-Up) — 3–4 × 6–10',
  ];

  let statusHeadline = 'Балансирано съотношение Бутащи / Дърпащи';
  let recommendation =
    'Натоварването между бутащи (+ бокс) и дърпащи мускули е в здравословна зона. Поддържай поне 1:1 дърпащи серии.';

  if (totalPushSets === 0 && totalPullSets === 0) {
    statusHeadline = 'Няма записани серии за последните 7 дни';
    recommendation =
      'Импортирай силовите и боксовите си тренировки от Hevy, за да следим автоматично защитата на раменете.';
  } else if (isImbalanced) {
    statusHeadline = `Дисбаланс: Бутащите (+ бокс) превишават дърпащите с +${Math.round(
      pushOverPullPct ?? 100,
    )}%`;
    recommendation =
      'Предните рамене и гърдите поемат прекален дял спрямо гърба и задните рамене. Днешният план автоматично приоритизира гребане, набирания и лицево дърпане (Face Pull).';
  } else if (pushOverPullPct !== null && pushOverPullPct > 15) {
    statusHeadline = `Лек превес на бутащите (+${Math.round(pushOverPullPct)}%)`;
    recommendation =
      'Добави 2–3 допълнителни серии за задни рамене (Face Pull / Reverse Fly) след тренировката, за да пазиш раменната става.';
  }

  return {
    windowStart,
    windowEnd: anchorDate,
    strengthPushSets,
    boxingSessionsCount: boxingWorkouts7d.length,
    boxingPushEquivalentSets,
    totalPushSets,
    totalPullSets,
    pushOverPullPct,
    isImbalanced,
    statusHeadline,
    recommendation,
    priorityPullExercises,
  };
}

// ============================================================================
// 3. Plateau Buster (Last 5 sessions per frequent non-boxing exercise)
// ============================================================================

export interface PlateauBusterItem {
  exerciseTitle: string;
  sessionsAnalyzed: number;
  last3Dates: string[];
  last3E1RMs: number[];
  last3MaxWeights: number[];
  stalledE1RM: number;
  stalledMaxWeightKg: number;
  probableCauseLabel: string;
  probableCauseDetail: string;
  breakthroughAction: string;
}

export function detectStrengthPlateaus(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  todayKey: string;
}): PlateauBusterItem[] {
  const { hevyWorkouts, dailyLogs, profile, todayKey } = params;
  const anchorDate = resolveAnchorDate(dailyLogs, hevyWorkouts, todayKey);
  const weightKg = getLatestWeightKg(dailyLogs, profile) ?? 80;
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, anchorDate);

  // Recent 7-day biometrics for root-cause attribution
  const start7d = shiftDateKey(anchorDate, -6);
  const recentLogs = dailyLogs.filter(
    (d) => isValidDateKey(d.date) && d.date >= start7d && d.date <= anchorDate,
  );
  const avgSleep7d = avg(
    recentLogs
      .map((d) => d.sleepHours)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );
  const avgProteinPerKg7d = avg(
    recentLogs
      .map((d) => d.proteinGrams)
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .map((g) => g / weightKg),
  );
  const strengthWorkouts14d = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      !isBoxingWorkout(w) &&
      w.date >= shiftDateKey(anchorDate, -13) &&
      w.date <= anchorDate,
  );
  const totalSets7d = strengthWorkouts14d
    .filter((w) => w.date >= start7d)
    .reduce((sum, w) => sum + w.totalSets, 0);

  // Group non-boxing workouts chronologically per exercise
  const chrono = [...hevyWorkouts]
    .filter((w) => isValidDateKey(w.date) && !isBoxingWorkout(w))
    .sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
    });

  const byExercise = new Map<
    string,
    {
      displayTitle: string;
      sessions: Array<{ date: string; e1rm: number; maxWeight: number; setsCount: number }>;
    }
  >();

  for (const w of chrono) {
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const working = getWorkingSets(ex.sets);
      let best1RM = 0;
      let maxW = 0;
      for (const s of working) {
        const wt = s.weightKg ?? 0;
        const reps = Math.max(0, Math.round(s.reps ?? 0));
        if (reps < 1) continue;
        if (wt > maxW) maxW = wt;
        const load = wt > 0 ? wt : weightKg;
        const est = calculateEpley1RM(load, reps);
        if (est > best1RM) best1RM = est;
      }
      if (best1RM <= 0) continue;

      const entry = byExercise.get(key) ?? { displayTitle: ex.title, sessions: [] };
      entry.displayTitle = ex.title;
      entry.sessions.push({
        date: w.date,
        e1rm: round1(best1RM),
        maxWeight: round1(maxW),
        setsCount: working.length,
      });
      byExercise.set(key, entry);
    }
  }

  const plateaus: PlateauBusterItem[] = [];

  for (const entry of byExercise.values()) {
    // Frequently performed exercises (>= 3 sessions; inspect last 5)
    if (entry.sessions.length < 3) continue;
    const last5 = entry.sessions.slice(-5);
    const last3 = last5.slice(-3);

    // Check if the last 3 sessions are within the last 75 days so stale historical lifts aren't flagged
    const newestDate = last3[2].date;
    if (Math.abs(diffCalendarDays(newestDate, anchorDate)) > 75) continue;

    const e1rm1 = last3[0].e1rm;
    const e1rm2 = last3[1].e1rm;
    const e1rm3 = last3[2].e1rm;
    const w1 = last3[0].maxWeight;
    const w2 = last3[1].maxWeight;
    const w3 = last3[2].maxWeight;

    // Stalled if neither e1RM nor max weight progressed across the last 3 sessions
    const e1rmMovedUp = e1rm3 > e1rm1 + 0.5 || e1rm2 > e1rm1 + 0.5;
    const weightMovedUp = w3 > w1 + 0.25 || w2 > w1 + 0.25;

    if (e1rmMovedUp || weightMovedUp) continue;

    // Attribute most probable cause from live telemetry
    let probableCauseLabel = 'Адаптация към текущия стимул';
    let probableCauseDetail =
      'Повторенията и тежестта са идентични в 3 поредни сесии без нов стимул.';
    let breakthroughAction =
      w3 > 0
        ? `Намали тежестта с -10% за 1 сесия с 2-секундна пауза, после атакувай +1.25–2.5 kg или смени диапазона на 5×5 / 3×6.`
        : 'Добави бавно темпо (3 сек. спускане), 2-секундна пауза в най-трудната точка или +2.5 kg колан/раница.';

    if (avgSleep7d !== null && avgSleep7d < 6.5) {
      probableCauseLabel = 'Хронично недоспиване (< 6.5 ч.)';
      probableCauseDetail = `Средният ти сън за 7 дни е ${avgSleep7d.toFixed(1)} ч., което спира нервно-мускулната адаптация.`;
      breakthroughAction =
        'Запази тежестта, намали сериите на това движение с 1 серия и приоритетно вдигни съня над 7.5 ч. за 3 нощи.';
    } else if (acwrReport.acwr !== null && acwrReport.acwr > 1.3) {
      probableCauseLabel = `Висок общ стрес (ACWR ${acwrReport.acwr.toFixed(2)})`;
      probableCauseDetail =
        'Общото натоварване (сила + бокс/кардио) изпреварва възстановяването.';
      breakthroughAction =
        'Направи 1 лека разтоварваща сесия на 80% от тежестта (RPE 6.5), след което атакувай нов рекорд свеж.';
    } else if (avgProteinPerKg7d !== null && avgProteinPerKg7d < 1.65) {
      probableCauseLabel = `Нисък протеин (${avgProteinPerKg7d.toFixed(2)} g/kg)`;
      probableCauseDetail =
        'Протеинът е под прага за оптимално възстановяване на мускулните влакна.';
      breakthroughAction =
        'Увеличи протеина до ≥ 1.8 g/kg дневно и добави 30–50 г въглехидрати 90 мин. преди тренировката.';
    } else if (totalSets7d >= 85 || last3[2].setsCount >= 6) {
      probableCauseLabel = 'Прекален обем (натрупана локална умора)';
      probableCauseDetail = `Над ${totalSets7d} седмични серии натоварват възстановяването на това движение.`;
      breakthroughAction =
        'Свали работните серии на упражнението до 3 тежки серии (RPE 8.5) с 3 мин. почивка и гони +1 повторение.';
    }

    plateaus.push({
      exerciseTitle: entry.displayTitle,
      sessionsAnalyzed: last5.length,
      last3Dates: last3.map((s) => s.date),
      last3E1RMs: last3.map((s) => s.e1rm),
      last3MaxWeights: last3.map((s) => s.maxWeight),
      stalledE1RM: e1rm3,
      stalledMaxWeightKg: w3,
      probableCauseLabel,
      probableCauseDetail,
      breakthroughAction,
    });
  }

  // Sort by most frequently trained / highest load first, cap to top 5
  return plateaus
    .sort((a, b) => b.sessionsAnalyzed - a.sessionsAnalyzed || b.stalledE1RM - a.stalledE1RM)
    .slice(0, 5);
}

// ============================================================================
// 4. Multi-Factor Goal Evaluation (Part 2)
// ============================================================================

export interface MultiFactorGoalEvaluation {
  goal: TrainingGoalPhase;
  statusLabel: string;
  statusTone: 'positive' | 'caution' | 'alert' | 'neutral';
  headline: string;
  explanation: string;
  calorieAction: string;
  metrics: Array<{ label: string; value: string }>;
  recommendSmartRefeed: boolean;
}

export function evaluateMultiFactorGoal(params: {
  goal: TrainingGoalPhase;
  subPriorities: CoachSubPriority[];
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  todayKey: string;
}): MultiFactorGoalEvaluation {
  const { goal, subPriorities, hevyWorkouts, dailyLogs, profile, todayKey } = params;
  const anchorDate = resolveAnchorDate(dailyLogs, hevyWorkouts, todayKey);
  const weightKg = getLatestWeightKg(dailyLogs, profile);

  // 14-day weight windows: prev7 [anchor-13..anchor-7] vs recent7 [anchor-6..anchor]
  const recent7Start = shiftDateKey(anchorDate, -6);
  const prev7Start = shiftDateKey(anchorDate, -13);
  const prev7End = shiftDateKey(anchorDate, -7);

  const recent7Logs = dailyLogs.filter(
    (d) => isValidDateKey(d.date) && d.date >= recent7Start && d.date <= anchorDate,
  );
  const prev7Logs = dailyLogs.filter(
    (d) => isValidDateKey(d.date) && d.date >= prev7Start && d.date <= prev7End,
  );
  const logs30d = dailyLogs.filter(
    (d) =>
      isValidDateKey(d.date) &&
      d.date >= shiftDateKey(anchorDate, -29) &&
      d.date <= anchorDate,
  );

  const avgWeightRecent7 = avg(
    recent7Logs
      .map((d) => d.weightKg)
      .filter((v): v is number => typeof v === 'number' && v >= 30),
  );
  const avgWeightPrev7 = avg(
    prev7Logs
      .map((d) => d.weightKg)
      .filter((v): v is number => typeof v === 'number' && v >= 30),
  );
  const weightDelta14d =
    avgWeightRecent7 !== null && avgWeightPrev7 !== null
      ? round1(avgWeightRecent7 - avgWeightPrev7)
      : null;

  const avgProteinGPerKg =
    weightKg !== null
      ? avg(
          recent7Logs
            .map((d) => d.proteinGrams)
            .filter((v): v is number => typeof v === 'number' && v > 0)
            .map((g) => g / weightKg),
        )
      : null;

  const avgActiveCal7d = avg(
    recent7Logs
      .map((d) => d.activeCalories)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );

  // Strength / Volume progression over 14d vs prior 14d (non-boxing)
  const strengthWorkouts = hevyWorkouts.filter(
    (w) => isValidDateKey(w.date) && !isBoxingWorkout(w),
  );
  const recent14Strength = strengthWorkouts.filter(
    (w) => w.date >= prev7Start && w.date <= anchorDate,
  );
  const prior14Strength = strengthWorkouts.filter(
    (w) => w.date >= shiftDateKey(anchorDate, -27) && w.date < prev7Start,
  );
  const avgVolRecent = avg(
    recent14Strength.filter((w) => w.totalVolumeKg > 0).map((w) => w.totalVolumeKg),
  );
  const avgVolPrior = avg(
    prior14Strength.filter((w) => w.totalVolumeKg > 0).map((w) => w.totalVolumeKg),
  );
  const volumeTrendPct =
    avgVolRecent !== null && avgVolPrior !== null && avgVolPrior > 0
      ? round1(((avgVolRecent - avgVolPrior) / avgVolPrior) * 100)
      : null;

  // Relative strength & e1RM trend
  const relReport = analyzeRelativeStrengthAndBoxing({
    hevyWorkouts,
    dailyLogs,
    fallbackWeightKg: weightKg,
    todayKey: anchorDate,
    windowDays: 60,
  });
  const strengthRising =
    (volumeTrendPct !== null && volumeTrendPct >= 2.0) ||
    (relReport.compositeDeltaPct !== null && relReport.compositeDeltaPct >= 1.0);
  const strengthDropping =
    (volumeTrendPct !== null && volumeTrendPct <= -5.0) ||
    (relReport.compositeDeltaPct !== null && relReport.compositeDeltaPct <= -3.0);

  // RHR / HRV vs 30d baseline
  const baselineRhr = avg(
    logs30d
      .map((d) => d.restingHr)
      .filter((v): v is number => typeof v === 'number' && v >= 30),
  );
  const baselineHrv = avg(
    logs30d
      .map((d) => d.hrv)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );
  const recent3Logs = [...dailyLogs]
    .filter((d) => isValidDateKey(d.date) && d.date <= anchorDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const recent3Hrv = avg(
    recent3Logs
      .map((d) => d.hrv)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );
  const recent3Rhr = avg(
    recent3Logs
      .map((d) => d.restingHr)
      .filter((v): v is number => typeof v === 'number' && v >= 30),
  );
  const hrvDropPct3d =
    recent3Hrv !== null && baselineHrv !== null && baselineHrv > 0
      ? round1(((recent3Hrv - baselineHrv) / baselineHrv) * 100)
      : null;
  const rhrDelta3d =
    recent3Rhr !== null && baselineRhr !== null
      ? round1(recent3Rhr - baselineRhr)
      : null;

  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, anchorDate);
  const boxingSummary = analyzeBoxingSessionsSummary({
    hevyWorkouts,
    dailyLogs,
    todayKey: anchorDate,
  });

  // Check if recent 3-5 days had heavy boxing or leg session (water retention context)
  const recent3to5Start = shiftDateKey(anchorDate, -4);
  const hadRecentWaterRetentionTrigger = hevyWorkouts.some(
    (w) =>
      isValidDateKey(w.date) &&
      w.date >= recent3to5Start &&
      w.date <= anchorDate &&
      (isBoxingWorkout(w) ||
        w.exercises.some((e) => {
          const t = e.title.toLowerCase();
          return t.includes('squat') || t.includes('deadlift') || t.includes('клек') || t.includes('тяга');
        })),
  );

  const subPrioNote =
    subPriorities.length > 0
      ? ` Активни под-приоритети: ${subPriorities.length}.`
      : '';

  const metrics: Array<{ label: string; value: string }> = [
    {
      label: '14-дн. тренд тегло',
      value:
        weightDelta14d !== null
          ? `${weightDelta14d >= 0 ? '+' : ''}${weightDelta14d.toFixed(1)} kg`
          : '—',
    },
    {
      label: 'Тренд обем / сила',
      value:
        volumeTrendPct !== null
          ? `${volumeTrendPct >= 0 ? '+' : ''}${volumeTrendPct.toFixed(1)}%`
          : relReport.compositeDeltaPct !== null
            ? `${relReport.compositeDeltaPct >= 0 ? '+' : ''}${relReport.compositeDeltaPct.toFixed(1)}% BW`
            : '—',
    },
    {
      label: 'Протеин (7 д.)',
      value: avgProteinGPerKg !== null ? `${avgProteinGPerKg.toFixed(2)} g/kg` : '—',
    },
    {
      label: 'ACWR / HRV',
      value: `${acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : '—'} · ${
        hrvDropPct3d !== null
          ? `${hrvDropPct3d >= 0 ? '+' : ''}${hrvDropPct3d.toFixed(0)}%`
          : '—'
      }`,
    },
  ];

  // --- GOAL 1: HYPERTROPHY (Lean Bulk / Recomposition) ---
  if (goal === 'hypertrophy') {
    const weightStable = weightDelta14d !== null && Math.abs(weightDelta14d) <= 0.3;
    const proteinOk = avgProteinGPerKg === null || avgProteinGPerKg >= 1.8;

    if (weightStable && strengthRising) {
      return {
        goal,
        statusLabel: '✨ Успешна рекомпозиция',
        statusTone: 'positive',
        headline: 'Теглото е стабилно (±0.3 kg), а силата и обемът растат',
        explanation: `Тялото ти изгражда чиста мускулна сила без излишно натрупване на мазнини.${
          proteinOk
            ? ' Протеинът подкрепя анаболния процес.'
            : ` Вдигни протеина от ${avgProteinGPerKg?.toFixed(2)} до ≥ 1.8 g/kg.`
        }${subPrioNote}`,
        calorieAction:
          'Задръж текущите калории без излишно вдигане — рекомпозицията работи отлично.',
        metrics,
        recommendSmartRefeed: false,
      };
    }

    if (weightDelta14d !== null && weightDelta14d > 0.3 && !strengthDropping) {
      return {
        goal,
        statusLabel: '📈 Чисто качване в цел',
        statusTone: 'positive',
        headline: `Плавна прогресия (+${weightDelta14d.toFixed(1)} kg за 14 д.) със стабилна сила`,
        explanation: `Качването е подкрепено от тренировъчния обем.${
          avgActiveCal7d !== null
            ? ` Часовникът отчита средно ${Math.round(avgActiveCal7d)} активни kcal/ден.`
            : ''
        }`,
        calorieAction:
          weightDelta14d > 0.9
            ? 'Леко овладей излишъка (-100 kcal), за да остане качването чисто.'
            : 'Поддържай текущия лек излишък (+150–250 kcal) и протеин ≥ 1.8 g/kg.',
        metrics,
        recommendSmartRefeed: false,
      };
    }

    // Suggest +200-300 kcal ONLY if BOTH weight AND strength are flat or dropping
    if (
      (weightDelta14d === null || weightDelta14d <= 0.3) &&
      !strengthRising
    ) {
      const burnContext =
        avgActiveCal7d !== null || boxingSummary.sessionsCount30d > 0
          ? ` (отчитайки ${
              avgActiveCal7d !== null
                ? `~${Math.round(avgActiveCal7d)} активни kcal/ден от часовника`
                : 'разхода от часовника'
            }${
              boxingSummary.sessionsCount30d > 0
                ? ` и ${boxingSummary.sessionsCount30d} боксови сесии`
                : ''
            })`
          : '';
      return {
        goal,
        statusLabel: '🍽️ Нужен е лек калориен тласък',
        statusTone: 'caution',
        headline: 'И теглото, и силата стоят на място или спадат',
        explanation: `При липса на ръст едновременно в теглото и работния обем/e1RM${burnContext}, енергията не стига за хипертрофия.`,
        calorieAction:
          'Добави +200 до +300 kcal дневно (предимно от въглехидрати около тренировката) и дръж протеина ≥ 1.8 g/kg.',
        metrics,
        recommendSmartRefeed: false,
      };
    }

    return {
      goal,
      statusLabel: '💪 Активна хипертрофия',
      statusTone: 'neutral',
      headline: 'Събираме 14-дневна база за тегло, обем и протеин',
      explanation:
        'Продължи да записваш тегло, протеин (≥ 1.8 g/kg) и тренировки от Hevy за многофакторна оценка.',
      calorieAction: 'Дръж лек излишък (+150–250 kcal) в тренировъчни дни.',
      metrics,
      recommendSmartRefeed: false,
    };
  }

  // --- GOAL 2: MAINTENANCE (Athleticism & Performance) ---
  if (goal === 'maintenance') {
    const acwrOptimal =
      acwrReport.acwr !== null && acwrReport.acwr >= 0.85 && acwrReport.acwr <= 1.25;
    const weightInAthleticBand =
      weightDelta14d === null || Math.abs(weightDelta14d) <= 1.5;
    const cardioStressHigh =
      (rhrDelta3d !== null && rhrDelta3d >= 3.5) ||
      (hrvDropPct3d !== null && hrvDropPct3d <= -12);

    if (acwrOptimal && weightInAthleticBand && !cardioStressHigh) {
      return {
        goal,
        statusLabel: '⚖️ Оптимален атлетичен баланс',
        statusTone: 'positive',
        headline: `ACWR (${acwrReport.acwr?.toFixed(2)}) е в златната зона 0.85–1.25`,
        explanation: `Относителната сила (${
          relReport.compositeLatestRatio !== null
            ? `${relReport.compositeLatestRatio.toFixed(2)}x BW`
            : 'в процес на оценка'
        }) и сърдечно-съдовата адаптация са стабилни в естествения ±1.5 kg диапазон между зала, лостове и бокс.`,
        calorieAction:
          'Поддържай енергиен баланс: повече въглехидрати в дни с бокс/лостове и стабилен протеин ≥ 1.8 g/kg.',
        metrics,
        recommendSmartRefeed: false,
      };
    }

    return {
      goal,
      statusLabel: cardioStressHigh
        ? '⚠️ Повишен сърдечно-съдов стрес'
        : '⚖️ Атлетизъм и баланс на натоварването',
      statusTone: cardioStressHigh || (acwrReport.acwr !== null && acwrReport.acwr > 1.25) ? 'caution' : 'neutral',
      headline:
        acwrReport.acwr !== null && acwrReport.acwr > 1.25
          ? `ACWR е ${acwrReport.acwr.toFixed(2)} (над 1.25) — овладей общия обем`
          : cardioStressHigh
            ? 'RHR/HRV сигнализират нужда от по-добро възстановяване'
            : 'Фокус върху относителна сила (1RM/тегло) и ACWR 0.85–1.25',
      explanation:
        'В режим Поддържане допускаме ±1.5 kg естествени колебания, като приоритет са относителната сила, пулсът/HRV и балансът между зала, лостове и бокс.',
      calorieAction:
        cardioStressHigh
          ? 'Не влизай в дефицит днес — зареди с пълноценни въглехидрати и електролити.'
          : 'Балансирай калориите около TDEE според активните калории от часовника.',
      metrics,
      recommendSmartRefeed: false,
    };
  }

  // --- GOAL 3: FAT LOSS (Strength Retention + Smart Refeed) ---
  const hrvSharpDrop3d = hrvDropPct3d !== null && hrvDropPct3d <= -12;
  const needSmartRefeed = strengthDropping && hrvSharpDrop3d;

  if (needSmartRefeed) {
    return {
      goal,
      statusLabel: '🔋 Умен Refeed ден',
      statusTone: 'alert',
      headline: 'Рязък спад в силата и HRV за 3+ дни — време е за зареждане',
      explanation: `HRV е спаднал с ${hrvDropPct3d?.toFixed(0)}% спрямо 30-дневната база, а силата отстъпва. Сляпото рязане на калории ще коства мускулна маса и експлозивност.`,
      calorieAction:
        'Направи 1 Умен Refeed ден: поддържащи калории (TDEE) с +100–150 г чисти въглехидрати и протеин ≥ 1.8 g/kg.',
      metrics,
      recommendSmartRefeed: true,
    };
  }

  const weightFalling = weightDelta14d !== null && weightDelta14d <= -0.2;
  if (weightFalling && !strengthDropping) {
    return {
      goal,
      statusLabel: '🔥 Чисто изчистване',
      statusTone: 'positive',
      headline: `Теглото пада (${weightDelta14d?.toFixed(1)} kg / 14 д.), а силата е запазена`,
      explanation:
        '14-дневната пълзяща средна потвърждава стабилно изчистване на мазнини при запазен e1RM — идеалният сценарий за боксова категория и релеф.',
      calorieAction:
        'Запази умерения дефицит (-300 до -450 kcal) и протеин ≥ 1.8–2.0 g/kg без допълнително рязане.',
      metrics,
      recommendSmartRefeed: false,
    };
  }

  if (
    weightDelta14d !== null &&
    weightDelta14d > -0.2 &&
    hadRecentWaterRetentionTrigger
  ) {
    return {
      goal,
      statusLabel: '💧 Възможна водна задръжка (не режи храната)',
      statusTone: 'neutral',
      headline: 'Скорошен тежък бокс или тренировка за крака задържат вода (3–5 дни)',
      explanation:
        'Краткосрочният застой на кантара след тежко мускулно възпаление е нормален. Следим 14-дневната пълзяща средна и запазването на e1RM.',
      calorieAction:
        'Задръж текущия план още 4–5 дни, пий достатъчно вода и пази тежестите в Hevy.',
      metrics,
      recommendSmartRefeed: false,
    };
  }

  return {
    goal,
    statusLabel: '🔥 Контролирано изчистване',
    statusTone: strengthDropping ? 'caution' : 'neutral',
    headline: strengthDropping
      ? 'Внимание: лек спад в силата — пази протеина и съня'
      : 'Проследяваме 14-дневния тренд на теглото и e1RM',
    explanation:
      'Оценяваме свалянето на мазнини паралелно със запазването на силата и HRV, за да защитим мускулната маса.',
    calorieAction: strengthDropping
      ? 'Ограничи дефицита до -300 kcal и добави въглехидрати преди тренировка (или обмисли 1 Refeed ден).'
      : 'Цели умерен дефицит (-300 до -500 kcal) и ≥ 1.8 g/kg протеин.',
    metrics,
    recommendSmartRefeed: false,
  };
}

// ============================================================================
// 5. Multi-Factor Readiness, 5 Today Scenarios & Top 3 Guidance (Part 3)
// ============================================================================

export interface TodayScenarioMeta {
  id: TodayScenarioId;
  emoji: string;
  label: string;
  shortDesc: string;
}

export const TODAY_SCENARIO_OPTIONS: TodayScenarioMeta[] = [
  {
    id: 'standard',
    emoji: '🎯',
    label: 'Стандартен ден',
    shortDesc: 'Пълен план спрямо готовността и целта',
  },
  {
    id: 'express_35',
    emoji: '⏱️',
    label: 'Имам само 35 мин.',
    shortDesc: '3–4 най-ефективни базови упражнения / суперсерии',
  },
  {
    id: 'evening_boxing',
    emoji: '🥊',
    label: 'Вечерта съм на бокс',
    shortDesc: 'Намален обем за рамене, гърди и крака',
  },
  {
    id: 'pr_attack',
    emoji: '🔥',
    label: 'Атака на PR днес',
    shortDesc: 'Конкретна PR мишена от Hevy с тежест/повторения',
  },
  {
    id: 'light_fatigue',
    emoji: '🩹',
    label: 'Лека умора / Скованост',
    shortDesc: 'Мобилност, леко дърпане и защита на ставите',
  },
];

export interface PrTargetCandidate {
  exerciseTitle: string;
  lastDate: string;
  lastPerformanceText: string;
  targetText: string;
  rationale: string;
}

export interface DailyRecommendedExercise {
  title: string;
  setsReps: string;
  rpe: string;
  note: string;
}

export interface TopDailyGuidanceItem {
  category: 'Тренировка' | 'Хранене' | 'Възстановяване';
  title: string;
  detail: string;
}

export interface MultiFactorCoachDailyPlan {
  anchorDate: string;
  readinessScore: number; // 0-100
  readinessTier: 'progressive' | 'standard' | 'med';
  readinessTierLabel: string;
  prescriptionSummary: string;
  targetRpeText: string;
  has3DaySleepDeficit: boolean;
  avgSleep3d: number | null;
  lastNightSleepHours: number | null;
  rhrDeltaFrom30d: number | null;
  hrvPctFrom30d: number | null;
  acwr: number | null;
  yesterdayProteinGPerKg: number | null;
  yesterdayCalories: number | null;
  consecutiveHeavyDays: number;
  cleanDaysStreak: number;
  autoPrAttackEligible: boolean;
  prTargetCandidate: PrTargetCandidate | null;
  activeScenario: TodayScenarioId;
  scenarioHeadline: string;
  top3Guidance: [TopDailyGuidanceItem, TopDailyGuidanceItem, TopDailyGuidanceItem];
  recommendedExercises: DailyRecommendedExercise[];
}

function computeCleanDaysStreak(
  dailyLogs: DailyBiometricLog[],
  anchorDate: string,
): number {
  const byDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    if (isValidDateKey(log.date)) byDate.set(log.date, log);
  }
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = shiftDateKey(anchorDate, -i);
    const log = byDate.get(d);
    if (!log) {
      // Allow today to not be logged yet when checking streak from yesterday backwards
      if (i === 0) continue;
      break;
    }
    const hasHarmful = (log.completedHabits ?? []).some(
      (h) => classifyHabitPolarity(h) === 'harmful',
    );
    if (hasHarmful) break;
    streak += 1;
  }
  return streak;
}

function findClosestPrTargetCandidate(
  hevyWorkouts: HevyWorkout[],
  subPriorities: CoachSubPriority[],
): PrTargetCandidate | null {
  const strength = [...hevyWorkouts]
    .filter((w) => isValidDateKey(w.date) && !isBoxingWorkout(w))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (strength.length === 0) return null;

  const preferCalisthenics = subPriorities.includes('calisthenics_relative');
  const preferMaxStrength = subPriorities.includes('max_strength_1rm');

  const exerciseStats = new Map<
    string,
    {
      title: string;
      count: number;
      lastDate: string;
      lastBestWeight: number;
      lastBestReps: number;
      lastBest1RM: number;
      allTimeBest1RM: number;
    }
  >();

  for (const w of strength) {
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      let best1RM = 0;
      let bestW = 0;
      let bestR = 0;
      for (const s of getWorkingSets(ex.sets)) {
        const wt = s.weightKg ?? 0;
        const reps = Math.max(0, Math.round(s.reps ?? 0));
        if (reps < 1) continue;
        const est = wt > 0 ? calculateEpley1RM(wt, reps) : reps * 10;
        if (est > best1RM) {
          best1RM = est;
          bestW = wt;
          bestR = reps;
        }
      }
      if (best1RM <= 0) continue;

      const existing = exerciseStats.get(key);
      if (!existing) {
        exerciseStats.set(key, {
          title: ex.title,
          count: 1,
          lastDate: w.date,
          lastBestWeight: round1(bestW),
          lastBestReps: bestR,
          lastBest1RM: round1(best1RM),
          allTimeBest1RM: round1(best1RM),
        });
      } else {
        existing.count += 1;
        if (best1RM > existing.allTimeBest1RM) {
          existing.allTimeBest1RM = round1(best1RM);
        }
      }
    }
  }

  let bestCandidate: { score: number; item: PrTargetCandidate } | null = null;
  for (const stat of exerciseStats.values()) {
    if (stat.count < 2) continue;
    const ratioToPeak =
      stat.allTimeBest1RM > 0 ? stat.lastBest1RM / stat.allTimeBest1RM : 0;
    const lower = stat.title.toLowerCase();
    const isCalisthenics =
      lower.includes('pull') ||
      lower.includes('chin') ||
      lower.includes('dip') ||
      lower.includes('muscle') ||
      lower.includes('набира') ||
      lower.includes('кофичк');
    const isBarbellCompound =
      lower.includes('bench') ||
      lower.includes('squat') ||
      lower.includes('deadlift') ||
      lower.includes('overhead') ||
      lower.includes('лежанка') ||
      lower.includes('клек') ||
      lower.includes('тяга');

    let score = ratioToPeak * 100 + Math.min(20, stat.count * 2);
    if (preferCalisthenics && isCalisthenics) score += 18;
    if (preferMaxStrength && isBarbellCompound) score += 18;

    const isWeightPrReady = stat.lastBestWeight > 0 && stat.lastBestReps >= 6;
    const step = stat.lastBestWeight <= 25 ? 1.25 : 2.5;
    const targetText =
      stat.lastBestWeight > 0
        ? isWeightPrReady
          ? `${round1(stat.lastBestWeight + step)} kg × ${stat.lastBestReps} (+${step} kg)`
          : `${stat.lastBestWeight} kg × ${stat.lastBestReps + 1} (+1 повт.)`
        : `Собств. тегло × ${stat.lastBestReps + 1} (+1 повт.)`;

    const lastPerformanceText =
      stat.lastBestWeight > 0
        ? `${stat.lastBestWeight} kg × ${stat.lastBestReps}`
        : `Собств. тегло × ${stat.lastBestReps}`;

    const candidate: PrTargetCandidate = {
      exerciseTitle: stat.title,
      lastDate: stat.lastDate,
      lastPerformanceText,
      targetText,
      rationale: `Последната сесия е на ${Math.round(
        ratioToPeak * 100,
      )}% от рекорда ти — идеален момент за нов PR.`,
    };

    if (!bestCandidate || score > bestCandidate.score) {
      bestCandidate = { score, item: candidate };
    }
  }

  return bestCandidate?.item ?? null;
}

export function computeMultiFactorReadinessAndPlan(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  goal: TrainingGoalPhase;
  subPriorities: CoachSubPriority[];
  todayKey: string;
  scenarioOverride: TodayScenarioId | null;
  goalEvaluation: MultiFactorGoalEvaluation;
  boxingBalance: BoxingStrengthBalanceReport;
}): MultiFactorCoachDailyPlan {
  const {
    hevyWorkouts,
    dailyLogs,
    profile,
    goal,
    subPriorities,
    todayKey,
    scenarioOverride,
    goalEvaluation,
    boxingBalance,
  } = params;

  const anchorDate = resolveAnchorDate(dailyLogs, hevyWorkouts, todayKey);
  const weightKg = getLatestWeightKg(dailyLogs, profile) ?? 80;

  const sortedLogs = [...dailyLogs]
    .filter((d) => isValidDateKey(d.date) && d.date <= anchorDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const logs30d = sortedLogs.filter(
    (d) => d.date >= shiftDateKey(anchorDate, -29),
  );

  // 1. Sleep (last night + 3-day sleep deficit < 6.5h avg)
  const sleepLogsRecent3 = sortedLogs
    .filter((d) => typeof d.sleepHours === 'number' && d.sleepHours > 0)
    .slice(0, 3);
  const lastNightSleepHours =
    sleepLogsRecent3.length > 0 ? (sleepLogsRecent3[0].sleepHours as number) : null;
  const avgSleep3dRaw = avg(
    sleepLogsRecent3.map((d) => d.sleepHours as number),
  );
  const avgSleep3d = avgSleep3dRaw !== null ? round1(avgSleep3dRaw) : null;
  const has3DaySleepDeficit =
    sleepLogsRecent3.length >= 2 && avgSleep3d !== null && avgSleep3d < 6.5;

  let sleepComponent = 78;
  if (lastNightSleepHours !== null) {
    if (lastNightSleepHours >= 7.8) sleepComponent = 96;
    else if (lastNightSleepHours >= 7.0) sleepComponent = 85;
    else if (lastNightSleepHours >= 6.2) sleepComponent = 66;
    else sleepComponent = 42;
  }
  if (has3DaySleepDeficit) {
    sleepComponent = Math.max(25, sleepComponent - 20);
  }

  // 2. Biometric stress (RHR / HRV vs 30-day rolling baseline)
  const latestRhrLog = sortedLogs.find(
    (d) => typeof d.restingHr === 'number' && d.restingHr >= 30,
  );
  const baselineRhr = avg(
    logs30d
      .filter((d) => d.date !== latestRhrLog?.date)
      .map((d) => d.restingHr)
      .filter((v): v is number => typeof v === 'number' && v >= 30),
  );
  const rhrDeltaFrom30d =
    latestRhrLog?.restingHr !== undefined && baselineRhr !== null
      ? round1(latestRhrLog.restingHr - baselineRhr)
      : null;

  const latestHrvLog = sortedLogs.find(
    (d) => typeof d.hrv === 'number' && d.hrv > 0,
  );
  const baselineHrv = avg(
    logs30d
      .filter((d) => d.date !== latestHrvLog?.date)
      .map((d) => d.hrv)
      .filter((v): v is number => typeof v === 'number' && v > 0),
  );
  const hrvPctFrom30d =
    latestHrvLog?.hrv !== undefined && baselineHrv !== null && baselineHrv > 0
      ? round1(((latestHrvLog.hrv - baselineHrv) / baselineHrv) * 100)
      : null;

  let bioComponent = 82;
  if (rhrDeltaFrom30d !== null) {
    if (rhrDeltaFrom30d <= 0) bioComponent += 10;
    else if (rhrDeltaFrom30d <= 2.5) bioComponent += 0;
    else if (rhrDeltaFrom30d <= 4.5) bioComponent -= 18;
    else bioComponent -= 34;
  }
  if (hrvPctFrom30d !== null) {
    if (hrvPctFrom30d >= 5) bioComponent += 8;
    else if (hrvPctFrom30d >= -8) bioComponent += 0;
    else if (hrvPctFrom30d >= -15) bioComponent -= 16;
    else bioComponent -= 30;
  }
  bioComponent = clamp(bioComponent, 20, 100);

  // 3. ACWR (strength + boxing)
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, anchorDate);
  const acwr = acwrReport.acwr;
  let acwrComponent = 82;
  if (acwr !== null) {
    if (acwr >= 0.8 && acwr <= 1.25) acwrComponent = 94;
    else if (acwr > 1.25 && acwr <= 1.4) acwrComponent = 68;
    else if (acwr > 1.4) acwrComponent = 42;
    else acwrComponent = 84;
  }

  // 4. Yesterday's protein & calories
  const yesterdayKey = shiftDateKey(anchorDate, -1);
  const yesterdayLog =
    sortedLogs.find((d) => d.date === yesterdayKey) ?? sortedLogs[0];
  const yesterdayProteinGPerKg =
    yesterdayLog?.proteinGrams !== undefined && yesterdayLog.proteinGrams > 0
      ? round1(yesterdayLog.proteinGrams / weightKg)
      : null;
  const yesterdayCalories =
    yesterdayLog?.caloriesKcal !== undefined && yesterdayLog.caloriesKcal > 0
      ? Math.round(yesterdayLog.caloriesKcal)
      : null;

  let nutritionComponent = 80;
  if (yesterdayProteinGPerKg !== null) {
    if (yesterdayProteinGPerKg >= 1.8) nutritionComponent = 95;
    else if (yesterdayProteinGPerKg >= 1.5) nutritionComponent = 78;
    else nutritionComponent = 58;
  }

  // 5. Consecutive heavy training days (strength or boxing)
  const workoutDates = new Set(
    hevyWorkouts
      .filter((w) => isValidDateKey(w.date) && (w.totalSets >= 8 || isBoxingWorkout(w)))
      .map((w) => w.date),
  );
  let consecutiveHeavyDays = 0;
  for (let i = 1; i <= 7; i++) {
    if (workoutDates.has(shiftDateKey(anchorDate, -i))) {
      consecutiveHeavyDays += 1;
    } else {
      break;
    }
  }

  let rawScore = Math.round(
    sleepComponent * 0.35 +
      bioComponent * 0.3 +
      acwrComponent * 0.2 +
      nutritionComponent * 0.15,
  );
  if (consecutiveHeavyDays >= 3) {
    rawScore = Math.min(rawScore, 58);
  }
  const readinessScore = clamp(rawScore, 15, 100);

  // Clean days & Auto PR Attack check
  const cleanDaysStreak = computeCleanDaysStreak(dailyLogs, anchorDate);
  const prTargetCandidate = findClosestPrTargetCandidate(
    hevyWorkouts,
    subPriorities,
  );
  const autoPrAttackEligible = readinessScore >= 82 && cleanDaysStreak >= 3;

  const activeScenario: TodayScenarioId =
    scenarioOverride ?? (autoPrAttackEligible ? 'pr_attack' : 'standard');

  // Base prescription tier
  let readinessTier: MultiFactorCoachDailyPlan['readinessTier'];
  let readinessTierLabel: string;
  let prescriptionSummary: string;
  let targetRpeText: string;

  if (readinessScore >= 80 && consecutiveHeavyDays < 3) {
    readinessTier = 'progressive';
    readinessTierLabel = 'Пикова готовност — Прогресивно натоварване';
    prescriptionSummary =
      'Атакувай прогресия днес: RPE 8.5–9.5, +1 повторение или +1.25–2.5 kg на основните серии.';
    targetRpeText = 'RPE 8.5–9.5';
  } else if (readinessScore >= 60 && consecutiveHeavyDays < 3) {
    readinessTier = 'standard';
    readinessTierLabel = 'Стабилна готовност — Стандартна работа';
    prescriptionSummary =
      'Качествена стандартна работа на RPE 7.5–8 (1–2 повторения в резерв, без отказ).';
    targetRpeText = 'RPE 7.5–8.0';
  } else {
    readinessTier = 'med';
    readinessTierLabel = 'Минимална ефективна доза';
    prescriptionSummary =
      consecutiveHeavyDays >= 3
        ? `Имаш ${consecutiveHeavyDays} поредни тежки дни — свали сериите с 25–30% (RPE 6.5–7) или направи активна почивка.`
        : 'Намали работните серии с 25–30% (RPE 6.5–7) или избери лека мобилност и разходка.';
    targetRpeText = 'RPE 6.5–7.0 (-25–30% серии)';
  }

  // Build exercises and scenario adaptations
  const hasBoxingSub = subPriorities.includes('boxing_explosiveness');
  const hasCalisSub = subPriorities.includes('calisthenics_relative');
  const hasMax1rmSub = subPriorities.includes('max_strength_1rm');
  const hasJointsSub = subPriorities.includes('recovery_joints');

  let scenarioHeadline = '🎯 Стандартен план спрямо днешната готовност';
  let recommendedExercises: DailyRecommendedExercise[] = [];

  if (activeScenario === 'express_35') {
    scenarioHeadline = '⏱️ Експресна 35-минутна сесия (максимален ефект със суперсерии)';
    recommendedExercises = [
      {
        title: hasCalisSub
          ? 'Суперсерия A1: Набирания с тежест / собствено тегло'
          : 'Суперсерия A1: Гребане с щанга / дъмбел',
        setsReps: '3 × 6–10',
        rpe: targetRpeText,
        note: '60 сек. пауза преди A2 — висок стимул за гърба',
      },
      {
        title: hasCalisSub
          ? 'Суперсерия A2: Кофички на успоредка'
          : 'Суперсерия A2: Избутване от лег (Bench Press)',
        setsReps: '3 × 6–10',
        rpe: targetRpeText,
        note: 'Антагонистична суперсерия пести 40% време',
      },
      {
        title: 'Базово за долна част: Български клек или Клек с щанга',
        setsReps: '3 × 6–8',
        rpe: 'RPE 8.0',
        note: 'Контролирано спускане, експлозивно изправяне',
      },
      {
        title: 'Финишър за рамене/корем: Лицево дърпане (Face Pull) + Планк',
        setsReps: '2 × 15 + 45 сек.',
        rpe: 'RPE 7.5',
        note: 'Защита на раменете за < 5 мин.',
      },
    ];
  } else if (activeScenario === 'evening_boxing') {
    scenarioHeadline =
      '🥊 Адаптирано за бокс довечера — пазим раменете, гърдите и краката свежи';
    recommendedExercises = [
      {
        title: 'Набирания или Хоризонтално гребане (приоритет гръб)',
        setsReps: '3 × 6–8',
        rpe: 'RPE 7.5',
        note: 'Балансира ударите без да изтощава предното рамо',
      },
      {
        title: 'Лицево дърпане (Face Pull) / Външна ротация с ластик',
        setsReps: '3 × 15',
        rpe: 'RPE 7.0',
        note: 'Активира ротаторния маншон преди бокса',
      },
      {
        title: 'Експлозивна лежанка / Кофички (намален обем)',
        setsReps: '2 × 5 (бърза концентрична фаза)',
        rpe: 'RPE 6.5–7.0',
        note: '-40% обем за гърди/рамене, за да останат ръцете бързи',
      },
      {
        title: 'Корем и ротационна стабилност (Pallof Press / Повдигане на крака)',
        setsReps: '3 × 10–12',
        rpe: 'RPE 7.5',
        note: 'Директен пренос към силата на удара без умора в краката',
      },
    ];
  } else if (activeScenario === 'pr_attack') {
    scenarioHeadline = autoPrAttackEligible
      ? `🔥 Автоматична PR Атака (Готовност ${readinessScore}% + ${cleanDaysStreak} чисти дни)`
      : '🔥 Режим „Атака на PR днес“ — фокус върху 1 основен рекорд';
    recommendedExercises = [
      {
        title: prTargetCandidate
          ? `PR Мишена: ${prTargetCandidate.exerciseTitle}`
          : hasCalisSub
            ? 'PR Мишена: Набирания с добавена тежест'
            : 'PR Мишена: Базово бутащо или дърпащо движение',
        setsReps: prTargetCandidate
          ? `Топ серия: ${prTargetCandidate.targetText}`
          : '3 загряващи + 1–2 топ серии × 4–6',
        rpe: 'RPE 9.0–9.5',
        note: prTargetCandidate
          ? `Последно: ${prTargetCandidate.lastPerformanceText}. Почини 3–4 мин. преди топ серията.`
          : 'Направи 3 прогресивни загряващи серии и атакувай с пълен фокус.',
      },
      {
        title: 'Подкрепящо дърпане (Гребане / Набирания)',
        setsReps: '3 × 6–8',
        rpe: 'RPE 8.0',
        note: 'Поддържа силовия баланс без да отнема нервна енергия',
      },
      {
        title: 'Второ базово движение (умерен обем)',
        setsReps: '2–3 × 6–8',
        rpe: 'RPE 7.5–8.0',
        note: 'Запазвай 2 повторения в резерв след PR опита',
      },
      {
        title: 'Лицево дърпане (Face Pull) — завършваща профилактика',
        setsReps: '3 × 15',
        rpe: 'RPE 7.0',
        note: 'Разтоварва раменете след тежките опити',
      },
    ];
  } else if (activeScenario === 'light_fatigue') {
    scenarioHeadline =
      '🩹 Щадящ режим — мобилност, леко дърпане и защита на ставите';
    recommendedExercises = [
      {
        title: 'Динамична мобилност (торакален гръбнак, тазобедрени, рамене)',
        setsReps: '10–12 мин.',
        rpe: 'Леко',
        note: 'Премахва сковаността и подобрява кръвообращението',
      },
      {
        title: 'Лицево дърпане (Face Pull) и Банд пул-апарт',
        setsReps: '3 × 15–20',
        rpe: 'RPE 6.0',
        note: 'Кръвоснабдява раменния пояс без ставен стрес',
      },
      {
        title: 'Леко хоризонтално гребане (скрипец / дъмбел)',
        setsReps: '3 × 10–12 (на 70% тежест)',
        rpe: 'RPE 6.5',
        note: 'Контролирано темпо без отказ',
      },
      {
        title: 'Изометрия за корем и разходка (20–30 мин.)',
        setsReps: '2 × 40 сек. + зона 2',
        rpe: 'Леко',
        note: 'Ускорява възстановяването на ЦНС за утре',
      },
    ];
  } else {
    // Standard day — adapt to readiness tier, subPriorities, and boxing shoulder balance
    const setsPrefix = readinessTier === 'med' ? '2–3' : '3–4';
    const repRange = hasMax1rmSub ? '4–6' : '6–10';

    if (boxingBalance.isImbalanced) {
      recommendedExercises.push(
        {
          title: 'Приоритет (Раменна защита): Гребане с щанга или дъмбел',
          setsReps: `${setsPrefix} × ${repRange}`,
          rpe: targetRpeText,
          note: 'Компенсира >30% превес на бутащите + бокса тази седмица',
        },
        {
          title: 'Набирания (Pull-Up / Chin-Up)',
          setsReps: `${setsPrefix} × 6–10`,
          rpe: targetRpeText,
          note: hasCalisSub
            ? 'Ключово движение за относителна сила на лостове'
            : 'Укрепва гърба и стабилизира раменната лопатка',
        },
        {
          title: 'Лицево дърпане (Face Pull)',
          setsReps: '3 × 15–20',
          rpe: 'RPE 7.5',
          note: 'Директна защита за задните рамене и ротаторния маншон',
        },
        {
          title: hasCalisSub
            ? 'Кофички на успоредка (контролиран обем)'
            : 'Умерено бутащо или крака (напр. Клек / Лежанка)',
          setsReps: readinessTier === 'med' ? '2 × 6' : '3 × 6–8',
          rpe: 'RPE 7.5–8.0',
          note: 'Без излишен обем за предното рамо',
        },
      );
    } else {
      recommendedExercises.push(
        {
          title: hasCalisSub
            ? 'Набирания с тежест / собствено тегло'
            : hasMax1rmSub
              ? 'Основно базово движение (Клек / Лежанка / Тяга)'
              : 'Основно многоставно движение за деня',
          setsReps: `${setsPrefix} × ${repRange}`,
          rpe: targetRpeText,
          note:
            readinessTier === 'progressive'
              ? 'Гони +1 повторение или +1.25–2.5 kg'
              : 'Чиста техника с 1–2 повторения в резерв',
        },
        {
          title: hasCalisSub
            ? 'Кофички на успоредка / Силови възлизания'
            : 'Антагонистично базово движение (Бутане / Дърпане)',
          setsReps: `${setsPrefix} × 6–10`,
          rpe: targetRpeText,
          note: hasBoxingSub
            ? 'Фокус върху експлозивно избутване и контрол'
            : 'Поддържа симетричен обем',
        },
        {
          title: 'Спомагателно движение за гръб / задни рамене',
          setsReps: '3 × 10–12',
          rpe: 'RPE 7.5–8.0',
          note: 'Пази стойката и раменния баланс',
        },
        {
          title: hasJointsSub
            ? 'Мобилност и ставен стабилизиращ блок (Face Pull + Корем)'
            : 'Завършващо изолиращо движение + Корем',
          setsReps: '2–3 × 12–15',
          rpe: 'RPE 7.5',
          note: hasJointsSub
            ? 'Приоритет: безболезнена амплитуда и контрол'
            : 'Довършва обема без прекомерна умора',
        },
      );
    }
  }

  // Build "Топ 3 насоки за деня" (1 Training, 1 Nutrition, 1 Recovery)
  const trainingGuidance: TopDailyGuidanceItem = {
    category: 'Тренировка',
    title:
      activeScenario === 'evening_boxing'
        ? 'Пази раменете и краката за вечерния бокс'
        : activeScenario === 'express_35'
          ? '35-минутен суперсериен фокус'
          : activeScenario === 'pr_attack' && prTargetCandidate
            ? `PR атака: ${prTargetCandidate.exerciseTitle} (${prTargetCandidate.targetText})`
            : activeScenario === 'light_fatigue'
              ? 'Щадяща мобилност и леко дърпане'
              : boxingBalance.isImbalanced
                ? 'Приоритет на дърпащите (защита на раменете)'
                : readinessTierLabel,
    detail:
      activeScenario === 'evening_boxing'
        ? 'Намали сериите за рамене, гърди и крака с 40% и включи гръб + ротатори, за да си свеж за ринга/чувала.'
        : activeScenario === 'express_35'
          ? 'Изпълни 3–4 базови упражнения в антагонистични суперсерии с 60 сек. почивка.'
          : activeScenario === 'light_fatigue'
            ? 'Пропусни тежките 1RM опити — 10 мин. мобилност + 3 леки серии гребане/Face Pull на RPE 6.'
            : boxingBalance.isImbalanced
              ? `Бутащите + боксът водят с +${Math.round(
                  boxingBalance.pushOverPullPct ?? 35,
                )}%. Започни с гребане, набирания и Face Pull.`
              : prescriptionSummary,
  };

  const targetProteinGrams = Math.round(weightKg * 1.85);
  const nutritionGuidance: TopDailyGuidanceItem = {
    category: 'Хранене',
    title: goalEvaluation.recommendSmartRefeed
      ? '🔋 Умен Refeed ден (поддържащи калории + въглехидрати)'
      : activeScenario === 'evening_boxing' || hasBoxingSub
        ? `Зареди с въглехидрати и ≥ ${targetProteinGrams} г протеин`
        : goal === 'fat_loss'
          ? `Умерен дефицит и висок протеин (≥ ${targetProteinGrams} г)`
          : `Протеин ≥ ${targetProteinGrams} г (${goalEvaluation.statusLabel})`,
    detail: goalEvaluation.recommendSmartRefeed
      ? goalEvaluation.calorieAction
      : `${goalEvaluation.calorieAction}${
          yesterdayProteinGPerKg !== null && yesterdayProteinGPerKg < 1.7
            ? ` Вчера протеинът беше ${yesterdayProteinGPerKg.toFixed(1)} g/kg — днес наваксай.`
            : ''
        }`,
  };

  const recoveryGuidance: TopDailyGuidanceItem = {
    category: 'Възстановяване',
    title: has3DaySleepDeficit
      ? `Натрупан 3-дневен сънен дефицит (${avgSleep3d?.toFixed(1)} ч.)`
      : rhrDeltaFrom30d !== null && rhrDeltaFrom30d >= 3.5
        ? `Повишен сутрешен пулс (+${rhrDeltaFrom30d.toFixed(1)} bpm)`
        : hasJointsSub
          ? 'Профилактика на стави и сън ≥ 7.5 ч.'
          : 'Поддържай ритъма на съня и хидратацията',
    detail: has3DaySleepDeficit
      ? 'Средният ти сън последните 3 нощи е под 6.5 ч. — легни 45–60 мин. по-рано довечера и избягвай късен кофеин.'
      : hrvPctFrom30d !== null && hrvPctFrom30d <= -12
        ? `HRV е ${hrvPctFrom30d.toFixed(0)}% под 30-дневната база — заложи на електролити, 10 мин. разтягане и ранно лягане.`
        : activeScenario === 'evening_boxing'
          ? 'След вечерния бокс направи 10 мин. охлаждане и хидратация с магнезий, за да не скача утрешният пулс.'
          : 'Приключи тренировката с 5 мин. разтягане на гърди/рамене и цели 7.5–8 ч. качествен сън.',
  };

  return {
    anchorDate,
    readinessScore,
    readinessTier,
    readinessTierLabel,
    prescriptionSummary,
    targetRpeText,
    has3DaySleepDeficit,
    avgSleep3d,
    lastNightSleepHours,
    rhrDeltaFrom30d,
    hrvPctFrom30d,
    acwr,
    yesterdayProteinGPerKg,
    yesterdayCalories,
    consecutiveHeavyDays,
    cleanDaysStreak,
    autoPrAttackEligible,
    prTargetCandidate,
    activeScenario,
    scenarioHeadline,
    top3Guidance: [trainingGuidance, nutritionGuidance, recoveryGuidance],
    recommendedExercises,
  };
}
