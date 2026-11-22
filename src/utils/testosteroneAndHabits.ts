import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  computeDailyEnergySummary,
  isDateIncludedForEveningMetric,
} from './dailyLogs';
import { classifyHabitPolarity } from './habitBodyImpact';
import { buildAllWorkoutsHiddenPrIndex } from './hiddenProgressAndEnvironment';

export const TRIBULUS_HABIT_NAME = 'Бабини зъби (Tribulus terrestris)';

export const TRIBULUS_OBJECTIVE_NOTE =
  'Обективна научна бележка: Бабините зъби (Tribulus terrestris) подпомагат либидото, субективния тонус и кръвообращението, докато най-силното реално покачване на собствения тестостерон идва от дълбокия сън (7.5–8.5 ч), тежките базови упражнения, цинка и витамин D, полезните мазнини и избягването на алкохол и никотин.';

export function isTribulusHabit(habitName: string): boolean {
  const norm = habitName.trim().toLowerCase();
  return (
    norm.includes('бабини зъби') ||
    norm.includes('tribulus') ||
    norm.includes('трибулус')
  );
}

export function hasTribulusInLog(log: Pick<DailyBiometricLog, 'completedHabits'>): boolean {
  return log.completedHabits.some(isTribulusHabit);
}

export interface TribulusAnalysisReport {
  streakDays: number;
  streakWeeks: number;
  totalLoggedDays: number;
  daysLast30d: number;
  needsCycleBreak: boolean;
  cycleAdvice: string;
  sleepQualityWith: number | null;
  sleepQualityWithout: number | null;
  sleepHoursWith: number | null;
  sleepHoursWithout: number | null;
  repPrRateWithPct: number | null;
  repPrRateWithoutPct: number | null;
  workoutsWithCount: number;
  workoutsWithoutCount: number;
  correlationSummary: string;
  objectiveNote: string;
}

export interface HabitPlanActionItem {
  id: string;
  priority: 1 | 2 | 3;
  title: string;
  rationale: string;
  evidence: string;
  category: 'sleep' | 'alcohol' | 'nicotine' | 'nutrition' | 'training' | 'stress' | 'general';
}

export type TestosteroneRowStatus = 'green' | 'yellow' | 'red';

export interface TestosteroneComparisonRow {
  id:
    | 'strength_growth'
    | 'recovery_rhr'
    | 'sleep_freshness'
    | 'body_composition'
    | 'energy_motivation'
    | 'libido_hormones';
  metricTitle: string;
  highTestosteroneText: string;
  lowTestosteroneText: string;
  status: TestosteroneRowStatus;
  statusLabel: string;
  userEvidence: string;
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

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return roundOne(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function hasHarmfulCategory(habits: string[], keywords: string[]): boolean {
  return habits.some((h) => {
    if (classifyHabitPolarity(h) !== 'harmful') return false;
    const low = h.toLowerCase();
    return keywords.some((kw) => low.includes(kw));
  });
}

/**
 * Tracks consecutive days/weeks of Tribulus terrestris usage, warns after 42–56 days
 * without a break, and computes correlations with sleep quality, freshness, and Rep PRs.
 */
export function analyzeTribulusUsage(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
}): TribulusAnalysisReport {
  const { dailyLogs, hevyWorkouts, todayKey, bodyWeightKg = null } = params;
  const logByDate = new Map<string, DailyBiometricLog>();
  const tribulusDates = new Set<string>();

  for (const d of dailyLogs) {
    logByDate.set(d.date, d);
    if (hasTribulusInLog(d)) {
      tribulusDates.add(d.date);
    }
  }

  // Consecutive streak anchored on today or yesterday (since users fill yesterday by default)
  let anchor = todayKey;
  if (!tribulusDates.has(anchor)) {
    const yesterday = shiftDate(todayKey, -1);
    if (tribulusDates.has(yesterday)) {
      anchor = yesterday;
    } else if (tribulusDates.size > 0) {
      // Check if most recent logged date in historical data is continuous
      const sortedTrib = Array.from(tribulusDates).sort();
      const latest = sortedTrib[sortedTrib.length - 1];
      anchor = latest;
    }
  }

  let streakDays = 0;
  let cursor = anchor;
  let guard = 0;
  while (tribulusDates.has(cursor) && guard < 365) {
    streakDays += 1;
    guard += 1;
    cursor = shiftDate(cursor, -1);
  }

  // If latest Tribulus date is more than 2 days before todayKey, active streak is 0
  const yesterdayKey = shiftDate(todayKey, -1);
  const twoDaysAgoKey = shiftDate(todayKey, -2);
  if (
    tribulusDates.size > 0 &&
    !tribulusDates.has(todayKey) &&
    !tribulusDates.has(yesterdayKey) &&
    !tribulusDates.has(twoDaysAgoKey)
  ) {
    // Only reset if user actually has newer logs without Tribulus
    const hasNewerLog = dailyLogs.some((d) => d.date > anchor);
    if (hasNewerLog) {
      streakDays = 0;
    }
  }

  const streakWeeks = roundOne(streakDays / 7);
  const start30d = shiftDate(todayKey, -29);
  const daysLast30d = Array.from(tribulusDates).filter(
    (dt) => dt >= start30d && dt <= todayKey,
  ).length;

  const needsCycleBreak = streakDays >= 42;
  let cycleAdvice: string;
  if (needsCycleBreak) {
    cycleAdvice = `Приемаш Бабини зъби вече ${streakDays} поредни дни (${streakWeeks} седм.) без пауза. Препоръчително е да направиш 2 седмици почивка, за да запазиш чувствителността на организма.`;
  } else if (streakDays >= 28) {
    const daysLeft = Math.max(1, 42 - streakDays);
    cycleAdvice = `Активен цикъл: ${streakDays} дни (${streakWeeks} седм.). Остават около ${daysLeft} дни до препоръчителната 2-седмична пауза (на 6–8 седмици).`;
  } else if (streakDays > 0) {
    cycleAdvice = `Приемаш Бабини зъби ${streakDays} ${
      streakDays === 1 ? 'ден' : 'поредни дни'
    }. Стандартният цикъл е 6–8 седмици (42–56 дни), последван от 2 седмици почивка.`;
  } else {
    cycleAdvice =
      'Все още няма активна серия за „🌿 Бабини зъби (Tribulus terrestris)“. Отбележи го в „Дневен запис“, за да проследяваш цикъла и ефекта върху съня и Rep PR-ите.';
  }

  // Correlations: Sleep quality & Sleep hours WITH vs WITHOUT Tribulus
  const sqWith: number[] = [];
  const sqWithout: number[] = [];
  const shWith: number[] = [];
  const shWithout: number[] = [];

  for (const log of dailyLogs) {
    const took = hasTribulusInLog(log);
    if (log.sleepQuality !== undefined) {
      (took ? sqWith : sqWithout).push(log.sleepQuality);
    }
    if (log.sleepHours !== undefined && log.sleepHours > 0) {
      (took ? shWith : shWithout).push(log.sleepHours);
    }
  }

  const sleepQualityWith = avg(sqWith);
  const sleepQualityWithout = avg(sqWithout);
  const sleepHoursWith = avg(shWith);
  const sleepHoursWithout = avg(shWithout);

  // Correlation with Rep PRs: workouts on a Tribulus day (or day after Tribulus) vs workouts without
  const prIndex = buildAllWorkoutsHiddenPrIndex(hevyWorkouts, bodyWeightKg);
  const workoutsWithPrFlags: boolean[] = [];
  const workoutsWithoutPrFlags: boolean[] = [];

  for (const w of hevyWorkouts) {
    if (!w.date) continue;
    const prevDate = shiftDate(w.date, -1);
    const hasLogContext = logByDate.has(w.date) || logByDate.has(prevDate);
    if (!hasLogContext) continue;

    const tookAroundWorkout =
      tribulusDates.has(w.date) || tribulusDates.has(prevDate);
    const hadRepPr = w.exercises.some((ex) => {
      const info = prIndex.byWorkoutAndExercise.get(
        `${w.id}::${ex.title.trim().toLowerCase()}`,
      );
      return Boolean(info?.isRepPR);
    });

    if (tookAroundWorkout) {
      workoutsWithPrFlags.push(hadRepPr);
    } else {
      workoutsWithoutPrFlags.push(hadRepPr);
    }
  }

  const repPrRateWithPct =
    workoutsWithPrFlags.length > 0
      ? Math.round(
          (workoutsWithPrFlags.filter(Boolean).length /
            workoutsWithPrFlags.length) *
            100,
        )
      : null;
  const repPrRateWithoutPct =
    workoutsWithoutPrFlags.length > 0
      ? Math.round(
          (workoutsWithoutPrFlags.filter(Boolean).length /
            workoutsWithoutPrFlags.length) *
            100,
        )
      : null;

  let correlationSummary: string;
  if (tribulusDates.size < 3) {
    correlationSummary =
      'Натрупай поне 3 дни с отбелязан прием, за да се изчисли личната ти корелация със съня, бодростта и Rep PR-ите.';
  } else {
    const parts: string[] = [];
    if (sleepQualityWith !== null && sleepQualityWithout !== null) {
      const diff = roundOne(sleepQualityWith - sleepQualityWithout);
      parts.push(
        `Бодрост/сън: ${sleepQualityWith}/5 с прием vs ${sleepQualityWithout}/5 без (${
          diff >= 0 ? `+${diff}` : diff
        })`,
      );
    }
    if (repPrRateWithPct !== null && repPrRateWithoutPct !== null) {
      parts.push(
        `Rep PR тренировки: ${repPrRateWithPct}% с прием vs ${repPrRateWithoutPct}% без`,
      );
    }
    correlationSummary =
      parts.length > 0
        ? parts.join(' · ')
        : `Записани ${tribulusDates.size} дни с прием — добави и дни без прием/тренировки за A/B сравнение.`;
  }

  return {
    streakDays,
    streakWeeks,
    totalLoggedDays: tribulusDates.size,
    daysLast30d,
    needsCycleBreak,
    cycleAdvice,
    sleepQualityWith,
    sleepQualityWithout,
    sleepHoursWith,
    sleepHoursWithout,
    repPrRateWithPct,
    repPrRateWithoutPct,
    workoutsWithCount: workoutsWithPrFlags.length,
    workoutsWithoutCount: workoutsWithoutPrFlags.length,
    correlationSummary,
    objectiveNote: TRIBULUS_OBJECTIVE_NOTE,
  };
}

/**
 * Generates Top 3 concrete, data-driven actions for boosting natural testosterone
 * and eliminating harmful habits based on the user's real last 7 days.
 */
export function buildPersonalizedHabitsPlan(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
  dailyStepsGoal?: number;
}): HabitPlanActionItem[] {
  const {
    dailyLogs,
    hevyWorkouts,
    todayKey,
    bodyWeightKg = null,
    dailyStepsGoal = DEFAULT_DAILY_STEPS_GOAL,
  } = params;

  const endDate = todayKey;
  const startDate = shiftDate(endDate, -6);
  const logs7d = dailyLogs.filter((d) => d.date >= startDate && d.date <= endDate);
  const workouts7d = hevyWorkouts.filter(
    (w) => w.date >= startDate && w.date <= endDate,
  );

  const candidates: Array<Omit<HabitPlanActionItem, 'priority'> & { score: number }> = [];

  // 1) Alcohol check
  const alcoholDays = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['алкохол', 'alcohol', 'бира', 'вино', 'уиски', 'ракия']),
  ).length;
  if (alcoholDays > 0) {
    candidates.push({
      id: 'cut-alcohol',
      category: 'alcohol',
      score: 95 + alcoholDays * 8,
      title: 'Изчисти алкохола за следващите 7 дни',
      rationale:
        'Алкохолът директно потиска клетките на Лайдиг, повишава ароматазата (тестостерон → естроген) и накъсва REM съня.',
      evidence: `Засечени ${alcoholDays} ${alcoholDays === 1 ? 'ден' : 'дни'} с алкохол в последните 7 дни.`,
    });
  }

  // 2) Sleep duration & late bedtime check
  const sleepHoursVals = logs7d
    .map((d) => d.sleepHours)
    .filter((v): v is number => v !== undefined && v > 0);
  const avgSleep7d = avg(sleepHoursVals);
  const lateBedDays = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['късно лягане', 'късен сън', 'late']),
  ).length;
  const lowSleepQDays = logs7d.filter(
    (d) => d.sleepQuality !== undefined && d.sleepQuality <= 3,
  ).length;

  if (
    (avgSleep7d !== null && avgSleep7d < 7.3) ||
    lateBedDays >= 2 ||
    lowSleepQDays >= 2
  ) {
    candidates.push({
      id: 'fix-sleep',
      category: 'sleep',
      score:
        92 +
        (avgSleep7d !== null && avgSleep7d < 6.8 ? 15 : 0) +
        lateBedDays * 4,
      title: 'Фиксирай час за лягане за 7.5–8.5 ч дълбок сън',
      rationale:
        'Основният денонощен синтез на тестостерон се случва по време на дълбокия сън. Спирай екраните 45 мин преди лягане и спи на хладно.',
      evidence:
        avgSleep7d !== null
          ? `Ср. сън (7 д.): ${avgSleep7d} ч${lateBedDays > 0 ? ` · ${lateBedDays} д. късно лягане` : ''}.`
          : `${lateBedDays} д. късно лягане · ${lowSleepQDays} д. ниска бодрост (≤ 3/5).`,
    });
  }

  // 3) Nicotine check
  const nicotineDays = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['никотин', 'цигар', 'вейп', 'iqos', 'nicotine', 'smoke']),
  ).length;
  if (nicotineDays > 0) {
    candidates.push({
      id: 'cut-nicotine',
      category: 'nicotine',
      score: 88 + nicotineDays * 5,
      title: 'Ограничи никотина (особено 4 ч преди сън)',
      rationale:
        'Никотинът свива кръвоносните съдове, вдига сутрешния пулс и кортизола и влошава качеството на нощното възстановяване.',
      evidence: `Отбелязан в ${nicotineDays} от последните 7 дни.`,
    });
  }

  // 4) Junk / Sugar & Nutrition (Protein + Healthy Fats + Zinc/Vit D)
  const junkDays = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['джънк', 'захар', 'сладко', 'junk', 'fast food']),
  ).length;
  const proteinVals = logs7d
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'protein'))
    .map((d) => d.proteinGrams as number);
  const avgProt = avg(proteinVals);
  const protPerKg =
    avgProt !== null && bodyWeightKg && bodyWeightKg > 0
      ? roundOne(avgProt / bodyWeightKg)
      : null;

  if (junkDays >= 2 || (protPerKg !== null && protPerKg < 1.6)) {
    candidates.push({
      id: 'nutrition-fats-protein',
      category: 'nutrition',
      score: 82 + junkDays * 4,
      title: 'Замени захарта с полезни мазнини, цинк и протеин (≥ 1.6 g/kg)',
      rationale:
        'Холестеролът от цели яйца, зехтин и риба е градивният материал на тестостерона; резките пикове на инсулин от захар го понижават.',
      evidence:
        protPerKg !== null
          ? `Ср. протеин: ${avgProt} g (${protPerKg} g/kg)${junkDays > 0 ? ` · ${junkDays} д. джънк/захар` : ''}.`
          : `${junkDays} д. с джънк/захар в последните 7 дни.`,
    });
  }

  // 5) High Stress check
  const stressDays = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['стрес', 'stress']),
  ).length;
  if (stressDays >= 2) {
    candidates.push({
      id: 'manage-stress',
      category: 'stress',
      score: 80 + stressDays * 4,
      title: 'Свали кортизола с 15-мин разходка на слънце и дишане',
      rationale:
        'Хроничният кортизол и тестостеронът споделят общ прекурсор (прегненолон) — високият стрес буквално „краде“ от тестостерона.',
      evidence: `Висок стрес отбелязан в ${stressDays} от последните 7 дни.`,
    });
  }

  // 6) Compound training frequency / NEAT steps
  const stepsVals = logs7d
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'steps'))
    .map((d) => d.steps as number);
  const avgSteps = avg(stepsVals);

  if (workouts7d.length < 3) {
    candidates.push({
      id: 'heavy-compounds',
      category: 'training',
      score: 76,
      title: 'Включи 3 базови силови тренировки седмично',
      rationale:
        'Многоставните тежки упражнения (клек, тяга, набирания, лежанка, кофички) дават най-силния анаболен и хормонален стимул.',
      evidence: `Записани ${workouts7d.length} тренировки в последните 7 дни.`,
    });
  } else if (avgSteps !== null && avgSteps < Math.min(8000, dailyStepsGoal * 0.75)) {
    candidates.push({
      id: 'daily-sunlight-steps',
      category: 'training',
      score: 72,
      title: 'Добави 20–30 мин ходене на дневна светлина',
      rationale:
        'Слънчевата светлина стимулира синтеза на витамин D, а ежедневните крачки държат инсулиновата чувствителност висока.',
      evidence: `Ср. крачки (7 д.): ${Math.round(avgSteps)} / цел ${dailyStepsGoal}.`,
    });
  }

  // Default evergreen boosters to always guarantee 3 crisp actionable items
  const fallbacks: Array<Omit<HabitPlanActionItem, 'priority'> & { score: number }> = [
    {
      id: 'fallback-sleep-sun',
      category: 'sleep',
      score: 50,
      title: 'Пази 7.5–8.5 ч сън + 15 мин сутрешна слънчева светлина',
      rationale:
        'Регулира циркадния ритъм, повишава сутрешния пик на тестостерон и поддържа стабилен витамин D.',
      evidence:
        avgSleep7d !== null
          ? `Текущ ср. сън: ${avgSleep7d} ч — задръж постоянството.`
          : 'Записвай часовете сън в „Дневен запис“ за точен анализ.',
    },
    {
      id: 'fallback-micros-fats',
      category: 'nutrition',
      score: 45,
      title: 'Осигури полезни мазнини, Цинк, Магнезий и Витамин D',
      rationale:
        'Яйца, червено месо, зехтин, тиквено семе и витамин D3 покриват основните кофактори за собствен тестостерон.',
      evidence: 'Базов хормонален стандарт при активни силови тренировки.',
    },
    {
      id: 'fallback-clean-habits',
      category: 'general',
      score: 40,
      title: 'Задръж чиста серия без алкохол, никотин и късни екрани',
      rationale:
        'Липсата на хормонални саботьори е най-бързият начин тялото да поддържа висок свободен тестостерон.',
      evidence: `Отлична дисциплина в последните 7 дни (${logs7d.length} записани дни).`,
    },
  ];

  const chosen: Array<Omit<HabitPlanActionItem, 'priority'>> = [];
  const usedIds = new Set<string>();
  const usedCategories = new Set<string>();

  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (chosen.length >= 3) break;
    if (usedIds.has(c.id)) continue;
    usedIds.add(c.id);
    usedCategories.add(c.category);
    chosen.push(c);
  }
  for (const fb of fallbacks) {
    if (chosen.length >= 3) break;
    if (usedIds.has(fb.id) || usedCategories.has(fb.category)) continue;
    usedIds.add(fb.id);
    chosen.push(fb);
  }
  // Final safety fill if category dedup left < 3
  for (const fb of fallbacks) {
    if (chosen.length >= 3) break;
    if (usedIds.has(fb.id)) continue;
    usedIds.add(fb.id);
    chosen.push(fb);
  }

  return chosen.slice(0, 3).map((item, idx) => ({
    ...item,
    priority: (idx + 1) as 1 | 2 | 3,
  }));
}

function statusMeta(status: TestosteroneRowStatus): string {
  if (status === 'green') return 'Зелено · Оптимално';
  if (status === 'yellow') return 'Жълто · Внимание';
  return 'Червено · Риск';
}

/**
 * Builds the 6-row "High Natural Testosterone vs. Suppressed Testosterone" table
 * with live 7-day status indicators computed from dailyLogs and hevyWorkouts.
 */
export function buildTestosteroneComparisonRows(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
  profileHeightCm?: number | '';
  dailyStepsGoal?: number;
}): TestosteroneComparisonRow[] {
  const {
    dailyLogs,
    hevyWorkouts,
    todayKey,
    bodyWeightKg = null,
    profileHeightCm = '',
    dailyStepsGoal = DEFAULT_DAILY_STEPS_GOAL,
  } = params;

  const start7d = shiftDate(todayKey, -6);
  const start30d = shiftDate(todayKey, -29);
  const dailyAsc = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const logs7d = dailyAsc.filter((d) => d.date >= start7d && d.date <= todayKey);
  const workouts7d = hevyWorkouts.filter(
    (w) => w.date >= start7d && w.date <= todayKey,
  );

  // 1) Сила и мускулен растеж
  const prIndex = buildAllWorkoutsHiddenPrIndex(hevyWorkouts, bodyWeightKg);
  const prs7d = prIndex.recentEvents.filter(
    (e) => e.date >= start7d && e.date <= todayKey,
  ).length;
  let strengthStatus: TestosteroneRowStatus = 'yellow';
  let strengthEvidence = 'Няма записани тренировки в последните 7 дни.';
  if (workouts7d.length >= 3 || prs7d >= 1) {
    strengthStatus = 'green';
    strengthEvidence = `${workouts7d.length} тренировки · ${prs7d} Rep/Volume PR-а за 7 д.`;
  } else if (workouts7d.length >= 1) {
    strengthStatus = 'yellow';
    strengthEvidence = `${workouts7d.length} тренировка за 7 д. (цел ≥ 3 или нов PR).`;
  } else if (hevyWorkouts.length > 0) {
    strengthStatus = 'red';
    strengthEvidence = '0 тренировки за последните 7 дни — риск от застой.';
  }

  // 2) Възстановяване и сутрешен пулс
  const rhr30dVals = dailyAsc
    .filter((d) => d.date >= start30d && d.date <= todayKey && (d.restingHr ?? 0) > 0)
    .map((d) => d.restingHr as number);
  const rhr7dVals = logs7d
    .filter((d) => (d.restingHr ?? 0) > 0)
    .map((d) => d.restingHr as number);
  let rhrStatus: TestosteroneRowStatus = 'yellow';
  let rhrEvidence = 'Добави сутрешен пулс в „Дневен запис“.';
  if (rhr7dVals.length > 0) {
    const avg7 = avg(rhr7dVals) as number;
    const base30 = rhr30dVals.length >= 3 ? (avg(rhr30dVals) as number) : avg7;
    const delta = roundOne(avg7 - base30);
    if (delta > 4 || avg7 >= 76) {
      rhrStatus = 'red';
      rhrEvidence = `Ср. RHR ${avg7} bpm (+${delta} bpm спрямо 30-дн. база).`;
    } else if (delta > 2 || avg7 >= 68) {
      rhrStatus = 'yellow';
      rhrEvidence = `Ср. RHR ${avg7} bpm (${delta >= 0 ? `+${delta}` : delta} bpm спрямо базата).`;
    } else {
      rhrStatus = 'green';
      rhrEvidence = `Стабилен RHR ${avg7} bpm (${delta >= 0 ? `+${delta}` : delta} bpm).`;
    }
  }

  // 3) Сън и сутрешна бодрост
  const sleepHours7d = logs7d
    .map((d) => d.sleepHours)
    .filter((v): v is number => v !== undefined && v > 0);
  const sleepQ7d = logs7d
    .map((d) => d.sleepQuality)
    .filter((v): v is number => v !== undefined);
  const lateBed7d = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['късно лягане', 'късен сън', 'late']),
  ).length;
  const avgSleepH = avg(sleepHours7d);
  const avgSleepQ = avg(sleepQ7d);
  let sleepStatus: TestosteroneRowStatus = 'yellow';
  let sleepEvidence = 'Запиши часовете и качеството на съня.';
  if (avgSleepH !== null || avgSleepQ !== null) {
    if (
      (avgSleepH !== null && avgSleepH < 6.5) ||
      (avgSleepQ !== null && avgSleepQ <= 2.5) ||
      lateBed7d >= 3
    ) {
      sleepStatus = 'red';
    } else if (
      (avgSleepH !== null && avgSleepH >= 7.5) &&
      (avgSleepQ === null || avgSleepQ >= 3.8) &&
      lateBed7d <= 1
    ) {
      sleepStatus = 'green';
    } else {
      sleepStatus = 'yellow';
    }
    const parts: string[] = [];
    if (avgSleepH !== null) parts.push(`${avgSleepH} ч/нощ`);
    if (avgSleepQ !== null) parts.push(`бодрост ${avgSleepQ}/5`);
    if (lateBed7d > 0) parts.push(`${lateBed7d} д. късно лягане`);
    sleepEvidence = parts.join(' · ');
  }

  // 4) Телесен състав и мазнини
  const steps7d = logs7d
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'steps'))
    .map((d) => d.steps as number);
  const avgSteps7d = avg(steps7d);
  const junk7d = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['джънк', 'захар', 'сладко', 'junk']),
  ).length;
  const balances = logs7d
    .filter(
      (d) =>
        isDateIncludedForEveningMetric(d, todayKey, 'caloriesIntake') &&
        isDateIncludedForEveningMetric(d, todayKey, 'activeCalories'),
    )
    .map((d) =>
      computeDailyEnergySummary({
        caloriesIntake: d.caloriesKcal,
        activeCalories: d.activeCalories,
        restingCalories: d.restingCalories,
        weightKg: d.weightKg ?? bodyWeightKg ?? undefined,
        heightCm: profileHeightCm,
      }).netBalance,
    )
    .filter((b): b is number => b !== null);
  const avgBalance = avg(balances);

  let bodyStatus: TestosteroneRowStatus = 'yellow';
  let bodyEvidence = 'Попълвай крачки и хранене за оценка на метаболизма.';
  if (avgSteps7d !== null || junk7d > 0 || avgBalance !== null) {
    if (junk7d >= 3 || (avgSteps7d !== null && avgSteps7d < 5500)) {
      bodyStatus = 'red';
    } else if (
      junk7d <= 1 &&
      (avgSteps7d === null || avgSteps7d >= Math.min(8500, dailyStepsGoal * 0.85))
    ) {
      bodyStatus = 'green';
    } else {
      bodyStatus = 'yellow';
    }
    const parts: string[] = [];
    if (avgSteps7d !== null) parts.push(`${Math.round(avgSteps7d)} крачки/д`);
    if (avgBalance !== null) parts.push(`баланс ${avgBalance > 0 ? '+' : ''}${Math.round(avgBalance)} kcal`);
    if (junk7d > 0) parts.push(`${junk7d} д. джънк/захар`);
    bodyEvidence = parts.join(' · ');
  }

  // 5) Енергия, фокус и мотивация
  const stress7d = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['стрес', 'stress']),
  ).length;
  let energyStatus: TestosteroneRowStatus = 'yellow';
  let energyEvidence = 'Запиши сутрешна бодрост и стрес за 7-дневна оценка.';
  if (avgSleepQ !== null || stress7d > 0 || workouts7d.length > 0) {
    if ((avgSleepQ !== null && avgSleepQ <= 2.5) || stress7d >= 3) {
      energyStatus = 'red';
    } else if ((avgSleepQ === null || avgSleepQ >= 4) && stress7d === 0 && workouts7d.length >= 2) {
      energyStatus = 'green';
    } else {
      energyStatus = 'yellow';
    }
    const parts: string[] = [];
    if (avgSleepQ !== null) parts.push(`бодрост ${avgSleepQ}/5`);
    parts.push(stress7d > 0 ? `${stress7d} д. висок стрес` : '0 д. висок стрес');
    energyEvidence = parts.join(' · ');
  }

  // 6) Либидо и хормонален баланс
  const alcohol7d = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['алкохол', 'alcohol', 'бира', 'вино', 'уиски', 'ракия']),
  ).length;
  const nicotine7d = logs7d.filter((d) =>
    hasHarmfulCategory(d.completedHabits, ['никотин', 'цигар', 'вейп', 'iqos', 'nicotine']),
  ).length;
  const tribulus7d = logs7d.filter(hasTribulusInLog).length;
  const saboteurCount = alcohol7d + nicotine7d + (avgSleepH !== null && avgSleepH < 6.5 ? 2 : 0);

  let libidoStatus: TestosteroneRowStatus = 'yellow';
  let libidoEvidence = 'Записвай навиците и съня си за оценка на хормоналния баланс.';
  if (logs7d.length > 0) {
    if (alcohol7d >= 2 || nicotine7d >= 3 || saboteurCount >= 3) {
      libidoStatus = 'red';
    } else if (alcohol7d === 0 && nicotine7d === 0 && (avgSleepH === null || avgSleepH >= 7.2)) {
      libidoStatus = 'green';
    } else {
      libidoStatus = 'yellow';
    }
    const parts: string[] = [];
    parts.push(alcohol7d > 0 ? `${alcohol7d} д. алкохол` : '0 д. алкохол');
    if (nicotine7d > 0) parts.push(`${nicotine7d} д. никотин`);
    if (tribulus7d > 0) parts.push(`🌿 Бабини зъби: ${tribulus7d}/7 д.`);
    libidoEvidence = parts.join(' · ');
  }

  return [
    {
      id: 'strength_growth',
      metricTitle: '1. Сила и мускулен растеж',
      highTestosteroneText:
        'Бърз протеинов синтез, стабилна мускулна плътност и регулярни нови Rep PRs.',
      lowTestosteroneText:
        'Застой в тежестите, по-бавно качване или загуба на мускул и доминация на катаболния кортизол.',
      status: strengthStatus,
      statusLabel: statusMeta(strengthStatus),
      userEvidence: strengthEvidence,
    },
    {
      id: 'recovery_rhr',
      metricTitle: '2. Възстановяване и сутрешен пулс',
      highTestosteroneText:
        'Нисък, стабилен сутрешен пулс (RHR) и бързо възстановяване на мускулите за 48 ч.',
      lowTestosteroneText:
        'Скок в пулса в покой (+4 bpm или повече) и тежка мускулна треска по 4+ дни.',
      status: rhrStatus,
      statusLabel: statusMeta(rhrStatus),
      userEvidence: rhrEvidence,
    },
    {
      id: 'sleep_freshness',
      metricTitle: '3. Сън и сутрешна бодрост',
      highTestosteroneText:
        'Дълбок фазов сън (7.5–8.5 ч) и висок естествен сутрешен пик на тестостерон.',
      lowTestosteroneText:
        'Накъсан, плитък сън от късни екрани, никотин или алкохол и тежко събуждане.',
      status: sleepStatus,
      statusLabel: statusMeta(sleepStatus),
      userEvidence: sleepEvidence,
    },
    {
      id: 'body_composition',
      metricTitle: '4. Телесен състав и мазнини',
      highTestosteroneText:
        'По-лесно изгаряне на висцерални мазнини около талията и висока инсулинова чувствителност.',
      lowTestosteroneText:
        'Задържане на вода и мазнини в коремната област, особено при захар и малко движение.',
      status: bodyStatus,
      statusLabel: statusMeta(bodyStatus),
      userEvidence: bodyEvidence,
    },
    {
      id: 'energy_motivation',
      metricTitle: '5. Енергия, фокус и мотивация',
      highTestosteroneText:
        'Висока допаминова активност, увереност, ментална яснота и естествен хъс за тренировка.',
      lowTestosteroneText:
        'Апатия, раздразнителност, следобеден спад и липса на желание за натоварване.',
      status: energyStatus,
      statusLabel: statusMeta(energyStatus),
      userEvidence: energyEvidence,
    },
    {
      id: 'libido_hormones',
      metricTitle: '6. Либидо и хормонален баланс',
      highTestosteroneText:
        'Висок свободен тестостерон, добро кръвообращение и здравословен баланс с естрогена.',
      lowTestosteroneText:
        'Доминация на кортизола и естрогена при алкохол, никотин, хроничен стрес и недоспиване.',
      status: libidoStatus,
      statusLabel: statusMeta(libidoStatus),
      userEvidence: libidoEvidence,
    },
  ];
}
