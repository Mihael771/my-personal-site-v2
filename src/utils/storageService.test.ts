import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GIST_DATABASE_FILENAME,
  LOCAL_STORAGE_DB_KEY,
  checkForNewerGistVersionOnStartup,
  clearGistConfig,
  connectAndSyncWithGist,
  detectStorageMode,
  isDiaryStateEmpty,
  isLocalServerHost,
  loadDiaryStateHybrid,
  loadGistConfig,
  readDiaryFromLocalStorage,
  saveDiaryStateHybrid,
  saveGistConfig,
  saveGistSyncMeta,
  type CloudSyncStatus,
} from '../services/storageService';
import type { DiaryState } from '../types/fitness';
import { createInitialDiaryState } from './fitnessMath';

function installMockBrowser(options?: { online?: boolean; hostname?: string }) {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: mockStorage,
      location: { hostname: options?.hostname ?? 'user.github.io' },
    },
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: options?.online ?? true },
    configurable: true,
    writable: true,
  });

  return { store, mockStorage };
}

function makeNonEmptyState(weightKg: number, date = '2026-11-19'): DiaryState {
  const base = createInitialDiaryState();
  return {
    ...base,
    profile: { name: 'Иван', heightCm: 180, weightKg },
    dailyLogs: [
      {
        date,
        weightKg,
        sleepHours: 8,
        steps: 10500,
        completedHabits: [],
      },
    ],
  };
}

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('detectStorageMode distinguishes localhost/127.0.0.1 from GitHub Pages / mobile hosts', () => {
  assert.equal(isLocalServerHost('localhost'), true);
  assert.equal(isLocalServerHost('127.0.0.1'), true);
  assert.equal(isLocalServerHost('::1'), true);
  assert.equal(detectStorageMode('localhost'), 'local-api');
  assert.equal(detectStorageMode('127.0.0.1'), 'local-api');

  assert.equal(isLocalServerHost('myuser.github.io'), false);
  assert.equal(isLocalServerHost('fitness.example.com'), false);
  assert.equal(detectStorageMode('myuser.github.io'), 'standalone-local');
});

test('standalone-local mode reads and writes LocalStorage offline without calling /api/data', async () => {
  installMockBrowser({ online: false, hostname: 'myuser.github.io' });

  let fetchCalls = 0;
  const mockFetch: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error('Should not call fetch in offline standalone mode');
  };

  const sample = makeNonEmptyState(82.4);
  const saveRes = await saveDiaryStateHybrid(sample, {
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
  });
  assert.equal(saveRes.cloudSynced, false);
  assert.equal(fetchCalls, 0);

  const loaded = await loadDiaryStateHybrid({
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
  });
  assert.equal(loaded.mode, 'standalone-local');
  assert.equal(loaded.state.dailyLogs?.length, 1);
  assert.equal(loaded.state.dailyLogs?.[0]?.weightKg, 82.4);
  assert.equal(fetchCalls, 0);
});

test('local-api mode reads and writes /api/data and mirrors into LocalStorage', async () => {
  const { store } = installMockBrowser({ online: true, hostname: 'localhost' });
  const serverDb = makeNonEmptyState(79.5);
  let postedBody = '';

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === '/api/data' && (!init?.method || init.method === 'GET')) {
      return makeJsonResponse(serverDb);
    }
    if (url === '/api/data' && init?.method === 'POST') {
      postedBody = String(init.body ?? '');
      return makeJsonResponse({ ok: true });
    }
    return new Response('Not found', { status: 404 });
  };

  const loaded = await loadDiaryStateHybrid({
    hostname: 'localhost',
    fetchImpl: mockFetch,
  });
  assert.equal(loaded.mode, 'local-api');
  assert.equal(loaded.state.dailyLogs?.[0]?.weightKg, 79.5);
  assert.ok(store.has(LOCAL_STORAGE_DB_KEY));

  const updated = makeNonEmptyState(80.1);
  await saveDiaryStateHybrid(updated, {
    hostname: 'localhost',
    fetchImpl: mockFetch,
  });
  assert.ok(postedBody.length > 0);
  assert.ok(postedBody.includes('80.1'));
  assert.equal(readDiaryFromLocalStorage()?.dailyLogs?.[0]?.weightKg, 80.1);
});

test('connectAndSyncWithGist creates a private Gist when only GitHub Token is provided', async () => {
  installMockBrowser({ online: true, hostname: 'myuser.github.io' });
  clearGistConfig();

  let createdMethod = '';
  let createdPayloadRaw = '';

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://api.github.com/gists' && init?.method === 'POST') {
      createdMethod = init.method;
      createdPayloadRaw = String(init.body ?? '');
      return makeJsonResponse(
        {
          id: 'new_private_gist_123',
          updated_at: '2026-11-20T10:00:00Z',
        },
        201,
      );
    }
    return new Response('Unexpected request', { status: 500 });
  };

  const localState = makeNonEmptyState(81.2);
  const res = await connectAndSyncWithGist({
    token: 'ghp_test_token',
    gistId: '',
    currentLocalState: localState,
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
  });

  assert.equal(res.action, 'created');
  assert.equal(res.gistId, 'new_private_gist_123');
  assert.equal(createdMethod, 'POST');
  const createdPayload = JSON.parse(createdPayloadRaw) as {
    public?: boolean;
    files?: Record<string, { content: string }>;
  };
  assert.equal(createdPayload.public, false);
  assert.ok(createdPayload.files?.[GIST_DATABASE_FILENAME]?.content.includes('81.2'));

  const savedCfg = loadGistConfig();
  assert.equal(savedCfg.token, 'ghp_test_token');
  assert.equal(savedCfg.gistId, 'new_private_gist_123');
});

test('Anti-overwrite protection: empty new phone ALWAYS pulls cloud Gist and NEVER overwrites it with PATCH', async () => {
  installMockBrowser({ online: true, hostname: 'myuser.github.io' });
  clearGistConfig();

  const cloudState = makeNonEmptyState(84.7, '2026-11-18');
  let patchCalled = false;

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://api.github.com/gists/existing_gist_99' && (!init?.method || init.method === 'GET')) {
      return makeJsonResponse({
        id: 'existing_gist_99',
        updated_at: '2026-11-20T09:30:00Z',
        files: {
          [GIST_DATABASE_FILENAME]: {
            filename: GIST_DATABASE_FILENAME,
            content: JSON.stringify(cloudState),
            truncated: false,
          },
        },
      });
    }
    if (init?.method === 'PATCH') {
      patchCalled = true;
      return makeJsonResponse({ updated_at: '2026-11-20T09:35:00Z' });
    }
    return new Response('Not found', { status: 404 });
  };

  const emptyPhoneState = createInitialDiaryState();
  assert.equal(isDiaryStateEmpty(emptyPhoneState), true);

  const res = await connectAndSyncWithGist({
    token: 'ghp_phone_token',
    gistId: 'existing_gist_99',
    currentLocalState: emptyPhoneState,
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
  });

  assert.equal(patchCalled, false, 'Empty local DB must NEVER PATCH cloud Gist');
  assert.equal(res.action, 'pulled');
  assert.equal(res.state.dailyLogs?.[0]?.weightKg, 84.7);
  assert.equal(readDiaryFromLocalStorage()?.dailyLogs?.[0]?.weightKg, 84.7);
});

test('saveDiaryStateHybrid pushes PATCH to GitHub Gist when configured and online, and degrades gracefully offline', async () => {
  installMockBrowser({ online: true, hostname: 'myuser.github.io' });
  saveGistConfig({ token: 'ghp_sync_tok', gistId: 'gist_abc' });

  let patchCount = 0;
  const statuses: CloudSyncStatus[] = [];

  const mockFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://api.github.com/gists/gist_abc' && init?.method === 'PATCH') {
      patchCount += 1;
      return makeJsonResponse({ updated_at: '2026-11-20T12:00:00Z' });
    }
    return new Response('Unexpected', { status: 500 });
  };

  const state = makeNonEmptyState(83.0);
  const onlineRes = await saveDiaryStateHybrid(state, {
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
    onSyncStatusChange: (s) => statuses.push(s),
  });
  assert.equal(onlineRes.cloudSynced, true);
  assert.equal(patchCount, 1);
  assert.deepEqual(statuses, ['syncing', 'synced']);

  // Now simulate offline in the gym
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: false },
    configurable: true,
    writable: true,
  });
  const offlineStatuses: CloudSyncStatus[] = [];
  const offlineState = makeNonEmptyState(83.3);
  const offlineRes = await saveDiaryStateHybrid(offlineState, {
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
    onSyncStatusChange: (s) => offlineStatuses.push(s),
  });
  assert.equal(offlineRes.cloudSynced, false);
  assert.equal(offlineRes.cloudSkippedOffline, true);
  assert.equal(patchCount, 1);
  assert.deepEqual(offlineStatuses, ['offline']);
  assert.equal(readDiaryFromLocalStorage()?.dailyLogs?.[0]?.weightKg, 83.3);
});

test('checkForNewerGistVersionOnStartup downloads newer cloud edits made on another device', async () => {
  installMockBrowser({ online: true, hostname: 'myuser.github.io' });
  saveGistConfig({ token: 'ghp_sync_tok', gistId: 'gist_xyz' });
  saveGistSyncMeta({
    lastRemoteUpdatedAt: '2026-11-20T08:00:00Z',
    lastLocalUpdatedAt: '2026-11-20T08:00:00Z',
  });

  const newerCloudState = makeNonEmptyState(80.8, '2026-11-20');
  const mockFetch: typeof fetch = async () =>
    makeJsonResponse({
      id: 'gist_xyz',
      updated_at: '2026-11-20T11:15:00Z',
      files: {
        [GIST_DATABASE_FILENAME]: {
          filename: GIST_DATABASE_FILENAME,
          content: JSON.stringify(newerCloudState),
          truncated: false,
        },
      },
    });

  const olderLocal = makeNonEmptyState(81.5, '2026-11-19');
  const check = await checkForNewerGistVersionOnStartup({
    currentLocalState: olderLocal,
    hostname: 'myuser.github.io',
    fetchImpl: mockFetch,
  });

  assert.equal(check.checked, true);
  assert.equal(check.updatedFromCloud, true);
  assert.equal(check.state?.dailyLogs?.[0]?.weightKg, 80.8);
  assert.equal(readDiaryFromLocalStorage()?.dailyLogs?.[0]?.weightKg, 80.8);
});
