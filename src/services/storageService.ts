import type { DiaryState } from '../types/fitness';
import { cleanData } from '../utils/cleanData';
import { createInitialDiaryState, parseDiaryPayload } from '../utils/fitnessMath';

export const LOCAL_STORAGE_DB_KEY = 'fizioprogres_database_v1';
export const GIST_CONFIG_STORAGE_KEY = 'fizioprogres_gist_config_v1';
export const GIST_SYNC_META_STORAGE_KEY = 'fizioprogres_gist_sync_meta_v1';
export const GIST_DATABASE_FILENAME = 'fitness_database.json';

const LOCAL_API_ENDPOINT = '/api/data';
const GITHUB_API_BASE = 'https://api.github.com';

export type StorageMode = 'local-api' | 'standalone-local';

export type CloudSyncStatus =
  | 'unconfigured'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error';

export interface GistSyncConfig {
  token: string;
  gistId: string;
}

export interface GistSyncMeta {
  lastSyncedAt?: string;
  lastRemoteUpdatedAt?: string;
  lastLocalUpdatedAt?: string;
}

export interface GistRemoteReadResult {
  gistId: string;
  updatedAt: string | null;
  state: DiaryState;
  isEmpty: boolean;
  hasFile: boolean;
}

export interface ConnectGistResult {
  action: 'created' | 'pulled' | 'pushed' | 'in_sync';
  gistId: string;
  state: DiaryState;
  updatedAt: string | null;
  message: string;
}

export interface StartupSyncCheckResult {
  checked: boolean;
  updatedFromCloud: boolean;
  state?: DiaryState;
  updatedAt?: string | null;
  offline?: boolean;
  error?: string;
}

function getSafeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isLocalServerHost(hostname?: string): boolean {
  const host =
    typeof hostname === 'string'
      ? hostname.trim().toLowerCase()
      : typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname.trim().toLowerCase()
        : '';
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function detectStorageMode(hostname?: string): StorageMode {
  return isLocalServerHost(hostname) ? 'local-api' : 'standalone-local';
}

export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function loadGistConfig(): GistSyncConfig {
  const storage = getSafeLocalStorage();
  if (!storage) return { token: '', gistId: '' };
  try {
    const raw = storage.getItem(GIST_CONFIG_STORAGE_KEY);
    if (!raw) return { token: '', gistId: '' };
    const parsed = JSON.parse(raw) as Partial<GistSyncConfig>;
    return {
      token: typeof parsed.token === 'string' ? parsed.token.trim() : '',
      gistId: typeof parsed.gistId === 'string' ? parsed.gistId.trim() : '',
    };
  } catch {
    return { token: '', gistId: '' };
  }
}

export function saveGistConfig(config: GistSyncConfig): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    const clean: GistSyncConfig = {
      token: config.token.trim(),
      gistId: config.gistId.trim(),
    };
    storage.setItem(GIST_CONFIG_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Ignore storage quota / private mode errors
  }
}

export function clearGistConfig(): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(GIST_CONFIG_STORAGE_KEY);
    storage.removeItem(GIST_SYNC_META_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export function loadGistSyncMeta(): GistSyncMeta {
  const storage = getSafeLocalStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(GIST_SYNC_META_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<GistSyncMeta>;
    return {
      ...(typeof parsed.lastSyncedAt === 'string'
        ? { lastSyncedAt: parsed.lastSyncedAt }
        : {}),
      ...(typeof parsed.lastRemoteUpdatedAt === 'string'
        ? { lastRemoteUpdatedAt: parsed.lastRemoteUpdatedAt }
        : {}),
      ...(typeof parsed.lastLocalUpdatedAt === 'string'
        ? { lastLocalUpdatedAt: parsed.lastLocalUpdatedAt }
        : {}),
    };
  } catch {
    return {};
  }
}

export function saveGistSyncMeta(patch: Partial<GistSyncMeta>): GistSyncMeta {
  const current = loadGistSyncMeta();
  const next: GistSyncMeta = { ...current, ...patch };
  const storage = getSafeLocalStorage();
  if (storage) {
    try {
      storage.setItem(GIST_SYNC_META_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore
    }
  }
  return next;
}

export function countDiaryDataItems(state: DiaryState): number {
  const dailyCount = state.dailyLogs?.length ?? 0;
  const hevyCount = state.hevyWorkouts?.length ?? 0;
  const legacyLogsCount = Object.keys(state.logs ?? {}).length;
  const enabledGoalsCount = (state.goals ?? []).filter((g) => g.enabled).length;
  const customMapCount = Object.keys(state.customExerciseMappings ?? {}).length;
  const supplementCyclesCount = Object.keys(state.supplementCycles ?? {}).length;
  return (
    dailyCount +
    hevyCount +
    legacyLogsCount +
    enabledGoalsCount +
    customMapCount +
    supplementCyclesCount
  );
}

/**
 * Returns true if the DiaryState has no user training, biometric, or goal records yet.
 * Used as an anti-overwrite guard so a blank phone never clobbers an existing cloud Gist.
 */
export function isDiaryStateEmpty(state: DiaryState): boolean {
  if (countDiaryDataItems(state) > 0) return false;
  const hasProfileName = Boolean(state.profile?.name?.trim());
  const hasIntervalsKey = Boolean(state.userSettings?.intervalsApiKey?.trim());
  return !hasProfileName && !hasIntervalsKey;
}

export function readDiaryFromLocalStorage(): DiaryState | null {
  const storage = getSafeLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LOCAL_STORAGE_DB_KEY);
    if (!raw || !raw.trim()) return null;
    const parsed = parseDiaryPayload(raw);
    return parsed.ok ? parsed.state : null;
  } catch {
    return null;
  }
}

export function writeDiaryToLocalStorage(state: DiaryState): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    const payload = cleanData(state);
    storage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to persist diary to localStorage:', err);
  }
}

export function exportDiaryStateToJsonText(state: DiaryState): string {
  return `${JSON.stringify(cleanData(state), null, 2)}\n`;
}

async function fetchFromLocalApi(
  fetchImpl: typeof fetch = fetch,
): Promise<DiaryState | null> {
  const response = await fetchImpl(LOCAL_API_ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!response.ok) {
    return null;
  }
  const contentType = (response.headers?.get('content-type') ?? '').toLowerCase();
  const text = await response.text();
  if (!text.trim()) {
    return createInitialDiaryState();
  }
  // Guard against static hosts returning index.html on unknown routes
  if (
    contentType.includes('text/html') ||
    text.trim().startsWith('<!doctype') ||
    text.trim().startsWith('<html')
  ) {
    return null;
  }
  const parsed = parseDiaryPayload(text);
  return parsed.ok ? parsed.state : null;
}

async function saveToLocalApi(
  state: DiaryState,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const payload = cleanData(state);
  const response = await fetchImpl(LOCAL_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Грешка при запис в локалния сървър (${response.status})`);
  }
}

function buildGithubHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (token.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }
  return headers;
}

function parseGithubErrorMessage(status: number, fallbackText: string): string {
  if (status === 401) {
    return 'GitHub отхвърли токена (401). Провери дали Personal Access Token е валиден и има право "gist".';
  }
  if (status === 403) {
    return 'Няма достъп до GitHub Gist (403). Увери се, че токенът има включен scope "gist".';
  }
  if (status === 404) {
    return 'Gist с това ID не е намерен (404). Провери Gist ID или остави полето празно, за да се създаде нов.';
  }
  return fallbackText || `GitHub API върна грешка (${status}).`;
}

export async function createPrivateGist(params: {
  token: string;
  state: DiaryState;
  fetchImpl?: typeof fetch;
}): Promise<{ gistId: string; updatedAt: string | null }> {
  const { token, state, fetchImpl = fetch } = params;
  const cleanToken = token.trim();
  if (!cleanToken) {
    throw new Error('Въведи валиден GitHub Token (ghp_… или github_pat_…).');
  }

  const content = exportDiaryStateToJsonText(state);
  const res = await fetchImpl(`${GITHUB_API_BASE}/gists`, {
    method: 'POST',
    headers: buildGithubHeaders(cleanToken),
    body: JSON.stringify({
      description: 'ФизиоПрогрес — лична фитнес база данни (частен Gist)',
      public: false,
      files: {
        [GIST_DATABASE_FILENAME]: {
          content,
        },
      },
    }),
  });

  if (!res.ok) {
    let errText = '';
    try {
      const errJson = (await res.json()) as { message?: string };
      errText = errJson.message ?? '';
    } catch {
      // ignore
    }
    throw new Error(parseGithubErrorMessage(res.status, errText));
  }

  const data = (await res.json()) as { id?: string; updated_at?: string };
  if (!data.id || typeof data.id !== 'string') {
    throw new Error('GitHub не върна валидно Gist ID.');
  }

  return {
    gistId: data.id,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : new Date().toISOString(),
  };
}

export async function fetchGistDatabase(params: {
  token: string;
  gistId: string;
  fetchImpl?: typeof fetch;
}): Promise<GistRemoteReadResult> {
  const { token, gistId, fetchImpl = fetch } = params;
  const cleanGistId = gistId.trim();
  if (!cleanGistId) {
    throw new Error('Липсва Gist ID.');
  }

  const res = await fetchImpl(
    `${GITHUB_API_BASE}/gists/${encodeURIComponent(cleanGistId)}`,
    {
      method: 'GET',
      headers: buildGithubHeaders(token),
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    let errText = '';
    try {
      const errJson = (await res.json()) as { message?: string };
      errText = errJson.message ?? '';
    } catch {
      // ignore
    }
    throw new Error(parseGithubErrorMessage(res.status, errText));
  }

  const data = (await res.json()) as {
    id?: string;
    updated_at?: string;
    files?: Record<
      string,
      {
        filename?: string;
        content?: string;
        truncated?: boolean;
        raw_url?: string;
      }
    >;
  };

  const files = data.files ?? {};
  const fileEntry =
    files[GIST_DATABASE_FILENAME] ??
    Object.values(files).find((f) =>
      (f?.filename ?? '').toLowerCase().endsWith('.json'),
    );

  if (!fileEntry) {
    return {
      gistId: data.id ?? cleanGistId,
      updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
      state: createInitialDiaryState(),
      isEmpty: true,
      hasFile: false,
    };
  }

  let rawContent = typeof fileEntry.content === 'string' ? fileEntry.content : '';
  if (fileEntry.truncated && fileEntry.raw_url) {
    const rawRes = await fetchImpl(fileEntry.raw_url, {
      method: 'GET',
      cache: 'no-store',
    });
    if (rawRes.ok) {
      rawContent = await rawRes.text();
    }
  }

  if (!rawContent.trim()) {
    return {
      gistId: data.id ?? cleanGistId,
      updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
      state: createInitialDiaryState(),
      isEmpty: true,
      hasFile: true,
    };
  }

  const parsed = parseDiaryPayload(rawContent);
  if (!parsed.ok) {
    throw new Error(`Файлът в GitHub Gist не е валидна база данни: ${parsed.error}`);
  }

  return {
    gistId: data.id ?? cleanGistId,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
    state: parsed.state,
    isEmpty: isDiaryStateEmpty(parsed.state),
    hasFile: true,
  };
}

export async function patchGistDatabase(params: {
  token: string;
  gistId: string;
  state: DiaryState;
  fetchImpl?: typeof fetch;
}): Promise<{ updatedAt: string }> {
  const { token, gistId, state, fetchImpl = fetch } = params;
  const cleanToken = token.trim();
  const cleanGistId = gistId.trim();
  if (!cleanToken || !cleanGistId) {
    throw new Error('Необходими са GitHub Token и Gist ID за запис в облака.');
  }

  const content = exportDiaryStateToJsonText(state);
  const res = await fetchImpl(
    `${GITHUB_API_BASE}/gists/${encodeURIComponent(cleanGistId)}`,
    {
      method: 'PATCH',
      headers: buildGithubHeaders(cleanToken),
      body: JSON.stringify({
        files: {
          [GIST_DATABASE_FILENAME]: {
            content,
          },
        },
      }),
    },
  );

  if (!res.ok) {
    let errText = '';
    try {
      const errJson = (await res.json()) as { message?: string };
      errText = errJson.message ?? '';
    } catch {
      // ignore
    }
    throw new Error(parseGithubErrorMessage(res.status, errText));
  }

  const data = (await res.json()) as { updated_at?: string };
  return {
    updatedAt:
      typeof data.updated_at === 'string'
        ? data.updated_at
        : new Date().toISOString(),
  };
}

function parseIsoTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Loads the initial diary state using the appropriate local storage strategy:
 * - On localhost / 127.0.0.1: reads local database.json via /api/data (mirrored to localStorage).
 * - On smartphone / GitHub Pages: reads instantly from localStorage (works offline).
 */
export async function loadDiaryStateHybrid(options?: {
  hostname?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ state: DiaryState; mode: StorageMode }> {
  const mode = detectStorageMode(options?.hostname);
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (mode === 'local-api') {
    try {
      const apiState = await fetchFromLocalApi(fetchImpl);
      if (apiState) {
        writeDiaryToLocalStorage(apiState);
        return { state: apiState, mode };
      }
    } catch {
      // Fallback gracefully to localStorage if local server temporarily fails
    }
    const cached = readDiaryFromLocalStorage();
    return { state: cached ?? createInitialDiaryState(), mode };
  }

  // Standalone mobile / GitHub Pages mode: localStorage is primary and instant (works offline)
  const localCached = readDiaryFromLocalStorage();
  if (localCached) {
    return { state: localCached, mode };
  }

  // If localStorage is completely empty and online, try a silent one-time probe of /api/data
  // (e.g. preview server environments) — safely ignored on GitHub Pages (404 / HTML).
  if (isBrowserOnline()) {
    try {
      const probed = await fetchFromLocalApi(fetchImpl);
      if (probed && !isDiaryStateEmpty(probed)) {
        writeDiaryToLocalStorage(probed);
        return { state: probed, mode };
      }
    } catch {
      // Expected on GitHub Pages / offline mobile
    }
  }

  return { state: createInitialDiaryState(), mode };
}

/**
 * Saves the diary state locally (LocalStorage + /api/data on localhost) and
 * pushes to GitHub Gist via PATCH when configured and online.
 */
export async function saveDiaryStateHybrid(
  state: DiaryState,
  options?: {
    hostname?: string;
    fetchImpl?: typeof fetch;
    skipCloudPush?: boolean;
    allowEmptyCloudPush?: boolean;
    onSyncStatusChange?: (status: CloudSyncStatus, message?: string) => void;
  },
): Promise<{ cloudSynced: boolean; cloudSkippedOffline?: boolean }> {
  const mode = detectStorageMode(options?.hostname);
  const fetchImpl = options?.fetchImpl ?? fetch;
  const nowIso = new Date().toISOString();

  // 1. Always write immediately to localStorage (offline-first on mobile & mirror on localhost)
  writeDiaryToLocalStorage(state);
  saveGistSyncMeta({ lastLocalUpdatedAt: nowIso });

  // 2. On localhost / 127.0.0.1, also write to local database.json via /api/data
  if (mode === 'local-api') {
    await saveToLocalApi(state, fetchImpl);
  }

  // 3. Push to GitHub Gist if configured
  const config = loadGistConfig();
  if (options?.skipCloudPush || !config.token || !config.gistId) {
    return { cloudSynced: false };
  }

  if (!isBrowserOnline()) {
    options?.onSyncStatusChange?.('offline', 'Офлайн — запазено локално на устройството');
    return { cloudSynced: false, cloudSkippedOffline: true };
  }

  // Anti-overwrite guard: never silently overwrite cloud with an empty database
  if (isDiaryStateEmpty(state) && !options?.allowEmptyCloudPush) {
    return { cloudSynced: false };
  }

  try {
    options?.onSyncStatusChange?.('syncing');
    const { updatedAt } = await patchGistDatabase({
      token: config.token,
      gistId: config.gistId,
      state,
      fetchImpl,
    });
    saveGistSyncMeta({
      lastSyncedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: updatedAt,
    });
    options?.onSyncStatusChange?.('synced');
    return { cloudSynced: true };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : 'Грешка при синхронизация с GitHub Gist.';
    options?.onSyncStatusChange?.('error', msg);
    // Local save already succeeded — do not roll back user's local workout/log entry!
    return { cloudSynced: false };
  }
}

/**
 * Connects and syncs with GitHub Gist:
 * - Token only (empty Gist ID): creates a new private Gist with fitness_database.json and saves ID.
 * - Existing Gist ID: ALWAYS fetches GET first! If local DB is empty (new phone) or cloud is newer,
 *   downloads and applies cloud data instead of overwriting it.
 */
export async function connectAndSyncWithGist(params: {
  token: string;
  gistId: string;
  currentLocalState: DiaryState;
  hostname?: string;
  fetchImpl?: typeof fetch;
  forceDirection?: 'auto' | 'pull' | 'push';
}): Promise<ConnectGistResult> {
  const {
    token,
    gistId,
    currentLocalState,
    hostname,
    fetchImpl = fetch,
    forceDirection = 'auto',
  } = params;
  const cleanToken = token.trim();
  const cleanGistId = gistId.trim();

  if (!cleanToken) {
    throw new Error('Въведи своя GitHub Personal Access Token (с право "gist").');
  }

  // Case 1: Only GitHub Token provided (empty Gist ID) -> create a new private Gist
  if (!cleanGistId) {
    const created = await createPrivateGist({
      token: cleanToken,
      state: currentLocalState,
      fetchImpl,
    });
    saveGistConfig({ token: cleanToken, gistId: created.gistId });
    saveGistSyncMeta({
      lastSyncedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: created.updatedAt ?? new Date().toISOString(),
      lastLocalUpdatedAt: new Date().toISOString(),
    });
    return {
      action: 'created',
      gistId: created.gistId,
      state: currentLocalState,
      updatedAt: created.updatedAt,
      message: `Създаден е нов частен GitHub Gist (${created.gistId}) и текущата база е качена успешно.`,
    };
  }

  // Case 2: Existing Gist ID -> ALWAYS fetch cloud data FIRST!
  const remote = await fetchGistDatabase({
    token: cleanToken,
    gistId: cleanGistId,
    fetchImpl,
  });

  saveGistConfig({ token: cleanToken, gistId: remote.gistId });

  const localIsEmpty = isDiaryStateEmpty(currentLocalState);
  const meta = loadGistSyncMeta();
  const remoteMs = parseIsoTimestampMs(remote.updatedAt);
  const localMs = parseIsoTimestampMs(meta.lastLocalUpdatedAt);
  const lastKnownRemoteMs = parseIsoTimestampMs(meta.lastRemoteUpdatedAt);

  // Strict protection: if local is empty and remote has data, ALWAYS pull from cloud!
  const shouldPull =
    !remote.isEmpty &&
    (forceDirection === 'pull' ||
      localIsEmpty ||
      (forceDirection === 'auto' &&
        remoteMs > 0 &&
        (lastKnownRemoteMs === 0 || remoteMs > Math.max(localMs, lastKnownRemoteMs))));

  if (shouldPull) {
    // Persist pulled cloud state locally (without re-uploading back to Gist)
    await saveDiaryStateHybrid(remote.state, {
      hostname,
      fetchImpl,
      skipCloudPush: true,
    });
    saveGistSyncMeta({
      lastSyncedAt: new Date().toISOString(),
      lastRemoteUpdatedAt: remote.updatedAt ?? new Date().toISOString(),
      lastLocalUpdatedAt: remote.updatedAt ?? new Date().toISOString(),
    });
    return {
      action: 'pulled',
      gistId: remote.gistId,
      state: remote.state,
      updatedAt: remote.updatedAt,
      message: localIsEmpty
        ? 'Защита активна: локалната база беше празна — данните са изтеглени безопасно от облака!'
        : 'Изтеглена е по-нова версия на базата данни от GitHub Gist.',
    };
  }

  if (forceDirection === 'pull' && remote.isEmpty) {
    return {
      action: 'in_sync',
      gistId: remote.gistId,
      state: currentLocalState,
      updatedAt: remote.updatedAt,
      message: 'Облачният Gist все още не съдържа записи.',
    };
  }

  // Anti-overwrite guard even on manual push if local is empty while remote is non-empty
  if (localIsEmpty && !remote.isEmpty) {
    await saveDiaryStateHybrid(remote.state, {
      hostname,
      fetchImpl,
      skipCloudPush: true,
    });
    return {
      action: 'pulled',
      gistId: remote.gistId,
      state: remote.state,
      updatedAt: remote.updatedAt,
      message:
        'Предотвратено презаписване с празна база — заредихме съществуващите данни от GitHub Gist.',
    };
  }

  // Push local state to cloud Gist
  const patched = await patchGistDatabase({
    token: cleanToken,
    gistId: remote.gistId,
    state: currentLocalState,
    fetchImpl,
  });

  saveGistSyncMeta({
    lastSyncedAt: new Date().toISOString(),
    lastRemoteUpdatedAt: patched.updatedAt,
    lastLocalUpdatedAt: patched.updatedAt,
  });

  return {
    action: 'pushed',
    gistId: remote.gistId,
    state: currentLocalState,
    updatedAt: patched.updatedAt,
    message: 'Данните са качени и синхронизирани успешно с GitHub Gist.',
  };
}

/**
 * Checks GitHub Gist on app open to pull any newer version edited on another device.
 */
export async function checkForNewerGistVersionOnStartup(params: {
  currentLocalState: DiaryState;
  hostname?: string;
  fetchImpl?: typeof fetch;
}): Promise<StartupSyncCheckResult> {
  const { currentLocalState, hostname, fetchImpl = fetch } = params;
  const config = loadGistConfig();
  if (!config.token || !config.gistId) {
    return { checked: false, updatedFromCloud: false };
  }

  if (!isBrowserOnline()) {
    return { checked: false, updatedFromCloud: false, offline: true };
  }

  try {
    const remote = await fetchGistDatabase({
      token: config.token,
      gistId: config.gistId,
      fetchImpl,
    });

    if (remote.isEmpty) {
      return { checked: true, updatedFromCloud: false, updatedAt: remote.updatedAt };
    }

    const meta = loadGistSyncMeta();
    const localIsEmpty = isDiaryStateEmpty(currentLocalState);
    const remoteMs = parseIsoTimestampMs(remote.updatedAt);
    const lastRemoteMs = parseIsoTimestampMs(meta.lastRemoteUpdatedAt);
    const lastLocalMs = parseIsoTimestampMs(meta.lastLocalUpdatedAt);

    // Pull if local is empty OR remote timestamp is strictly newer than last known sync/local write
    const isRemoteNewer =
      localIsEmpty ||
      (remoteMs > 0 && remoteMs > lastRemoteMs && remoteMs >= lastLocalMs);

    if (isRemoteNewer) {
      await saveDiaryStateHybrid(remote.state, {
        hostname,
        fetchImpl,
        skipCloudPush: true,
      });
      saveGistSyncMeta({
        lastSyncedAt: new Date().toISOString(),
        lastRemoteUpdatedAt: remote.updatedAt ?? new Date().toISOString(),
        lastLocalUpdatedAt: remote.updatedAt ?? new Date().toISOString(),
      });
      return {
        checked: true,
        updatedFromCloud: true,
        state: remote.state,
        updatedAt: remote.updatedAt,
      };
    }

    saveGistSyncMeta({ lastSyncedAt: new Date().toISOString() });
    return { checked: true, updatedFromCloud: false, updatedAt: remote.updatedAt };
  } catch (err) {
    return {
      checked: true,
      updatedFromCloud: false,
      error: err instanceof Error ? err.message : 'Неуспешна проверка на Gist.',
    };
  }
}

/**
 * Restores a validated backup JSON payload into localStorage (+ /api/data on localhost)
 * and syncs to Gist if configured.
 */
export async function restoreValidatedPayloadHybrid(
  payload: Record<string, unknown>,
  options?: {
    hostname?: string;
    fetchImpl?: typeof fetch;
    onSyncStatusChange?: (status: CloudSyncStatus, message?: string) => void;
  },
): Promise<DiaryState> {
  const parsed = parseDiaryPayload(JSON.stringify(payload));
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  await saveDiaryStateHybrid(parsed.state, {
    hostname: options?.hostname,
    fetchImpl: options?.fetchImpl,
    allowEmptyCloudPush: true,
    onSyncStatusChange: options?.onSyncStatusChange,
  });
  return parsed.state;
}
