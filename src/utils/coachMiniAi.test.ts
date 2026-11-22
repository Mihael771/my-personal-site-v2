import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import {
  adaptRoutineForReadiness,
  answerCoachQuestion,
  COACH_QUICK_QUESTIONS,
  computeAiReadinessScore,
  countConsecutiveTrainingDays,
  detectCoachQuestionIntent,
  discoverPersonalPatterns,
  formatGeneratedWorkoutClipboard,
  generateOptimalWorkoutForToday,
} from './coachMiniAi';
import { generateIntelligentCoachReport } from './intelligentCoach';

const PROFILE: UserProfile = {
  name: 'Тест',
  heightCm: 180,
  weightKg: 80,
};

function makeWorkout(
  date: string,
  title: string,
  exercises: Array<{ title: string; weightKg: number; reps: number; sets?: number; rpe?: number }>,
): HevyWorkout {
  const mapped = exercises.map((ex) => {
    const setsCount = ex.sets ?? 3;
    const sets = Array.from({ length: setsCount }, (_, idx) => ({
      setIndex: idx + 1,
      setType: 'normal',
      weightKg: ex.weightKg,
      reps: ex.reps,
      ...(ex.rpe !== undefined ? { rpe: ex.rpe } : {}),
    }));
    return {
      title: ex.title,
      sets,
      totalVolumeKg: ex.weightKg * ex.reps * setsCount,
      maxWeightKg: ex.weightKg,
    };
  });

  return {
    id: `${date}-${title}`,
    title,
    startTime: `${date}T18:00:00`,
    date,
    exercises: mapped,
    totalVolumeKg: mapped.reduce((s, e) => s + e.totalVolumeKg, 0),
    maxWeightKg: Math.max(...mapped.map((e) => e.maxWeightKg), 0),
    totalSets: mapped.reduce((s, e) => s + e.sets.length, 0),
    importedAt: `${date}T19:00:00`,
  };
}

test('computeAiReadinessScore scores peak readiness high and adapts routine +2.5 kg', () => {
  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', sleepHours: 8, sleepQuality: 5, restingHr: 56, completedHabits: ['Креатин'] },
    { date: '2026-05-05', sleepHours: 8, sleepQuality: 5, restingHr: 55, completedHabits: ['Креатин'] },
    { date: '2026-05-10', sleepHours: 8.5, sleepQuality: 5, restingHr: 53, completedHabits: ['Креатин'] },
    { date: '2026-05-11', sleepHours: 8.3, sleepQuality: 5, restingHr: 52, completedHabits: ['Креатин'] },
  ];

  const workouts: HevyWorkout[] = [
    makeWorkout('2026-05-03', 'Push A', [
      { title: 'Bench Press (Barbell)', weightKg: 80, reps: 6, sets: 4, rpe: 8 },
      { title: 'Lateral Raise (Dumbbell)', weightKg: 12, reps: 12, sets: 3, rpe: 8 },
    ]),
    makeWorkout('2026-05-08', 'Push A', [
      { title: 'Bench Press (Barbell)', weightKg: 80, reps: 6, sets: 4, rpe: 8 },
      { title: 'Lateral Raise (Dumbbell)', weightKg: 12, reps: 12, sets: 3, rpe: 8 },
    ]),
  ];

  const readiness = computeAiReadinessScore({
    hevyWorkouts: workouts,
    dailyLogs,
    todayKey: '2026-05-11',
  });

  assert.ok(readiness.score >= 80, `Expected peak score >= 80, got ${readiness.score}`);
  assert.equal(readiness.tier, 'peak');
  assert.ok(readiness.diagnosisHeadline.includes('Пикова форма'));

  const adapted = adaptRoutineForReadiness(workouts, 'Push A', readiness.score);
  assert.ok(adapted !== null);
  const bench = adapted.exercises.find((e) => e.exerciseTitle === 'Bench Press (Barbell)');
  assert.ok(bench);
  assert.equal(bench.adaptedWeightKg, 82.5);
  assert.equal(bench.adaptedSets, 4);
});

test('computeAiReadinessScore detects high neural fatigue and auto-corrector reduces sets -25% and weight -6%', () => {
  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', sleepHours: 7.8, sleepQuality: 4, restingHr: 54, completedHabits: [] },
    { date: '2026-05-04', sleepHours: 7.5, sleepQuality: 4, restingHr: 55, completedHabits: [] },
    { date: '2026-05-10', sleepHours: 5.2, sleepQuality: 1, restingHr: 64, completedHabits: [] },
    { date: '2026-05-11', sleepHours: 5.0, sleepQuality: 1, restingHr: 66, completedHabits: [] },
  ];

  const workouts: HevyWorkout[] = [
    makeWorkout('2026-05-07', 'Upper', [
      { title: 'Bench Press (Barbell)', weightKg: 100, reps: 5, sets: 4, rpe: 9.5 },
    ]),
    makeWorkout('2026-05-08', 'Lower', [
      { title: 'Squat (Barbell)', weightKg: 120, reps: 5, sets: 4, rpe: 9.5 },
    ]),
    makeWorkout('2026-05-09', 'Upper', [
      { title: 'Bench Press (Barbell)', weightKg: 100, reps: 5, sets: 4, rpe: 9.5 },
    ]),
    makeWorkout('2026-05-10', 'Lower', [
      { title: 'Squat (Barbell)', weightKg: 120, reps: 5, sets: 4, rpe: 9.5 },
    ]),
    makeWorkout('2026-05-11', 'Upper', [
      { title: 'Bench Press (Barbell)', weightKg: 100, reps: 5, sets: 4, rpe: 9.5 },
    ]),
  ];

  assert.equal(countConsecutiveTrainingDays(workouts, dailyLogs, '2026-05-11'), 5);

  const readiness = computeAiReadinessScore({
    hevyWorkouts: workouts,
    dailyLogs,
    todayKey: '2026-05-11',
  });

  assert.ok(readiness.score < 45, `Expected fatigued score < 45, got ${readiness.score}`);
  assert.equal(readiness.tier, 'fatigued');

  const adapted = adaptRoutineForReadiness(workouts, 'Upper', readiness.score);
  assert.ok(adapted);
  const bench = adapted.exercises[0];
  assert.equal(bench.adaptedSets, 3); // 4 * 0.75 = 3
  assert.equal(bench.adaptedWeightKg, 94); // 100 * 0.94 = 94
});

test('discoverPersonalPatterns finds sleep & protein correlations and shows progress bar when sparse', () => {
  const sparsePatterns = discoverPersonalPatterns({
    hevyWorkouts: [
      makeWorkout('2026-05-10', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 80, reps: 5 }]),
    ],
    dailyLogs: [{ date: '2026-05-10', sleepHours: 8, completedHabits: ['Креатин'] }],
    todayKey: '2026-05-11',
  });

  assert.equal(sparsePatterns.length, 4);
  assert.ok(sparsePatterns.every((p) => !p.hasEnoughData));
  assert.ok(sparsePatterns[0].progressLabel.includes('1/14'));

  // Now provide enough paired records for sleep, nutrition, weekdays, and habits
  const richLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', sleepHours: 8.2, sleepQuality: 5, restingHr: 53, proteinGrams: 170, caloriesKcal: 2600, completedHabits: ['Креатин'] },
    { date: '2026-05-02', sleepHours: 8.0, sleepQuality: 5, restingHr: 54, proteinGrams: 165, caloriesKcal: 2500, completedHabits: ['Креатин'] },
    { date: '2026-05-03', sleepHours: 6.1, sleepQuality: 2, restingHr: 60, proteinGrams: 110, caloriesKcal: 1800, completedHabits: [] },
    { date: '2026-05-04', sleepHours: 6.0, sleepQuality: 2, restingHr: 61, proteinGrams: 105, caloriesKcal: 1750, completedHabits: [] },
    { date: '2026-05-05', sleepHours: 8.1, sleepQuality: 5, restingHr: 53, proteinGrams: 160, caloriesKcal: 2550, completedHabits: ['Креатин'] },
    { date: '2026-05-06', sleepHours: 6.2, sleepQuality: 3, restingHr: 59, proteinGrams: 120, caloriesKcal: 1900, completedHabits: [] },
  ];

  const richWorkouts: HevyWorkout[] = [
    makeWorkout('2026-05-01', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 90, reps: 6, rpe: 7 }]),
    makeWorkout('2026-05-02', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 92.5, reps: 5, rpe: 7.5 }]),
    makeWorkout('2026-05-03', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 80, reps: 5, rpe: 9 }]),
    makeWorkout('2026-05-04', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 80, reps: 4, rpe: 9.5 }]),
    makeWorkout('2026-05-05', 'Pull', [{ title: 'Barbell Row', weightKg: 85, reps: 8, rpe: 7.5 }]),
    makeWorkout('2026-05-06', 'Legs', [{ title: 'Squat (Barbell)', weightKg: 100, reps: 5, rpe: 8.5 }]),
  ];

  const discovered = discoverPersonalPatterns({
    hevyWorkouts: richWorkouts,
    dailyLogs: richLogs,
    todayKey: '2026-05-10',
  });

  assert.equal(discovered.filter((p) => p.hasEnoughData).length, 4);
  assert.ok(discovered[0].insightText.includes('+'));
  assert.ok(discovered[1].insightText.includes('≥ 150 g'));
});

test('generateOptimalWorkoutForToday builds 4-6 exercises prioritizing recovered + lagging muscles and formats clipboard', () => {
  const now = new Date('2026-05-11T12:00:00').getTime();
  const workouts: HevyWorkout[] = [
    makeWorkout('2026-05-01', 'Full', [
      { title: 'Barbell Row', weightKg: 80, reps: 8, sets: 2 },
      { title: 'Squat (Barbell)', weightKg: 100, reps: 5, sets: 2 },
      { title: 'Overhead Press (Barbell)', weightKg: 55, reps: 6, sets: 2 },
      { title: 'Romanian Deadlift', weightKg: 95, reps: 8, sets: 2 },
    ]),
    makeWorkout('2026-05-11', 'Chest', [
      { title: 'Bench Press (Barbell)', weightKg: 90, reps: 5, sets: 6 },
    ]),
  ];

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs: [],
    habitItems: [],
    legacyLogs: {},
    profile: PROFILE,
    todayKey: '2026-05-11',
  });

  const plan = generateOptimalWorkoutForToday({
    goal: 'strength',
    hevyWorkouts: workouts,
    coachReport,
    todayKey: '2026-05-11',
    referenceTimestampMs: now,
  });

  assert.ok(plan.exercises.length >= 4 && plan.exercises.length <= 6);
  // Bench press was trained today (fatigued) so recovered exercises should appear first
  assert.notEqual(plan.exercises[0].exerciseTitle, 'Bench Press (Barbell)');
  assert.ok(plan.exercises[0].recommendedWeightKg !== null && plan.exercises[0].recommendedWeightKg > 0);
  const clip = formatGeneratedWorkoutClipboard(plan);
  assert.ok(clip.includes('Тренировка за днес — Сила'));
});

test('offline Coach Chat matches all 7 quick intents (including caloric_balance and neat_steps) and cites numeric data', () => {
  const dailyLogs: DailyBiometricLog[] = [
    {
      date: '2026-05-09',
      weightKg: 81,
      sleepHours: 7.8,
      sleepQuality: 4,
      restingHr: 55,
      caloriesKcal: 2150,
      activeCalories: 680,
      restingCalories: 1800,
      steps: 11200,
      proteinGrams: 160,
      cardioDistanceKm: 5,
      cardioDurationMinutes: 27,
      completedHabits: [],
    },
    {
      date: '2026-05-10',
      weightKg: 81,
      sleepHours: 8.0,
      sleepQuality: 5,
      restingHr: 54,
      caloriesKcal: 2250,
      activeCalories: 620,
      restingCalories: 1800,
      steps: 9800,
      proteinGrams: 165,
      completedHabits: [],
    },
  ];
  const workouts: HevyWorkout[] = [
    makeWorkout('2026-05-05', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 85, reps: 5, sets: 4, rpe: 8 }]),
    makeWorkout('2026-05-07', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 85, reps: 5, sets: 4, rpe: 8 }]),
    makeWorkout('2026-05-09', 'Push', [{ title: 'Bench Press (Barbell)', weightKg: 85, reps: 5, sets: 4, rpe: 8 }]),
  ];

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs,
    habitItems: [],
    legacyLogs: {},
    profile: PROFILE,
    todayKey: '2026-05-10',
  });
  const readiness = computeAiReadinessScore({
    hevyWorkouts: workouts,
    dailyLogs,
    todayKey: '2026-05-10',
  });

  const expectedIntents = [
    'goal_environment_progress',
    'exercise_add_swap',
    'train_heavy_today',
    'stagnation_plateau',
    'deload_check',
    'strength_weight_cardio_balance',
    'lagging_muscle',
    'caloric_balance',
    'neat_steps',
  ] as const;

  assert.equal(COACH_QUICK_QUESTIONS.length, expectedIntents.length);

  COACH_QUICK_QUESTIONS.forEach((q, idx) => {
    assert.equal(detectCoachQuestionIntent(q), expectedIntents[idx]);
    const res = answerCoachQuestion({
      question: q,
      hevyWorkouts: workouts,
      dailyLogs,
      profile: PROFILE,
      coachReport,
      readiness,
      todayKey: '2026-05-10',
      dailyStepsGoal: 10000,
    });
    assert.equal(res.intent, expectedIntents[idx]);
    assert.ok(res.headline.length > 5);
    assert.ok(res.metrics.length >= 2);
    assert.ok(res.actionSteps.length >= 2);
  });

  // Verify caloric_balance cites TDEE and net balance, and neat_steps cites average steps
  const calReply = answerCoachQuestion({
    question: 'Какъв ми е калорийният баланс тази седмица?',
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    coachReport,
    readiness,
    todayKey: '2026-05-10',
  });
  assert.ok(calReply.metrics.some((m) => m.includes('TDEE')));
  assert.ok(calReply.analysis.includes('kcal'));

  const stepsReply = answerCoachQuestion({
    question: 'Достатъчно ли се движа извън залата?',
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    coachReport,
    readiness,
    todayKey: '2026-05-10',
    dailyStepsGoal: 10000,
  });
  assert.ok(stepsReply.metrics.some((m) => m.includes('крачки')));
});

test('computeAiReadinessScore lowers readiness and flags highStepsLegFatigue when >14,000 steps occur near a heavy leg workout', () => {
  const baseLogs: DailyBiometricLog[] = [
    { date: '2026-05-10', sleepHours: 8.0, sleepQuality: 4, restingHr: 55, steps: 8000, completedHabits: [] },
    { date: '2026-05-11', sleepHours: 8.0, sleepQuality: 4, restingHr: 55, steps: 8000, completedHabits: [] },
  ];
  const highStepsLogs: DailyBiometricLog[] = [
    { date: '2026-05-10', sleepHours: 8.0, sleepQuality: 4, restingHr: 55, steps: 16200, completedHabits: [] },
    { date: '2026-05-11', sleepHours: 8.0, sleepQuality: 4, restingHr: 55, steps: 15400, completedHabits: [] },
  ];
  const legWorkouts: HevyWorkout[] = [
    makeWorkout('2026-05-10', 'Leg Day', [
      { title: 'Squat (Barbell)', weightKg: 110, reps: 6, sets: 4, rpe: 8.5 },
    ]),
  ];

  const normalReadiness = computeAiReadinessScore({
    hevyWorkouts: legWorkouts,
    dailyLogs: baseLogs,
    todayKey: '2026-05-11',
  });
  const fatiguedReadiness = computeAiReadinessScore({
    hevyWorkouts: legWorkouts,
    dailyLogs: highStepsLogs,
    todayKey: '2026-05-11',
  });

  assert.equal(normalReadiness.factors.highStepsLegFatigue, false);
  assert.equal(fatiguedReadiness.factors.highStepsLegFatigue, true);
  assert.equal(fatiguedReadiness.factors.recentSteps24h, 16200);
  assert.ok(fatiguedReadiness.score < normalReadiness.score);
  assert.ok(fatiguedReadiness.diagnosisDetail.includes('16'));
});

