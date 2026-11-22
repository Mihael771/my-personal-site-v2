import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import { generateIntelligentCoachReport } from './intelligentCoach';

function makeWorkout(
  id: string,
  title: string,
  date: string,
  exercises: HevyWorkout['exercises'],
): HevyWorkout {
  let totalVolumeKg = 0;
  let maxWeightKg = 0;
  let totalSets = 0;
  for (const ex of exercises) {
    totalVolumeKg += ex.totalVolumeKg;
    if (ex.maxWeightKg > maxWeightKg) maxWeightKg = ex.maxWeightKg;
    totalSets += ex.sets.length;
  }
  return {
    id,
    title,
    startTime: `${date} 18:00`,
    date,
    exercises,
    totalVolumeKg,
    maxWeightKg,
    totalSets,
    importedAt: `${date}T19:00:00Z`,
  };
}

test('Intelligent Coach triggers readiness, +2.5kg progression, plateau, relative strength, weight/protein, volume/imbalance, cardio conflict, and habit rules with exact numbers', () => {
  const dailyLogs: DailyBiometricLog[] = [
    // Previous week (Nov 5 - Nov 11): avg weight ~82.0 kg, HR ~57 bpm
    { date: '2026-11-05', weightKg: 82.2, sleepHours: 8, sleepQuality: 4, restingHr: 56, proteinGrams: 110, completedHabits: ['Креатин'] },
    { date: '2026-11-07', weightKg: 82.0, sleepHours: 7.5, sleepQuality: 4, restingHr: 57, proteinGrams: 115, completedHabits: [] },
    { date: '2026-11-09', weightKg: 81.8, sleepHours: 7.5, sleepQuality: 4, restingHr: 58, proteinGrams: 105, completedHabits: [] },
    // Recent week (Nov 12 - Nov 18): avg weight ~80.5 kg (-1.8%!), protein low (~105g), HR spike 64 bpm, sleep < 6.5h, cardio 7.5km on Nov 17
    { date: '2026-11-14', weightKg: 80.8, sleepHours: 7.5, sleepQuality: 4, restingHr: 57, proteinGrams: 110, completedHabits: [] },
    { date: '2026-11-15', weightKg: 80.6, sleepHours: 7.0, sleepQuality: 3, restingHr: 58, proteinGrams: 100, completedHabits: ['Разтягане / Мобилност'] },
    { date: '2026-11-16', weightKg: 80.5, sleepHours: 7.0, sleepQuality: 3, restingHr: 57, proteinGrams: 108, completedHabits: [] },
    { date: '2026-11-17', weightKg: 80.4, sleepHours: 5.5, sleepQuality: 2, restingHr: 59, proteinGrams: 102, cardioDistanceKm: 7.5, cardioDurationMinutes: 42, completedHabits: [] },
    { date: '2026-11-18', weightKg: 80.2, sleepHours: 6.0, sleepQuality: 2, restingHr: 64, proteinGrams: 105, completedHabits: [] },
  ];

  const hevyWorkouts: HevyWorkout[] = [
    // Bench Press: plateau 3 consecutive sessions at 80x8 (1RM = 101.3 kg)
    // Incline Dumbbell Press: 2 sessions with >= 8 reps and RPE <= 8.5 -> +2.5kg
    // Pull Up: bodyweight + 15 kg x 8 reps -> relative strength
    // Heavy Push volume (18+ sets) vs 0 back sets -> Push/Pull imbalance + lagging back
    makeWorkout('w1', 'Push 1', '2026-11-10', [
      {
        title: 'Bench Press (Barbell)',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 80, reps: 8, rpe: 9 },
          { setIndex: 1, setType: 'normal', weightKg: 80, reps: 8, rpe: 9.5 },
        ],
        totalVolumeKg: 1280,
        maxWeightKg: 80,
      },
      {
        title: 'Incline Dumbbell Press',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 30, reps: 9, rpe: 8 },
          { setIndex: 1, setType: 'normal', weightKg: 30, reps: 8, rpe: 8.5 },
        ],
        totalVolumeKg: 510,
        maxWeightKg: 30,
      },
      {
        title: 'Pull Up',
        sets: [{ setIndex: 0, setType: 'normal', weightKg: 15, reps: 8, rpe: 8.5 }],
        totalVolumeKg: 120,
        maxWeightKg: 15,
      },
    ]),
    makeWorkout('w2', 'Push 2', '2026-11-14', [
      {
        title: 'Bench Press (Barbell)',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 80, reps: 8, rpe: 9 },
          { setIndex: 1, setType: 'normal', weightKg: 80, reps: 7, rpe: 9.5 },
        ],
        totalVolumeKg: 1200,
        maxWeightKg: 80,
      },
      {
        title: 'Incline Dumbbell Press',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 30, reps: 10, rpe: 8 },
          { setIndex: 1, setType: 'normal', weightKg: 30, reps: 9, rpe: 8.5 },
        ],
        totalVolumeKg: 570,
        maxWeightKg: 30,
      },
      {
        title: 'Triceps Pushdown',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 25, reps: 12, rpe: 8 },
          { setIndex: 1, setType: 'normal', weightKg: 25, reps: 12, rpe: 8 },
          { setIndex: 2, setType: 'normal', weightKg: 25, reps: 12, rpe: 8.5 },
        ],
        totalVolumeKg: 900,
        maxWeightKg: 25,
      },
    ]),
    makeWorkout('w3', 'Push + Legs', '2026-11-18', [
      {
        title: 'Bench Press (Barbell)',
        sets: [
          { setIndex: 0, setType: 'normal', weightKg: 80, reps: 8, rpe: 9 },
          { setIndex: 1, setType: 'normal', weightKg: 80, reps: 8, rpe: 9 },
        ],
        totalVolumeKg: 1280,
        maxWeightKg: 80,
      },
      {
        title: 'Squat (Barbell)',
        sets: [{ setIndex: 0, setType: 'normal', weightKg: 100, reps: 5, rpe: 8.5 }],
        totalVolumeKg: 500,
        maxWeightKg: 100,
      },
    ]),
  ];

  const report = generateIntelligentCoachReport({
    hevyWorkouts,
    dailyLogs,
    todayKey: '2026-11-18',
  });

  const ids = report.cards.map((c) => c.id);

  // Rule 1: Readiness alert
  assert.ok(ids.includes('readiness-reduced'));
  const readinessCard = report.cards.find((c) => c.id === 'readiness-reduced')!;
  assert.ok(readinessCard.evidence.includes('64 bpm'));

  // Rule 2a: +2.5 kg progression for Incline Dumbbell Press
  assert.ok(ids.includes('progress-up-Incline Dumbbell Press'));

  // Rule 2b: 3-session plateau for Bench Press (Barbell)
  assert.ok(ids.includes('plateau-Bench Press (Barbell)'));

  // Rule 3: Relative strength for Pull Up: 80.2 + 15 = 95.2 kg x 8 -> 1RM 120.6
  assert.equal(report.relativeStrength.length, 1);
  assert.equal(report.relativeStrength[0].totalLoadKg, 95.2);
  assert.ok(report.relativeStrength[0].realTotal1RM > 120);
  assert.ok(ids.includes('relative-strength-highlight'));

  // Rule 4a & 4b: Weight drop > 0.8% + protein < 1.6 g/kg
  assert.ok(ids.includes('nutrition-weight-strength-drop'));
  assert.ok(ids.includes('protein-deficit'));

  // Rule 5: Push/Pull imbalance + lagging muscle groups + cardio conflict (Nov 17 7.5km vs Nov 18 Squat)
  assert.ok(ids.includes('push-pull-imbalance'));
  assert.ok(ids.includes('weekly-volume-lagging'));
  assert.ok(ids.includes('cardio-leg-conflict'));

  // Rule 6: Habits missed >= 3 of last 5 days
  assert.ok(ids.includes('habits-supplements-missed'));
});

test('Intelligent Coach detects metabolism stall under deficit, severe deficit with 1RM drop, NEAT steps drop, and >14,000 steps leg fatigue', () => {
  // Scenario A: Persistent deficit (-400 kcal/day) but flat/rising weight over 2 weeks + NEAT < 6000 steps/day
  const stallLogs: DailyBiometricLog[] = [
    { date: '2026-11-05', weightKg: 80.0, completedHabits: [] },
    { date: '2026-11-08', weightKg: 80.0, completedHabits: [] },
    { date: '2026-11-14', weightKg: 80.1, caloriesKcal: 1950, activeCalories: 600, restingCalories: 1780, steps: 4500, completedHabits: [] },
    { date: '2026-11-15', weightKg: 80.1, caloriesKcal: 1980, activeCalories: 580, restingCalories: 1780, steps: 4200, completedHabits: [] },
    { date: '2026-11-16', weightKg: 80.2, caloriesKcal: 1960, activeCalories: 610, restingCalories: 1780, steps: 4800, completedHabits: [] },
    { date: '2026-11-17', weightKg: 80.2, caloriesKcal: 1950, activeCalories: 590, restingCalories: 1780, steps: 4100, completedHabits: [] },
    { date: '2026-11-18', weightKg: 80.2, caloriesKcal: 1970, activeCalories: 600, restingCalories: 1780, steps: 4400, completedHabits: [] },
  ];

  const stallReport = generateIntelligentCoachReport({
    hevyWorkouts: [],
    dailyLogs: stallLogs,
    todayKey: '2026-11-18',
  });
  const stallIds = stallReport.cards.map((c) => c.id);
  assert.ok(stallIds.includes('metabolism-deficit-stall'));
  assert.ok(stallIds.includes('neat-steps-drop'));
  const neatCard = stallReport.cards.find((c) => c.id === 'neat-steps-drop')!;
  assert.ok(neatCard.message.includes('Спад в ежедневната активност (NEAT)'));
  assert.ok(neatCard.message.includes('20-минутна разходка'));

  // Scenario B: Severe deficit (> -750 kcal/day) + dropping Hevy 1RM + >14,000 steps near heavy leg workout
  const severeLogs: DailyBiometricLog[] = [
    { date: '2026-11-14', weightKg: 80.0, caloriesKcal: 1650, activeCalories: 800, restingCalories: 1780, steps: 11000, completedHabits: [] },
    { date: '2026-11-16', weightKg: 79.6, caloriesKcal: 1600, activeCalories: 820, restingCalories: 1780, steps: 10500, completedHabits: [] },
    { date: '2026-11-17', weightKg: 79.4, caloriesKcal: 1620, activeCalories: 850, restingCalories: 1780, steps: 15800, completedHabits: [] },
    { date: '2026-11-18', weightKg: 79.2, caloriesKcal: 1600, activeCalories: 830, restingCalories: 1780, steps: 15200, completedHabits: [] },
  ];

  const droppingWorkouts: HevyWorkout[] = [
    makeWorkout('w-prev', 'Legs', '2026-11-11', [
      {
        title: 'Squat (Barbell)',
        sets: [{ setIndex: 0, setType: 'normal', weightKg: 120, reps: 6, rpe: 8.5 }],
        totalVolumeKg: 720,
        maxWeightKg: 120,
      },
    ]),
    makeWorkout('w-now', 'Legs', '2026-11-17', [
      {
        title: 'Squat (Barbell)',
        sets: [{ setIndex: 0, setType: 'normal', weightKg: 105, reps: 5, rpe: 9.5 }],
        totalVolumeKg: 525,
        maxWeightKg: 105,
      },
    ]),
  ];

  const severeReport = generateIntelligentCoachReport({
    hevyWorkouts: droppingWorkouts,
    dailyLogs: severeLogs,
    todayKey: '2026-11-18',
  });
  const severeIds = severeReport.cards.map((c) => c.id);
  assert.ok(severeIds.includes('severe-deficit-muscle-loss'));
  assert.ok(severeIds.includes('high-steps-leg-recovery'));
  assert.ok(severeReport.avgCaloricBalance7d !== null && severeReport.avgCaloricBalance7d < -750);
  assert.equal(severeReport.latestSteps24h, 15800);
});

test('excludes incomplete or zero today evening metrics from averages/habits while counting today morning biometrics immediately', () => {
  const completedLogs: DailyBiometricLog[] = [
    {
      date: '2026-11-15',
      weightKg: 80.2,
      sleepHours: 7.5,
      restingHr: 56,
      steps: 10000,
      activeCalories: 600,
      caloriesKcal: 2400,
      proteinGrams: 160,
      completedHabits: ['Креатин', '2.5+ л вода'],
    },
    {
      date: '2026-11-16',
      weightKg: 80.1,
      sleepHours: 7.5,
      restingHr: 56,
      steps: 10000,
      activeCalories: 600,
      caloriesKcal: 2400,
      proteinGrams: 160,
      completedHabits: ['Креатин', '2.5+ л вода'],
    },
    {
      date: '2026-11-17',
      weightKg: 80.0,
      sleepHours: 7.5,
      restingHr: 56,
      steps: 10000,
      activeCalories: 600,
      caloriesKcal: 2400,
      proteinGrams: 160,
      completedHabits: ['Креатин', '2.5+ л вода'],
    },
    {
      date: '2026-11-18',
      weightKg: 80.0,
      sleepHours: 7.5,
      restingHr: 56,
      steps: 10000,
      activeCalories: 600,
      caloriesKcal: 2400,
      proteinGrams: 160,
      completedHabits: ['Креатин', '2.5+ л вода'],
    },
    // Today (2026-11-19): morning-only check-in + explicit 0 for evening fields
    {
      date: '2026-11-19',
      weightKg: 79.9,
      sleepHours: 5.5,
      restingHr: 66,
      steps: 0,
      activeCalories: 0,
      caloriesKcal: 0,
      proteinGrams: 0,
      completedHabits: [],
    },
  ];

  const reportMorningOnly = generateIntelligentCoachReport({
    hevyWorkouts: [],
    dailyLogs: completedLogs,
    todayKey: '2026-11-19',
    profile: { name: 'Тест', heightCm: 180, weightKg: 80 },
  });

  // Evening averages MUST stay pure (calculated through yesterday, ignoring 0 on today)
  assert.equal(reportMorningOnly.avgSteps4d, 10000);
  assert.equal(reportMorningOnly.avgSteps7d, 10000);
  assert.equal(reportMorningOnly.avgActiveCalories7d, 600);
  assert.equal(reportMorningOnly.avgProteinLast5d, 160);
  assert.equal(
    reportMorningOnly.cards.some((c) => c.id === 'neat-steps-drop'),
    false,
  );
  assert.equal(
    reportMorningOnly.cards.some((c) => c.id === 'habits-supplements-missed'),
    false,
  );

  // Morning metrics for today MUST be reflected immediately
  assert.equal(reportMorningOnly.latestRestingHr, 66);
  assert.equal(reportMorningOnly.latestBodyWeightKg, 79.9);
  assert.equal(reportMorningOnly.avgSleepLast2d, 6.5); // avg(7.5, 5.5)

  // Once the user logs real > 0 values for today, today IS included
  const withTodayCompleted: DailyBiometricLog[] = [
    ...completedLogs.slice(0, 4),
    {
      date: '2026-11-19',
      weightKg: 79.9,
      sleepHours: 5.5,
      restingHr: 66,
      steps: 14000,
      activeCalories: 800,
      caloriesKcal: 2600,
      proteinGrams: 180,
      completedHabits: ['Креатин', '2.5+ л вода'],
    },
  ];
  const reportEveningDone = generateIntelligentCoachReport({
    hevyWorkouts: [],
    dailyLogs: withTodayCompleted,
    todayKey: '2026-11-19',
    profile: { name: 'Тест', heightCm: 180, weightKg: 80 },
  });
  assert.equal(reportEveningDone.avgSteps4d, 11000); // avg(10k, 10k, 10k, 14k)
  assert.equal(reportEveningDone.avgSteps7d, 10800); // avg(10k*4 + 14k)
  assert.equal(reportEveningDone.avgActiveCalories7d, 640); // avg(600*4 + 800)
});

