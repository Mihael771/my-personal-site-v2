import { cleanData } from './cleanData';
import { getLocalDateKey, parseDiaryPayload } from './fitnessMath';

export interface BackupSummary {
  daysCount: number;
  workoutsCount: number;
  checkinsCount: number;
  goalsCount: number;
}

export type BackupValidationResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
      summary: BackupSummary;
    }
  | {
      ok: false;
      error: string;
    };

export function buildBackupFilename(dateKey: string = getLocalDateKey()): string {
  return `fitness-backup-${dateKey}.json`;
}

export async function fetchDatabaseBackupJson(
  fetchImpl: typeof fetch = fetch,
): Promise<{ jsonText: string; data: Record<string, unknown> }> {
  const response = await fetchImpl('/api/data', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Грешка при изтегляне от /api/data (${response.status})`);
  }

  const rawText = await response.text();
  let parsed: unknown;
  try {
    parsed = rawText.trim() ? JSON.parse(rawText) : {};
  } catch {
    throw new Error('Сървърът върна невалиден JSON от /api/data.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Невалиден формат на базата данни от /api/data.');
  }

  const formatted = `${JSON.stringify(parsed, null, 2)}\n`;
  return {
    jsonText: formatted,
    data: parsed as Record<string, unknown>,
  };
}

export function validateBackupJsonFile(rawText: string): BackupValidationResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Избраният файл е празен. Моля, избери валиден .json бекъп файл.',
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: 'Файлът не съдържа валиден JSON (синтактична грешка).',
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      error: 'Невалидна структура: бекъп файлът трябва да съдържа JSON обект.',
    };
  }

  const rawRecord = parsed as Record<string, unknown>;
  const isWrappedExport =
    'data' in rawRecord &&
    rawRecord.data !== null &&
    typeof rawRecord.data === 'object' &&
    !Array.isArray(rawRecord.data);

  const inspectTarget = isWrappedExport
    ? (rawRecord.data as Record<string, unknown>)
    : rawRecord;
  const KNOWN_BACKUP_KEYS = [
    'profile',
    'themeAccent',
    'logs',
    'goals',
    'hevyWorkouts',
    'dailyLogs',
    'habitItems',
    'dailyStepsGoal',
    'supplementCycles',
    'customExerciseMappings',
    'userSettings',
    'dailyMuscleGainGrams',
    'muscleAllocations',
    'entries',
  ];
  const hasKnownKey = KNOWN_BACKUP_KEYS.some((key) => key in inspectTarget);
  if (!hasKnownKey) {
    return {
      ok: false,
      error:
        'Файлът е валиден JSON, но не съдържа разпознаваема структура на резервно копие.',
    };
  }

  const parsedDiary = parseDiaryPayload(trimmed);
  if (!parsedDiary.ok) {
    return {
      ok: false,
      error: parsedDiary.error,
    };
  }

  // If it's a wrapped { version, data } export or legacy MuscleTrackerDB_v2, write normalized DiaryState.
  // If it's a direct database.json backup, preserve all top-level object keys cleanly after validation.
  const payloadToPersist: Record<string, unknown> =
    isWrappedExport || Array.isArray(rawRecord.entries)
      ? (cleanData(parsedDiary.state) as unknown as Record<string, unknown>)
      : (cleanData({
          ...parsedDiary.state,
          ...rawRecord,
        }) as unknown as Record<string, unknown>);

  const daysCount = Object.keys(parsedDiary.state.logs).length;
  const workoutsCount = parsedDiary.state.hevyWorkouts?.length ?? 0;
  const checkinsCount = parsedDiary.state.dailyLogs?.length ?? 0;
  const goalsCount = parsedDiary.state.goals.filter((g) => g.enabled).length;

  return {
    ok: true,
    payload: payloadToPersist,
    summary: {
      daysCount,
      workoutsCount,
      checkinsCount,
      goalsCount,
    },
  };
}

export async function restoreDatabaseBackupJson(
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl('/api/data', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Грешка при запис в /api/data (${response.status})`);
  }
}
