import type { DailyBiometricLog, HevySet, HevyWorkout } from '../types/fitness';
import { computeAcwrReport } from './analysisPrep';

export interface DeloadWeekBucket {
  weekIndex: number; // 1..6 (6 = most recent)
  label: string;
  startDate: string;
  endDate: string;
  workoutCount: number;
  totalSets: number;
  totalVolumeKg: number;
  isHighLoad: boolean;
}

export interface DeloadFatigueSignal {
  id: 'rhr' | 'sleep_quality' | 'acwr';
  label: string;
  detail: string;
}

export interface DeloadCycleAnalysis {
  status: 'accumulation' | 'approaching' | 'deload_now';
  currentCycleWeek: number; // 0..6
  targetCycleWeeks: number; // 5
  headline: string;
  subtext: string;
  weeklyBuckets: DeloadWeekBucket[];
  fatigueSignals: DeloadFatigueSignal[];
  acwr: number | null;
  rhrDeltaBpm: number | null;
  rhr30dAvg: number | null;
  latestRhr: number | null;
  recentSleepQualityAvg: number | null;
  hasEnoughData: boolean;
}

export interface DeloadExercisePrescription {
  title: string;
  originalSets: number;
  deloadSets: number;
  originalWeightKg: number;
  deloadWeightKg: number;
  targetRepsText: string;
  isBodyweight: boolean;
}

export interface DeloadWorkoutDayPlan {
  sourceWorkoutId: string;
  sourceTitle: string;
  sourceDate: string;
  exercises: DeloadExercisePrescription[];
  originalTotalSets: number;
  deloadTotalSets: number;
}

export interface DeloadWeekPlan {
  days: DeloadWorkoutDayPlan[];
  setsReductionPct: number;
  weightReductionPct: number;
  summaryNote: string;
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

function daysBetween(a: string, b: string): number {
  const ma = Date.parse(`${a}T12:00:00Z`);
  const mb = Date.parse(`${b}T12:00:00Z`);
  if (Number.isNaN(ma) || Number.isNaN(mb)) return 0;
  return Math.round((mb - ma) / 86_400_000);
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

export function roundToNearest2Point5(kg: number): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  return Math.max(2.5, Math.round(kg / 2.5) * 2.5);
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function formatShortDayMonth(ymd: string): string {
  const p = ymd.split('-');
  if (p.length !== 3) return ymd;
  return `${p[2]}.${p[1]}`;
}

/**
 * Analyzes the last 6 weeks of Hevy workouts and biometric fatigue markers
 * (RHR > +4 bpm vs 30-day average, sleep quality <= 3, ACWR > 1.35)
 * to determine current accumulation week and whether a Deload week is due.
 */
export function analyzeDeloadCycle(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): DeloadCycleAnalysis {
  const { hevyWorkouts, dailyLogs, todayKey } = params;
  const targetCycleWeeks = 5;

  // Determine anchor date: default todayKey, or latest workout date if data is historical (>14d old)
  let latestWorkoutDate = '';
  for (const w of hevyWorkouts) {
    if (w.date && w.date > latestWorkoutDate) latestWorkoutDate = w.date;
  }
  const anchorDate =
    latestWorkoutDate && Math.abs(daysBetween(latestWorkoutDate, todayKey)) > 14
      ? latestWorkoutDate
      : todayKey;

  // Build 6 rolling 7-day buckets (oldest -> newest)
  const rawBuckets: Array<{
    weekIndex: number;
    startDate: string;
    endDate: string;
    workoutCount: number;
    totalSets: number;
    totalVolumeKg: number;
  }> = [];

  for (let i = 5; i >= 0; i--) {
    const endDate = shiftDate(anchorDate, -i * 7);
    const startDate = shiftDate(endDate, -6);
    const weekWorkouts = hevyWorkouts.filter(
      (w) => w.date >= startDate && w.date <= endDate,
    );
    const totalSets = weekWorkouts.reduce((acc, w) => acc + w.totalSets, 0);
    const totalVolumeKg = Math.round(
      weekWorkouts.reduce((acc, w) => acc + w.totalVolumeKg, 0),
    );
    rawBuckets.push({
      weekIndex: 6 - i,
      startDate,
      endDate,
      workoutCount: weekWorkouts.length,
      totalSets,
      totalVolumeKg,
    });
  }

  // Compute reference volume among active weeks (>= 1 workout)
  const activeVolumes = rawBuckets
    .filter((b) => b.workoutCount > 0)
    .map((b) => b.totalVolumeKg);
  const avgActiveVolume =
    activeVolumes.length > 0
      ? activeVolumes.reduce((a, b) => a + b, 0) / activeVolumes.length
      : 0;
  const activeSets = rawBuckets
    .filter((b) => b.workoutCount > 0)
    .map((b) => b.totalSets);
  const avgActiveSets =
    activeSets.length > 0
      ? activeSets.reduce((a, b) => a + b, 0) / activeSets.length
      : 0;

  // A week counts as a hard accumulation week if >= 3 workouts AND high volume/sets
  // (at least 70% of user's active weekly average or >= 30 total working sets).
  const weeklyBuckets: DeloadWeekBucket[] = rawBuckets.map((b) => {
    const hasHighVolume =
      b.totalSets >= 30 ||
      (avgActiveVolume > 0 && b.totalVolumeKg >= avgActiveVolume * 0.7) ||
      (avgActiveSets > 0 && b.totalSets >= avgActiveSets * 0.75);
    const isHighLoad = b.workoutCount >= 3 && hasHighVolume;
    return {
      ...b,
      label: `${formatShortDayMonth(b.startDate)}–${formatShortDayMonth(b.endDate)}`,
      isHighLoad,
    };
  });

  // Count consecutive high-load weeks ending at the most recent week (allow current week still in progress if previous weeks are consecutive)
  let consecutiveHardWeeks = 0;
  for (let i = weeklyBuckets.length - 1; i >= 0; i--) {
    if (weeklyBuckets[i].isHighLoad) {
      consecutiveHardWeeks += 1;
    } else if (i === weeklyBuckets.length - 1 && weeklyBuckets[i].workoutCount >= 1) {
      // Current partial week already has 1-2 workouts -> continue checking prior completed weeks
      continue;
    } else {
      break;
    }
  }

  // Biometric fatigue checks from dailyLogs
  const dailyAsc = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const dailyAnchor =
    dailyAsc.length > 0 &&
    Math.abs(daysBetween(dailyAsc[dailyAsc.length - 1].date, anchorDate)) > 14
      ? dailyAsc[dailyAsc.length - 1].date
      : anchorDate;

  // 1) RHR vs 30-day average (> +4 bpm)
  const rhrStart30d = shiftDate(dailyAnchor, -29);
  const rhrWindow30d = dailyAsc.filter(
    (d) =>
      d.date >= rhrStart30d &&
      d.date <= dailyAnchor &&
      d.restingHr !== undefined &&
      d.restingHr > 0,
  );
  let rhr30dAvg: number | null = null;
  let latestRhr: number | null = null;
  let rhrDeltaBpm: number | null = null;

  if (rhrWindow30d.length >= 3) {
    latestRhr = rhrWindow30d[rhrWindow30d.length - 1].restingHr as number;
    const baselineSlice = rhrWindow30d.slice(0, -1);
    rhr30dAvg = roundOne(
      baselineSlice.reduce((s, d) => s + (d.restingHr as number), 0) /
        baselineSlice.length,
    );
    rhrDeltaBpm = roundOne(latestRhr - rhr30dAvg);
  } else if (rhrWindow30d.length > 0) {
    latestRhr = rhrWindow30d[rhrWindow30d.length - 1].restingHr as number;
  }

  // 2) Sleep quality <= 3 (recent 3 logs with sleepQuality)
  const sleepQStart = shiftDate(dailyAnchor, -6);
  const recentSleepQLogs = dailyAsc
    .filter(
      (d) =>
        d.date >= sleepQStart &&
        d.date <= dailyAnchor &&
        d.sleepQuality !== undefined,
    )
    .slice(-3);
  const recentSleepQualityAvg =
    recentSleepQLogs.length > 0
      ? roundOne(
          recentSleepQLogs.reduce((s, d) => s + (d.sleepQuality as number), 0) /
            recentSleepQLogs.length,
        )
      : null;

  // 3) ACWR > 1.35
  const acwrReport = computeAcwrReport(hevyWorkouts, dailyLogs, anchorDate);
  const acwr = acwrReport.acwr;

  const fatigueSignals: DeloadFatigueSignal[] = [];

  if (rhrDeltaBpm !== null && rhrDeltaBpm > 4 && latestRhr !== null && rhr30dAvg !== null) {
    fatigueSignals.push({
      id: 'rhr',
      label: 'Повишен сутрешен пулс',
      detail: `${latestRhr} bpm (+${rhrDeltaBpm} bpm спрямо 30-дн. ср. ${rhr30dAvg} bpm)`,
    });
  }

  if (recentSleepQualityAvg !== null && recentSleepQualityAvg <= 3) {
    fatigueSignals.push({
      id: 'sleep_quality',
      label: 'Спад в качеството на съня',
      detail: `Средна бодрост ${recentSleepQualityAvg}/5 за посл. ${recentSleepQLogs.length} записа (праг ≤ 3)`,
    });
  }

  if (acwr !== null && acwr > 1.35) {
    fatigueSignals.push({
      id: 'acwr',
      label: 'Висок ACWR товар',
      detail: `ACWR ${acwr.toFixed(2)} (праг > 1.35 — остър скок в натоварването)`,
    });
  }

  const hasEnoughData = hevyWorkouts.length > 0 || dailyLogs.length > 0;
  const currentCycleWeek = Math.min(6, consecutiveHardWeeks);

  let status: DeloadCycleAnalysis['status'] = 'accumulation';
  if (
    currentCycleWeek >= targetCycleWeeks ||
    fatigueSignals.length >= 2 ||
    (currentCycleWeek >= 4 && fatigueSignals.length >= 1)
  ) {
    status = 'deload_now';
  } else if (currentCycleWeek === 4 || fatigueSignals.length === 1) {
    status = 'approaching';
  }

  let headline: string;
  let subtext: string;

  if (!hasEnoughData) {
    headline = 'Седмица 0/5 — Изчакване на тренировъчни данни';
    subtext =
      'Импортирай тренировки от Hevy и записвай сън/пулс, за да се следи автоматично моментът за разтоварваща седмица.';
  } else if (status === 'deload_now') {
    headline = '⚠️ Време е за Deload седмица — натрупана умора';
    subtext =
      fatigueSignals.length > 0
        ? `Засечени са ${fatigueSignals.length} маркера на умора след ${currentCycleWeek} тежки седмици. Намали обема с 40% и тежестите с 10% за 7 дни.`
        : `Достигнати са ${currentCycleWeek}/${targetCycleWeeks} поредни седмици с висок обем. Планирай 7-дневен Deload за суперкомпенсация.`;
  } else if (status === 'approaching') {
    headline = `Седмица ${Math.max(1, currentCycleWeek)}/${targetCycleWeeks} — Финална фаза преди Deload`;
    subtext =
      fatigueSignals.length > 0
        ? `Има ранен сигнал за умора (${fatigueSignals[0].label.toLowerCase()}). Следи възстановяването и планирай разтоварване до 1 седмица.`
        : 'Остава 1 тежка седмица преди планирана разтоварваща седмица.';
  } else {
    headline = `Седмица ${Math.max(1, currentCycleWeek)}/${targetCycleWeeks} — Фаза на натрупване`;
    subtext =
      'Биометрията и натоварването са стабилни. Продължи прогресивното натоварване без необходимост от Deload.';
  }

  return {
    status,
    currentCycleWeek,
    targetCycleWeeks,
    headline,
    subtext,
    weeklyBuckets,
    fatigueSignals,
    acwr,
    rhrDeltaBpm,
    rhr30dAvg,
    latestRhr,
    recentSleepQualityAvg,
    hasEnoughData,
  };
}

/**
 * Generates a ready 7-day Deload plan from the user's last 2–3 distinct Hevy workouts:
 * - Same exercises
 * - Working sets reduced by 40% (minimum 2 sets)
 * - Working weight reduced by 10% rounded to nearest 2.5 kg
 */
export function generateDeloadWeekPlan(
  hevyWorkouts: HevyWorkout[],
): DeloadWeekPlan {
  const sortedNewest = [...hevyWorkouts].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (b.startTime ?? '').localeCompare(a.startTime ?? '');
  });

  // Prefer up to 3 distinct workout routines (e.g. Push, Pull, Legs); fall back to most recent 3
  const selected: HevyWorkout[] = [];
  const seenTitles = new Set<string>();
  for (const w of sortedNewest) {
    if (w.exercises.length === 0) continue;
    const key = w.title.trim().toLowerCase();
    if (!seenTitles.has(key)) {
      seenTitles.add(key);
      selected.push(w);
    }
    if (selected.length >= 3) break;
  }

  if (selected.length < 2) {
    for (const w of sortedNewest) {
      if (w.exercises.length === 0) continue;
      if (!selected.some((s) => s.id === w.id)) {
        selected.push(w);
      }
      if (selected.length >= 3) break;
    }
  }

  const days: DeloadWorkoutDayPlan[] = selected.map((workout) => {
    let originalTotalSets = 0;
    let deloadTotalSets = 0;

    const exercises: DeloadExercisePrescription[] = workout.exercises.map((ex) => {
      const working = getWorkingSets(ex.sets);
      const originalSets = Math.max(1, working.length);
      const deloadSets = Math.max(2, Math.round(originalSets * 0.6));

      const weightedSets = working.filter((s) => (s.weightKg ?? 0) > 0);
      const originalWeightKg =
        weightedSets.length > 0
          ? Math.max(...weightedSets.map((s) => s.weightKg as number))
          : 0;
      const isBodyweight = originalWeightKg <= 0;
      const deloadWeightKg = isBodyweight
        ? 0
        : roundToNearest2Point5(originalWeightKg * 0.9);

      const repValues = working
        .map((s) => s.reps)
        .filter((r): r is number => r !== undefined && r > 0);
      const minReps = repValues.length > 0 ? Math.min(...repValues) : 8;
      const maxReps = repValues.length > 0 ? Math.max(...repValues) : 10;
      const targetRepsText =
        minReps === maxReps ? `${minReps} повт.` : `${minReps}–${maxReps} повт.`;

      originalTotalSets += originalSets;
      deloadTotalSets += deloadSets;

      return {
        title: ex.title,
        originalSets,
        deloadSets,
        originalWeightKg,
        deloadWeightKg,
        targetRepsText,
        isBodyweight,
      };
    });

    return {
      sourceWorkoutId: workout.id,
      sourceTitle: workout.title,
      sourceDate: workout.date,
      exercises,
      originalTotalSets,
      deloadTotalSets,
    };
  });

  return {
    days,
    setsReductionPct: 40,
    weightReductionPct: 10,
    summaryNote:
      'Запази чиста техника и 3–4 повторения в резерв (RPE 6–7). Нервната система и сухожилията се възстановяват, докато силата се запазва на 100%.',
  };
}

export function formatDeloadPlanClipboard(plan: DeloadWeekPlan): string {
  const lines: string[] = [
    '🔄 7-дневен Deload план (-40% серии, -10% тежест, RPE 6–7)',
    '',
  ];
  plan.days.forEach((day, idx) => {
    lines.push(`Ден ${idx + 1}: ${day.sourceTitle} (${day.deloadTotalSets} сер. вместо ${day.originalTotalSets})`);
    for (const ex of day.exercises) {
      const loadText = ex.isBodyweight
        ? 'Собствено тегло (леки серии)'
        : `${ex.deloadWeightKg} kg (от ${ex.originalWeightKg} kg)`;
      lines.push(`  • ${ex.title}: ${ex.deloadSets} × ${ex.targetRepsText} @ ${loadText}`);
    }
    lines.push('');
  });
  lines.push(plan.summaryNote);
  return lines.join('\n');
}
