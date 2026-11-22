import type {
  DailyBiometricLog,
  HevySet,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  DEFAULT_HABIT_ITEMS,
  computeDailyEnergySummary,
} from './dailyLogs';
import { formatBgDate, shiftDateKey } from './fitnessMath';
import { classifyHabitPolarity } from './habitBodyImpact';

export type WeeklyDeltaDirection = 'up' | 'down' | 'flat';
export type WeeklyDeltaSentiment = 'positive' | 'negative' | 'neutral';

export interface WeeklyPeriodMetrics {
  startDate: string;
  endDate: string;
  loggedDaysCount: number;
  avgWeightKg: number | null;
  weightSamples: number;
  avgSleepHours: number | null;
  avgSleepQuality: number | null;
  sleepSamples: number;
  avgSteps: number | null;
  stepsSamples: number;
  avgNetCalories: number | null;
  netCaloriesSamples: number;
  workoutSessions: number;
  totalWorkingSets: number;
  totalTonnageKg: number;
  beneficialHabitsPct: number | null;
  cleanDaysCount: number;
  habitLoggedDays: number;
  avgReadinessTestosteroneIndex: number | null;
  readinessSamples: number;
}

export interface WeeklyComparisonItem {
  id:
    | 'weight'
    | 'sleep'
    | 'steps_energy'
    | 'strength'
    | 'discipline'
    | 'readiness_testosterone';
  title: string;
  primaryValue: string;
  secondaryValue: string;
  previousText: string;
  deltaText: string;
  direction: WeeklyDeltaDirection;
  sentiment: WeeklyDeltaSentiment;
  hasData: boolean;
}

export interface WeeklyMainFocus {
  category: string;
  headline: string;
  rationale: string;
  actionLine: string;
}

export interface WeeklyScorecardReport {
  todayKey: string;
  isBannerDay: boolean;
  currentWeek: WeeklyPeriodMetrics;
  previousWeek: WeeklyPeriodMetrics;
  comparisons: WeeklyComparisonItem[];
  overallScore: number;
  scoreTier: 'excellent' | 'solid' | 'adjust' | 'overload';
  scoreTierLabel: string;
  scoreBreakdown: {
    sleep: number;
    training: number;
    discipline: number;
    activityEnergy: number;
    readinessHormonal: number;
  };
  mainFocus: WeeklyMainFocus;
  hasAnyData: boolean;
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function parseYmdToNoonDate(dateKey: string): Date | null {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Returns true on Sunday (0) or Monday (1) so the Weekly Scorecard banner
 * automatically highlights the completed week at the start of the new week.
 */
export function isWeeklyReviewBannerDay(todayKey: string): boolean {
  const dt = parseYmdToNoonDate(todayKey);
  if (!dt) return false;
  const dow = dt.getDay();
  return dow === 0 || dow === 1;
}

function formatShortRange(startDate: string, endDate: string): string {
  const s = formatBgDate(startDate).slice(0, 5);
  const e = formatBgDate(endDate).slice(0, 5);
  return `${s} – ${e}`;
}

function resolveProfileWeightKg(
  dailyLogs: DailyBiometricLog[],
  profile: UserProfile,
): number | null {
  const sorted = [...dailyLogs]
    .filter((d) => d.weightKg !== undefined && d.weightKg > 0)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length > 0 && sorted[0].weightKg !== undefined) {
    return sorted[0].weightKg;
  }
  if (typeof profile.weightKg === 'number' && profile.weightKg > 0) {
    return profile.weightKg;
  }
  return null;
}

function computeDailyReadinessTestosteroneScore(params: {
  log: DailyBiometricLog;
  baselineRhr: number | null;
  bodyWeightKg: number | null;
  profileHeightCm?: number | '';
  trainedOnDate: boolean;
}): number | null {
  const { log, baselineRhr, bodyWeightKg, profileHeightCm, trainedOnDate } = params;

  const components: Array<{ score: number; weight: number }> = [];

  // 1. Sleep duration & quality (40%) — primary natural testosterone & CNS recovery driver
  if (log.sleepHours !== undefined || log.sleepQuality !== undefined) {
    let sleepScore = 75;
    if (log.sleepHours !== undefined) {
      if (log.sleepHours >= 7.5 && log.sleepHours <= 9.5) sleepScore = 96;
      else if (log.sleepHours >= 7.0) sleepScore = 84;
      else if (log.sleepHours >= 6.5) sleepScore = 70;
      else if (log.sleepHours >= 6.0) sleepScore = 56;
      else sleepScore = clamp(Math.round(log.sleepHours * 8.5), 20, 50);
    }
    if (log.sleepQuality !== undefined) {
      const qualityScore = clamp((log.sleepQuality - 1) * 22 + 12, 12, 100);
      sleepScore =
        log.sleepHours !== undefined
          ? Math.round(sleepScore * 0.65 + qualityScore * 0.35)
          : qualityScore;
    }
    components.push({ score: sleepScore, weight: 0.4 });
  }

  // 2. Resting HR vs 14d baseline (20%)
  if (log.restingHr !== undefined && log.restingHr > 0) {
    let rhrScore = 80;
    if (baselineRhr !== null && baselineRhr > 0) {
      const delta = log.restingHr - baselineRhr;
      if (delta <= -1) rhrScore = 96;
      else if (delta <= 1.5) rhrScore = 86;
      else if (delta <= 3.5) rhrScore = 68;
      else if (delta <= 6) rhrScore = 48;
      else rhrScore = 30;
    } else if (log.restingHr <= 56) {
      rhrScore = 94;
    } else if (log.restingHr <= 64) {
      rhrScore = 82;
    } else if (log.restingHr <= 72) {
      rhrScore = 68;
    } else {
      rhrScore = 52;
    }
    components.push({ score: rhrScore, weight: 0.2 });
  }

  // 3. Clean habits / avoidance of testosterone-suppressing habits (25%)
  const harmfulCount = log.completedHabits.filter(
    (h) => classifyHabitPolarity(h) === 'harmful',
  ).length;
  const beneficialCount = log.completedHabits.filter(
    (h) => classifyHabitPolarity(h) === 'beneficial',
  ).length;
  if (log.completedHabits.length > 0 || log.sleepHours !== undefined || log.weightKg !== undefined) {
    let habitScore = 86;
    if (harmfulCount === 0) {
      habitScore = beneficialCount >= 2 ? 96 : 88;
    } else if (harmfulCount === 1) {
      habitScore = 56;
    } else {
      habitScore = clamp(45 - (harmfulCount - 1) * 14, 15, 45);
    }
    components.push({ score: habitScore, weight: 0.25 });
  }

  // 4. Nutrition, protein & non-crash deficit + training stimulus (15%)
  const energy = computeDailyEnergySummary({
    weightKg: log.weightKg ?? bodyWeightKg ?? undefined,
    heightCm: typeof profileHeightCm === 'number' ? profileHeightCm : undefined,
    caloriesIntake: log.caloriesKcal,
    activeCalories: log.activeCalories,
    restingCalories: log.restingCalories,
  });
  let fuelScore = 76;
  let hasFuelSignal = false;
  if (log.proteinGrams !== undefined && bodyWeightKg && bodyWeightKg > 0) {
    hasFuelSignal = true;
    const gPerKg = log.proteinGrams / bodyWeightKg;
    if (gPerKg >= 1.7) fuelScore = 92;
    else if (gPerKg >= 1.5) fuelScore = 80;
    else fuelScore = 62;
  }
  if (energy.netBalance !== null) {
    hasFuelSignal = true;
    if (energy.netBalance < -800) fuelScore = Math.min(fuelScore, 44);
    else if (energy.netBalance < -600) fuelScore = Math.min(fuelScore, 64);
    else if (energy.netBalance >= -500 && energy.netBalance <= 350) {
      fuelScore = Math.max(fuelScore, 88);
    }
  }
  if (trainedOnDate) {
    hasFuelSignal = true;
    fuelScore = clamp(fuelScore + 6, 0, 100);
  }
  if (hasFuelSignal) {
    components.push({ score: fuelScore, weight: 0.15 });
  }

  if (components.length === 0) return null;
  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const weighted = components.reduce((s, c) => s + c.score * c.weight, 0);
  return Math.round(weighted / totalWeight);
}

function computePeriodMetrics(params: {
  startDate: string;
  endDate: string;
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  beneficialCatalog: string[];
  baselineRhr: number | null;
  fallbackWeightKg: number | null;
  profileHeightCm?: number | '';
}): WeeklyPeriodMetrics {
  const {
    startDate,
    endDate,
    dailyLogs,
    hevyWorkouts,
    beneficialCatalog,
    baselineRhr,
    fallbackWeightKg,
    profileHeightCm,
  } = params;

  const periodLogs = dailyLogs.filter(
    (d) => d.date >= startDate && d.date <= endDate,
  );
  const periodWorkouts = hevyWorkouts.filter(
    (w) => w.date >= startDate && w.date <= endDate,
  );
  const workoutDates = new Set(periodWorkouts.map((w) => w.date));

  const weights: number[] = [];
  const sleepHoursList: number[] = [];
  const sleepQualityList: number[] = [];
  const stepsList: number[] = [];
  const netCaloriesList: number[] = [];
  const habitPctList: number[] = [];
  let cleanDaysCount = 0;
  let habitLoggedDays = 0;
  const readinessList: number[] = [];

  const beneficialCatalogLower = new Set(
    beneficialCatalog.map((h) => h.trim().toLowerCase()),
  );
  const beneficialDenominator = Math.max(1, beneficialCatalogLower.size);

  for (const log of periodLogs) {
    if (log.weightKg !== undefined && log.weightKg > 0) {
      weights.push(log.weightKg);
    }
    if (log.sleepHours !== undefined && log.sleepHours > 0) {
      sleepHoursList.push(log.sleepHours);
    }
    if (log.sleepQuality !== undefined && log.sleepQuality > 0) {
      sleepQualityList.push(log.sleepQuality);
    }
    if (log.steps !== undefined && log.steps >= 0) {
      stepsList.push(log.steps);
    }

    const energy = computeDailyEnergySummary({
      weightKg: log.weightKg ?? fallbackWeightKg ?? undefined,
      heightCm: typeof profileHeightCm === 'number' ? profileHeightCm : undefined,
      caloriesIntake: log.caloriesKcal,
      activeCalories: log.activeCalories,
      restingCalories: log.restingCalories,
    });
    if (energy.netBalance !== null) {
      netCaloriesList.push(energy.netBalance);
    }

    const harmfulOnDay = log.completedHabits.filter(
      (h) => classifyHabitPolarity(h) === 'harmful',
    );
    const beneficialOnDay = log.completedHabits.filter(
      (h) => classifyHabitPolarity(h) === 'beneficial',
    );

    habitLoggedDays += 1;
    if (harmfulOnDay.length === 0) {
      cleanDaysCount += 1;
    }

    const matchedBeneficial = beneficialOnDay.filter((h) =>
      beneficialCatalogLower.size > 0
        ? beneficialCatalogLower.has(h.trim().toLowerCase()) || true
        : true,
    ).length;
    const dayHabitPct = clamp(
      Math.round((matchedBeneficial / beneficialDenominator) * 100),
      0,
      100,
    );
    habitPctList.push(dayHabitPct);

    const dayReadiness = computeDailyReadinessTestosteroneScore({
      log,
      baselineRhr,
      bodyWeightKg: log.weightKg ?? fallbackWeightKg,
      profileHeightCm,
      trainedOnDate: workoutDates.has(log.date),
    });
    if (dayReadiness !== null) {
      readinessList.push(dayReadiness);
    }
  }

  let totalWorkingSets = 0;
  let totalTonnageKg = 0;
  for (const w of periodWorkouts) {
    for (const ex of w.exercises) {
      const working = getWorkingSets(ex.sets);
      totalWorkingSets += working.length;
      for (const s of working) {
        const wt = s.weightKg ?? 0;
        const rp = s.reps ?? 0;
        if (wt > 0 && rp > 0) {
          totalTonnageKg += wt * rp;
        }
      }
    }
  }

  const avgWeightRaw = avg(weights);
  const avgSleepRaw = avg(sleepHoursList);
  const avgQualityRaw = avg(sleepQualityList);
  const avgStepsRaw = avg(stepsList);
  const avgNetCalRaw = avg(netCaloriesList);
  const avgHabitPctRaw = avg(habitPctList);
  const avgReadinessRaw = avg(readinessList);

  return {
    startDate,
    endDate,
    loggedDaysCount: periodLogs.length,
    avgWeightKg: avgWeightRaw !== null ? roundOne(avgWeightRaw) : null,
    weightSamples: weights.length,
    avgSleepHours: avgSleepRaw !== null ? roundOne(avgSleepRaw) : null,
    avgSleepQuality: avgQualityRaw !== null ? roundOne(avgQualityRaw) : null,
    sleepSamples: sleepHoursList.length,
    avgSteps: avgStepsRaw !== null ? Math.round(avgStepsRaw) : null,
    stepsSamples: stepsList.length,
    avgNetCalories: avgNetCalRaw !== null ? Math.round(avgNetCalRaw) : null,
    netCaloriesSamples: netCaloriesList.length,
    workoutSessions: periodWorkouts.length,
    totalWorkingSets,
    totalTonnageKg: Math.round(totalTonnageKg),
    beneficialHabitsPct:
      avgHabitPctRaw !== null ? Math.round(avgHabitPctRaw) : null,
    cleanDaysCount,
    habitLoggedDays,
    avgReadinessTestosteroneIndex:
      avgReadinessRaw !== null ? Math.round(avgReadinessRaw) : null,
    readinessSamples: readinessList.length,
  };
}

function countPullAndRearDeltSets(
  hevyWorkouts: HevyWorkout[],
  startDate: string,
  endDate: string,
): { pushSets: number; pullSets: number; backRearSets: number } {
  let pushSets = 0;
  let pullSets = 0;
  let backRearSets = 0;

  for (const w of hevyWorkouts) {
    if (w.date < startDate || w.date > endDate) continue;
    for (const ex of w.exercises) {
      const t = ex.title.toLowerCase();
      const setsCount = getWorkingSets(ex.sets).length;
      if (
        t.includes('face pull') ||
        t.includes('rear delt') ||
        t.includes('reverse fly') ||
        t.includes('row') ||
        t.includes('pull up') ||
        t.includes('pull-up') ||
        t.includes('chin up') ||
        t.includes('pulldown') ||
        t.includes('lat ')
      ) {
        pullSets += setsCount;
        backRearSets += setsCount;
      } else if (
        t.includes('bench') ||
        t.includes('chest') ||
        t.includes('push up') ||
        t.includes('dip') ||
        t.includes('overhead press') ||
        t.includes('shoulder press') ||
        t.includes('incline')
      ) {
        pushSets += setsCount;
      }
    }
  }

  return { pushSets, pullSets, backRearSets };
}

function formatSigned(val: number, suffix: string = ''): string {
  const prefix = val > 0 ? '+' : '';
  return `${prefix}${val}${suffix}`;
}

export function computeWeeklyScorecardReport(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  habitItems: string[];
  profile: UserProfile;
  todayKey: string;
  dailyStepsGoal?: number;
}): WeeklyScorecardReport {
  const {
    dailyLogs,
    hevyWorkouts,
    habitItems,
    profile,
    todayKey,
    dailyStepsGoal = DEFAULT_DAILY_STEPS_GOAL,
  } = params;

  // Strictly last 7 completed days (yesterday backwards), excluding incomplete today
  const currEnd = shiftDateKey(todayKey, -1);
  const currStart = shiftDateKey(todayKey, -7);
  const prevEnd = shiftDateKey(todayKey, -8);
  const prevStart = shiftDateKey(todayKey, -14);

  const beneficialCatalog = (
    habitItems.length > 0 ? habitItems : DEFAULT_HABIT_ITEMS
  ).filter((h) => classifyHabitPolarity(h) === 'beneficial');

  // 14-day resting HR baseline up to yesterday
  const rhrWindowStart = shiftDateKey(todayKey, -14);
  const rhrBaselineVals = dailyLogs
    .filter(
      (d) =>
        d.date >= rhrWindowStart &&
        d.date <= currEnd &&
        d.restingHr !== undefined &&
        d.restingHr > 0,
    )
    .map((d) => d.restingHr as number);
  const baselineRhr = avg(rhrBaselineVals);

  const fallbackWeightKg = resolveProfileWeightKg(dailyLogs, profile);

  const currentWeek = computePeriodMetrics({
    startDate: currStart,
    endDate: currEnd,
    dailyLogs,
    hevyWorkouts,
    beneficialCatalog,
    baselineRhr,
    fallbackWeightKg,
    profileHeightCm: profile.heightCm,
  });

  const previousWeek = computePeriodMetrics({
    startDate: prevStart,
    endDate: prevEnd,
    dailyLogs,
    hevyWorkouts,
    beneficialCatalog,
    baselineRhr,
    fallbackWeightKg,
    profileHeightCm: profile.heightCm,
  });

  const hasAnyData =
    currentWeek.loggedDaysCount > 0 ||
    currentWeek.workoutSessions > 0 ||
    previousWeek.loggedDaysCount > 0 ||
    previousWeek.workoutSessions > 0;

  // Build 6 comparative KPI items
  // 1. Weight
  const weightDelta =
    currentWeek.avgWeightKg !== null && previousWeek.avgWeightKg !== null
      ? roundOne(currentWeek.avgWeightKg - previousWeek.avgWeightKg)
      : null;
  const weightDirection: WeeklyDeltaDirection =
    weightDelta === null || Math.abs(weightDelta) < 0.05
      ? 'flat'
      : weightDelta > 0
        ? 'up'
        : 'down';
  const weightSentiment: WeeklyDeltaSentiment =
    weightDelta === null
      ? 'neutral'
      : Math.abs(weightDelta) <= 0.7
        ? 'positive'
        : 'negative';

  // 2. Sleep
  const sleepDelta =
    currentWeek.avgSleepHours !== null && previousWeek.avgSleepHours !== null
      ? roundOne(currentWeek.avgSleepHours - previousWeek.avgSleepHours)
      : null;
  const sleepDirection: WeeklyDeltaDirection =
    sleepDelta === null || Math.abs(sleepDelta) < 0.05
      ? 'flat'
      : sleepDelta > 0
        ? 'up'
        : 'down';
  const sleepSentiment: WeeklyDeltaSentiment =
    sleepDelta === null
      ? currentWeek.avgSleepHours !== null && currentWeek.avgSleepHours >= 7.2
        ? 'positive'
        : 'neutral'
      : sleepDelta > 0.05
        ? 'positive'
        : sleepDelta < -0.15
          ? 'negative'
          : 'neutral';

  // 3. Steps + Net Caloric Balance
  const stepsDelta =
    currentWeek.avgSteps !== null && previousWeek.avgSteps !== null
      ? currentWeek.avgSteps - previousWeek.avgSteps
      : null;
  const stepsDirection: WeeklyDeltaDirection =
    stepsDelta === null || Math.abs(stepsDelta) < 100
      ? 'flat'
      : stepsDelta > 0
        ? 'up'
        : 'down';
  const stepsSentiment: WeeklyDeltaSentiment =
    stepsDelta === null
      ? currentWeek.avgSteps !== null && currentWeek.avgSteps >= dailyStepsGoal * 0.85
        ? 'positive'
        : 'neutral'
      : stepsDelta >= 100
        ? 'positive'
        : stepsDelta <= -400
          ? 'negative'
          : 'neutral';

  // 4. Strength Workouts
  const setsDelta = currentWeek.totalWorkingSets - previousWeek.totalWorkingSets;
  const tonnageDelta = currentWeek.totalTonnageKg - previousWeek.totalTonnageKg;
  const strengthDirection: WeeklyDeltaDirection =
    setsDelta === 0 && tonnageDelta === 0
      ? 'flat'
      : setsDelta > 0 || (setsDelta === 0 && tonnageDelta > 0)
        ? 'up'
        : 'down';
  const strengthSentiment: WeeklyDeltaSentiment =
    currentWeek.workoutSessions === 0
      ? 'negative'
      : setsDelta >= 0 && tonnageDelta >= 0
        ? 'positive'
        : setsDelta < -6
          ? 'negative'
          : 'neutral';

  // 5. Discipline & Habits
  const habitDelta =
    currentWeek.beneficialHabitsPct !== null &&
    previousWeek.beneficialHabitsPct !== null
      ? currentWeek.beneficialHabitsPct - previousWeek.beneficialHabitsPct
      : null;
  const cleanDelta = currentWeek.cleanDaysCount - previousWeek.cleanDaysCount;
  const disciplineDirection: WeeklyDeltaDirection =
    habitDelta !== null && habitDelta !== 0
      ? habitDelta > 0
        ? 'up'
        : 'down'
      : cleanDelta > 0
        ? 'up'
        : cleanDelta < 0
          ? 'down'
          : 'flat';
  const disciplineSentiment: WeeklyDeltaSentiment =
    habitDelta !== null
      ? habitDelta > 0
        ? 'positive'
        : habitDelta < -5
          ? 'negative'
          : 'neutral'
      : cleanDelta >= 0 && currentWeek.cleanDaysCount >= 5
        ? 'positive'
        : 'neutral';

  // 6. Readiness & Testosterone Index
  const readinessDelta =
    currentWeek.avgReadinessTestosteroneIndex !== null &&
    previousWeek.avgReadinessTestosteroneIndex !== null
      ? currentWeek.avgReadinessTestosteroneIndex -
        previousWeek.avgReadinessTestosteroneIndex
      : null;
  const readinessDirection: WeeklyDeltaDirection =
    readinessDelta === null || readinessDelta === 0
      ? 'flat'
      : readinessDelta > 0
        ? 'up'
        : 'down';
  const readinessSentiment: WeeklyDeltaSentiment =
    readinessDelta === null
      ? (currentWeek.avgReadinessTestosteroneIndex ?? 0) >= 75
        ? 'positive'
        : 'neutral'
      : readinessDelta >= 2
        ? 'positive'
        : readinessDelta <= -4
          ? 'negative'
          : 'neutral';

  const comparisons: WeeklyComparisonItem[] = [
    {
      id: 'weight',
      title: 'Средно телесно тегло',
      primaryValue:
        currentWeek.avgWeightKg !== null
          ? `${currentWeek.avgWeightKg.toFixed(1)} kg`
          : '—',
      secondaryValue:
        currentWeek.weightSamples > 0
          ? `${currentWeek.weightSamples} измервания (${formatShortRange(currStart, currEnd)})`
          : 'Няма записано тегло',
      previousText:
        previousWeek.avgWeightKg !== null
          ? `Предх. седмица: ${previousWeek.avgWeightKg.toFixed(1)} kg`
          : 'Предх. седмица: няма данни',
      deltaText:
        weightDelta !== null
          ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`
          : 'Без база за сравнение',
      direction: weightDirection,
      sentiment: weightSentiment,
      hasData: currentWeek.avgWeightKg !== null,
    },
    {
      id: 'sleep',
      title: 'Среден сън и свежест',
      primaryValue:
        currentWeek.avgSleepHours !== null
          ? `${currentWeek.avgSleepHours.toFixed(1)} ч`
          : '—',
      secondaryValue:
        currentWeek.avgSleepQuality !== null
          ? `Качество: ${currentWeek.avgSleepQuality.toFixed(1)} / 5`
          : 'Няма оценка за качество',
      previousText:
        previousWeek.avgSleepHours !== null
          ? `Предх. седмица: ${previousWeek.avgSleepHours.toFixed(1)} ч${
              previousWeek.avgSleepQuality !== null
                ? ` (${previousWeek.avgSleepQuality.toFixed(1)}/5)`
                : ''
            }`
          : 'Предх. седмица: няма данни',
      deltaText:
        sleepDelta !== null
          ? `${sleepDelta > 0 ? '+' : ''}${sleepDelta.toFixed(1)} ч (${
              sleepDelta > 0 ? '+' : ''
            }${Math.round(sleepDelta * 60)} мин)`
          : 'Без база за сравнение',
      direction: sleepDirection,
      sentiment: sleepSentiment,
      hasData: currentWeek.avgSleepHours !== null,
    },
    {
      id: 'steps_energy',
      title: 'Крачки и Калориен баланс',
      primaryValue:
        currentWeek.avgSteps !== null
          ? `${currentWeek.avgSteps.toLocaleString('bg-BG')} кр./д`
          : '—',
      secondaryValue:
        currentWeek.avgNetCalories !== null
          ? `Нетен баланс: ${formatSigned(currentWeek.avgNetCalories, ' kcal/д')}`
          : 'Нетен баланс: няма TDEE данни',
      previousText:
        previousWeek.avgSteps !== null || previousWeek.avgNetCalories !== null
          ? `Предх.: ${
              previousWeek.avgSteps !== null
                ? `${previousWeek.avgSteps.toLocaleString('bg-BG')} кр.`
                : '—'
            } · ${
              previousWeek.avgNetCalories !== null
                ? `${formatSigned(previousWeek.avgNetCalories, ' kcal')}`
                : '—'
            }`
          : 'Предх. седмица: няма данни',
      deltaText:
        stepsDelta !== null
          ? `${formatSigned(stepsDelta, ' кр./д')}`
          : 'Без база за сравнение',
      direction: stepsDirection,
      sentiment: stepsSentiment,
      hasData:
        currentWeek.avgSteps !== null || currentWeek.avgNetCalories !== null,
    },
    {
      id: 'strength',
      title: 'Силови тренировки (Hevy)',
      primaryValue: `${currentWeek.workoutSessions} тр. · ${currentWeek.totalWorkingSets} сер.`,
      secondaryValue: `Тонаж: ${currentWeek.totalTonnageKg.toLocaleString('bg-BG')} kg`,
      previousText: `Предх. седмица: ${previousWeek.workoutSessions} тр. · ${previousWeek.totalWorkingSets} сер. (${previousWeek.totalTonnageKg.toLocaleString('bg-BG')} kg)`,
      deltaText: `${formatSigned(setsDelta, ' сер.')} · ${formatSigned(tonnageDelta, ' kg')}`,
      direction: strengthDirection,
      sentiment: strengthSentiment,
      hasData: currentWeek.workoutSessions > 0 || previousWeek.workoutSessions > 0,
    },
    {
      id: 'discipline',
      title: 'Дисциплина и навици',
      primaryValue:
        currentWeek.beneficialHabitsPct !== null
          ? `${currentWeek.beneficialHabitsPct}% полезни`
          : '—',
      secondaryValue:
        currentWeek.habitLoggedDays > 0
          ? `Чисти дни: ${currentWeek.cleanDaysCount}/${currentWeek.habitLoggedDays} (0 вредни)`
          : 'Няма отбелязани навици',
      previousText:
        previousWeek.beneficialHabitsPct !== null
          ? `Предх. седмица: ${previousWeek.beneficialHabitsPct}% · ${previousWeek.cleanDaysCount}/${previousWeek.habitLoggedDays} чисти`
          : 'Предх. седмица: няма данни',
      deltaText:
        habitDelta !== null
          ? `${formatSigned(habitDelta, '%')} · ${formatSigned(cleanDelta, ' чисти дни')}`
          : 'Без база за сравнение',
      direction: disciplineDirection,
      sentiment: disciplineSentiment,
      hasData: currentWeek.habitLoggedDays > 0,
    },
    {
      id: 'readiness_testosterone',
      title: 'Индекс на готовност и тестостерон',
      primaryValue:
        currentWeek.avgReadinessTestosteroneIndex !== null
          ? `${currentWeek.avgReadinessTestosteroneIndex} / 100`
          : '—',
      secondaryValue:
        currentWeek.readinessSamples > 0
          ? `Изчислен от ${currentWeek.readinessSamples} приключени дни`
          : 'Попълни сън, пулс и навици',
      previousText:
        previousWeek.avgReadinessTestosteroneIndex !== null
          ? `Предх. седмица: ${previousWeek.avgReadinessTestosteroneIndex} / 100`
          : 'Предх. седмица: няма данни',
      deltaText:
        readinessDelta !== null
          ? `${formatSigned(readinessDelta, ' т.')}`
          : 'Без база за сравнение',
      direction: readinessDirection,
      sentiment: readinessSentiment,
      hasData: currentWeek.avgReadinessTestosteroneIndex !== null,
    },
  ];

  // Overall weekly score (0–100)
  const sleepSub =
    currentWeek.avgSleepHours !== null
      ? clamp(
          Math.round(
            (currentWeek.avgSleepHours / 7.8) * 85 +
              ((currentWeek.avgSleepQuality ?? 3.5) / 5) * 15,
          ),
          15,
          100,
        )
      : 55;

  const trainingSub =
    currentWeek.workoutSessions >= 4 && currentWeek.totalWorkingSets >= 45
      ? 96
      : currentWeek.workoutSessions >= 3 && currentWeek.totalWorkingSets >= 30
        ? 86
        : currentWeek.workoutSessions >= 2
          ? 70
          : currentWeek.workoutSessions === 1
            ? 48
            : 20;

  const cleanRatio =
    currentWeek.habitLoggedDays > 0
      ? currentWeek.cleanDaysCount / currentWeek.habitLoggedDays
      : 0.5;
  const disciplineSub =
    currentWeek.beneficialHabitsPct !== null
      ? clamp(
          Math.round(currentWeek.beneficialHabitsPct * 0.55 + cleanRatio * 100 * 0.45),
          10,
          100,
        )
      : 55;

  let activityEnergySub = 65;
  if (currentWeek.avgSteps !== null) {
    activityEnergySub = clamp(
      Math.round((currentWeek.avgSteps / Math.max(4000, dailyStepsGoal)) * 100),
      20,
      100,
    );
  }
  if (currentWeek.avgNetCalories !== null && currentWeek.avgNetCalories < -800) {
    activityEnergySub = Math.min(activityEnergySub, 55);
  }

  const readinessHormonalSub =
    currentWeek.avgReadinessTestosteroneIndex ?? 60;

  const overallScore = hasAnyData
    ? clamp(
        Math.round(
          sleepSub * 0.25 +
            trainingSub * 0.2 +
            disciplineSub * 0.2 +
            activityEnergySub * 0.15 +
            readinessHormonalSub * 0.2,
        ),
        0,
        100,
      )
    : 0;

  const scoreTier: WeeklyScorecardReport['scoreTier'] =
    overallScore >= 82
      ? 'excellent'
      : overallScore >= 68
        ? 'solid'
        : overallScore >= 50
          ? 'adjust'
          : 'overload';

  const scoreTierLabel =
    !hasAnyData
      ? 'Очакват се данни за седмицата'
      : scoreTier === 'excellent'
        ? 'Отлична седмица'
        : scoreTier === 'solid'
          ? 'Стабилен прогрес'
          : scoreTier === 'adjust'
            ? 'Нужна е корекция'
            : 'Претоварване / Нисък ритъм';

  // Determine ONE single concrete Main Focus for the upcoming week
  const { pushSets, pullSets, backRearSets } = countPullAndRearDeltSets(
    hevyWorkouts,
    currStart,
    currEnd,
  );

  const mainFocus = selectMainWeeklyFocus({
    hasAnyData,
    currentWeek,
    dailyStepsGoal,
    pushSets,
    pullSets,
    backRearSets,
  });

  return {
    todayKey,
    isBannerDay: isWeeklyReviewBannerDay(todayKey),
    currentWeek,
    previousWeek,
    comparisons,
    overallScore,
    scoreTier,
    scoreTierLabel,
    scoreBreakdown: {
      sleep: sleepSub,
      training: trainingSub,
      discipline: disciplineSub,
      activityEnergy: activityEnergySub,
      readinessHormonal: readinessHormonalSub,
    },
    mainFocus,
    hasAnyData,
  };
}

function selectMainWeeklyFocus(params: {
  hasAnyData: boolean;
  currentWeek: WeeklyPeriodMetrics;
  dailyStepsGoal: number;
  pushSets: number;
  pullSets: number;
  backRearSets: number;
}): WeeklyMainFocus {
  const {
    hasAnyData,
    currentWeek,
    dailyStepsGoal,
    pushSets,
    pullSets,
    backRearSets,
  } = params;

  if (!hasAnyData) {
    return {
      category: 'Начало на цикъла',
      headline: 'Попълни поне 4 приключени дни в „Дневен запис“ и импортирай Hevy тренировки.',
      rationale:
        'Неделният обзор сравнява последните 7 завършени дни (от вчера назад) спрямо предходната седмица.',
      actionLine:
        'Започни със запис за вчера (сън, тегло, крачки и навици), за да отключиш точната седмична оценка.',
    };
  }

  const sleepGapMin =
    currentWeek.avgSleepHours !== null && currentWeek.avgSleepHours < 7.2
      ? Math.max(30, Math.round((7.7 - currentWeek.avgSleepHours) * 60 / 15) * 15)
      : 0;
  const backPullLagging =
    currentWeek.workoutSessions > 0 &&
    (backRearSets < 6 || (pushSets > 6 && pushSets > pullSets * 1.3));
  const cleanDaysLow =
    currentWeek.habitLoggedDays >= 3 &&
    currentWeek.cleanDaysCount <= currentWeek.habitLoggedDays - 2;
  const stepsLow =
    currentWeek.avgSteps !== null && currentWeek.avgSteps < dailyStepsGoal * 0.72;
  const crashDeficit =
    currentWeek.avgNetCalories !== null && currentWeek.avgNetCalories < -750;
  const lowTrainingSessions = currentWeek.workoutSessions < 2;

  if (sleepGapMin > 0 && backPullLagging) {
    return {
      category: 'Възстановяване + Баланс на обема',
      headline: `Фокус: Вдигни средния сън с +${sleepGapMin} мин и добави 4 серии за гръб/задно рамо.`,
      rationale: `Средният сън беше ${currentWeek.avgSleepHours?.toFixed(
        1,
      )} ч (под 7.5 ч), а дърпащите/задните серии са едва ${backRearSets} за седмицата.`,
      actionLine:
        'Лягай 45 мин по-рано поне 5 вечери и включи Face Pull (3×15) + Chest Supported Dumbbell Row (3×10).',
    };
  }

  if (sleepGapMin > 0) {
    return {
      category: 'Сън и хормонално възстановяване',
      headline: `Фокус: Вдигни средния сън с +${sleepGapMin} мин до минимум 7.5 часа на нощ.`,
      rationale: `Средният ти сън през завършената седмица беше ${currentWeek.avgSleepHours?.toFixed(
        1,
      )} ч — това директно потиска индекса на готовност и естествения тестостерон.`,
      actionLine:
        'Задай фиксиран час за лягане без екрани 45 мин преди сън и следи качеството да мине 4.0/5.',
    };
  }

  if (cleanDaysLow) {
    const harmfulDays = currentWeek.habitLoggedDays - currentWeek.cleanDaysCount;
    return {
      category: 'Дисциплина и чисти дни',
      headline: `Фокус: Постигни поне 6 чисти дни (0 вредни навици) през новата седмица.`,
      rationale: `Отчетени са ${harmfulDays} дни с вредни навици от ${currentWeek.habitLoggedDays} записани, което понижава възстановяването и качеството на съня.`,
      actionLine:
        'Ограничи алкохола, никотина и късното лягане в дните около тежките силови тренировки.',
    };
  }

  if (crashDeficit) {
    return {
      category: 'Енергиен баланс',
      headline: 'Фокус: Смекчи калорийния дефицит до -350…-500 kcal/ден, за да пазиш мускула.',
      rationale: `Средният нетен баланс е ${currentWeek.avgNetCalories} kcal/ден — прекалено агресивният дефицит сваля силата и тестостерона.`,
      actionLine:
        'Добави +250–350 kcal от качествени въглехидрати около тренировката и поддържай протеина над 1.8 g/kg.',
    };
  }

  if (backPullLagging) {
    return {
      category: 'Мускулен баланс (Push/Pull)',
      headline: 'Фокус: Добави 4–6 работни серии за гръб и задно рамо през новата седмица.',
      rationale: `За завършената седмица имаш ${pushSets} бутащи срещу ${pullSets} дърпащи серии (${backRearSets} за гръб/задно рамо).`,
      actionLine:
        'Включи Face Pull (3×12–15) и Chest Supported Dumbbell Row (3×8–10) в тренировките за горна част.',
    };
  }

  if (stepsLow && currentWeek.avgSteps !== null) {
    const stepAdd = Math.max(
      1500,
      Math.round((dailyStepsGoal - currentWeek.avgSteps) / 500) * 500,
    );
    return {
      category: 'NEAT и дневна активност',
      headline: `Фокус: Увеличи средните крачки с +${stepAdd.toLocaleString('bg-BG')} на ден.`,
      rationale: `Средно ${currentWeek.avgSteps.toLocaleString(
        'bg-BG',
      )} крачки/ден е под целта от ${dailyStepsGoal.toLocaleString('bg-BG')} и ограничава активния разход.`,
      actionLine:
        'Добави една 25-минутна разходка след вечеря или между работните задачи всеки ден.',
    };
  }

  if (lowTrainingSessions) {
    return {
      category: 'Тренировъчна честота',
      headline: 'Фокус: Изпълни поне 3 структурирани силови тренировки през новата седмица.',
      rationale: `Завършената седмица има ${currentWeek.workoutSessions} силови сесии (${currentWeek.totalWorkingSets} работни серии).`,
      actionLine:
        'Запази 3 фиксирани дни в календара (напр. Пон / Ср / Пет) и запиши сесиите в Hevy.',
    };
  }

  return {
    category: 'Прогресивно натоварване',
    headline:
      'Фокус: Запази отличния ритъм и добави +2.5 kg или +1 повторение на 2 основни базови упражнения.',
    rationale: `Сън ${
      currentWeek.avgSleepHours !== null ? `${currentWeek.avgSleepHours.toFixed(1)} ч` : 'стабилен'
    }, ${currentWeek.workoutSessions} тренировки (${currentWeek.totalWorkingSets} серии) и ${
      currentWeek.cleanDaysCount
    } чисти дни дават зелена светлина за прогрес.`,
    actionLine:
      'Провери препоръките за смяна при застой в „Интелигентен треньор“ и атакувай нов личен рекорд.',
  };
}
