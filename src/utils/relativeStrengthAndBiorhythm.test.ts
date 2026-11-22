import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import { parseDiaryPayload } from './fitnessMath';
import {
  analyzeOptimalTrainingTime,
  analyzeRelativeStrengthAndBoxing,
  extractDailyWeightSamples,
  extractLocalHourFromStartTime,
  isBoxingWorkout,
  resolveWeightForDate,
} from './relativeStrengthAndBiorhythm';

function makeWorkout(partial: {
  id: string;
  title: string;
  date: string;
  startTime: string;
  exercises: Array<{
    title: string;
    sets: Array<{ weightKg?: number; reps?: number; setType?: string }>;
  }>;
}): HevyWorkout {
  let totalVolumeKg = 0;
  let maxWeightKg = 0;
  let totalSets = 0;

  const exercises = partial.exercises.map((ex) => {
    let exVol = 0;
    let exMax = 0;
    const sets = ex.sets.map((s, idx) => {
      const w = s.weightKg ?? 0;
      const r = s.reps ?? 0;
      if (w > 0 && r > 0) exVol += w * r;
      if (w > exMax) exMax = w;
      totalSets += 1;
      return {
        setIndex: idx,
        ...(s.setType ? { setType: s.setType } : {}),
        ...(s.weightKg !== undefined ? { weightKg: s.weightKg } : {}),
        ...(s.reps !== undefined ? { reps: s.reps } : {}),
      };
    });
    totalVolumeKg += exVol;
    if (exMax > maxWeightKg) maxWeightKg = exMax;
    return {
      title: ex.title,
      sets,
      totalVolumeKg: exVol,
      maxWeightKg: exMax,
    };
  });

  return {
    id: partial.id,
    title: partial.title,
    date: partial.date,
    startTime: partial.startTime,
    exercises,
    totalVolumeKg,
    maxWeightKg,
    totalSets,
    importedAt: '2026-05-01T10:00:00.000Z',
  };
}

function makeDailyLog(partial: Partial<DailyBiometricLog> & { date: string }): DailyBiometricLog {
  return {
    completedHabits: [],
    ...partial,
  };
}

test('resolveWeightForDate uses exact date, then nearest ±7 days, then latest known', () => {
  const logs: DailyBiometricLog[] = [
    makeDailyLog({ date: '2026-04-01', weightKg: 82.0 }),
    makeDailyLog({ date: '2026-04-10', weightKg: 81.2 }),
    makeDailyLog({ date: '2026-04-28', weightKg: 80.4 }),
  ];
  const samples = extractDailyWeightSamples(logs);

  const exact = resolveWeightForDate('2026-04-10', samples, 85);
  assert.equal(exact?.source, 'exact');
  assert.equal(exact?.weightKg, 81.2);
  assert.equal(exact?.dayOffset, 0);

  const nearest = resolveWeightForDate('2026-04-13', samples, 85);
  assert.equal(nearest?.source, 'nearest_7d');
  assert.equal(nearest?.weightKg, 81.2);
  assert.equal(nearest?.dayOffset, -3);

  const fallbackLatest = resolveWeightForDate('2026-04-20', samples, 85);
  assert.equal(fallbackLatest?.source, 'latest_known');
  assert.equal(fallbackLatest?.weightKg, 80.4);
});

test('Module 1 excludes boxing sessions, computes BW+added and barbell 1RM/BW ratios, and tracks boxing weight classes', () => {
  const dailyLogs: DailyBiometricLog[] = [
    makeDailyLog({ date: '2026-03-15', weightKg: 80.0 }),
    makeDailyLog({ date: '2026-04-20', weightKg: 82.4 }),
    makeDailyLog({ date: '2026-04-22', weightKg: 82.6 }),
    makeDailyLog({ date: '2026-04-24', weightKg: 82.2 }),
  ];

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w-box-1',
      title: 'Бокс и спаринг на чувал',
      date: '2026-04-19',
      startTime: '19 Apr 2026, 18:30',
      exercises: [{ title: 'Heavy Bag Rounds', sets: [{ reps: 6 }] }],
    }),
    makeWorkout({
      id: 'w-str-1',
      title: 'Upper Strength',
      date: '2026-03-15',
      startTime: '15 Mar 2026, 14:00',
      exercises: [
        { title: 'Weighted Pull Up', sets: [{ weightKg: 10, reps: 6 }] },
        { title: 'Bench Press (Barbell)', sets: [{ weightKg: 80, reps: 6 }] }, // 1RM = 80*(1+6/30) = 96 -> 96/80 = 1.20x
      ],
    }),
    makeWorkout({
      id: 'w-str-2',
      title: 'Upper Strength',
      date: '2026-04-21', // nearest ±7d weight -> 2026-04-20 (82.4 kg)
      startTime: '21 Apr 2026, 14:15',
      exercises: [
        { title: 'Weighted Pull Up', sets: [{ weightKg: 20, reps: 6 }] }, // (82.4+20)/82.4 = 1.24x
        { title: 'Bench Press (Barbell)', sets: [{ weightKg: 90, reps: 6 }] }, // 1RM = 108 -> 108/82.4 = 1.31x
      ],
    }),
  ];

  assert.equal(isBoxingWorkout(workouts[0]), true);
  assert.equal(isBoxingWorkout(workouts[1]), false);

  const report = analyzeRelativeStrengthAndBoxing({
    hevyWorkouts: workouts,
    dailyLogs,
    targetWeightKg: 81.0,
    todayKey: '2026-04-25',
    windowDays: 90,
  });

  assert.equal(report.excludedBoxingWorkoutsCount, 1);
  assert.equal(report.strengthWorkoutsAnalyzed, 2);

  const pullUp = report.movements.find((m) => m.id === 'pull_up');
  assert.ok(pullUp);
  assert.equal(pullUp.latestPoint.bodyWeightKg, 82.4);
  assert.equal(pullUp.latestPoint.primaryLoadKg, 102.4);
  assert.equal(pullUp.latestPoint.ratio, 1.24);

  const bench = report.movements.find((m) => m.id === 'bench_press');
  assert.ok(bench);
  assert.equal(bench.latestPoint.primaryLoadKg, 108);
  assert.equal(bench.latestPoint.ratio, 1.31);

  assert.equal(report.trendVerdict, 'gaining');
  assert.ok((report.compositeDeltaRatio ?? 0) > 0);

  // 7-day average weight: (82.4 + 82.6 + 82.2) / 3 = 82.4 kg -> Cruiserweight (up to 86 kg), +1.4 kg over 81 kg target
  assert.equal(report.boxingWeight.avgWeight7d, 82.4);
  assert.equal(report.boxingWeight.currentClass?.id, 'cruiser');
  assert.equal(report.boxingWeight.diffToTargetKg, 1.4);
  const lightHeavy = report.boxingWeight.allClasses.find((c) => c.id === 'light_heavy');
  assert.equal(lightHeavy?.diffKg, 1.4);
});

test('userSettings.targetWeight round-trips through parseDiaryPayload', () => {
  const payload = JSON.stringify({
    profile: { name: 'Test', heightCm: 180, weightKg: 82 },
    themeAccent: 'blue',
    logs: {},
    goals: [],
    userSettings: {
      goal: 'maintenance',
      intervalsApiKey: 'demo-key',
      targetWeight: 80.5,
    },
  });

  const parsed = parseDiaryPayload(payload);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.userSettings?.targetWeight, 80.5);
    assert.equal(parsed.state.userSettings?.intervalsApiKey, 'demo-key');
    assert.equal(parsed.state.userSettings?.goal, 'maintenance');
  }
});

test('extractLocalHourFromStartTime parses 24h, ISO, BG dot, and AM/PM formats', () => {
  assert.equal(extractLocalHourFromStartTime('17 Nov 2026, 18:10'), 18);
  assert.equal(extractLocalHourFromStartTime('2026-11-17 08:30:00'), 8);
  assert.equal(extractLocalHourFromStartTime('2026-11-17T14:05:00'), 14);
  assert.equal(extractLocalHourFromStartTime('Nov 17, 2026, 6:10 PM'), 18);
  assert.equal(extractLocalHourFromStartTime('Nov 17, 2026, 12:15 AM'), 0);
  assert.equal(extractLocalHourFromStartTime('17.11.2026 19:45'), 19);
});

test('Module 2 compares windows with >= 3 workouts, links D+1 sleep & RHR delta, and gates < 3 windows', () => {
  // Build baseline RHR ~52 bpm across prior 14 days
  const dailyLogs: DailyBiometricLog[] = [];
  for (let d = 1; d <= 14; d++) {
    dailyLogs.push(
      makeDailyLog({
        date: `2026-04-${String(d).padStart(2, '0')}`,
        restingHr: 52,
        sleepHours: 7.8,
        sleepQuality: 4,
      }),
    );
  }

  // Next-morning logs after afternoon workouts (good sleep, flat RHR 52)
  dailyLogs.push(
    makeDailyLog({ date: '2026-04-16', restingHr: 52, sleepHours: 8.1, sleepQuality: 5 }),
    makeDailyLog({ date: '2026-04-18', restingHr: 51, sleepHours: 8.0, sleepQuality: 4 }),
    makeDailyLog({ date: '2026-04-20', restingHr: 52, sleepHours: 8.2, sleepQuality: 5 }),
    // Next-morning logs after evening post-19:00 workouts (elevated RHR ~56 -> +4 bpm, shorter sleep)
    makeDailyLog({ date: '2026-04-22', restingHr: 56, sleepHours: 6.8, sleepQuality: 3 }),
    makeDailyLog({ date: '2026-04-24', restingHr: 57, sleepHours: 6.5, sleepQuality: 3 }),
    makeDailyLog({ date: '2026-04-26', restingHr: 56, sleepHours: 6.7, sleepQuality: 3 }),
  );

  const workouts: HevyWorkout[] = [
    // 1 morning workout (< 3 threshold -> gated)
    makeWorkout({
      id: 'm1',
      title: 'Morning Lift',
      date: '2026-04-14',
      startTime: '14 Apr 2026, 08:30',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 70, reps: 5 }] }],
    }),
    // 3 afternoon workouts with progressive PRs & higher volume
    makeWorkout({
      id: 'a1',
      title: 'Afternoon Strength',
      date: '2026-04-15',
      startTime: '15 Apr 2026, 14:00',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 80, reps: 8 }, { weightKg: 80, reps: 8 }] }],
    }),
    makeWorkout({
      id: 'a2',
      title: 'Afternoon Strength',
      date: '2026-04-17',
      startTime: '17 Apr 2026, 15:00',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 85, reps: 8 }, { weightKg: 85, reps: 8 }] }],
    }),
    makeWorkout({
      id: 'a3',
      title: 'Afternoon Strength',
      date: '2026-04-19',
      startTime: '19 Apr 2026, 13:30',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 90, reps: 8 }, { weightKg: 90, reps: 8 }] }],
    }),
    // 3 late evening workouts (after 19:00, lower volume, no new PRs, including 1 boxing session)
    makeWorkout({
      id: 'e1',
      title: 'Evening Lift',
      date: '2026-04-21',
      startTime: '21 Apr 2026, 19:30',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 75, reps: 6 }] }],
    }),
    makeWorkout({
      id: 'e2',
      title: 'Evening Lift',
      date: '2026-04-23',
      startTime: '23 Apr 2026, 20:00',
      exercises: [{ title: 'Bench Press (Barbell)', sets: [{ weightKg: 75, reps: 6 }] }],
    }),
    makeWorkout({
      id: 'e3',
      title: 'Бокс вечер',
      date: '2026-04-25',
      startTime: '25 Apr 2026, 19:45',
      exercises: [{ title: 'Heavy Bag Boxing', sets: [{ reps: 5 }] }],
    }),
  ];

  const report = analyzeOptimalTrainingTime({
    hevyWorkouts: workouts,
    dailyLogs,
    fallbackWeightKg: 80,
  });

  const morning = report.windows.find((w) => w.id === 'morning')!;
  const afternoon = report.windows.find((w) => w.id === 'afternoon')!;
  const evening = report.windows.find((w) => w.id === 'evening')!;

  assert.equal(morning.workoutsCount, 1);
  assert.equal(morning.hasEnoughData, false);
  assert.equal(morning.progressLabel, '1/3 тренировки');

  assert.equal(afternoon.workoutsCount, 3);
  assert.equal(afternoon.hasEnoughData, true);
  assert.equal(afternoon.prRatePct, 100);
  assert.equal(afternoon.nextMorningSleepHoursAvg, 8.1);

  assert.equal(evening.workoutsCount, 3);
  assert.equal(evening.boxingWorkoutsCount, 1);
  assert.equal(evening.hasEnoughData, true);
  assert.ok((evening.nextMorningRhrDeltaAvg ?? 0) >= 3.0);
  assert.equal(report.post19EveningCount, 3);
  assert.ok((report.post19RhrDeltaAvg ?? 0) >= 3.0);

  assert.equal(report.eligibleWindowsCount, 2);
  assert.equal(report.bestStrengthWindowId, 'afternoon');
  assert.match(report.personalInsightBody, /следобед/i);
  assert.match(report.personalInsightBody, /19:00/);
});
