import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout, UserProfile } from '../types/fitness';
import {
  computeWeeklyScorecardReport,
  isWeeklyReviewBannerDay,
} from './weeklyScorecard';

const PROFILE: UserProfile = {
  name: 'Тест',
  heightCm: 180,
  weightKg: 89.5,
};

const HABITS = ['Креатин', '2.5+ л вода', 'Разтягане / Мобилност', 'Без захар / джънк'];

function makeWorkout(
  id: string,
  date: string,
  title: string,
  exerciseTitle: string,
  setsCount: number,
  weightKg: number,
  reps: number,
): HevyWorkout {
  const sets = Array.from({ length: setsCount }, (_, i) => ({
    setIndex: i,
    setType: 'normal',
    weightKg,
    reps,
  }));
  const vol = setsCount * weightKg * reps;
  return {
    id,
    title,
    startTime: `${date}T10:00:00`,
    date,
    exercises: [
      {
        title: exerciseTitle,
        sets,
        totalVolumeKg: vol,
        maxWeightKg: weightKg,
      },
    ],
    totalVolumeKg: vol,
    maxWeightKg: weightKg,
    totalSets: setsCount,
    importedAt: `${date}T12:00:00Z`,
  };
}

test('isWeeklyReviewBannerDay returns true on Sunday and Monday, false on other weekdays', () => {
  // 2026-11-22 is Sunday, 2026-11-23 is Monday, 2026-11-19 is Thursday
  assert.equal(isWeeklyReviewBannerDay('2026-11-22'), true);
  assert.equal(isWeeklyReviewBannerDay('2026-11-23'), true);
  assert.equal(isWeeklyReviewBannerDay('2026-11-19'), false);
  assert.equal(isWeeklyReviewBannerDay('2026-11-21'), false);
});

test('computeWeeklyScorecardReport compares last 7 completed days (yesterday backwards) vs previous week and excludes today', () => {
  const todayKey = '2026-11-22'; // Sunday -> completed week: Nov 15..Nov 21, prev week: Nov 8..Nov 14

  const dailyLogs: DailyBiometricLog[] = [
    // Incomplete TODAY entry — MUST be strictly excluded from the completed week
    {
      date: '2026-11-22',
      weightKg: 99.9,
      sleepHours: 2.0,
      sleepQuality: 1,
      steps: 100,
      caloriesKcal: 500,
      activeCalories: 50,
      completedHabits: ['Алкохол'],
    },
    // Current completed week (Nov 15..Nov 21): 7 days, avg weight 89.4, sleep 7.8h, steps 10500, clean habits
    ...[15, 16, 17, 18, 19, 20, 21].map((day) => ({
      date: `2026-11-${String(day).padStart(2, '0')}`,
      weightKg: 89.4,
      sleepHours: 7.8,
      sleepQuality: 4,
      restingHr: 54,
      steps: 10500,
      caloriesKcal: 2400,
      activeCalories: 750,
      restingCalories: 1950,
      proteinGrams: 170,
      completedHabits: ['Креатин', '2.5+ л вода', 'Разтягане / Мобилност'],
    })),
    // Previous week (Nov 8..Nov 14): 7 days, avg weight 89.7, sleep 6.6h, steps 8000, 2 harmful days
    ...[8, 9, 10, 11, 12, 13, 14].map((day) => ({
      date: `2026-11-${String(day).padStart(2, '0')}`,
      weightKg: 89.7,
      sleepHours: 6.6,
      sleepQuality: 3,
      restingHr: 59,
      steps: 8000,
      caloriesKcal: 2600,
      activeCalories: 600,
      restingCalories: 1950,
      proteinGrams: 140,
      completedHabits:
        day === 10 || day === 13
          ? ['Креатин', 'Алкохол']
          : ['Креатин', '2.5+ л вода'],
    })),
  ];

  const hevyWorkouts: HevyWorkout[] = [
    // Today workout — must be excluded
    makeWorkout('w-today', '2026-11-22', 'Today', 'Bench Press (Barbell)', 10, 100, 5),
    // Current completed week: 3 workouts, 18 sets
    makeWorkout('w1', '2026-11-16', 'Upper', 'Bench Press (Barbell)', 6, 90, 8),
    makeWorkout('w2', '2026-11-18', 'Back', 'Barbell Row', 6, 80, 8),
    makeWorkout('w3', '2026-11-20', 'Legs', 'Squat (Barbell)', 6, 110, 6),
    // Previous week: 2 workouts, 10 sets
    makeWorkout('w0a', '2026-11-09', 'Upper', 'Bench Press (Barbell)', 5, 85, 8),
    makeWorkout('w0b', '2026-11-12', 'Back', 'Barbell Row', 5, 75, 8),
  ];

  const report = computeWeeklyScorecardReport({
    dailyLogs,
    hevyWorkouts,
    habitItems: HABITS,
    profile: PROFILE,
    todayKey,
    dailyStepsGoal: 10000,
  });

  assert.equal(report.isBannerDay, true);
  assert.equal(report.currentWeek.startDate, '2026-11-15');
  assert.equal(report.currentWeek.endDate, '2026-11-21');
  assert.equal(report.previousWeek.startDate, '2026-11-08');
  assert.equal(report.previousWeek.endDate, '2026-11-14');

  // Verify today's outliers (99.9 kg, 2h sleep, 100 steps, 10 sets) did NOT pollute currentWeek
  assert.equal(report.currentWeek.avgWeightKg, 89.4);
  assert.equal(report.previousWeek.avgWeightKg, 89.7);
  assert.equal(report.currentWeek.avgSleepHours, 7.8);
  assert.equal(report.currentWeek.avgSteps, 10500);
  assert.equal(report.currentWeek.workoutSessions, 3);
  assert.equal(report.currentWeek.totalWorkingSets, 18);
  assert.equal(report.currentWeek.cleanDaysCount, 7);
  assert.equal(report.previousWeek.cleanDaysCount, 5);

  // All 6 comparison cards exist and have explicit directional indicators
  assert.equal(report.comparisons.length, 6);
  const weightCard = report.comparisons.find((c) => c.id === 'weight');
  assert.ok(weightCard);
  assert.equal(weightCard.direction, 'down');
  assert.match(weightCard.deltaText, /-0\.3 kg/);

  const sleepCard = report.comparisons.find((c) => c.id === 'sleep');
  assert.ok(sleepCard);
  assert.equal(sleepCard.direction, 'up');
  assert.equal(sleepCard.sentiment, 'positive');

  const readinessCard = report.comparisons.find(
    (c) => c.id === 'readiness_testosterone',
  );
  assert.ok(readinessCard);
  assert.equal(readinessCard.direction, 'up');
  assert.ok(
    (report.currentWeek.avgReadinessTestosteroneIndex ?? 0) >
      (report.previousWeek.avgReadinessTestosteroneIndex ?? 0),
  );

  // Overall score should be high for this strong week
  assert.ok(report.overallScore >= 75 && report.overallScore <= 100);
  assert.ok(report.mainFocus.headline.length > 10);
});

test('computeWeeklyScorecardReport identifies sleep + back/rear-delt bottleneck in Main Focus', () => {
  const todayKey = '2026-11-23'; // Monday
  const dailyLogs: DailyBiometricLog[] = [16, 17, 18, 19, 20, 21, 22].map((day) => ({
    date: `2026-11-${String(day).padStart(2, '0')}`,
    weightKg: 88.0,
    sleepHours: 6.2,
    sleepQuality: 2,
    steps: 9000,
    completedHabits: ['Креатин', '2.5+ л вода'],
  }));

  const hevyWorkouts: HevyWorkout[] = [
    makeWorkout('p1', '2026-11-17', 'Chest', 'Bench Press (Barbell)', 10, 90, 8),
    makeWorkout('p2', '2026-11-20', 'Chest', 'Incline Dumbbell Press', 6, 32, 10),
  ];

  const report = computeWeeklyScorecardReport({
    dailyLogs,
    hevyWorkouts,
    habitItems: HABITS,
    profile: PROFILE,
    todayKey,
  });

  assert.match(report.mainFocus.headline, /сън/i);
  assert.match(report.mainFocus.headline, /гръб\/задно рамо/i);
});
