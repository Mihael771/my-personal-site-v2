import type {
  DailyBiometricLog,
  HevyExercise,
  HevyWorkout,
  TrainingGoalPhase,
  UserProfile,
} from '../types/fitness';
import { computeAcwrReport } from './analysisPrep';
import {
  computeDailyEnergySummary,
  isDateIncludedForEveningMetric,
} from './dailyLogs';
import { classifyHabitPolarity } from './habitBodyImpact';
import { isBoxingWorkout } from './relativeStrengthAndBiorhythm';
import { analyzeTribulusUsage, hasTribulusInLog } from './testosteroneAndHabits';

export type AnabolicZone = 'high' | 'moderate' | 'low';

export type FactorImpactDirection = 'lifting' | 'neutral' | 'dragging';

export type AnabolicFactorId = 'sleep' | 'training' | 'nutrition' | 'habits';

export interface AnabolicFactorBreakdown {
  id: AnabolicFactorId;
  title: string;
  shortTitle: string;
  weightPct: 30 | 25 | 20;
  score: number; // 0-100
  weightedPoints: number;
  direction: FactorImpactDirection;
  directionLabel: string;
  headline: string;
  metricsLine: string;
  detail: string;
  hasData: boolean;
}

export interface AnabolicAction48h {
  id: string;
  rank: 1 | 2 | 3;
  factorId: AnabolicFactorId;
  title: string;
  rationale: string;
  evidence: string;
  impactLabel: string;
}

export interface TestosteroneGoalImpactCopy {
  goal: TrainingGoalPhase;
  goalLabel: string;
  lowText: string;
  highText: string;
}

export interface AnabolicComparisonCategory {
  id: 'mind_energy' | 'body_recovery' | 'active_goal';
  emoji: string;
  title: string;
  lowPoints: string[];
  highPoints: string[];
}

export interface AnabolicTribulusSnapshot {
  streakDays: number;
  streakWeeks: number;
  daysLast7d: number;
  needsCycleBreak: boolean;
  sleepQualityWith: number | null;
  sleepQualityWithout: number | null;
  energyDelta: number | null;
  summaryText: string;
}

export interface AnabolicEnvironmentReport {
  totalScore: number; // 0-100
  zone: AnabolicZone;
  zoneEmoji: string;
  zoneTitle: string;
  zoneSubtitle: string;
  disclaimerNote: string;
  hasAnyData: boolean;
  factors: AnabolicFactorBreakdown[];
  strongestFactor: AnabolicFactorBreakdown;
  weakestFactor: AnabolicFactorBreakdown;
  actions48h: AnabolicAction48h[];
  comparisonCategories: AnabolicComparisonCategory[];
  goalImpact: TestosteroneGoalImpactCopy;
  tribulus: AnabolicTribulusSnapshot;
  cleanHabitStreakDays: number;
  harmfulHabitDays7d: number;
  compoundSessions7d: number;
  acwrValue: number | null;
  consecutiveHeavyDays: number;
  avgSleepHours7d: number | null;
  avgProteinPerKg7d: number | null;
  avgCaloricBalance7d: number | null;
  windowStartDate: string;
  windowEndDate: string;
  todayDate: string;
}

export const ANABOLIC_LAB_DISCLAIMER =
  'Индексът измерва физиологичните фактори от последните 7 завършени дни до вчера (сън, силов стимул, ACWR, хранене и навици), които естествено подкрепят или потискат собствения тестостерон спрямо кортизола и определят средата ти днес. Точните хормонални стойности (общ/свободен тестостерон, SHBG, кортизол) се проверяват единствено чрез кръвни лабораторни изследвания.';

const HEAVY_COMPOUND_PATTERNS: Array<{ id: string; label: string; regex: RegExp; weightedBodyweight?: boolean }> = [
  {
    id: 'squat',
    label: 'Клек',
    regex: /\b(squat|back squat|front squat|hack squat|bulgarian split squat)\b|клек/i,
  },
  {
    id: 'deadlift',
    label: 'Мъртва тяга',
    regex: /\b(deadlift|romanian deadlift|rdl|sumo deadlift|trap bar)\b|мъртва тяга|тяга/i,
  },
  {
    id: 'bench',
    label: 'Лежанка',
    regex: /\b(bench press|incline bench|dumbbell bench|floor press)\b|лежанка|изтласкване от лег/i,
  },
  {
    id: 'pullup',
    label: 'Набирания',
    regex: /\b(pull[\s-]?up|chin[\s-]?up|weighted pull|weighted chin)\b|набирани/i,
    weightedBodyweight: true,
  },
  {
    id: 'dip',
    label: 'Кофички',
    regex: /\b(dip|chest dip|triceps dip|weighted dip)\b|кофичк/i,
    weightedBodyweight: true,
  },
  {
    id: 'ohp',
    label: 'Военна преса',
    regex: /\b(overhead press|military press|barbell shoulder press)\b|военна преса|раменна преса с щанга/i,
  },
];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
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

function getWorkingSetsCount(ex: HevyExercise): number {
  const nonWarmup = ex.sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup.length : ex.sets.length;
}

function isHeavyCompoundExercise(ex: HevyExercise): { matched: boolean; label: string; isWeightedBw: boolean } {
  const title = ex.title || '';
  for (const p of HEAVY_COMPOUND_PATTERNS) {
    if (p.regex.test(title)) {
      const setsCount = getWorkingSetsCount(ex);
      if (setsCount < 2) continue;
      if (p.weightedBodyweight) {
        const hasAddedWeight = ex.sets.some((s) => (s.weightKg ?? 0) > 0);
        return { matched: true, label: p.label, isWeightedBw: hasAddedWeight };
      }
      return { matched: true, label: p.label, isWeightedBw: false };
    }
  }
  return { matched: false, label: '', isWeightedBw: false };
}

function getDirection(score: number): { direction: FactorImpactDirection; label: string } {
  if (score >= 75) {
    return { direction: 'lifting', label: '▲ Качва резултата' };
  }
  if (score >= 52) {
    return { direction: 'neutral', label: '● Стабилен / резерв' };
  }
  return { direction: 'dragging', label: '▼ Дърпа надолу' };
}

function resolveLatestBodyWeight(
  dailyLogs: DailyBiometricLog[],
  todayKey: string,
  profileWeightKg?: number | '',
): number | null {
  const recent = dailyLogs
    .filter((d) => d.date <= todayKey && typeof d.weightKg === 'number' && d.weightKg > 30)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (recent.length > 0 && recent[0].weightKg) {
    return recent[0].weightKg;
  }
  if (typeof profileWeightKg === 'number' && profileWeightKg > 30) {
    return profileWeightKg;
  }
  return null;
}

function countConsecutiveCleanHabitDays(
  dailyLogs: DailyBiometricLog[],
  todayKey: string,
): number {
  const byDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    byDate.set(log.date, log);
  }

  let anchor = todayKey;
  if (!byDate.has(anchor)) {
    const yest = shiftDate(todayKey, -1);
    if (byDate.has(yest)) {
      anchor = yest;
    } else {
      return 0;
    }
  }

  let streak = 0;
  let cursor = anchor;
  for (let i = 0; i < 60; i++) {
    const entry = byDate.get(cursor);
    if (!entry) break;
    const hasHarmful = entry.completedHabits.some(
      (h) => classifyHabitPolarity(h) === 'harmful',
    );
    if (hasHarmful) break;
    // Count day as clean if the user logged anything for that day
    const hasLoggedActivity =
      entry.completedHabits.length > 0 ||
      entry.sleepHours !== undefined ||
      entry.weightKg !== undefined ||
      entry.restingHr !== undefined ||
      entry.caloriesKcal !== undefined;
    if (!hasLoggedActivity) break;
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function countConsecutiveHeavyTrainingDays(
  hevyWorkouts: HevyWorkout[],
  todayKey: string,
): number {
  const heavyDates = new Set<string>();
  for (const w of hevyWorkouts) {
    if (!w.date || w.date > todayKey) continue;
    const isHeavy = w.totalSets >= 10 || w.totalVolumeKg >= 3500 || isBoxingWorkout(w);
    if (isHeavy) {
      heavyDates.add(w.date);
    }
  }

  let anchor = todayKey;
  if (!heavyDates.has(anchor)) {
    const yesterday = shiftDate(todayKey, -1);
    if (heavyDates.has(yesterday)) {
      anchor = yesterday;
    } else {
      return 0;
    }
  }

  let streak = 0;
  let cursor = anchor;
  for (let i = 0; i < 14; i++) {
    if (!heavyDates.has(cursor)) break;
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function buildGoalImpactCopy(goal: TrainingGoalPhase): TestosteroneGoalImpactCopy {
  if (goal === 'hypertrophy') {
    return {
      goal,
      goalLabel: 'Хипертрофия (Покачване на чист мускул)',
      lowText:
        'Калорийният излишък по-лесно отива към омазняване около талията вместо в нови мускулни влакна; прогресът на щангата и напомпването зациклят.',
      highText:
        'По-силно насочване на хранителните вещества към мускулите, ускорен протеинов синтез, качване на чиста мускулна маса и стабилно чупене на лични рекорди.',
    };
  }
  if (goal === 'fat_loss') {
    return {
      goal,
      goalLabel: 'Сваляне на мазнини / Релеф',
      lowText:
        'Висок риск от загуба на мускулна маса и рязък спад в силата по време на дефицит; тялото задържа вода и коремни мазнини заради кортизола.',
      highText:
        'Запазване на силата и плътността на мускула дори в калориен дефицит, по-бързо топене на подкожните мазнини и по-малко глад и умора.',
    };
  }
  return {
    goal: 'maintenance',
    goalLabel: 'Поддържане / Бокс и относителна сила',
    lowText:
      'Загуба на експлозивност, по-бавна работа с крака и удари на чувала, по-тежко възстановяване между бокс и силови сесии.',
    highText:
      'Максимална експлозивност, високо съотношение сила/тегло на лостове и щанга, бързи рефлекси на спаринга и свежо тяло ден след ден.',
  };
}

export function computeAnabolicEnvironmentReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  profile: UserProfile;
  trainingGoal: TrainingGoalPhase;
  todayKey: string;
}): AnabolicEnvironmentReport {
  const { dailyLogs, hevyWorkouts, profile, trainingGoal, todayKey } = params;

  // Оценяваме последните 7 завършени дни (до ВЧЕРА), за да покажем ефекта за ДНЕС
  const yesterdayKey = shiftDate(todayKey, -1);
  const start7d = shiftDate(yesterdayKey, -6);
  const start30d = shiftDate(yesterdayKey, -29);
  const logsAsc = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const logs7d = logsAsc.filter(
    (d) => d.date >= start7d && d.date <= yesterdayKey,
  );
  const logs30d = logsAsc.filter(
    (d) => d.date >= start30d && d.date <= yesterdayKey,
  );
  const workouts7d = hevyWorkouts.filter(
    (w) => w.date >= start7d && w.date <= yesterdayKey,
  );
  const hasAnyData = dailyLogs.length > 0 || hevyWorkouts.length > 0;
  const bodyWeightKg = resolveLatestBodyWeight(dailyLogs, yesterdayKey, profile.weightKg);

  // =========================================================================
  // FACTOR 1: Сън и нощно възстановяване (30% тежест)
  // =========================================================================
  const sleepHoursVals = logs7d
    .map((d) => d.sleepHours)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const sleepQualityVals = logs7d
    .map((d) => d.sleepQuality)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const rhr7dVals = logs7d
    .map((d) => d.restingHr)
    .filter((v): v is number => typeof v === 'number' && v > 30);
  const rhr30dVals = logs30d
    .map((d) => d.restingHr)
    .filter((v): v is number => typeof v === 'number' && v > 30);
  const hrv7dVals = logs7d
    .map((d) => d.hrv)
    .filter((v): v is number => typeof v === 'number' && v > 5);
  const hrv30dVals = logs30d
    .map((d) => d.hrv)
    .filter((v): v is number => typeof v === 'number' && v > 5);

  const avgSleep7d = avg(sleepHoursVals);
  const avgSleepQ7d = avg(sleepQualityVals);
  const avgRhr7d = avg(rhr7dVals);
  const baseRhr30d = rhr30dVals.length >= 3 ? avg(rhr30dVals) : avgRhr7d;
  const rhrDelta =
    avgRhr7d !== null && baseRhr30d !== null ? roundOne(avgRhr7d - baseRhr30d) : null;

  const avgHrv7d = avg(hrv7dVals);
  const baseHrv30d = hrv30dVals.length >= 3 ? avg(hrv30dVals) : avgHrv7d;
  const hrvDeltaPct =
    avgHrv7d !== null && baseHrv30d !== null && baseHrv30d > 0
      ? Math.round(((avgHrv7d - baseHrv30d) / baseHrv30d) * 100)
      : null;

  const hasSleepData =
    avgSleep7d !== null || avgRhr7d !== null || avgHrv7d !== null || avgSleepQ7d !== null;

  let sleepScore = 62;
  if (avgSleep7d !== null) {
    if (avgSleep7d >= 7.5 && avgSleep7d <= 9.0) {
      sleepScore = 92;
    } else if (avgSleep7d > 9.0 && avgSleep7d <= 9.8) {
      sleepScore = 84;
    } else if (avgSleep7d >= 7.0) {
      sleepScore = 76;
    } else if (avgSleep7d >= 6.5) {
      sleepScore = 60;
    } else if (avgSleep7d >= 6.0) {
      // Sharp drop below 6.5h (cortisol spike + suppressed morning T peak)
      sleepScore = 36;
    } else if (avgSleep7d >= 5.2) {
      sleepScore = 24;
    } else {
      sleepScore = 14;
    }
  }

  // Resting HR stability adjustment
  if (rhrDelta !== null) {
    if (rhrDelta <= 1.0) sleepScore += 5;
    else if (rhrDelta >= 4.5) sleepScore -= 16;
    else if (rhrDelta >= 3.0) sleepScore -= 10;
    else if (rhrDelta >= 2.0) sleepScore -= 5;
  }

  // HRV stability adjustment
  if (hrvDeltaPct !== null) {
    if (hrvDeltaPct >= 3) sleepScore += 5;
    else if (hrvDeltaPct <= -15) sleepScore -= 16;
    else if (hrvDeltaPct <= -8) sleepScore -= 8;
  }

  // Subjective sleep quality nudge
  if (avgSleepQ7d !== null) {
    if (avgSleepQ7d >= 4.2) sleepScore += 4;
    else if (avgSleepQ7d <= 2.5) sleepScore -= 10;
    else if (avgSleepQ7d <= 3.0) sleepScore -= 5;
  }

  sleepScore = clamp(Math.round(sleepScore), 0, 100);
  const sleepDir = getDirection(sleepScore);
  const sleepMetricsParts: string[] = [];
  if (avgSleep7d !== null) sleepMetricsParts.push(`Сън: ${roundOne(avgSleep7d)} ч/нощ`);
  if (avgRhr7d !== null) {
    sleepMetricsParts.push(
      `RHR: ${Math.round(avgRhr7d)} bpm${rhrDelta !== null ? ` (${rhrDelta >= 0 ? '+' : ''}${rhrDelta})` : ''}`,
    );
  }
  if (avgHrv7d !== null) {
    sleepMetricsParts.push(
      `HRV: ${Math.round(avgHrv7d)} ms${hrvDeltaPct !== null ? ` (${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}%)` : ''}`,
    );
  }
  const sleepFactor: AnabolicFactorBreakdown = {
    id: 'sleep',
    title: 'Сън и нощно възстановяване',
    shortTitle: 'Сън и RHR/HRV',
    weightPct: 30,
    score: sleepScore,
    weightedPoints: roundOne(sleepScore * 0.3),
    direction: sleepDir.direction,
    directionLabel: sleepDir.label,
    headline: !hasSleepData
      ? 'Липсват данни за сън (7 д.)'
      : avgSleep7d !== null && avgSleep7d < 6.5
        ? 'Рязък спад — недоспиване (< 6.5 ч.)'
        : sleepScore >= 75
          ? 'Силен сутрешен пик на тестостерона'
          : 'Има резерв за по-дълбок сън',
    metricsLine:
      sleepMetricsParts.length > 0
        ? sleepMetricsParts.join(' · ')
        : 'Запиши сън или синхронизирай часовника',
    detail: !hasSleepData
      ? 'Попълвай часовете сън и пулса в покой, за да отчитаме нощния синтез на тестостерон.'
      : avgSleep7d !== null && avgSleep7d < 6.5
        ? 'Сън под 6.5 ч. вдига сутрешния кортизол и потиска естествения синтез на тестостерон с 10–15%.'
        : rhrDelta !== null && rhrDelta >= 3
          ? 'Повишеният сутрешен пулс подсказва натрупана умора на нервната система.'
          : 'Оптималният прозорец 7.5–9.0 ч. със стабилен пулс и HRV поддържа максимален нощен синтез.',
    hasData: hasSleepData,
  };

  // =========================================================================
  // FACTOR 2: Тренировъчен стимул срещу претрениране (25% тежест)
  // =========================================================================
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, yesterdayKey);
  const acwrValue = acwrReport.acwr;
  const consecutiveHeavyDays = countConsecutiveHeavyTrainingDays(
    hevyWorkouts,
    yesterdayKey,
  );

  const nonBoxingWorkouts7d = workouts7d.filter((w) => !isBoxingWorkout(w));
  const compoundLabelsFound = new Set<string>();
  let compoundSessions7d = 0;
  let weightedBwFound = false;

  for (const w of nonBoxingWorkouts7d) {
    let sessionHasCompound = false;
    for (const ex of w.exercises) {
      const check = isHeavyCompoundExercise(ex);
      if (check.matched) {
        sessionHasCompound = true;
        compoundLabelsFound.add(check.label);
        if (check.isWeightedBw) weightedBwFound = true;
      }
    }
    if (sessionHasCompound) {
      compoundSessions7d += 1;
    }
  }

  const hasTrainingData = workouts7d.length > 0 || acwrValue !== null;
  let trainingScore = 52;

  if (compoundSessions7d >= 3) {
    trainingScore = 88;
  } else if (compoundSessions7d === 2) {
    trainingScore = 82;
  } else if (compoundSessions7d === 1) {
    trainingScore = 68;
  } else if (workouts7d.length >= 2) {
    trainingScore = 62;
  } else if (workouts7d.length === 1) {
    trainingScore = 55;
  } else if (hevyWorkouts.length > 0) {
    trainingScore = 44; // detraining / no mechanical stimulus in 7d
  }

  if (weightedBwFound) {
    trainingScore += 4;
  }
  if (compoundLabelsFound.size >= 3) {
    trainingScore += 4;
  }

  // Overtraining / Cortisol penalties
  let overtrainingWarning = false;
  if (acwrValue !== null) {
    if (acwrValue > 1.5) {
      trainingScore -= 34;
      overtrainingWarning = true;
    } else if (acwrValue > 1.35) {
      trainingScore -= 24;
      overtrainingWarning = true;
    } else if (acwrValue >= 0.85 && acwrValue <= 1.25) {
      trainingScore += 4;
    }
  }

  if (consecutiveHeavyDays >= 5) {
    trainingScore -= 26;
    overtrainingWarning = true;
  } else if (consecutiveHeavyDays === 4) {
    trainingScore -= 16;
    overtrainingWarning = true;
  } else if (workouts7d.length >= 7) {
    trainingScore -= 14;
    overtrainingWarning = true;
  }

  trainingScore = clamp(Math.round(trainingScore), 0, 100);
  const trainingDir = getDirection(trainingScore);
  const trainingMetricsParts: string[] = [
    `Базови сесии: ${compoundSessions7d} / ${workouts7d.length} общо`,
  ];
  if (acwrValue !== null) {
    trainingMetricsParts.push(`ACWR: ${acwrValue.toFixed(2)}`);
  }
  if (consecutiveHeavyDays >= 3) {
    trainingMetricsParts.push(`${consecutiveHeavyDays} поредни тежки дни`);
  }

  const trainingFactor: AnabolicFactorBreakdown = {
    id: 'training',
    title: 'Тренировъчен стимул и ACWR',
    shortTitle: 'Тренировки / ACWR',
    weightPct: 25,
    score: trainingScore,
    weightedPoints: roundOne(trainingScore * 0.25),
    direction: trainingDir.direction,
    directionLabel: trainingDir.label,
    headline: overtrainingWarning
      ? 'Риск от претрениране и висок кортизол'
      : compoundSessions7d >= 2
        ? 'Отличен анаболен силов стимул'
        : compoundSessions7d === 1
          ? 'Умерен базов стимул (1 сесия)'
          : 'Липсват тежки базови упражнения (7 д.)',
    metricsLine: trainingMetricsParts.join(' · '),
    detail: overtrainingWarning
      ? `Натрупан стрес (${acwrValue !== null && acwrValue > 1.35 ? `ACWR ${acwrValue.toFixed(2)} > 1.35` : `${consecutiveHeavyDays} поредни тежки дни`}) — кортизолът потиска анаболния отговор.`
      : compoundLabelsFound.size > 0
        ? `Засечени базови движения: ${Array.from(compoundLabelsFound).slice(0, 4).join(', ')} — силен сигнал за андрогенните рецептори.`
        : 'Многоставни тежки движения (клек, тяга, лежанка, набирания/кофички с тежест) са най-мощният естествен стимул.',
    hasData: hasTrainingData,
  };

  // =========================================================================
  // FACTOR 3: Хранене и енергиен баланс (20% тежест)
  // =========================================================================
  const proteinVals = logs7d
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'protein'))
    .map((d) => d.proteinGrams as number);
  const avgProtein7d = avg(proteinVals);
  const avgProteinPerKg7d =
    avgProtein7d !== null && bodyWeightKg !== null && bodyWeightKg > 0
      ? roundOne(avgProtein7d / bodyWeightKg)
      : null;

  const balances = logs7d
    .filter(
      (d) =>
        isDateIncludedForEveningMetric(d, todayKey, 'caloriesIntake') &&
        (isDateIncludedForEveningMetric(d, todayKey, 'activeCalories') ||
          (d.caloriesKcal !== undefined && d.caloriesKcal > 0)),
    )
    .map((d) =>
      computeDailyEnergySummary({
        caloriesIntake: d.caloriesKcal,
        activeCalories: d.activeCalories,
        restingCalories: d.restingCalories,
        weightKg: d.weightKg ?? bodyWeightKg ?? undefined,
        heightCm: profile.heightCm,
      }).netBalance,
    )
    .filter((b): b is number => b !== null);

  const avgCaloricBalance7d = balances.length > 0 ? Math.round(avg(balances) as number) : null;
  const severeDeficitDays = balances.filter((b) => b < -650).length;
  const hasNutritionData = avgProtein7d !== null || avgCaloricBalance7d !== null;

  let nutritionScore = 64;
  if (hasNutritionData) {
    let proteinPart = 68;
    if (avgProteinPerKg7d !== null) {
      if (avgProteinPerKg7d >= 1.8 && avgProteinPerKg7d <= 2.6) proteinPart = 94;
      else if (avgProteinPerKg7d >= 1.6) proteinPart = 84;
      else if (avgProteinPerKg7d >= 1.3) proteinPart = 62;
      else proteinPart = 40;
    } else if (avgProtein7d !== null) {
      proteinPart = avgProtein7d >= 130 ? 84 : avgProtein7d >= 100 ? 68 : 48;
    }

    let energyPart = 78;
    if (avgCaloricBalance7d !== null) {
      if (avgCaloricBalance7d < -850 || severeDeficitDays >= 4) {
        energyPart = 24; // extreme sustained deficit suppresses GnRH / T
      } else if (avgCaloricBalance7d < -600 || severeDeficitDays >= 3) {
        energyPart = 42;
      } else if (avgCaloricBalance7d < -450) {
        energyPart = trainingGoal === 'fat_loss' ? 66 : 54;
      } else if (avgCaloricBalance7d >= -450 && avgCaloricBalance7d <= 450) {
        energyPart = 90;
      } else if (avgCaloricBalance7d > 450 && avgCaloricBalance7d <= 800) {
        energyPart = 82;
      } else {
        energyPart = 68;
      }
    }

    if (avgProtein7d !== null && avgCaloricBalance7d !== null) {
      nutritionScore = Math.round(proteinPart * 0.55 + energyPart * 0.45);
    } else if (avgProtein7d !== null) {
      nutritionScore = proteinPart;
    } else {
      nutritionScore = energyPart;
    }
  }

  nutritionScore = clamp(Math.round(nutritionScore), 0, 100);
  const nutritionDir = getDirection(nutritionScore);
  const nutritionMetricsParts: string[] = [];
  if (avgProtein7d !== null) {
    nutritionMetricsParts.push(
      `Протеин: ${Math.round(avgProtein7d)} g${avgProteinPerKg7d !== null ? ` (${avgProteinPerKg7d} g/kg)` : ''}`,
    );
  }
  if (avgCaloricBalance7d !== null) {
    nutritionMetricsParts.push(
      `Баланс: ${avgCaloricBalance7d > 0 ? '+' : ''}${avgCaloricBalance7d} kcal/д`,
    );
  }

  const nutritionFactor: AnabolicFactorBreakdown = {
    id: 'nutrition',
    title: 'Хранене и енергиен баланс',
    shortTitle: 'Храна и енергия',
    weightPct: 20,
    score: nutritionScore,
    weightedPoints: roundOne(nutritionScore * 0.2),
    direction: nutritionDir.direction,
    directionLabel: nutritionDir.label,
    headline: !hasNutritionData
      ? 'Няма записани калории/протеин (7 д.)'
      : avgCaloricBalance7d !== null && avgCaloricBalance7d < -600
        ? 'Прекалено дълбок калориен дефицит'
        : avgProteinPerKg7d !== null && avgProteinPerKg7d < 1.6
          ? 'Недостатъчен протеин (< 1.6 g/kg)'
          : 'Стабилно гориво за анаболизъм',
    metricsLine:
      nutritionMetricsParts.length > 0
        ? nutritionMetricsParts.join(' · ')
        : 'Записвай протеин и калории за точна оценка',
    detail: !hasNutritionData
      ? 'Достатъчният протеин (≥ 1.6 g/kg) и полезните мазнини без гладуване поддържат хормоналния синтез.'
      : avgCaloricBalance7d !== null && avgCaloricBalance7d < -600
        ? 'Продължителен дефицит над 600 kcal/д сваля свободния тестостерон и покачва SHBG и кортизола.'
        : avgProteinPerKg7d !== null && avgProteinPerKg7d < 1.6
          ? 'Вдигни протеина до поне 1.6–2.0 g/kg и включи цели яйца, зехтин и риба за градивен материал.'
          : 'Балансираната енергия и високият протеин защитават мускула и хормоналната ос.',
    hasData: hasNutritionData,
  };

  // =========================================================================
  // FACTOR 4: Навици и добавки (25% тежест) — вкл. „Бабини зъби“
  // =========================================================================
  const cleanHabitStreakDays = countConsecutiveCleanHabitDays(
    dailyLogs,
    yesterdayKey,
  );
  const harmfulDaysLogs = logs7d.filter((d) =>
    d.completedHabits.some((h) => classifyHabitPolarity(h) === 'harmful'),
  );
  const harmfulHabitDays7d = harmfulDaysLogs.length;

  let alcoholDays7d = 0;
  let nicotineDays7d = 0;
  let stressDays7d = 0;
  let otherHarmfulDays7d = 0;

  for (const d of logs7d) {
    const harmfulOnDay = d.completedHabits.filter(
      (h) => classifyHabitPolarity(h) === 'harmful',
    );
    if (harmfulOnDay.length === 0) continue;
    const joined = harmfulOnDay.join(' ').toLowerCase();
    const isAlc = /алкохол|alcohol|бира|вино|уиски|ракия/.test(joined);
    const isNic = /никотин|цигар|вейп|iqos|nicotine|smoke/.test(joined);
    const isStr = /стрес|stress/.test(joined);
    if (isAlc) alcoholDays7d += 1;
    if (isNic) nicotineDays7d += 1;
    if (isStr) stressDays7d += 1;
    if (!isAlc && !isNic && !isStr) otherHarmfulDays7d += 1;
  }

  const tribulusFull = analyzeTribulusUsage({
    dailyLogs,
    hevyWorkouts,
    todayKey: yesterdayKey,
    bodyWeightKg,
  });
  const tribulusDays7d = logs7d.filter(hasTribulusInLog).length;
  const energyDelta =
    tribulusFull.sleepQualityWith !== null && tribulusFull.sleepQualityWithout !== null
      ? roundOne(tribulusFull.sleepQualityWith - tribulusFull.sleepQualityWithout)
      : null;

  let tribulusSummaryText: string;
  if (tribulusFull.streakDays > 0) {
    const energyPart =
      energyDelta !== null
        ? ` · субективна енергия: ${energyDelta >= 0 ? '+' : ''}${energyDelta}/5 (${tribulusFull.sleepQualityWith}/5 с прием vs ${tribulusFull.sleepQualityWithout}/5 без)`
        : tribulusFull.sleepQualityWith !== null
          ? ` · ср. енергия/бодрост: ${tribulusFull.sleepQualityWith}/5`
          : '';
    tribulusSummaryText = tribulusFull.needsCycleBreak
      ? `🌿 Бабини зъби: ${tribulusFull.streakDays} поредни дни (препоръчана 2-седм. пауза)${energyPart}`
      : `🌿 Бабини зъби: ${tribulusFull.streakDays} ${tribulusFull.streakDays === 1 ? 'ден' : 'поредни дни'} активен цикъл${energyPart}`;
  } else if (tribulusFull.totalLoggedDays > 0) {
    tribulusSummaryText = `🌿 Бабини зъби: пауза (общо ${tribulusFull.totalLoggedDays} записани дни)`;
  } else {
    tribulusSummaryText = '🌿 Бабини зъби: не е отбелязван прием';
  }

  const tribulus: AnabolicTribulusSnapshot = {
    streakDays: tribulusFull.streakDays,
    streakWeeks: tribulusFull.streakWeeks,
    daysLast7d: tribulusDays7d,
    needsCycleBreak: tribulusFull.needsCycleBreak,
    sleepQualityWith: tribulusFull.sleepQualityWith,
    sleepQualityWithout: tribulusFull.sleepQualityWithout,
    energyDelta,
    summaryText: tribulusSummaryText,
  };

  const hasHabitsData = logs7d.length > 0 || tribulusFull.streakDays > 0;
  let habitsScore = 68;
  if (hasHabitsData) {
    habitsScore = 82;
    // Clean streak bonus
    if (cleanHabitStreakDays >= 7) habitsScore += 14;
    else if (cleanHabitStreakDays >= 4) habitsScore += 9;
    else if (cleanHabitStreakDays >= 2) habitsScore += 5;

    // Harmful habit penalties
    habitsScore -= alcoholDays7d * 18;
    habitsScore -= nicotineDays7d * 10;
    habitsScore -= stressDays7d * 9;
    habitsScore -= otherHarmfulDays7d * 7;

    // Active Tribulus cycle supportive nudge (modest, realistic)
    if (tribulusFull.streakDays >= 3 && !tribulusFull.needsCycleBreak) {
      habitsScore += energyDelta !== null && energyDelta > 0 ? 6 : 4;
    } else if (tribulusFull.needsCycleBreak) {
      habitsScore -= 3; // gentle nudge to cycle off after 42+ days
    }
  }

  habitsScore = clamp(Math.round(habitsScore), 0, 100);
  const habitsDir = getDirection(habitsScore);
  const habitsMetricsParts: string[] = [
    `Чиста серия: ${cleanHabitStreakDays} ${cleanHabitStreakDays === 1 ? 'ден' : 'дни'}`,
    `Вредни (7 д.): ${harmfulHabitDays7d} д.`,
  ];
  if (tribulusFull.streakDays > 0) {
    habitsMetricsParts.push(`Бабини зъби: ${tribulusFull.streakDays} д.`);
  }

  const habitsFactor: AnabolicFactorBreakdown = {
    id: 'habits',
    title: 'Навици и „Бабини зъби“',
    shortTitle: 'Навици / Бабини зъби',
    weightPct: 25,
    score: habitsScore,
    weightedPoints: roundOne(habitsScore * 0.25),
    direction: habitsDir.direction,
    directionLabel: habitsDir.label,
    headline: !hasHabitsData
      ? 'Няма записани навици (7 д.)'
      : harmfulHabitDays7d === 0 && cleanHabitStreakDays >= 3
        ? 'Чиста серия без хормонални саботьори'
        : alcoholDays7d >= 1
          ? `Алкохол в ${alcoholDays7d} д. сваля индекса`
          : harmfulHabitDays7d >= 2
            ? `${harmfulHabitDays7d} дни с вредни навици`
            : 'Добър баланс на навиците',
    metricsLine: habitsMetricsParts.join(' · '),
    detail: tribulusSummaryText,
    hasData: hasHabitsData,
  };

  // =========================================================================
  // COMPOSITE SCORE (0–100%) & TIER CLASSIFICATION
  // =========================================================================
  const factors: AnabolicFactorBreakdown[] = [
    sleepFactor,
    trainingFactor,
    nutritionFactor,
    habitsFactor,
  ];

  const totalScore = clamp(
    Math.round(
      sleepFactor.score * 0.3 +
        trainingFactor.score * 0.25 +
        nutritionFactor.score * 0.2 +
        habitsFactor.score * 0.25,
    ),
    0,
    100,
  );

  let zone: AnabolicZone;
  let zoneEmoji: string;
  let zoneTitle: string;
  let zoneSubtitle: string;

  if (totalScore >= 75) {
    zone = 'high';
    zoneEmoji = '🔥';
    zoneTitle = 'Висока анаболна среда (Оптимален тестостерон / Нисък кортизол)';
    zoneSubtitle =
      'Физиологичните условия през последните 7 дни подкрепят силен анаболен отговор, бързо възстановяване и висок тренировъчен хъс.';
  } else if (totalScore >= 50) {
    zone = 'moderate';
    zoneEmoji = '⚖️';
    zoneTitle = 'Умерена среда (Стабилен баланс, има резерв за оптимизация)';
    zoneSubtitle =
      'Системата е стабилна, но 1–2 фактора задържат естествения ти потенциал. Изпълни действията за следващите 48 ч., за да минеш над 75%.';
  } else {
    zone = 'low';
    zoneEmoji = '⚠️';
    zoneTitle = 'Потисната среда (Висок стрес / кортизол — риск от спад в тестостерона)';
    zoneSubtitle =
      'Преобладава катаболният стрес (недоспиване, претоварване, дефицит или вредни навици). Приоритет №1 за 48 ч. е сваляне на кортизола.';
  }

  const sortedByScore = [...factors].sort((a, b) => b.score - a.score);
  const strongestFactor = sortedByScore[0];
  const weakestFactor = sortedByScore[sortedByScore.length - 1];

  // =========================================================================
  // TOP 3 CONCRETE ACTIONS FOR THE NEXT 48 HOURS
  // =========================================================================
  const actionCandidates: Array<Omit<AnabolicAction48h, 'rank'> & { priorityScore: number }> = [];

  if (avgSleep7d === null || avgSleep7d < 7.3 || (rhrDelta !== null && rhrDelta >= 3)) {
    actionCandidates.push({
      id: 'sleep-48h',
      factorId: 'sleep',
      priorityScore: 100 - sleepScore + 15,
      title: 'Осигури 2 поредни нощи с 8+ ч. дълбок сън',
      rationale:
        'Спри екраните 45 мин преди лягане, охлади стаята и легни до 23:00 ч. Две пълноценни нощи рязко свалят кортизола и възстановяват сутрешния пик.',
      evidence:
        avgSleep7d !== null
          ? `Ср. сън (7 д.): ${roundOne(avgSleep7d)} ч.${rhrDelta !== null && rhrDelta >= 2 ? ` · RHR +${rhrDelta} bpm` : ''}`
          : 'Сънът носи най-голямата тежест (30%) в индекса.',
      impactLabel: '+8 до +14% към индекса',
    });
  }

  if (alcoholDays7d > 0 || nicotineDays7d > 0 || harmfulHabitDays7d >= 2) {
    actionCandidates.push({
      id: 'clean-reset-48h',
      factorId: 'habits',
      priorityScore: 100 - habitsScore + 12,
      title: 'Направи 48-часов напълно чист рестарт (0 алкохол, 0 никотин/захар)',
      rationale:
        'Елиминирането на алкохола и никотина освобождава клетките на Лайдиг и нормализира нощния REM сън още от първата вечер.',
      evidence: `Засечени ${harmfulHabitDays7d} д. с вредни навици (7 д.)${alcoholDays7d > 0 ? ` · ${alcoholDays7d} д. алкохол` : ''}.`,
      impactLabel: '+7 до +12% към индекса',
    });
  }

  if (overtrainingWarning) {
    actionCandidates.push({
      id: 'deload-cns-48h',
      factorId: 'training',
      priorityScore: 100 - trainingScore + 14,
      title: 'Вземи 1 пълен ден почивка или лека мобилност за сваляне на кортизола',
      rationale:
        'При висок ACWR или поредни тежки дни нервната система стои в катаболен режим. 24–48 ч. разтоварване връщат силата и анаболния баланс.',
      evidence:
        acwrValue !== null && acwrValue > 1.35
          ? `ACWR ${acwrValue.toFixed(2)} (> 1.35) · ${consecutiveHeavyDays} поредни тежки дни.`
          : `${consecutiveHeavyDays} поредни тежки тренировъчни дни без пауза.`,
      impactLabel: 'Сваля кортизола за 24–48 ч.',
    });
  } else if (compoundSessions7d < 2) {
    actionCandidates.push({
      id: 'heavy-compound-48h',
      factorId: 'training',
      priorityScore: 100 - trainingScore + 8,
      title: 'Планирай 45-мин силова сесия с 2 тежки базови упражнения',
      rationale:
        'Клек, мъртва тяга, лежанка или набирания/кофички с тежест (3–4 серии по 5–8 повторения, без отказ) дават силен естествен хормонален импулс.',
      evidence: `Само ${compoundSessions7d} базови сесии в последните 7 дни.`,
      impactLabel: '+6 до +10% към индекса',
    });
  }

  if (
    (avgCaloricBalance7d !== null && avgCaloricBalance7d < -550) ||
    (avgProteinPerKg7d !== null && avgProteinPerKg7d < 1.6)
  ) {
    const isDeepDeficit = avgCaloricBalance7d !== null && avgCaloricBalance7d < -550;
    actionCandidates.push({
      id: 'nutrition-48h',
      factorId: 'nutrition',
      priorityScore: 100 - nutritionScore + 10,
      title: isDeepDeficit
        ? 'Направи 1 ден на поддържащи калории с полезни мазнини и сложни въглехидрати'
        : 'Удряй ≥ 1.6–1.8 g/kg протеин + цели яйца и зехтин в следващите 48 ч.',
      rationale: isDeepDeficit
        ? 'Кратък рефийд спира спада на лептина и свободния тестостерон при агресивен дефицит, без да спира топенето на мазнини.'
        : 'Полезните мазнини и цинкът (цели яйца, телешко, тиквено семе) са директният градивен материал за синтеза на тестостерон.',
      evidence:
        nutritionMetricsParts.length > 0
          ? nutritionMetricsParts.join(' · ')
          : 'Храненето дава 20% тежест в индекса.',
      impactLabel: '+5 до +9% към индекса',
    });
  }

  if (tribulusFull.needsCycleBreak) {
    actionCandidates.push({
      id: 'tribulus-break-48h',
      factorId: 'habits',
      priorityScore: 70,
      title: 'Започни 2-седмична пауза от „Бабини зъби“',
      rationale:
        'След 6+ седмици непрекъснат прием рецепторната чувствителност спада — кратката пауза възстановява ефекта за следващия цикъл.',
      evidence: `Активна серия: ${tribulusFull.streakDays} поредни дни.`,
      impactLabel: 'Запазва ефективността',
    });
  }

  // Evergreen 48h boosters to always guarantee 3 distinct concrete steps
  const evergreen48h: Array<Omit<AnabolicAction48h, 'rank'> & { priorityScore: number }> = [
    {
      id: 'evergreen-sun-sleep',
      factorId: 'sleep',
      priorityScore: 40,
      title: '15–20 мин сутрешна слънчева светлина + фиксиран час за лягане',
      rationale:
        'Синхронизира циркадния ритъм, подпомага витамин D и засилва естествения сутрешен пик на тестостерона.',
      evidence:
        avgSleep7d !== null
          ? `Текущ ср. сън: ${roundOne(avgSleep7d)} ч. — задръж ритъма.`
          : 'Ключов фактор с 30% тежест.',
      impactLabel: 'Стабилизира пика',
    },
    {
      id: 'evergreen-fats-zinc',
      factorId: 'nutrition',
      priorityScore: 35,
      title: 'Включи 3 цели яйца, зехтин, цинк и магнезий в менюто за 48 ч.',
      rationale:
        'Хранителният холестерол, цинкът и магнезият са основните кофактори за поддържане на висок свободен тестостерон.',
      evidence:
        avgProteinPerKg7d !== null
          ? `Текущ протеин: ${avgProteinPerKg7d} g/kg.`
          : 'Подкрепя естествения синтез.',
      impactLabel: 'Хормонални кофактори',
    },
    {
      id: 'evergreen-heavy-clean',
      factorId: 'training',
      priorityScore: 30,
      title: 'Комбинирай тежки базови серии (45–60 мин) с 20 мин спокойно ходене',
      rationale:
        'Краткото, фокусирано силово натоварване без излишно проточен обем вдига тестостерона, а разходката сваля остатъчния кортизол.',
      evidence: `Базови сесии (7 д.): ${compoundSessions7d} · Чиста серия: ${cleanHabitStreakDays} д.`,
      impactLabel: 'Оптимално T/C съотношение',
    },
  ];

  actionCandidates.sort((a, b) => b.priorityScore - a.priorityScore);
  const pickedActions: Array<Omit<AnabolicAction48h, 'rank'>> = [];
  const usedIds = new Set<string>();

  for (const item of [...actionCandidates, ...evergreen48h]) {
    if (pickedActions.length >= 3) break;
    if (usedIds.has(item.id)) continue;
    usedIds.add(item.id);
    pickedActions.push({
      id: item.id,
      factorId: item.factorId,
      title: item.title,
      rationale: item.rationale,
      evidence: item.evidence,
      impactLabel: item.impactLabel,
    });
  }

  const actions48h: AnabolicAction48h[] = pickedActions.slice(0, 3).map((a, idx) => ({
    ...a,
    rank: (idx + 1) as 1 | 2 | 3,
  }));

  // =========================================================================
  // INTERACTIVE COMPARISON PANEL (3 CATEGORIES, DYNAMIC GOAL)
  // =========================================================================
  const goalImpact = buildGoalImpactCopy(trainingGoal);

  const comparisonCategories: AnabolicComparisonCategory[] = [
    {
      id: 'mind_energy',
      emoji: '🧠',
      title: 'Усещане, психика и енергия',
      lowPoints: [
        'Сутрешна умора и трудно разсънване въпреки прекараното време в леглото.',
        'Липса на хъс и бойна агресия в залата и на боксовия чувал.',
        'По-бавни реакции, лесна раздразнителност, спад в мотивацията и либидото.',
      ],
      highPoints: [
        'Висок тонус още със събуждането и стабилна енергия през целия ден.',
        'Увереност, остър фокус и бързи рефлекси на чувала и спаринга.',
        'Стабилна психика под напрежение, силен тренировъчен драйв и либидо.',
      ],
    },
    {
      id: 'body_recovery',
      emoji: '💪',
      title: 'Тяло и възстановяване',
      lowPoints: [
        'По-бавно възстановяване на мускулите и продължителна мускулна треска.',
        'Задържане на вода и мазнини около талията заради доминиращия кортизол.',
        'По-слабо напомпване на тренировка и усещане за скованост в ставите.',
      ],
      highPoints: [
        'Ускорена белтъчна синтеза и видимо по-плътни, твърди мускули.',
        'По-лесно топене на подкожни мазнини и по-добра инсулинова чувствителност.',
        'Бързо заздравяване и свежест след тежки рундове и базови серии.',
      ],
    },
    {
      id: 'active_goal',
      emoji: '🎯',
      title: `Влияние върху твоята цел: ${goalImpact.goalLabel}`,
      lowPoints: [goalImpact.lowText],
      highPoints: [goalImpact.highText],
    },
  ];

  return {
    totalScore,
    zone,
    zoneEmoji,
    zoneTitle,
    zoneSubtitle,
    disclaimerNote: ANABOLIC_LAB_DISCLAIMER,
    hasAnyData,
    factors,
    strongestFactor,
    weakestFactor,
    actions48h,
    comparisonCategories,
    goalImpact,
    tribulus,
    cleanHabitStreakDays,
    harmfulHabitDays7d,
    compoundSessions7d,
    acwrValue,
    consecutiveHeavyDays,
    avgSleepHours7d: avgSleep7d !== null ? roundOne(avgSleep7d) : null,
    avgProteinPerKg7d,
    avgCaloricBalance7d,
    windowStartDate: start7d,
    windowEndDate: yesterdayKey,
    todayDate: todayKey,
  };
}
