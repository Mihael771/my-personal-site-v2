import type {
  DailyBiometricLog,
  HevySet,
  HevyWorkout,
} from '../types/fitness';
import {
  diffCalendarDays,
  isValidDateKey,
  shiftDateKey,
} from './fitnessMath';
import { calculateEpley1RM } from './hevyProgress';
import { buildAllWorkoutsHiddenPrIndex } from './hiddenProgressAndEnvironment';

// ============================================================================
// Shared Helpers
// ============================================================================

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

const BOXING_KEYWORDS = [
  'бокс',
  'boxing',
  'спаринг',
  'sparring',
  'бокс с чувал',
  'боксов чувал',
  'heavy bag',
  'punching bag',
  'shadowbox',
  'shadow box',
  'бой със сянка',
  'лапи',
  'pad work',
  'mitts',
  'кикбокс',
  'kickboxing',
  'муай тай',
  'muay thai',
];

function containsKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Detects boxing / combat-bag / sparring sessions so Module 1 excludes them
 * from pure strength relative-strength pairing while Module 2 keeps all sessions.
 */
export function isBoxingWorkout(
  workout: Pick<HevyWorkout, 'title' | 'description' | 'exercises'>,
): boolean {
  const titleLower = `${workout.title ?? ''} ${workout.description ?? ''}`
    .trim()
    .toLowerCase();

  const exercises = workout.exercises ?? [];
  const exTitles = exercises.map((e) => e.title.trim().toLowerCase());

  if (containsKeyword(titleLower, BOXING_KEYWORDS)) {
    // If title explicitly says boxing/sparring, treat as boxing session unless
    // majority of exercises clearly have weighted strength sets AND aren't boxing exercises
    const nonBoxingWeightedCount = exercises.filter((ex) => {
      const lower = ex.title.trim().toLowerCase();
      if (containsKeyword(lower, BOXING_KEYWORDS)) return false;
      return ex.sets.some((s) => (s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0);
    }).length;
    if (exercises.length === 0 || nonBoxingWeightedCount < Math.ceil(exercises.length * 0.6)) {
      return true;
    }
  }

  if (exercises.length === 0) return false;

  let boxingExercises = 0;
  for (const t of exTitles) {
    if (containsKeyword(t, BOXING_KEYWORDS)) {
      boxingExercises += 1;
    }
  }

  return boxingExercises > 0 && boxingExercises >= Math.ceil(exercises.length / 2);
}

// ============================================================================
// Body Weight Resolution (Exact Date -> Nearest ±7d -> Latest Known -> Fallback)
// ============================================================================

export type WeightMatchSource = 'exact' | 'nearest_7d' | 'latest_known' | 'profile';

export interface ResolvedWeightMatch {
  weightKg: number;
  source: WeightMatchSource;
  matchedDate: string | null;
  dayOffset: number | null;
}

export interface WeightSample {
  date: string;
  weightKg: number;
}

export function extractDailyWeightSamples(dailyLogs: DailyBiometricLog[]): WeightSample[] {
  const byDate = new Map<string, number>();
  for (const log of dailyLogs) {
    if (
      isValidDateKey(log.date) &&
      typeof log.weightKg === 'number' &&
      Number.isFinite(log.weightKg) &&
      log.weightKg >= 30 &&
      log.weightKg <= 250
    ) {
      byDate.set(log.date, round1(log.weightKg));
    }
  }
  return Array.from(byDate.entries())
    .map(([date, weightKg]) => ({ date, weightKg }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function resolveWeightForDate(
  dateKey: string,
  weightSamples: WeightSample[],
  fallbackWeightKg?: number | null,
): ResolvedWeightMatch | null {
  if (isValidDateKey(dateKey) && weightSamples.length > 0) {
    // 1. Exact date
    const exact = weightSamples.find((s) => s.date === dateKey);
    if (exact) {
      return {
        weightKg: exact.weightKg,
        source: 'exact',
        matchedDate: exact.date,
        dayOffset: 0,
      };
    }

    // 2. Nearest within ±7 days (prefer prior day on tie)
    let bestSample: WeightSample | null = null;
    let bestAbsDiff = Infinity;
    let bestSignedDiff = 0;
    for (const s of weightSamples) {
      const signed = diffCalendarDays(dateKey, s.date); // negative = before workout
      const abs = Math.abs(signed);
      if (abs > 7) continue;
      if (
        abs < bestAbsDiff ||
        (abs === bestAbsDiff && signed < bestSignedDiff)
      ) {
        bestAbsDiff = abs;
        bestSignedDiff = signed;
        bestSample = s;
      }
    }
    if (bestSample) {
      return {
        weightKg: bestSample.weightKg,
        source: 'nearest_7d',
        matchedDate: bestSample.date,
        dayOffset: bestSignedDiff,
      };
    }

    // 3. Fallback to latest known daily weight
    const latest = weightSamples[weightSamples.length - 1];
    if (latest) {
      return {
        weightKg: latest.weightKg,
        source: 'latest_known',
        matchedDate: latest.date,
        dayOffset: diffCalendarDays(dateKey, latest.date),
      };
    }
  }

  // 4. Profile / manual fallback
  if (
    typeof fallbackWeightKg === 'number' &&
    Number.isFinite(fallbackWeightKg) &&
    fallbackWeightKg >= 30 &&
    fallbackWeightKg <= 250
  ) {
    return {
      weightKg: round1(fallbackWeightKg),
      source: 'profile',
      matchedDate: null,
      dayOffset: null,
    };
  }

  return null;
}

// ============================================================================
// MODULE 1: Относителна сила и боксова категория
// ============================================================================

export type RelativeMovementId =
  | 'pull_up'
  | 'dip'
  | 'muscle_up'
  | 'bench_press'
  | 'squat'
  | 'deadlift'
  | 'overhead_press';

export type RelativeMovementCategory = 'bodyweight' | 'barbell';

interface MovementMatcherSpec {
  id: RelativeMovementId;
  label: string;
  shortLabel: string;
  category: RelativeMovementCategory;
  matches: (titleLower: string) => boolean;
}

const MOVEMENT_SPECS: MovementMatcherSpec[] = [
  {
    id: 'pull_up',
    label: 'Набирания (Pull-Up / Chin-Up)',
    shortLabel: 'Набирания',
    category: 'bodyweight',
    matches: (t) =>
      (t.includes('pull up') ||
        t.includes('pull-up') ||
        t.includes('pullup') ||
        t.includes('chin up') ||
        t.includes('chin-up') ||
        t.includes('chinup') ||
        t.includes('набира')) &&
      !t.includes('assisted') &&
      !t.includes('асистиран') &&
      !t.includes('lat pulldown') &&
      !t.includes('скрипец') &&
      !t.includes('australian') &&
      !t.includes('inverted'),
  },
  {
    id: 'dip',
    label: 'Кофички (Dips)',
    shortLabel: 'Кофички',
    category: 'bodyweight',
    matches: (t) =>
      (t.includes('dip') || t.includes('кофичк')) &&
      !t.includes('assisted') &&
      !t.includes('асистиран') &&
      !t.includes('machine') &&
      !t.includes('машина'),
  },
  {
    id: 'muscle_up',
    label: 'Силови възлизания (Muscle-Up)',
    shortLabel: 'Силови (MU)',
    category: 'bodyweight',
    matches: (t) =>
      t.includes('muscle up') ||
      t.includes('muscle-up') ||
      t.includes('muscleup') ||
      t.includes('силово') ||
      t.includes('силови'),
  },
  {
    id: 'bench_press',
    label: 'Лежанка (Bench Press)',
    shortLabel: 'Лежанка',
    category: 'barbell',
    matches: (t) =>
      (t.includes('bench press') ||
        t.includes('лежанка') ||
        t.includes('избутване от лег')) &&
      !t.includes('dumbbell') &&
      !t.includes('дъмбел') &&
      !t.includes('decline'),
  },
  {
    id: 'squat',
    label: 'Клек (Squat)',
    shortLabel: 'Клек',
    category: 'barbell',
    matches: (t) =>
      (t.includes('squat') || t.includes('клек')) &&
      !t.includes('split') &&
      !t.includes('bulgarian') &&
      !t.includes('български') &&
      !t.includes('goblet') &&
      !t.includes('pistol') &&
      !t.includes('bodyweight') &&
      !t.includes('собствено'),
  },
  {
    id: 'deadlift',
    label: 'Мъртва тяга (Deadlift)',
    shortLabel: 'Мъртва тяга',
    category: 'barbell',
    matches: (t) =>
      (t.includes('deadlift') || t.includes('мъртва тяга') || t.includes('тяга')) &&
      !t.includes('romanian') &&
      !t.includes('румънска') &&
      !t.includes('stiff') &&
      !t.includes('single leg') &&
      !t.includes('dumbbell') &&
      !t.includes('дъмбел'),
  },
  {
    id: 'overhead_press',
    label: 'Раменна преса (Overhead Press)',
    shortLabel: 'Раменна преса',
    category: 'barbell',
    matches: (t) =>
      (t.includes('overhead press') ||
        t.includes('military press') ||
        t.includes('barbell shoulder press') ||
        t.includes('раменна преса') ||
        t.includes('военна преса')) &&
      !t.includes('dumbbell') &&
      !t.includes('дъмбел') &&
      !t.includes('machine') &&
      !t.includes('машина'),
  },
];

export function matchRelativeMovement(
  exerciseTitle: string,
): MovementMatcherSpec | null {
  const lower = exerciseTitle.trim().toLowerCase();
  if (!lower) return null;
  for (const spec of MOVEMENT_SPECS) {
    if (spec.matches(lower)) return spec;
  }
  return null;
}

export interface RelativeStrengthSessionPoint {
  date: string; // YYYY-MM-DD
  workoutId: string;
  workoutTitle: string;
  movementId: RelativeMovementId;
  movementLabel: string;
  movementShortLabel: string;
  exerciseTitle: string;
  category: RelativeMovementCategory;
  bodyWeightKg: number;
  weightSource: WeightMatchSource;
  weightMatchedDate: string | null;
  weightDayOffset: number | null;
  /** Added weight for bodyweight lifts, or lifted barbell weight for barbell lifts */
  externalWeightKg: number;
  reps: number;
  /** Bodyweight + addedWeight for bodyweight lifts; Epley 1RM for barbell lifts */
  primaryLoadKg: number;
  /** Relative strength ratio: primaryLoadKg / bodyWeightKg */
  ratio: number;
  /** For bodyweight lifts, also store Epley 1RM / BW as supplemental context */
  epley1RmRatio: number;
  detailText: string;
}

export interface RelativeMovementSummary {
  id: RelativeMovementId;
  label: string;
  shortLabel: string;
  category: RelativeMovementCategory;
  sessionsCount: number;
  latestPoint: RelativeStrengthSessionPoint;
  bestPoint: RelativeStrengthSessionPoint;
  windowStartRatio: number | null;
  windowEndRatio: number | null;
  windowDeltaRatio: number | null;
  windowDeltaPct: number | null;
  pointsInWindow: RelativeStrengthSessionPoint[];
}

export interface CompositeTrendPoint {
  date: string;
  ratio: number;
  bodyWeightKg: number;
  activeMovementsCount: number;
  triggerLabel: string;
}

export interface BoxingWeightClassItem {
  id: string;
  label: string;
  rangeLabel: string;
  limitKg: number;
  isOpenEnded?: boolean;
  /** Positive = above limit (need to cut), Negative = below limit (headroom) */
  diffKg: number | null;
  statusText: string;
  isCurrentClass: boolean;
}

export const BOXING_WEIGHT_CLASSES: Array<{
  id: string;
  label: string;
  rangeLabel: string;
  limitKg: number;
  isOpenEnded?: boolean;
}> = [
  { id: 'light_welter', label: 'Лека полусредна', rangeLabel: 'до 63.5 kg', limitKg: 63.5 },
  { id: 'welter', label: 'Полусредна', rangeLabel: 'до 67 kg', limitKg: 67 },
  { id: 'light_middle', label: 'Първа средна', rangeLabel: 'до 71 kg', limitKg: 71 },
  { id: 'middle', label: 'Средна', rangeLabel: 'до 75 kg', limitKg: 75 },
  { id: 'light_heavy', label: 'Полутежка', rangeLabel: '80–81 kg', limitKg: 81 },
  { id: 'cruiser', label: 'Първа тежка (Cruiser)', rangeLabel: 'до 86 kg', limitKg: 86 },
  { id: 'heavy', label: 'Тежка', rangeLabel: '91–92 kg', limitKg: 92 },
  { id: 'super_heavy', label: 'Супертежка', rangeLabel: '+92 kg', limitKg: 92, isOpenEnded: true },
];

export interface BoxingWeightClassReport {
  avgWeight7d: number | null;
  samplesIn7dCount: number;
  latestWeightKg: number | null;
  latestWeightDate: string | null;
  weightSourceLabel: string;
  currentClass: BoxingWeightClassItem | null;
  nearestClasses: BoxingWeightClassItem[];
  allClasses: BoxingWeightClassItem[];
  targetWeightKg: number | null;
  diffToTargetKg: number | null;
  targetStatusText: string | null;
}

export interface RelativeStrengthReport {
  anchorDate: string;
  windowDays: 60 | 90;
  windowStartDate: string;
  strengthWorkoutsAnalyzed: number;
  excludedBoxingWorkoutsCount: number;
  allPoints: RelativeStrengthSessionPoint[];
  movements: RelativeMovementSummary[];
  compositeSeriesInWindow: CompositeTrendPoint[];
  compositeStartRatio: number | null;
  compositeLatestRatio: number | null;
  compositeDeltaRatio: number | null;
  compositeDeltaPct: number | null;
  trendVerdict: 'gaining' | 'stable' | 'declining' | 'insufficient';
  trendHeadline: string;
  trendDetail: string;
  boxingWeight: BoxingWeightClassReport;
}

function resolveAnchorDateForHistory(
  dates: string[],
  todayKey: string,
): string {
  const validDates = dates.filter((d) => isValidDateKey(d)).sort();
  if (validDates.length === 0) return todayKey;
  const latestDate = validDates[validDates.length - 1];
  const gap = Math.abs(diffCalendarDays(latestDate, todayKey));
  return gap > 14 ? latestDate : todayKey;
}

function buildBoxingWeightClassReport(params: {
  dailyLogs: DailyBiometricLog[];
  fallbackWeightKg?: number | null;
  targetWeightKg?: number | null;
  todayKey: string;
}): BoxingWeightClassReport {
  const { dailyLogs, fallbackWeightKg, targetWeightKg, todayKey } = params;
  const samples = extractDailyWeightSamples(dailyLogs);

  const latestSample = samples.length > 0 ? samples[samples.length - 1] : null;
  const weightAnchor = latestSample
    ? Math.abs(diffCalendarDays(latestSample.date, todayKey)) > 14
      ? latestSample.date
      : todayKey
    : todayKey;
  const sevenDayStart = shiftDateKey(weightAnchor, -6);

  const last7dSamples = samples.filter(
    (s) => s.date >= sevenDayStart && s.date <= weightAnchor,
  );

  let avgWeight7d: number | null = null;
  let weightSourceLabel = 'Няма записано тегло';

  if (last7dSamples.length > 0) {
    const sum = last7dSamples.reduce((acc, s) => acc + s.weightKg, 0);
    avgWeight7d = round1(sum / last7dSamples.length);
    weightSourceLabel = `7-дн. средно от ${last7dSamples.length} ${
      last7dSamples.length === 1 ? 'сутрешен запис' : 'сутрешни записа'
    }`;
  } else if (samples.length > 0) {
    const tail = samples.slice(-7);
    const sum = tail.reduce((acc, s) => acc + s.weightKg, 0);
    avgWeight7d = round1(sum / tail.length);
    weightSourceLabel = `Средно от последните ${tail.length} записа`;
  } else if (
    typeof fallbackWeightKg === 'number' &&
    Number.isFinite(fallbackWeightKg) &&
    fallbackWeightKg >= 30 &&
    fallbackWeightKg <= 250
  ) {
    avgWeight7d = round1(fallbackWeightKg);
    weightSourceLabel = 'Тегло от профила';
  }

  let currentClassId: string | null = null;
  if (avgWeight7d !== null) {
    const bounded = BOXING_WEIGHT_CLASSES.filter((c) => !c.isOpenEnded);
    const matched = bounded.find((c) => avgWeight7d <= c.limitKg);
    currentClassId = matched ? matched.id : 'super_heavy';
  }

  const allClasses: BoxingWeightClassItem[] = BOXING_WEIGHT_CLASSES.map((cls) => {
    if (avgWeight7d === null) {
      return {
        ...cls,
        diffKg: null,
        statusText: '—',
        isCurrentClass: false,
      };
    }

    const diffKg = round1(avgWeight7d - cls.limitKg);
    const isCurrentClass = cls.id === currentClassId;

    let statusText: string;
    if (cls.isOpenEnded) {
      statusText =
        diffKg > 0
          ? `+${diffKg.toFixed(1)} kg над 92 kg (в категория)`
          : `${diffKg.toFixed(1)} kg до +92 kg`;
    } else if (Math.abs(diffKg) < 0.05) {
      statusText = 'Точно на лимита';
    } else if (diffKg > 0) {
      statusText = `+${diffKg.toFixed(1)} kg над лимита`;
    } else {
      statusText = `${diffKg.toFixed(1)} kg под лимита`;
    }

    return {
      ...cls,
      diffKg,
      statusText,
      isCurrentClass,
    };
  });

  const currentClass =
    allClasses.find((c) => c.isCurrentClass) ?? null;

  // Pick the 4 closest classes around the user's current weight (always keeping relevant neighbors)
  let nearestClasses: BoxingWeightClassItem[];
  if (avgWeight7d === null) {
    nearestClasses = allClasses.filter((c) =>
      ['middle', 'light_heavy', 'cruiser', 'heavy'].includes(c.id),
    );
  } else {
    const currentIdx = allClasses.findIndex((c) => c.isCurrentClass);
    const start = Math.max(0, Math.min(allClasses.length - 4, currentIdx - 1));
    nearestClasses = allClasses.slice(start, start + 4);
  }

  const cleanTarget =
    typeof targetWeightKg === 'number' &&
    Number.isFinite(targetWeightKg) &&
    targetWeightKg >= 30 &&
    targetWeightKg <= 250
      ? round1(targetWeightKg)
      : null;

  const diffToTargetKg =
    avgWeight7d !== null && cleanTarget !== null
      ? round1(avgWeight7d - cleanTarget)
      : null;

  let targetStatusText: string | null = null;
  if (diffToTargetKg !== null && cleanTarget !== null) {
    if (Math.abs(diffToTargetKg) < 0.1) {
      targetStatusText = `Точно на целевото тегло (${cleanTarget.toFixed(1)} kg)`;
    } else if (diffToTargetKg > 0) {
      targetStatusText = `+${diffToTargetKg.toFixed(1)} kg над целта (${cleanTarget.toFixed(1)} kg)`;
    } else {
      targetStatusText = `${diffToTargetKg.toFixed(1)} kg под целта (${cleanTarget.toFixed(1)} kg)`;
    }
  }

  return {
    avgWeight7d,
    samplesIn7dCount: last7dSamples.length,
    latestWeightKg: latestSample?.weightKg ?? (avgWeight7d ?? null),
    latestWeightDate: latestSample?.date ?? null,
    weightSourceLabel,
    currentClass,
    nearestClasses,
    allClasses,
    targetWeightKg: cleanTarget,
    diffToTargetKg,
    targetStatusText,
  };
}

export function analyzeRelativeStrengthAndBoxing(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  fallbackWeightKg?: number | null;
  targetWeightKg?: number | null;
  todayKey: string;
  windowDays?: 60 | 90;
}): RelativeStrengthReport {
  const {
    hevyWorkouts,
    dailyLogs,
    fallbackWeightKg = null,
    targetWeightKg = null,
    todayKey,
    windowDays = 90,
  } = params;

  const weightSamples = extractDailyWeightSamples(dailyLogs);
  const boxingWeight = buildBoxingWeightClassReport({
    dailyLogs,
    fallbackWeightKg,
    targetWeightKg,
    todayKey,
  });

  // Sort chronologically oldest -> newest
  const chronologicalWorkouts = [...hevyWorkouts]
    .filter((w) => isValidDateKey(w.date))
    .sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return a.startTime.localeCompare(b.startTime);
    });

  let excludedBoxingWorkoutsCount = 0;
  const strengthWorkouts: HevyWorkout[] = [];
  for (const w of chronologicalWorkouts) {
    if (isBoxingWorkout(w)) {
      excludedBoxingWorkoutsCount += 1;
    } else {
      strengthWorkouts.push(w);
    }
  }

  const allPoints: RelativeStrengthSessionPoint[] = [];

  for (const workout of strengthWorkouts) {
    const resolvedWeight = resolveWeightForDate(
      workout.date,
      weightSamples,
      fallbackWeightKg,
    );
    if (!resolvedWeight || resolvedWeight.weightKg <= 0) continue;
    const bw = resolvedWeight.weightKg;

    // Best record per movement inside this workout
    const bestByMovement = new Map<RelativeMovementId, RelativeStrengthSessionPoint>();

    for (const ex of workout.exercises) {
      const spec = matchRelativeMovement(ex.title);
      if (!spec) continue;
      const workingSets = getWorkingSets(ex.sets);

      if (spec.category === 'bodyweight') {
        let bestAdded = -1;
        let bestReps = 0;
        let bestTotalLoad = 0;

        for (const s of workingSets) {
          const reps = Math.max(0, Math.round(s.reps ?? 0));
          if (reps < 1) continue;
          const added = Math.max(0, round1(s.weightKg ?? 0));
          const totalLoad = round1(bw + added);

          if (
            totalLoad > bestTotalLoad ||
            (totalLoad === bestTotalLoad && reps > bestReps)
          ) {
            bestTotalLoad = totalLoad;
            bestAdded = added;
            bestReps = reps;
          }
        }

        if (bestTotalLoad <= 0 || bestReps < 1) continue;

        const ratio = round2(bestTotalLoad / bw);
        const epleyTotal = calculateEpley1RM(bestTotalLoad, bestReps);
        const epley1RmRatio = round2(epleyTotal / bw);
        const addedLabel = bestAdded > 0 ? `+${bestAdded} kg` : 'Собств. тегло';
        const point: RelativeStrengthSessionPoint = {
          date: workout.date,
          workoutId: workout.id,
          workoutTitle: workout.title,
          movementId: spec.id,
          movementLabel: spec.label,
          movementShortLabel: spec.shortLabel,
          exerciseTitle: ex.title,
          category: spec.category,
          bodyWeightKg: bw,
          weightSource: resolvedWeight.source,
          weightMatchedDate: resolvedWeight.matchedDate,
          weightDayOffset: resolvedWeight.dayOffset,
          externalWeightKg: bestAdded,
          reps: bestReps,
          primaryLoadKg: bestTotalLoad,
          ratio,
          epley1RmRatio,
          detailText: `${addedLabel} × ${bestReps} (общо ${bestTotalLoad} kg · ${ratio.toFixed(2)}x BW)`,
        };

        const existing = bestByMovement.get(spec.id);
        if (
          !existing ||
          point.ratio > existing.ratio ||
          (point.ratio === existing.ratio && point.reps > existing.reps)
        ) {
          bestByMovement.set(spec.id, point);
        }
      } else {
        // Barbell / weighted compound: 1RM = weight * (1 + reps / 30), ratio = 1RM / BW
        let best1RM = 0;
        let bestWeight = 0;
        let bestReps = 0;

        for (const s of workingSets) {
          const weight = s.weightKg ?? 0;
          const reps = Math.max(0, Math.round(s.reps ?? 0));
          if (weight <= 0 || reps < 1) continue;
          const est1RM = calculateEpley1RM(weight, reps);
          if (est1RM > best1RM) {
            best1RM = est1RM;
            bestWeight = round1(weight);
            bestReps = reps;
          }
        }

        if (best1RM <= 0) continue;

        const ratio = round2(best1RM / bw);
        const point: RelativeStrengthSessionPoint = {
          date: workout.date,
          workoutId: workout.id,
          workoutTitle: workout.title,
          movementId: spec.id,
          movementLabel: spec.label,
          movementShortLabel: spec.shortLabel,
          exerciseTitle: ex.title,
          category: spec.category,
          bodyWeightKg: bw,
          weightSource: resolvedWeight.source,
          weightMatchedDate: resolvedWeight.matchedDate,
          weightDayOffset: resolvedWeight.dayOffset,
          externalWeightKg: bestWeight,
          reps: bestReps,
          primaryLoadKg: best1RM,
          ratio,
          epley1RmRatio: ratio,
          detailText: `${bestWeight} kg × ${bestReps} (1RM ${best1RM} kg · ${ratio.toFixed(2)}x BW)`,
        };

        const existing = bestByMovement.get(spec.id);
        if (!existing || point.ratio > existing.ratio) {
          bestByMovement.set(spec.id, point);
        }
      }
    }

    for (const pt of bestByMovement.values()) {
      allPoints.push(pt);
    }
  }

  const anchorDate = resolveAnchorDateForHistory(
    [
      ...allPoints.map((p) => p.date),
      ...strengthWorkouts.map((w) => w.date),
    ],
    todayKey,
  );
  const windowStartDate = shiftDateKey(anchorDate, -(windowDays - 1));

  // Build per-movement summaries
  const movements: RelativeMovementSummary[] = [];
  for (const spec of MOVEMENT_SPECS) {
    const pts = allPoints.filter((p) => p.movementId === spec.id);
    if (pts.length === 0) continue;

    const latestPoint = pts[pts.length - 1];
    let bestPoint = pts[0];
    for (const p of pts) {
      if (
        p.ratio > bestPoint.ratio ||
        (p.ratio === bestPoint.ratio && p.epley1RmRatio > bestPoint.epley1RmRatio)
      ) {
        bestPoint = p;
      }
    }

    const pointsInWindow = pts.filter(
      (p) => p.date >= windowStartDate && p.date <= anchorDate,
    );
    const windowStartRatio =
      pointsInWindow.length >= 2 ? pointsInWindow[0].ratio : null;
    const windowEndRatio =
      pointsInWindow.length >= 2
        ? pointsInWindow[pointsInWindow.length - 1].ratio
        : pointsInWindow.length === 1
          ? pointsInWindow[0].ratio
          : null;
    const windowDeltaRatio =
      windowStartRatio !== null && windowEndRatio !== null
        ? round2(windowEndRatio - windowStartRatio)
        : null;
    const windowDeltaPct =
      windowStartRatio !== null &&
      windowDeltaRatio !== null &&
      windowStartRatio > 0
        ? round1((windowDeltaRatio / windowStartRatio) * 100)
        : null;

    movements.push({
      id: spec.id,
      label: spec.label,
      shortLabel: spec.shortLabel,
      category: spec.category,
      sessionsCount: pts.length,
      latestPoint,
      bestPoint,
      windowStartRatio,
      windowEndRatio,
      windowDeltaRatio,
      windowDeltaPct,
      pointsInWindow,
    });
  }

  // Build smooth carry-forward composite relative strength series over the 60/90d window
  // Seed carry-forward state from the last point of each movement BEFORE windowStartDate
  const latestRatioByMovement = new Map<RelativeMovementId, number>();
  for (const pt of allPoints) {
    if (pt.date < windowStartDate) {
      latestRatioByMovement.set(pt.movementId, pt.ratio);
    }
  }

  const windowPointsByDate = new Map<string, RelativeStrengthSessionPoint[]>();
  for (const pt of allPoints) {
    if (pt.date < windowStartDate || pt.date > anchorDate) continue;
    const arr = windowPointsByDate.get(pt.date) ?? [];
    arr.push(pt);
    windowPointsByDate.set(pt.date, arr);
  }

  const sortedWindowDates = Array.from(windowPointsByDate.keys()).sort();
  const compositeSeriesInWindow: CompositeTrendPoint[] = [];

  for (const date of sortedWindowDates) {
    const dayPoints = windowPointsByDate.get(date) ?? [];
    for (const pt of dayPoints) {
      latestRatioByMovement.set(pt.movementId, pt.ratio);
    }
    const ratios = Array.from(latestRatioByMovement.values());
    if (ratios.length === 0) continue;
    const avgRatio = round2(
      ratios.reduce((sum, r) => sum + r, 0) / ratios.length,
    );
    const triggerLabel = dayPoints
      .map((p) => `${p.movementShortLabel} ${p.ratio.toFixed(2)}x`)
      .join(' · ');

    compositeSeriesInWindow.push({
      date,
      ratio: avgRatio,
      bodyWeightKg: dayPoints[0].bodyWeightKg,
      activeMovementsCount: ratios.length,
      triggerLabel,
    });
  }

  const compositeStartRatio =
    compositeSeriesInWindow.length >= 2 ? compositeSeriesInWindow[0].ratio : null;
  const compositeLatestRatio =
    compositeSeriesInWindow.length >= 1
      ? compositeSeriesInWindow[compositeSeriesInWindow.length - 1].ratio
      : null;
  const compositeDeltaRatio =
    compositeStartRatio !== null && compositeLatestRatio !== null
      ? round2(compositeLatestRatio - compositeStartRatio)
      : null;
  const compositeDeltaPct =
    compositeStartRatio !== null &&
    compositeDeltaRatio !== null &&
    compositeStartRatio > 0
      ? round1((compositeDeltaRatio / compositeStartRatio) * 100)
      : null;

  let trendVerdict: RelativeStrengthReport['trendVerdict'] = 'insufficient';
  let trendHeadline = 'Събиране на данни за тренд';
  let trendDetail =
    'Нужни са поне 2 силови тренировки с ключови движения и записано сутрешно тегло в последните 60–90 дни.';

  if (compositeDeltaRatio !== null && compositeDeltaPct !== null) {
    if (compositeDeltaPct >= 1.5 || compositeDeltaRatio >= 0.03) {
      trendVerdict = 'gaining';
      trendHeadline = 'Качваш реална относителна сила';
      trendDetail = `Средният индекс се е покачил с +${compositeDeltaRatio.toFixed(2)}x BW (+${compositeDeltaPct.toFixed(1)}%) за последните ${windowDays} дни — ставаш по-силен спрямо личното си тегло.`;
    } else if (compositeDeltaPct <= -2.0 || compositeDeltaRatio <= -0.04) {
      trendVerdict = 'declining';
      trendHeadline = 'Лек спад в относителната сила';
      trendDetail = `Индексът е с ${compositeDeltaRatio.toFixed(2)}x BW (${compositeDeltaPct.toFixed(1)}%) за последните ${windowDays} дни — провери възстановяването, протеина или темпото на промяна в теглото.`;
    } else {
      trendVerdict = 'stable';
      trendHeadline = 'Стабилна относителна сила';
      trendDetail = `Индексът се движи стабилно (${compositeDeltaRatio >= 0 ? '+' : ''}${compositeDeltaRatio.toFixed(2)}x BW за ${windowDays} дни) — запазваш съотношението сила/тегло.`;
    }
  }

  return {
    anchorDate,
    windowDays,
    windowStartDate,
    strengthWorkoutsAnalyzed: strengthWorkouts.length,
    excludedBoxingWorkoutsCount,
    allPoints,
    movements,
    compositeSeriesInWindow,
    compositeStartRatio,
    compositeLatestRatio,
    compositeDeltaRatio,
    compositeDeltaPct,
    trendVerdict,
    trendHeadline,
    trendDetail,
    boxingWeight,
  };
}

// ============================================================================
// MODULE 2: Оптимален час за тренировка (Биоритъм и сън)
// ============================================================================

export type TrainingTimeWindowId = 'morning' | 'afternoon' | 'evening';

export interface TrainingTimeWindowStats {
  id: TrainingTimeWindowId;
  emoji: string;
  label: string;
  rangeLabel: string;
  workoutsCount: number;
  strengthWorkoutsCount: number;
  boxingWorkoutsCount: number;
  hasEnoughData: boolean;
  requiredMinWorkouts: number;
  progressLabel: string;
  /** Average working volume across strength workouts with volume > 0 */
  avgVolumeKg: number | null;
  volumeSamplesCount: number;
  /** % of strength workouts achieving a Rep PR or 1RM PR */
  prWorkoutsCount: number;
  prRatePct: number | null;
  /** Next-morning (D+1) biometrics */
  nextMorningSleepHoursAvg: number | null;
  sleepHoursSamplesCount: number;
  nextMorningSleepQualityAvg: number | null;
  sleepQualitySamplesCount: number;
  nextMorningRhrDeltaAvg: number | null;
  rhrDeltaSamplesCount: number;
}

export interface OptimalTrainingTimeReport {
  totalWorkoutsAnalyzed: number;
  unclassifiedWorkoutsCount: number;
  windows: TrainingTimeWindowStats[];
  eligibleWindowsCount: number;
  bestStrengthWindowId: TrainingTimeWindowId | null;
  bestRecoveryWindowId: TrainingTimeWindowId | null;
  post19EveningCount: number;
  post19RhrDeltaAvg: number | null;
  personalInsightHeadline: string;
  personalInsightBody: string;
}

export const MIN_WORKOUTS_PER_TIME_WINDOW = 3;

/**
 * Extracts local hour (0..23) from Hevy startTime strings:
 * - "17 Nov 2026, 18:10"
 * - "2026-11-17 08:30:00"
 * - "2026-11-17T18:10:00"
 * - "Nov 17, 2026, 6:10 PM"
 * - "17.11.2026 19:45"
 */
export function extractLocalHourFromStartTime(rawStartTime: string): number | null {
  const s = (rawStartTime ?? '').trim();
  if (!s) return null;

  // 12-hour format with AM/PM (e.g., "6:10 PM", "12:30 AM")
  const ampmMatch = s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)\b/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const meridiem = ampmMatch[3].toLowerCase();
    if (hour >= 1 && hour <= 12) {
      if (meridiem === 'pm' && hour < 12) hour += 12;
      if (meridiem === 'am' && hour === 12) hour = 0;
      return hour;
    }
  }

  // 24-hour HH:MM or HH:MM:SS (e.g. "17 Nov 2026, 18:10" or "2026-11-17T07:45:00")
  const h24Match = s.match(/(?:[T,\s]|^)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (h24Match) {
    const hour = Number(h24Match[1]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return hour;
    }
  }

  // Fallback JS Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    return dt.getHours();
  }

  return null;
}

export function classifyTimeWindow(hour: number): TrainingTimeWindowId | null {
  if (hour >= 6 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 23) return 'evening';
  return null;
}

function computeRolling30dBaselineRhr(
  targetDate: string,
  rhrLogsSorted: Array<{ date: string; restingHr: number }>,
): number | null {
  if (rhrLogsSorted.length === 0) return null;
  const windowStart = shiftDateKey(targetDate, -30);
  const windowEnd = shiftDateKey(targetDate, -1);

  const prior30d = rhrLogsSorted.filter(
    (entry) => entry.date >= windowStart && entry.date <= windowEnd,
  );
  if (prior30d.length >= 2) {
    const sum = prior30d.reduce((acc, e) => acc + e.restingHr, 0);
    return sum / prior30d.length;
  }

  // Fallback for sparse/early logs: use entries within ±30 days excluding targetDate
  const surroundEnd = shiftDateKey(targetDate, 30);
  const surrounding = rhrLogsSorted.filter(
    (entry) =>
      entry.date !== targetDate &&
      entry.date >= windowStart &&
      entry.date <= surroundEnd,
  );
  if (surrounding.length >= 1) {
    const sum = surrounding.reduce((acc, e) => acc + e.restingHr, 0);
    return sum / surrounding.length;
  }

  // Last fallback: all other RHR logs
  const others = rhrLogsSorted.filter((entry) => entry.date !== targetDate);
  if (others.length === 0) return null;
  const sum = others.reduce((acc, e) => acc + e.restingHr, 0);
  return sum / others.length;
}

function buildWorkoutPrSet(
  strengthWorkouts: HevyWorkout[],
  fallbackWeightKg: number | null,
): Set<string> {
  const prWorkoutIds = new Set<string>();
  if (strengthWorkouts.length === 0) return prWorkoutIds;

  // 1. Rep PRs from existing hidden-progress engine
  const hiddenIndex = buildAllWorkoutsHiddenPrIndex(
    strengthWorkouts,
    fallbackWeightKg,
  );
  for (const [key, session] of hiddenIndex.byWorkoutAndExercise.entries()) {
    if (session.isRepPR || session.is1RMPR) {
      const sepIdx = key.indexOf('::');
      if (sepIdx > 0) {
        prWorkoutIds.add(key.slice(0, sepIdx));
      }
    }
  }

  // 2. Explicit chronological 1RM PR check across all strength exercises
  const chrono = [...strengthWorkouts].sort((a, b) => {
    const d = a.date.localeCompare(b.date);
    if (d !== 0) return d;
    return a.startTime.localeCompare(b.startTime);
  });

  const best1RmByExercise = new Map<string, number>();
  for (const w of chrono) {
    for (const ex of w.exercises) {
      const exKey = ex.title.trim().toLowerCase();
      if (!exKey) continue;
      let sessionBest = 0;
      for (const s of getWorkingSets(ex.sets)) {
        const weight = s.weightKg ?? 0;
        const reps = Math.max(0, Math.round(s.reps ?? 0));
        if (weight > 0 && reps >= 1) {
          const e1rm = calculateEpley1RM(weight, reps);
          if (e1rm > sessionBest) sessionBest = e1rm;
        }
      }
      if (sessionBest <= 0) continue;
      const prev = best1RmByExercise.get(exKey);
      if (prev !== undefined && sessionBest > prev + 0.05) {
        prWorkoutIds.add(w.id);
      }
      if (prev === undefined || sessionBest > prev) {
        best1RmByExercise.set(exKey, sessionBest);
      }
    }
  }

  return prWorkoutIds;
}

const WINDOW_META: Array<{
  id: TrainingTimeWindowId;
  emoji: string;
  label: string;
  rangeLabel: string;
}> = [
  { id: 'morning', emoji: '🌅', label: 'Сутрин', rangeLabel: '06:00 – 11:59' },
  { id: 'afternoon', emoji: '☀️', label: 'Следобед', rangeLabel: '12:00 – 17:59' },
  { id: 'evening', emoji: '🌙', label: 'Вечер', rangeLabel: '18:00 – 23:59' },
];

export function analyzeOptimalTrainingTime(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  fallbackWeightKg?: number | null;
}): OptimalTrainingTimeReport {
  const { hevyWorkouts, dailyLogs, fallbackWeightKg = null } = params;

  const dailyByDate = new Map<string, DailyBiometricLog>();
  const rhrLogsSorted: Array<{ date: string; restingHr: number }> = [];

  for (const log of dailyLogs) {
    if (!isValidDateKey(log.date)) continue;
    dailyByDate.set(log.date, log);
    if (
      typeof log.restingHr === 'number' &&
      Number.isFinite(log.restingHr) &&
      log.restingHr >= 30 &&
      log.restingHr <= 150
    ) {
      rhrLogsSorted.push({ date: log.date, restingHr: log.restingHr });
    }
  }
  rhrLogsSorted.sort((a, b) => a.date.localeCompare(b.date));

  const strengthWorkouts = hevyWorkouts.filter((w) => !isBoxingWorkout(w));
  const prWorkoutIds = buildWorkoutPrSet(strengthWorkouts, fallbackWeightKg);

  interface BucketAccumulator {
    workoutsCount: number;
    strengthWorkoutsCount: number;
    boxingWorkoutsCount: number;
    volumes: number[];
    prWorkoutsCount: number;
    seenNextMorningDates: Set<string>;
    sleepHours: number[];
    sleepQualities: number[];
    rhrDeltas: number[];
  }

  const buckets: Record<TrainingTimeWindowId, BucketAccumulator> = {
    morning: {
      workoutsCount: 0,
      strengthWorkoutsCount: 0,
      boxingWorkoutsCount: 0,
      volumes: [],
      prWorkoutsCount: 0,
      seenNextMorningDates: new Set(),
      sleepHours: [],
      sleepQualities: [],
      rhrDeltas: [],
    },
    afternoon: {
      workoutsCount: 0,
      strengthWorkoutsCount: 0,
      boxingWorkoutsCount: 0,
      volumes: [],
      prWorkoutsCount: 0,
      seenNextMorningDates: new Set(),
      sleepHours: [],
      sleepQualities: [],
      rhrDeltas: [],
    },
    evening: {
      workoutsCount: 0,
      strengthWorkoutsCount: 0,
      boxingWorkoutsCount: 0,
      volumes: [],
      prWorkoutsCount: 0,
      seenNextMorningDates: new Set(),
      sleepHours: [],
      sleepQualities: [],
      rhrDeltas: [],
    },
  };

  let unclassifiedWorkoutsCount = 0;
  let post19EveningCount = 0;
  const post19RhrDeltas: number[] = [];
  const post19SeenNextDates = new Set<string>();

  for (const workout of hevyWorkouts) {
    const hour = extractLocalHourFromStartTime(workout.startTime);
    const windowId = hour !== null ? classifyTimeWindow(hour) : null;
    if (!windowId) {
      unclassifiedWorkoutsCount += 1;
      continue;
    }

    const bucket = buckets[windowId];
    const boxing = isBoxingWorkout(workout);
    bucket.workoutsCount += 1;

    if (boxing) {
      bucket.boxingWorkoutsCount += 1;
    } else {
      bucket.strengthWorkoutsCount += 1;
      if (workout.totalVolumeKg > 0) {
        bucket.volumes.push(workout.totalVolumeKg);
      }
      if (prWorkoutIds.has(workout.id)) {
        bucket.prWorkoutsCount += 1;
      }
    }

    if (hour !== null && hour >= 19) {
      post19EveningCount += 1;
    }

    // Link workout date D to next-morning biometrics D + 1
    if (isValidDateKey(workout.date)) {
      const nextDate = shiftDateKey(workout.date, 1);
      const nextLog = dailyByDate.get(nextDate);
      if (nextLog) {
        if (!bucket.seenNextMorningDates.has(nextDate)) {
          bucket.seenNextMorningDates.add(nextDate);
          if (
            typeof nextLog.sleepHours === 'number' &&
            Number.isFinite(nextLog.sleepHours) &&
            nextLog.sleepHours > 0
          ) {
            bucket.sleepHours.push(nextLog.sleepHours);
          }
          if (
            typeof nextLog.sleepQuality === 'number' &&
            Number.isFinite(nextLog.sleepQuality) &&
            nextLog.sleepQuality >= 1 &&
            nextLog.sleepQuality <= 5
          ) {
            bucket.sleepQualities.push(nextLog.sleepQuality);
          }
          if (
            typeof nextLog.restingHr === 'number' &&
            Number.isFinite(nextLog.restingHr) &&
            nextLog.restingHr >= 30
          ) {
            const baseline = computeRolling30dBaselineRhr(nextDate, rhrLogsSorted);
            if (baseline !== null) {
              bucket.rhrDeltas.push(nextLog.restingHr - baseline);
            }
          }
        }

        if (
          hour !== null &&
          hour >= 19 &&
          !post19SeenNextDates.has(nextDate) &&
          typeof nextLog.restingHr === 'number' &&
          Number.isFinite(nextLog.restingHr) &&
          nextLog.restingHr >= 30
        ) {
          post19SeenNextDates.add(nextDate);
          const baseline = computeRolling30dBaselineRhr(nextDate, rhrLogsSorted);
          if (baseline !== null) {
            post19RhrDeltas.push(nextLog.restingHr - baseline);
          }
        }
      }
    }
  }

  const avgOf = (arr: number[]): number | null =>
    arr.length > 0
      ? arr.reduce((sum, v) => sum + v, 0) / arr.length
      : null;

  const windows: TrainingTimeWindowStats[] = WINDOW_META.map((meta) => {
    const b = buckets[meta.id];
    const hasEnoughData = b.workoutsCount >= MIN_WORKOUTS_PER_TIME_WINDOW;
    const avgVolRaw = avgOf(b.volumes);
    const avgSleepRaw = avgOf(b.sleepHours);
    const avgQualityRaw = avgOf(b.sleepQualities);
    const avgRhrDeltaRaw = avgOf(b.rhrDeltas);

    return {
      id: meta.id,
      emoji: meta.emoji,
      label: meta.label,
      rangeLabel: meta.rangeLabel,
      workoutsCount: b.workoutsCount,
      strengthWorkoutsCount: b.strengthWorkoutsCount,
      boxingWorkoutsCount: b.boxingWorkoutsCount,
      hasEnoughData,
      requiredMinWorkouts: MIN_WORKOUTS_PER_TIME_WINDOW,
      progressLabel: `${Math.min(b.workoutsCount, MIN_WORKOUTS_PER_TIME_WINDOW)}/${MIN_WORKOUTS_PER_TIME_WINDOW} тренировки`,
      avgVolumeKg: avgVolRaw !== null ? Math.round(avgVolRaw) : null,
      volumeSamplesCount: b.volumes.length,
      prWorkoutsCount: b.prWorkoutsCount,
      prRatePct:
        b.strengthWorkoutsCount > 0
          ? round1((b.prWorkoutsCount / b.strengthWorkoutsCount) * 100)
          : null,
      nextMorningSleepHoursAvg: avgSleepRaw !== null ? round1(avgSleepRaw) : null,
      sleepHoursSamplesCount: b.sleepHours.length,
      nextMorningSleepQualityAvg:
        avgQualityRaw !== null ? round1(avgQualityRaw) : null,
      sleepQualitySamplesCount: b.sleepQualities.length,
      nextMorningRhrDeltaAvg:
        avgRhrDeltaRaw !== null ? round1(avgRhrDeltaRaw) : null,
      rhrDeltaSamplesCount: b.rhrDeltas.length,
    };
  });

  const post19RhrDeltaAvgRaw = avgOf(post19RhrDeltas);
  const post19RhrDeltaAvg =
    post19RhrDeltaAvgRaw !== null ? round1(post19RhrDeltaAvgRaw) : null;

  const eligibleWindows = windows.filter((w) => w.hasEnoughData);
  const eligibleStrength = eligibleWindows.filter(
    (w) => w.strengthWorkoutsCount > 0 && (w.avgVolumeKg !== null || w.prRatePct !== null),
  );

  let bestStrengthWindow: TrainingTimeWindowStats | null = null;
  if (eligibleStrength.length > 0) {
    const maxVol = Math.max(
      1,
      ...eligibleStrength.map((w) => w.avgVolumeKg ?? 0),
    );
    const scored = eligibleStrength.map((w) => {
      const volNorm = w.avgVolumeKg !== null ? w.avgVolumeKg / maxVol : 0.5;
      const prNorm = w.prRatePct !== null ? w.prRatePct / 100 : 0;
      const score = prNorm * 0.6 + volNorm * 0.4;
      return { w, score };
    });
    scored.sort((a, b) => b.score - a.score);
    bestStrengthWindow = scored[0].w;
  }

  const eligibleRecovery = eligibleWindows.filter(
    (w) => w.nextMorningSleepHoursAvg !== null || w.nextMorningRhrDeltaAvg !== null,
  );
  let bestRecoveryWindow: TrainingTimeWindowStats | null = null;
  if (eligibleRecovery.length > 0) {
    const scored = eligibleRecovery.map((w) => {
      const sleepScore = w.nextMorningSleepHoursAvg !== null ? w.nextMorningSleepHoursAvg : 7.0;
      const rhrPenalty =
        w.nextMorningRhrDeltaAvg !== null ? w.nextMorningRhrDeltaAvg * 0.35 : 0;
      const qualityBonus =
        w.nextMorningSleepQualityAvg !== null ? w.nextMorningSleepQualityAvg * 0.3 : 0;
      return { w, score: sleepScore + qualityBonus - rhrPenalty };
    });
    scored.sort((a, b) => b.score - a.score);
    bestRecoveryWindow = scored[0].w;
  }

  // Generate personal insight strictly comparing windows with >= 3 workouts
  let personalInsightHeadline = 'Събиране на данни по часови прозорци';
  let personalInsightBody =
    'За обективно сравнение са нужни поне 3 записани тренировки в часови прозорец (Сутрин, Следобед или Вечер).';

  const windowPhrase = (w: TrainingTimeWindowStats): string => {
    if (w.id === 'morning') return `сутрин (${w.rangeLabel})`;
    if (w.id === 'afternoon') return `следобед (${w.rangeLabel})`;
    return `вечер (${w.rangeLabel})`;
  };

  const eveningWin = windows.find((w) => w.id === 'evening')!;

  if (eligibleWindows.length === 0) {
    const mostPopulated = [...windows].sort(
      (a, b) => b.workoutsCount - a.workoutsCount,
    )[0];
    if (mostPopulated && mostPopulated.workoutsCount > 0) {
      personalInsightBody = `Все още няма часови прозорец с ≥ ${MIN_WORKOUTS_PER_TIME_WINDOW} тренировки. Най-близо си до прага в прозореца ${mostPopulated.emoji} ${mostPopulated.label} (${mostPopulated.progressLabel}).`;
    }
  } else if (eligibleWindows.length === 1) {
    const only = eligibleWindows[0];
    personalInsightHeadline = `Активен прозорец: ${only.emoji} ${only.label}`;
    const prText =
      only.prRatePct !== null ? `${only.prRatePct}% PR успеваемост` : '';
    const volText =
      only.avgVolumeKg !== null
        ? `${only.avgVolumeKg.toLocaleString('bg-BG')} kg ср. обем`
        : '';
    const metricsSummary = [volText, prText].filter(Boolean).join(' и ');
    const rhrNote =
      only.nextMorningRhrDeltaAvg !== null
        ? ` На следващата сутрин пулсът ти е средно ${
            only.nextMorningRhrDeltaAvg >= 0 ? '+' : ''
          }${only.nextMorningRhrDeltaAvg.toFixed(1)} bpm спрямо 30-дневната база.`
        : '';
    personalInsightBody = `Засега имаш достатъчно данни (≥ 3 тренировки) само ${windowPhrase(only)}${
      metricsSummary ? ` — ${metricsSummary}` : ''
    }.${rhrNote} Запиши ≥ 3 тренировки и в друг часови прозорец, за да сравним биоритъма ти.`;
  } else {
    // At least 2 windows have >= 3 workouts -> full personal comparison
    const bestPerf = bestStrengthWindow ?? eligibleWindows[0];
    personalInsightHeadline = `Оптимален прозорец: ${bestPerf.emoji} ${bestPerf.label} (${bestPerf.rangeLabel})`;

    const perfMetrics: string[] = [];
    if (bestPerf.prRatePct !== null) {
      perfMetrics.push(`${bestPerf.prRatePct}% тренировки с PR`);
    }
    if (bestPerf.avgVolumeKg !== null) {
      perfMetrics.push(`средно ${bestPerf.avgVolumeKg.toLocaleString('bg-BG')} kg обем`);
    }

    const firstPart = `Най-висока сила и най-много PR-и постигаш ${windowPhrase(bestPerf)}${
      perfMetrics.length > 0 ? ` (${perfMetrics.join(', ')})` : ''
    }`;

    let secondPart = '';
    if (
      post19EveningCount >= 3 &&
      post19RhrDeltaAvg !== null &&
      post19RhrDeltaAvg >= 1.2
    ) {
      secondPart = `, докато вечерните тренировки след 19:00 вдигат сутрешния ти пулс средно с +${post19RhrDeltaAvg.toFixed(1)} bpm спрямо 30-дневната база.`;
    } else if (
      eveningWin.hasEnoughData &&
      eveningWin.nextMorningRhrDeltaAvg !== null &&
      eveningWin.nextMorningRhrDeltaAvg >= 1.2
    ) {
      secondPart = `, докато вечерните тренировки (${eveningWin.rangeLabel}) вдигат сутрешния ти пулс средно с +${eveningWin.nextMorningRhrDeltaAvg.toFixed(1)} bpm.`;
    } else if (
      bestRecoveryWindow &&
      bestRecoveryWindow.id !== bestPerf.id &&
      bestRecoveryWindow.nextMorningSleepHoursAvg !== null
    ) {
      secondPart = `, а най-добър сън на следващата сутрин отчиташ след тренировки ${windowPhrase(bestRecoveryWindow)} (${bestRecoveryWindow.nextMorningSleepHoursAvg.toFixed(1)} ч).`;
    } else if (bestPerf.nextMorningSleepHoursAvg !== null) {
      const rhrPart =
        bestPerf.nextMorningRhrDeltaAvg !== null
          ? ` и пулс ${bestPerf.nextMorningRhrDeltaAvg >= 0 ? '+' : ''}${bestPerf.nextMorningRhrDeltaAvg.toFixed(1)} bpm`
          : '';
      secondPart = `, без да влошаваш възстановяването (ср. ${bestPerf.nextMorningSleepHoursAvg.toFixed(1)} ч сън${rhrPart} на следващата сутрин).`;
    } else {
      secondPart = '.';
    }

    personalInsightBody = `${firstPart}${secondPart}`;
  }

  return {
    totalWorkoutsAnalyzed: hevyWorkouts.length - unclassifiedWorkoutsCount,
    unclassifiedWorkoutsCount,
    windows,
    eligibleWindowsCount: eligibleWindows.length,
    bestStrengthWindowId: bestStrengthWindow?.id ?? null,
    bestRecoveryWindowId: bestRecoveryWindow?.id ?? null,
    post19EveningCount,
    post19RhrDeltaAvg,
    personalInsightHeadline,
    personalInsightBody,
  };
}
