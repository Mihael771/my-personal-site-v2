import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCalendarDuration,
  applyAutoDailyRollover,
  buildChronologicalHistoryRows,
  buildLast7DaysTrainingSummary,
  calculateDayGainsBreakdown,
  calculateDayTotalGain,
  calculateMuscleGainForDay,
  computeLast30DaysTrend,
  computeStatsUpToDate,
  createDefaultGoals,
  createSampleDiaryLogs,
  createSampleGoals,
  diffCalendarDays,
  evaluateGoal,
  exportDiaryPayload,
  generateBulkBackfillLogs,
  generateSleepRecoveryAdvice,
  getMonthGrid,
  getMuscleProgress,
  getSleepRecoveryInfo,
  normalizeMusclePercentsTo100,
  parseDiaryPayload,
  parseHuaweiSleepImport,
  sanitizeBodyMeasurements,
  shiftDateKey,
} from './fitnessMath';
import { cleanData } from './cleanData';
import type { DiaryState } from '../types/fitness';

test('sleep recovery gives 100% at >= 8 hours and fatigues under 6 hours', () => {
  const optimal = getSleepRecoveryInfo(8);
  assert.equal(optimal.multiplier, 1);
  assert.equal(optimal.percentage, 100);
  assert.equal(optimal.isFatigued, false);

  const overOptimal = getSleepRecoveryInfo(9.5);
  assert.equal(overOptimal.multiplier, 1);
  assert.equal(overOptimal.isFatigued, false);

  const underSix = getSleepRecoveryInfo(5);
  assert.equal(underSix.multiplier, 0.35);
  assert.equal(underSix.percentage, 35);
  assert.equal(underSix.isFatigued, true);

  const severe = getSleepRecoveryInfo(3);
  assert.equal(severe.multiplier, 0.15);
  assert.equal(severe.isFatigued, true);
});

test('daily muscle gain scales accurately by sleep recovery', () => {
  // Chest (5g) + Back (5.5g) + Shoulders (4.5g) = 15g at 8h sleep
  const fullGain = calculateDayTotalGain(['chest', 'back', 'shoulders'], 8);
  assert.equal(fullGain, 15);

  // Deduplicates duplicate muscle ids
  const deduped = calculateDayTotalGain(['chest', 'chest'], 8);
  assert.equal(deduped, 5);

  // Cuts gain sharply when sleeping 5h (0.35x)
  const lowSleepChest = calculateMuscleGainForDay('chest', 5);
  assert.equal(lowSleepChest, 1.8); // 5 * 0.35 = 1.75 -> 1.8 rounded to 0.1
  const lowSleepTotal = calculateDayTotalGain(['chest', 'back', 'shoulders'], 5);
  assert.ok(lowSleepTotal < fullGain);
});

test('computeStatsUpToDate isolates past dates from future dates', () => {
  const logs = {
    '2026-11-10': { date: '2026-11-10', sleepHours: 8, muscles: ['chest', 'biceps'] as const },
    '2026-11-12': { date: '2026-11-12', sleepHours: 5, muscles: ['chest'] as const },
    '2026-11-16': { date: '2026-11-16', sleepHours: 8, muscles: ['legs'] as const },
  };

  const mutableLogs = {
    '2026-11-10': { ...logs['2026-11-10'], muscles: [...logs['2026-11-10'].muscles] },
    '2026-11-12': { ...logs['2026-11-12'], muscles: [...logs['2026-11-12'].muscles] },
    '2026-11-16': { ...logs['2026-11-16'], muscles: [...logs['2026-11-16'].muscles] },
  };

  const past = computeStatsUpToDate(mutableLogs, '2026-11-10');
  assert.equal(past.byMuscle.chest.totalGrams, 5);
  assert.equal(past.byMuscle.chest.workoutCount, 1);
  assert.equal(past.byMuscle.chest.trainedOnDate, true);
  assert.equal(past.byMuscle.legs.totalGrams, 0);
  assert.equal(past.totalWorkouts, 1);

  const mid = computeStatsUpToDate(mutableLogs, '2026-11-12');
  assert.equal(mid.recovery.isFatigued, true);
  assert.equal(mid.byMuscle.chest.workoutCount, 2);
  assert.equal(mid.byMuscle.chest.totalGrams, 6.8); // 5 + 1.8

  const today = computeStatsUpToDate(mutableLogs, '2026-11-16');
  assert.equal(today.byMuscle.legs.totalGrams, 6);
  assert.equal(today.byMuscle.legs.trainedOnDate, true);
  assert.equal(today.totalWorkouts, 3);
});

test('progress bar milestone advances smoothly per workout', () => {
  const step1 = getMuscleProgress(5);
  assert.equal(step1.level, 1);
  assert.equal(step1.percent, 5);

  const step2 = getMuscleProgress(105);
  assert.equal(step2.level, 2);
  assert.equal(step2.currentInLevel, 5);
  assert.equal(step2.percent, 5);
});

test('export and import payload round-trip preserves goals and partial body measurements', () => {
  const todayKey = '2026-11-16';
  const sample: DiaryState = {
    profile: { name: 'Иван', heightCm: 182, weightKg: 81 },
    themeAccent: 'green',
    logs: {
      ...createSampleDiaryLogs(todayKey),
      [todayKey]: {
        date: todayKey,
        sleepHours: 8,
        muscles: ['chest'],
        weightKg: 78.6,
        bodyFatPercent: 16.4,
      },
    },
    goals: createSampleGoals(todayKey),
  };

  const serialized = exportDiaryPayload(sample);
  const parsed = parseDiaryPayload(serialized);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.profile.name, 'Иван');
    assert.equal(parsed.state.themeAccent, 'green');
    assert.equal(Object.keys(parsed.state.logs).length, 8);
    assert.equal(parsed.state.logs[todayKey].weightKg, 78.6);
    assert.equal(parsed.state.logs[todayKey].bodyFatPercent, 16.4);
    assert.equal(parsed.state.logs[todayKey].muscleMassKg, undefined);
    assert.equal(parsed.state.logs[todayKey].bodyFatKg, undefined);
    assert.equal(parsed.state.goals.length, 3);
    assert.equal(parsed.state.goals[0].enabled, true);
    assert.equal(parsed.state.goals[1].timeMode, 'estimate_time');
  }

  const bad = parseDiaryPayload('{not valid json');
  assert.equal(bad.ok, false);
});

test('sanitizeBodyMeasurements allows partial fields and omits empty ones', () => {
  const partial = sanitizeBodyMeasurements({ weightKg: 82.34, bodyFatPercent: 19.5 });
  assert.equal(partial.weightKg, 82.3);
  assert.equal(partial.bodyFatPercent, 19.5);
  assert.equal(partial.muscleMassKg, undefined);
  assert.equal(partial.bodyFatKg, undefined);
});

test('calendar grid starts on Monday and date shifting works across month boundaries', () => {
  assert.equal(shiftDateKey('2026-11-01', -1), '2026-10-31');
  const grid = getMonthGrid(2026, 10); // November 2026 (monthIndex 10)
  assert.equal(grid.length % 7, 0);
  // Nov 1 2026 is Sunday -> Monday offset is 6, so first cell is Oct 26
  assert.equal(grid[0].dateKey, '2026-10-26');
  assert.equal(grid[0].inCurrentMonth, false);
  assert.equal(grid[6].dateKey, '2026-11-01');
  assert.equal(grid[6].inCurrentMonth, true);

  assert.equal(addCalendarDuration('2026-01-31', 1, 'months'), '2026-02-28');
  assert.equal(diffCalendarDays('2026-11-01', '2026-11-17'), 16);
});

test('computeLast30DaysTrend builds 30 daily cumulative points including pre-window baseline', () => {
  const logs = {
    '2026-10-01': { date: '2026-10-01', sleepHours: 8, muscles: ['chest' as const] }, // +5g before 30-day window
    '2026-11-10': { date: '2026-11-10', sleepHours: 5, muscles: ['legs' as const] }, // +2.1g fatigued
    '2026-11-17': { date: '2026-11-17', sleepHours: 8, muscles: ['back' as const] }, // +5.5g today
  };

  const trend = computeLast30DaysTrend(logs, '2026-11-17', 30);
  assert.equal(trend.points.length, 30);
  assert.equal(trend.points[0].dateKey, '2026-10-19');
  assert.equal(trend.points[29].dateKey, '2026-11-17');
  assert.equal(trend.startBaselineGrams, 5);
  assert.equal(trend.activeDaysCount, 2);
  assert.equal(trend.windowGainGrams, 7.6);
  assert.equal(trend.endTotalGrams, 12.6);

  const nov10 = trend.points.find((p) => p.dateKey === '2026-11-10');
  assert.ok(nov10);
  assert.equal(nov10.isFatigued, true);
  assert.equal(nov10.cumulativeGrams, 7.1);
});

test('evaluateGoal handles target_weight, weight_loss, and muscle_mass_gain with time estimation', () => {
  const todayKey = '2026-11-17';
  const state: DiaryState = {
    profile: { name: 'Тест', heightCm: 180, weightKg: 80 },
    themeAccent: 'blue',
    logs: {
      '2026-11-04': { date: '2026-11-04', sleepHours: 8, muscles: ['chest', 'back'], weightKg: 82 }, // +10.5g
      '2026-11-11': { date: '2026-11-11', sleepHours: 8, muscles: ['legs', 'shoulders'], weightKg: 81 }, // +10.5g
      '2026-11-17': { date: '2026-11-17', sleepHours: 8, muscles: ['chest', 'biceps'], weightKg: 80 }, // +8.5g -> total 29.5g over 14 days
    },
    goals: createDefaultGoals(todayKey, 82),
  };

  // 1. Target weight until date (82 -> 78, currently 80 => 50%)
  const targetWeightGoal = {
    ...state.goals[0],
    enabled: true,
    type: 'target_weight' as const,
    timeMode: 'until_date' as const,
    startDate: '2026-11-04',
    startWeightKg: 82,
    targetValue: 78,
    targetDate: '2026-12-01',
  };
  const eval1 = evaluateGoal(targetWeightGoal, state, todayKey);
  assert.equal(eval1.hasRequiredData, true);
  assert.equal(eval1.progressPercent, 50);
  assert.equal(eval1.daysRemaining, 14);
  assert.equal(eval1.isCompleted, false);

  // 2. Weight loss for calendar duration (lose 4 kg, lost 2 kg => 50%)
  const lossGoal = {
    ...state.goals[2],
    enabled: true,
    type: 'weight_loss' as const,
    timeMode: 'calendar_duration' as const,
    startDate: '2026-11-04',
    startWeightKg: 82,
    targetValue: 4,
    durationValue: 4,
    durationUnit: 'weeks' as const,
  };
  const eval2 = evaluateGoal(lossGoal, state, todayKey);
  assert.equal(eval2.progressPercent, 50);
  assert.equal(eval2.deadlineDate, '2026-12-02');

  // 3. Muscle gain with estimate_time (29.5g over 14 days => ~2.11g/day; target 100g => ~70.5g left => 34 days)
  const muscleGoal = {
    ...state.goals[1],
    enabled: true,
    type: 'muscle_mass_gain' as const,
    timeMode: 'estimate_time' as const,
    startDate: '2026-11-04',
    targetValue: 100,
    muscleUnit: 'g' as const,
  };
  const eval3 = evaluateGoal(muscleGoal, state, todayKey);
  assert.equal(eval3.progressPercent, 30);
  assert.ok((eval3.estimatedDaysRemaining ?? 0) > 25);
  assert.ok(eval3.estimatedCompletionDate);
});

test('Huawei GT 6 sleep score drives recovery and muscle gain automatically and supports manual override', () => {
  // Optimal GT 6 score (92 pts) -> 100% even if sleep hours are 7.2
  const optimalGt6 = getSleepRecoveryInfo(7.2, { huaweiSleepScore: 92, recoveryMode: 'auto' });
  assert.equal(optimalGt6.source, 'huawei_gt6');
  assert.equal(optimalGt6.percentage, 100);
  assert.equal(optimalGt6.isFatigued, false);
  assert.equal(calculateDayTotalGain(['chest'], 7.2, { huaweiSleepScore: 92 }), 5);

  // Moderate GT 6 score (75 pts) -> 80% -> chest 5g * 0.8 = 4g
  const goodGt6 = getSleepRecoveryInfo(8, { huaweiSleepScore: 75, recoveryMode: 'auto' });
  assert.equal(goodGt6.percentage, 80);
  assert.equal(calculateMuscleGainForDay('chest', 8, { huaweiSleepScore: 75 }), 4);

  // Poor GT 6 score (50 pts < 60) -> fatigued, 44% -> chest 5g * 0.44 = 2.2g
  const fatiguedGt6 = getSleepRecoveryInfo(8, { huaweiSleepScore: 50, recoveryMode: 'auto' });
  assert.equal(fatiguedGt6.isFatigued, true);
  assert.equal(fatiguedGt6.percentage, 44);
  assert.equal(calculateMuscleGainForDay('chest', 8, { huaweiSleepScore: 50 }), 2.2);

  // Manual override supersedes GT 6 score
  const manualOverride = getSleepRecoveryInfo(5, {
    huaweiSleepScore: 50,
    recoveryMode: 'manual',
    manualRecoveryPercent: 80,
  });
  assert.equal(manualOverride.source, 'manual');
  assert.equal(manualOverride.percentage, 80);
  assert.equal(manualOverride.isFatigued, false);
  assert.equal(
    calculateMuscleGainForDay('chest', 5, {
      huaweiSleepScore: 50,
      recoveryMode: 'manual',
      manualRecoveryPercent: 80,
    }),
    4,
  );
});

test('parseHuaweiSleepImport parses Huawei Health JSON, CSV, and text formats cleanly', () => {
  const jsonInput = JSON.stringify({
    sleep: [
      { recordDay: 20261115, sleepScore: 88, allSleepTime: 465 },
      { date: '2026-11-16', score: 54, sleepHours: 5.5 },
    ],
  });
  const parsedJson = parseHuaweiSleepImport(jsonInput);
  assert.equal(parsedJson.ok, true);
  if (parsedJson.ok) {
    assert.equal(parsedJson.entries.length, 2);
    assert.equal(parsedJson.entries[0].date, '2026-11-15');
    assert.equal(parsedJson.entries[0].huaweiSleepScore, 88);
    assert.equal(parsedJson.entries[0].sleepHours, 7.8);
    assert.equal(parsedJson.entries[1].huaweiSleepScore, 54);
    assert.equal(parsedJson.entries[1].sleepHours, 5.5);
  }

  const csvInput = `Дата,Точки,Часове\n16.11.2026; 91; 8:15\n2026-11-17, 74, 7.0`;
  const parsedCsv = parseHuaweiSleepImport(csvInput);
  assert.equal(parsedCsv.ok, true);
  if (parsedCsv.ok) {
    assert.equal(parsedCsv.entries.length, 2);
    assert.equal(parsedCsv.entries[0].date, '2026-11-16');
    assert.equal(parsedCsv.entries[0].huaweiSleepScore, 91);
    assert.equal(parsedCsv.entries[0].sleepHours, 8.3);
    assert.equal(parsedCsv.entries[1].date, '2026-11-17');
    assert.equal(parsedCsv.entries[1].huaweiSleepScore, 74);
  }

  const bad = parseHuaweiSleepImport('няма валидни дати');
  assert.equal(bad.ok, false);
});

test('generateSleepRecoveryAdvice produces contextual tips from sleep duration, GT 6 score, and 7-day history', () => {
  const todayKey = '2026-11-17';

  // 1. Quality mismatch: 8.2h sleep but Huawei GT 6 score is 54 (< 65) + 2 fatigued days in 7d
  const fatiguedLogs = {
    '2026-11-15': { date: '2026-11-15', sleepHours: 5.2, muscles: ['chest' as const] },
    '2026-11-17': {
      date: todayKey,
      sleepHours: 8.2,
      huaweiSleepScore: 54,
      muscles: ['back' as const, 'biceps' as const],
    },
  };
  const fatiguedAdvice = generateSleepRecoveryAdvice(fatiguedLogs, todayKey);
  assert.equal(fatiguedAdvice.hasLoggedData, true);
  assert.equal(fatiguedAdvice.fatiguedDays7d, 2);
  assert.ok(fatiguedAdvice.tips.some((t) => t.id === 'gt6-quality-mismatch'));
  assert.ok(fatiguedAdvice.tips.some((t) => t.id === 'sleep-debt-7d'));
  assert.ok(fatiguedAdvice.tips.some((t) => t.id === 'heavy-load-low-recovery'));

  // 2. Peak recovery with steady 7-day sleep + manual override comparison
  const peakLogs = {
    '2026-11-14': { date: '2026-11-14', sleepHours: 8.0, huaweiSleepScore: 90, muscles: [] },
    '2026-11-16': { date: '2026-11-16', sleepHours: 8.1, huaweiSleepScore: 92, muscles: ['legs' as const] },
    '2026-11-17': {
      date: todayKey,
      sleepHours: 8.2,
      huaweiSleepScore: 94,
      recoveryMode: 'manual' as const,
      manualRecoveryPercent: 85,
      muscles: ['chest' as const],
    },
  };
  const peakAdvice = generateSleepRecoveryAdvice(peakLogs, todayKey);
  assert.equal(peakAdvice.fatiguedDays7d, 0);
  assert.equal(peakAdvice.avgHuaweiScore7d, 92);
  assert.ok(peakAdvice.tips.some((t) => t.id === 'manual-mode-comparison'));
  assert.ok(peakAdvice.tips.some((t) => t.id === 'steady-7d-streak'));
});

test('cleanData recursively removes undefined from objects and arrays while preserving FieldValue sentinels', () => {
  class MockServerTimestamp {
    _methodName = 'serverTimestamp';
  }
  const sentinel = new MockServerTimestamp();
  const dirty = {
    ownerUid: 'uid-1',
    profile: { name: '', heightCm: '', weightKg: '', extra: undefined },
    goals: [
      { id: 'goal-1', startWeightKg: undefined, nested: { a: 1, b: undefined } },
      undefined,
      { id: 'goal-2', startWeightKg: 80 },
    ],
    updatedAt: sentinel,
    emptyField: undefined,
  };

  const cleaned = cleanData(dirty);
  assert.equal('emptyField' in cleaned, false);
  assert.equal('extra' in cleaned.profile, false);
  assert.equal(cleaned.goals.length, 2);
  assert.equal('startWeightKg' in cleaned.goals[0]!, false);
  assert.equal('b' in cleaned.goals[0]!.nested!, false);
  assert.equal(cleaned.goals[1]!.startWeightKg, 80);
  assert.equal(cleaned.updatedAt, sentinel);

  const defaultGoals = createDefaultGoals('2026-11-17');
  for (const goal of defaultGoals) {
    assert.equal('startWeightKg' in goal, false);
  }
});

test('custom daily muscle mass gain scales automatically with sleep/recovery and supports manual daily grams', () => {
  // 1. Auto mode with custom 25g/day scaled by Huawei GT 6 score 75 (80% recovery -> 20g)
  const autoLogs = {
    '2026-11-17': {
      date: '2026-11-17',
      sleepHours: 8,
      huaweiSleepScore: 75,
      recoveryMode: 'auto' as const,
      muscleGainMode: 'auto' as const,
      muscles: ['chest' as const, 'legs' as const],
    },
  };
  const autoStats = computeStatsUpToDate(autoLogs, '2026-11-17', 25);
  assert.equal(autoStats.gainMode, 'auto');
  assert.equal(autoStats.effectiveBaseDailyGrams, 25);
  assert.equal(autoStats.gainedOnDateTotal, 20);
  assert.equal(
    Math.round((autoStats.byMuscle.chest.gainedOnDate + autoStats.byMuscle.legs.gainedOnDate) * 10) / 10,
    20,
  );

  // 2. Poor sleep (5h -> 35% recovery) reduces 25g/day to 8.8g
  const fatiguedStats = computeStatsUpToDate(
    {
      '2026-11-17': {
        date: '2026-11-17',
        sleepHours: 5,
        muscleGainMode: 'auto',
        muscles: ['chest'],
      },
    },
    '2026-11-17',
    25,
  );
  assert.equal(fatiguedStats.recovery.isFatigued, true);
  assert.equal(fatiguedStats.gainedOnDateTotal, 8.8);

  // 3. Manual mode exact grams (even with 0 muscles picked) updates totals, trend, and goals
  const manualLogs = {
    '2026-11-16': {
      date: '2026-11-16',
      sleepHours: 5,
      muscleGainMode: 'manual' as const,
      manualGainGrams: 18.5,
      muscles: [],
    },
    '2026-11-17': {
      date: '2026-11-17',
      sleepHours: 8,
      muscleGainMode: 'manual' as const,
      manualGainGrams: 12,
      muscles: ['chest' as const, 'biceps' as const],
    },
  };
  const manualStats = computeStatsUpToDate(manualLogs, '2026-11-17', 25);
  assert.equal(manualStats.gainMode, 'manual');
  assert.equal(manualStats.gainedOnDateTotal, 12);
  assert.equal(manualStats.totalCumulativeGrams, 30.5);
  assert.equal(
    Math.round((manualStats.byMuscle.chest.gainedOnDate + manualStats.byMuscle.biceps.gainedOnDate) * 10) / 10,
    12,
  );

  const trend = computeLast30DaysTrend(manualLogs, '2026-11-17', 30, 25);
  assert.equal(trend.activeDaysCount, 2);
  assert.equal(trend.endTotalGrams, 30.5);

  // 4. Payload round-trip preserves dailyMuscleGainGrams and per-day gain fields
  const breakdown = calculateDayGainsBreakdown(manualLogs['2026-11-16'], 25);
  assert.equal(breakdown.totalGrams, 18.5);
  const serialized = exportDiaryPayload({
    profile: { name: 'Тест', heightCm: 180, weightKg: 80 },
    themeAccent: 'blue',
    dailyMuscleGainGrams: 25,
    logs: manualLogs,
    goals: createDefaultGoals('2026-11-17', 80),
  });
  const parsed = parseDiaryPayload(serialized);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.dailyMuscleGainGrams, 25);
    assert.equal(parsed.state.logs['2026-11-16'].muscleGainMode, 'manual');
    assert.equal(parsed.state.logs['2026-11-16'].manualGainGrams, 18.5);
  }
});

test('rest-day accrual, auto rollover, per-muscle trend, history rows, and MuscleTrackerDB_v2 import', () => {
  // 1. Rest-day accrual distributes 15.5g evenly across 7 muscles on rest day
  const restLogs = {
    '2026-11-16': {
      date: '2026-11-16',
      sleepHours: 8,
      trained: false,
      muscles: [] as const,
    },
    '2026-11-17': {
      date: '2026-11-17',
      sleepHours: 8,
      trained: true,
      muscles: ['chest' as const],
    },
  };
  const restStats = computeStatsUpToDate(
    {
      '2026-11-16': { ...restLogs['2026-11-16'], muscles: [] },
      '2026-11-17': { ...restLogs['2026-11-17'], muscles: ['chest'] },
    },
    '2026-11-17',
    15.5,
    true,
  );
  assert.equal(restStats.totalCumulativeGrams, 31);
  assert.equal(restStats.totalWorkouts, 1);

  const trend = computeLast30DaysTrend(
    {
      '2026-11-16': { ...restLogs['2026-11-16'], muscles: [] },
      '2026-11-17': { ...restLogs['2026-11-17'], muscles: ['chest'] },
    },
    '2026-11-17',
    30,
    15.5,
    true,
  );
  const lastPt = trend.points[trend.points.length - 1];
  assert.equal(lastPt.cumulativeGrams, 31);
  assert.ok(lastPt.byMuscleCumulative.chest > 15.5);

  const history = buildChronologicalHistoryRows(
    {
      '2026-11-16': { ...restLogs['2026-11-16'], muscles: [] },
      '2026-11-17': { ...restLogs['2026-11-17'], muscles: ['chest'] },
    },
    15.5,
    true,
  );
  assert.equal(history.length, 2);
  assert.equal(history[0].dayNumber, 1);
  assert.equal(history[0].trained, false);
  assert.equal(history[0].dailyGainGrams, 15.5);
  assert.equal(history[1].dayNumber, 2);
  assert.equal(history[1].cumulativeGrams, 31);

  // 2. Auto daily rollover fills missing days up to today
  const rolloverRes = applyAutoDailyRollover(
    {
      profile: { name: '', heightCm: '', weightKg: '' },
      themeAccent: 'blue',
      autoAccrueDaily: true,
      dailyMuscleGainGrams: 15.5,
      logs: {
        '2026-11-15': { date: '2026-11-15', sleepHours: 8, trained: true, muscles: ['legs'] },
      },
      goals: createDefaultGoals('2026-11-17'),
    },
    '2026-11-17',
  );
  assert.equal(rolloverRes.changed, true);
  assert.equal(Object.keys(rolloverRes.state.logs).length, 3);
  assert.equal(rolloverRes.state.logs['2026-11-16']?.trained, false);
  assert.equal(rolloverRes.state.logs['2026-11-17']?.trained, false);

  // 3. MuscleTrackerDB_v2 JSON compatibility
  const legacyPayload = JSON.stringify({
    dailyGainRateGrams: 15.5,
    entries: [
      { date: '2026-11-15', trained: true, gainedGrams: 15.5, groups: ['arms', 'core'] },
      { date: '2026-11-16', trained: false, gainedGrams: 15.5, groups: [] },
    ],
  });
  const imported = parseDiaryPayload(legacyPayload);
  assert.equal(imported.ok, true);
  if (imported.ok) {
    assert.equal(imported.state.dailyMuscleGainGrams, 15.5);
    assert.equal(imported.state.autoAccrueDaily, true);
    assert.equal(imported.state.accrueOnRestDays, true);
    assert.deepEqual(imported.state.logs['2026-11-15'].muscles, ['biceps', 'triceps', 'abs']);
    assert.equal(imported.state.logs['2026-11-16'].trained, false);
    assert.equal(imported.state.logs['2026-11-16'].manualGainGrams, 15.5);
  }
});

test('generateBulkBackfillLogs splits total grams across old dates up to today and preserves existing days', () => {
  // 1. Total grams (100g) over 3 days -> 33.3 + 33.3 + 33.4 = 100.0g across chest & back
  const totalRes = generateBulkBackfillLogs({
    startDate: '2026-11-16',
    endDate: '2026-11-18',
    mode: 'total_grams',
    amountGrams: 100,
    muscles: ['chest', 'back'],
    overwriteExisting: true,
    existingLogs: {},
  });
  assert.equal(totalRes.targetDates.length, 3);
  assert.equal(totalRes.totalAddedGrams, 100);
  assert.equal(totalRes.mergedLogs['2026-11-16'].manualGainGrams, 33.3);
  assert.equal(totalRes.mergedLogs['2026-11-18'].manualGainGrams, 33.4);

  const stats = computeStatsUpToDate(totalRes.mergedLogs, '2026-11-18');
  assert.equal(stats.totalCumulativeGrams, 100);
  assert.ok(stats.byMuscle.chest.totalGrams > 0 && stats.byMuscle.back.totalGrams > 0);

  // 2. Skipping existing logged training day when overwriteExisting=false preserves existing data
  const skipRes = generateBulkBackfillLogs({
    startDate: '2026-11-16',
    endDate: '2026-11-18',
    mode: 'daily_grams',
    amountGrams: 20,
    muscles: ['legs'],
    overwriteExisting: false,
    existingLogs: {
      '2026-11-17': {
        date: '2026-11-17',
        sleepHours: 8,
        trained: true,
        muscles: ['shoulders'],
        weightKg: 80.5,
      },
      '2026-11-18': {
        date: '2026-11-18',
        sleepHours: 7.5,
        muscles: [],
        weightKg: 80.2,
      },
    },
  });
  assert.deepEqual(skipRes.targetDates, ['2026-11-16', '2026-11-18']);
  assert.deepEqual(skipRes.mergedLogs['2026-11-17'].muscles, ['shoulders']);
  // Preserves body measurement & sleep on measurement-only day while adding manual muscle gain
  assert.equal(skipRes.mergedLogs['2026-11-18'].weightKg, 80.2);
  assert.equal(skipRes.mergedLogs['2026-11-18'].sleepHours, 7.5);
  assert.equal(skipRes.mergedLogs['2026-11-18'].manualGainGrams, 20);

  // 3. Large baseline > 500g is supported on a single day
  const largeSingle = generateBulkBackfillLogs({
    startDate: '2026-11-18',
    endDate: '2026-11-18',
    mode: 'total_grams',
    amountGrams: 1250,
    muscles: ['chest'],
    overwriteExisting: true,
    existingLogs: {},
  });
  assert.equal(largeSingle.mergedLogs['2026-11-18'].manualGainGrams, 1250);
});

test('buildLast7DaysTrainingSummary aggregates 7-day workout load, muscle frequency, sleep, and gain', () => {
  const logs = {
    '2026-11-12': {
      date: '2026-11-12',
      sleepHours: 7.5,
      huaweiSleepScore: 82,
      trained: true,
      muscles: ['chest' as const, 'triceps' as const],
    },
    '2026-11-15': {
      date: '2026-11-15',
      sleepHours: 5.2,
      huaweiSleepScore: 54,
      trained: true,
      muscles: ['chest' as const, 'back' as const],
    },
    '2026-11-18': {
      date: '2026-11-18',
      sleepHours: 8.2,
      huaweiSleepScore: 91,
      trained: false,
      muscles: [],
    },
  };

  const summary = buildLast7DaysTrainingSummary(logs, '2026-11-18', 15.5, true);
  assert.equal(summary.startDate, '2026-11-12');
  assert.equal(summary.endDate, '2026-11-18');
  assert.equal(summary.days.length, 7);
  assert.equal(summary.workoutDays7d, 2);
  assert.equal(summary.restDays7d, 5);
  assert.equal(summary.fatiguedDays7d, 1);
  assert.equal(summary.muscleFrequency['Гърди'], 2);
  assert.equal(summary.muscleFrequency['Трицепс'], 1);
  assert.equal(summary.muscleFrequency['Гръб'], 1);
  assert.ok(summary.avgSleepHours7d !== null && summary.avgSleepHours7d > 6);
  assert.equal(summary.avgHuaweiScore7d, 76);
  assert.ok(summary.totalGained7dGrams > 0);
});

test('custom per-muscle percentage allocation and exact per-muscle daily grams work across stats, trends, and serialization', () => {
  // 1. Normalize percents cleanly to exact 100
  const normalized = normalizeMusclePercentsTo100({
    chest: 2,
    back: 2,
    legs: 4,
    shoulders: 0,
    biceps: 0,
    triceps: 0,
    abs: 0,
  });
  const normSum = Object.values(normalized).reduce((s, v) => s + v, 0);
  assert.equal(normSum, 100);
  assert.equal(normalized.legs, 50);
  assert.equal(normalized.chest, 25);
  assert.equal(normalized.shoulders, 0);

  // 2. trained_only scope distributes 20g between trained muscles by custom %
  const trainedLogs = {
    '2026-11-18': {
      date: '2026-11-18',
      sleepHours: 8,
      trained: true,
      muscles: ['chest' as const, 'biceps' as const],
    },
  };
  const customTrainedConfig = {
    mode: 'custom_percent' as const,
    scope: 'trained_only' as const,
    percents: {
      chest: 75,
      biceps: 25,
      back: 0,
      shoulders: 0,
      triceps: 0,
      abs: 0,
      legs: 0,
    },
  };
  const trainedStats = computeStatsUpToDate(
    trainedLogs,
    '2026-11-18',
    20,
    false,
    customTrainedConfig,
  );
  assert.equal(trainedStats.gainedOnDateTotal, 20);
  assert.equal(trainedStats.byMuscle.chest.gainedOnDate, 15);
  assert.equal(trainedStats.byMuscle.biceps.gainedOnDate, 5);

  // 3. all_groups scope sends exact % of daily mass to all 7 groups (including 0% -> 0g)
  const allGroupsConfig = {
    mode: 'custom_percent' as const,
    scope: 'all_groups' as const,
    percents: {
      chest: 40,
      back: 30,
      legs: 30,
      shoulders: 0,
      biceps: 0,
      triceps: 0,
      abs: 0,
    },
  };
  const allGroupsStats = computeStatsUpToDate(
    trainedLogs,
    '2026-11-18',
    20,
    false,
    allGroupsConfig,
  );
  assert.equal(allGroupsStats.gainedOnDateTotal, 20);
  assert.equal(allGroupsStats.byMuscle.chest.gainedOnDate, 8);
  assert.equal(allGroupsStats.byMuscle.back.gainedOnDate, 6);
  assert.equal(allGroupsStats.byMuscle.legs.gainedOnDate, 6);
  assert.equal(allGroupsStats.byMuscle.shoulders.gainedOnDate, 0);

  // 4. Exact per-muscle manual grams for a day
  const perMuscleLogs = {
    '2026-11-18': {
      date: '2026-11-18',
      sleepHours: 8,
      muscleGainMode: 'manual' as const,
      manualGainGrams: 12.5,
      manualMuscleGrams: {
        chest: 7.5,
        triceps: 5.0,
      },
      trained: true,
      muscles: ['chest' as const, 'triceps' as const],
    },
  };
  const perMuscleStats = computeStatsUpToDate(perMuscleLogs, '2026-11-18');
  assert.equal(perMuscleStats.gainedOnDateTotal, 12.5);
  assert.equal(perMuscleStats.byMuscle.chest.totalGrams, 7.5);
  assert.equal(perMuscleStats.byMuscle.triceps.totalGrams, 5.0);

  // 5. Payload round-trip preserves allocation settings and manualMuscleGrams
  const serialized = exportDiaryPayload({
    profile: { name: 'Тест', heightCm: 180, weightKg: 80 },
    themeAccent: 'blue',
    dailyMuscleGainGrams: 20,
    muscleAllocationMode: 'custom_percent',
    muscleAllocationScope: 'all_groups',
    muscleAllocations: { chest: 40, back: 30, legs: 30 },
    logs: perMuscleLogs,
    goals: createDefaultGoals('2026-11-18'),
  });
  const parsed = parseDiaryPayload(serialized);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.muscleAllocationMode, 'custom_percent');
    assert.equal(parsed.state.muscleAllocationScope, 'all_groups');
    assert.equal(parsed.state.muscleAllocations?.chest, 40);
    assert.equal(parsed.state.logs['2026-11-18'].manualMuscleGrams?.chest, 7.5);
  }
});

