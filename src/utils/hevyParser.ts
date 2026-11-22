import type { HevyExercise, HevySet, HevyWorkout } from '../types/fitness';
import { sanitizeWorkoutEnvironment } from './hiddenProgressAndEnvironment';

const MONTH_MAP: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

function roundVolume(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseOptionalNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.trim().replace(',', '.');
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
}

function parseOptionalNonNegNumber(raw: string | undefined): number | undefined {
  const num = parseOptionalNumber(raw);
  if (num === undefined || num < 0) return undefined;
  return roundVolume(num);
}

/**
 * Parse RFC-4180 CSV text supporting quoted fields with commas, newlines,
 * escaped quotes (""), UTF-8 BOM, and fallback semicolon delimiter.
 */
export function parseCsvRows(rawText: string): string[][] {
  const text = rawText.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  // Determine delimiter from the first non-empty header line outside quotes
  let firstLine = '';
  let inQuotesHeader = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotesHeader = !inQuotesHeader;
    } else if ((ch === '\n' || ch === '\r') && !inQuotesHeader) {
      break;
    }
    firstLine += ch;
  }

  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semiCount = (firstLine.match(/;/g) ?? []).length;
  const delimiter = semiCount > commaCount ? ';' : ',';

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(currentField);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += ch;
  }

  currentRow.push(currentField);
  if (currentRow.some((cell) => cell.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Normalize Hevy start_time strings (e.g., "17 Nov 2026, 18:10",
 * "2026-11-17 18:10:00", "Nov 17, 2026, 6:10 PM", "17.11.2026 18:10")
 * into YYYY-MM-DD for consistent sorting and grouping.
 */
export function parseHevyDateKey(rawStartTime: string): string {
  const s = rawStartTime.trim();
  if (!s) return '';

  // ISO prefix YYYY-MM-DD
  const isoMatch = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD Mon YYYY (standard Hevy format: "17 Nov 2026, 18:10" or "2 Nov 2026, 09:05")
  const dmyTextMatch = s.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (dmyTextMatch) {
    const month = MONTH_MAP[dmyTextMatch[2].toLowerCase()];
    if (month) {
      return `${dmyTextMatch[3]}-${month}-${dmyTextMatch[1].padStart(2, '0')}`;
    }
  }

  // Mon DD, YYYY ("Nov 17, 2026, 6:10 PM")
  const mdyTextMatch = s.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdyTextMatch) {
    const month = MONTH_MAP[mdyTextMatch[1].toLowerCase()];
    if (month) {
      return `${mdyTextMatch[3]}-${month}-${mdyTextMatch[2].padStart(2, '0')}`;
    }
  }

  // DD.MM.YYYY
  const bgDotMatch = s.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/);
  if (bgDotMatch) {
    return `${bgDotMatch[3]}-${bgDotMatch[2].padStart(2, '0')}-${bgDotMatch[1].padStart(2, '0')}`;
  }

  // Fallback JS Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

function parseHevySortTimestamp(startTime: string, dateKey: string): number {
  if (startTime) {
    const dt = new Date(startTime);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getTime();
    }
  }
  if (dateKey) {
    const dt = new Date(`${dateKey}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) {
      return dt.getTime();
    }
  }
  return 0;
}

export function getHevyWorkoutDedupeKey(workout: {
  startTime: string;
  title: string;
}): string {
  const normStart = workout.startTime.trim().replace(/\s+/g, ' ').toLowerCase();
  const normTitle = workout.title.trim().replace(/\s+/g, ' ').toLowerCase();
  return `${normStart}::${normTitle}`;
}

function buildWorkoutId(startTime: string, title: string): string {
  const base = `${startTime}_${title}`
    .trim()
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return base ? `hevy-${base}` : `hevy-${Date.now()}`;
}

export function sortHevyWorkoutsNewestFirst(workouts: HevyWorkout[]): HevyWorkout[] {
  return [...workouts].sort((a, b) => {
    const tsDiff =
      parseHevySortTimestamp(b.startTime, b.date) -
      parseHevySortTimestamp(a.startTime, a.date);
    if (tsDiff !== 0) return tsDiff;
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return a.title.localeCompare(b.title);
  });
}

export interface HevyCsvParseResult {
  ok: true;
  workouts: HevyWorkout[];
  rowCount: number;
}

export interface HevyCsvParseError {
  ok: false;
  error: string;
}

export function parseHevyCsv(
  rawText: string,
  importedAt: string = new Date().toISOString(),
): HevyCsvParseResult | HevyCsvParseError {
  const rows = parseCsvRows(rawText);
  if (rows.length < 2) {
    return {
      ok: false,
      error: 'CSV файлът е празен или не съдържа редове със серии.',
    };
  }

  const headerCells = rows[0].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, '_'),
  );
  const colIndex = new Map<string, number>();
  headerCells.forEach((col, idx) => {
    if (col && !colIndex.has(col)) {
      colIndex.set(col, idx);
    }
  });

  const hasTitle = colIndex.has('title');
  const hasStartTime = colIndex.has('start_time');
  const hasExercise = colIndex.has('exercise_title');

  if (!hasExercise || (!hasTitle && !hasStartTime)) {
    return {
      ok: false,
      error:
        'Файлът не съдържа очакваните колони от Hevy (title, start_time, exercise_title, weight_kg, reps).',
    };
  }

  const getCell = (row: string[], name: string): string => {
    const idx = colIndex.get(name);
    if (idx === undefined || idx >= row.length) return '';
    return row[idx]?.trim() ?? '';
  };

  interface ExerciseAccumulator {
    title: string;
    notes?: string;
    sets: HevySet[];
  }

  interface WorkoutAccumulator {
    dedupeKey: string;
    title: string;
    startTime: string;
    endTime?: string;
    date: string;
    description?: string;
    exerciseOrder: string[];
    exercisesByTitle: Map<string, ExerciseAccumulator>;
  }

  const workoutOrder: string[] = [];
  const workoutsByKey = new Map<string, WorkoutAccumulator>();
  let processedRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const exerciseTitle = getCell(row, 'exercise_title');
    if (!exerciseTitle) continue;

    const rawTitle = getCell(row, 'title') || 'Тренировка без име';
    const rawStartTime = getCell(row, 'start_time');
    const rawEndTime = getCell(row, 'end_time');
    const rawDescription = getCell(row, 'description');
    const rawNotes = getCell(row, 'exercise_notes');
    const dateKey = parseHevyDateKey(rawStartTime);

    const effectiveStart = rawStartTime || dateKey || `row-${r}`;
    const dedupeKey = getHevyWorkoutDedupeKey({
      startTime: effectiveStart,
      title: rawTitle,
    });

    let workoutAcc = workoutsByKey.get(dedupeKey);
    if (!workoutAcc) {
      workoutAcc = {
        dedupeKey,
        title: rawTitle,
        startTime: effectiveStart,
        ...(rawEndTime ? { endTime: rawEndTime } : {}),
        date: dateKey,
        ...(rawDescription ? { description: rawDescription } : {}),
        exerciseOrder: [],
        exercisesByTitle: new Map(),
      };
      workoutsByKey.set(dedupeKey, workoutAcc);
      workoutOrder.push(dedupeKey);
    }

    const exerciseKey = exerciseTitle.toLowerCase();
    let exAcc = workoutAcc.exercisesByTitle.get(exerciseKey);
    if (!exAcc) {
      exAcc = {
        title: exerciseTitle,
        ...(rawNotes ? { notes: rawNotes } : {}),
        sets: [],
      };
      workoutAcc.exercisesByTitle.set(exerciseKey, exAcc);
      workoutAcc.exerciseOrder.push(exerciseKey);
    } else if (!exAcc.notes && rawNotes) {
      exAcc.notes = rawNotes;
    }

    const parsedSetIndex = parseOptionalNumber(getCell(row, 'set_index'));
    const setType = getCell(row, 'set_type') || undefined;
    const weightKg = parseOptionalNonNegNumber(getCell(row, 'weight_kg'));
    const repsRaw = parseOptionalNonNegNumber(getCell(row, 'reps'));
    const reps = repsRaw !== undefined ? Math.round(repsRaw) : undefined;
    const distanceKm = parseOptionalNonNegNumber(getCell(row, 'distance_km'));
    const durationSecondsRaw = parseOptionalNonNegNumber(
      getCell(row, 'duration_seconds'),
    );
    const durationSeconds =
      durationSecondsRaw !== undefined ? Math.round(durationSecondsRaw) : undefined;
    const rpe = parseOptionalNonNegNumber(getCell(row, 'rpe'));

    exAcc.sets.push({
      setIndex:
        parsedSetIndex !== undefined
          ? Math.max(0, Math.round(parsedSetIndex))
          : exAcc.sets.length,
      ...(setType ? { setType } : {}),
      ...(weightKg !== undefined ? { weightKg } : {}),
      ...(reps !== undefined ? { reps } : {}),
      ...(distanceKm !== undefined ? { distanceKm } : {}),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      ...(rpe !== undefined ? { rpe } : {}),
    });

    processedRows += 1;
  }

  if (workoutOrder.length === 0) {
    return {
      ok: false,
      error: 'Не бяха открити валидни тренировки и упражнения в CSV файла.',
    };
  }

  const workouts: HevyWorkout[] = workoutOrder.map((key) => {
    const acc = workoutsByKey.get(key)!;
    let totalVolumeKg = 0;
    let maxWeightKg = 0;
    let totalSets = 0;

    const exercises: HevyExercise[] = acc.exerciseOrder.map((exKey) => {
      const ex = acc.exercisesByTitle.get(exKey)!;
      const sortedSets = [...ex.sets].sort((a, b) => a.setIndex - b.setIndex);
      let exVolume = 0;
      let exMaxWeight = 0;

      for (const s of sortedSets) {
        const w = s.weightKg ?? 0;
        const reps = s.reps ?? 0;
        if (w > 0 && reps > 0) {
          exVolume += w * reps;
        }
        if (w > exMaxWeight) {
          exMaxWeight = w;
        }
      }

      exVolume = roundVolume(exVolume);
      exMaxWeight = roundVolume(exMaxWeight);
      totalVolumeKg += exVolume;
      if (exMaxWeight > maxWeightKg) {
        maxWeightKg = exMaxWeight;
      }
      totalSets += sortedSets.length;

      return {
        title: ex.title,
        ...(ex.notes ? { notes: ex.notes } : {}),
        sets: sortedSets,
        totalVolumeKg: exVolume,
        maxWeightKg: exMaxWeight,
      };
    });

    return {
      id: buildWorkoutId(acc.startTime, acc.title),
      title: acc.title,
      startTime: acc.startTime,
      ...(acc.endTime ? { endTime: acc.endTime } : {}),
      date: acc.date,
      ...(acc.description ? { description: acc.description } : {}),
      exercises,
      totalVolumeKg: roundVolume(totalVolumeKg),
      maxWeightKg: roundVolume(maxWeightKg),
      totalSets,
      importedAt,
    };
  });

  return {
    ok: true,
    workouts: sortHevyWorkoutsNewestFirst(workouts),
    rowCount: processedRows,
  };
}

export interface HevyMergeResult {
  mergedWorkouts: HevyWorkout[];
  addedWorkouts: HevyWorkout[];
  skippedDuplicatesCount: number;
}

export function mergeHevyWorkoutsWithoutDuplicates(
  existingWorkouts: HevyWorkout[],
  incomingWorkouts: HevyWorkout[],
): HevyMergeResult {
  const seenKeys = new Set<string>(
    existingWorkouts.map((w) => getHevyWorkoutDedupeKey(w)),
  );

  const addedWorkouts: HevyWorkout[] = [];
  let skippedDuplicatesCount = 0;

  for (const workout of incomingWorkouts) {
    const key = getHevyWorkoutDedupeKey(workout);
    if (seenKeys.has(key)) {
      skippedDuplicatesCount += 1;
      continue;
    }
    seenKeys.add(key);
    addedWorkouts.push(workout);
  }

  return {
    mergedWorkouts: sortHevyWorkoutsNewestFirst([
      ...existingWorkouts,
      ...addedWorkouts,
    ]),
    addedWorkouts,
    skippedDuplicatesCount,
  };
}

export interface HevyWorkoutsSummary {
  workoutCount: number;
  totalVolumeKg: number;
  maxWeightKg: number;
  maxWeightExercise: string | null;
  totalSets: number;
  uniqueExercisesCount: number;
}

export interface HevyExerciseOption {
  title: string;
  workoutCount: number;
  setCount: number;
}

export function extractUniqueHevyExercises(
  workouts: HevyWorkout[],
): HevyExerciseOption[] {
  const map = new Map<
    string,
    { title: string; workoutIds: Set<string>; setCount: number }
  >();

  for (const workout of workouts) {
    for (const ex of workout.exercises) {
      const key = ex.title.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.workoutIds.add(workout.id);
        existing.setCount += ex.sets.length;
      } else {
        map.set(key, {
          title: ex.title,
          workoutIds: new Set([workout.id]),
          setCount: ex.sets.length,
        });
      }
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      title: item.title,
      workoutCount: item.workoutIds.size,
      setCount: item.setCount,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function filterHevyWorkouts(
  workouts: HevyWorkout[],
  selectedExercise: string,
  searchQuery: string = '',
): HevyWorkout[] {
  const exFilter = selectedExercise.trim().toLowerCase();
  const query = searchQuery.trim().toLowerCase();

  return workouts
    .map((workout) => {
      const matchesWorkoutTitle =
        !query ||
        workout.title.toLowerCase().includes(query) ||
        workout.startTime.toLowerCase().includes(query) ||
        workout.date.includes(query);

      const matchingExercises = workout.exercises.filter((ex) => {
        const matchesExerciseSelect =
          !exFilter || ex.title.trim().toLowerCase() === exFilter;
        if (!matchesExerciseSelect) return false;
        if (!query) return true;
        return matchesWorkoutTitle || ex.title.toLowerCase().includes(query);
      });

      if (matchingExercises.length === 0) return null;

      // When filtered by a specific exercise, scope displayed exercises & metrics to that exercise
      const visibleExercises = exFilter ? matchingExercises : workout.exercises;
      let totalVolumeKg = 0;
      let maxWeightKg = 0;
      let totalSets = 0;

      for (const ex of visibleExercises) {
        totalVolumeKg += ex.totalVolumeKg;
        if (ex.maxWeightKg > maxWeightKg) {
          maxWeightKg = ex.maxWeightKg;
        }
        totalSets += ex.sets.length;
      }

      return {
        ...workout,
        exercises: visibleExercises,
        totalVolumeKg: roundVolume(totalVolumeKg),
        maxWeightKg: roundVolume(maxWeightKg),
        totalSets,
      };
    })
    .filter((w): w is HevyWorkout => w !== null);
}

export function computeHevyStats(workouts: HevyWorkout[]): HevyWorkoutsSummary {
  let totalVolumeKg = 0;
  let maxWeightKg = 0;
  let maxWeightExercise: string | null = null;
  let totalSets = 0;
  const uniqueExercises = new Set<string>();

  for (const workout of workouts) {
    totalVolumeKg += workout.totalVolumeKg;
    totalSets += workout.totalSets;
    for (const ex of workout.exercises) {
      uniqueExercises.add(ex.title.trim().toLowerCase());
      if (ex.maxWeightKg > maxWeightKg) {
        maxWeightKg = ex.maxWeightKg;
        maxWeightExercise = ex.title;
      }
    }
  }

  return {
    workoutCount: workouts.length,
    totalVolumeKg: roundVolume(totalVolumeKg),
    maxWeightKg: roundVolume(maxWeightKg),
    maxWeightExercise,
    totalSets,
    uniqueExercisesCount: uniqueExercises.size,
  };
}

export function sanitizeHevyWorkoutsArray(raw: unknown): HevyWorkout[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const result: HevyWorkout[] = [];
  const seenKeys = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Partial<HevyWorkout>;
    const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title.trim() : '';
    const startTime =
      typeof obj.startTime === 'string' && obj.startTime.trim() ? obj.startTime.trim() : '';
    if (!title || !startTime) continue;

    const dedupeKey = getHevyWorkoutDedupeKey({ startTime, title });
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);

    const rawExercises = Array.isArray(obj.exercises) ? obj.exercises : [];
    const exercises: HevyExercise[] = [];
    let workoutVolume = 0;
    let workoutMaxWeight = 0;
    let workoutSets = 0;

    for (const exItem of rawExercises) {
      if (!exItem || typeof exItem !== 'object') continue;
      const exObj = exItem as Partial<HevyExercise>;
      const exTitle =
        typeof exObj.title === 'string' && exObj.title.trim() ? exObj.title.trim() : '';
      if (!exTitle) continue;

      const rawSets = Array.isArray(exObj.sets) ? exObj.sets : [];
      const sets: HevySet[] = [];
      let exVolume = 0;
      let exMaxWeight = 0;

      for (const sItem of rawSets) {
        if (!sItem || typeof sItem !== 'object') continue;
        const sObj = sItem as Partial<HevySet>;
        const weightKg =
          typeof sObj.weightKg === 'number' && Number.isFinite(sObj.weightKg) && sObj.weightKg >= 0
            ? roundVolume(sObj.weightKg)
            : undefined;
        const reps =
          typeof sObj.reps === 'number' && Number.isFinite(sObj.reps) && sObj.reps >= 0
            ? Math.round(sObj.reps)
            : undefined;
        const distanceKm =
          typeof sObj.distanceKm === 'number' && Number.isFinite(sObj.distanceKm) && sObj.distanceKm >= 0
            ? roundVolume(sObj.distanceKm)
            : undefined;
        const durationSeconds =
          typeof sObj.durationSeconds === 'number' &&
          Number.isFinite(sObj.durationSeconds) &&
          sObj.durationSeconds >= 0
            ? Math.round(sObj.durationSeconds)
            : undefined;
        const rpe =
          typeof sObj.rpe === 'number' && Number.isFinite(sObj.rpe) && sObj.rpe >= 0
            ? roundVolume(sObj.rpe)
            : undefined;

        if (weightKg !== undefined && reps !== undefined && weightKg > 0 && reps > 0) {
          exVolume += weightKg * reps;
        }
        if (weightKg !== undefined && weightKg > exMaxWeight) {
          exMaxWeight = weightKg;
        }

        sets.push({
          setIndex:
            typeof sObj.setIndex === 'number' && Number.isFinite(sObj.setIndex)
              ? Math.max(0, Math.round(sObj.setIndex))
              : sets.length,
          ...(typeof sObj.setType === 'string' && sObj.setType.trim()
            ? { setType: sObj.setType.trim() }
            : {}),
          ...(weightKg !== undefined ? { weightKg } : {}),
          ...(reps !== undefined ? { reps } : {}),
          ...(distanceKm !== undefined ? { distanceKm } : {}),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(rpe !== undefined ? { rpe } : {}),
        });
      }

      exVolume = roundVolume(exVolume);
      exMaxWeight = roundVolume(exMaxWeight);
      workoutVolume += exVolume;
      if (exMaxWeight > workoutMaxWeight) workoutMaxWeight = exMaxWeight;
      workoutSets += sets.length;

      exercises.push({
        title: exTitle,
        ...(typeof exObj.notes === 'string' && exObj.notes.trim()
          ? { notes: exObj.notes.trim() }
          : {}),
        sets,
        totalVolumeKg: exVolume,
        maxWeightKg: exMaxWeight,
      });
    }

    const date =
      typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)
        ? obj.date
        : parseHevyDateKey(startTime);

    const environment = sanitizeWorkoutEnvironment(obj.environment);

    result.push({
      id:
        typeof obj.id === 'string' && obj.id.trim()
          ? obj.id.trim()
          : buildWorkoutId(startTime, title),
      title,
      startTime,
      ...(typeof obj.endTime === 'string' && obj.endTime.trim()
        ? { endTime: obj.endTime.trim() }
        : {}),
      date,
      ...(typeof obj.description === 'string' && obj.description.trim()
        ? { description: obj.description.trim() }
        : {}),
      ...(environment ? { environment } : {}),
      exercises,
      totalVolumeKg: roundVolume(workoutVolume),
      maxWeightKg: roundVolume(workoutMaxWeight),
      totalSets: workoutSets,
      importedAt:
        typeof obj.importedAt === 'string' && obj.importedAt.trim()
          ? obj.importedAt.trim()
          : new Date().toISOString(),
    });
  }

  return result.length > 0 ? sortHevyWorkoutsNewestFirst(result) : undefined;
}
