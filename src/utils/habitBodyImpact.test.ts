import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  STRENGTH_INDEX_OPTION,
  buildHabitBodyImpactDataset,
  classifyHabitPolarity,
  getHabitImpactExerciseOptions,
} from './habitBodyImpact';

function makeWorkout(
  id: string,
  title: string,
  date: string,
  exercises: Array<{ title: string; weightKg: number; reps: number; rpe?: number }>,
): HevyWorkout {
  const mapped = exercises.map((ex) => ({
    title: ex.title,
    sets: [
      {
        setIndex: 0,
        setType: 'normal',
        weightKg: ex.weightKg,
        reps: ex.reps,
        ...(ex.rpe !== undefined ? { rpe: ex.rpe } : {}),
      },
    ],
    totalVolumeKg: ex.weightKg * ex.reps,
    maxWeightKg: ex.weightKg,
  }));

  return {
    id,
    title,
    startTime: `${date}T18:00:00`,
    date,
    exercises: mapped,
    totalVolumeKg: mapped.reduce((s, e) => s + e.totalVolumeKg, 0),
    maxWeightKg: Math.max(...mapped.map((e) => e.maxWeightKg), 0),
    totalSets: mapped.length,
    importedAt: `${date}T19:00:00Z`,
  };
}

test('classifyHabitPolarity distinguishes harmful habits from positive habits and negated forms', () => {
  assert.equal(classifyHabitPolarity('Алкохол'), 'harmful');
  assert.equal(classifyHabitPolarity('Никотин'), 'harmful');
  assert.equal(classifyHabitPolarity('Късно лягане'), 'harmful');
  assert.equal(classifyHabitPolarity('Джънк'), 'harmful');
  assert.equal(classifyHabitPolarity('Висок стрес'), 'harmful');

  // Negated forms and positive habits must be beneficial
  assert.equal(classifyHabitPolarity('Без захар / джънк'), 'beneficial');
  assert.equal(classifyHabitPolarity('Без алкохол'), 'beneficial');
  assert.equal(classifyHabitPolarity('Креатин'), 'beneficial');
  assert.equal(classifyHabitPolarity('2.5+ л вода'), 'beneficial');
  assert.equal(classifyHabitPolarity('Разтягане / Мобилност'), 'beneficial');
});

test('buildHabitBodyImpactDataset aligns 30 days, flags next-day hangover impact, computes 1RM & strength index, and produces A/B comparison', () => {
  const cleanFour = [
    'Креатин',
    '2.5+ л вода',
    'Разтягане / Мобилност',
    'Без захар / джънк',
  ];

  const dailyLogs: DailyBiometricLog[] = [
    // Clean days: Nov 10, Nov 11 -> next days Nov 11, Nov 12 are "after clean"
    { date: '2026-11-10', restingHr: 54, sleepHours: 8.0, sleepQuality: 5, completedHabits: cleanFour },
    { date: '2026-11-11', restingHr: 53, sleepHours: 8.2, sleepQuality: 5, completedHabits: cleanFour },
    { date: '2026-11-12', restingHr: 55, sleepHours: 7.8, sleepQuality: 4, completedHabits: cleanFour },
    // Harmful evening on Nov 14 & Nov 16 -> next mornings Nov 15 & Nov 17 are "after harmful"
    { date: '2026-11-14', restingHr: 56, sleepHours: 7.5, sleepQuality: 4, completedHabits: ['Креатин', 'Алкохол', 'Късно лягане'] },
    { date: '2026-11-15', restingHr: 61, sleepHours: 6.2, sleepQuality: 2, completedHabits: cleanFour },
    { date: '2026-11-16', restingHr: 55, sleepHours: 7.8, sleepQuality: 4, completedHabits: ['Джънк', 'Висок стрес'] },
    { date: '2026-11-17', restingHr: 60, sleepHours: 6.4, sleepQuality: 2, completedHabits: ['Креатин'] },
  ];

  const hevyWorkouts: HevyWorkout[] = [
    // After clean days (Nov 11, Nov 12): stronger Bench 100x5 (e1RM = 116.7), RPE 8
    makeWorkout('w1', 'Push 1', '2026-11-11', [
      { title: 'Bench Press (Barbell)', weightKg: 100, reps: 5, rpe: 8 },
    ]),
    makeWorkout('w2', 'Push 2', '2026-11-12', [
      { title: 'Bench Press (Barbell)', weightKg: 100, reps: 5, rpe: 8 },
    ]),
    // After harmful days (Nov 15, Nov 17): weaker Bench 90x5 (e1RM = 105), RPE 9
    makeWorkout('w3', 'Push 3', '2026-11-15', [
      { title: 'Bench Press (Barbell)', weightKg: 90, reps: 5, rpe: 9 },
    ]),
    makeWorkout('w4', 'Push 4', '2026-11-17', [
      { title: 'Bench Press (Barbell)', weightKg: 90, reps: 5, rpe: 9.5 },
    ]),
  ];

  const exerciseOpts = getHabitImpactExerciseOptions(hevyWorkouts);
  assert.equal(exerciseOpts.defaultSelection, 'Bench Press (Barbell)');

  const dataset = buildHabitBodyImpactDataset({
    dailyLogs,
    hevyWorkouts,
    habitItems: [...cleanFour, 'Алкохол', 'Късно лягане', 'Джънк', 'Висок стрес'],
    todayKey: '2026-11-18',
    selectedExercise: exerciseOpts.defaultSelection,
  });

  assert.equal(dataset.days.length, 30);
  assert.equal(dataset.harmfulDaysCount30d, 2);

  // Nov 14 has harmful habits; Nov 15 is marked isAfterHarmfulDay with prevDayHarmfulHabits
  const nov14 = dataset.days.find((d) => d.date === '2026-11-14')!;
  const nov15 = dataset.days.find((d) => d.date === '2026-11-15')!;
  assert.equal(nov14.hasHarmfulToday, true);
  assert.equal(nov15.isAfterHarmfulDay, true);
  assert.deepEqual(nov15.prevDayHarmfulHabits, ['Алкохол', 'Късно лягане']);
  assert.equal(nov15.strengthTrackValue, 105);
  assert.ok(nov15.restingHrDelta !== null && nov15.restingHrDelta > 0);

  // A/B comparison checks
  const ab = dataset.abComparison;
  assert.equal(ab.harmfulSampleDays, 2); // Nov 15 & Nov 17
  assert.ok(ab.cleanSampleDays >= 2); // Nov 11, Nov 12, Nov 13, Nov 16
  assert.ok(ab.restingHr.diffBpm !== null && ab.restingHr.diffBpm > 4);
  assert.ok(ab.sleepHours.diffHours !== null && ab.sleepHours.diffHours < -1);
  assert.ok(ab.strength.diffPct !== null && ab.strength.diffPct < -5);
  assert.ok(ab.strength.diffRpe !== null && ab.strength.diffRpe > 0.5);
  assert.ok(ab.summaryHeadline?.includes('След вреден навик:'));
  assert.ok(ab.summaryHeadline?.includes('Пулс +'));
  assert.ok(ab.summaryHeadline?.includes('Сън -'));
  assert.ok(ab.summaryHeadline?.includes('Сила -'));

  // Strength Index (%) mode produces percentage values around 100%
  const indexDataset = buildHabitBodyImpactDataset({
    dailyLogs,
    hevyWorkouts,
    todayKey: '2026-11-18',
    selectedExercise: STRENGTH_INDEX_OPTION,
  });
  assert.equal(indexDataset.isStrengthIndexMode, true);
  assert.equal(indexDataset.strengthUnit, '%');
  const nov11Idx = indexDataset.days.find((d) => d.date === '2026-11-11')!;
  const nov15Idx = indexDataset.days.find((d) => d.date === '2026-11-15')!;
  assert.ok((nov11Idx.strengthTrackValue ?? 0) > 100);
  assert.ok((nov15Idx.strengthTrackValue ?? 0) < 100);
});
