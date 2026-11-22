import type { DailyBiometricLog, HevySet, HevyWorkout } from '../types/fitness';
import {
  DEFAULT_HABIT_ITEMS,
  isDateIncludedForEveningMetric,
} from './dailyLogs';
import {
  calculateEpley1RM,
  getExercisesSortedByFrequency,
  type ExerciseDropdownOption,
} from './hevyProgress';

export const STRENGTH_INDEX_OPTION = '__STRENGTH_INDEX__';

export type HabitPolarity = 'harmful' | 'beneficial';

const NEGATION_PREFIXES = [
  'без ',
  'no ',
  'without ',
  '0 ',
  'нулев',
  'отказ от ',
  'избягване на ',
];

const HARMFUL_HABIT_KEYWORDS = [
  'алкохол',
  'alcohol',
  'бира',
  'вино',
  'уиски',
  'ракия',
  'водка',
  'коктейл',
  'никотин',
  'nicotine',
  'цигар',
  'пушен',
  'тютюн',
  'вейп',
  'vape',
  'iqos',
  'smoke',
  'късно лягане',
  'късен сън',
  'лягане след',
  'late sleep',
  'late bed',
  'джънк',
  'junk',
  'fast food',
  'фаст фууд',
  'бърза храна',
  'захар',
  'сладко',
  'преяждан',
  'висок стрес',
  'стрес',
  'stress',
  'махмурлук',
  'hangover',
  'енергийн',
  'късно кафе',
  'недоспиван',
  'преумор',
  'вреден',
];

const COMPOUND_EXERCISE_KEYWORDS = [
  'bench press',
  'squat',
  'deadlift',
  'overhead press',
  'shoulder press',
  'barbell row',
  'bent over row',
  'pull up',
  'chin up',
  'incline',
  'leg press',
  'romanian deadlift',
  'dip',
];

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
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

function formatShortDay(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}.${parts[1]}`;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

/**
 * Classifies a habit label as 'harmful' (алкохол, никотин, късно лягане, джънк, висок стрес)
 * or 'beneficial' (including negated forms such as „Без захар / джънк“ or „Без алкохол“).
 */
export function classifyHabitPolarity(habitName: string): HabitPolarity {
  const normalized = habitName.trim().toLowerCase();
  if (!normalized) return 'beneficial';

  for (const prefix of NEGATION_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return 'beneficial';
    }
  }

  for (const kw of HARMFUL_HABIT_KEYWORDS) {
    if (normalized.includes(kw)) {
      return 'harmful';
    }
  }

  return 'beneficial';
}

export function extractDayHabits(log: DailyBiometricLog | undefined): {
  beneficial: string[];
  harmful: string[];
} {
  if (!log) return { beneficial: [], harmful: [] };

  const beneficial: string[] = [];
  const harmful: string[] = [];
  const seenBen = new Set<string>();
  const seenHarm = new Set<string>();

  const completed = Array.isArray(log.completedHabits) ? log.completedHabits : [];
  for (const raw of completed) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (classifyHabitPolarity(clean) === 'harmful') {
      if (!seenHarm.has(key)) {
        seenHarm.add(key);
        harmful.push(clean);
      }
    } else if (!seenBen.has(key)) {
      seenBen.add(key);
      beneficial.push(clean);
    }
  }

  // Optional compatibility if external data ever provides explicit badHabits / harmfulHabits arrays
  const extraRecord = log as unknown as {
    badHabits?: unknown;
    harmfulHabits?: unknown;
  };
  for (const extraList of [extraRecord.badHabits, extraRecord.harmfulHabits]) {
    if (!Array.isArray(extraList)) continue;
    for (const raw of extraList) {
      if (typeof raw !== 'string') continue;
      const clean = raw.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (!seenHarm.has(key)) {
        seenHarm.add(key);
        harmful.push(clean);
      }
    }
  }

  return { beneficial, harmful };
}

export interface HabitImpactExerciseOptionsResult {
  options: ExerciseDropdownOption[];
  defaultSelection: string;
}

export function getHabitImpactExerciseOptions(
  hevyWorkouts: HevyWorkout[],
): HabitImpactExerciseOptionsResult {
  const options = getExercisesSortedByFrequency(hevyWorkouts);
  if (options.length === 0) {
    return {
      options: [],
      defaultSelection: STRENGTH_INDEX_OPTION,
    };
  }

  // Prefer the most frequently trained weighted compound/base exercise
  const weighted = options.filter((o) => !o.isBodyweightOnly);
  const compoundWeighted = weighted.find((o) => {
    const lower = o.title.toLowerCase();
    return COMPOUND_EXERCISE_KEYWORDS.some((kw) => lower.includes(kw));
  });

  if (compoundWeighted) {
    return {
      options,
      defaultSelection: compoundWeighted.title,
    };
  }

  if (weighted.length > 0) {
    return {
      options,
      defaultSelection: weighted[0].title,
    };
  }

  return {
    options,
    defaultSelection: STRENGTH_INDEX_OPTION,
  };
}

export interface HabitImpactDayPoint {
  date: string;
  shortLabel: string;
  hasCheckIn: boolean;
  beneficialHabits: string[];
  beneficialCount: number;
  totalBeneficialTarget: number;
  harmfulHabits: string[];
  harmfulCount: number;
  hasHarmfulToday: boolean;
  prevDayHarmfulHabits: string[];
  isAfterHarmfulDay: boolean;
  isAfterCleanDay: boolean;
  restingHr: number | null;
  restingHrDelta: number | null;
  sleepHours: number | null;
  sleepQuality: number | null;
  hasWorkout: boolean;
  workoutTitles: string[];
  workoutVolumeKg: number;
  workoutAvgRpe: number | null;
  /** Value plotted on Track 3: 1RM in kg for a chosen exercise, or % when Strength Index mode is selected */
  strengthTrackValue: number | null;
  /** Always-computed normalized relative strength index (%) on weighted workout days */
  strengthIndexPct: number | null;
  best1RMExerciseLabel: string | null;
  best1RMValueKg: number | null;
}

export interface HabitABComparison {
  cleanSampleDays: number;
  harmfulSampleDays: number;
  restingHr: {
    cleanAvg: number | null;
    harmfulAvg: number | null;
    diffBpm: number | null;
  };
  sleepHours: {
    cleanAvg: number | null;
    harmfulAvg: number | null;
    diffHours: number | null;
  };
  strength: {
    cleanAvgIndexPct: number | null;
    harmfulAvgIndexPct: number | null;
    diffPct: number | null;
    cleanAvgRpe: number | null;
    harmfulAvgRpe: number | null;
    diffRpe: number | null;
    cleanWorkoutDays: number;
    harmfulWorkoutDays: number;
  };
  summaryHeadline: string | null;
}

export interface HabitBodyImpactDataset {
  anchorDate: string;
  latestDataDate: string | null;
  days: HabitImpactDayPoint[];
  selectedExercise: string;
  isStrengthIndexMode: boolean;
  strengthUnit: 'kg' | '%';
  strengthLabel: string;
  avgRestingHr30d: number | null;
  avgSleepHours30d: number | null;
  avgStrength30d: number | null;
  harmfulDaysCount30d: number;
  cleanDaysCount30d: number;
  workoutDaysCount30d: number;
  totalBeneficialTarget: number;
  abComparison: HabitABComparison;
}

function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return roundOne(values.reduce((a, b) => a + b, 0) / values.length);
}

export function buildHabitBodyImpactDataset(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  habitItems?: string[];
  todayKey: string;
  selectedExercise: string;
  anchorDateOverride?: string;
}): HabitBodyImpactDataset {
  const {
    dailyLogs,
    hevyWorkouts,
    habitItems = DEFAULT_HABIT_ITEMS,
    todayKey,
    selectedExercise,
    anchorDateOverride,
  } = params;

  // Determine latest available data date across dailyLogs & hevyWorkouts
  let latestDataDate: string | null = null;
  for (const d of dailyLogs) {
    if (d.date && (!latestDataDate || d.date > latestDataDate)) {
      latestDataDate = d.date;
    }
  }
  for (const w of hevyWorkouts) {
    if (w.date && (!latestDataDate || w.date > latestDataDate)) {
      latestDataDate = w.date;
    }
  }

  let anchorDate = anchorDateOverride || todayKey;
  if (!anchorDateOverride && latestDataDate) {
    const windowStartToday = shiftDate(todayKey, -29);
    if (latestDataDate < windowStartToday) {
      anchorDate = latestDataDate;
    }
  }

  const startDate = shiftDate(anchorDate, -29);

  // Index daily logs by date
  const logsByDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    if (log.date) {
      logsByDate.set(log.date, log);
    }
  }

  // Compute total configured beneficial habits denominator
  const beneficialHabitSet = new Set<string>();
  const sourceHabits = habitItems.length > 0 ? habitItems : DEFAULT_HABIT_ITEMS;
  for (const h of sourceHabits) {
    const clean = h.trim();
    if (clean && classifyHabitPolarity(clean) === 'beneficial') {
      beneficialHabitSet.add(clean.toLowerCase());
    }
  }
  for (const d of dailyLogs) {
    if (d.date >= startDate && d.date <= anchorDate) {
      for (const b of extractDayHabits(d).beneficial) {
        beneficialHabitSet.add(b.toLowerCase());
      }
    }
  }
  const totalBeneficialTarget = Math.max(1, beneficialHabitSet.size);

  // Compute per-exercise personal baseline Epley 1RM across all workouts for normalized Strength Index (%)
  const exerciseAllSession1RMs = new Map<string, number[]>();
  const workoutsByDate = new Map<string, HevyWorkout[]>();

  for (const w of hevyWorkouts) {
    if (w.date) {
      const list = workoutsByDate.get(w.date) ?? [];
      list.push(w);
      workoutsByDate.set(w.date, list);
    }
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const working = getWorkingSets(ex.sets);
      let best1RM = 0;
      for (const s of working) {
        if ((s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0) {
          const e = calculateEpley1RM(s.weightKg!, s.reps!);
          if (e > best1RM) best1RM = e;
        }
      }
      if (best1RM > 0) {
        const arr = exerciseAllSession1RMs.get(key) ?? [];
        arr.push(best1RM);
        exerciseAllSession1RMs.set(key, arr);
      }
    }
  }

  const exerciseBaseline1RM = new Map<string, number>();
  for (const [key, vals] of exerciseAllSession1RMs.entries()) {
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean > 0) {
      exerciseBaseline1RM.set(key, mean);
    }
  }

  const isStrengthIndexMode =
    !selectedExercise || selectedExercise === STRENGTH_INDEX_OPTION;
  const selectedExerciseKey = selectedExercise.trim().toLowerCase();

  // First pass: build raw 30-day points
  const rawDays: HabitImpactDayPoint[] = [];
  const hrValues30d: number[] = [];
  const sleepValues30d: number[] = [];
  const strengthValues30d: number[] = [];

  for (let i = 0; i < 30; i++) {
    const dateKey = shiftDate(startDate, i);
    const prevDateKey = shiftDate(dateKey, -1);

    const log = logsByDate.get(dateKey);
    const prevLog = logsByDate.get(prevDateKey);

    const todayHabits = extractDayHabits(log);
    const prevHabits = extractDayHabits(prevLog);

    const hasHarmfulToday = todayHabits.harmful.length > 0;
    const isAfterHarmfulDay = prevHabits.harmful.length > 0;
    const isAfterCleanDay =
      Boolean(prevLog) &&
      prevHabits.harmful.length === 0 &&
      prevHabits.beneficial.length >= 4;

    const restingHr = log?.restingHr !== undefined ? log.restingHr : null;
    const sleepHours = log?.sleepHours !== undefined ? log.sleepHours : null;
    const sleepQuality = log?.sleepQuality !== undefined ? log.sleepQuality : null;

    if (restingHr !== null) hrValues30d.push(restingHr);
    if (sleepHours !== null) sleepValues30d.push(sleepHours);

    // Aggregate workouts on this date
    const dayWorkouts = workoutsByDate.get(dateKey) ?? [];
    const hasWorkout = dayWorkouts.length > 0;
    const workoutTitles = dayWorkouts.map((w) => w.title).filter(Boolean);
    let workoutVolumeKg = 0;
    const rpeValues: number[] = [];
    const relativeRatios: number[] = [];
    let selectedExerciseBest1RM: number | null = null;
    let bestOverall1RMKg: number | null = null;
    let bestOverallExercise: string | null = null;

    for (const w of dayWorkouts) {
      workoutVolumeKg += w.totalVolumeKg;
      for (const ex of w.exercises) {
        const key = ex.title.trim().toLowerCase();
        const working = getWorkingSets(ex.sets);
        let exBest1RM = 0;
        for (const s of working) {
          if (s.rpe !== undefined && Number.isFinite(s.rpe)) {
            rpeValues.push(s.rpe);
          }
          if ((s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0) {
            const e = calculateEpley1RM(s.weightKg!, s.reps!);
            if (e > exBest1RM) exBest1RM = e;
          }
        }

        if (exBest1RM > 0) {
          if (bestOverall1RMKg === null || exBest1RM > bestOverall1RMKg) {
            bestOverall1RMKg = roundOne(exBest1RM);
            bestOverallExercise = ex.title;
          }
          const baseline = exerciseBaseline1RM.get(key);
          if (baseline && baseline > 0) {
            relativeRatios.push((exBest1RM / baseline) * 100);
          }
          if (!isStrengthIndexMode && key === selectedExerciseKey) {
            if (
              selectedExerciseBest1RM === null ||
              exBest1RM > selectedExerciseBest1RM
            ) {
              selectedExerciseBest1RM = roundOne(exBest1RM);
            }
          }
        }
      }
    }

    const strengthIndexPct =
      relativeRatios.length > 0
        ? roundOne(
            relativeRatios.reduce((a, b) => a + b, 0) / relativeRatios.length,
          )
        : null;

    const strengthTrackValue = isStrengthIndexMode
      ? strengthIndexPct
      : selectedExerciseBest1RM;

    if (strengthTrackValue !== null) {
      strengthValues30d.push(strengthTrackValue);
    }

    rawDays.push({
      date: dateKey,
      shortLabel: formatShortDay(dateKey),
      hasCheckIn: Boolean(log),
      beneficialHabits: todayHabits.beneficial,
      beneficialCount: todayHabits.beneficial.length,
      totalBeneficialTarget,
      harmfulHabits: todayHabits.harmful,
      harmfulCount: todayHabits.harmful.length,
      hasHarmfulToday,
      prevDayHarmfulHabits: prevHabits.harmful,
      isAfterHarmfulDay,
      isAfterCleanDay,
      restingHr,
      restingHrDelta: null,
      sleepHours,
      sleepQuality,
      hasWorkout,
      workoutTitles,
      workoutVolumeKg: Math.round(workoutVolumeKg),
      workoutAvgRpe: avgOrNull(rpeValues),
      strengthTrackValue,
      strengthIndexPct,
      best1RMExerciseLabel:
        !isStrengthIndexMode && selectedExerciseBest1RM !== null
          ? selectedExercise
          : bestOverallExercise,
      best1RMValueKg:
        !isStrengthIndexMode && selectedExerciseBest1RM !== null
          ? selectedExerciseBest1RM
          : bestOverall1RMKg,
    });
  }

  const avgRestingHr30d = avgOrNull(hrValues30d);
  const avgSleepHours30d = avgOrNull(sleepValues30d);
  const avgStrength30d = avgOrNull(strengthValues30d);

  // Second pass: populate restingHrDelta and A/B buckets
  const cleanHrs: number[] = [];
  const harmfulHrs: number[] = [];
  const cleanSleeps: number[] = [];
  const harmfulSleeps: number[] = [];
  const cleanStrengths: number[] = [];
  const harmfulStrengths: number[] = [];
  const cleanRpes: number[] = [];
  const harmfulRpes: number[] = [];

  let cleanSampleDays = 0;
  let harmfulSampleDays = 0;
  let harmfulDaysCount30d = 0;
  let cleanDaysCount30d = 0;
  let workoutDaysCount30d = 0;

  const days = rawDays.map((day) => {
    const restingHrDelta =
      day.restingHr !== null && avgRestingHr30d !== null
        ? roundOne(day.restingHr - avgRestingHr30d)
        : null;

    const habitsCompletedForDay =
      day.date !== todayKey ||
      isDateIncludedForEveningMetric(logsByDate.get(day.date), todayKey, 'habits');
    if (habitsCompletedForDay && day.hasHarmfulToday) harmfulDaysCount30d += 1;
    if (
      habitsCompletedForDay &&
      day.hasCheckIn &&
      !day.hasHarmfulToday &&
      day.beneficialCount >= 4
    ) {
      cleanDaysCount30d += 1;
    }
    if (day.hasWorkout) workoutDaysCount30d += 1;

    if (day.isAfterHarmfulDay) {
      harmfulSampleDays += 1;
      if (day.restingHr !== null) harmfulHrs.push(day.restingHr);
      if (day.sleepHours !== null) harmfulSleeps.push(day.sleepHours);
      if (day.strengthIndexPct !== null)
        harmfulStrengths.push(day.strengthIndexPct);
      if (day.workoutAvgRpe !== null) harmfulRpes.push(day.workoutAvgRpe);
    } else if (day.isAfterCleanDay) {
      cleanSampleDays += 1;
      if (day.restingHr !== null) cleanHrs.push(day.restingHr);
      if (day.sleepHours !== null) cleanSleeps.push(day.sleepHours);
      if (day.strengthIndexPct !== null)
        cleanStrengths.push(day.strengthIndexPct);
      if (day.workoutAvgRpe !== null) cleanRpes.push(day.workoutAvgRpe);
    }

    return {
      ...day,
      restingHrDelta,
    };
  });

  const cleanHrAvg = avgOrNull(cleanHrs);
  const harmfulHrAvg = avgOrNull(harmfulHrs);
  const diffBpm =
    cleanHrAvg !== null && harmfulHrAvg !== null
      ? roundOne(harmfulHrAvg - cleanHrAvg)
      : null;

  const cleanSleepAvg = avgOrNull(cleanSleeps);
  const harmfulSleepAvg = avgOrNull(harmfulSleeps);
  const diffHours =
    cleanSleepAvg !== null && harmfulSleepAvg !== null
      ? roundOne(harmfulSleepAvg - cleanSleepAvg)
      : null;

  const cleanStrengthAvg = avgOrNull(cleanStrengths);
  const harmfulStrengthAvg = avgOrNull(harmfulStrengths);
  const diffStrengthPct =
    cleanStrengthAvg !== null && harmfulStrengthAvg !== null && cleanStrengthAvg > 0
      ? roundOne(
          ((harmfulStrengthAvg - cleanStrengthAvg) / cleanStrengthAvg) * 100,
        )
      : null;

  const cleanRpeAvg = avgOrNull(cleanRpes);
  const harmfulRpeAvg = avgOrNull(harmfulRpes);
  const diffRpe =
    cleanRpeAvg !== null && harmfulRpeAvg !== null
      ? roundOne(harmfulRpeAvg - cleanRpeAvg)
      : null;

  const summaryParts: string[] = [];
  if (diffBpm !== null) {
    summaryParts.push(`Пулс ${diffBpm > 0 ? '+' : ''}${diffBpm} bpm`);
  }
  if (diffHours !== null) {
    summaryParts.push(`Сън ${diffHours > 0 ? '+' : ''}${diffHours} ч.`);
  }
  if (diffStrengthPct !== null) {
    summaryParts.push(
      `Сила ${diffStrengthPct > 0 ? '+' : ''}${diffStrengthPct}%`,
    );
  } else if (diffRpe !== null) {
    summaryParts.push(`RPE ${diffRpe > 0 ? '+' : ''}${diffRpe}`);
  }

  const summaryHeadline =
    summaryParts.length > 0
      ? `След вреден навик: ${summaryParts.join(' | ')}`
      : null;

  return {
    anchorDate,
    latestDataDate,
    days,
    selectedExercise: isStrengthIndexMode
      ? STRENGTH_INDEX_OPTION
      : selectedExercise,
    isStrengthIndexMode,
    strengthUnit: isStrengthIndexMode ? '%' : 'kg',
    strengthLabel: isStrengthIndexMode
      ? 'Среден индекс на силата (%)'
      : `${selectedExercise} (1RM kg)`,
    avgRestingHr30d,
    avgSleepHours30d,
    avgStrength30d,
    harmfulDaysCount30d,
    cleanDaysCount30d,
    workoutDaysCount30d,
    totalBeneficialTarget,
    abComparison: {
      cleanSampleDays,
      harmfulSampleDays,
      restingHr: {
        cleanAvg: cleanHrAvg,
        harmfulAvg: harmfulHrAvg,
        diffBpm,
      },
      sleepHours: {
        cleanAvg: cleanSleepAvg,
        harmfulAvg: harmfulSleepAvg,
        diffHours,
      },
      strength: {
        cleanAvgIndexPct: cleanStrengthAvg,
        harmfulAvgIndexPct: harmfulStrengthAvg,
        diffPct: diffStrengthPct,
        cleanAvgRpe: cleanRpeAvg,
        harmfulAvgRpe: harmfulRpeAvg,
        diffRpe,
        cleanWorkoutDays: cleanStrengths.length,
        harmfulWorkoutDays: harmfulStrengths.length,
      },
      summaryHeadline,
    },
  };
}
