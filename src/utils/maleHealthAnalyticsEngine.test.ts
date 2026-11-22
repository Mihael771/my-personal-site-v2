import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailyBiometricLog, HevyWorkout, UserProfile } from '../types/fitness';
import {
  mergeWatchDataIntoDailyLog,
  parseIntervalsWatchDayData,
} from '../services/intervalsWatchSync';
import { mergeUnifiedDailyLog, sanitizeDailyLogEntry } from './dailyLogs';
import {
  analyzeCardioVascularHealth,
  analyzeHypertrophyVolumeZones,
  analyzeProteinAndLeanMassGuard,
  analyzeSleepArchitecture,
} from './maleHealthAnalyticsEngine';

const PROFILE: UserProfile = {
  name: 'Тест',
  heightCm: 180,
  weightKg: 80,
};

function makeWorkout(params: {
  id: string;
  date: string;
  title: string;
  exercises: Array<{ title: string; sets: number; weightKg?: number; reps?: number }>;
}): HevyWorkout {
  const exercises = params.exercises.map((ex) => {
    const sets = Array.from({ length: ex.sets }, (_, i) => ({
      setIndex: i + 1,
      setType: 'normal',
      weightKg: ex.weightKg ?? 80,
      reps: ex.reps ?? 8,
      rpe: 8,
    }));
    const vol = sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
    return {
      title: ex.title,
      sets,
      totalVolumeKg: vol,
      maxWeightKg: ex.weightKg ?? 80,
    };
  });
  return {
    id: params.id,
    title: params.title,
    startTime: `${params.date} 10:00`,
    date: params.date,
    exercises,
    totalVolumeKg: exercises.reduce((s, e) => s + e.totalVolumeKg, 0),
    maxWeightKg: Math.max(0, ...exercises.map((e) => e.maxWeightKg)),
    totalSets: exercises.reduce((s, e) => s + e.sets.length, 0),
    importedAt: `${params.date}T12:00:00.000Z`,
  };
}

test('Intervals.icu parser & dailyLogs preserve deepSleepSecs/deepSleep and remSleepSecs/remSleep without breaking legacy entries', () => {
  const parsedSecs = parseIntervalsWatchDayData(
    {
      sleepSecs: 28800, // 8h
      deepSleepSecs: 6120, // 102 min (~21.3%)
      remSleepSecs: 6480, // 108 min (~22.5%)
      restingHR: 54,
      hrv: 68,
    },
    [],
  );
  assert.equal(parsedSecs.sleepHours, 8);
  assert.equal(parsedSecs.deepSleepSecs, 6120);
  assert.equal(parsedSecs.remSleepSecs, 6480);

  // Fallback field names deepSleep / remSleep in hours
  const parsedFallback = parseIntervalsWatchDayData(
    {
      sleepSecs: 28800,
      deepSleep: 1.5, // 5400 secs
      remSleep: 1.75, // 6300 secs
    },
    [],
  );
  assert.equal(parsedFallback.deepSleepSecs, 5400);
  assert.equal(parsedFallback.remSleepSecs, 6300);

  const mergedWatch = mergeWatchDataIntoDailyLog({
    existing: { date: '2026-11-19', completedHabits: ['Креатин'] },
    dateKey: '2026-11-19',
    watchData: parsedSecs,
    overwriteExisting: true,
  });
  assert.equal(mergedWatch.nextEntry.deepSleepSecs, 6120);
  assert.equal(mergedWatch.nextEntry.remSleepSecs, 6480);

  // Editing manual check-in fields must preserve synced sleep stages
  const afterManualEdit = mergeUnifiedDailyLog(mergedWatch.nextEntry, {
    date: '2026-11-19',
    proteinGrams: 165,
    completedHabits: ['Креатин'],
  });
  assert.equal(afterManualEdit.deepSleepSecs, 6120);
  assert.equal(afterManualEdit.remSleepSecs, 6480);
  assert.equal(afterManualEdit.proteinGrams, 165);

  // Legacy log without deep/rem sanitizes cleanly
  const legacySanitized = sanitizeDailyLogEntry({
    date: '2026-11-10',
    weightKg: 80.2,
    sleepHours: 7.5,
    completedHabits: [],
  });
  assert.ok(legacySanitized);
  assert.equal(legacySanitized.deepSleepSecs, undefined);
  assert.equal(legacySanitized.remSleepSecs, undefined);
});

test('Module 2: analyzeHypertrophyVolumeZones counts 1.0 primary + 0.5 secondary, excludes boxing, and classifies MEV/MAV/MRV', () => {
  const workouts: HevyWorkout[] = [
    // Boxing session inside window — must be excluded
    makeWorkout({
      id: 'b1',
      date: '2026-11-19',
      title: 'Бокс тренировка (чувал + спаринг)',
      exercises: [
        { title: 'Heavy Bag Rounds', sets: 6, weightKg: 0 },
        { title: 'Push Up', sets: 4, weightKg: 0 },
      ],
    }),
    // Heavy chest volume: 22 sets Bench Press (Barbell) -> Chest 22 (above MRV), Triceps 11 (secondary 0.5x = 11, optimal)
    makeWorkout({
      id: 'w1',
      date: '2026-11-18',
      title: 'Push A',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 12 }],
    }),
    makeWorkout({
      id: 'w2',
      date: '2026-11-15',
      title: 'Push B',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 10 }],
    }),
  ];

  const report = analyzeHypertrophyVolumeZones({
    hevyWorkouts: workouts,
    todayKey: '2026-11-20',
  });

  assert.equal(report.windowStartDate, '2026-11-13');
  assert.equal(report.windowEndDate, '2026-11-19');
  assert.equal(report.excludedBoxingCount, 1);
  assert.equal(report.strengthWorkoutsCount, 2);

  const chest = report.groups.find((g) => g.id === 'chest');
  const triceps = report.groups.find((g) => g.id === 'triceps');
  const quads = report.groups.find((g) => g.id === 'quads');

  assert.equal(chest?.effectiveSets, 22);
  assert.equal(chest?.zone, 'above_mrv');
  assert.equal(triceps?.effectiveSets, 11); // 22 * 0.5 secondary
  assert.equal(triceps?.zone, 'optimal_mev_mav');
  assert.equal(quads?.effectiveSets, 0);
  assert.equal(quads?.zone, 'below_mev');
  assert.equal(report.coachSignal.severity, 'alert');
});

test('Module 3: analyzeSleepArchitecture computes last night and 7-day Deep/REM percentages and impacts', () => {
  const logs: DailyBiometricLog[] = [
    {
      date: '2026-11-19',
      sleepHours: 8,
      deepSleepSecs: 5760, // 20.0%
      remSleepSecs: 6336, // 22.0%
      completedHabits: [],
    },
    {
      date: '2026-11-18',
      sleepHours: 7.5,
      deepSleepSecs: 5400, // 20.0%
      remSleepSecs: 5400, // 20.0%
      completedHabits: [],
    },
  ];

  const optimalReport = analyzeSleepArchitecture({
    dailyLogs: logs,
    todayKey: '2026-11-20',
  });
  assert.equal(optimalReport.hasStageData, true);
  assert.equal(optimalReport.lastNight.deepPct, 20);
  assert.equal(optimalReport.lastNight.remPct, 22);
  assert.equal(optimalReport.overallStatus, 'optimal');
  assert.equal(optimalReport.avg7d.avgDeepPct, 20);
  assert.equal(optimalReport.avg7d.avgRemPct, 21);

  const lowReport = analyzeSleepArchitecture({
    dailyLogs: [
      {
        date: '2026-11-19',
        sleepHours: 7,
        deepSleepSecs: 2520, // 10%
        remSleepSecs: 3024, // 12%
        completedHabits: [],
      },
    ],
    todayKey: '2026-11-20',
  });
  assert.equal(lowReport.overallStatus, 'low');
  assert.equal(lowReport.lastNight.deepStatus, 'low');
  assert.equal(lowReport.lastNight.remStatus, 'low');
});

test('Module 4: analyzeCardioVascularHealth scores 7d vs 30d RHR, HRV stability, and cardiac efficiency', () => {
  const logs: DailyBiometricLog[] = [];
  // Days 8..28 ago: higher RHR (62), lower HRV (52), lower efficiency
  for (let d = 28; d >= 8; d--) {
    const dayStr = String(20 - d).padStart(2, '0');
    const date = d >= 20 ? `2026-10-${String(31 + 20 - d).padStart(2, '0')}` : `2026-11-${dayStr}`;
    logs.push({
      date,
      restingHr: 62,
      hrv: 52,
      watchActivities:
        d % 4 === 0
          ? [
              {
                type: 'Run',
                name: 'Easy Run',
                distance: 6000,
                moving_time: 2100, // 35 min -> 171.4 m/min
                average_heartrate: 155, // 1.11 m/beat
              },
            ]
          : undefined,
      completedHabits: [],
    });
  }
  // Last 7 completed days: stronger heart (RHR 54, HRV 74 stable, better efficiency)
  for (let d = 7; d >= 1; d--) {
    logs.push({
      date: `2026-11-${String(20 - d).padStart(2, '0')}`,
      restingHr: 54,
      hrv: 74,
      watchActivities:
        d % 3 === 0
          ? [
              {
                type: 'Run',
                name: 'Aerobic Run',
                distance: 8000,
                moving_time: 2400, // 40 min -> 200 m/min
                average_heartrate: 145, // 1.38 m/beat
              },
            ]
          : undefined,
      completedHabits: [],
    });
  }

  const report = analyzeCardioVascularHealth({
    dailyLogs: logs,
    todayKey: '2026-11-20',
  });
  assert.equal(report.hasData, true);
  assert.ok(report.score >= 85, `Expected high cardiovascular score, got ${report.score}`);
  assert.equal(report.zone, 'optimal');
  assert.ok(report.rhr.deltaBpm !== null && report.rhr.deltaBpm < 0);
  assert.ok(report.hrv.deltaPct !== null && report.hrv.deltaPct > 0);
  assert.ok(
    report.cardiacEfficiency.trendPct !== null &&
      report.cardiacEfficiency.trendPct > 0,
  );
});

test('Module 5: analyzeProteinAndLeanMassGuard detects fat-gain aromatization risk and optimal lean progression', () => {
  // Scenario A: Fast weight gain (+0.7 kg/wk) WITHOUT strength growth -> fat_gain_risk
  const fatGainLogs: DailyBiometricLog[] = [];
  for (let d = 14; d >= 8; d--) {
    fatGainLogs.push({
      date: `2026-11-${String(20 - d).padStart(2, '0')}`,
      weightKg: 80.0,
      proteinGrams: 150,
      completedHabits: [],
    });
  }
  for (let d = 7; d >= 1; d--) {
    fatGainLogs.push({
      date: `2026-11-${String(20 - d).padStart(2, '0')}`,
      weightKg: 80.7,
      proteinGrams: 150,
      completedHabits: [],
    });
  }
  const flatWorkouts: HevyWorkout[] = [
    makeWorkout({
      id: 'prev',
      date: '2026-11-10',
      title: 'Upper',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 4, weightKg: 100, reps: 8 }],
    }),
    makeWorkout({
      id: 'curr',
      date: '2026-11-18',
      title: 'Upper',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 4, weightKg: 100, reps: 8 }],
    }),
  ];

  const fatRisk = analyzeProteinAndLeanMassGuard({
    dailyLogs: fatGainLogs,
    hevyWorkouts: flatWorkouts,
    profile: PROFILE,
    todayKey: '2026-11-20',
  });
  assert.equal(fatRisk.status, 'fat_gain_risk');
  assert.ok(fatRisk.statusMessage.includes('ароматизацията'));
  assert.ok(fatRisk.statusMessage.includes('150–200 kcal'));

  // Scenario B: >= 5/7 days >= 1.8 g/kg + growing strength + controlled weight -> optimal_lean_progression
  const leanLogs: DailyBiometricLog[] = [];
  for (let d = 14; d >= 8; d--) {
    leanLogs.push({
      date: `2026-11-${String(20 - d).padStart(2, '0')}`,
      weightKg: 80.0,
      proteinGrams: 155,
      completedHabits: [],
    });
  }
  for (let d = 7; d >= 1; d--) {
    leanLogs.push({
      date: `2026-11-${String(20 - d).padStart(2, '0')}`,
      weightKg: 80.2,
      proteinGrams: d <= 6 ? 156 : 120, // 6/7 days >= 1.94 g/kg
      completedHabits: [],
    });
  }
  const growingWorkouts: HevyWorkout[] = [
    makeWorkout({
      id: 'prev2',
      date: '2026-11-10',
      title: 'Upper',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 4, weightKg: 100, reps: 8 }],
    }),
    makeWorkout({
      id: 'curr2',
      date: '2026-11-18',
      title: 'Upper',
      exercises: [{ title: 'Bench Press (Barbell)', sets: 4, weightKg: 105, reps: 8 }],
    }),
  ];

  const leanReport = analyzeProteinAndLeanMassGuard({
    dailyLogs: leanLogs,
    hevyWorkouts: growingWorkouts,
    profile: PROFILE,
    todayKey: '2026-11-20',
  });
  assert.equal(leanReport.daysMeetingThreshold, 6);
  assert.equal(leanReport.strengthIsGrowing, true);
  assert.equal(leanReport.status, 'optimal_lean_progression');
  assert.equal(
    leanReport.statusHeadline,
    '🥩 Оптимален белтъчен синтез и чиста прогресия',
  );
});
