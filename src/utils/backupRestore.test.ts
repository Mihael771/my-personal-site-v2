import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBackupFilename,
  fetchDatabaseBackupJson,
  restoreDatabaseBackupJson,
  validateBackupJsonFile,
} from './backupRestore';

test('buildBackupFilename formats fitness-backup-YYYY-MM-DD.json', () => {
  assert.equal(buildBackupFilename('2026-11-18'), 'fitness-backup-2026-11-18.json');
});

test('fetchDatabaseBackupJson fetches GET /api/data and returns formatted JSON text', async () => {
  let calledUrl = '';
  let calledMethod = '';
  const mockFetch: typeof fetch = async (input, init) => {
    calledUrl = String(input);
    calledMethod = init?.method ?? 'GET';
    return new Response(
      JSON.stringify({
        profile: { name: 'Иван', heightCm: 180, weightKg: 80 },
        themeAccent: 'blue',
        logs: { '2026-11-18': { date: '2026-11-18', sleepHours: 8, muscles: ['chest'] } },
        goals: [],
        hevyWorkouts: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const result = await fetchDatabaseBackupJson(mockFetch);
  assert.equal(calledUrl, '/api/data');
  assert.equal(calledMethod, 'GET');
  assert.equal((result.data.profile as { name: string }).name, 'Иван');
  assert.ok(result.jsonText.includes('"hevyWorkouts"'));
});

test('validateBackupJsonFile rejects malformed JSON and non-object JSON', () => {
  const emptyRes = validateBackupJsonFile('   ');
  assert.equal(emptyRes.ok, false);

  const badJson = validateBackupJsonFile('{ broken json');
  assert.equal(badJson.ok, false);
  if (!badJson.ok) {
    assert.ok(badJson.error.includes('валиден JSON'));
  }

  const arrayJson = validateBackupJsonFile('[1, 2, 3]');
  assert.equal(arrayJson.ok, false);
  if (!arrayJson.ok) {
    assert.ok(arrayJson.error.includes('JSON обект'));
  }

  const unrelatedJson = validateBackupJsonFile('{"name":"my-app","version":"1.0.0"}');
  assert.equal(unrelatedJson.ok, false);
  if (!unrelatedJson.ok) {
    assert.ok(unrelatedJson.error.includes('разпознаваема структура'));
  }
});

test('validateBackupJsonFile validates direct database.json backup and wrapped export backup', () => {
  const directBackup = JSON.stringify({
    profile: { name: 'Петър', heightCm: 182, weightKg: 84 },
    themeAccent: 'green',
    logs: {
      '2026-11-17': { date: '2026-11-17', sleepHours: 7.5, muscles: ['back'] },
      '2026-11-18': { date: '2026-11-18', sleepHours: 8, muscles: ['legs'] },
    },
    goals: [],
    hevyWorkouts: [
      {
        id: 'w1',
        title: 'Legs',
        startTime: '2026-11-18T18:00:00',
        date: '2026-11-18',
        exercises: [],
        totalVolumeKg: 4200,
        maxWeightKg: 120,
        totalSets: 12,
        importedAt: '2026-11-18T19:00:00',
      },
    ],
    dailyLogs: [{ date: '2026-11-18', sleepHours: 8, completedHabits: ['Креатин'] }],
  });

  const directRes = validateBackupJsonFile(directBackup);
  assert.equal(directRes.ok, true);
  if (directRes.ok) {
    assert.equal(directRes.summary.daysCount, 2);
    assert.equal(directRes.summary.workoutsCount, 1);
    assert.equal(directRes.summary.checkinsCount, 1);
    assert.equal((directRes.payload.profile as { name: string }).name, 'Петър');
  }

  const wrappedBackup = JSON.stringify({
    version: 1,
    exportedAt: '2026-11-18T12:00:00Z',
    data: {
      profile: { name: 'Мария', heightCm: 168, weightKg: 60 },
      themeAccent: 'purple',
      logs: {
        '2026-11-18': { date: '2026-11-18', sleepHours: 8, muscles: ['abs'] },
      },
      goals: [],
    },
  });

  const wrappedRes = validateBackupJsonFile(wrappedBackup);
  assert.equal(wrappedRes.ok, true);
  if (wrappedRes.ok) {
    assert.equal('data' in wrappedRes.payload, false);
    assert.equal((wrappedRes.payload.profile as { name: string }).name, 'Мария');
  }
});

test('restoreDatabaseBackupJson posts validated JSON payload to /api/data', async () => {
  let postedUrl = '';
  let postedMethod = '';
  let postedBody = '';
  const mockFetch: typeof fetch = async (input, init) => {
    postedUrl = String(input);
    postedMethod = init?.method ?? '';
    postedBody = typeof init?.body === 'string' ? init.body : '';
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  await restoreDatabaseBackupJson({ logs: {}, goals: [] }, mockFetch);
  assert.equal(postedUrl, '/api/data');
  assert.equal(postedMethod, 'POST');
  assert.equal(postedBody, '{"logs":{},"goals":[]}');
});
