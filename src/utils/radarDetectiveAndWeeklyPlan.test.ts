import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeWatchDataIntoDailyLog,
  parseIntervalsWatchDayData,
} from '../services/intervalsWatchSync';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  RADAR_ALERT_BANNER_TEXT,
  analyzeBiometricRadar,
  analyzeHabitDetective60d,
} from './biometricRadarAndDetective';
import { sanitizeDailyLogEntry } from './dailyLogs';
import {
  DEFAULT_WEATHER_CITY,
  type WeatherDailySummary,
  buildWeeklyGymVsOutdoorPlan,
  parseOpenMeteoForecastResponse,
} from './openMeteoWeather';
import { TRIBULUS_HABIT_NAME } from './testosteroneAndHabits';

function makeWorkout(params: {
  id: string;
  date: string;
  volumeKg: number;
  maxWeightKg: number;
  reps?: number;
  exerciseTitle?: string;
}): HevyWorkout {
  const weight = params.maxWeightKg;
  const reps = params.reps ?? 8;
  return {
    id: params.id,
    title: `Workout ${params.id}`,
    startTime: `${params.date}T17:00:00`,
    date: params.date,
    exercises: [
      {
        title: params.exerciseTitle ?? 'Bench Press (Barbell)',
        sets: [
          { setIndex: 0, weightKg: weight, reps },
          { setIndex: 1, weightKg: weight, reps },
          { setIndex: 2, weightKg: weight, reps },
        ],
        totalVolumeKg: params.volumeKg,
        maxWeightKg: weight,
      },
    ],
    totalVolumeKg: params.volumeKg,
    maxWeightKg: weight,
    totalSets: 3,
    importedAt: '2026-06-01T00:00:00Z',
  };
}

test('Intervals.icu parser extracts hrv and hrvSDNN fallback and merges into DailyBiometricLog', () => {
  const fromHrv = parseIntervalsWatchDayData(
    { restingHR: 56, hrv: 68.4, sleepSecs: 27000 },
    [],
  );
  assert.equal(fromHrv.hrv, 68.4);
  assert.equal(fromHrv.restingHr, 56);
  assert.equal(fromHrv.hasAnyMetric, true);

  const fromSdnn = parseIntervalsWatchDayData({ hrvSDNN: 52.6 }, []);
  assert.equal(fromSdnn.hrv, 52.6);

  const merged = mergeWatchDataIntoDailyLog({
    existing: { date: '2026-06-10', restingHr: 55, completedHabits: [] },
    dateKey: '2026-06-10',
    watchData: fromSdnn,
    overwriteExisting: false,
  });
  assert.equal(merged.nextEntry.hrv, 52.6);
  assert.equal(merged.nextEntry.restingHr, 55);

  const sanitized = sanitizeDailyLogEntry({
    date: '2026-06-10',
    hrv: 61.24,
    completedHabits: [],
  });
  assert.equal(sanitized?.hrv, 61.2);
});

test('Biometric Radar detects normal baseline, 2-day RHR +4 bpm spike, and >15% HRV drop', () => {
  const baseLogs: DailyBiometricLog[] = [];
  for (let day = 1; day <= 12; day++) {
    const dd = String(day).padStart(2, '0');
    baseLogs.push({
      date: `2026-06-${dd}`,
      restingHr: 54,
      hrv: 70,
      sleepHours: 7.8,
      completedHabits: [],
    });
  }

  // 1) Normal state
  const normal = analyzeBiometricRadar({
    dailyLogs: baseLogs,
    todayKey: '2026-06-12',
  });
  assert.equal(normal.status, 'normal');
  assert.equal(normal.rhrElevated2Days, false);
  assert.equal(normal.hrvDropAlert, false);

  // 2) RHR elevated >= +4 bpm for 2 consecutive days
  const rhrSpikeLogs: DailyBiometricLog[] = [
    ...baseLogs,
    { date: '2026-06-13', restingHr: 59, hrv: 67, sleepHours: 6.1, completedHabits: [] },
    { date: '2026-06-14', restingHr: 60, hrv: 66, sleepHours: 6.0, completedHabits: [] },
  ];
  const rhrAlert = analyzeBiometricRadar({
    dailyLogs: rhrSpikeLogs,
    todayKey: '2026-06-14',
  });
  assert.equal(rhrAlert.status, 'alert');
  assert.equal(rhrAlert.rhrElevated2Days, true);
  assert.equal(rhrAlert.lowSleepWarning, true);
  assert.equal(rhrAlert.bannerText, RADAR_ALERT_BANNER_TEXT);

  // 3) HRV drop > 15% below 30-day average (70 -> 55 = -21.4%)
  const hrvDropLogs: DailyBiometricLog[] = [
    ...baseLogs,
    { date: '2026-06-13', restingHr: 55, hrv: 55, sleepHours: 7.2, completedHabits: [] },
  ];
  const hrvAlert = analyzeBiometricRadar({
    dailyLogs: hrvDropLogs,
    todayKey: '2026-06-13',
  });
  assert.equal(hrvAlert.status, 'alert');
  assert.equal(hrvAlert.hrvDropAlert, true);
  assert.ok((hrvAlert.hrvDropPct ?? 0) > 15);
  assert.equal(hrvAlert.bannerText, RADAR_ALERT_BANNER_TEXT);
});

test('Habit Detective 60d enforces >=3 samples per group and computes accurate % correlations when unlocked', () => {
  // Insufficient data case -> locked with X/6 progress
  const sparseLogs: DailyBiometricLog[] = [
    { date: '2026-06-01', sleepHours: 8.0, completedHabits: [] },
    { date: '2026-06-03', sleepHours: 5.8, completedHabits: ['Алкохол'] },
  ];
  const sparseWorkouts: HevyWorkout[] = [
    makeWorkout({ id: 's1', date: '2026-06-01', volumeKg: 5000, maxWeightKg: 90 }),
    makeWorkout({ id: 's2', date: '2026-06-03', volumeKg: 4200, maxWeightKg: 85 }),
  ];
  const sparseReport = analyzeHabitDetective60d({
    dailyLogs: sparseLogs,
    hevyWorkouts: sparseWorkouts,
    todayKey: '2026-06-10',
  });
  assert.equal(sparseReport.unlockedCount, 0);
  const sleepLocked = sparseReport.comparisons.find((c) => c.id === 'sleep')!;
  assert.equal(sleepLocked.unlocked, false);
  assert.ok(
    sleepLocked.headlineInsight.includes('Събиране на данни за личен анализ: 2/6 тренировки'),
  );

  // Rich 60-day dataset with >= 3 workouts in every group A and group B
  const richLogs: DailyBiometricLog[] = [
    // Clean + good sleep + Tribulus days (workouts on 02, 05, 08)
    { date: '2026-05-01', sleepHours: 8.0, sleepQuality: 5, completedHabits: [TRIBULUS_HABIT_NAME] },
    { date: '2026-05-02', sleepHours: 8.2, sleepQuality: 5, completedHabits: [TRIBULUS_HABIT_NAME] },
    { date: '2026-05-04', sleepHours: 7.8, sleepQuality: 4, completedHabits: [TRIBULUS_HABIT_NAME] },
    { date: '2026-05-05', sleepHours: 8.0, sleepQuality: 5, completedHabits: [TRIBULUS_HABIT_NAME] },
    { date: '2026-05-07', sleepHours: 7.6, sleepQuality: 4, completedHabits: [TRIBULUS_HABIT_NAME] },
    { date: '2026-05-08', sleepHours: 7.9, sleepQuality: 5, completedHabits: [TRIBULUS_HABIT_NAME] },
    // Short sleep + harmful habit + no Tribulus days (workouts on 12, 15, 18)
    { date: '2026-05-12', sleepHours: 5.8, sleepQuality: 2, completedHabits: ['Алкохол'] },
    { date: '2026-05-15', sleepHours: 6.0, sleepQuality: 3, completedHabits: ['Късно лягане'] },
    { date: '2026-05-18', sleepHours: 5.5, sleepQuality: 2, completedHabits: ['Алкохол'] },
  ];

  const richWorkouts: HevyWorkout[] = [
    makeWorkout({ id: 'w1', date: '2026-05-02', volumeKg: 6000, maxWeightKg: 100, reps: 8 }),
    makeWorkout({ id: 'w2', date: '2026-05-05', volumeKg: 6200, maxWeightKg: 100, reps: 9 }),
    makeWorkout({ id: 'w3', date: '2026-05-08', volumeKg: 6400, maxWeightKg: 100, reps: 10 }),
    makeWorkout({ id: 'w4', date: '2026-05-12', volumeKg: 5000, maxWeightKg: 90, reps: 6 }),
    makeWorkout({ id: 'w5', date: '2026-05-15', volumeKg: 5000, maxWeightKg: 90, reps: 6 }),
    makeWorkout({ id: 'w6', date: '2026-05-18', volumeKg: 5000, maxWeightKg: 90, reps: 6 }),
  ];

  const richReport = analyzeHabitDetective60d({
    dailyLogs: richLogs,
    hevyWorkouts: richWorkouts,
    todayKey: '2026-05-20',
  });

  assert.equal(richReport.unlockedCount, 3);
  const sleepCmp = richReport.comparisons.find((c) => c.id === 'sleep')!;
  const cleanCmp = richReport.comparisons.find((c) => c.id === 'clean_vs_harmful')!;
  const tribCmp = richReport.comparisons.find((c) => c.id === 'tribulus')!;

  assert.equal(sleepCmp.unlocked, true);
  assert.equal(sleepCmp.volumeDiffPct, 24); // (6200 - 5000) / 5000 = +24%
  assert.equal(cleanCmp.unlocked, true);
  assert.equal(cleanCmp.volumeDiffPct, 24);
  assert.equal(tribCmp.unlocked, true);
  assert.equal(tribCmp.volumeDiffPct, 24);
  assert.ok(tribCmp.subjectiveNote && tribCmp.subjectiveNote.includes('Субективна свежест'));
});

test('Open-Meteo 7-day forecast parser and Gym vs Outdoor weekly planner map weather + fatigue correctly', () => {
  const payload7d = {
    current: {
      temperature_2m: 18,
      apparent_temperature: 17.5,
      precipitation: 0,
      wind_speed_10m: 9,
      weather_code: 0,
    },
    daily: {
      time: [
        '2026-05-11',
        '2026-05-12',
        '2026-05-13',
        '2026-05-14',
        '2026-05-15',
        '2026-05-16',
        '2026-05-17',
      ],
      weather_code: [0, 63, 1, 0, 2, 3, 0],
      temperature_2m_max: [20, 14, 8, 19, 18, 21, 22],
      temperature_2m_min: [9, 7, 2, 10, 9, 11, 12],
      precipitation_probability_max: [10, 80, 15, 5, 10, 20, 10],
      wind_speed_10m_max: [12, 15, 10, 11, 28, 14, 9],
    },
  };

  const parsed = parseOpenMeteoForecastResponse(
    payload7d,
    DEFAULT_WEATHER_CITY,
    1_700_000_000_000,
  );
  assert.ok(parsed);
  assert.equal(parsed.daily7d.length, 7);
  assert.equal(parsed.daily7d[4].windSpeedMaxKmh, 28);

  const plan = buildWeeklyGymVsOutdoorPlan({
    daily7d: parsed.daily7d as WeatherDailySummary[],
    hevyWorkouts: [],
    dailyLogs: [],
    todayKey: '2026-05-11',
  });

  assert.equal(plan.length, 7);
  // Day 0: dry, 20°C, wind 12 -> Outdoor
  assert.equal(plan[0].mode, 'outdoor');
  assert.ok(plan[0].actionLabel.includes('Лостове'));
  // Day 1: rain (code 63, 80%) -> Indoor
  assert.equal(plan[1].mode, 'indoor');
  assert.ok(plan[1].actionLabel.includes('зала'));
  // Day 2: cold (8°C <= 10°C) -> Indoor
  assert.equal(plan[2].mode, 'indoor');
  // Day 3: after 3 consecutive training days (Days 0, 1, 2) -> Active recovery!
  assert.equal(plan[3].mode, 'recovery');
  assert.ok(plan[3].actionLabel.includes('Активно възстановяване'));
  // Day 4: strong wind (28 km/h >= 22) -> Indoor
  assert.equal(plan[4].mode, 'indoor');
  // Day 5: dry, 21°C, wind 14 -> Outdoor
  assert.equal(plan[5].mode, 'outdoor');
});
