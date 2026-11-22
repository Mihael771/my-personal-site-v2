import type { HevyWorkout } from '../types/fitness';
import {
  mergeHevyWorkoutsWithoutDuplicates,
  parseHevyCsv,
} from '../utils/hevyParser';

export interface HevyDownloadsCheckResponse {
  found: boolean;
  filename?: string;
  filenames?: string[];
  content?: string;
}

export interface HevyAutoSyncResult {
  synced: boolean;
  filename?: string;
  filenames?: string[];
  addedCount: number;
  skippedCount: number;
  totalParsed: number;
}

export function isValidHevyDownloadFilename(filename: string): boolean {
  if (!filename || typeof filename !== 'string') return false;
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }
  const lower = filename.trim().toLowerCase();
  return lower.startsWith('workouts') && lower.endsWith('.csv');
}

export async function checkHevyDownloads(
  fetchImpl: typeof fetch = fetch,
): Promise<HevyDownloadsCheckResponse> {
  try {
    const res = await fetchImpl('/api/hevy-downloads-check', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return { found: false, filenames: [] };
    const data = (await res.json()) as Partial<HevyDownloadsCheckResponse>;
    if (
      data &&
      data.found === true &&
      typeof data.filename === 'string' &&
      typeof data.content === 'string' &&
      isValidHevyDownloadFilename(data.filename)
    ) {
      const validFilenames = Array.isArray(data.filenames)
        ? data.filenames.filter(
            (f): f is string =>
              typeof f === 'string' && isValidHevyDownloadFilename(f),
          )
        : [data.filename];
      return {
        found: true,
        filename: data.filename,
        filenames: validFilenames.length > 0 ? validFilenames : [data.filename],
        content: data.content,
      };
    }
    return { found: false, filenames: [] };
  } catch {
    return { found: false, filenames: [] };
  }
}

export async function cleanupHevyDownloads(
  filenames: string | string[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const list = (Array.isArray(filenames) ? filenames : [filenames]).filter(
    isValidHevyDownloadFilename,
  );
  if (list.length === 0) return false;
  try {
    const res = await fetchImpl('/api/hevy-downloads-cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename: list[0],
        filenames: list,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function processHevyAutoSync(params: {
  existingWorkouts: HevyWorkout[];
  onSaveWorkouts: (nextWorkouts: HevyWorkout[]) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<HevyAutoSyncResult> {
  const { existingWorkouts, onSaveWorkouts, fetchImpl = fetch } = params;

  const check = await checkHevyDownloads(fetchImpl);
  if (!check.found || !check.filename || !check.content) {
    return {
      synced: false,
      addedCount: 0,
      skippedCount: 0,
      totalParsed: 0,
    };
  }

  const allFiles =
    check.filenames && check.filenames.length > 0
      ? check.filenames
      : [check.filename];

  const parsedResult = parseHevyCsv(check.content);
  if (!parsedResult.ok || parsedResult.workouts.length === 0) {
    // Non-Hevy or empty workouts*.csv — do not remove unparsed/incomplete file
    return {
      synced: false,
      filename: check.filename,
      filenames: allFiles,
      addedCount: 0,
      skippedCount: 0,
      totalParsed: 0,
    };
  }

  const { mergedWorkouts, addedWorkouts, skippedDuplicatesCount } =
    mergeHevyWorkoutsWithoutDuplicates(existingWorkouts, parsedResult.workouts);
  const addedCount = addedWorkouts.length;

  if (addedCount > 0) {
    await onSaveWorkouts(mergedWorkouts);
  }

  // Move all processed workouts*.csv files to Recycle Bin AFTER saving succeeds
  await cleanupHevyDownloads(allFiles, fetchImpl);

  return {
    synced: true,
    filename: check.filename,
    filenames: allFiles,
    addedCount,
    skippedCount: skippedDuplicatesCount,
    totalParsed: parsedResult.workouts.length,
  };
}
