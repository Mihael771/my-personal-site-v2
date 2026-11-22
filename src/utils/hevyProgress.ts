import type { HevySet, HevyWorkout } from '../types/fitness';

export type ExerciseProgressMetric = 'e1rm' | 'max_weight' | 'both';
export type ExerciseProgressPeriod = '1m' | '3m' | '6m' | '1y' | 'all';

export interface ExerciseDropdownOption {
  title: string;
  workoutCount: number;
  setCount: number;
  lastDate: string;
  isBodyweightOnly: boolean;
}

export interface ExerciseSessionPoint {
  workoutId: string;
  workoutTitle: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  timestamp: number;
  maxWeightKg: number;
  estimated1RM: number;
  maxReps: number;
  totalReps: number;
  totalVolumeKg: number;
  setCount: number;
  bestSetText: string;
  bestSetWeightKg: number;
  bestSetReps: number;
}

export interface ExerciseProgressDataset {
  exerciseTitle: string;
  isBodyweightOnly: boolean;
  allSessions: ExerciseSessionPoint[];
  filteredSessions: ExerciseSessionPoint[];
  personalRecordWeightKg: number;
  personalRecordWeightDate: string | null;
  peakEstimated1RM: number;
  peakEstimated1RMDate: string | null;
  personalRecordMaxReps: number;
  personalRecordMaxRepsDate: string | null;
  peakTotalReps: number;
  peakTotalRepsDate: string | null;
  progressDelta: number | null;
  progressPercent: number | null;
  progressLabel: string;
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

function formatWeightShort(val: number): string {
  const rounded = roundTwo(val);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/**
 * Epley formula for Estimated 1RM:
 * weight_kg * (1 + reps / 30), or weight_kg when reps === 1 (or <= 1),
 * rounded to 1 decimal place.
 */
export function calculateEpley1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 1) {
    return roundOne(weightKg);
  }
  return roundOne(weightKg * (1 + reps / 30));
}

function parseSessionTimestamp(startTime: string, dateKey: string): number {
  if (startTime) {
    const dt = new Date(startTime);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getTime();
    }
  }
  if (dateKey) {
    const dt = new Date(`${dateKey}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getTime();
    }
  }
  return 0;
}

/**
 * Extract unique exercises sorted by number of workouts performed (descending),
 * with alphabetical tie-breaking.
 */
export function getExercisesSortedByFrequency(
  workouts: HevyWorkout[],
): ExerciseDropdownOption[] {
  const map = new Map<
    string,
    {
      title: string;
      workoutIds: Set<string>;
      setCount: number;
      lastDate: string;
      hasWeight: boolean;
    }
  >();

  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const exHasWeight = ex.sets.some((s) => (s.weightKg ?? 0) > 0);
      const existing = map.get(key);
      if (existing) {
        existing.workoutIds.add(workout.id);
        existing.setCount += ex.sets.length;
        if (workout.date && workout.date > existing.lastDate) {
          existing.lastDate = workout.date;
        }
        if (exHasWeight) {
          existing.hasWeight = true;
        }
      } else {
        map.set(key, {
          title: ex.title,
          workoutIds: new Set([workout.id]),
          setCount: ex.sets.length,
          lastDate: workout.date,
          hasWeight: exHasWeight,
        });
      }
    }
  }

  return Array.from(map.values())
    .map((entry) => ({
      title: entry.title,
      workoutCount: entry.workoutIds.size,
      setCount: entry.setCount,
      lastDate: entry.lastDate,
      isBodyweightOnly: !entry.hasWeight,
    }))
    .sort((a, b) => {
      if (b.workoutCount !== a.workoutCount) {
        return b.workoutCount - a.workoutCount;
      }
      if (b.setCount !== a.setCount) {
        return b.setCount - a.setCount;
      }
      return a.title.localeCompare(b.title);
    });
}

function selectBestSet(
  sets: HevySet[],
  isBodyweightOnly: boolean,
): {
  bestSet: HevySet | null;
  bestE1RM: number;
  maxWeightKg: number;
  maxReps: number;
  totalReps: number;
  totalVolumeKg: number;
} {
  let bestSet: HevySet | null = null;
  let bestE1RM = 0;
  let maxWeightKg = 0;
  let maxReps = 0;
  let totalReps = 0;
  let totalVolumeKg = 0;

  for (const s of sets) {
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (w > maxWeightKg) maxWeightKg = w;
    if (r > maxReps) maxReps = r;
    if (r > 0) totalReps += r;
    if (w > 0 && r > 0) totalVolumeKg += w * r;

    if (isBodyweightOnly) {
      if (!bestSet || r > (bestSet.reps ?? 0)) {
        bestSet = s;
      }
    } else {
      const e1rm = w > 0 ? calculateEpley1RM(w, r) : 0;
      if (e1rm > bestE1RM) {
        bestE1RM = e1rm;
        bestSet = s;
      } else if (e1rm === bestE1RM && bestSet) {
        const prevW = bestSet.weightKg ?? 0;
        const prevR = bestSet.reps ?? 0;
        if (w > prevW || (w === prevW && r > prevR)) {
          bestSet = s;
        }
      } else if (!bestSet) {
        bestSet = s;
      }
    }
  }

  return {
    bestSet,
    bestE1RM: roundOne(bestE1RM),
    maxWeightKg: roundTwo(maxWeightKg),
    maxReps,
    totalReps,
    totalVolumeKg: roundTwo(totalVolumeKg),
  };
}

function formatBestSetText(
  bestSet: HevySet | null,
  isBodyweightOnly: boolean,
): string {
  if (!bestSet) return '—';
  const w = bestSet.weightKg ?? 0;
  const r = bestSet.reps ?? 0;
  if (isBodyweightOnly || w <= 0) {
    if (r > 0) return `${r} повт.`;
    if (bestSet.durationSeconds && bestSet.durationSeconds > 0) {
      return `${bestSet.durationSeconds} сек`;
    }
    return '—';
  }
  if (r > 0) {
    return `${formatWeightShort(w)} kg × ${r} повт.`;
  }
  return `${formatWeightShort(w)} kg`;
}

function subtractPeriodFromDateKey(
  anchorDateKey: string,
  period: ExerciseProgressPeriod,
): string | null {
  if (period === 'all') return null;
  const match = anchorDateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const dt = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12,
    0,
    0,
  );
  if (period === '1m') {
    dt.setMonth(dt.getMonth() - 1);
  } else if (period === '3m') {
    dt.setMonth(dt.getMonth() - 3);
  } else if (period === '6m') {
    dt.setMonth(dt.getMonth() - 6);
  } else if (period === '1y') {
    dt.setFullYear(dt.getFullYear() - 1);
  }
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildExerciseProgressDataset(
  workouts: HevyWorkout[],
  exerciseTitle: string,
  period: ExerciseProgressPeriod,
  metric: ExerciseProgressMetric,
  referenceTodayKey?: string,
): ExerciseProgressDataset {
  const targetKey = exerciseTitle.trim().toLowerCase();

  // First scan all matching exercises to detect whether exercise is bodyweight-only
  const matchedWorkouts: Array<{
    workout: HevyWorkout;
    sets: HevySet[];
    timestamp: number;
  }> = [];
  let hasAnyWeight = false;

  for (const workout of workouts) {
    const matchingExercises = workout.exercises.filter(
      (ex) => ex.title.trim().toLowerCase() === targetKey,
    );
    if (matchingExercises.length === 0) continue;
    const combinedSets = matchingExercises.flatMap((ex) => ex.sets);
    if (combinedSets.length === 0) continue;

    if (combinedSets.some((s) => (s.weightKg ?? 0) > 0)) {
      hasAnyWeight = true;
    }

    matchedWorkouts.push({
      workout,
      sets: combinedSets,
      timestamp: parseSessionTimestamp(workout.startTime, workout.date),
    });
  }

  const isBodyweightOnly = !hasAnyWeight;

  // Chronological order (oldest -> newest)
  matchedWorkouts.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.workout.date.localeCompare(b.workout.date);
  });

  const allSessions: ExerciseSessionPoint[] = matchedWorkouts.map(
    ({ workout, sets, timestamp }) => {
      const summary = selectBestSet(sets, isBodyweightOnly);
      return {
        workoutId: workout.id,
        workoutTitle: workout.title,
        date: workout.date,
        startTime: workout.startTime,
        timestamp,
        maxWeightKg: summary.maxWeightKg,
        estimated1RM: summary.bestE1RM,
        maxReps: summary.maxReps,
        totalReps: summary.totalReps,
        totalVolumeKg: summary.totalVolumeKg,
        setCount: sets.length,
        bestSetText: formatBestSetText(summary.bestSet, isBodyweightOnly),
        bestSetWeightKg: summary.bestSet?.weightKg ?? 0,
        bestSetReps: summary.bestSet?.reps ?? 0,
      };
    },
  );

  // Filter by period relative to latest date (or today)
  let filteredSessions = allSessions;
  if (period !== 'all' && allSessions.length > 0) {
    const latestSessionDate = allSessions[allSessions.length - 1].date;
    const anchorDate =
      referenceTodayKey && referenceTodayKey > latestSessionDate
        ? referenceTodayKey
        : latestSessionDate;
    const cutoff = subtractPeriodFromDateKey(anchorDate, period);
    if (cutoff) {
      filteredSessions = allSessions.filter((s) => !s.date || s.date >= cutoff);
    }
  }

  let personalRecordWeightKg = 0;
  let personalRecordWeightDate: string | null = null;
  let peakEstimated1RM = 0;
  let peakEstimated1RMDate: string | null = null;
  let personalRecordMaxReps = 0;
  let personalRecordMaxRepsDate: string | null = null;
  let peakTotalReps = 0;
  let peakTotalRepsDate: string | null = null;

  for (const session of filteredSessions) {
    if (session.maxWeightKg > personalRecordWeightKg) {
      personalRecordWeightKg = session.maxWeightKg;
      personalRecordWeightDate = session.date || null;
    }
    if (session.estimated1RM > peakEstimated1RM) {
      peakEstimated1RM = session.estimated1RM;
      peakEstimated1RMDate = session.date || null;
    }
    if (session.maxReps > personalRecordMaxReps) {
      personalRecordMaxReps = session.maxReps;
      personalRecordMaxRepsDate = session.date || null;
    }
    if (session.totalReps > peakTotalReps) {
      peakTotalReps = session.totalReps;
      peakTotalRepsDate = session.date || null;
    }
  }

  let progressDelta: number | null = null;
  let progressPercent: number | null = null;
  const progressLabel = isBodyweightOnly
    ? metric === 'max_weight'
      ? 'Общо повторения'
      : 'Макс. повторения'
    : metric === 'max_weight'
      ? 'Максимална тежест'
      : 'Изчислен 1RM';

  if (filteredSessions.length >= 2) {
    const first = filteredSessions[0];
    const last = filteredSessions[filteredSessions.length - 1];
    const getVal = (pt: ExerciseSessionPoint) => {
      if (isBodyweightOnly) {
        return metric === 'max_weight' ? pt.totalReps : pt.maxReps;
      }
      return metric === 'max_weight' ? pt.maxWeightKg : pt.estimated1RM;
    };

    const startVal = getVal(first);
    const endVal = getVal(last);
    progressDelta = isBodyweightOnly
      ? Math.round(endVal - startVal)
      : roundOne(endVal - startVal);
    progressPercent =
      startVal > 0 ? roundOne(((endVal - startVal) / startVal) * 100) : null;
  }

  return {
    exerciseTitle,
    isBodyweightOnly,
    allSessions,
    filteredSessions,
    personalRecordWeightKg,
    personalRecordWeightDate,
    peakEstimated1RM,
    peakEstimated1RMDate,
    personalRecordMaxReps,
    personalRecordMaxRepsDate,
    peakTotalReps,
    peakTotalRepsDate,
    progressDelta,
    progressPercent,
    progressLabel,
  };
}

/**
 * Compute clean human-readable Y axis ticks for pure React SVG chart.
 */
export function computeNiceAxisTicks(
  rawMin: number,
  rawMax: number,
  targetTicks: number = 5,
): { min: number; max: number; ticks: number[] } {
  const safeMin = Math.max(0, rawMin);
  const safeMax = rawMax > safeMin ? rawMax : safeMin + 10;
  const span = safeMax - safeMin;
  const roughStep = span / Math.max(1, targetTicks - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const fraction = roughStep / magnitude;

  let niceStep: number;
  if (fraction <= 1) niceStep = 1 * magnitude;
  else if (fraction <= 2) niceStep = 2 * magnitude;
  else if (fraction <= 2.5) niceStep = 2.5 * magnitude;
  else if (fraction <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const min = Math.max(0, Math.floor(safeMin / niceStep) * niceStep);
  const max = Math.ceil(safeMax / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = min; v <= max + niceStep * 0.001; v += niceStep) {
    ticks.push(Math.round(v * 100) / 100);
  }

  return { min, max, ticks };
}
