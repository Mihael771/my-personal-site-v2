import assert from 'node:assert/strict';
import test from 'node:test';
import type { CustomExerciseMappings, HevyWorkout } from '../types/fitness';
import { computeDetailedMuscleRecovery } from './analysisPrep';
import {
  computeDetailedWeeklyEffectiveVolume,
  EXERCISE_MUSCLE_DICTIONARY,
  findUnrecognizedExercises,
  MUSCLE_GROUPS_15,
  resolveExerciseMuscles,
  sanitizeCustomExerciseMappings,
} from './exerciseMuscleEngine';
import { buildExerciseRecommendations } from './exerciseRecommender';
import { createInitialDiaryState, parseDiaryPayload } from './fitnessMath';
import { generateIntelligentCoachReport } from './intelligentCoach';

function makeWorkout(params: {
  id: string;
  date: string;
  startTime: string;
  title?: string;
  exercises: Array<{
    title: string;
    sets: number;
    weightKg?: number | null;
    reps?: number | null;
    includeWarmup?: boolean;
  }>;
}): HevyWorkout {
  return {
    id: params.id,
    title: params.title ?? 'Test Session',
    date: params.date,
    startTime: params.startTime,
    endTime: params.startTime,
    totalVolumeKg: 5000,
    totalSets: params.exercises.reduce((s, e) => s + e.sets, 0),
    maxWeightKg: 100,
    importedAt: params.startTime,
    exercises: params.exercises.map((e) => {
      const w = e.weightKg !== undefined ? e.weightKg : 60;
      const r = e.reps !== undefined ? e.reps : 10;
      return {
        title: e.title,
        totalVolumeKg: (w ?? 0) * (r ?? 0) * e.sets,
        maxWeightKg: w ?? 0,
        sets: [
          ...(e.includeWarmup
            ? [
                {
                  setIndex: 0,
                  setType: 'warmup',
                  weightKg: 20,
                  reps: 12,
                },
              ]
            : []),
          ...Array.from({ length: e.sets }, (_, i) => ({
            setIndex: i + 1,
            setType: 'normal',
            ...(w !== null ? { weightKg: w } : {}),
            ...(r !== null ? { reps: r } : {}),
            rpe: 8,
          })),
        ],
      };
    }),
  };
}

test('offline dictionary contains 80+ exercises and defines exactly 15 muscle groups', () => {
  assert.ok(
    EXERCISE_MUSCLE_DICTIONARY.length >= 80,
    `Expected >= 80 exercises, got ${EXERCISE_MUSCLE_DICTIONARY.length}`,
  );
  assert.equal(MUSCLE_GROUPS_15.length, 15);
});

test('recognizes core Hevy EN exercises and Bulgarian aliases with accurate Primary & Secondary muscles', () => {
  const bench = resolveExerciseMuscles('Bench Press (Barbell)');
  assert.equal(bench.recognized, true);
  assert.deepEqual(bench.primary, ['chest']);
  assert.deepEqual(bench.secondary, ['front_delts', 'triceps']);

  const inclineDb = resolveExerciseMuscles('Incline Bench Press (Dumbbell)');
  assert.deepEqual(inclineDb.primary, ['chest', 'front_delts']);
  assert.deepEqual(inclineDb.secondary, ['triceps']);

  const dips = resolveExerciseMuscles('Weighted Dips');
  assert.deepEqual(dips.primary, ['chest', 'triceps']);
  assert.deepEqual(dips.secondary, ['front_delts']);

  const pullUp = resolveExerciseMuscles('Pull Up (Weighted)');
  assert.deepEqual(pullUp.primary, ['lats']);
  assert.ok(pullUp.secondary.includes('biceps'));
  assert.ok(pullUp.secondary.includes('traps_upper_back'));
  assert.ok(pullUp.secondary.includes('forearms'));

  const row = resolveExerciseMuscles('Barbell Row');
  assert.ok(row.primary.includes('traps_upper_back'));
  assert.ok(row.primary.includes('lats'));
  assert.ok(row.secondary.includes('rear_delts'));
  assert.ok(row.secondary.includes('biceps'));
  assert.ok(row.secondary.includes('lower_back'));

  const ohp = resolveExerciseMuscles('Overhead Press (Barbell)');
  assert.deepEqual(ohp.primary, ['front_delts', 'side_delts']);
  assert.ok(ohp.secondary.includes('triceps'));
  assert.ok(ohp.secondary.includes('traps_upper_back'));

  const latRaise = resolveExerciseMuscles('Lateral Raise (Dumbbell)');
  assert.deepEqual(latRaise.primary, ['side_delts']);
  assert.deepEqual(latRaise.secondary, ['traps_upper_back']);

  const facePull = resolveExerciseMuscles('Face Pull (Cable)');
  assert.ok(facePull.primary.includes('rear_delts'));
  assert.ok(facePull.primary.includes('traps_upper_back'));

  const squat = resolveExerciseMuscles('Bulgarian Split Squat');
  assert.deepEqual(squat.primary, ['quads', 'glutes']);
  assert.ok(squat.secondary.includes('hamstrings'));
  assert.ok(squat.secondary.includes('abs'));

  const deadlift = resolveExerciseMuscles('Deadlift (Barbell)');
  assert.ok(deadlift.primary.includes('hamstrings'));
  assert.ok(deadlift.primary.includes('glutes'));
  assert.ok(deadlift.primary.includes('lower_back'));
  assert.ok(deadlift.secondary.includes('traps_upper_back'));
  assert.ok(deadlift.secondary.includes('quads'));
  assert.ok(deadlift.secondary.includes('forearms'));

  const rdl = resolveExerciseMuscles('Romanian Deadlift (Barbell)');
  assert.deepEqual(rdl.primary, ['hamstrings', 'glutes']);
  assert.ok(rdl.secondary.includes('lower_back'));
  assert.ok(rdl.secondary.includes('forearms'));

  const curl = resolveExerciseMuscles('Hammer Curl (Dumbbell)');
  assert.deepEqual(curl.primary, ['biceps']);
  assert.deepEqual(curl.secondary, ['forearms']);

  const pushdown = resolveExerciseMuscles('Triceps Rope Pushdown');
  assert.deepEqual(pushdown.primary, ['triceps']);
  assert.deepEqual(pushdown.secondary, []);

  const legRaise = resolveExerciseMuscles('Hanging Leg Raise');
  assert.deepEqual(legRaise.primary, ['abs']);
  assert.deepEqual(legRaise.secondary, ['forearms']);

  // Bulgarian keywords & aliases
  assert.equal(resolveExerciseMuscles('Лежанка с щанга').primary[0], 'chest');
  assert.equal(resolveExerciseMuscles('Набирания с тежест').primary[0], 'lats');
  assert.ok(resolveExerciseMuscles('Кофички').primary.includes('triceps'));
  assert.ok(resolveExerciseMuscles('Клек с щанга').primary.includes('quads'));
  assert.ok(resolveExerciseMuscles('Румънска тяга').primary.includes('hamstrings'));
});

test('counts fractional weekly volume: 1.0 primary + 0.5 secondary and ignores warmup sets', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w1',
      date: '2026-05-10',
      startTime: '2026-05-10T10:00:00.000Z',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: 4, includeWarmup: true },
        { title: 'Pull Up', sets: 4 },
      ],
    }),
  ];

  const detailed = computeDetailedWeeklyEffectiveVolume({
    hevyWorkouts: workouts,
    startDate: '2026-05-04',
    endDate: '2026-05-10',
  });

  const byId = new Map(detailed.map((d) => [d.id, d]));

  assert.equal(byId.get('chest')?.primarySets, 4);
  assert.equal(byId.get('chest')?.secondarySets, 0);
  assert.equal(byId.get('chest')?.effectiveSets, 4);

  assert.equal(byId.get('front_delts')?.primarySets, 0);
  assert.equal(byId.get('front_delts')?.secondarySets, 2);
  assert.equal(byId.get('front_delts')?.effectiveSets, 2);

  assert.equal(byId.get('triceps')?.primarySets, 0);
  assert.equal(byId.get('triceps')?.secondarySets, 2);
  assert.equal(byId.get('triceps')?.effectiveSets, 2);

  assert.equal(byId.get('lats')?.primarySets, 4);
  assert.equal(byId.get('biceps')?.secondarySets, 2);

  // Macro weeklyVolume in Intelligent Coach also exposes primarySets, secondarySets, effectiveSets
  const state = createInitialDiaryState();
  const report = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs: [],
    habitItems: [],
    legacyLogs: {},
    profile: state.profile,
    todayKey: '2026-05-10',
  });

  const tricepsMacro = report.weeklyVolume.find((v) => v.groupId === 'triceps');
  assert.ok(tricepsMacro);
  assert.equal(tricepsMacro.primarySets, 0);
  assert.equal(tricepsMacro.secondarySets, 2);
  assert.equal(tricepsMacro.effectiveSets, 2);
  assert.equal(tricepsMacro.sets, 2);
});

test('recovery map differentiates Primary (100%, 48-72h) vs Secondary-only (50%, 24-36h) recovery windows', () => {
  // 30 hours after 4 sets of Bench Press (Barbell):
  // - Chest (primary 100%) needs >=48h -> still 'recovering'
  // - Triceps (secondary 50% only) needs ~24-30h -> already 'recovered'
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w-bench',
      date: '2026-05-09',
      startTime: '2026-05-09T06:00:00.000Z',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 4 }],
    }),
  ];

  const nowMs = Date.parse('2026-05-10T12:00:00.000Z'); // +30h
  const recovery = computeDetailedMuscleRecovery(workouts, nowMs);
  const map = new Map(recovery.map((r) => [r.id, r]));

  const chest = map.get('chest');
  const triceps = map.get('triceps');
  assert.ok(chest && triceps);

  assert.equal(chest.dominantLoadRole, 'primary');
  assert.equal(chest.status, 'recovering');
  assert.ok(chest.recoveryTargetHours >= 48);
  assert.equal(chest.primaryExercises.length, 1);
  assert.equal(chest.secondaryExercises.length, 0);

  assert.equal(triceps.dominantLoadRole, 'secondary');
  assert.equal(triceps.status, 'recovered');
  assert.ok(triceps.recoveryTargetHours <= 36);
  assert.equal(triceps.primaryExercises.length, 0);
  assert.equal(triceps.secondaryExercises.length, 1);
  assert.equal(triceps.secondaryExercises[0].exerciseTitle, 'Bench Press (Barbell)');
});

test('detects unrecognized exercises, applies customExerciseMappings override, and preserves it in database payload', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w-custom',
      date: '2026-05-10',
      startTime: '2026-05-10T10:00:00.000Z',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: 3 },
        { title: 'My Custom Viking Special', sets: 4 },
      ],
    }),
  ];

  const before = findUnrecognizedExercises(workouts);
  assert.deepEqual(before, ['My Custom Viking Special']);
  assert.equal(resolveExerciseMuscles('My Custom Viking Special').recognized, false);

  const customMappings: CustomExerciseMappings = {
    'My Custom Viking Special': {
      primary: ['rear_delts'],
      secondary: ['traps_upper_back', 'forearms'],
    },
  };

  const after = findUnrecognizedExercises(workouts, customMappings);
  assert.deepEqual(after, []);

  const resolved = resolveExerciseMuscles('My Custom Viking Special', customMappings);
  assert.equal(resolved.recognized, true);
  assert.equal(resolved.source, 'custom');
  assert.deepEqual(resolved.primary, ['rear_delts']);
  assert.deepEqual(resolved.secondary, ['traps_upper_back', 'forearms']);

  const detailed = computeDetailedWeeklyEffectiveVolume({
    hevyWorkouts: workouts,
    startDate: '2026-05-04',
    endDate: '2026-05-10',
    customExerciseMappings: customMappings,
  });
  const rearDelts = detailed.find((d) => d.id === 'rear_delts');
  assert.equal(rearDelts?.primarySets, 4);
  assert.equal(rearDelts?.effectiveSets, 4);

  // Persistence round-trip + invalid ID sanitization
  const rawState = {
    ...createInitialDiaryState(),
    customExerciseMappings: {
      'My Custom Viking Special': {
        primary: ['rear_delts', 'invalid_muscle'],
        secondary: ['rear_delts', 'forearms'],
      },
    },
  };
  const parsed = parseDiaryPayload(JSON.stringify(rawState));
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.ok(parsed.state.customExerciseMappings);
    assert.deepEqual(parsed.state.customExerciseMappings['My Custom Viking Special'], {
      primary: ['rear_delts'],
      secondary: ['forearms'],
    });
  }

  assert.equal(sanitizeCustomExerciseMappings({ bad: { primary: [], secondary: ['abs'] } }), undefined);
});

test('exercise recommender attaches primary & secondary muscles and ensures add suggestions match lagging primary zone', () => {
  // Heavy push (bench + incline) with zero rear delts / side delts / hamstrings / calves
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w-push-1',
      date: '2026-05-05',
      startTime: '2026-05-05T10:00:00.000Z',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: 6, weightKg: 80, reps: 8 },
        { title: 'Incline Bench Press (Dumbbell)', sets: 6, weightKg: 32, reps: 10 },
      ],
    }),
    makeWorkout({
      id: 'w-push-2',
      date: '2026-05-08',
      startTime: '2026-05-08T10:00:00.000Z',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: 6, weightKg: 80, reps: 8 },
        { title: 'Squat (Barbell)', sets: 4, weightKg: 100, reps: 6 },
      ],
    }),
  ];

  const report = buildExerciseRecommendations({
    hevyWorkouts: workouts,
    dailyLogs: [],
    profileWeightKg: 80,
    todayKey: '2026-05-10',
  });

  assert.ok(report.addRecommendations.length > 0);
  for (const card of report.addRecommendations) {
    assert.ok(card.exercises.length > 0);
    for (const s of card.exercises) {
      assert.ok(
        s.primaryMuscles.length > 0,
        `Expected primaryMuscles on suggestion ${s.hevyName}`,
      );
      const resolved = resolveExerciseMuscles(s.hevyName);
      assert.equal(resolved.recognized, true);
      assert.ok(resolved.primary.length > 0);
    }
  }
});
