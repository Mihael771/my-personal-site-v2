import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import { classifyHabitPolarity } from './habitBodyImpact';
import { buildAllWorkoutsHiddenPrIndex } from './hiddenProgressAndEnvironment';
import { hasTribulusInLog } from './testosteroneAndHabits';

export type BiometricRadarStatus = 'alert' | 'caution' | 'normal' | 'no_data';

export interface BiometricRadarReport {
  status: BiometricRadarStatus;
  bannerText: string;
  subText: string;
  latestDate: string | null;
  // Resting Heart Rate (bpm)
  rhrBaseline30d: number | null;
  rhrBaselineSamples: number;
  rhrRecent2d: Array<{ date: string; value: number; delta: number }>;
  rhrLatest: number | null;
  rhrDeltaBpm: number | null;
  rhrElevated2Days: boolean;
  // Heart Rate Variability (ms)
  hrvBaseline30d: number | null;
  hrvBaselineSamples: number;
  hrvLatest: number | null;
  hrvLatestDate: string | null;
  hrvDropPct: number | null; // positive value means % drop below baseline
  hrvDropAlert: boolean;
  // Sleep context
  avgSleepLast2d: number | null;
  lowSleepWarning: boolean;
  triggers: string[];
}

export interface HabitGroupMetrics {
  label: string;
  workoutsCount: number;
  avgVolumeKg: number | null;
  avgMaxWeightKg: number | null;
  repPrRatePct: number | null; // % of workouts with at least 1 Rep PR
  repPrTotalCount: number;
}

export interface HabitDetectiveComparison {
  id: 'sleep' | 'clean_vs_harmful' | 'tribulus';
  title: string;
  subtitle: string;
  groupA: HabitGroupMetrics;
  groupB: HabitGroupMetrics;
  unlocked: boolean;
  collectedSamplesForProgress: number; // capped at 6 (3 per group)
  requiredSamplesTotal: number; // 6 (3 + 3)
  volumeDiffPct: number | null; // (A - B) / B * 100
  maxWeightDiffPct: number | null;
  repPrRateDiffPts: number | null; // percentage points (A - B)
  headlineInsight: string;
  detailText: string;
  // Optional subjective sleep/energy comparison (used for Tribulus)
  subjectiveNote?: string;
  energyWith?: number | null;
  energyWithout?: number | null;
  energySamplesWith?: number;
  energySamplesWithout?: number;
}

export interface HabitDetectiveReport {
  windowStart: string;
  windowEnd: string;
  totalWorkoutsIn60d: number;
  totalDailyLogsIn60d: number;
  unlockedCount: number;
  comparisons: HabitDetectiveComparison[];
}

export const RADAR_ALERT_BANNER_TEXT =
  '🚨 Ранен радар: Засечен физиологичен стрес (пулс над нормата / спад в HRV). Възможна настинка или претрениране в следващите 24–48 ч. — препоръчителна е пълна почивка и повече сън днес!';

function shiftYmd(dateKey: string, deltaDays: number): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

function daysBetweenYmd(olderYmd: string, newerYmd: string): number {
  const a = Date.parse(`${olderYmd}T12:00:00Z`);
  const b = Date.parse(`${newerYmd}T12:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 999;
  return Math.round((b - a) / 86_400_000);
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function resolveAnchorDate(
  todayKey: string,
  dates: string[],
  maxDriftDays: number = 14,
): string {
  let latest = '';
  for (const d of dates) {
    if (d && d > latest) latest = d;
  }
  if (!latest) return todayKey;
  if (Math.abs(daysBetweenYmd(latest, todayKey)) > maxDriftDays) {
    return latest;
  }
  return todayKey;
}

/**
 * Feature 2: Early Illness & Overtraining Biometric Radar (24–48h prevention).
 * Compares the most recent 2 days of Resting HR and HRV against the 30-day personal baseline.
 *
 * Alert triggers:
 *  - Morning Resting HR >= +4 bpm above 30-day average for 2 consecutive days
 *  - OR HRV dropped by > 15% below 30-day average
 */
export function analyzeBiometricRadar(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): BiometricRadarReport {
  const { dailyLogs, todayKey } = params;

  const anchorDate = resolveAnchorDate(
    todayKey,
    dailyLogs.map((l) => l.date),
    14,
  );
  const window30Start = shiftYmd(anchorDate, -29);

  const logs30d = dailyLogs
    .filter((l) => l.date >= window30Start && l.date <= anchorDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  const rhrEntries = logs30d.filter(
    (l): l is DailyBiometricLog & { restingHr: number } =>
      typeof l.restingHr === 'number' && Number.isFinite(l.restingHr) && l.restingHr > 0,
  );
  const hrvEntries = logs30d.filter(
    (l): l is DailyBiometricLog & { hrv: number } =>
      typeof l.hrv === 'number' && Number.isFinite(l.hrv) && l.hrv > 0,
  );
  const sleepEntries = logs30d.filter(
    (l): l is DailyBiometricLog & { sleepHours: number } =>
      typeof l.sleepHours === 'number' && Number.isFinite(l.sleepHours) && l.sleepHours > 0,
  );

  // Recent 2-day sleep context
  const recentSleep = sleepEntries.slice(0, 2);
  const avgSleepLast2dRaw = average(recentSleep.map((s) => s.sleepHours));
  const avgSleepLast2d = avgSleepLast2dRaw !== null ? roundOne(avgSleepLast2dRaw) : null;
  const lowSleepWarning = avgSleepLast2d !== null && avgSleepLast2d < 6.5;

  if (rhrEntries.length === 0 && hrvEntries.length === 0) {
    return {
      status: 'no_data',
      bannerText: 'Няма достатъчно данни за пулс в покой или HRV',
      subText:
        'Записвай сутрешния си пулс в покой (или синхронизирай Huawei Watch в „Дневен запис“), за да активираш ранния радар за превенция 24–48 ч. предварително.',
      latestDate: logs30d[0]?.date ?? null,
      rhrBaseline30d: null,
      rhrBaselineSamples: 0,
      rhrRecent2d: [],
      rhrLatest: null,
      rhrDeltaBpm: null,
      rhrElevated2Days: false,
      hrvBaseline30d: null,
      hrvBaselineSamples: 0,
      hrvLatest: null,
      hrvLatestDate: null,
      hrvDropPct: null,
      hrvDropAlert: false,
      avgSleepLast2d,
      lowSleepWarning,
      triggers: [],
    };
  }

  // --- Resting HR analysis ---
  let rhrBaseline30d: number | null = null;
  let rhrBaselineSamples = 0;
  let rhrRecent2d: Array<{ date: string; value: number; delta: number }> = [];
  let rhrLatest: number | null = null;
  let rhrDeltaBpm: number | null = null;
  let rhrElevated2Days = false;
  let rhrElevated1Day = false;

  if (rhrEntries.length > 0) {
    rhrLatest = rhrEntries[0].restingHr;
    // Exclude the latest 2 days from baseline when >= 3 prior samples exist so a 2-day illness spike doesn't distort its own baseline
    const priorRhr = rhrEntries.length >= 5 ? rhrEntries.slice(2) : rhrEntries;
    const baseAvg = average(priorRhr.map((e) => e.restingHr));
    if (baseAvg !== null) {
      rhrBaseline30d = roundOne(baseAvg);
      rhrBaselineSamples = priorRhr.length;
      rhrDeltaBpm = roundOne(rhrLatest - rhrBaseline30d);

      const latestTwo = rhrEntries.slice(0, 2);
      rhrRecent2d = latestTwo.map((e) => ({
        date: e.date,
        value: e.restingHr,
        delta: roundOne(e.restingHr - rhrBaseline30d!),
      }));

      // Require >= 3 total RHR entries to form a meaningful personal baseline
      if (rhrEntries.length >= 3 && latestTwo.length === 2) {
        const gapDays = daysBetweenYmd(latestTwo[1].date, latestTwo[0].date);
        // Consecutive days (1 day apart, or at most 2 days if one check-in was missed)
        if (
          gapDays >= 1 &&
          gapDays <= 2 &&
          latestTwo[0].restingHr - rhrBaseline30d >= 4 &&
          latestTwo[1].restingHr - rhrBaseline30d >= 4
        ) {
          rhrElevated2Days = true;
        }
      }
      if (rhrEntries.length >= 3 && rhrDeltaBpm >= 4) {
        rhrElevated1Day = true;
      }
    }
  }

  // --- HRV analysis ---
  let hrvBaseline30d: number | null = null;
  let hrvBaselineSamples = 0;
  let hrvLatest: number | null = null;
  let hrvLatestDate: string | null = null;
  let hrvDropPct: number | null = null;
  let hrvDropAlert = false;
  let hrvMildDrop = false;

  if (hrvEntries.length > 0) {
    hrvLatest = hrvEntries[0].hrv;
    hrvLatestDate = hrvEntries[0].date;
    const priorHrv = hrvEntries.length >= 5 ? hrvEntries.slice(2) : hrvEntries;
    const baseHrvAvg = average(priorHrv.map((e) => e.hrv));
    if (baseHrvAvg !== null && baseHrvAvg > 0) {
      hrvBaseline30d = roundOne(baseHrvAvg);
      hrvBaselineSamples = priorHrv.length;
      // Positive dropPct means HRV dropped below baseline
      const rawDrop = ((hrvBaseline30d - hrvLatest) / hrvBaseline30d) * 100;
      hrvDropPct = roundOne(rawDrop);

      if (hrvEntries.length >= 3 && rawDrop > 15) {
        hrvDropAlert = true;
      } else if (hrvEntries.length >= 3 && rawDrop >= 10) {
        hrvMildDrop = true;
      }
    }
  }

  const triggers: string[] = [];
  if (rhrElevated2Days && rhrBaseline30d !== null) {
    triggers.push(
      `Пулс в покой +${rhrRecent2d[0].delta} / +${rhrRecent2d[1].delta} bpm над 30-дн. база (${rhrBaseline30d} bpm) за 2 поредни дни`,
    );
  }
  if (hrvDropAlert && hrvBaseline30d !== null && hrvLatest !== null && hrvDropPct !== null) {
    triggers.push(
      `HRV спадна с -${hrvDropPct}% (${hrvLatest} ms спрямо 30-дн. норма ${hrvBaseline30d} ms)`,
    );
  }
  if (lowSleepWarning && avgSleepLast2d !== null) {
    triggers.push(`Къс сън в посл. 2 дни (${avgSleepLast2d} ч. < 6.5 ч.)`);
  }

  const latestDate =
    [rhrEntries[0]?.date, hrvEntries[0]?.date].filter(Boolean).sort().reverse()[0] ??
    null;

  if (rhrElevated2Days || hrvDropAlert) {
    return {
      status: 'alert',
      bannerText: RADAR_ALERT_BANNER_TEXT,
      subText: triggers.join(' · '),
      latestDate,
      rhrBaseline30d,
      rhrBaselineSamples,
      rhrRecent2d,
      rhrLatest,
      rhrDeltaBpm,
      rhrElevated2Days,
      hrvBaseline30d,
      hrvBaselineSamples,
      hrvLatest,
      hrvLatestDate,
      hrvDropPct,
      hrvDropAlert,
      avgSleepLast2d,
      lowSleepWarning,
      triggers,
    };
  }

  if (
    rhrElevated1Day ||
    hrvMildDrop ||
    (lowSleepWarning && rhrDeltaBpm !== null && rhrDeltaBpm >= 2)
  ) {
    const cautionParts: string[] = [];
    if (rhrElevated1Day && rhrDeltaBpm !== null && rhrBaseline30d !== null) {
      cautionParts.push(
        `Еднодневен скок на пулса (+${rhrDeltaBpm} bpm спрямо ${rhrBaseline30d} bpm)`,
      );
    }
    if (hrvMildDrop && hrvDropPct !== null && hrvBaseline30d !== null) {
      cautionParts.push(`Умерен спад в HRV (-${hrvDropPct}% спрямо ${hrvBaseline30d} ms)`);
    }
    if (lowSleepWarning && avgSleepLast2d !== null) {
      cautionParts.push(`Сън под 6.5 ч. (${avgSleepLast2d} ч.)`);
    }
    return {
      status: 'caution',
      bannerText:
        '⚠️ Ранен радар: Лек физиологичен сигнал — следи утрешния сутрешен пулс и легни по-рано.',
      subText: cautionParts.join(' · '),
      latestDate,
      rhrBaseline30d,
      rhrBaselineSamples,
      rhrRecent2d,
      rhrLatest,
      rhrDeltaBpm,
      rhrElevated2Days: false,
      hrvBaseline30d,
      hrvBaselineSamples,
      hrvLatest,
      hrvLatestDate,
      hrvDropPct,
      hrvDropAlert: false,
      avgSleepLast2d,
      lowSleepWarning,
      triggers: cautionParts,
    };
  }

  const normalParts: string[] = [];
  if (rhrLatest !== null && rhrBaseline30d !== null && rhrDeltaBpm !== null) {
    const sign = rhrDeltaBpm > 0 ? '+' : '';
    normalParts.push(
      `Пулс: ${rhrLatest} bpm (${sign}${rhrDeltaBpm} спрямо 30-дн. ${rhrBaseline30d})`,
    );
  }
  if (hrvLatest !== null && hrvBaseline30d !== null && hrvDropPct !== null) {
    const deltaPct = roundOne(-hrvDropPct);
    const sign = deltaPct > 0 ? '+' : '';
    normalParts.push(
      `HRV: ${hrvLatest} ms (${sign}${deltaPct}% спрямо 30-дн. ${hrvBaseline30d})`,
    );
  }
  if (avgSleepLast2d !== null) {
    normalParts.push(`Сън (2 д.): ${avgSleepLast2d} ч.`);
  }

  return {
    status: 'normal',
    bannerText:
      'Биометричен радар в норма — без признаци на настинка или претрениране.',
    subText:
      normalParts.length > 0
        ? normalParts.join(' · ')
        : 'Вегетативната нервна система е стабилна спрямо 30-дневната ти база.',
    latestDate,
    rhrBaseline30d,
    rhrBaselineSamples,
    rhrRecent2d,
    rhrLatest,
    rhrDeltaBpm,
    rhrElevated2Days: false,
    hrvBaseline30d,
    hrvBaselineSamples,
    hrvLatest,
    hrvLatestDate,
    hrvDropPct,
    hrvDropAlert: false,
    avgSleepLast2d,
    lowSleepWarning,
    triggers: [],
  };
}

function hasAnyHarmfulHabit(log: DailyBiometricLog | undefined): boolean {
  if (!log) return false;
  return log.completedHabits.some((h) => classifyHabitPolarity(h) === 'harmful');
}

function summarizeWorkoutGroup(
  label: string,
  workouts: HevyWorkout[],
  repPrCountByWorkoutId: Map<string, number>,
): HabitGroupMetrics {
  const count = workouts.length;
  if (count === 0) {
    return {
      label,
      workoutsCount: 0,
      avgVolumeKg: null,
      avgMaxWeightKg: null,
      repPrRatePct: null,
      repPrTotalCount: 0,
    };
  }

  let volSum = 0;
  let maxWCount = 0;
  let maxWSum = 0;
  let workoutsWithRepPr = 0;
  let repPrTotalCount = 0;

  for (const w of workouts) {
    volSum += w.totalVolumeKg || 0;
    if (w.maxWeightKg > 0) {
      maxWSum += w.maxWeightKg;
      maxWCount += 1;
    }
    const prs = repPrCountByWorkoutId.get(w.id) ?? 0;
    repPrTotalCount += prs;
    if (prs > 0) workoutsWithRepPr += 1;
  }

  return {
    label,
    workoutsCount: count,
    avgVolumeKg: Math.round(volSum / count),
    avgMaxWeightKg: maxWCount > 0 ? roundOne(maxWSum / maxWCount) : null,
    repPrRatePct: Math.round((workoutsWithRepPr / count) * 100),
    repPrTotalCount,
  };
}

function pctDiff(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  return roundOne(((a - b) / b) * 100);
}

/**
 * Feature 3: Habit Detective (60-day personal correlations).
 * Cross-references `dailyLogs` and `hevyWorkouts` over the last 60 days to compare:
 *  1) Sleep >= 7.5 h vs Sleep < 6.5 h
 *  2) Clean streak (2+ consecutive days without harmful habits) vs After harmful habits
 *  3) Tribulus terrestris periods vs Without Tribulus (strength + subjective energy/freshness)
 *
 * Strict statistical discipline: concrete % findings are unlocked ONLY when BOTH groups
 * have >= 3 workouts; otherwise shows progress `Събиране на данни за личен анализ: X/6 тренировки`.
 */
export function analyzeHabitDetective60d(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
}): HabitDetectiveReport {
  const { dailyLogs, hevyWorkouts, todayKey, bodyWeightKg = null } = params;

  const allDates = [
    ...hevyWorkouts.map((w) => w.date),
    ...dailyLogs.map((l) => l.date),
  ];
  const windowEnd = resolveAnchorDate(todayKey, allDates, 14);
  const windowStart = shiftYmd(windowEnd, -59);

  const workouts60d = hevyWorkouts.filter(
    (w) => w.date >= windowStart && w.date <= windowEnd,
  );
  const logs60d = dailyLogs.filter(
    (l) => l.date >= windowStart && l.date <= windowEnd,
  );

  // Lookup map includes a couple of days before windowStart so day-before checks at window start work cleanly
  const logByDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    logByDate.set(log.date, log);
  }

  // Compute Rep PR count per workout across full history so Rep PRs are historically accurate
  const prIndex = buildAllWorkoutsHiddenPrIndex(hevyWorkouts, bodyWeightKg);
  const repPrCountByWorkoutId = new Map<string, number>();
  for (const session of prIndex.byWorkoutAndExercise.values()) {
    if (session.isRepPR) {
      repPrCountByWorkoutId.set(
        session.workoutId,
        (repPrCountByWorkoutId.get(session.workoutId) ?? 0) +
          Math.max(1, session.repPrHits.length),
      );
    }
  }

  // Bucket 1: Sleep >= 7.5 h vs < 6.5 h
  const sleepHighWorkouts: HevyWorkout[] = [];
  const sleepLowWorkouts: HevyWorkout[] = [];

  // Bucket 2: 2+ consecutive clean days vs After harmful habits
  const cleanStreakWorkouts: HevyWorkout[] = [];
  const afterHarmfulWorkouts: HevyWorkout[] = [];

  // Bucket 3: Tribulus vs No Tribulus
  const tribulusWorkouts: HevyWorkout[] = [];
  const noTribulusWorkouts: HevyWorkout[] = [];

  for (const workout of workouts60d) {
    const d0 = workout.date;
    const d1 = shiftYmd(d0, -1);
    const d2 = shiftYmd(d0, -2);
    const log0 = logByDate.get(d0);
    const log1 = logByDate.get(d1);
    const log2 = logByDate.get(d2);

    // 1. Sleep (morning of workout day, or previous night if workout day isn't logged)
    const sleepHours =
      log0?.sleepHours !== undefined && log0.sleepHours > 0
        ? log0.sleepHours
        : log1?.sleepHours !== undefined && log1.sleepHours > 0
          ? log1.sleepHours
          : undefined;
    if (sleepHours !== undefined) {
      if (sleepHours >= 7.5) {
        sleepHighWorkouts.push(workout);
      } else if (sleepHours < 6.5) {
        sleepLowWorkouts.push(workout);
      }
    }

    // 2. Clean 2+ consecutive days vs after harmful habits (day of or day before workout)
    if (hasAnyHarmfulHabit(log0) || hasAnyHarmfulHabit(log1)) {
      afterHarmfulWorkouts.push(workout);
    } else if (
      (log0 && log1 && !hasAnyHarmfulHabit(log0) && !hasAnyHarmfulHabit(log1)) ||
      (log1 && log2 && !hasAnyHarmfulHabit(log1) && !hasAnyHarmfulHabit(log2))
    ) {
      cleanStreakWorkouts.push(workout);
    }

    // 3. Tribulus vs without Tribulus
    const hasLogContext = Boolean(log0 || log1);
    if (hasLogContext) {
      const tookTribulus =
        (log0 && hasTribulusInLog(log0)) || (log1 && hasTribulusInLog(log1));
      if (tookTribulus) {
        tribulusWorkouts.push(workout);
      } else {
        noTribulusWorkouts.push(workout);
      }
    }
  }

  // Subjective energy / sleep quality (1-5) for Tribulus across 60d dailyLogs
  const energyWithList: number[] = [];
  const energyWithoutList: number[] = [];
  for (const log of logs60d) {
    if (typeof log.sleepQuality === 'number' && log.sleepQuality >= 1 && log.sleepQuality <= 5) {
      if (hasTribulusInLog(log)) energyWithList.push(log.sleepQuality);
      else energyWithoutList.push(log.sleepQuality);
    }
  }
  const energyWithRaw = average(energyWithList);
  const energyWithoutRaw = average(energyWithoutList);
  const energyWith = energyWithRaw !== null ? roundOne(energyWithRaw) : null;
  const energyWithout = energyWithoutRaw !== null ? roundOne(energyWithoutRaw) : null;

  const buildComparison = (args: {
    id: HabitDetectiveComparison['id'];
    title: string;
    subtitle: string;
    labelA: string;
    workoutsA: HevyWorkout[];
    labelB: string;
    workoutsB: HevyWorkout[];
    unlockedHeadlineBuilder: (
      volDiff: number | null,
      maxWDiff: number | null,
      prPts: number | null,
      a: HabitGroupMetrics,
      b: HabitGroupMetrics,
    ) => { headline: string; detail: string };
    subjectiveNote?: string;
    energyWith?: number | null;
    energyWithout?: number | null;
    energySamplesWith?: number;
    energySamplesWithout?: number;
  }): HabitDetectiveComparison => {
    const groupA = summarizeWorkoutGroup(args.labelA, args.workoutsA, repPrCountByWorkoutId);
    const groupB = summarizeWorkoutGroup(args.labelB, args.workoutsB, repPrCountByWorkoutId);
    const unlocked = groupA.workoutsCount >= 3 && groupB.workoutsCount >= 3;
    const collectedSamplesForProgress =
      Math.min(3, groupA.workoutsCount) + Math.min(3, groupB.workoutsCount);

    const volumeDiffPct = unlocked ? pctDiff(groupA.avgVolumeKg, groupB.avgVolumeKg) : null;
    const maxWeightDiffPct = unlocked
      ? pctDiff(groupA.avgMaxWeightKg, groupB.avgMaxWeightKg)
      : null;
    const repPrRateDiffPts =
      unlocked && groupA.repPrRatePct !== null && groupB.repPrRatePct !== null
        ? groupA.repPrRatePct - groupB.repPrRatePct
        : null;

    if (!unlocked) {
      return {
        id: args.id,
        title: args.title,
        subtitle: args.subtitle,
        groupA,
        groupB,
        unlocked: false,
        collectedSamplesForProgress,
        requiredSamplesTotal: 6,
        volumeDiffPct: null,
        maxWeightDiffPct: null,
        repPrRateDiffPts: null,
        headlineInsight: `Събиране на данни за личен анализ: ${collectedSamplesForProgress}/6 тренировки`,
        detailText: `Нужни са поне по 3 тренировки във всяка група (${args.labelA}: ${groupA.workoutsCount}/3 · ${args.labelB}: ${groupB.workoutsCount}/3 за последните 60 дни).`,
        subjectiveNote: args.subjectiveNote,
        energyWith: args.energyWith,
        energyWithout: args.energyWithout,
        energySamplesWith: args.energySamplesWith,
        energySamplesWithout: args.energySamplesWithout,
      };
    }

    const { headline, detail } = args.unlockedHeadlineBuilder(
      volumeDiffPct,
      maxWeightDiffPct,
      repPrRateDiffPts,
      groupA,
      groupB,
    );

    return {
      id: args.id,
      title: args.title,
      subtitle: args.subtitle,
      groupA,
      groupB,
      unlocked: true,
      collectedSamplesForProgress: 6,
      requiredSamplesTotal: 6,
      volumeDiffPct,
      maxWeightDiffPct,
      repPrRateDiffPts,
      headlineInsight: headline,
      detailText: detail,
      subjectiveNote: args.subjectiveNote,
      energyWith: args.energyWith,
      energyWithout: args.energyWithout,
      energySamplesWith: args.energySamplesWith,
      energySamplesWithout: args.energySamplesWithout,
    };
  };

  // 1. Sleep comparison
  const sleepComparison = buildComparison({
    id: 'sleep',
    title: 'Сън ≥ 7.5 ч. срещу Сън < 6.5 ч.',
    subtitle: 'Влияние на нощния сън върху тренировъчния обем, тежестите и Rep PRs',
    labelA: 'Сън ≥ 7.5 ч.',
    workoutsA: sleepHighWorkouts,
    labelB: 'Сън < 6.5 ч.',
    workoutsB: sleepLowWorkouts,
    unlockedHeadlineBuilder: (volDiff, maxWDiff, prPts, a, b) => {
      const signVol = volDiff !== null && volDiff > 0 ? '+' : '';
      const headline =
        volDiff !== null
          ? volDiff >= 3
            ? `При сън ≥ 7.5 ч. вдигаш с ${signVol}${volDiff}% по-голям тренировъчен обем.`
            : volDiff <= -3
              ? `При сън ≥ 7.5 ч. обемът е ${volDiff}% спрямо къс сън (вероятно по-тежки или по-къси сесии).`
              : `Обемът при сън ≥ 7.5 ч. и < 6.5 ч. е близък (${signVol}${volDiff}%).`
          : 'Достатъчно тренировки за сравнение на съня.';
      const parts: string[] = [];
      if (a.avgVolumeKg !== null && b.avgVolumeKg !== null) {
        parts.push(`Ср. обем: ${a.avgVolumeKg} kg срещу ${b.avgVolumeKg} kg`);
      }
      if (maxWDiff !== null) {
        parts.push(`Макс. тежест: ${maxWDiff > 0 ? '+' : ''}${maxWDiff}%`);
      }
      if (a.repPrRatePct !== null && b.repPrRatePct !== null && prPts !== null) {
        parts.push(
          `Rep PR честота: ${a.repPrRatePct}% срещу ${b.repPrRatePct}% (${prPts > 0 ? '+' : ''}${prPts} п.п.)`,
        );
      }
      return { headline, detail: parts.join(' · ') };
    },
  });

  // 2. Clean 2+ days vs After harmful habits
  const cleanVsHarmfulComparison = buildComparison({
    id: 'clean_vs_harmful',
    title: 'Чиста серия (2+ дни) срещу Вредни навици',
    subtitle: 'Дни без алкохол/никотин/късно лягане/джънк спрямо тренировки след вреден навик',
    labelA: '2+ чисти дни',
    workoutsA: cleanStreakWorkouts,
    labelB: 'След вредни навици',
    workoutsB: afterHarmfulWorkouts,
    unlockedHeadlineBuilder: (volDiff, maxWDiff, prPts, a, b) => {
      const signVol = volDiff !== null && volDiff > 0 ? '+' : '';
      const headline =
        volDiff !== null && volDiff >= 3
          ? `След 2+ чисти дни тренировъчният ти обем е с ${signVol}${volDiff}% по-висок.`
          : prPts !== null && prPts >= 10
            ? `При 2+ чисти дни записваш с +${prPts} п.п. по-често Rep PR рекорди.`
            : `Разлика в обема при чисти дни срещу вредни навици: ${
                volDiff !== null ? `${signVol}${volDiff}%` : '—'
              }.`;
      const parts: string[] = [];
      if (a.avgVolumeKg !== null && b.avgVolumeKg !== null) {
        parts.push(`Ср. обем: ${a.avgVolumeKg} kg срещу ${b.avgVolumeKg} kg`);
      }
      if (maxWDiff !== null) {
        parts.push(`Макс. тежест: ${maxWDiff > 0 ? '+' : ''}${maxWDiff}%`);
      }
      if (a.repPrRatePct !== null && b.repPrRatePct !== null) {
        parts.push(`Rep PRs: ${a.repPrRatePct}% срещу ${b.repPrRatePct}%`);
      }
      return { headline, detail: parts.join(' · ') };
    },
  });

  // 3. Tribulus vs without Tribulus
  let tribulusSubjectiveNote: string | undefined;
  if (
    energyWith !== null &&
    energyWithout !== null &&
    energyWithList.length >= 3 &&
    energyWithoutList.length >= 3
  ) {
    const eDiff = pctDiff(energyWith, energyWithout);
    const signE = eDiff !== null && eDiff > 0 ? '+' : '';
    tribulusSubjectiveNote = `Субективна свежест/енергия: ${energyWith}/5 с Бабини зъби срещу ${energyWithout}/5 без прием (${
      eDiff !== null ? `${signE}${eDiff}%` : '—'
    }, ${energyWithList.length} vs ${energyWithoutList.length} дни).`;
  }

  const tribulusComparison = buildComparison({
    id: 'tribulus',
    title: 'Периоди с „Бабини зъби“ срещу Без прием',
    subtitle: 'Личен ефект върху силовия обем, Rep PRs и субективния тонус (последни 60 дни)',
    labelA: 'С Бабини зъби',
    workoutsA: tribulusWorkouts,
    labelB: 'Без прием',
    workoutsB: noTribulusWorkouts,
    subjectiveNote: tribulusSubjectiveNote,
    energyWith,
    energyWithout,
    energySamplesWith: energyWithList.length,
    energySamplesWithout: energyWithoutList.length,
    unlockedHeadlineBuilder: (volDiff, maxWDiff, prPts, a, b) => {
      const signVol = volDiff !== null && volDiff > 0 ? '+' : '';
      const headline =
        volDiff !== null
          ? volDiff >= 3
            ? `В периодите с „Бабини зъби“ средният ти обем е ${signVol}${volDiff}% по-висок.`
            : volDiff <= -3
              ? `В периодите с „Бабини зъби“ обемът е ${volDiff}% спрямо дните без прием.`
              : `Силовият обем с и без „Бабини зъби“ е почти равен (${signVol}${volDiff}%).`
          : 'Достатъчно тренировки за лично сравнение на „Бабини зъби“.';
      const parts: string[] = [];
      if (a.avgVolumeKg !== null && b.avgVolumeKg !== null) {
        parts.push(`Ср. обем: ${a.avgVolumeKg} kg срещу ${b.avgVolumeKg} kg`);
      }
      if (maxWDiff !== null) {
        parts.push(`Макс. тежест: ${maxWDiff > 0 ? '+' : ''}${maxWDiff}%`);
      }
      if (a.repPrRatePct !== null && b.repPrRatePct !== null && prPts !== null) {
        parts.push(
          `Rep PRs: ${a.repPrRatePct}% срещу ${b.repPrRatePct}% (${prPts > 0 ? '+' : ''}${prPts} п.п.)`,
        );
      }
      return { headline, detail: parts.join(' · ') };
    },
  });

  const comparisons = [
    sleepComparison,
    cleanVsHarmfulComparison,
    tribulusComparison,
  ];

  return {
    windowStart,
    windowEnd,
    totalWorkoutsIn60d: workouts60d.length,
    totalDailyLogsIn60d: logs60d.length,
    unlockedCount: comparisons.filter((c) => c.unlocked).length,
    comparisons,
  };
}
