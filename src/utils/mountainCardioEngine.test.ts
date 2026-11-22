import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeWatchDataIntoDailyLog,
  parseIntervalsWatchDayData,
} from '../services/intervalsWatchSync';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import { computeDetailedMuscleRecovery } from './analysisPrep';
import { parseDiaryPayload } from './fitnessMath';
import {
  analyzeAerobicBoxingSynergy,
  computeActivityVam,
  computeMountainCardioReport,
} from './mountainCardioEngine';
import {
  ANALYSIS_PRIMARY_SUB_TABS,
  parseLocationFromHash,
} from './navigation';
import {
  MOUNTAIN_ALTITUDE_LAPSE_C,
  evaluateMountainWeatherIndex,
} from './openMeteoWeather';

test('Intervals.icu parser extracts watchActivities for Run, TrailRun, Hike, Walk, Ride, AlpineSki, BackcountrySki and persists via parseDiaryPayload', () => {
  const parsed = parseIntervalsWatchDayData(
    { steps: 14500, restingHR: 52, hrv: 78 },
    [
      {
        id: 'act-1',
        type: 'Hike',
        name: 'Карлово - хижа Равнец',
        distance: 11200,
        moving_time: 7200,
        total_elevation_gain: 780,
        average_heartrate: 138,
        max_heartrate: 169,
        max_speed: 2.4,
        calories: 920,
      },
      {
        id: 'act-2',
        type: 'AlpineSki',
        name: 'Банско Ски',
        distance: 24000,
        moving_time: 5400,
        total_elevation_gain: 0,
        average_heartrate: 124,
        max_heartrate: 158,
        max_speed: 19.5, // 70.2 km/h
        calories: 640,
      },
    ],
  );

  assert.equal(parsed.watchActivities?.length, 2);
  assert.equal(parsed.watchActivities?.[0].type, 'Hike');
  assert.equal(parsed.watchActivities?.[0].name, 'Карлово - хижа Равнец');
  assert.equal(parsed.watchActivities?.[0].total_elevation_gain, 780);
  assert.equal(parsed.watchActivities?.[0].average_heartrate, 138);
  assert.equal(parsed.watchActivities?.[1].type, 'AlpineSki');
  assert.equal(parsed.watchActivities?.[1].max_speed, 19.5);

  const merged = mergeWatchDataIntoDailyLog({
    existing: null,
    dateKey: '2026-05-10',
    watchData: parsed,
    overwriteExisting: true,
  });

  const roundTrip = parseDiaryPayload(
    JSON.stringify({
      profile: { name: 'Тест', heightCm: 180, weightKg: 78 },
      logs: {},
      goals: [],
      dailyLogs: [merged.nextEntry],
    }),
  );

  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) {
    assert.equal(roundTrip.state.dailyLogs?.[0].watchActivities?.length, 2);
    assert.equal(
      roundTrip.state.dailyLogs?.[0].watchActivities?.[1].max_speed,
      19.5,
    );
  }
});

test('computeActivityVam and computeMountainCardioReport calculate VAM, improving EF trend, and Hall of Fame records', () => {
  assert.equal(computeActivityVam(90, 3600), null); // < 100 m excluded
  assert.equal(computeActivityVam(600, 3600), 600);
  assert.equal(computeActivityVam(750, 5400), 500);

  const logs: DailyBiometricLog[] = [
    {
      date: '2026-03-20',
      completedHabits: [],
      watchActivities: [
        {
          type: 'Run',
          name: 'Темпово бягане 5 км',
          distance: 5000,
          moving_time: 1500, // 5:00 min/km
          total_elevation_gain: 40,
          average_heartrate: 162,
          max_heartrate: 178,
          calories: 380,
        },
      ],
    },
    {
      date: '2026-04-05',
      completedHabits: [],
      watchActivities: [
        {
          type: 'Hike',
          name: 'Балкан - вр. Ботев',
          distance: 18400,
          moving_time: 14400, // 4 h
          total_elevation_gain: 1320, // VAM 330
          average_heartrate: 144,
          max_heartrate: 172,
          calories: 1450,
        },
      ],
    },
    {
      date: '2026-04-18',
      completedHabits: [],
      watchActivities: [
        {
          type: 'Run',
          name: 'Бърз 1.5 км тест',
          distance: 1500,
          moving_time: 390, // 4:20 min/km
          total_elevation_gain: 10,
          average_heartrate: 160,
          max_heartrate: 181,
          calories: 130,
        },
      ],
    },
    {
      date: '2026-05-02',
      completedHabits: [],
      watchActivities: [
        {
          type: 'TrailRun',
          name: 'Планинско бягане Стара планина',
          distance: 6200,
          moving_time: 2160, // 36 min
          total_elevation_gain: 420, // VAM 700
          average_heartrate: 148,
          max_heartrate: 174,
          calories: 560,
        },
      ],
    },
    {
      date: '2026-05-10',
      completedHabits: [],
      watchActivities: [
        {
          type: 'Run',
          name: 'Бързи 4 км',
          distance: 4000,
          moving_time: 1080, // 4:30 min/km
          total_elevation_gain: 25,
          average_heartrate: 148,
          max_heartrate: 170,
          calories: 310,
        },
        {
          type: 'AlpineSki',
          name: 'Боровец Ски',
          distance: 19000,
          moving_time: 4200,
          max_speed: 21.5, // 77.4 km/h
          calories: 520,
        },
      ],
    },
  ];

  const report = computeMountainCardioReport({
    dailyLogs: logs,
    todayKey: '2026-05-14',
    windowDays: 90,
  });

  assert.equal(report.bestVamMetersPerHour, 700);
  assert.equal(report.efTrendStatus, 'improving');
  assert.ok((report.efTrendPct ?? 0) > 2.5);
  assert.equal(report.hallOfFame.bestPace1Km?.paceFormatted, '4:20 мин/км');
  assert.equal(report.hallOfFame.bestPace3Km?.paceFormatted, '4:30 мин/км');
  assert.equal(report.hallOfFame.maxSingleElevation?.elevationGainM, 1320);
  assert.equal(report.hallOfFame.longestHike?.distanceKm, 18.4);
  assert.equal(report.hallOfFame.maxWinterSpeed?.maxSpeedKmh, 77.4);
});

test('computeDetailedMuscleRecovery applies proportional 72h leg fatigue to quads, calves, and glutes from watchActivities (>=250m climb or >=2km run)', () => {
  const refTs = Date.parse('2026-05-14T18:00:00Z');
  const logs: DailyBiometricLog[] = [
    {
      date: '2026-05-14',
      completedHabits: [],
      watchActivities: [
        {
          type: 'Hike',
          name: 'Преход Балкан',
          distance: 9500,
          moving_time: 7200,
          total_elevation_gain: 620,
          start_date_local: '2026-05-14T08:00:00Z',
        },
      ],
    },
  ];

  const recovery = computeDetailedMuscleRecovery([], refTs, logs);
  const quads = recovery.find((r) => r.id === 'quads');
  const calves = recovery.find((r) => r.id === 'calves');
  const glutes = recovery.find((r) => r.id === 'glutes');
  const chest = recovery.find((r) => r.id === 'chest');

  assert.equal(quads?.status, 'fatigued');
  assert.equal(calves?.status, 'fatigued');
  assert.equal(glutes?.status, 'fatigued');
  assert.equal(chest?.status, 'recovered');
  assert.ok((quads?.recentExercises.length ?? 0) > 0);
});

test('analyzeAerobicBoxingSynergy tracks weekly aerobic minutes and links to boxing recovery', () => {
  const logs: DailyBiometricLog[] = [
    {
      date: '2026-05-11',
      restingHr: 52,
      completedHabits: [],
      watchActivities: [
        {
          type: 'Hike',
          name: 'Балкан',
          distance: 8000,
          moving_time: 5400, // 90 min
          total_elevation_gain: 520,
        },
      ],
    },
    {
      date: '2026-05-13',
      restingHr: 51,
      completedHabits: [],
      watchActivities: [
        {
          type: 'Run',
          name: 'Зона 2 бягане',
          distance: 6000,
          moving_time: 2400, // 40 min
          total_elevation_gain: 60,
        },
      ],
    },
  ];
  const boxingWorkouts: HevyWorkout[] = [
    {
      id: 'b1',
      title: 'Бокс тренировка',
      date: '2026-05-12',
      startTime: '2026-05-12T18:00:00Z',
      exercises: [],
      totalVolumeKg: 0,
      maxWeightKg: 0,
      totalSets: 8,
      importedAt: '2026-05-12T19:00:00Z',
    },
  ];

  const synergy = analyzeAerobicBoxingSynergy({
    dailyLogs: logs,
    hevyWorkouts: boxingWorkouts,
    todayKey: '2026-05-14',
  });

  assert.equal(synergy.aerobicMinutes7d, 130);
  assert.equal(synergy.status, 'strong');
  assert.equal(synergy.boxingSessions14d, 1);
  assert.match(synergy.boxingBenefitNote, /бокс|пулс/i);
});

test('evaluateMountainWeatherIndex subtracts 6.5°C for ~1000m altitude and classifies ideal, windy ridge, and unsuitable mountain weather', () => {
  assert.equal(MOUNTAIN_ALTITUDE_LAPSE_C, 6.5);

  const ideal = evaluateMountainWeatherIndex({
    tempMaxC: 22,
    tempMinC: 11,
    precipProbabilityMax: 10,
    windSpeedMaxKmh: 12,
    isWet: false,
    isStorm: false,
  });
  assert.equal(ideal.highAltitudeTempMaxC, 15.5);
  assert.equal(ideal.status, 'ideal');
  assert.equal(ideal.label, '☀️ Идеално за преход');

  const windy = evaluateMountainWeatherIndex({
    tempMaxC: 18,
    tempMinC: 8,
    precipProbabilityMax: 15,
    windSpeedMaxKmh: 26,
    isWet: false,
    isStorm: false,
  });
  assert.equal(windy.highAltitudeTempMaxC, 11.5);
  assert.equal(windy.status, 'windy_ridge');
  assert.equal(windy.label, '💨 Силен вятър на билото');

  const rainy = evaluateMountainWeatherIndex({
    tempMaxC: 16,
    tempMinC: 9,
    precipProbabilityMax: 80,
    windSpeedMaxKmh: 14,
    isWet: true,
    isStorm: false,
  });
  assert.equal(rainy.status, 'unsuitable');
  assert.equal(rainy.label, '🌧️ Неподходящо за планина');
});

test('navigation exposes 4th primary analysis sub-tab mountain-cardio', () => {
  assert.equal(ANALYSIS_PRIMARY_SUB_TABS.length, 4);
  assert.equal(ANALYSIS_PRIMARY_SUB_TABS[3].id, 'mountain-cardio');
  assert.deepEqual(parseLocationFromHash('#/analysis/mountain-cardio'), {
    page: 'analysis',
    analysisSubTab: 'mountain-cardio',
  });
});
