import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import { parseIntervalsWatchDayData } from '../services/intervalsWatchSync';
import { shiftDateKey } from './fitnessMath';
import {
  APPLE_VITALS_MULTI_ALERT_TEXT,
  circularDistanceMinutes,
  circularMeanMinutes,
  computeAppleVitalsReport,
  computeEffortTrainingLoadReport,
  computePercentile,
  computeSamsungEnergyAndHrDipReport,
  computeSleepCoachingChronotypeReport,
  scoreStrengthWorkoutEffort,
  scoreWatchActivityEffort,
} from './vitalsAndSleepCoachingEngine';

function makeStrengthWorkout(
  id: string,
  date: string,
  setsPerExercise = 4,
  exercisesCount = 4,
): HevyWorkout {
  const exercises = Array.from({ length: exercisesCount }, (_, idx) => ({
    title: `Упражнение ${idx + 1}`,
    sets: Array.from({ length: setsPerExercise }, (_, sIdx) => ({
      setIndex: sIdx,
      setType: 'normal',
      weightKg: 80,
      reps: 8,
      rpe: 8,
    })),
    totalVolumeKg: setsPerExercise * 80 * 8,
    maxWeightKg: 80,
  }));

  return {
    id,
    title: 'Силова сесия',
    startTime: `${date}T17:00:00`,
    endTime: `${date}T18:05:00`,
    date,
    exercises,
    totalVolumeKg: exercises.reduce((s, e) => s + e.totalVolumeKg, 0),
    maxWeightKg: 80,
    totalSets: setsPerExercise * exercisesCount,
    importedAt: `${date}T18:10:00Z`,
  };
}

function make30DayHealthyLogs(todayKey: string): DailyBiometricLog[] {
  const logs: DailyBiometricLog[] = [];
  for (let offset = 1; offset <= 30; offset += 1) {
    const date = shiftDateKey(todayKey, -offset);
    const wave = offset % 3;
    logs.push({
      date,
      sleepHours: 7.5 + (wave - 1) * 0.3, // 7.2, 7.5, 7.8
      deepSleepSecs: 5400 + wave * 300, // ~90-100 min
      remSleepSecs: 5400 + wave * 300,
      sleepQuality: 4,
      restingHr: 54 + wave, // 54, 55, 56
      hrv: 64 + wave * 3, // 64, 67, 70
      steps: 9000,
      completedHabits: [],
    });
  }
  return logs;
}

test('computePercentile calculates 25th, 50th, 75th percentiles accurately without NaN', () => {
  assert.equal(computePercentile([], 0.5), null);
  assert.equal(computePercentile([NaN, Infinity], 0.5), null);
  assert.equal(computePercentile([10, 20, 30, 40, 50], 0.25), 20);
  assert.equal(computePercentile([10, 20, 30, 40, 50], 0.5), 30);
  assert.equal(computePercentile([10, 20, 30, 40, 50], 0.75), 40);
});

test('Apple Vitals: stays normal when last night is inside 30d IQR, and triggers banner on 2+ outliers', () => {
  const todayKey = '2026-05-15';
  const baseline = make30DayHealthyLogs(todayKey);

  // Case 1: Normal night -> 0 out of range
  const normalReport = computeAppleVitalsReport({
    dailyLogs: [
      ...baseline,
      {
        date: todayKey,
        sleepHours: 7.6,
        deepSleepSecs: 5700,
        remSleepSecs: 5700,
        restingHr: 55,
        hrv: 67,
        completedHabits: [],
      },
    ],
    todayKey,
  });
  assert.equal(normalReport.hasLastNightData, true);
  assert.equal(normalReport.outOfRangeCount, 0);
  assert.equal(normalReport.hasMultiMetricAlert, false);
  assert.equal(normalReport.overallStatus, 'normal');

  // Case 2: Exactly 1 outlier (only RHR spiked) -> caution, NO 2+ alert
  const singleOutlier = computeAppleVitalsReport({
    dailyLogs: [
      ...baseline,
      {
        date: todayKey,
        sleepHours: 7.6,
        deepSleepSecs: 5700,
        remSleepSecs: 5700,
        restingHr: 64,
        hrv: 67,
        completedHabits: [],
      },
    ],
    todayKey,
  });
  assert.equal(singleOutlier.outOfRangeCount, 1);
  assert.equal(singleOutlier.hasMultiMetricAlert, false);
  assert.equal(singleOutlier.overallStatus, 'caution');

  // Case 3: 3 outliers (RHR high + HRV low + Sleep short) -> triggers exact warning banner
  const multiAlert = computeAppleVitalsReport({
    dailyLogs: [
      ...baseline,
      {
        date: todayKey,
        sleepHours: 5.2,
        deepSleepSecs: 2400,
        remSleepSecs: 2400,
        restingHr: 65,
        hrv: 42,
        completedHabits: [],
      },
    ],
    todayKey,
  });
  assert.ok(multiAlert.outOfRangeCount >= 2);
  assert.equal(multiAlert.hasMultiMetricAlert, true);
  assert.equal(multiAlert.alertMessage, APPLE_VITALS_MULTI_ALERT_TEXT);
  assert.equal(multiAlert.overallStatus, 'alert');
});

test('Effort Training Load: scores Hevy & watch sessions on 1-10 and classifies below / optimal / above', () => {
  const todayKey = '2026-05-15';
  const workouts: HevyWorkout[] = [];

  // Create steady 3 strength workouts/week in weeks 1-3 (days -28 .. -8)
  for (const offset of [27, 25, 23, 20, 18, 16, 13, 11, 9]) {
    const d = shiftDateKey(todayKey, -offset);
    workouts.push(makeStrengthWorkout(`w-${offset}`, d, 4, 4));
  }

  // Optimal week: 3 similar workouts in last 7 completed days (-7..-1)
  const optimalWorkouts = [
    ...workouts,
    makeStrengthWorkout('w-cur-1', shiftDateKey(todayKey, -6), 4, 4),
    makeStrengthWorkout('w-cur-2', shiftDateKey(todayKey, -4), 4, 4),
    makeStrengthWorkout('w-cur-3', shiftDateKey(todayKey, -2), 4, 4),
  ];
  const optReport = computeEffortTrainingLoadReport({
    dailyLogs: [],
    hevyWorkouts: optimalWorkouts,
    todayKey,
  });
  assert.equal(optReport.status, 'optimal');
  assert.equal(optReport.statusLabel, 'Стабилно / Оптимално');
  assert.ok(optReport.avgSessionEffort7d !== null && optReport.avgSessionEffort7d >= 1 && optReport.avgSessionEffort7d <= 10);

  // Below norm: 0 workouts in last 7 completed days
  const belowReport = computeEffortTrainingLoadReport({
    dailyLogs: [],
    hevyWorkouts: workouts,
    todayKey,
  });
  assert.equal(belowReport.status, 'below');
  assert.equal(belowReport.statusLabel, 'Под нормата');

  // Above norm: 6 heavy workouts + hard trail run in last 7 days
  const aboveWorkouts = [
    ...workouts,
    ...[7, 6, 5, 4, 3, 2, 1].map((off) =>
      makeStrengthWorkout(`w-heavy-${off}`, shiftDateKey(todayKey, -off), 5, 5),
    ),
  ];
  const cardioLogs: DailyBiometricLog[] = [
    {
      date: shiftDateKey(todayKey, -1),
      watchActivities: [
        {
          type: 'TrailRun',
          name: 'Балканско бягане',
          moving_time: 4200,
          average_heartrate: 164,
          total_elevation_gain: 550,
        },
      ],
      completedHabits: [],
    },
  ];
  const aboveReport = computeEffortTrainingLoadReport({
    dailyLogs: cardioLogs,
    hevyWorkouts: aboveWorkouts,
    todayKey,
  });
  assert.equal(aboveReport.status, 'above');
  assert.equal(aboveReport.statusLabel, 'Над нормата');

  // Verify individual scorer bounds [1, 10]
  const strengthScore = scoreStrengthWorkoutEffort(
    makeStrengthWorkout('single', '2026-05-14', 6, 6),
  );
  assert.ok(strengthScore.effortScore >= 1 && strengthScore.effortScore <= 10);
  const watchScore = scoreWatchActivityEffort(
    {
      type: 'Run',
      name: 'Темпово бягане',
      moving_time: 3000,
      average_heartrate: 158,
      total_elevation_gain: 200,
    },
    '2026-05-14',
    0,
    55,
  );
  assert.ok(watchScore.effortScore >= 1 && watchScore.effortScore <= 10);
});

test('Samsung Energy Score & Sleeping HR Dip: computes 0-100 score, 14d watch baseline fallback, and <10% warning', () => {
  const todayKey = '2026-05-15';
  const logs = make30DayHealthyLogs(todayKey);

  // Add a watch activity 3 days ago (so yesterday has no HR activity -> uses 14d baseline)
  logs[2].watchActivities = [
    {
      type: 'Run',
      name: 'Бягане',
      moving_time: 2700,
      average_heartrate: 140, // daytime awake estimate ~69 bpm
    },
  ];

  // Healthy night (restingHr 56 vs ~69 daytime -> ~18.8% dip -> optimal!)
  const healthy = computeSamsungEnergyAndHrDipReport({
    dailyLogs: [
      ...logs,
      {
        date: todayKey,
        sleepHours: 8.0,
        deepSleepSecs: 6000,
        remSleepSecs: 6000,
        restingHr: 56,
        hrv: 70,
        completedHabits: [],
      },
    ],
    hevyWorkouts: [],
    todayKey,
  });
  assert.equal(healthy.hasEnoughData, true);
  assert.ok(healthy.energyScore >= 75 && healthy.energyScore <= 100);
  assert.equal(healthy.hrDipSource, 'baseline_14d');
  assert.equal(healthy.hrDipStatus, 'optimal');
  assert.equal(healthy.hrDipWarning, null);

  // Stressed night (restingHr 65 vs ~69 daytime -> ~5.8% dip -> < 10% warning!)
  const stressed = computeSamsungEnergyAndHrDipReport({
    dailyLogs: [
      ...logs,
      {
        date: todayKey,
        sleepHours: 5.5,
        restingHr: 65,
        hrv: 40,
        completedHabits: [],
      },
    ],
    hevyWorkouts: [],
    todayKey,
  });
  assert.equal(stressed.hrDipStatus, 'low_dip');
  assert.ok(stressed.hrDipPct !== null && stressed.hrDipPct < 10);
  assert.ok(stressed.hrDipWarning !== null && stressed.hrDipWarning.includes('10%'));
});

test('Sleep Coaching & Chronotype: midnight-safe circular math, direct Intervals.icu times & estimation fallback', () => {
  // Circular mean across midnight: 23:45 (1425) and 00:15 (15) -> 00:00 (0)
  const midMean = circularMeanMinutes([23 * 60 + 45, 15]);
  assert.equal(midMean, 0);
  assert.equal(circularDistanceMinutes(23 * 60 + 45, 15), 30);

  // Intervals.icu sleepStart/sleepEnd extraction
  const parsed = parseIntervalsWatchDayData(
    {
      sleepSecs: 28800,
      sleepStart: '23:10',
      sleepEnd: '07:10',
      restingHR: 54,
    },
    [],
  );
  assert.equal(parsed.sleepStartTime, '23:10');
  assert.equal(parsed.sleepEndTime, '07:10');

  // Consistent 14-day schedule with direct timestamps -> stable (< ±30 min)
  const todayKey = '2026-05-15';
  const consistentLogs: DailyBiometricLog[] = Array.from({ length: 14 }, (_, i) => ({
    date: shiftDateKey(todayKey, -(i + 1)),
    sleepHours: 7.8,
    sleepStartTime: i % 2 === 0 ? '23:00' : '23:15',
    sleepEndTime: i % 2 === 0 ? '06:50' : '07:05',
    deepSleepSecs: 5800,
    remSleepSecs: 5800,
    completedHabits: [],
  }));
  const stableReport = computeSleepCoachingChronotypeReport({
    dailyLogs: consistentLogs,
    hevyWorkouts: [],
    todayKey,
  });
  assert.equal(stableReport.nightsAnalyzed, 14);
  assert.equal(stableReport.intervalsDirectNights, 14);
  assert.equal(stableReport.stabilityStatus, 'stable');
  assert.ok(stableReport.avgDeviationMin !== null && stableReport.avgDeviationMin <= 30);
  assert.equal(stableReport.chronotypeId, 'bear');

  // Empty logs -> zero NaN / safe empty state
  const emptyVitals = computeAppleVitalsReport({ dailyLogs: [], todayKey });
  const emptyLoad = computeEffortTrainingLoadReport({
    dailyLogs: [],
    hevyWorkouts: [],
    todayKey,
  });
  const emptyEnergy = computeSamsungEnergyAndHrDipReport({
    dailyLogs: [],
    hevyWorkouts: [],
    todayKey,
  });
  const emptySleep = computeSleepCoachingChronotypeReport({
    dailyLogs: [],
    hevyWorkouts: [],
    todayKey,
  });
  assert.equal(emptyVitals.hasLastNightData, false);
  assert.equal(emptyLoad.hasEnoughData, false);
  assert.equal(emptyEnergy.hasEnoughData, false);
  assert.equal(emptySleep.hasEnoughData, false);
  assert.equal(Number.isNaN(emptyEnergy.energyScore), false);
});
