import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  computeAcwrReport,
  computeDetailedMuscleRecovery,
  computeExerciseNextTarget,
  computeRunningStandards,
  computeStrengthStandards,
  computeSupplementCycleStatus,
  computeSupplementImpactAnalysis,
  formatTargetsForClipboard,
  getUniqueHevyRoutines,
} from './analysisPrep';
import { createInitialDiaryState, parseDiaryPayload } from './fitnessMath';

function makeWorkout(
  id: string,
  title: string,
  date: string,
  startIso: string,
  exercises: HevyWorkout['exercises'],
): HevyWorkout {
  const totalVolumeKg = exercises.reduce((s, e) => s + e.totalVolumeKg, 0);
  const maxWeightKg = Math.max(0, ...exercises.map((e) => e.maxWeightKg));
  const totalSets = exercises.reduce((s, e) => s + e.sets.length, 0);
  return {
    id,
    title,
    date,
    startTime: startIso,
    endTime: startIso,
    exercises,
    totalVolumeKg,
    maxWeightKg,
    totalSets,
    importedAt: '2026-11-18T10:00:00Z',
  };
}

test('computeDetailedMuscleRecovery tracks all 15 zones, hours elapsed, fatigue red/yellow/green, and recommendations', () => {
  const refMs = Date.UTC(2026, 10, 18, 12, 0, 0); // 2026-11-18T12:00:00Z
  const workouts: HevyWorkout[] = [
    makeWorkout('w-chest', 'Push A', '2026-11-18', '2026-11-18T00:00:00Z', [
      {
        title: 'Bench Press (Barbell)',
        sets: [
          { setIndex: 0, weightKg: 80, reps: 8, rpe: 8 },
          { setIndex: 1, weightKg: 80, reps: 8, rpe: 8 },
          { setIndex: 2, weightKg: 80, reps: 8, rpe: 8 },
        ],
        totalVolumeKg: 1920,
        maxWeightKg: 80,
      },
    ]),
    makeWorkout('w-back', 'Pull A', '2026-11-17', '2026-11-16T22:00:00Z', [
      {
        title: 'Lat Pulldown (Cable)',
        sets: [
          { setIndex: 0, weightKg: 70, reps: 10 },
          { setIndex: 1, weightKg: 70, reps: 10 },
        ],
        totalVolumeKg: 1400,
        maxWeightKg: 70,
      },
    ]),
  ];

  const items = computeDetailedMuscleRecovery(workouts, refMs);
  assert.equal(items.length, 15);

  const chest = items.find((i) => i.id === 'chest')!;
  assert.equal(chest.status, 'fatigued'); // 12h ago < 24h -> red
  assert.equal(chest.hoursSinceLast, 12);
  assert.match(chest.recommendation, /Изчакай още \d+ часа/);

  const triceps = items.find((i) => i.id === 'triceps')!; // secondary on bench -> 12h ago
  assert.equal(triceps.status, 'fatigued');

  const lats = items.find((i) => i.id === 'lats')!;
  assert.equal(lats.status, 'recovering'); // 38h ago -> 24-48h yellow
  assert.equal(lats.hoursSinceLast, 38);

  const quads = items.find((i) => i.id === 'quads')!;
  assert.equal(quads.status, 'recovered');
  assert.equal(quads.recommendation, 'Готов за тежка сесия');
});

test('computeAcwrReport combines Hevy strength load and dailyLogs cardio load into 4 zones and 28-day series', () => {
  const workouts: HevyWorkout[] = [
    // Heavy recent week (days -4, -2, 0) vs light prior weeks
    makeWorkout('w1', 'Push', '2026-11-14', '2026-11-14T10:00:00Z', [
      {
        title: 'Bench Press (Barbell)',
        sets: Array.from({ length: 8 }, (_, idx) => ({
          setIndex: idx,
          weightKg: 80,
          reps: 8,
          rpe: 9,
        })),
        totalVolumeKg: 5120,
        maxWeightKg: 80,
      },
    ]),
    makeWorkout('w2', 'Pull', '2026-11-16', '2026-11-16T10:00:00Z', [
      {
        title: 'Barbell Row',
        sets: Array.from({ length: 8 }, (_, idx) => ({
          setIndex: idx,
          weightKg: 70,
          reps: 8,
          rpe: 9,
        })),
        totalVolumeKg: 4480,
        maxWeightKg: 70,
      },
    ]),
    makeWorkout('w-old', 'Light', '2026-10-25', '2026-10-25T10:00:00Z', [
      {
        title: 'Squat',
        sets: [{ setIndex: 0, weightKg: 60, reps: 5, rpe: 6 }],
        totalVolumeKg: 300,
        maxWeightKg: 60,
      },
    ]),
  ];

  const dailyLogs: DailyBiometricLog[] = [
    {
      date: '2026-11-17',
      cardioDistanceKm: 8,
      cardioDurationMinutes: 45,
      completedHabits: [],
    },
  ];

  const report = computeAcwrReport(workouts, dailyLogs, '2026-11-18');
  assert.equal(report.dailySeries28d.length, 28);
  assert.ok(report.acuteLoad7d > 1000);
  assert.ok(report.chronicWeeklyAvg28d > 0);
  assert.ok(report.acwr !== null && report.acwr > 1.5);
  assert.equal(report.zone, 'high_risk');
  assert.ok(report.strengthSharePct > 0 && report.cardioSharePct > 0);
});

test('Beat the Log recommends +2.5kg when all working sets >= 8 reps and RPE < 9, otherwise +1 rep and target 1RM', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout('w1', 'Upper A', '2026-11-16', '2026-11-16T10:00:00Z', [
      {
        title: 'Incline Dumbbell Press',
        sets: [
          { setIndex: 0, weightKg: 20, reps: 8, rpe: 8 },
          { setIndex: 1, weightKg: 20, reps: 8, rpe: 8.5 },
          { setIndex: 2, weightKg: 20, reps: 8, rpe: 8.5 },
        ],
        totalVolumeKg: 480,
        maxWeightKg: 20,
      },
      {
        title: 'Squat (Barbell)',
        sets: [
          { setIndex: 0, weightKg: 100, reps: 7, rpe: 8.5 },
          { setIndex: 1, weightKg: 100, reps: 7, rpe: 9 },
          { setIndex: 2, weightKg: 100, reps: 7, rpe: 9 },
        ],
        totalVolumeKg: 2100,
        maxWeightKg: 100,
      },
    ]),
  ];

  const routines = getUniqueHevyRoutines(workouts);
  assert.equal(routines.length, 1);
  assert.equal(routines[0].title, 'Upper A');

  const pressTarget = computeExerciseNextTarget(
    workouts,
    'Incline Dumbbell Press',
  )!;
  assert.equal(pressTarget.strategy, 'increase_weight');
  assert.equal(pressTarget.targetWeightKg, 22.5);
  assert.match(pressTarget.lastLine, /3×8 с 20 kg/);
  assert.match(pressTarget.targetLine, /3×6–8 с 22\.5 kg/);

  const squatTarget = computeExerciseNextTarget(workouts, 'Squat (Barbell)')!;
  assert.equal(squatTarget.strategy, 'increase_reps');
  assert.equal(squatTarget.targetWeightKg, 100);
  assert.match(squatTarget.targetLine, /3×8 с 100 kg/);
  assert.ok(squatTarget.targetEstimated1RM > squatTarget.lastSummary.bestEstimated1RM);

  const clipboardText = formatTargetsForClipboard('Upper A', [
    pressTarget,
    squatTarget,
  ]);
  assert.match(clipboardText, /Цели за днес — Upper A/);
  assert.match(clipboardText, /22\.5 kg/);
});

test('computeStrengthStandards and computeRunningStandards compute relative BW + added kg, tiers, and remaining gaps', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout('w1', 'Full Body', '2026-11-15', '2026-11-15T10:00:00Z', [
      {
        title: 'Pull Up (Weighted)',
        sets: [{ setIndex: 0, weightKg: 15, reps: 6 }],
        totalVolumeKg: 90,
        maxWeightKg: 15,
      },
      {
        title: 'Bench Press (Barbell)',
        sets: [{ setIndex: 0, weightKg: 80, reps: 5 }],
        totalVolumeKg: 400,
        maxWeightKg: 80,
      },
    ]),
  ];

  const strength = computeStrengthStandards(workouts, 80);
  const pullup = strength.find((s) => s.id === 'pullup')!;
  assert.ok(pullup);
  // 80 + 15 = 95kg * (1 + 6/30) = 114kg Epley -> 114 / 80 = 1.43x BW (Напреднал, next Елит at 1.6*80=128)
  assert.equal(pullup.estimated1RM, 114);
  assert.equal(pullup.tier, 'advanced');
  assert.equal(pullup.kgRemainingToNext, 14);

  const bench = strength.find((s) => s.id === 'bench')!;
  assert.ok(bench);
  // 80 * (1 + 5/30) = 93.3kg -> 1.17x BW -> Среден (0.75-1.25), next Напреднал at 1.25*80=100 -> +6.7kg
  assert.equal(bench.tier, 'intermediate');
  assert.equal(bench.kgRemainingToNext, 6.7);

  const dailyLogs: DailyBiometricLog[] = [
    {
      date: '2026-11-14',
      cardioDistanceKm: 5,
      cardioDurationMinutes: 26, // 26:00 -> Среден (<= 30:00, > 25:00), 60 sec remaining to Напреднал
      completedHabits: [],
    },
  ];
  const running = computeRunningStandards(dailyLogs);
  const run5k = running.find((r) => r.distanceTargetKm === 5)!;
  assert.equal(run5k.tier, 'intermediate');
  assert.equal(run5k.estimatedTimeText, '26:00');
  assert.equal(run5k.secondsRemainingToNext, 60);
});

test('Supplement cycling computes phase badges, ON vs OFF percentage deltas, and persists via parseDiaryPayload', () => {
  const statusOn = computeSupplementCycleStatus(
    {
      name: 'Креатин',
      mode: 'cyclic',
      onWeeks: 8,
      offWeeks: 2,
      startDate: '2026-10-26',
    },
    '2026-11-18',
  );
  // 23 days elapsed -> Day 24 of 56
  assert.equal(statusOn.phase, 'on');
  assert.equal(statusOn.badgeText, 'Фаза прием: Ден 24/56');

  const statusOff = computeSupplementCycleStatus(
    {
      name: 'Креатин',
      mode: 'cyclic',
      onWeeks: 8,
      offWeeks: 2,
      startDate: '2026-09-19',
    },
    '2026-11-18',
  );
  // 60 days elapsed -> index 60 in 70-day cycle -> day 5 of 14 off
  assert.equal(statusOff.phase, 'off');
  assert.equal(statusOff.badgeText, 'Фаза почивка: Ден 5/14 — време за пауза');

  const dailyLogs: DailyBiometricLog[] = [
    {
      date: '2026-11-10',
      sleepQuality: 4,
      restingHr: 56,
      completedHabits: ['Креатин'],
    },
    {
      date: '2026-11-12',
      sleepQuality: 5,
      restingHr: 54,
      completedHabits: ['Креатин'],
    },
    {
      date: '2026-11-14',
      sleepQuality: 3,
      restingHr: 60,
      completedHabits: [],
    },
  ];

  const workouts: HevyWorkout[] = [
    makeWorkout('w1', 'Push', '2026-11-10', '2026-11-10T10:00:00Z', [
      {
        title: 'Bench Press',
        sets: [{ setIndex: 0, weightKg: 80, reps: 10 }],
        totalVolumeKg: 2200,
        maxWeightKg: 80,
      },
    ]),
    makeWorkout('w2', 'Push', '2026-11-14', '2026-11-14T10:00:00Z', [
      {
        title: 'Bench Press',
        sets: [{ setIndex: 0, weightKg: 75, reps: 8 }],
        totalVolumeKg: 1800,
        maxWeightKg: 75,
      },
    ]),
  ];

  const impact = computeSupplementImpactAnalysis({
    habitItems: ['Креатин'],
    supplementCycles: {
      Креатин: {
        name: 'Креатин',
        mode: 'cyclic',
        onWeeks: 8,
        offWeeks: 2,
        startDate: '2026-10-26',
      },
    },
    dailyLogs,
    hevyWorkouts: workouts,
    todayKey: '2026-11-18',
  });

  assert.equal(impact.length, 1);
  assert.equal(impact[0].sleepQuality.onAvg, 4.5);
  assert.equal(impact[0].sleepQuality.offAvg, 3);
  assert.equal(impact[0].sleepQuality.diffPercent, 50);
  assert.equal(impact[0].restingHr.onAvg, 55);
  assert.equal(impact[0].restingHr.offAvg, 60);

  // Verify round-trip persistence in parseDiaryPayload
  const initial = createInitialDiaryState();
  const payload = JSON.stringify({
    ...initial,
    analysisManualWeightKg: 81.5,
    supplementCycles: {
      Креатин: {
        name: 'Креатин',
        mode: 'cyclic',
        onWeeks: 8,
        offWeeks: 2,
        startDate: '2026-10-26',
      },
    },
  });
  const parsed = parseDiaryPayload(payload);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.analysisManualWeightKg, 81.5);
    assert.equal(parsed.state.supplementCycles?.['Креатин']?.mode, 'cyclic');
    assert.equal(parsed.state.supplementCycles?.['Креатин']?.onWeeks, 8);
  }
});

test('computeDetailedMuscleRecovery flags leg fatigue when >14,000 steps are logged in last 24h, and ACWR includes smartwatch steps & activeCalories', () => {
  const refMs = Date.UTC(2026, 10, 18, 12, 0, 0); // 2026-11-18T12:00:00Z
  const workouts: HevyWorkout[] = [
    makeWorkout('w-legs', 'Leg Day', '2026-11-16', '2026-11-16T10:00:00Z', [
      {
        title: 'Squat (Barbell)',
        sets: [
          { setIndex: 0, weightKg: 100, reps: 6, rpe: 8.5 },
          { setIndex: 1, weightKg: 100, reps: 6, rpe: 8.5 },
        ],
        totalVolumeKg: 1200,
        maxWeightKg: 100,
      },
    ]),
  ];

  // 50 hours since Squat -> normally recovered (>48h), but 16,500 steps in last 24h adds +12h buffer -> recovering!
  const highStepsLogs: DailyBiometricLog[] = [
    {
      date: '2026-11-18',
      steps: 16500,
      activeCalories: 950,
      completedHabits: [],
    },
  ];

  const normalRecovery = computeDetailedMuscleRecovery(workouts, refMs, []);
  assert.equal(normalRecovery.find((m) => m.id === 'quads')?.status, 'recovered');

  const fatiguedBySteps = computeDetailedMuscleRecovery(
    workouts,
    refMs,
    highStepsLogs,
  );
  const quads = fatiguedBySteps.find((m) => m.id === 'quads')!;
  assert.equal(quads.status, 'recovering');
  assert.match(quads.recommendation, /16\s?500/);

  // ACWR should reflect non-zero cardio/movement load from steps + activeCalories even without cardioDistanceKm
  const acwrWithWatch = computeAcwrReport([], highStepsLogs, '2026-11-18');
  assert.ok(acwrWithWatch.acuteLoad7d > 0);
  assert.equal(acwrWithWatch.cardioSharePct, 100);
});

