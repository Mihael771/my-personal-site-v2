import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  computeBodyBatteryReport,
  computeEnduranceAndHillScore,
  computeHrvStatusReport,
  computeTrainingLoadFocusAndDualStress,
} from './biometricPerformanceEngine';
import { shiftDateKey } from './fitnessMath';

const TODAY = '2026-11-22';

function makeLog(
  date: string,
  overrides: Partial<DailyBiometricLog> = {},
): DailyBiometricLog {
  return {
    date,
    completedHabits: [],
    ...overrides,
  };
}

function makeStrengthWorkout(
  id: string,
  date: string,
  setsPerExercise: number,
  weightKg = 100,
  reps = 5,
): HevyWorkout {
  const sets = Array.from({ length: setsPerExercise }, (_, idx) => ({
    setIndex: idx,
    setType: 'normal',
    weightKg,
    reps,
    rpe: 8.5,
  }));
  const vol = setsPerExercise * weightKg * reps;
  return {
    id,
    title: 'Силова тренировка Горна част',
    startTime: `${date}T17:00:00Z`,
    endTime: `${date}T18:10:00Z`,
    date,
    exercises: [
      { title: 'Bench Press (Barbell)', sets, totalVolumeKg: vol, maxWeightKg: weightKg },
      { title: 'Pull Up', sets, totalVolumeKg: vol, maxWeightKg: weightKg },
    ],
    totalVolumeKg: vol * 2,
    maxWeightKg: weightKg,
    totalSets: setsPerExercise * 2,
    importedAt: `${date}T19:00:00Z`,
  };
}

function makeBoxingWorkout(id: string, date: string, minutes = 60): HevyWorkout {
  const endHour = 18 + Math.floor(minutes / 60);
  const endMin = String(minutes % 60).padStart(2, '0');
  return {
    id,
    title: 'Бокс тренировка (чувал + спаринг)',
    startTime: `${date}T18:00:00Z`,
    endTime: `${date}T${String(endHour).padStart(2, '0')}:${endMin}:00Z`,
    date,
    exercises: [
      {
        title: 'Heavy Bag Rounds',
        sets: [{ setIndex: 0, setType: 'normal', durationSeconds: minutes * 60 }],
        totalVolumeKg: 0,
        maxWeightKg: 0,
      },
    ],
    totalVolumeKg: 0,
    maxWeightKg: 0,
    totalSets: 1,
    importedAt: `${date}T20:00:00Z`,
  };
}

test('Module 1 (Body Battery): high restorative sleep + low RHR + high HRV yields peak charge, drained by Hevy & watch activities', () => {
  const logs: DailyBiometricLog[] = [];
  // Build 20-day baseline: RHR 54, HRV 62
  for (let i = 20; i >= 2; i -= 1) {
    logs.push(
      makeLog(shiftDateKey(TODAY, -i), {
        sleepHours: 7.8,
        deepSleepSecs: 5400,
        remSleepSecs: 5400,
        restingHr: 54,
        hrv: 62,
        steps: 9000,
      }),
    );
  }
  // Yesterday night: super recovery (8.5h, 45% Deep+REM, RHR 50, HRV 74)
  logs.push(
    makeLog(shiftDateKey(TODAY, -1), {
      sleepHours: 8.5,
      deepSleepSecs: 7000,
      remSleepSecs: 6800,
      restingHr: 50,
      hrv: 74,
      steps: 7000,
    }),
  );

  const freshReport = computeBodyBatteryReport({
    dailyLogs: logs,
    hevyWorkouts: [],
    todayKey: TODAY,
  });

  assert.equal(freshReport.hasEnoughData, true);
  assert.equal(freshReport.series7d.length, 7);
  assert.ok(freshReport.currentCharge >= 80, `Expected >=80 fresh charge, got ${freshReport.currentCharge}`);
  assert.equal(freshReport.tier, 'peak');

  // Now add heavy Hevy session + mountain trail run on TODAY -> battery drains noticeably
  const drainedLogs = [
    ...logs,
    makeLog(TODAY, {
      sleepHours: 8.5,
      deepSleepSecs: 7000,
      remSleepSecs: 6800,
      restingHr: 50,
      hrv: 74,
      watchActivities: [
        {
          type: 'TrailRun',
          name: 'Витоша',
          distance: 10000,
          moving_time: 3600,
          total_elevation_gain: 650,
          average_heartrate: 158,
        },
      ],
    }),
  ];
  const drainedReport = computeBodyBatteryReport({
    dailyLogs: drainedLogs,
    hevyWorkouts: [makeStrengthWorkout('w-today', TODAY, 8, 110, 5)],
    todayKey: TODAY,
  });

  assert.ok(drainedReport.todayStrengthDrain > 0);
  assert.ok(drainedReport.todayWatchDrain > 0);
  assert.ok(
    drainedReport.currentCharge < freshReport.currentCharge - 25,
    `Expected significant drain (${drainedReport.currentCharge} vs ${freshReport.currentCharge})`,
  );
});

test('Module 2 (HRV Status): calibrates under 7 samples, then classifies Balanced vs Low Recovery accurately', () => {
  // Sparse: only 5 HRV entries -> Калибриране
  const sparseLogs = [1, 2, 3, 4, 5].map((i) =>
    makeLog(shiftDateKey(TODAY, -i), { hrv: 60 + i }),
  );
  const calibrating = computeHrvStatusReport({
    dailyLogs: sparseLogs,
    todayKey: TODAY,
  });
  assert.equal(calibrating.status, 'calibrating');
  assert.equal(calibrating.statusLabel, 'Калибриране');
  assert.equal(calibrating.samplesCount30d, 5);

  // Full 30 days stable around 65 ± 4 -> Балансиран
  const balancedLogs: DailyBiometricLog[] = [];
  for (let i = 1; i <= 30; i += 1) {
    balancedLogs.push(
      makeLog(shiftDateKey(TODAY, -i), { hrv: 63 + (i % 5) }),
    );
  }
  const balanced = computeHrvStatusReport({
    dailyLogs: balancedLogs,
    todayKey: TODAY,
  });
  assert.equal(balanced.status, 'balanced');
  assert.equal(balanced.statusLabel, 'Балансиран');
  assert.ok(balanced.corridorLow !== null && balanced.corridorHigh !== null);
  assert.ok(balanced.current7dAvg! >= balanced.corridorLow! && balanced.current7dAvg! <= balanced.corridorHigh!);

  // Drop last 7 days sharply to 44 ms -> Ниско възстановяване
  const fatiguedLogs = balancedLogs.map((l, idx) =>
    idx < 7 ? { ...l, hrv: 44 } : l,
  );
  const lowRec = computeHrvStatusReport({
    dailyLogs: fatiguedLogs,
    todayKey: TODAY,
  });
  assert.equal(lowRec.status, 'low_recovery');
  assert.equal(lowRec.statusLabel, 'Ниско възстановяване');
});

test('Module 3 (Training Load Focus + Dual Stress Meter): separates 3 zones and flags Muscular overload with fresh Cardio', () => {
  const logs: DailyBiometricLog[] = [
    // Low aerobic mountain hike 10 days ago (inside 28d, outside 7d)
    makeLog(shiftDateKey(TODAY, -10), {
      watchActivities: [
        {
          type: 'Hike',
          name: 'Черни връх',
          distance: 14000,
          moving_time: 10800,
          total_elevation_gain: 1100,
          average_heartrate: 128,
        },
      ],
    }),
  ];

  // Heavy strength workouts in last 7 days + boxing session 12 days ago
  const workouts: HevyWorkout[] = [
    makeStrengthWorkout('s1', shiftDateKey(TODAY, -1), 16, 120, 5),
    makeStrengthWorkout('s2', shiftDateKey(TODAY, -3), 16, 115, 5),
    makeStrengthWorkout('s3', shiftDateKey(TODAY, -5), 14, 110, 6),
    makeBoxingWorkout('bx1', shiftDateKey(TODAY, -12), 75),
  ];

  const report = computeTrainingLoadFocusAndDualStress({
    dailyLogs: logs,
    hevyWorkouts: workouts,
    todayKey: TODAY,
  });

  assert.equal(report.hasLoadData, true);
  assert.equal(report.zones.length, 3);
  const lowZone = report.zones.find((z) => z.id === 'low_aerobic')!;
  const highZone = report.zones.find((z) => z.id === 'high_aerobic')!;
  const anaZone = report.zones.find((z) => z.id === 'anaerobic')!;
  assert.ok(lowZone.loadPoints > 0);
  assert.ok(highZone.loadPoints > 0);
  assert.ok(anaZone.loadPoints > 0);
  assert.equal(lowZone.sharePct + highZone.sharePct + anaZone.sharePct, 100);

  // Dual stress in last 7d: heavy muscular load, zero cardio -> muscular_high_cardio_fresh
  assert.ok(report.dualStress.muscularScore >= 65);
  assert.equal(report.dualStress.cardioScore, 0);
  assert.equal(report.dualStress.divergenceType, 'muscular_high_cardio_fresh');
});

test('Module 4 (Endurance & Hill Score): computes 0-100 index and positive trend vs previous month', () => {
  const logs: DailyBiometricLog[] = [
    // Previous 30d window (days -35 and -42): modest activity
    makeLog(shiftDateKey(TODAY, -35), {
      watchActivities: [
        {
          type: 'Hike',
          name: 'Къс преход',
          distance: 6000,
          moving_time: 4200,
          total_elevation_gain: 350,
          average_heartrate: 138,
        },
      ],
    }),
    // Current 30d window: strong mountain & running volume + high EF
    makeLog(shiftDateKey(TODAY, -3), {
      watchActivities: [
        {
          type: 'TrailRun',
          name: 'Планинско бягане',
          distance: 18000,
          moving_time: 6600,
          total_elevation_gain: 1150,
          average_heartrate: 152,
        },
      ],
    }),
    makeLog(shiftDateKey(TODAY, -9), {
      watchActivities: [
        {
          type: 'Hike',
          name: 'Рила преход',
          distance: 22000,
          moving_time: 14400,
          total_elevation_gain: 1600,
          average_heartrate: 132,
        },
      ],
    }),
    makeLog(shiftDateKey(TODAY, -16), {
      watchActivities: [
        {
          type: 'Run',
          name: 'Темпово бягане',
          distance: 12000,
          moving_time: 3420,
          total_elevation_gain: 180,
          average_heartrate: 155,
        },
      ],
    }),
  ];

  const report = computeEnduranceAndHillScore({
    dailyLogs: logs,
    todayKey: TODAY,
  });

  assert.ok(report.score > report.previous30d.score);
  assert.equal(report.trendDirection, 'up');
  assert.ok(report.trendDelta !== null && report.trendDelta > 0);
  assert.ok(report.current30d.elevationGainM >= 2900);
  assert.ok(report.current30d.avgEfficiencyFactor !== null);
});

test('Zero-NaN resilience: empty arrays and corrupt NaN/Infinity fields never produce NaN across all 4 modules', () => {
  const corruptLogs: DailyBiometricLog[] = [
    makeLog(shiftDateKey(TODAY, -1), {
      sleepHours: Number.NaN,
      deepSleepSecs: Number.POSITIVE_INFINITY,
      restingHr: Number.NaN,
      hrv: Number.NaN,
      steps: -500,
      watchActivities: [
        {
          type: 'Hike',
          name: 'Коруптиран запис',
          distance: Number.NaN,
          moving_time: -10,
          total_elevation_gain: Number.NaN,
          average_heartrate: 0,
        },
      ],
    }),
  ];

  const bb = computeBodyBatteryReport({
    dailyLogs: corruptLogs,
    hevyWorkouts: [],
    todayKey: TODAY,
  });
  const hrv = computeHrvStatusReport({
    dailyLogs: corruptLogs,
    todayKey: TODAY,
  });
  const load = computeTrainingLoadFocusAndDualStress({
    dailyLogs: corruptLogs,
    hevyWorkouts: [],
    todayKey: TODAY,
  });
  const eh = computeEnduranceAndHillScore({
    dailyLogs: corruptLogs,
    todayKey: TODAY,
  });

  assert.equal(Number.isFinite(bb.currentCharge), true);
  assert.equal(hrv.status, 'calibrating');
  assert.equal(Number.isFinite(load.totalLoad28d), true);
  assert.equal(Number.isFinite(load.dualStress.muscularScore), true);
  assert.equal(Number.isFinite(load.dualStress.cardioScore), true);
  assert.equal(Number.isFinite(eh.score), true);
});
