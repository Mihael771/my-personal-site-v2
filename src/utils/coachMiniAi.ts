import type {
  AdaptedExerciseItem,
  AdaptedWorkoutPlan,
  AiReadinessResult,
  AiReadinessTier,
  CoachAnalysisReport,
  CoachChatIntent,
  CoachChatResponse,
  CustomExerciseMappings,
  DailyBiometricLog,
  DetailedMuscleRecoveryItem,
  DiscoveredPattern,
  GeneratedWorkoutExercise,
  GeneratedWorkoutPlan,
  HevySet,
  HevyWorkout,
  TrainingGoalPhase,
  UserProfile,
  WorkoutEnvironment,
  WorkoutGeneratorGoal,
} from '../types/fitness';
import {
  computeAcwrReport,
  computeDetailedMuscleRecovery,
  computeRunningStandards,
  getUniqueHevyRoutines,
  mapExerciseToDetailedMuscles,
} from './analysisPrep';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  DEFAULT_HABIT_ITEMS,
  computeDailyEnergySummary,
  isDateIncludedForEveningMetric,
  resolveEveningWindowEndDate,
} from './dailyLogs';
import { buildExerciseRecommendations } from './exerciseRecommender';
import { calculateEpley1RM } from './hevyProgress';
import {
  DEFAULT_TRAINING_GOAL,
  TRAINING_GOAL_META_MAP,
  WORKOUT_ENVIRONMENT_META_MAP,
  buildAllWorkoutsHiddenPrIndex,
  classifyWorkoutEnvironment,
} from './hiddenProgressAndEnvironment';
import { classifyHevyExerciseMuscle } from './intelligentCoach';

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundWeightHalf(kg: number): number {
  if (kg <= 0) return 0;
  return Math.round(kg * 2) / 2;
}

function roundWeight25(kg: number): number {
  if (kg <= 0) return 0;
  return Math.max(2.5, Math.round(kg / 2.5) * 2.5);
}

function shiftDate(dateKey: string, deltaDays: number): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function parseWorkoutTs(w: HevyWorkout): number {
  if (w.startTime) {
    const dt = new Date(w.startTime);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
  if (w.date) {
    const dt = new Date(`${w.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
  return 0;
}

// ============================================================================
// 1. Динамичен „AI Индекс на готовност“ (0–100) + Авто-коректор на тренировката
// ============================================================================

function scoreSleepHours(hours: number): number {
  if (hours >= 8.2) return 100;
  if (hours >= 7.5) return 88 + ((hours - 7.5) / 0.7) * 12;
  if (hours >= 7.0) return 76 + ((hours - 7.0) / 0.5) * 12;
  if (hours >= 6.5) return 60 + ((hours - 6.5) / 0.5) * 16;
  if (hours >= 5.5) return 35 + ((hours - 5.5) / 1.0) * 25;
  return Math.max(15, (hours / 5.5) * 35);
}

function scoreFreshness(q: number): number {
  const map: Record<number, number> = {
    1: 15,
    2: 36,
    3: 65,
    4: 86,
    5: 100,
  };
  return map[Math.round(q)] ?? 65;
}

function scoreRhrDelta(deltaBpm: number): number {
  if (deltaBpm <= -2) return 100;
  if (deltaBpm <= 1) return 90;
  if (deltaBpm <= 3) return 74;
  if (deltaBpm <= 5) return 52;
  if (deltaBpm <= 8) return 30;
  return 15;
}

function scoreAcwr(acwr: number): number {
  if (acwr >= 0.85 && acwr <= 1.2) return 95;
  if (acwr >= 0.8 && acwr <= 1.3) return 85;
  if (acwr < 0.8) return 76;
  if (acwr <= 1.5) return 56;
  return 26;
}

function scoreTrainingStreak(days: number): number {
  if (days <= 1) return 96;
  if (days === 2) return 84;
  if (days === 3) return 68;
  if (days === 4) return 48;
  return 26;
}

export function countConsecutiveTrainingDays(
  hevyWorkouts: HevyWorkout[],
  dailyLogs: DailyBiometricLog[],
  todayKey: string,
): number {
  const activeDates = new Set<string>();
  for (const w of hevyWorkouts) {
    if (w.date) activeDates.add(w.date);
  }
  for (const d of dailyLogs) {
    if ((d.cardioDurationMinutes ?? 0) >= 30 || (d.cardioDistanceKm ?? 0) >= 4) {
      activeDates.add(d.date);
    }
  }

  let cursor = todayKey;
  if (!activeDates.has(cursor)) {
    const yesterday = shiftDate(todayKey, -1);
    if (!activeDates.has(yesterday)) return 0;
    cursor = yesterday;
  }

  let streak = 0;
  let guard = 0;
  while (activeDates.has(cursor) && guard < 60) {
    streak += 1;
    guard += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function computeAiReadinessScore(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
}): AiReadinessResult {
  const { hevyWorkouts, dailyLogs, todayKey, customExerciseMappings } = params;
  const dailyAsc = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));

  // 1) Last 48h sleep hours & quality (or latest 2 sleep entries within 7 days)
  const minSleepDate = shiftDate(todayKey, -2);
  const recent48Sleep = dailyAsc.filter(
    (d) =>
      d.date >= minSleepDate &&
      d.date <= todayKey &&
      (d.sleepHours !== undefined || d.sleepQuality !== undefined),
  );
  const sleepBucket =
    recent48Sleep.length > 0
      ? recent48Sleep.slice(-2)
      : dailyAsc
          .filter((d) => d.sleepHours !== undefined || d.sleepQuality !== undefined)
          .slice(-2);

  const hoursVals = sleepBucket
    .map((d) => d.sleepHours)
    .filter((v): v is number => v !== undefined);
  const qualityVals = sleepBucket
    .map((d) => d.sleepQuality)
    .filter((v): v is number => v !== undefined);

  const avgSleepHours48h =
    hoursVals.length > 0
      ? roundOne(hoursVals.reduce((a, b) => a + b, 0) / hoursVals.length)
      : null;
  const avgFreshness48h =
    qualityVals.length > 0
      ? roundOne(qualityVals.reduce((a, b) => a + b, 0) / qualityVals.length)
      : null;

  let sleepScore: number | null = null;
  if (avgSleepHours48h !== null && avgFreshness48h !== null) {
    sleepScore = Math.round(
      0.6 * scoreSleepHours(avgSleepHours48h) +
        0.4 * scoreFreshness(avgFreshness48h),
    );
  } else if (avgSleepHours48h !== null) {
    sleepScore = Math.round(scoreSleepHours(avgSleepHours48h));
  } else if (avgFreshness48h !== null) {
    sleepScore = Math.round(scoreFreshness(avgFreshness48h));
  }

  // 2) RHR deviation vs 14-day baseline
  const hrEntries = dailyAsc.filter((d) => d.restingHr !== undefined);
  const latestRestingHr =
    hrEntries.length > 0 ? hrEntries[hrEntries.length - 1].restingHr ?? null : null;
  const latestHrDate =
    hrEntries.length > 0 ? hrEntries[hrEntries.length - 1].date : todayKey;
  const baselineStart = shiftDate(latestHrDate, -14);
  const baselineHrEntries = hrEntries
    .slice(0, -1)
    .filter((d) => d.date >= baselineStart && d.date < latestHrDate);

  const avgRestingHr14d =
    baselineHrEntries.length > 0
      ? roundOne(
          baselineHrEntries.reduce((s, d) => s + (d.restingHr ?? 0), 0) /
            baselineHrEntries.length,
        )
      : null;
  const rhrDeltaBpm =
    latestRestingHr !== null && avgRestingHr14d !== null
      ? roundOne(latestRestingHr - avgRestingHr14d)
      : null;
  const rhrScore =
    rhrDeltaBpm !== null ? Math.round(scoreRhrDelta(rhrDeltaBpm)) : null;

  // 3) ACWR
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, todayKey);
  const acwr = acwrReport.acwr;
  const acwrScore = acwr !== null ? Math.round(scoreAcwr(acwr)) : null;

  // 4) Consecutive training days
  const consecutiveTrainingDays = countConsecutiveTrainingDays(
    hevyWorkouts,
    dailyLogs,
    todayKey,
  );
  const streakScore = Math.round(scoreTrainingStreak(consecutiveTrainingDays));

  // 5) High steps (> 14,000 in last 24h) impact on leg readiness
  const yesterdayKey = shiftDate(todayKey, -1);
  const recentStepsCandidates = dailyAsc
    .filter(
      (d) =>
        (d.date === todayKey || d.date === yesterdayKey) &&
        d.steps !== undefined &&
        d.steps > 0,
    )
    .map((d) => d.steps ?? 0);
  const recentSteps24h =
    recentStepsCandidates.length > 0 ? Math.max(...recentStepsCandidates) : null;

  const hasRecentLegWorkout = hevyWorkouts.some(
    (w) =>
      (w.date === todayKey || w.date === yesterdayKey) &&
      w.exercises.some(
        (ex) =>
          classifyHevyExerciseMuscle(ex.title, customExerciseMappings).groupId ===
          'legs',
      ),
  );
  const highStepsLegFatigue = recentSteps24h !== null && recentSteps24h > 14000;
  const highStepsPenalty = highStepsLegFatigue
    ? hasRecentLegWorkout
      ? 10
      : 5
    : 0;

  // Weighted combination across available components
  const components: Array<{ score: number; weight: number }> = [
    { score: streakScore, weight: 0.15 },
  ];
  if (sleepScore !== null) components.push({ score: sleepScore, weight: 0.35 });
  if (rhrScore !== null) components.push({ score: rhrScore, weight: 0.25 });
  if (acwrScore !== null) components.push({ score: acwrScore, weight: 0.25 });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weightedSum = components.reduce((s, c) => s + c.score * c.weight, 0);
  const baseScore =
    totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 75;
  const finalScore = Math.max(0, Math.min(100, baseScore - highStepsPenalty));

  let tier: AiReadinessTier = 'good';
  let diagnosisHeadline = `${finalScore}/100 — Добра готовност: стандартна тренировка`;
  let diagnosisDetail =
    'Биометричните показатели са стабилни. Изпълни планираните серии с контрол на техниката.';
  let adaptationSummary =
    'Стандартно натоварване без нужда от намаляване на обема.';

  if (finalScore >= 80) {
    tier = 'peak';
    diagnosisHeadline = `${finalScore}/100 — Пикова форма: идеален ден за тежки базови серии и PR`;
    diagnosisDetail =
      'Сън, пулс в покой и остро-хронично натоварване са в оптимален синхрон. Нервната система е свежа за висока интензивност.';
    adaptationSummary =
      'Авто-коректорът препоръчва +2.5 kg на основните упражнения или опит за личен рекорд.';
  } else if (finalScore < 45) {
    tier = 'fatigued';
    diagnosisHeadline = `${finalScore}/100 — Висока нервна умора: режим на възстановяване`;
    diagnosisDetail =
      'Има силен сигнал за натрупана умора (кратък сън, повишен пулс в покой, висок ACWR или дълга тренировъчна серия).';
    adaptationSummary =
      'Авто-коректорът намалява сериите с 25% и тежестите с 5–7% за безопасно възстановяване.';
  } else if (finalScore < 62) {
    tier = 'moderate';
    diagnosisHeadline = `${finalScore}/100 — Умерена умора: контролирана сесия без отказ`;
    diagnosisDetail =
      'Готовността е леко понижена. Запази работните движения, но спри на 2 повторения в резерв (RPE ≤ 8).';
    adaptationSummary =
      'Авто-коректорът редуцира тежките серии леко или задържа тежестите без рискови максимуми.';
  }

  if (highStepsLegFatigue && recentSteps24h !== null) {
    diagnosisDetail += ` Отчетени са ${recentSteps24h.toLocaleString('bg-BG')} крачки през последните 24 ч${
      hasRecentLegWorkout ? ' в комбинация с тренировка за крака' : ''
    } — краката имат нужда от допълнително възстановяване (-${highStepsPenalty} т.).`;
  }

  return {
    score: finalScore,
    tier,
    diagnosisHeadline,
    diagnosisDetail,
    adaptationSummary,
    factors: {
      sleepScore,
      avgSleepHours48h,
      avgFreshness48h,
      rhrScore,
      latestRestingHr,
      avgRestingHr14d,
      rhrDeltaBpm,
      acwrScore,
      acwr,
      streakScore,
      consecutiveTrainingDays,
      highStepsLegFatigue,
      recentSteps24h,
    },
  };
}

export function adaptRoutineForReadiness(
  hevyWorkouts: HevyWorkout[],
  routineTitle: string,
  readinessScore: number,
): AdaptedWorkoutPlan | null {
  const routines = getUniqueHevyRoutines(hevyWorkouts);
  const routine = routines.find((r) => r.title === routineTitle) ?? routines[0];
  if (!routine) return null;

  const sortedDesc = [...hevyWorkouts].sort(
    (a, b) => parseWorkoutTs(b) - parseWorkoutTs(a),
  );

  const exercises: AdaptedExerciseItem[] = [];

  for (const exTitle of routine.exerciseTitles) {
    const key = exTitle.trim().toLowerCase();
    let latestWorkingSets: HevySet[] = [];
    for (const w of sortedDesc) {
      const found = w.exercises.find((e) => e.title.trim().toLowerCase() === key);
      if (found) {
        latestWorkingSets = getWorkingSets(found.sets);
        break;
      }
    }
    if (latestWorkingSets.length === 0) continue;

    const originalSets = latestWorkingSets.length;
    const originalWeightKg = Math.max(
      0,
      ...latestWorkingSets.map((s) => s.weightKg ?? 0),
    );
    const repsList = latestWorkingSets
      .map((s) => s.reps ?? 0)
      .filter((r) => r > 0);
    const minReps = repsList.length > 0 ? Math.min(...repsList) : 8;
    const maxReps = repsList.length > 0 ? Math.max(...repsList) : 8;
    const originalRepsLabel =
      minReps === maxReps ? String(minReps) : `${minReps}–${maxReps}`;

    let adaptedSets = originalSets;
    let adaptedWeightKg = originalWeightKg;
    let adaptedRepsText = originalRepsLabel;
    let targetRpeText = 'RPE 8';
    let adjustmentNote = 'Запазва стандартния план';

    if (readinessScore < 50) {
      adaptedSets = Math.max(1, Math.round(originalSets * 0.75));
      if (originalWeightKg > 0) {
        adaptedWeightKg = roundWeightHalf(originalWeightKg * 0.94);
        adjustmentNote = '-25% серии и -6% тежест (защита от претрениране)';
      } else {
        adaptedRepsText = `${Math.max(4, minReps - 2)}–${Math.max(5, maxReps - 2)}`;
        adjustmentNote = '-25% серии и по-далеч от отказ';
      }
      targetRpeText = 'RPE 6.5–7.5';
    } else if (readinessScore < 65) {
      adaptedSets = originalSets >= 4 ? originalSets - 1 : originalSets;
      adaptedWeightKg = originalWeightKg;
      targetRpeText = 'RPE 7.5–8';
      adjustmentNote =
        originalSets >= 4
          ? '-1 серия обем, същите килограми без отказ'
          : 'Същите серии и тежест, спри на 2 повт. резерв';
    } else if (readinessScore >= 80) {
      adaptedSets = originalSets;
      if (originalWeightKg > 0) {
        const cls = classifyHevyExerciseMuscle(exTitle);
        const isPrimaryCompound =
          cls.groupId === 'chest' ||
          cls.groupId === 'back' ||
          cls.groupId === 'legs' ||
          cls.groupId === 'shoulders';
        adaptedWeightKg = roundOne(
          originalWeightKg + (isPrimaryCompound ? 2.5 : 1.25),
        );
        adjustmentNote = isPrimaryCompound
          ? '+2.5 kg за ново силово ниво (пикова готовност)'
          : '+1.25 kg прогрес при отлична свежест';
      } else {
        adaptedRepsText = `${minReps + 1}–${maxReps + 1}`;
        adjustmentNote = '+1 повторение на серия (пикова готовност)';
      }
      targetRpeText = 'RPE 8.5–9.5';
    } else {
      adaptedSets = originalSets;
      adaptedWeightKg = originalWeightKg;
      adaptedRepsText =
        minReps === maxReps ? String(minReps + 1) : `${minReps}–${maxReps + 1}`;
      targetRpeText = 'RPE 8–8.5';
      adjustmentNote = 'Гони +1 повторение при стабилна техника';
    }

    exercises.push({
      exerciseTitle: exTitle,
      originalSets,
      originalWeightKg,
      originalRepsLabel,
      adaptedSets,
      adaptedWeightKg,
      adaptedRepsText,
      targetRpeText,
      adjustmentNote,
    });
  }

  const modeLabel =
    readinessScore < 50
      ? 'Режим на възстановяване (-25% обем, -6% тежест)'
      : readinessScore < 65
        ? 'Контролиран режим (без отказ)'
        : readinessScore >= 80
          ? 'Пиков режим (+2.5 kg на основните упражнения)'
          : 'Стандартен прогресивен режим';

  return {
    routineTitle: routine.title,
    readinessScore,
    modeLabel,
    exercises,
  };
}

// ============================================================================
// 2. Двигател за откриване на лични закономерности (Pattern & Correlation Discovery)
// ============================================================================

const BG_WEEKDAYS = [
  'Неделя',
  'Понеделник',
  'Вторник',
  'Сряда',
  'Четвъртък',
  'Петък',
  'Събота',
];

function getWeekdayBg(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return BG_WEEKDAYS[dt.getDay()] ?? dateKey;
}

export function discoverPersonalPatterns(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  habitItems?: string[];
  todayKey: string;
}): DiscoveredPattern[] {
  const {
    hevyWorkouts,
    dailyLogs,
    habitItems = DEFAULT_HABIT_ITEMS,
    todayKey,
  } = params;

  const windowStart = shiftDate(todayKey, -90);
  const logsInWindow = dailyLogs
    .filter((d) => d.date >= windowStart && d.date <= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date));
  const workoutsInWindow = hevyWorkouts.filter(
    (w) => w.date >= windowStart && w.date <= todayKey,
  );

  // Fall back to full history if user imported an older archive > 90 days ago
  const activeLogs =
    logsInWindow.length >= 4
      ? logsInWindow
      : [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const activeWorkouts =
    workoutsInWindow.length >= 4 ? workoutsInWindow : hevyWorkouts;

  const logByDate = new Map<string, DailyBiometricLog>();
  for (const d of activeLogs) {
    logByDate.set(d.date, d);
  }

  const patterns: DiscoveredPattern[] = [];

  // --------------------------------------------------------------------------
  // Pattern 1: Влияние на съня (>= 7.5ч vs < 7.5ч) върху 1RM и RPE
  // --------------------------------------------------------------------------
  const goodSleep1RMs: number[] = [];
  const shortSleep1RMs: number[] = [];
  const goodSleepRpes: number[] = [];
  const shortSleepRpes: number[] = [];
  let sleepPairedWorkouts = 0;

  for (const w of activeWorkouts) {
    const log = logByDate.get(w.date) ?? logByDate.get(shiftDate(w.date, -1));
    if (!log || log.sleepHours === undefined) continue;

    let push1RM = 0;
    let fallback1RM = 0;
    const wRpes: number[] = [];

    for (const ex of w.exercises) {
      const cls = classifyHevyExerciseMuscle(ex.title);
      for (const s of getWorkingSets(ex.sets)) {
        if (s.rpe !== undefined && s.rpe > 0) wRpes.push(s.rpe);
        if ((s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0) {
          const e = calculateEpley1RM(s.weightKg ?? 0, s.reps ?? 0);
          if (e > fallback1RM) fallback1RM = e;
          if (cls.pattern === 'push' && e > push1RM) push1RM = e;
        }
      }
    }

    const used1RM = push1RM > 0 ? push1RM : fallback1RM;
    const avgRpe =
      wRpes.length > 0
        ? wRpes.reduce((a, b) => a + b, 0) / wRpes.length
        : null;

    if (used1RM > 0 || avgRpe !== null) {
      sleepPairedWorkouts += 1;
      const isGoodSleep = log.sleepHours >= 7.5;
      if (used1RM > 0) {
        (isGoodSleep ? goodSleep1RMs : shortSleep1RMs).push(used1RM);
      }
      if (avgRpe !== null) {
        (isGoodSleep ? goodSleepRpes : shortSleepRpes).push(avgRpe);
      }
    }
  }

  const sleepTargetSamples = 14;
  if (goodSleep1RMs.length >= 2 && shortSleep1RMs.length >= 2) {
    const avgGood =
      goodSleep1RMs.reduce((a, b) => a + b, 0) / goodSleep1RMs.length;
    const avgShort =
      shortSleep1RMs.reduce((a, b) => a + b, 0) / shortSleep1RMs.length;
    const pctDiff = roundOne(((avgGood - avgShort) / avgShort) * 100);

    let rpeClause = '';
    if (goodSleepRpes.length >= 2 && shortSleepRpes.length >= 2) {
      const rpeGood =
        goodSleepRpes.reduce((a, b) => a + b, 0) / goodSleepRpes.length;
      const rpeShort =
        shortSleepRpes.reduce((a, b) => a + b, 0) / shortSleepRpes.length;
      const rpeDiff = roundOne(rpeShort - rpeGood);
      if (rpeDiff > 0) {
        rpeClause = `, а RPE пада с ${rpeDiff} единици`;
      } else if (rpeDiff < 0) {
        rpeClause = `, при RPE ${roundOne(rpeGood)} спрямо ${roundOne(rpeShort)}`;
      }
    }

    patterns.push({
      id: 'pattern-sleep-strength',
      title: 'Влияние на съня върху силата',
      category: 'Сън ↔ 1RM & RPE',
      hasEnoughData: true,
      collectedSamples: sleepPairedWorkouts,
      requiredSamples: sleepTargetSamples,
      progressLabel: `Анализирани ${sleepPairedWorkouts} тренировъчни дни със сън`,
      insightText: `Когато спиш ≥ 7.5 ч., средният ти 1RM е с ${pctDiff >= 0 ? '+' : ''}${pctDiff}% ${pctDiff >= 0 ? 'по-висок' : 'по-нисък'}${rpeClause}.`,
      evidenceText: `Сън ≥ 7.5ч: ср. ${roundOne(avgGood)} kg (${goodSleep1RMs.length} тр.) vs < 7.5ч: ср. ${roundOne(avgShort)} kg (${shortSleep1RMs.length} тр.)`,
      impactDirection: pctDiff > 0 ? 'positive' : 'neutral',
    });
  } else {
    patterns.push({
      id: 'pattern-sleep-strength',
      title: 'Влияние на съня върху силата',
      category: 'Сън ↔ 1RM & RPE',
      hasEnoughData: false,
      collectedSamples: sleepPairedWorkouts,
      requiredSamples: sleepTargetSamples,
      progressLabel: `Събрани ${Math.min(sleepPairedWorkouts, sleepTargetSamples)}/${sleepTargetSamples} дни данни за анализ на съня спрямо силата`,
      insightText:
        'Продължавай да записваш часовете сън в „Дневен чек-ин“ и тренировките в Hevy (нужни са сесии и с ≥ 7.5 ч., и с < 7.5 ч. сън).',
      evidenceText: `Текущи двойки (сън + тренировка): ${sleepPairedWorkouts}`,
      impactDirection: 'neutral',
    });
  }

  // --------------------------------------------------------------------------
  // Pattern 2: Хранене (150g+ протеин & калории) ↔ възстановяване на свежестта
  // --------------------------------------------------------------------------
  const highProteinFreshness: number[] = [];
  const lowProteinFreshness: number[] = [];
  let nutritionPairedDays = 0;

  for (let i = 0; i < activeLogs.length; i++) {
    const todayLog = activeLogs[i];
    if (
      todayLog.proteinGrams === undefined ||
      !isDateIncludedForEveningMetric(todayLog, todayKey, 'protein')
    ) {
      continue;
    }
    const nextLog = logByDate.get(shiftDate(todayLog.date, 1));
    const freshness = nextLog?.sleepQuality ?? todayLog.sleepQuality;
    if (freshness === undefined) continue;

    nutritionPairedDays += 1;
    const enoughCal =
      todayLog.caloriesKcal === undefined || todayLog.caloriesKcal >= 2000;
    if (todayLog.proteinGrams >= 150 && enoughCal) {
      highProteinFreshness.push(freshness);
    } else {
      lowProteinFreshness.push(freshness);
    }
  }

  const nutritionTarget = 14;
  if (highProteinFreshness.length >= 2 && lowProteinFreshness.length >= 2) {
    const avgHigh =
      highProteinFreshness.reduce((a, b) => a + b, 0) /
      highProteinFreshness.length;
    const avgLow =
      lowProteinFreshness.reduce((a, b) => a + b, 0) /
      lowProteinFreshness.length;
    const pctFaster = roundOne(((avgHigh - avgLow) / avgLow) * 100);

    patterns.push({
      id: 'pattern-nutrition-recovery',
      title: 'Протеин и калории спрямо свежестта',
      category: 'Хранене ↔ Възстановяване',
      hasEnoughData: true,
      collectedSamples: nutritionPairedDays,
      requiredSamples: nutritionTarget,
      progressLabel: `Анализирани ${nutritionPairedDays} дни хранене и свежест`,
      insightText: `В дните с ≥ 150 g протеин и достатъчно калории възстановяваш мускулната свежест с ${pctFaster >= 0 ? '+' : ''}${pctFaster}% ${pctFaster >= 0 ? 'по-добре' : 'по-слабо'} на следващия ден.`,
      evidenceText: `≥ 150 g протеин: свежест ${roundOne(avgHigh)}/5 (${highProteinFreshness.length} д.) vs < 150 g: ${roundOne(avgLow)}/5 (${lowProteinFreshness.length} д.)`,
      impactDirection: pctFaster > 0 ? 'positive' : 'neutral',
    });
  } else {
    patterns.push({
      id: 'pattern-nutrition-recovery',
      title: 'Протеин и калории спрямо свежестта',
      category: 'Хранене ↔ Възстановяване',
      hasEnoughData: false,
      collectedSamples: nutritionPairedDays,
      requiredSamples: nutritionTarget,
      progressLabel: `Събрани ${Math.min(nutritionPairedDays, nutritionTarget)}/${nutritionTarget} дни данни за хранене спрямо свежест`,
      insightText:
        'Записвай редовно протеина (g), калориите и свежестта (1–5) в „Дневен чек-ин“, за да измерим ефекта върху възстановяването.',
      evidenceText: `Текущи записи с протеин + свежест: ${nutritionPairedDays}`,
      impactDirection: 'neutral',
    });
  }

  // --------------------------------------------------------------------------
  // Pattern 3: Най-силни дни от седмицата и дни с най-висока умора
  // --------------------------------------------------------------------------
  const volumeByWeekday = new Map<string, number[]>();
  for (const w of activeWorkouts) {
    if (!w.date || w.totalVolumeKg <= 0) continue;
    const wd = getWeekdayBg(w.date);
    const list = volumeByWeekday.get(wd) ?? [];
    list.push(w.totalVolumeKg);
    volumeByWeekday.set(wd, list);
  }

  const fatigueByWeekday = new Map<string, number[]>();
  for (const d of activeLogs) {
    if (d.sleepQuality === undefined) continue;
    const wd = getWeekdayBg(d.date);
    const list = fatigueByWeekday.get(wd) ?? [];
    list.push(d.sleepQuality);
    fatigueByWeekday.set(wd, list);
  }

  const weekdayTarget = 10;
  if (activeWorkouts.length >= 6 && volumeByWeekday.size >= 3) {
    let bestDay = '';
    let bestAvgVol = -1;
    for (const [wd, vols] of volumeByWeekday.entries()) {
      const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
      if (avg > bestAvgVol) {
        bestAvgVol = avg;
        bestDay = wd;
      }
    }

    let tiredDay = '';
    let lowestFreshness = 99;
    for (const [wd, quals] of fatigueByWeekday.entries()) {
      const avg = quals.reduce((a, b) => a + b, 0) / quals.length;
      if (avg < lowestFreshness) {
        lowestFreshness = avg;
        tiredDay = wd;
      }
    }

    const fatiguePart = tiredDay
      ? `, а най-високата умора (свежест ${roundOne(lowestFreshness)}/5) — в ${tiredDay}.`
      : '.';

    patterns.push({
      id: 'pattern-weekday-peaks',
      title: 'Седмичен ритъм на силата и умората',
      category: 'Дни от седмицата',
      hasEnoughData: true,
      collectedSamples: activeWorkouts.length,
      requiredSamples: weekdayTarget,
      progressLabel: `Анализирани ${activeWorkouts.length} тренировки в ${volumeByWeekday.size} дни от седмицата`,
      insightText: `Исторически най-високият ти обем и рекорди са в ${bestDay} (ср. ${Math.round(bestAvgVol)} kg)${fatiguePart}`,
      evidenceText: `Ден пик: ${bestDay} (${Math.round(bestAvgVol)} kg обем)${tiredDay ? ` | Най-ниска свежест: ${tiredDay} (${roundOne(lowestFreshness)}/5)` : ''}`,
      impactDirection: 'positive',
    });
  } else {
    patterns.push({
      id: 'pattern-weekday-peaks',
      title: 'Седмичен ритъм на силата и умората',
      category: 'Дни от седмицата',
      hasEnoughData: false,
      collectedSamples: activeWorkouts.length,
      requiredSamples: weekdayTarget,
      progressLabel: `Събрани ${Math.min(activeWorkouts.length, weekdayTarget)}/${weekdayTarget} тренировки за профил по дни от седмицата`,
      insightText:
        'Нужни са тренировки в поне 3 различни дни от седмицата, за да определим твоя най-силен ден и деня с най-висока умора.',
      evidenceText: `Налични тренировки: ${activeWorkouts.length}`,
      impactDirection: 'neutral',
    });
  }

  // --------------------------------------------------------------------------
  // Pattern 4: Ефект на добавките / навиците върху пулса и силата
  // --------------------------------------------------------------------------
  const volumeByDate = new Map<string, number>();
  for (const w of activeWorkouts) {
    if (!w.date) continue;
    volumeByDate.set(w.date, (volumeByDate.get(w.date) ?? 0) + w.totalVolumeKg);
  }

  let bestHabitPattern: {
    habit: string;
    score: number;
    insightText: string;
    evidenceText: string;
    direction: 'positive' | 'caution' | 'neutral';
  } | null = null;

  for (const habit of habitItems) {
    const hKey = habit.trim().toLowerCase();
    const hrOn: number[] = [];
    const hrOff: number[] = [];
    const volOn: number[] = [];
    const volOff: number[] = [];

    for (const d of activeLogs) {
      if (!isDateIncludedForEveningMetric(d, todayKey, 'habits')) continue;
      const done = d.completedHabits.some(
        (c) => c.trim().toLowerCase() === hKey,
      );
      if (d.restingHr !== undefined) {
        (done ? hrOn : hrOff).push(d.restingHr);
      }
      const vol = volumeByDate.get(d.date);
      if (vol !== undefined && vol > 0) {
        (done ? volOn : volOff).push(vol);
      }
    }

    const hasVol = volOn.length >= 2 && volOff.length >= 2;
    const hasHr = hrOn.length >= 2 && hrOff.length >= 2;
    if (!hasVol && !hasHr) continue;

    const volDiffPct = hasVol
      ? roundOne(
          ((volOn.reduce((a, b) => a + b, 0) / volOn.length -
            volOff.reduce((a, b) => a + b, 0) / volOff.length) /
            (volOff.reduce((a, b) => a + b, 0) / volOff.length)) *
            100,
        )
      : 0;

    const hrDiffBpm = hasHr
      ? roundOne(
          hrOn.reduce((a, b) => a + b, 0) / hrOn.length -
            hrOff.reduce((a, b) => a + b, 0) / hrOff.length,
        )
      : 0;

    const magnitude = Math.abs(volDiffPct) + Math.abs(hrDiffBpm) * 3;
    if (!bestHabitPattern || magnitude > bestHabitPattern.score) {
      const parts: string[] = [];
      const evParts: string[] = [];
      if (hasVol) {
        parts.push(
          `тренировъчният обем е с ${volDiffPct >= 0 ? '+' : ''}${volDiffPct}%`,
        );
        evParts.push(
          `Обем с „${habit}“: ${Math.round(volOn.reduce((a, b) => a + b, 0) / volOn.length)} kg vs без: ${Math.round(volOff.reduce((a, b) => a + b, 0) / volOff.length)} kg`,
        );
      }
      if (hasHr) {
        parts.push(
          `пулсът в покой е ${hrDiffBpm <= 0 ? 'по-нисък с' : 'по-висок с'} ${Math.abs(hrDiffBpm)} bpm`,
        );
        evParts.push(
          `Пулс: ${roundOne(hrOn.reduce((a, b) => a + b, 0) / hrOn.length)} vs ${roundOne(hrOff.reduce((a, b) => a + b, 0) / hrOff.length)} bpm`,
        );
      }

      bestHabitPattern = {
        habit,
        score: magnitude,
        insightText: `При редовен прием/изпълнение на „${habit}“ ${parts.join(' и ')}.`,
        evidenceText: evParts.join(' | '),
        direction: volDiffPct > 0 || hrDiffBpm < 0 ? 'positive' : 'neutral',
      };
    }
  }

  const habitTarget = 14;
  if (bestHabitPattern) {
    patterns.push({
      id: 'pattern-habit-impact',
      title: 'Ефект на добавките и навиците',
      category: 'Навици ↔ Пулс & Сила',
      hasEnoughData: true,
      collectedSamples: activeLogs.length,
      requiredSamples: habitTarget,
      progressLabel: `Открита зависимост от ${activeLogs.length} записани дни`,
      insightText: bestHabitPattern.insightText,
      evidenceText: bestHabitPattern.evidenceText,
      impactDirection: bestHabitPattern.direction,
    });
  } else {
    patterns.push({
      id: 'pattern-habit-impact',
      title: 'Ефект на добавките и навиците',
      category: 'Навици ↔ Пулс & Сила',
      hasEnoughData: false,
      collectedSamples: activeLogs.length,
      requiredSamples: habitTarget,
      progressLabel: `Събрани ${Math.min(activeLogs.length, habitTarget)}/${habitTarget} дни данни за ефекта на добавките`,
      insightText:
        'Отбелязвай навиците (напр. Креатин, вода) и пулса в покой, за да измерим корелацията със силата и възстановяването.',
      evidenceText: `Записани дни в чек-ина: ${activeLogs.length}`,
      impactDirection: 'neutral',
    });
  }

  return patterns;
}

// ============================================================================
// 3. Умен генератор на тренировка за днес („Какво да тренирам днес?“)
// ============================================================================

const GOAL_META: Record<
  WorkoutGeneratorGoal,
  {
    label: string;
    maxExercises: number;
    setsRange: number;
    repsText: string;
    intensityPctOf1RM: number;
    restSeconds: number;
    estimatedMinutes: number;
  }
> = {
  strength: {
    label: 'Сила',
    maxExercises: 5,
    setsRange: 4,
    repsText: '4–6',
    intensityPctOf1RM: 0.84,
    restSeconds: 150,
    estimatedMinutes: 65,
  },
  hypertrophy: {
    label: 'Хипертрофия',
    maxExercises: 6,
    setsRange: 3,
    repsText: '8–12',
    intensityPctOf1RM: 0.72,
    restSeconds: 90,
    estimatedMinutes: 55,
  },
  quick_40: {
    label: 'Бърза тренировка 40 мин',
    maxExercises: 4,
    setsRange: 3,
    repsText: '8–10',
    intensityPctOf1RM: 0.74,
    restSeconds: 60,
    estimatedMinutes: 38,
  },
  recovery_deload: {
    label: 'Възстановителна / Deload',
    maxExercises: 4,
    setsRange: 2,
    repsText: '10–12',
    intensityPctOf1RM: 0.6,
    restSeconds: 90,
    estimatedMinutes: 35,
  },
};

const DETAILED_TO_COACH_GROUP: Record<
  DetailedMuscleRecoveryItem['id'],
  'chest' | 'back' | 'shoulders' | 'legs' | 'biceps' | 'triceps' | 'core'
> = {
  chest: 'chest',
  front_delts: 'shoulders',
  side_delts: 'shoulders',
  rear_delts: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'biceps',
  abs: 'core',
  traps_upper_back: 'back',
  lats: 'back',
  lower_back: 'back',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
};

const FALLBACK_FOUNDATIONAL_EXERCISES: Array<{
  title: string;
  muscleLabel: string;
}> = [
  { title: 'Bench Press (Barbell)', muscleLabel: 'Гърди' },
  { title: 'Barbell Row', muscleLabel: 'Гръб' },
  { title: 'Squat (Barbell)', muscleLabel: 'Крака' },
  { title: 'Overhead Press (Barbell)', muscleLabel: 'Рамене' },
  { title: 'Romanian Deadlift', muscleLabel: 'Задно бедро' },
  { title: 'Lat Pulldown (Cable)', muscleLabel: 'Широк гръб' },
];

export function generateOptimalWorkoutForToday(params: {
  goal: WorkoutGeneratorGoal;
  hevyWorkouts: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  coachReport: CoachAnalysisReport;
  todayKey: string;
  referenceTimestampMs?: number;
  customExerciseMappings?: CustomExerciseMappings;
}): GeneratedWorkoutPlan {
  const {
    goal,
    hevyWorkouts,
    dailyLogs = [],
    coachReport,
    referenceTimestampMs = Date.now(),
    customExerciseMappings,
  } = params;

  const meta = GOAL_META[goal];
  const recoveryItems = computeDetailedMuscleRecovery(
    hevyWorkouts,
    referenceTimestampMs,
    dailyLogs,
    customExerciseMappings,
  );
  const recoveryMap = new Map(recoveryItems.map((r) => [r.id, r]));

  const weeklySetsByCoachGroup = new Map<string, number>();
  for (const item of coachReport.weeklyVolume) {
    weeklySetsByCoachGroup.set(item.groupId, item.sets);
  }

  // Collect user's real exercise history (latest weight, best 1RM, frequency)
  const sortedDesc = [...hevyWorkouts].sort(
    (a, b) => parseWorkoutTs(b) - parseWorkoutTs(a),
  );
  const userExercises = new Map<
    string,
    {
      title: string;
      primaryDetailed: DetailedMuscleRecoveryItem['id'][];
      coachGroup: string;
      best1RM: number;
      lastMaxWeight: number;
      workoutCount: number;
    }
  >();

  for (const w of sortedDesc) {
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const working = getWorkingSets(ex.sets);
      let bestE1RM = 0;
      let maxW = 0;
      for (const s of working) {
        const wt = s.weightKg ?? 0;
        const rp = s.reps ?? 0;
        if (wt > maxW) maxW = wt;
        if (wt > 0 && rp > 0) {
          const e = calculateEpley1RM(wt, rp);
          if (e > bestE1RM) bestE1RM = e;
        }
      }

      const existing = userExercises.get(key);
      if (!existing) {
        const detailed = mapExerciseToDetailedMuscles(
          ex.title,
          customExerciseMappings,
        );
        const cls = classifyHevyExerciseMuscle(ex.title, customExerciseMappings);
        userExercises.set(key, {
          title: ex.title,
          primaryDetailed: detailed.primary,
          coachGroup: cls.groupId,
          best1RM: roundOne(bestE1RM),
          lastMaxWeight: maxW,
          workoutCount: 1,
        });
      } else {
        existing.workoutCount += 1;
        if (bestE1RM > existing.best1RM) existing.best1RM = roundOne(bestE1RM);
      }
    }
  }

  // Score each exercise from user's history
  const scoredCandidates = Array.from(userExercises.values()).map((ex) => {
    const primaryRecoveries = ex.primaryDetailed
      .map((id) => recoveryMap.get(id))
      .filter((r): r is DetailedMuscleRecoveryItem => Boolean(r));

    const allRecovered = primaryRecoveries.every((r) => r.status === 'recovered');
    const noneFatigued = primaryRecoveries.every((r) => r.status !== 'fatigued');
    const mainRecovery = primaryRecoveries[0];
    const weeklySets = weeklySetsByCoachGroup.get(ex.coachGroup) ?? 0;
    const isLagging = weeklySets < 10;

    let priorityScore = 0;
    if (goal === 'recovery_deload') {
      // Deload allows any non-acute or gently loaded muscle, prefers compound mobility/moderate
      priorityScore += noneFatigued ? 60 : 20;
      if (isLagging) priorityScore += 15;
    } else {
      if (allRecovered) priorityScore += 100;
      else if (noneFatigued) priorityScore += 35;
      else priorityScore -= 80;

      if (isLagging) priorityScore += (10 - weeklySets) * 6;
    }

    priorityScore += Math.min(20, ex.workoutCount * 2);

    return {
      ...ex,
      mainRecovery,
      weeklySets,
      allRecovered,
      noneFatigued,
      isLagging,
      priorityScore,
    };
  });

  scoredCandidates.sort((a, b) => b.priorityScore - a.priorityScore);

  const selected: GeneratedWorkoutExercise[] = [];
  const usedGroupsCount = new Map<string, number>();

  for (const cand of scoredCandidates) {
    if (selected.length >= meta.maxExercises) break;
    // If non-deload and candidate is acutely fatigued, skip if we still have alternatives
    if (
      goal !== 'recovery_deload' &&
      !cand.noneFatigued &&
      scoredCandidates.some((c) => c.noneFatigued && !selected.some((s) => s.exerciseTitle === c.title))
    ) {
      continue;
    }

    const groupUsed = usedGroupsCount.get(cand.coachGroup) ?? 0;
    if (groupUsed >= 2 && scoredCandidates.length > meta.maxExercises) {
      continue;
    }

    usedGroupsCount.set(cand.coachGroup, groupUsed + 1);

    let recommendedWeightKg: number | null = null;
    if (cand.best1RM > 0) {
      recommendedWeightKg = roundWeight25(cand.best1RM * meta.intensityPctOf1RM);
    } else if (cand.lastMaxWeight > 0) {
      recommendedWeightKg = roundWeight25(cand.lastMaxWeight);
    }

    const muscleLabel = cand.mainRecovery?.label ?? cand.coachGroup;
    const recText =
      cand.mainRecovery?.hoursSinceLast !== null &&
      cand.mainRecovery?.hoursSinceLast !== undefined
        ? `${muscleLabel} е възстановен (${cand.mainRecovery.hoursSinceLast} ч от последно)`
        : `${muscleLabel} е на 100% възстановен`;
    const volText =
      cand.weeklySets < 10
        ? `и има само ${cand.weeklySets} серии тази седмица (цел: 10–18)`
        : `и поддържа баланс (${cand.weeklySets} седм. серии)`;

    const reason =
      goal === 'recovery_deload'
        ? `Лека техника за раздвижване (~60% от 1RM) на ${muscleLabel} без нервно претоварване.`
        : `${recText} ${volText}.${cand.best1RM > 0 ? ` 1RM: ${cand.best1RM} kg.` : ''}`;

    selected.push({
      exerciseTitle: cand.title,
      targetMuscleLabel: muscleLabel,
      sets: meta.setsRange,
      repsText: meta.repsText,
      recommendedWeightKg,
      restSeconds: meta.restSeconds,
      reason,
      isFromUserHistory: true,
    });
  }

  // Ensure 4-6 exercises even if user has fewer than 4 exercises in Hevy
  if (selected.length < 4) {
    for (const fb of FALLBACK_FOUNDATIONAL_EXERCISES) {
      if (selected.length >= 4) break;
      if (selected.some((s) => s.exerciseTitle.toLowerCase() === fb.title.toLowerCase())) {
        continue;
      }
      const detailed = mapExerciseToDetailedMuscles(fb.title);
      const coachGrp =
        DETAILED_TO_COACH_GROUP[detailed.primary[0] ?? 'chest'] ?? 'chest';
      const weeklySets = weeklySetsByCoachGroup.get(coachGrp) ?? 0;
      selected.push({
        exerciseTitle: fb.title,
        targetMuscleLabel: fb.muscleLabel,
        sets: meta.setsRange,
        repsText: meta.repsText,
        recommendedWeightKg: null,
        restSeconds: meta.restSeconds,
        reason: `Базово движение за ${fb.muscleLabel} (${weeklySets} седм. серии) — добавено за балансирана сесия.`,
        isFromUserHistory: false,
      });
    }
  }

  const recoveredGroupsCount = recoveryItems.filter(
    (r) => r.status === 'recovered',
  ).length;
  const laggingLabels = coachReport.weeklyVolume
    .filter((v) => v.groupId !== 'core' && v.sets < 10)
    .map((v) => v.label);

  const focusSummary = `Възстановени зони: ${recoveredGroupsCount}/15 · Приоритет по обем (< 10 сер.): ${
    laggingLabels.length > 0 ? laggingLabels.slice(0, 3).join(', ') : 'равномерно натоварване'
  }`;

  return {
    goal,
    goalLabel: meta.label,
    estimatedMinutes: meta.estimatedMinutes,
    focusSummary,
    exercises: selected,
  };
}

export function formatGeneratedWorkoutClipboard(
  plan: GeneratedWorkoutPlan,
): string {
  const lines = [
    `Тренировка за днес — ${plan.goalLabel} (~${plan.estimatedMinutes} мин)`,
    plan.focusSummary,
    '',
  ];
  plan.exercises.forEach((ex, i) => {
    const wt =
      ex.recommendedWeightKg !== null
        ? ` с ${ex.recommendedWeightKg} kg`
        : ' (собствено тегло / усет)';
    lines.push(
      `${i + 1}. ${ex.exerciseTitle} (${ex.targetMuscleLabel}): ${ex.sets}×${ex.repsText}${wt} | Почивка: ${ex.restSeconds} сек`,
    );
    lines.push(`   ↳ ${ex.reason}`);
  });
  return lines.join('\n');
}

// ============================================================================
// 4. Офлайн „Попитай треньора“ (Интерактивен диагностичен чат)
// ============================================================================

export const COACH_QUICK_QUESTIONS: string[] = [
  'Как върви прогресът ми спрямо целта и средата?',
  'Кое упражнение да добавя или сменя тази седмица?',
  'Да тренирам ли тежко днес?',
  'Къде имам застой и как да го пробия?',
  'Време ли е за Deload седмица?',
  'Как върви балансът ми сила / тегло / кардио?',
  'Коя мускулна група изостава най-много?',
  'Какъв ми е калорийният баланс тази седмица?',
  'Достатъчно ли се движа извън залата?',
];

export function detectCoachQuestionIntent(question: string): CoachChatIntent {
  const q = question.toLowerCase();

  if (
    q.includes('спрямо целта') ||
    q.includes('средата') ||
    q.includes('скрит прогрес') ||
    q.includes('rep pr') ||
    q.includes('volume pr') ||
    q.includes('лостове') ||
    q.includes('вкъщи') ||
    q.includes('рекомпозиц') ||
    (q.includes('целта') && q.includes('прогрес'))
  ) {
    return 'goal_environment_progress';
  }
  if (
    q.includes('добавя') ||
    q.includes('сменя') ||
    q.includes('замен') ||
    q.includes('алтернатив') ||
    q.includes('упражнение') ||
    q.includes('swap')
  ) {
    return 'exercise_add_swap';
  }
  if (
    q.includes('калорийн') ||
    q.includes('дефицит') ||
    q.includes('излишък') ||
    q.includes('tdee') ||
    q.includes('изгорен') ||
    q.includes('метаболиз')
  ) {
    return 'caloric_balance';
  }
  if (
    q.includes('движа') ||
    q.includes('крачки') ||
    q.includes('neat') ||
    q.includes('разходк') ||
    q.includes('извън залата')
  ) {
    return 'neat_steps';
  }
  if (
    q.includes('застой') ||
    q.includes('пробия') ||
    q.includes('плато') ||
    q.includes('не качвам') ||
    q.includes('1rm')
  ) {
    return 'stagnation_plateau';
  }
  if (
    q.includes('deload') ||
    q.includes('делоуд') ||
    q.includes('разтовар') ||
    q.includes('почивка') ||
    q.includes('претренир')
  ) {
    return 'deload_check';
  }
  if (
    q.includes('баланс') ||
    q.includes('тегло') ||
    q.includes('кардио') ||
    q.includes('протеин') ||
    q.includes('калор') ||
    q.includes('хранене')
  ) {
    return 'strength_weight_cardio_balance';
  }
  if (
    q.includes('изостава') ||
    q.includes('мускул') ||
    q.includes('обем') ||
    q.includes('push') ||
    q.includes('pull') ||
    q.includes('дисбаланс')
  ) {
    return 'lagging_muscle';
  }
  if (
    q.includes('тежко') ||
    q.includes('днес') ||
    q.includes('готов') ||
    q.includes('тренирам')
  ) {
    return 'train_heavy_today';
  }

  return 'general_status';
}

export function answerCoachQuestion(params: {
  question: string;
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  coachReport: CoachAnalysisReport;
  readiness: AiReadinessResult;
  todayKey: string;
  dailyStepsGoal?: number;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal?: TrainingGoalPhase;
}): CoachChatResponse {
  const {
    question,
    hevyWorkouts,
    dailyLogs,
    profile,
    coachReport,
    readiness,
    todayKey,
    dailyStepsGoal = DEFAULT_DAILY_STEPS_GOAL,
    customExerciseMappings,
    trainingGoal = coachReport.trainingGoal ?? DEFAULT_TRAINING_GOAL,
  } = params;

  const intent = detectCoachQuestionIntent(question);
  const recovery = computeDetailedMuscleRecovery(
    hevyWorkouts,
    Date.now(),
    dailyLogs,
    customExerciseMappings,
  );
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, todayKey);
  const recoveredMuscles = recovery
    .filter((m) => m.status === 'recovered')
    .map((m) => m.label);
  const fatiguedMuscles = recovery
    .filter((m) => m.status === 'fatigued')
    .map((m) => m.label);

  if (intent === 'goal_environment_progress') {
    const goalMeta = TRAINING_GOAL_META_MAP[trainingGoal];
    const prIndex = buildAllWorkoutsHiddenPrIndex(
      hevyWorkouts,
      coachReport.latestBodyWeightKg,
    );
    const recentPrs = prIndex.recentEvents.slice(0, 4);

    const envCounts: Record<WorkoutEnvironment, number> = {
      gym: 0,
      street: 0,
      home: 0,
    };
    for (const w of hevyWorkouts) {
      envCounts[classifyWorkoutEnvironment(w)] += 1;
    }

    const activeEnvs = (['gym', 'street', 'home'] as WorkoutEnvironment[]).filter(
      (e) => envCounts[e] > 0,
    );

    const weightTrendTxt =
      coachReport.weightWeeklyChangePct !== null
        ? `${coachReport.weightWeeklyChangePct > 0 ? '+' : ''}${coachReport.weightWeeklyChangePct}%/седм.`
        : 'няма 2-седм. тренд';
    const calTxt =
      coachReport.avgCaloricBalance7d !== null
        ? `${coachReport.avgCaloricBalance7d > 0 ? '+' : ''}${coachReport.avgCaloricBalance7d} kcal/ден`
        : 'няма данни';
    const proteinTxt =
      coachReport.avgProteinPerKgLast5d !== null
        ? `${coachReport.avgProteinPerKgLast5d} g/kg (цел ≥ ${goalMeta.proteinThresholdGPerKg.toFixed(1)})`
        : 'няма данни';

    const prSummaryTxt =
      recentPrs.length > 0
        ? `Последни скрити рекорди: ${recentPrs
            .slice(0, 3)
            .map(
              (ev) =>
                `${WORKOUT_ENVIRONMENT_META_MAP[ev.environment].emoji} ${ev.exerciseTitle} (${ev.summaryText})`,
            )
            .join('; ')}.`
        : 'Все още няма засечени нови Rep PR / Volume PR в последните тренировки — следи повторенията на всяка работна тежест.';

    const envSummaryTxt =
      activeEnvs.length > 0
        ? `Разпознати среди: ${activeEnvs
            .map((e) => `${WORKOUT_ENVIRONMENT_META_MAP[e].badgeLabel} (${envCounts[e]} тр.)`)
            .join(', ')}.`
        : 'Няма импортирани тренировки за анализ по среда.';

    const actionSteps: string[] = [];
    if (trainingGoal === 'hypertrophy') {
      actionSteps.push(
        `Цел ${goalMeta.buttonLabel}: стреми се към лек излишък (+100..+300 kcal/ден) и протеин ≥ 1.6 g/kg. Ако теглото не мърда 2 седмици, добави +200 kcal.`,
      );
    } else if (trainingGoal === 'maintenance') {
      actionSteps.push(
        `Цел ${goalMeta.buttonLabel}: задръж теглото в ±0.25 kg/седм. с протеин ≥ 1.8 g/kg и гони нови Rep PR и по-висок 1RM/BW.`,
      );
    } else {
      actionSteps.push(
        `Цел ${goalMeta.buttonLabel}: пази темп -0.3% до -0.8%/седм. и протеин ≥ 1.8 g/kg — задържането на работните тежести и повторения е победа; при спад на силата > 5% намали дефицита или обема.`,
      );
    }

    if (envCounts.gym > 0) {
      actionSteps.push(
        '🏋️ Зала: атакувай микро-натоварване (+1.25 / +2.5 kg), когато всички работни серии са ≥ 8 повт. при RPE ≤ 8.5.',
      );
    }
    if (envCounts.street > 0) {
      actionSteps.push(
        '🤸 Лостове: гони +1–2 чисти повторения, пауза горе (2 сек.), L-sit вариации или добавена тежест с раница/колан (+2.5–5 kg).',
      );
    }
    if (envCounts.home > 0) {
      actionSteps.push(
        '🏠 Вкъщи: прогресирай чрез +1–2 повторения на серия, бавно 3-секундно спускане, по-кратка почивка или по-труден вариант (напр. диамантени / с вдигнати крака лицеви).',
      );
    }
    if (activeEnvs.length === 0) {
      actionSteps.push(
        'Импортирай Hevy тренировки или запиши тренировка, за да разделим автоматично прогреса по Зала, Лостове и Вкъщи.',
      );
    }

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: `${goalMeta.buttonLabel} · ${prIndex.recentEvents.length} засечени Rep/Volume PR · ${
        activeEnvs.length > 0
          ? activeEnvs.map((e) => WORKOUT_ENVIRONMENT_META_MAP[e].badgeLabel).join(' / ')
          : 'Без активни среди'
      }`,
      analysis: `Активна фаза: ${goalMeta.label} (тегло: ${weightTrendTxt}, 7-дн. калориен баланс: ${calTxt}, протеин: ${proteinTxt}). ${envSummaryTxt} ${prSummaryTxt}`,
      metrics: [
        `Режим: ${goalMeta.shortLabel}`,
        `Rep/Volume PR: ${prIndex.recentEvents.length}`,
        `Протеин: ${proteinTxt}`,
        `Среди: Зала ${envCounts.gym} · Лостове ${envCounts.street} · Вкъщи ${envCounts.home}`,
      ],
      actionSteps,
    };
  }

  if (intent === 'exercise_add_swap') {
    const rec = buildExerciseRecommendations({
      hevyWorkouts,
      dailyLogs,
      profileWeightKg: profile.weightKg,
      todayKey,
      customExerciseMappings,
      trainingGoal,
    });

    if (hevyWorkouts.length === 0) {
      return {
        id: `chat-${Date.now()}`,
        question,
        intent,
        headline: 'Импортирай тренировки от Hevy за конкретни препоръки за добавяне и смяна',
        analysis:
          'Двигателят за упражнения анализира работните ти серии по детайлни мускулни зони (посл. 7 дни) и търси застой в 1RM през последните 3 поредни сесии.',
        metrics: ['Тренировки в Hevy: 0', 'Каталог упражнения: 29 базови и изолиращи'],
        actionSteps: [
          'Качи CSV файла от Hevy в „Дневен запис“ или „Тренировки (Hevy)“.',
          'След импорта ще видиш точни предложения за добавяне при дефицит (< 6 серии) и 4-седмична замяна при плато.',
        ],
      };
    }

    const topAdd = rec.addRecommendations[0];
    const topSwap = rec.swapRecommendations[0];

    const headlineParts: string[] = [];
    if (topAdd) {
      const exList = topAdd.exercises
        .map((e) => `${e.hevyName} (${e.sets}×${e.reps})`)
        .join(' / ');
      headlineParts.push(`ДОБАВИ: ${exList}`);
    }
    if (topSwap) {
      const alt = topSwap.alternatives[0];
      headlineParts.push(
        `СМЕНИ ${topSwap.stalledExerciseTitle} → ${alt ? alt.hevyName : 'нова вариация'}`,
      );
    }

    const headline =
      headlineParts.length > 0
        ? headlineParts.join(' · ')
        : 'Обемът е балансиран и няма засечен 3-сесиен застой — продължи прогресията';

    const analysisParts: string[] = [];
    if (topAdd) {
      analysisParts.push(`Дефицит/дисбаланс: ${topAdd.message}`);
    }
    if (topSwap) {
      const altText = topSwap.alternatives
        .map((a) => `${a.hevyName} (${a.sets}×${a.reps}, ${a.weightLabel})`)
        .join(' или ');
      analysisParts.push(
        `Застой (${topSwap.stalledExerciseTitle}, 1RM: ${topSwap.lastThreeE1RMs.join(
          ' → ',
        )} kg): замени за 4 седмици с ${altText}.`,
      );
    }
    if (analysisParts.length === 0) {
      analysisParts.push(
        `За последните 7 дни имаш Push ${rec.pushSets7d} сер. / Pull ${rec.pullSets7d} сер. без изоставащи зони под 6 серии и без 3-сесийно плато в 1RM.`,
      );
    }

    const metrics: string[] = [
      `Push / Pull (7 д.): ${rec.pushSets7d} / ${rec.pullSets7d} сер.`,
      `Изоставащи зони (<6 сер.): ${rec.addRecommendations.length}`,
      `Упражнения в застой (3 сесии): ${rec.swapRecommendations.length}`,
    ];
    if (topSwap?.alternatives[0]) {
      metrics.push(
        `Стартова тежест (${topSwap.alternatives[0].hevyName}): ${topSwap.alternatives[0].weightLabel}`,
      );
    }

    const actionSteps: string[] = [];
    for (const addCard of rec.addRecommendations.slice(0, 2)) {
      actionSteps.push(
        `ДОБАВИ (${addCard.subgroupLabel}): ${addCard.exercises
          .map((e) => `${e.hevyName} (${e.sets}×${e.reps})`)
          .join(' или ')} — ${addCard.sets7d} сер. за последните 7 дни.`,
      );
    }
    for (const swapCard of rec.swapRecommendations.slice(0, 2)) {
      const alt = swapCard.alternatives[0];
      if (alt) {
        actionSteps.push(
          `СМЕНИ за 4 седмици: ${swapCard.stalledExerciseTitle} → ${alt.hevyName} (${alt.sets}×${alt.reps}, старт: ${alt.weightLabel}).`,
        );
      }
    }
    if (actionSteps.length === 0) {
      actionSteps.push(
        'Запази текущата програма и увеличи тежестта с +2.5 kg или +1 повторение на основните базови упражнения.',
      );
    }

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline,
      analysis: analysisParts.join(' '),
      metrics,
      actionSteps,
    };
  }

  if (intent === 'caloric_balance') {
    const validEnergyAsc = [...dailyLogs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter(
        (d) =>
          isDateIncludedForEveningMetric(d, todayKey, 'caloriesIntake') ||
          isDateIncludedForEveningMetric(d, todayKey, 'activeCalories') ||
          isDateIncludedForEveningMetric(d, todayKey, 'tdee'),
      );
    const energyAnchor = resolveEveningWindowEndDate(
      dailyLogs,
      todayKey,
      'energy',
    );
    const start7d = shiftDate(energyAnchor, -6);
    const recentLogs = validEnergyAsc.filter(
      (d) => d.date >= start7d && d.date <= energyAnchor,
    );
    const activeSlice =
      recentLogs.length > 0 ? recentLogs : validEnergyAsc.slice(-7);

    const intakes: number[] = [];
    const actives: number[] = [];
    const tdees: number[] = [];
    const nets: number[] = [];
    for (const d of activeSlice) {
      const includeIntake = isDateIncludedForEveningMetric(
        d,
        todayKey,
        'caloriesIntake',
      );
      const includeActive = isDateIncludedForEveningMetric(
        d,
        todayKey,
        'activeCalories',
      );
      const includeTdee = isDateIncludedForEveningMetric(d, todayKey, 'tdee');

      const s = computeDailyEnergySummary({
        caloriesIntake: includeIntake ? d.caloriesKcal : undefined,
        activeCalories: includeActive ? d.activeCalories : undefined,
        restingCalories: includeTdee ? d.restingCalories : undefined,
        weightKg: d.weightKg ?? coachReport.latestBodyWeightKg,
        heightCm: profile.heightCm,
      });
      if (includeIntake && s.caloriesIntake !== null) intakes.push(s.caloriesIntake);
      if (includeActive && s.activeCalories !== null) actives.push(s.activeCalories);
      if (includeTdee && s.tdee !== null) tdees.push(s.tdee);
      if (includeIntake && includeTdee && s.netBalance !== null) {
        nets.push(s.netBalance);
      }
    }

    const avgIntake =
      intakes.length > 0
        ? Math.round(intakes.reduce((a, b) => a + b, 0) / intakes.length)
        : null;
    const avgActive =
      actives.length > 0
        ? Math.round(actives.reduce((a, b) => a + b, 0) / actives.length)
        : coachReport.avgActiveCalories7d;
    const avgTdee =
      tdees.length > 0
        ? Math.round(tdees.reduce((a, b) => a + b, 0) / tdees.length)
        : coachReport.avgTdee7d;
    const avgNet =
      nets.length > 0
        ? Math.round(nets.reduce((a, b) => a + b, 0) / nets.length)
        : coachReport.avgCaloricBalance7d;

    const netLabel =
      avgNet === null
        ? 'няма достатъчно данни'
        : avgNet < -50
          ? `Дефицит ${avgNet} kcal/ден`
          : avgNet > 50
            ? `Излишък +${avgNet} kcal/ден`
            : `Баланс ${avgNet > 0 ? `+${avgNet}` : avgNet} kcal/ден`;

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline:
        avgNet !== null
          ? `Седмичен калориен баланс: ${netLabel}`
          : 'Няма достатъчно данни за изчисление на седмичния калориен баланс',
      analysis:
        avgNet !== null
          ? `Средно за периода приемаш ${avgIntake ?? '—'} kcal/ден при общ разход (TDEE) ${avgTdee ?? '—'} kcal/ден (от които ${avgActive ?? '—'} kcal активни от часовника). Нетният баланс е ${netLabel}${
              coachReport.weightWeeklyChangePct !== null
                ? `, а 7-дневното средно тегло се променя с ${coachReport.weightWeeklyChangePct > 0 ? '+' : ''}${coachReport.weightWeeklyChangePct}%/седм.`
                : '.'
            }`
          : 'За да изчислим реалния енергиен баланс, запиши в „Дневен чек-ин“ приетите калории от храна и активните калории от смарт часовника.',
      metrics: [
        `Нетен баланс: ${netLabel}`,
        `Приети ср.: ${avgIntake !== null ? `${avgIntake} kcal` : '—'}`,
        `Активни ср.: ${avgActive !== null ? `${avgActive} kcal` : '—'}`,
        `TDEE ср.: ${avgTdee !== null ? `${avgTdee} kcal` : '—'}`,
      ],
      actionSteps:
        avgNet === null
          ? [
              'Отвори „Дневен чек-ин“ и въведи приетите калории и активните калории от часовника за днес.',
              'Запиши и сутрешното си тегло, за да можем да изчислим автоматично калориите в покой (Mifflin-St Jeor).',
            ]
          : avgNet < -750
            ? [
                'Дефицитът е прекалено агресивен (> 750 kcal/ден) — вдигни приема с +300–400 kcal, за да избегнеш загуба на мускулна маса.',
                'Запази протеина ≥ 1.8–2.0 g/kg и следи 1RM в Hevy.',
              ]
            : avgNet <= -250
              ? [
                  'Добър контролиран дефицит за чисто релефиране — следи 7-дневното тегло да спада с 0.3–0.7% седмично.',
                  'Поддържай средно ≥ 8 000–10 000 крачки/ден, за да не спада NEAT.',
                ]
              : [
                  'Запази протеина ≥ 1.6 g/kg и коригирай приема с ±200 kcal според целта си (покачване или сваляне).',
                  'Проверявай 14–30 дневната графика „Приети vs Изгорени калории“ в „Дневен чек-ин“.',
                ],
    };
  }

  if (intent === 'neat_steps') {
    const avg4 = coachReport.avgSteps4d;
    const avg7 = coachReport.avgSteps7d;
    const avgActive = coachReport.avgActiveCalories7d;
    const latest24 = coachReport.latestSteps24h;

    const isLowNeat = avg4 !== null && avg4 < 6000;
    const isHighNeat = avg4 !== null && avg4 >= dailyStepsGoal;

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline:
        avg4 === null
          ? 'Няма записани дневни крачки в „Дневен чек-ин“'
          : isLowNeat
            ? `Недостатъчна активност (NEAT): средно ${avg4.toLocaleString('bg-BG')} крачки/ден (под 6 000)`
            : isHighNeat
              ? `Отлична ежедневна активност: средно ${avg4.toLocaleString('bg-BG')} крачки/ден (над целта ${dailyStepsGoal.toLocaleString('bg-BG')})`
              : `Умерена активност извън залата: средно ${avg4.toLocaleString('bg-BG')} крачки/ден (цел: ${dailyStepsGoal.toLocaleString('bg-BG')})`,
      analysis:
        avg4 !== null
          ? `Средните крачки за последните 4 дни са ${avg4.toLocaleString('bg-BG')}/ден (7-дн. средно: ${avg7 !== null ? avg7.toLocaleString('bg-BG') : '—'}/ден), при средно ${avgActive !== null ? `${avgActive} kcal` : '—'} активни калории от часовника.${
              latest24 !== null && latest24 > 14000
                ? ` През последните 24 ч си направил ${latest24.toLocaleString('bg-BG')} крачки — това увеличава умората в краката.`
                : ''
            }`
          : 'Започни да въвеждаш дневните крачки и активните калории от смарт часовника в „Дневен чек-ин“, за да следим NEAT.',
      metrics: [
        `Ср. крачки (4 д.): ${avg4 !== null ? avg4.toLocaleString('bg-BG') : '—'}`,
        `Ср. крачки (7 д.): ${avg7 !== null ? avg7.toLocaleString('bg-BG') : '—'}`,
        `Цел крачки: ${dailyStepsGoal.toLocaleString('bg-BG')}`,
        `Активни калории (7 д.): ${avgActive !== null ? `${avgActive} kcal` : '—'}`,
      ],
      actionSteps:
        avg4 === null
          ? [
              'Въведи днешните крачки от Huawei / Galaxy Watch в „Дневен чек-ин“.',
              'Настрой своята дневна цел за крачки (по подразбиране 10 000).',
            ]
          : isLowNeat
            ? [
                'Добави 20-минутна бърза разходка след хранене (~2 200 крачки), за да вдигнеш разхода на енергия.',
                'Стреми се към поне 8 000–10 000 крачки/ден, особено при калориен дефицит.',
              ]
            : [
                'Поддържай постоянство в ежедневните крачки спрямо целта си.',
                'В дните с над 14 000 крачки оставяй повече време за възстановяване преди/след тежка тренировка за крака.',
              ],
    };
  }

  if (intent === 'train_heavy_today') {
    const canGoHeavy = readiness.score >= 70;
    const sleepTxt =
      readiness.factors.avgSleepHours48h !== null
        ? `${readiness.factors.avgSleepHours48h} ч`
        : 'няма запис';
    const rhrTxt =
      readiness.factors.latestRestingHr !== null
        ? `${readiness.factors.latestRestingHr} bpm (${
            readiness.factors.rhrDeltaBpm !== null
              ? `${readiness.factors.rhrDeltaBpm > 0 ? '+' : ''}${readiness.factors.rhrDeltaBpm} от ср.`
              : 'база'
          })`
        : 'няма запис';
    const acwrTxt =
      acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : 'няма база';

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: canGoHeavy
        ? `Да — готовността е ${readiness.score}/100 (зелена светлина за тежки серии)`
        : `По-скоро не — готовността е ${readiness.score}/100 (избегни отказите днес)`,
      analysis: canGoHeavy
        ? `Сън (посл. 48ч): ${sleepTxt}, пулс в покой: ${rhrTxt}, ACWR: ${acwrTxt}. Възстановени мускули: ${recoveredMuscles.slice(0, 5).join(', ') || 'всички'}.`
        : `Тялото отчита понижена готовност (${readiness.score}/100) при сън ${sleepTxt}, пулс ${rhrTxt} и ACWR ${acwrTxt}. ${
            fatiguedMuscles.length > 0
              ? `Все още уморени зони: ${fatiguedMuscles.join(', ')}.`
              : ''
          }`,
      metrics: [
        `AI Готовност: ${readiness.score}/100`,
        `Сън (48ч): ${sleepTxt}`,
        `Пулс: ${rhrTxt}`,
        `ACWR: ${acwrTxt}`,
      ],
      actionSteps: canGoHeavy
        ? [
            `Фокусирай се върху напълно възстановените групи (${recoveredMuscles.slice(0, 4).join(', ')}).`,
            'Използвай Авто-коректора или „Победи дневника“ за +2.5 kg на първото базово упражнение.',
            'Запази 1–2 повторения резерв на изолиращите движения, за да поддържаш ACWR в Sweet Spot.',
          ]
        : [
            'Използвай бутона „Адаптирай днешната ми тренировка“, за да свалиш сериите с 25% и тежестите с 5–7%.',
            'Работи на RPE 6.5–7.5 без серии до отказ и легни с 30–45 мин по-рано тази вечер.',
            'Насочи се единствено към напълно възстановени зони.',
          ],
    };
  }

  if (intent === 'stagnation_plateau') {
    const plateauCards = coachReport.cards.filter((c) =>
      c.id.startsWith('plateau-'),
    );
    const readyUpCards = coachReport.cards.filter((c) =>
      c.id.startsWith('progress-up-'),
    );

    if (plateauCards.length === 0) {
      return {
        id: `chat-${Date.now()}`,
        question,
        intent,
        headline: 'Няма критичен 3-сесиен застой в текущите Hevy данни',
        analysis:
          readyUpCards.length > 0
            ? `Нито едно упражнение няма 3 поредни сесии без прогрес в 1RM. Напротив — имаш ${readyUpCards.length} упражнения, готови за +2.5 kg прогресия.`
            : 'В последните импортирани тренировки не се засича трисесиен спад или застой на 1RM. Продължи с двойна прогресия (+1 повт. докато стигнеш 8+ повторения).',
        metrics: [
          `Открити застои: 0`,
          `Готови за +2.5 kg: ${readyUpCards.length}`,
          `Импортирани тренировки: ${hevyWorkouts.length}`,
        ],
        actionSteps: [
          'Отвори „Победи дневника“, за да видиш точните микро-цели (+1 повторение или +2.5 kg) за следващата сесия.',
          'Записвай RPE на работните серии в Hevy, за да засичаме умората преди да стигнеш застой.',
        ],
      };
    }

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: `Открит е застой при ${plateauCards.length} ${
        plateauCards.length === 1 ? 'упражнение' : 'упражнения'
      } (3+ поредни сесии без ръст на 1RM)`,
      analysis: plateauCards
        .map((c) => `${c.title}: ${c.evidence}`)
        .join(' | '),
      metrics: [
        `Открити застои: ${plateauCards.length}`,
        `Готови за +2.5 kg: ${readyUpCards.length}`,
        ...plateauCards.map((c) => c.evidence),
      ],
      actionSteps: [
        'Приложи „вълнообразна смяна“ на диапазона: ако си бил на 8–10 повт., мини за 3 седмици на 5–6 тежки повторения (или обратно към 10–12 за хипертрофия).',
        'Направи 1 микро-разтоварване (Deload на тези упражнения с -15% тежест за 1 тренировка) или смени варианта (напр. щанга → дъмбели с пауза).',
        coachReport.avgProteinPerKgLast5d !== null &&
        coachReport.avgProteinPerKgLast5d < 1.6
          ? `Увеличи протеина от ${coachReport.avgProteinPerKgLast5d} g/kg до ≥ 1.6 g/kg, за да подкрепиш адаптацията.`
          : 'Провери дали спиш ≥ 7.5 ч. преди дните с тези базови движения.',
      ],
    };
  }

  if (intent === 'deload_check') {
    const highAcwr = acwrReport.acwr !== null && acwrReport.acwr > 1.35;
    const lowReadiness = readiness.score < 58;
    const highRhr =
      readiness.factors.rhrDeltaBpm !== null && readiness.factors.rhrDeltaBpm >= 4;
    const longStreak = readiness.factors.consecutiveTrainingDays >= 4;

    // Count recent average RPE across last 3 workouts
    const recent3 = [...hevyWorkouts]
      .sort((a, b) => parseWorkoutTs(b) - parseWorkoutTs(a))
      .slice(0, 3);
    const rpes: number[] = [];
    for (const w of recent3) {
      for (const ex of w.exercises) {
        for (const s of getWorkingSets(ex.sets)) {
          if (s.rpe !== undefined && s.rpe > 0) rpes.push(s.rpe);
        }
      }
    }
    const avgRecentRpe =
      rpes.length > 0 ? roundOne(rpes.reduce((a, b) => a + b, 0) / rpes.length) : null;
    const highRpeTrigger = avgRecentRpe !== null && avgRecentRpe >= 8.8;

    const triggersCount = [
      highAcwr,
      lowReadiness,
      highRhr,
      longStreak,
      highRpeTrigger,
    ].filter(Boolean).length;
    const needsDeload = triggersCount >= 2 || (acwrReport.acwr ?? 0) > 1.5;

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: needsDeload
        ? 'Да — силно препоръчителна е Deload / разтоварваща седмица'
        : 'Все още не е нужен пълен Deload — натоварването е под контрол',
      analysis: `Засечени маркери за умора (${triggersCount}/5): AI готовност ${readiness.score}/100, ACWR ${
        acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : '—'
      }, среден RPE (посл. 3 тр.) ${avgRecentRpe ?? '—'}, поредни тренировъчни дни: ${readiness.factors.consecutiveTrainingDays}.`,
      metrics: [
        `Готовност: ${readiness.score}/100`,
        `ACWR: ${acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : '—'}`,
        `Ср. RPE (3 тр.): ${avgRecentRpe ?? '—'}`,
        `Поредни дни: ${readiness.factors.consecutiveTrainingDays}`,
      ],
      actionSteps: needsDeload
        ? [
            'Намали работните серии с 40–50% за следващите 5–7 дни и свали тежестите на 65–70% от обичайните.',
            'Избери цел „Възстановителна / Deload“ в Генератора на тренировки по-долу.',
            'Следи пулса в покой да се върне към 14-дневната ти база преди да качиш отново обема.',
          ]
        : [
            'Поддържай ACWR в златната среда 0.8–1.3 и включвай поне 1–2 почивни дни седмично.',
            'Ако средният RPE надвиши 9.0 за 2 поредни седмици, планирай 5-дневен Deload.',
          ],
    };
  }

  if (intent === 'strength_weight_cardio_balance') {
    const running = computeRunningStandards(dailyLogs);
    const run5k = running.find((r) => r.distanceTargetKm === 5);
    const weightTxt =
      coachReport.latestBodyWeightKg !== null
        ? `${coachReport.latestBodyWeightKg} kg`
        : 'няма запис';
    const weightDeltaTxt =
      coachReport.weightWeeklyChangePct !== null
        ? `${coachReport.weightWeeklyChangePct > 0 ? '+' : ''}${coachReport.weightWeeklyChangePct}%/седм.`
        : 'няма 2-седмичен тренд';
    const proteinTxt =
      coachReport.avgProteinLast5d !== null
        ? `${coachReport.avgProteinLast5d} g/ден (${coachReport.avgProteinPerKgLast5d ?? '—'} g/kg)`
        : 'няма запис';
    const cardioTxt = run5k
      ? `5 km темпо ${run5k.paceText} (${run5k.tierLabel})`
      : 'няма записани бягания';

    const totalKmRecent = roundOne(
      dailyLogs.slice(0, 7).reduce((s, d) => s + (d.cardioDistanceKm ?? 0), 0),
    );

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: `Баланс Сила / Тегло / Кардио: Тегло ${weightTxt} (${weightDeltaTxt}) · ACWR ${acwrReport.strengthSharePct}% сила / ${acwrReport.cardioSharePct}% кардио`,
      analysis: `Тегло: ${weightTxt} (${weightDeltaTxt}), Протеин: ${proteinTxt}, Кардио (посл. 7 записа): ${totalKmRecent} km (${cardioTxt}). Относителни силови постижения: ${coachReport.relativeStrength.length} упражнения с изчислен 1RM/BW.`,
      metrics: [
        `Тегло: ${weightTxt} (${weightDeltaTxt})`,
        `Протеин: ${proteinTxt}`,
        `Сила/Кардио дял: ${acwrReport.strengthSharePct}% / ${acwrReport.cardioSharePct}%`,
        `Кардио: ${cardioTxt}`,
      ],
      actionSteps: [
        coachReport.avgProteinPerKgLast5d !== null &&
        coachReport.avgProteinPerKgLast5d < 1.6 &&
        coachReport.latestBodyWeightKg !== null
          ? `Увеличи протеина до поне ${Math.round(coachReport.latestBodyWeightKg * 1.6)} g/ден (1.6 g/kg).`
          : 'Запази приема на протеин над 1.6–2.0 g/kg и следи седмичната промяна в теглото да е в ±0.5%.',
        'Разделяй дългите бягания (≥ 6 km) с поне 36–48 часа от тежките тренировки за крака.',
        'Проверявай „Нива на сила и хибридни цели“ в Анализ и Подготовка за следене на 1RM/BW и 5 km/10 km темпото.',
      ],
    };
  }

  if (intent === 'lagging_muscle') {
    const sortedVolume = [...coachReport.weeklyVolume]
      .filter((g) => g.groupId !== 'core')
      .sort((a, b) => a.sets - b.sets);
    const lowest = sortedVolume[0];
    const secondLowest = sortedVolume[1];
    const pushPullTxt =
      coachReport.pushPullDiffPercent !== null
        ? `Push ${coachReport.pushSets7d} сер. vs Pull ${coachReport.pullSets7d} сер. (${coachReport.pushPullDiffPercent}% разлика)`
        : `Push ${coachReport.pushSets7d} сер. / Pull ${coachReport.pullSets7d} сер.`;

    return {
      id: `chat-${Date.now()}`,
      question,
      intent,
      headline: lowest
        ? `Най-изоставаща група: ${lowest.label} (${lowest.sets} серии за последните 7 дни)`
        : 'Няма достатъчно Hevy серии за седмичен анализ на групите',
      analysis: lowest
        ? `Оптималният обем за хипертрофия е 10–18 работни серии седмично. Най-нисък обем имат ${lowest.label} (${lowest.sets} сер.) и ${secondLowest?.label ?? '—'} (${secondLowest?.sets ?? 0} сер.). Балансът е: ${pushPullTxt}.`
        : 'Импортирай тренировки от Hevy, за да сравним обема по мускулни групи и съотношението Бутащи/Дърпащи.',
      metrics: [
        ...sortedVolume.slice(0, 4).map((g) => `${g.label}: ${g.sets} сер.`),
        `Push/Pull: ${coachReport.pushSets7d}/${coachReport.pullSets7d}`,
      ],
      actionSteps: lowest
        ? [
            `Добави 4–6 работни серии за ${lowest.label} в следващите 2 тренировки, за да влезеш в зоната 10–18 серии.`,
            coachReport.pushPullDiffPercent !== null &&
            coachReport.pushPullDiffPercent > 35
              ? `Намали дисбаланса (${pushPullTxt}), като приоритизираш ${
                  coachReport.pushSets7d > coachReport.pullSets7d ? 'дърпащи' : 'бутащи'
                } упражнения.`
              : 'Използвай Умния генератор на тренировка по-долу — той автоматично ще постави най-изоставащите възстановени групи на първо място.',
          ]
        : ['Импортирай поне 1 седмица тренировки от Hevy CSV.'],
    };
  }

  // General status fallback
  return {
    id: `chat-${Date.now()}`,
    question,
    intent: 'general_status',
    headline: `Обобщена диагностика: AI Готовност ${readiness.score}/100 · ${coachReport.cards.length} активни препоръки`,
    analysis: `${readiness.diagnosisHeadline}. Възстановени мускули: ${recoveredMuscles.length}/15. ACWR: ${
      acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : '—'
    }. Импортирани тренировки: ${hevyWorkouts.length}, Чек-ин записи: ${dailyLogs.length}.`,
    metrics: [
      `Готовност: ${readiness.score}/100`,
      `Възстановени зони: ${recoveredMuscles.length}/15`,
      `ACWR: ${acwrReport.acwr !== null ? acwrReport.acwr.toFixed(2) : '—'}`,
    ],
    actionSteps: [
      'Избери един от бързите въпроси по-горе или напиши конкретен въпрос (напр. за застой, Deload, тегло или мускулна група).',
      'Използвай „Генерирай оптимална тренировка“ по-долу според текущата си цел.',
    ],
  };
}
