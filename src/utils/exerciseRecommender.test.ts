import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout, UserProfile } from '../types/fitness';
import {
  COACH_QUICK_QUESTIONS,
  answerCoachQuestion,
  computeAiReadinessScore,
  detectCoachQuestionIntent,
} from './coachMiniAi';
import {
  EXERCISE_CATALOG,
  buildExerciseRecommendations,
} from './exerciseRecommender';
import { generateIntelligentCoachReport } from './intelligentCoach';

function makeWorkout(
  id: string,
  date: string,
  exercises: Array<{ title: string; sets: number; weightKg: number; reps: number }>,
): HevyWorkout {
  const mapped = exercises.map((e) => {
    const sets = Array.from({ length: e.sets }, (_, i) => ({
      setIndex: i,
      setType: 'normal',
      weightKg: e.weightKg,
      reps: e.reps,
    }));
    return {
      title: e.title,
      sets,
      totalVolumeKg: e.sets * e.weightKg * e.reps,
      maxWeightKg: e.weightKg,
    };
  });
  return {
    id,
    title: 'Session',
    startTime: `${date}T10:00:00`,
    date,
    exercises: mapped,
    totalVolumeKg: mapped.reduce((s, e) => s + e.totalVolumeKg, 0),
    maxWeightKg: Math.max(0, ...mapped.map((e) => e.maxWeightKg)),
    totalSets: mapped.reduce((s, e) => s + e.sets.length, 0),
    importedAt: `${date}T12:00:00Z`,
  };
}

test('EXERCISE_CATALOG contains all 29 structured exercises across all 8 subgroups', () => {
  assert.equal(EXERCISE_CATALOG.length, 29);
  const subgroups = new Set(EXERCISE_CATALOG.map((e) => e.subgroup));
  assert.equal(subgroups.size, 8);
  assert.ok(EXERCISE_CATALOG.some((e) => e.hevyName === 'Incline Dumbbell Press'));
  assert.ok(EXERCISE_CATALOG.some((e) => e.hevyName.includes('Face Pull')));
  assert.ok(EXERCISE_CATALOG.some((e) => e.hevyName.includes('Bulgarian Split Squat')));
  assert.ok(EXERCISE_CATALOG.some((e) => e.hevyName.includes('Romanian Deadlift')));
  assert.ok(EXERCISE_CATALOG.some((e) => e.hevyName === 'Hanging Leg Raise'));
});

test('buildExerciseRecommendations detects push/pull imbalance (>30%) and lagging subgroups (<6 sets) and suggests missing exercises', () => {
  const todayKey = '2026-11-20';
  const hevyWorkouts: HevyWorkout[] = [
    makeWorkout('w1', '2026-11-16', [
      { title: 'Bench Press (Barbell)', sets: 6, weightKg: 90, reps: 8 },
      { title: 'Incline Dumbbell Press', sets: 6, weightKg: 32, reps: 10 },
    ]),
    makeWorkout('w2', '2026-11-18', [
      { title: 'Barbell Row', sets: 2, weightKg: 80, reps: 8 },
    ]),
  ];

  const rec = buildExerciseRecommendations({
    hevyWorkouts,
    todayKey,
  });

  assert.equal(rec.hasPushPullImbalance, true);
  assert.equal(rec.pushSets7d, 12);
  assert.equal(rec.pullSets7d, 2);

  const imbalanceCard = rec.addRecommendations.find(
    (c) => c.reasonType === 'push_pull_imbalance',
  );
  assert.ok(imbalanceCard);
  assert.ok(
    imbalanceCard.exercises.some((e) => e.hevyName.includes('Face Pull')),
  );
  assert.ok(
    imbalanceCard.exercises.some((e) =>
      e.hevyName.includes('Chest Supported Dumbbell Row'),
    ),
  );
});

test('buildExerciseRecommendations detects 3-session 1RM plateau and calculates biomechanical swaps with starting kg', () => {
  const todayKey = '2026-11-20';
  const hevyWorkouts: HevyWorkout[] = [
    makeWorkout('s1', '2026-11-05', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 100, reps: 5 },
      { title: 'Squat (Barbell)', sets: 4, weightKg: 120, reps: 5 },
      { title: 'Pull Up', sets: 3, weightKg: 10, reps: 8 },
    ]),
    makeWorkout('s2', '2026-11-12', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 100, reps: 5 },
      { title: 'Squat (Barbell)', sets: 4, weightKg: 120, reps: 5 },
      { title: 'Pull Up', sets: 3, weightKg: 10, reps: 8 },
    ]),
    makeWorkout('s3', '2026-11-19', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 97.5, reps: 5 },
      { title: 'Squat (Barbell)', sets: 4, weightKg: 120, reps: 5 },
      { title: 'Pull Up', sets: 3, weightKg: 10, reps: 7 },
    ]),
  ];

  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-11-19', weightKg: 85, completedHabits: [] },
  ];

  const rec = buildExerciseRecommendations({
    hevyWorkouts,
    dailyLogs,
    todayKey,
  });

  assert.equal(rec.swapRecommendations.length, 3);

  const benchSwap = rec.swapRecommendations.find((s) =>
    s.stalledExerciseTitle.includes('Bench Press'),
  );
  assert.ok(benchSwap);
  assert.equal(benchSwap.blockDurationWeeks, 4);
  assert.ok(
    benchSwap.alternatives.some((a) => a.hevyName === 'Incline Dumbbell Press'),
  );
  const dbIncline = benchSwap.alternatives.find(
    (a) => a.hevyName === 'Incline Dumbbell Press',
  );
  assert.ok(dbIncline && dbIncline.startingWeightKg !== null && dbIncline.startingWeightKg >= 24);
  assert.match(dbIncline.weightLabel, /на ръка/);

  const squatSwap = rec.swapRecommendations.find((s) =>
    s.stalledExerciseTitle.includes('Squat'),
  );
  assert.ok(squatSwap);
  assert.ok(
    squatSwap.alternatives.some((a) =>
      a.hevyName.includes('Bulgarian Split Squat'),
    ),
  );

  const pullUpSwap = rec.swapRecommendations.find((s) =>
    s.stalledExerciseTitle.includes('Pull Up'),
  );
  assert.ok(pullUpSwap);
  assert.ok(
    pullUpSwap.alternatives.some((a) =>
      a.hevyName.includes('Chest Supported Dumbbell Row'),
    ),
  );
});

test('Coach chat includes quick question and answers exercise_add_swap intent with concrete add and swap steps', () => {
  const question = 'Кое упражнение да добавя или сменя тази седмица?';
  assert.ok(COACH_QUICK_QUESTIONS.includes(question));
  assert.equal(detectCoachQuestionIntent(question), 'exercise_add_swap');

  const todayKey = '2026-11-20';
  const hevyWorkouts: HevyWorkout[] = [
    makeWorkout('c1', '2026-11-05', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 95, reps: 6 },
    ]),
    makeWorkout('c2', '2026-11-12', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 95, reps: 6 },
    ]),
    makeWorkout('c3', '2026-11-18', [
      { title: 'Bench Press (Barbell)', sets: 4, weightKg: 95, reps: 6 },
      { title: 'Cable Fly', sets: 4, weightKg: 20, reps: 12 },
    ]),
  ];
  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-11-19', weightKg: 84, sleepHours: 7.5, completedHabits: [] },
  ];
  const profile: UserProfile = { name: 'Тест', heightCm: 180, weightKg: 84 };

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts,
    dailyLogs,
    habitItems: [],
    legacyLogs: {},
    profile,
    todayKey,
  });
  const readiness = computeAiReadinessScore({ hevyWorkouts, dailyLogs, todayKey });

  const response = answerCoachQuestion({
    question,
    hevyWorkouts,
    dailyLogs,
    profile,
    coachReport,
    readiness,
    todayKey,
  });

  assert.equal(response.intent, 'exercise_add_swap');
  assert.match(response.headline, /ДОБАВИ:/);
  assert.match(response.headline, /СМЕНИ Bench Press/);
  assert.ok(response.actionSteps.length >= 2);
});
