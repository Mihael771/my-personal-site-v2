import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout, UserProfile } from '../types/fitness';
import {
  buildGoalImpactCopy,
  computeAnabolicEnvironmentReport,
} from './anabolicEnvironmentEngine';
import { formatSelectedDateBadge } from './fitnessMath';
import {
  COACH_SUB_TABS,
  getBreadcrumbsForLocation,
  parseLocationFromHash,
} from './navigation';
import { TRIBULUS_HABIT_NAME } from './testosteroneAndHabits';

const BASE_PROFILE: UserProfile = {
  name: 'Мишо',
  heightCm: 180,
  weightKg: 82,
};

function makeCompoundWorkout(id: string, date: string, title: string, exerciseTitle: string, weightKg: number): HevyWorkout {
  return {
    id,
    title,
    date,
    startTime: `${date}T17:00:00Z`,
    exercises: [
      {
        title: exerciseTitle,
        sets: [
          { setIndex: 0, setType: 'normal', weightKg, reps: 6 },
          { setIndex: 1, setType: 'normal', weightKg, reps: 6 },
          { setIndex: 2, setType: 'normal', weightKg, reps: 6 },
        ],
        totalVolumeKg: weightKg * 18,
        maxWeightKg: weightKg,
      },
    ],
    totalVolumeKg: weightKg * 18,
    maxWeightKg: weightKg,
    totalSets: 12,
    importedAt: `${date}T18:00:00Z`,
  };
}

test('computeAnabolicEnvironmentReport scores high (>=75%) with optimal sleep, heavy compounds, >=1.6g/kg protein, clean habits, and active Tribulus cycle', () => {
  const dailyLogs: DailyBiometricLog[] = [
    // Baseline earlier days without Tribulus for energy comparison
    { date: '2026-05-01', weightKg: 82, sleepHours: 7.5, sleepQuality: 3.5, restingHr: 54, hrv: 64, completedHabits: ['Креатин'] },
    { date: '2026-05-02', weightKg: 82, sleepHours: 7.6, sleepQuality: 3.5, restingHr: 54, hrv: 65, completedHabits: ['Креатин'] },
    { date: '2026-05-03', weightKg: 82, sleepHours: 7.7, sleepQuality: 4, restingHr: 53, hrv: 65, completedHabits: ['Креатин'] },
    // Last 7 days: 2026-05-08 .. 2026-05-14
    { date: '2026-05-08', weightKg: 82, sleepHours: 8.1, sleepQuality: 5, restingHr: 53, hrv: 68, caloriesKcal: 2700, activeCalories: 600, proteinGrams: 165, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-09', weightKg: 82, sleepHours: 8.2, sleepQuality: 5, restingHr: 52, hrv: 70, caloriesKcal: 2750, activeCalories: 650, proteinGrams: 170, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-10', weightKg: 82, sleepHours: 7.9, sleepQuality: 4.5, restingHr: 53, hrv: 69, caloriesKcal: 2650, activeCalories: 550, proteinGrams: 160, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-11', weightKg: 82, sleepHours: 8.0, sleepQuality: 5, restingHr: 53, hrv: 68, caloriesKcal: 2700, activeCalories: 600, proteinGrams: 168, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-12', weightKg: 82, sleepHours: 8.3, sleepQuality: 5, restingHr: 52, hrv: 71, caloriesKcal: 2720, activeCalories: 620, proteinGrams: 166, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-13', weightKg: 82, sleepHours: 8.0, sleepQuality: 4.5, restingHr: 53, hrv: 69, caloriesKcal: 2680, activeCalories: 580, proteinGrams: 162, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    { date: '2026-05-14', weightKg: 82, sleepHours: 8.1, sleepQuality: 5, restingHr: 52, hrv: 70, caloriesKcal: 2700, activeCalories: 600, proteinGrams: 165, completedHabits: ['Креатин', TRIBULUS_HABIT_NAME] },
    // Incomplete TODAY entry (2026-05-15) must NOT skew the 7 completed days (up to yesterday 2026-05-14)
    { date: '2026-05-15', sleepHours: 4.0, completedHabits: ['Алкохол'] },
  ];

  const hevyWorkouts: HevyWorkout[] = [
    makeCompoundWorkout('w-prev-1', '2026-04-25', 'Сила A', 'Barbell Squat', 110),
    makeCompoundWorkout('w-prev-2', '2026-04-28', 'Сила B', 'Bench Press', 90),
    makeCompoundWorkout('w-prev-3', '2026-05-02', 'Сила C', 'Deadlift', 140),
    makeCompoundWorkout('w-prev-4', '2026-05-05', 'Сила D', 'Weighted Pull Up', 20),
    makeCompoundWorkout('w1', '2026-05-09', 'Крака и тяга', 'Barbell Squat', 115),
    makeCompoundWorkout('w2', '2026-05-11', 'Горна част', 'Bench Press', 92.5),
    makeCompoundWorkout('w3', '2026-05-13', 'Гръб и тяга', 'Deadlift', 145),
  ];

  const report = computeAnabolicEnvironmentReport({
    dailyLogs,
    hevyWorkouts,
    profile: BASE_PROFILE,
    trainingGoal: 'hypertrophy',
    todayKey: '2026-05-15',
  });

  assert.equal(report.windowStartDate, '2026-05-08');
  assert.equal(report.windowEndDate, '2026-05-14');
  assert.equal(report.todayDate, '2026-05-15');
  assert.ok(report.totalScore >= 80, `Expected high score >= 80, got ${report.totalScore}`);
  assert.equal(report.zone, 'high');
  assert.match(report.zoneTitle, /Висока анаболна среда/);
  assert.equal(report.factors.length, 4);
  assert.deepEqual(
    report.factors.map((f) => f.weightPct),
    [30, 25, 20, 25],
  );
  assert.equal(report.tribulus.streakDays, 7);
  assert.ok((report.tribulus.energyDelta ?? 0) > 0);
  assert.equal(report.cleanHabitStreakDays, 7);
  assert.equal(report.actions48h.length, 3);
  assert.match(report.disclaimerNote, /лабораторн/i);
});

test('computeAnabolicEnvironmentReport drops to suppressed (<50%) on <6.5h sleep, overtraining, severe deficit, and harmful habits', () => {
  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', weightKg: 82, restingHr: 54, hrv: 68, sleepHours: 8.0, completedHabits: [] },
    { date: '2026-05-02', weightKg: 82, restingHr: 54, hrv: 67, sleepHours: 8.0, completedHabits: [] },
    { date: '2026-05-03', weightKg: 82, restingHr: 55, hrv: 69, sleepHours: 8.0, completedHabits: [] },
    // Last 7 days: sleep < 6h, RHR spike, HRV drop, extreme deficit, low protein, alcohol + nicotine + stress
    { date: '2026-05-08', weightKg: 82, sleepHours: 5.5, sleepQuality: 2, restingHr: 60, hrv: 50, caloriesKcal: 1500, activeCalories: 800, proteinGrams: 95, completedHabits: ['Алкохол', 'Никотин'] },
    { date: '2026-05-09', weightKg: 82, sleepHours: 5.8, sleepQuality: 2, restingHr: 61, hrv: 49, caloriesKcal: 1450, activeCalories: 850, proteinGrams: 90, completedHabits: ['Алкохол', 'Висок стрес'] },
    { date: '2026-05-10', weightKg: 82, sleepHours: 5.6, sleepQuality: 2, restingHr: 60, hrv: 51, caloriesKcal: 1550, activeCalories: 750, proteinGrams: 92, completedHabits: ['Никотин', 'Висок стрес'] },
    { date: '2026-05-11', weightKg: 82, sleepHours: 5.4, sleepQuality: 2, restingHr: 61, hrv: 48, caloriesKcal: 1480, activeCalories: 820, proteinGrams: 88, completedHabits: ['Алкохол'] },
    { date: '2026-05-12', weightKg: 82, sleepHours: 5.9, sleepQuality: 2, restingHr: 60, hrv: 50, caloriesKcal: 1520, activeCalories: 800, proteinGrams: 94, completedHabits: ['Никотин'] },
    { date: '2026-05-13', weightKg: 82, sleepHours: 5.5, sleepQuality: 2, restingHr: 61, hrv: 49, caloriesKcal: 1500, activeCalories: 820, proteinGrams: 90, completedHabits: ['Висок стрес'] },
    { date: '2026-05-14', weightKg: 82, sleepHours: 5.7, sleepQuality: 2, restingHr: 61, hrv: 48, completedHabits: ['Алкохол'] },
  ];

  // 5 consecutive heavy days with sudden spike -> overtraining penalty
  const hevyWorkouts: HevyWorkout[] = [
    makeCompoundWorkout('h1', '2026-05-10', 'Heavy 1', 'Squat', 100),
    makeCompoundWorkout('h2', '2026-05-11', 'Heavy 2', 'Deadlift', 120),
    makeCompoundWorkout('h3', '2026-05-12', 'Heavy 3', 'Bench Press', 85),
    makeCompoundWorkout('h4', '2026-05-13', 'Heavy 4', 'Squat', 100),
    makeCompoundWorkout('h5', '2026-05-14', 'Heavy 5', 'Deadlift', 120),
  ];

  const report = computeAnabolicEnvironmentReport({
    dailyLogs,
    hevyWorkouts,
    profile: BASE_PROFILE,
    trainingGoal: 'fat_loss',
    todayKey: '2026-05-15',
  });

  assert.ok(report.totalScore < 50, `Expected suppressed score < 50, got ${report.totalScore}`);
  assert.equal(report.zone, 'low');
  assert.match(report.zoneTitle, /Потисната среда/);
  assert.equal(report.consecutiveHeavyDays, 5);
  assert.equal(report.actions48h.length, 3);
  assert.ok(
    report.actions48h.some((a) => a.factorId === 'sleep'),
    'Expected 48h sleep recovery action',
  );
  assert.ok(
    report.actions48h.some((a) => a.factorId === 'habits'),
    'Expected 48h clean habit reset action',
  );
});

test('buildGoalImpactCopy adapts dynamically to hypertrophy, fat_loss, and maintenance', () => {
  const hyp = buildGoalImpactCopy('hypertrophy');
  const cut = buildGoalImpactCopy('fat_loss');
  const maint = buildGoalImpactCopy('maintenance');

  assert.match(hyp.goalLabel, /Хипертрофия/i);
  assert.match(hyp.highText, /мускул/i);
  assert.match(hyp.lowText, /омазняване/i);

  assert.match(cut.goalLabel, /Сваляне/i);
  assert.match(cut.highText, /запазване на силата/i);
  assert.match(cut.lowText, /загуба на мускулна маса/i);

  assert.match(maint.goalLabel, /Поддържане/i);
  assert.match(maint.highText, /експлозивност|спаринг/i);
});

test('navigation exposes 4th Coach sub-tab testosterone-anabolic with breadcrumbs and hash parsing', () => {
  assert.equal(COACH_SUB_TABS.length, 4);
  assert.equal(COACH_SUB_TABS[3].id, 'testosterone-anabolic');
  assert.equal(COACH_SUB_TABS[3].emoji, '🧬');
  assert.equal(COACH_SUB_TABS[3].label, 'Тестостерон и Анаболна среда');

  assert.deepEqual(parseLocationFromHash('#/coach/testosterone-anabolic'), {
    page: 'coach',
    coachSubTab: 'testosterone-anabolic',
  });

  const crumbs = getBreadcrumbsForLocation({
    page: 'coach',
    coachSubTab: 'testosterone-anabolic',
  });
  assert.equal(crumbs.length, 3);
  assert.equal(crumbs[2].label, '🧬 Тестостерон и Анаболна среда');
});

test('formatSelectedDateBadge formats yesterday, today, and older dates consistently in DD.MM.YYYY', () => {
  const todayKey = '2026-11-20'; // Friday
  const yest = formatSelectedDateBadge('2026-11-19', todayKey);
  assert.equal(yest.kind, 'yesterday');
  assert.equal(yest.fullBadge, '📅 ВЧЕРА (19.11.2026)');
  assert.equal(yest.shortContext, 'Вчера');

  const tod = formatSelectedDateBadge('2026-11-20', todayKey);
  assert.equal(tod.kind, 'today');
  assert.equal(tod.fullBadge, '📅 ДНЕС (20.11.2026)');
  assert.equal(tod.shortContext, 'Днес');

  const older = formatSelectedDateBadge('2026-11-16', todayKey); // Monday
  assert.equal(older.kind, 'older');
  assert.equal(older.fullBadge, '📅 Понеделник, 16.11.2026');
  assert.equal(older.shortContext, 'Понеделник, 16.11.2026');
});
