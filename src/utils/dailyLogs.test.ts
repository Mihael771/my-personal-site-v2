import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_HABIT_ITEMS,
  buildLast7CompletedDaysOverview,
  computeDailyEnergySummary,
  computeHabitStreak,
  computeProteinPerKg,
  deleteDailyBiometricLog,
  estimateRestingCaloriesBmr,
  extractPreviousDayNutritionAndHabits,
  isDateIncludedForEveningMetric,
  mergePartialDailyLog,
  mergeUnifiedDailyLog,
  resolveAutoCheckInDate,
  resolveInitialCheckInContext,
  sanitizeDailyLogEntry,
  sanitizeDailyStepsGoal,
  upsertDailyBiometricLog,
} from './dailyLogs';
import { classifyHabitPolarity } from './habitBodyImpact';
import { parseDiaryPayload } from './fitnessMath';

test('upsertDailyBiometricLog inserts 1 entry per date, updates existing dates, and sorts newest first', () => {
  let logs = upsertDailyBiometricLog([], {
    date: '2026-11-16',
    weightKg: 80.5,
    sleepHours: 7.5,
    sleepQuality: 4,
    completedHabits: ['Креатин'],
  });
  logs = upsertDailyBiometricLog(logs, {
    date: '2026-11-18',
    weightKg: 80.2,
    sleepHours: 8,
    sleepQuality: 5,
    proteinGrams: 160,
    completedHabits: ['Креатин', '2.5+ л вода'],
  });
  // Update 2026-11-16 in place
  logs = upsertDailyBiometricLog(logs, {
    date: '2026-11-16',
    weightKg: 80.4,
    sleepHours: 7.0,
    sleepQuality: 3,
    completedHabits: ['Креатин', '2.5+ л вода'],
  });

  assert.equal(logs.length, 2);
  assert.equal(logs[0].date, '2026-11-18');
  assert.equal(logs[1].date, '2026-11-16');
  assert.equal(logs[1].weightKg, 80.4);

  const afterDelete = deleteDailyBiometricLog(logs, '2026-11-16');
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].date, '2026-11-18');
});

test('computeProteinPerKg and computeHabitStreak calculate accurate g/kg and consecutive day streaks', () => {
  assert.equal(computeProteinPerKg(160, 80), 2);
  assert.equal(computeProteinPerKg(120, 80), 1.5);
  assert.equal(computeProteinPerKg(undefined, 80), null);

  const logs = [
    { date: '2026-11-18', completedHabits: ['Креатин', '2.5+ л вода'] },
    { date: '2026-11-17', completedHabits: ['Креатин'] },
    { date: '2026-11-16', completedHabits: ['Креатин', '2.5+ л вода'] },
    // gap on 2026-11-15
    { date: '2026-11-14', completedHabits: ['Креатин'] },
  ];

  assert.equal(computeHabitStreak(logs, 'Креатин', '2026-11-18'), 3);
  assert.equal(computeHabitStreak(logs, '2.5+ л вода', '2026-11-18'), 1);
  assert.equal(computeHabitStreak(logs, 'Без захар / джънк', '2026-11-18'), 0);
});

test('parseDiaryPayload preserves dailyLogs, habitItems, and hevyWorkouts together', () => {
  const payload = JSON.stringify({
    profile: { name: 'Георги', heightCm: 182, weightKg: 81 },
    themeAccent: 'blue',
    logs: {},
    goals: [],
    habitItems: [...DEFAULT_HABIT_ITEMS, 'Омега-3'],
    dailyLogs: [
      {
        date: '2026-11-18',
        weightKg: 80.6,
        sleepHours: 7.5,
        sleepQuality: 4,
        restingHr: 56,
        caloriesKcal: 2600,
        proteinGrams: 155,
        cardioDistanceKm: 6.5,
        cardioDurationMinutes: 35,
        completedHabits: ['Креатин', 'Омега-3'],
      },
    ],
    hevyWorkouts: [
      {
        id: 'w1',
        title: 'Push Day',
        startTime: '18 Nov 2026, 18:00',
        date: '2026-11-18',
        exercises: [
          {
            title: 'Bench Press (Barbell)',
            sets: [{ setIndex: 0, setType: 'normal', weightKg: 80, reps: 8, rpe: 8 }],
            totalVolumeKg: 640,
            maxWeightKg: 80,
          },
        ],
        totalVolumeKg: 640,
        maxWeightKg: 80,
        totalSets: 1,
        importedAt: '2026-11-18T18:30:00Z',
      },
    ],
  });

  const parsed = parseDiaryPayload(payload);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.state.dailyLogs?.length, 1);
  assert.equal(parsed.state.dailyLogs?.[0].restingHr, 56);
  assert.equal(parsed.state.habitItems?.includes('Омега-3'), true);
  assert.equal(parsed.state.hevyWorkouts?.length, 1);
});

test('estimateRestingCaloriesBmr and computeDailyEnergySummary calculate Mifflin-St Jeor, 22x fallback, TDEE, and deficit/surplus labels', () => {
  // Mifflin-St Jeor: 10*80 + 6.25*180 - 150 + 5 = 1780 kcal
  const bmrMifflin = estimateRestingCaloriesBmr(80, 180);
  assert.deepEqual(bmrMifflin, { kcal: 1780, method: 'mifflin' });

  // Fallback without height: 22 * 80 = 1760 kcal
  const bmrFallback = estimateRestingCaloriesBmr(80, '');
  assert.deepEqual(bmrFallback, { kcal: 1760, method: 'weight_22x' });

  // Auto BMR + active calories -> TDEE = 1780 + 700 = 2480 -> Intake 2100 -> Дефицит: -380 kcal
  const deficit = computeDailyEnergySummary({
    caloriesIntake: 2100,
    activeCalories: 700,
    weightKg: 80,
    heightCm: 180,
  });
  assert.equal(deficit.restingSource, 'mifflin');
  assert.equal(deficit.tdee, 2480);
  assert.equal(deficit.netBalance, -380);
  assert.equal(deficit.status, 'deficit');
  assert.equal(deficit.label, 'Дефицит: -380 kcal');

  // Manual resting calories -> TDEE = 1850 + 600 = 2450 -> Intake 2740 -> Излишък: +290 kcal
  const surplus = computeDailyEnergySummary({
    caloriesIntake: 2740,
    activeCalories: 600,
    restingCalories: 1850,
    weightKg: 80,
    heightCm: 180,
  });
  assert.equal(surplus.restingSource, 'manual');
  assert.equal(surplus.tdee, 2450);
  assert.equal(surplus.netBalance, 290);
  assert.equal(surplus.status, 'surplus');
  assert.equal(surplus.label, 'Излишък: +290 kcal');
});

test('sanitizeDailyLogEntry and parseDiaryPayload preserve steps, activeCalories, restingCalories, and dailyStepsGoal', () => {
  const sanitized = sanitizeDailyLogEntry({
    date: '2026-11-19',
    steps: 11420,
    activeCalories: 680,
    restingCalories: 1820,
    caloriesIntake: 2350,
    completedHabits: [],
  });
  assert.ok(sanitized);
  assert.equal(sanitized.steps, 11420);
  assert.equal(sanitized.activeCalories, 680);
  assert.equal(sanitized.restingCalories, 1820);
  assert.equal(sanitized.caloriesKcal, 2350);
  assert.equal(sanitizeDailyStepsGoal(12500), 12500);

  const payload = JSON.stringify({
    profile: { name: 'Иван', heightCm: 180, weightKg: 80 },
    themeAccent: 'blue',
    logs: {},
    goals: [],
    dailyStepsGoal: 12000,
    dailyLogs: [sanitized],
  });
  const parsed = parseDiaryPayload(payload);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.state.dailyStepsGoal, 12000);
  assert.equal(parsed.state.dailyLogs?.[0].steps, 11420);
  assert.equal(parsed.state.dailyLogs?.[0].activeCalories, 680);
  assert.equal(parsed.state.dailyLogs?.[0].restingCalories, 1820);
});

test('resolveAutoCheckInDate and resolveInitialCheckInContext handle Yesterday vs Today logic before and after 19:00', () => {
  const todayKey = '2026-11-19';
  const yesterdayKey = '2026-11-18';

  // Morning mode always selects today
  const morningRes = resolveAutoCheckInDate({
    mode: 'morning',
    dailyLogs: [],
    todayKey,
    currentHour: 10,
  });
  assert.equal(morningRes.date, todayKey);
  assert.equal(morningRes.reason, 'morning_today');

  // Evening mode before 19:00 when yesterday has no steps/calories -> auto-switches to yesterday
  const eveningBefore19Empty = resolveAutoCheckInDate({
    mode: 'evening',
    dailyLogs: [{ date: yesterdayKey, weightKg: 80.5, completedHabits: [] }],
    todayKey,
    currentHour: 11,
  });
  assert.equal(eveningBefore19Empty.date, yesterdayKey);
  assert.equal(eveningBefore19Empty.reason, 'evening_yesterday_incomplete');

  // Evening mode before 19:00 when yesterday ALREADY has steps/calories -> stays on today
  const eveningBefore19Filled = resolveAutoCheckInDate({
    mode: 'evening',
    dailyLogs: [{ date: yesterdayKey, steps: 9800, completedHabits: [] }],
    todayKey,
    currentHour: 11,
  });
  assert.equal(eveningBefore19Filled.date, todayKey);
  assert.equal(eveningBefore19Filled.reason, 'evening_today');

  // Evening mode at/after 19:00 -> selects today even if yesterday was empty
  const eveningAfter19 = resolveAutoCheckInDate({
    mode: 'evening',
    dailyLogs: [],
    todayKey,
    currentHour: 20,
  });
  assert.equal(eveningAfter19.date, todayKey);

  // Initial context before 19:00 when today's morning is already done and yesterday's evening is missing
  const initialCtx = resolveInitialCheckInContext({
    dailyLogs: [{ date: todayKey, weightKg: 80.1, sleepHours: 7.5, completedHabits: [] }],
    todayKey,
    currentHour: 12,
  });
  assert.deepEqual(initialCtx, { mode: 'evening', date: yesterdayKey });
});

test('mergePartialDailyLog preserves untouched fields when saving in morning or evening mode', () => {
  const existing = {
    date: '2026-11-18',
    weightKg: 80.4,
    sleepHours: 7.5,
    sleepQuality: 4,
    restingHr: 56,
    caloriesKcal: 2400,
    proteinGrams: 165,
    steps: 11200,
    activeCalories: 650,
    completedHabits: ['Креатин', '2.5+ л вода'],
  };

  // Saving only morning fields preserves all evening fields
  const afterMorningUpdate = mergePartialDailyLog(
    existing,
    {
      date: '2026-11-18',
      weightKg: 80.1,
      sleepHours: 8.0,
      sleepQuality: 5,
      restingHr: 55,
      completedHabits: [],
    },
    'morning',
  );
  assert.equal(afterMorningUpdate.weightKg, 80.1);
  assert.equal(afterMorningUpdate.sleepHours, 8.0);
  assert.equal(afterMorningUpdate.steps, 11200);
  assert.equal(afterMorningUpdate.caloriesKcal, 2400);
  assert.equal(afterMorningUpdate.activeCalories, 650);
  assert.deepEqual(afterMorningUpdate.completedHabits, ['Креатин', '2.5+ л вода']);

  // Saving only evening fields preserves all morning fields
  const afterEveningUpdate = mergePartialDailyLog(
    existing,
    {
      date: '2026-11-18',
      steps: 12450,
      activeCalories: 720,
      caloriesKcal: 2550,
      proteinGrams: 170,
      completedHabits: ['Креатин'],
    },
    'evening',
  );
  assert.equal(afterEveningUpdate.weightKg, 80.4);
  assert.equal(afterEveningUpdate.sleepHours, 7.5);
  assert.equal(afterEveningUpdate.restingHr, 56);
  assert.equal(afterEveningUpdate.steps, 12450);
  assert.equal(afterEveningUpdate.caloriesKcal, 2550);
  assert.deepEqual(afterEveningUpdate.completedHabits, ['Креатин']);
});

test('buildLast7CompletedDaysOverview lists 7 completed days from yesterday backwards and isDateIncludedForEveningMetric excludes 0/empty today', () => {
  const todayKey = '2026-11-19';
  const overview = buildLast7CompletedDaysOverview({
    dailyLogs: [
      { date: '2026-11-19', weightKg: 80.0, steps: 0, completedHabits: [] },
      { date: '2026-11-18', weightKg: 80.2, sleepHours: 7.5, completedHabits: [] },
      { date: '2026-11-17', weightKg: 80.3, steps: 10400, caloriesKcal: 2400, activeCalories: 600, completedHabits: ['Креатин'] },
    ],
    todayKey,
    totalHabitsCount: 4,
    fallbackWeightKg: 80,
    heightCm: 180,
  });

  assert.equal(overview.length, 7);
  assert.equal(overview[0].date, '2026-11-18');
  assert.equal(overview[0].isYesterday, true);
  assert.equal(overview[0].morningFilled, true);
  assert.equal(overview[0].stepsFilled, false);
  assert.equal(overview[0].caloriesFilled, false);
  assert.equal(overview[0].suggestedMode, 'evening');

  assert.equal(overview[1].date, '2026-11-17');
  assert.equal(overview[1].morningFilled, true);
  assert.equal(overview[1].stepsFilled, true);
  assert.equal(overview[1].caloriesFilled, true);
  assert.equal(overview[6].date, '2026-11-12');

  // Today with 0 steps / empty habits is excluded; past date is included
  assert.equal(
    isDateIncludedForEveningMetric(
      { date: todayKey, steps: 0, caloriesKcal: 0, completedHabits: [] },
      todayKey,
      'steps',
    ),
    false,
  );
  assert.equal(
    isDateIncludedForEveningMetric(
      { date: todayKey, steps: 4500, completedHabits: ['Креатин'] },
      todayKey,
      'steps',
    ),
    true,
  );
  assert.equal(
    isDateIncludedForEveningMetric(
      { date: todayKey, completedHabits: [] },
      todayKey,
      'habits',
    ),
    false,
  );
});

test('mergeUnifiedDailyLog merges partial fields without erasing untouched existing values and preserves notes', () => {
  const existing = {
    date: '2026-11-18',
    weightKg: 80.5,
    sleepHours: 7.5,
    restingHr: 56,
    steps: 10800,
    caloriesKcal: 2450,
    proteinGrams: 165,
    completedHabits: ['Креатин', '2.5+ л вода'],
    notes: 'Добра тренировка за гръб',
  };

  // Partial save providing only activeCalories and new note preserves weight, sleep, steps, calories, habits
  const merged = mergeUnifiedDailyLog(existing, {
    date: '2026-11-18',
    activeCalories: 680,
    completedHabits: [],
    notes: 'Обновена бележка',
  });
  assert.equal(merged.weightKg, 80.5);
  assert.equal(merged.sleepHours, 7.5);
  assert.equal(merged.steps, 10800);
  assert.equal(merged.caloriesKcal, 2450);
  assert.equal(merged.activeCalories, 680);
  assert.deepEqual(merged.completedHabits, ['Креатин', '2.5+ л вода']);
  assert.equal(merged.notes, 'Обновена бележка');

  // Explicit clearedFields clears the targeted field
  const cleared = mergeUnifiedDailyLog(
    existing,
    { date: '2026-11-18', completedHabits: [] },
    new Set(['notes', 'steps']),
  );
  assert.equal(cleared.notes, undefined);
  assert.equal(cleared.steps, undefined);
  assert.equal(cleared.weightKg, 80.5);

  // sanitizeDailyLogEntry trims and preserves notes
  const sanitized = sanitizeDailyLogEntry({
    date: '2026-11-18',
    notes: '  Лека умора в краката  ',
    completedHabits: [],
  });
  assert.equal(sanitized?.notes, 'Лека умора в краката');
});

test('extractPreviousDayNutritionAndHabits copies only beneficial habits, calories, and protein from the preceding day', () => {
  const logs = [
    {
      date: '2026-11-17',
      caloriesKcal: 2520,
      proteinGrams: 172,
      completedHabits: ['Креатин', '2.5+ л вода', 'Алкохол', 'Късно лягане'],
    },
  ];

  const copied = extractPreviousDayNutritionAndHabits(
    logs,
    '2026-11-18',
    (h) => classifyHabitPolarity(h) === 'beneficial',
  );
  assert.equal(copied.found, true);
  assert.equal(copied.hasAnyData, true);
  assert.equal(copied.sourceDate, '2026-11-17');
  assert.equal(copied.caloriesKcal, 2520);
  assert.equal(copied.proteinGrams, 172);
  assert.deepEqual(copied.beneficialHabits, ['Креатин', '2.5+ л вода']);

  const missingPrev = extractPreviousDayNutritionAndHabits(
    logs,
    '2026-11-15',
    (h) => classifyHabitPolarity(h) === 'beneficial',
  );
  assert.equal(missingPrev.found, false);
  assert.equal(missingPrev.hasAnyData, false);
});

