import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeHevyStats,
  extractUniqueHevyExercises,
  filterHevyWorkouts,
  mergeHevyWorkoutsWithoutDuplicates,
  parseHevyCsv,
} from './hevyParser';
import { parseDiaryPayload } from './fitnessMath';

const SAMPLE_HEVY_CSV = `title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Push Day","17 Nov 2026, 18:10","17 Nov 2026, 19:05","Heavy chest focus","Bench Press (Barbell)",,"Pause at bottom",0,warmup,40,10,,,
"Push Day","17 Nov 2026, 18:10","17 Nov 2026, 19:05","Heavy chest focus","Bench Press (Barbell)",,"",1,normal,80,8,,,8.5
"Push Day","17 Nov 2026, 18:10","17 Nov 2026, 19:05","Heavy chest focus","Bench Press (Barbell)",,"",2,normal,90,5,,,9
"Push Day","17 Nov 2026, 18:10","17 Nov 2026, 19:05","Heavy chest focus","Incline Dumbbell Press",,,0,normal,30,10,,,8
"Pull Day","15 Nov 2026, 17:00","15 Nov 2026, 17:50","","Barbell Row",,,0,normal,70,8,,,8
"Pull Day","15 Nov 2026, 17:00","15 Nov 2026, 17:50","","Barbell Row",,,1,normal,75,6,,,8.5`;

test('parseHevyCsv parses quoted Hevy timestamps, groups sets by workout and exercise, and calculates volume and max weight', () => {
  const result = parseHevyCsv(SAMPLE_HEVY_CSV, '2026-11-18T12:00:00.000Z');
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.rowCount, 6);
  assert.equal(result.workouts.length, 2);

  // Sorted newest first: Push Day (17 Nov) then Pull Day (15 Nov)
  const push = result.workouts[0];
  assert.equal(push.title, 'Push Day');
  assert.equal(push.date, '2026-11-17');
  assert.equal(push.exercises.length, 2);
  assert.equal(push.exercises[0].title, 'Bench Press (Barbell)');
  assert.equal(push.exercises[0].sets.length, 3);
  // Bench volume: 40*10 + 80*8 + 90*5 = 400 + 640 + 450 = 1490
  assert.equal(push.exercises[0].totalVolumeKg, 1490);
  assert.equal(push.exercises[0].maxWeightKg, 90);
  // Push total volume: 1490 + 30*10 = 1790
  assert.equal(push.totalVolumeKg, 1790);
  assert.equal(push.maxWeightKg, 90);
  assert.equal(push.totalSets, 4);

  const pull = result.workouts[1];
  assert.equal(pull.title, 'Pull Day');
  assert.equal(pull.date, '2026-11-15');
  // 70*8 + 75*6 = 560 + 450 = 1010
  assert.equal(pull.totalVolumeKg, 1010);
  assert.equal(pull.maxWeightKg, 75);
});

test('mergeHevyWorkoutsWithoutDuplicates skips existing workouts matching start_time and title', () => {
  const first = parseHevyCsv(SAMPLE_HEVY_CSV, '2026-11-18T12:00:00.000Z');
  assert.equal(first.ok, true);
  if (!first.ok) return;

  const newerCsv = `title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Push Day","17 Nov 2026, 18:10","17 Nov 2026, 19:05","Bench Press (Barbell)",0,normal,90,5,,,9
"Leg Day","18 Nov 2026, 10:00","18 Nov 2026, 10:55","Squat (Barbell)",0,normal,120,5,,,8.5`;

  const second = parseHevyCsv(newerCsv, '2026-11-18T13:00:00.000Z');
  assert.equal(second.ok, true);
  if (!second.ok) return;

  const merged = mergeHevyWorkoutsWithoutDuplicates(first.workouts, second.workouts);
  assert.equal(merged.addedWorkouts.length, 1);
  assert.equal(merged.addedWorkouts[0].title, 'Leg Day');
  assert.equal(merged.skippedDuplicatesCount, 1);
  assert.equal(merged.mergedWorkouts.length, 3);
  assert.equal(merged.mergedWorkouts[0].title, 'Leg Day');
});

test('filterHevyWorkouts and computeHevyStats scope volume, max weight, and workout count by selected exercise', () => {
  const parsed = parseHevyCsv(SAMPLE_HEVY_CSV);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const uniqueExercises = extractUniqueHevyExercises(parsed.workouts);
  assert.equal(uniqueExercises.length, 3);

  const benchOnly = filterHevyWorkouts(parsed.workouts, 'Bench Press (Barbell)');
  assert.equal(benchOnly.length, 1);
  const benchStats = computeHevyStats(benchOnly);
  assert.equal(benchStats.workoutCount, 1);
  assert.equal(benchStats.totalVolumeKg, 1490);
  assert.equal(benchStats.maxWeightKg, 90);
  assert.equal(benchStats.totalSets, 3);
});

test('parseDiaryPayload preserves hevyWorkouts alongside profile, logs, and goals', () => {
  const parsedCsv = parseHevyCsv(SAMPLE_HEVY_CSV);
  assert.equal(parsedCsv.ok, true);
  if (!parsedCsv.ok) return;

  const rawJson = JSON.stringify({
    profile: { name: 'Иван', heightCm: 180, weightKg: 82 },
    themeAccent: 'green',
    dailyMuscleGainGrams: 20,
    logs: {
      '2026-11-17': { date: '2026-11-17', sleepHours: 8, muscles: ['chest'] },
    },
    goals: [],
    hevyWorkouts: parsedCsv.workouts,
  });

  const roundTrip = parseDiaryPayload(rawJson);
  assert.equal(roundTrip.ok, true);
  if (!roundTrip.ok) return;

  assert.equal(roundTrip.state.profile.name, 'Иван');
  assert.equal(roundTrip.state.dailyMuscleGainGrams, 20);
  assert.ok(roundTrip.state.logs['2026-11-17']);
  assert.equal(roundTrip.state.hevyWorkouts?.length, 2);
  assert.equal(roundTrip.state.hevyWorkouts?.[0].title, 'Push Day');
});
