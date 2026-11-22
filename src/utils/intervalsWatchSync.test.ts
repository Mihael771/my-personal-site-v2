import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIntervalsActivitiesUrl,
  buildIntervalsAuthHeader,
  buildIntervalsWellnessUrl,
  convertIntervalsSleepTo1To5,
  fetchIntervalsWatchDayData,
  mergeWatchDataIntoDailyLog,
  parseIntervalsWatchDayData,
} from '../services/intervalsWatchSync';
import type { DailyBiometricLog } from '../types/fitness';
import { computeDetailedMuscleRecovery } from './analysisPrep';
import { parseDiaryPayload } from './fitnessMath';

test('Intervals.icu URL & Basic auth header builders match API specification', () => {
  assert.equal(
    buildIntervalsWellnessUrl('2026-05-10'),
    'https://intervals.icu/api/v1/athlete/0/wellness/2026-05-10',
  );
  assert.equal(
    buildIntervalsActivitiesUrl('2026-05-10'),
    'https://intervals.icu/api/v1/athlete/0/activities?oldest=2026-05-10&newest=2026-05-10',
  );
  assert.equal(
    buildIntervalsAuthHeader('my-secret-key'),
    `Basic ${Buffer.from('API_KEY:my-secret-key', 'utf-8').toString('base64')}`,
  );
});

test('Intervals.icu sleep conversion maps sleepScore (0-100) and sleepQuality (1-4) to 1-5 scale', () => {
  assert.equal(convertIntervalsSleepTo1To5({ sleepScore: 90 }), 5);
  assert.equal(convertIntervalsSleepTo1To5({ sleepScore: 78 }), 4);
  assert.equal(convertIntervalsSleepTo1To5({ sleepScore: 62 }), 3);
  assert.equal(convertIntervalsSleepTo1To5({ sleepScore: 48 }), 2);
  assert.equal(convertIntervalsSleepTo1To5({ sleepScore: 30 }), 1);

  // Fallback to 1-4 scale (1=Great..4=Poor)
  assert.equal(convertIntervalsSleepTo1To5({ sleepQuality: 1 }), 5);
  assert.equal(convertIntervalsSleepTo1To5({ sleepQuality: 2 }), 4);
  assert.equal(convertIntervalsSleepTo1To5({ sleepQuality: 3 }), 3);
  assert.equal(convertIntervalsSleepTo1To5({ sleepQuality: 4 }), 2);
});

test('parseIntervalsWatchDayData extracts wellness metrics, Run/TrailRun/Hike/Walk cardio, elevation gain, and activity calories fallback', () => {
  const parsed = parseIntervalsWatchDayData(
    {
      steps: 12450,
      restingHR: 54,
      sleepSecs: 28080, // 7.8 h
      sleepScore: 86,
      weight: 81.4,
    },
    [
      {
        type: 'TrailRun',
        distance: 8450,
        moving_time: 3120, // 52 min
        total_elevation_gain: 460,
        calories: 640,
      },
      {
        type: 'WeightTraining',
        calories: 320,
      },
    ],
  );

  assert.equal(parsed.hasAnyMetric, true);
  assert.equal(parsed.steps, 12450);
  assert.equal(parsed.restingHr, 54);
  assert.equal(parsed.sleepHours, 7.8);
  assert.equal(parsed.sleepQuality, 5);
  assert.equal(parsed.weightKg, 81.4);
  // Active calories falls back to sum of all activities (640 + 320 = 960)
  assert.equal(parsed.activeCalories, 960);
  assert.equal(parsed.cardioDistanceKm, 8.45);
  assert.equal(parsed.cardioDurationMinutes, 52);
  assert.equal(parsed.cardioElevationGainM, 460);
});

test('fetchIntervalsWatchDayData runs wellness & activities in parallel and degrades silently when offline', async () => {
  const requestedUrls: string[] = [];
  let sawAuthHeader = false;

  const mockFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    requestedUrls.push(url);
    const headers = init?.headers as Record<string, string> | undefined;
    if (headers?.Authorization === buildIntervalsAuthHeader('test-key-123')) {
      sawAuthHeader = true;
    }
    if (url.includes('/wellness/')) {
      return new Response(
        JSON.stringify({
          steps: 9800,
          restingHR: 56,
          sleepSecs: 27000,
          sleepScore: 76,
          activeCalories: 520,
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify([
        {
          type: 'Hike',
          distance: 6200,
          moving_time: 5400,
          total_elevation_gain: 380,
          calories: 450,
        },
      ]),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const okRes = await fetchIntervalsWatchDayData({
    apiKey: 'test-key-123',
    dateKey: '2026-05-10',
    fetchImpl: mockFetch,
  });

  assert.equal(okRes.ok, true);
  assert.equal(okRes.offline, false);
  assert.equal(sawAuthHeader, true);
  assert.equal(requestedUrls.length, 2);
  assert.equal(okRes.data?.steps, 9800);
  assert.equal(okRes.data?.activeCalories, 520);
  assert.equal(okRes.data?.cardioElevationGainM, 380);

  // Offline mode returns silently without throwing
  const offlineRes = await fetchIntervalsWatchDayData({
    apiKey: 'test-key-123',
    dateKey: '2026-05-10',
    fetchImpl: (async () => {
      throw new Error('Failed to fetch');
    }) as unknown as typeof fetch,
  });
  assert.equal(offlineRes.ok, false);
  assert.equal(offlineRes.offline, true);
});

test('mergeWatchDataIntoDailyLog fills only empty fields in background mode and overwrites on manual sync', () => {
  const existing: DailyBiometricLog = {
    date: '2026-05-10',
    weightKg: 82.0,
    caloriesKcal: 2450,
    proteinGrams: 170,
    completedHabits: ['Креатин'],
  };
  const watchData = parseIntervalsWatchDayData(
    { steps: 11200, restingHR: 53, weight: 81.2, sleepSecs: 27720, sleepScore: 84 },
    [],
  );

  // Background mode: keeps existing weightKg (82.0), fills missing steps/restingHR/sleep
  const bg = mergeWatchDataIntoDailyLog({
    existing,
    dateKey: '2026-05-10',
    watchData,
    overwriteExisting: false,
  });
  assert.equal(bg.nextEntry.weightKg, 82.0);
  assert.equal(bg.nextEntry.steps, 11200);
  assert.equal(bg.nextEntry.restingHr, 53);
  assert.equal(bg.nextEntry.caloriesKcal, 2450);
  assert.ok(bg.nextEntry.watchSyncedAt);

  // Manual sync mode: updates weightKg to 81.2 while keeping caloriesKcal/habits intact
  const manual = mergeWatchDataIntoDailyLog({
    existing,
    dateKey: '2026-05-10',
    watchData,
    overwriteExisting: true,
  });
  assert.equal(manual.nextEntry.weightKg, 81.2);
  assert.equal(manual.nextEntry.steps, 11200);
  assert.equal(manual.nextEntry.caloriesKcal, 2450);
  assert.deepEqual(manual.nextEntry.completedHabits, ['Креатин']);
});

test('userSettings.intervalsApiKey persists via parseDiaryPayload and elevation > 300 m adds leg fatigue to recovery map', () => {
  const parsed = parseDiaryPayload(
    JSON.stringify({
      profile: { name: 'Мишо', heightCm: 180, weightKg: 80 },
      themeAccent: 'blue',
      logs: {},
      goals: [],
      userSettings: {
        goal: 'hypertrophy',
        intervalsApiKey: 'icu_demo_key_999',
      },
      dailyLogs: [
        {
          date: '2026-05-10',
          cardioDistanceKm: 10.2,
          cardioDurationMinutes: 85,
          cardioElevationGainM: 450,
          completedHabits: [],
        },
      ],
    }),
  );

  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.state.userSettings?.intervalsApiKey, 'icu_demo_key_999');
  assert.equal(parsed.state.dailyLogs?.[0].cardioElevationGainM, 450);

  const refTs = new Date(2026, 4, 10, 18, 0, 0).getTime();
  const recovery = computeDetailedMuscleRecovery([], refTs, parsed.state.dailyLogs ?? []);
  const quads = recovery.find((m) => m.id === 'quads');
  const calves = recovery.find((m) => m.id === 'calves');
  const chest = recovery.find((m) => m.id === 'chest');

  assert.ok(quads && calves && chest);
  assert.equal(quads.status, 'recovering');
  assert.match(quads.recommendation, /450 m денивелация/);
  assert.equal(calves.status, 'recovering');
  assert.equal(chest.status, 'recovered');
});
