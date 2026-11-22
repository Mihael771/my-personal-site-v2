export interface FreeExerciseDbItem {
  id: string;
  name: string;
  level: string;
  equipment: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string;
  instructions: string[];
  images: string[];
}

export type ExerciseLibraryMuscleFilter =
  | 'all'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'legs'
  | 'core';

export type ExerciseLibraryEquipmentFilter =
  | 'all'
  | 'bodyweight'
  | 'dumbbell'
  | 'barbell'
  | 'machine';

export const FREE_EXERCISE_DB_JSON_URL =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
export const FREE_EXERCISE_DB_IMAGE_BASE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export const EXERCISE_DB_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const EXERCISE_DB_TIMEOUT_MS = 8000;

const EXERCISE_DB_STORAGE_KEY = 'fizioprogres_free_exercise_db_v1';

interface ExerciseDbCachePayload {
  fetchedAt: number;
  exercises: FreeExerciseDbItem[];
}

let memoryCatalog: FreeExerciseDbItem[] | null = null;
let memoryFetchedAt = 0;
let inflightPromise: Promise<{
  exercises: FreeExerciseDbItem[];
  fromCache: boolean;
  offline: boolean;
}> | null = null;

export const LIBRARY_MUSCLE_OPTIONS: Array<{
  id: ExerciseLibraryMuscleFilter;
  label: string;
}> = [
  { id: 'all', label: 'Всички мускули' },
  { id: 'chest', label: 'Гърди' },
  { id: 'back', label: 'Гръб' },
  { id: 'shoulders', label: 'Рамене' },
  { id: 'arms', label: 'Ръце' },
  { id: 'legs', label: 'Крака и седалище' },
  { id: 'core', label: 'Корем' },
];

export const LIBRARY_EQUIPMENT_OPTIONS: Array<{
  id: ExerciseLibraryEquipmentFilter;
  label: string;
}> = [
  { id: 'all', label: 'Всичко оборудване' },
  { id: 'bodyweight', label: 'Собствено тегло / Лостове' },
  { id: 'dumbbell', label: 'Дъмбели' },
  { id: 'barbell', label: 'Щанга' },
  { id: 'machine', label: 'Машини' },
];

const LEVEL_BG_MAP: Record<string, string> = {
  beginner: 'Начинаещ',
  intermediate: 'Средно ниво',
  expert: 'Напреднал',
};

const EQUIPMENT_BG_MAP: Record<string, string> = {
  'body only': 'Собствено тегло / Лостове',
  dumbbell: 'Дъмбели',
  barbell: 'Щанга',
  cable: 'Скрипец / Кабел',
  machine: 'Машина',
  kettlebells: 'Пудовка',
  bands: 'Ластици',
  'e-z curl bar': 'EZ лост',
  'medicine ball': 'Медицинска топка',
  'exercise ball': 'Фитбол',
  'foam roll': 'Фоумролер',
  other: 'Друго',
  none: 'Собствено тегло',
};

const MUSCLE_BG_MAP: Record<string, string> = {
  chest: 'Гърди',
  lats: 'Широк гръбен (Lats)',
  'middle back': 'Среден гръб',
  'lower back': 'Кръст',
  traps: 'Трапец',
  shoulders: 'Рамене',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearms: 'Предмишници',
  quadriceps: 'Квадрицепс',
  hamstrings: 'Задно бедро',
  glutes: 'Седалище',
  calves: 'Прасци',
  abdominals: 'Корем',
  adductors: 'Адуктори',
  abductors: 'Абдуктори',
  neck: 'Врат',
};

const BG_TO_EN_SYNONYMS: Array<[string, string]> = [
  ['лежанка', 'barbell bench press'],
  ['полулег с дъмбели', 'incline dumbbell press'],
  ['полулег', 'incline bench press'],
  ['набирания', 'pullups'],
  ['набиране', 'pullups'],
  ['кофички', 'dips'],
  ['лицеви опори', 'pushups'],
  ['лицеви', 'pushups'],
  ['клек', 'barbell squat'],
  ['български клек', 'single leg squat'],
  ['мъртва тяга', 'barbell deadlift'],
  ['румънска тяга', 'romanian deadlift'],
  ['раменна преса', 'shoulder press'],
  ['странично разтваряне', 'side lateral raise'],
  ['гребане с щанга', 'bent over barbell row'],
  ['гребане с дъмбел', 'one arm dumbbell row'],
  ['гребане', 'seated cable rows'],
  ['бицепсово сгъване', 'barbell curl'],
  ['бицепс', 'dumbbell bicep curl'],
  ['трицепс', 'triceps pushdown'],
  ['планк', 'plank'],
  ['коремни преси', 'crunches'],
  ['напади', 'dumbbell lunges'],
  ['прасец', 'standing calf raises'],
  ['прасци', 'standing calf raises'],
  ['силово възлизане', 'muscle up'],
  ['скрипец', 'wide grip lat pulldown'],
];

export function translateExerciseLevelBg(level: string): string {
  const key = (level || '').trim().toLowerCase();
  return LEVEL_BG_MAP[key] ?? (level || 'Неуточнено');
}

export function translateExerciseEquipmentBg(equipment: string): string {
  const key = (equipment || '').trim().toLowerCase();
  return EQUIPMENT_BG_MAP[key] ?? (equipment || 'Собствено тегло');
}

export function translateExerciseMuscleBg(muscle: string): string {
  const key = (muscle || '').trim().toLowerCase();
  return MUSCLE_BG_MAP[key] ?? muscle;
}

export function buildFreeExerciseImageUrl(imagePath: string): string {
  const clean = imagePath.replace(/^\/+/, '');
  return `${FREE_EXERCISE_DB_IMAGE_BASE}${clean}`;
}

export function getExerciseEnvironmentBadge(item: Pick<FreeExerciseDbItem, 'equipment' | 'name'>): string {
  const eq = (item.equipment || '').toLowerCase();
  const n = (item.name || '').toLowerCase();
  if (
    n.includes('pullup') ||
    n.includes('pull-up') ||
    n.includes('pull up') ||
    n.includes('chin-up') ||
    n.includes('chin up') ||
    n.includes('dip') ||
    n.includes('muscle up') ||
    n.includes('hanging')
  ) {
    return '🤸 Лостове';
  }
  if (!eq || eq === 'body only' || eq === 'none' || eq === 'bands' || eq === 'exercise ball') {
    return '🏠 Вкъщи / 🤸 Лостове';
  }
  return '🏋️ Зала';
}

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Quota exceeded or private mode — keep in-memory cache silently
  }
}

export function normalizeRawFreeExerciseList(raw: unknown): FreeExerciseDbItem[] {
  if (!Array.isArray(raw)) return [];
  const result: FreeExerciseDbItem[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const id =
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim()
        : name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const toStringArray = (val: unknown): string[] =>
      Array.isArray(val)
        ? val.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : [];

    result.push({
      id,
      name,
      level: typeof obj.level === 'string' ? obj.level : 'intermediate',
      equipment:
        typeof obj.equipment === 'string' && obj.equipment.trim()
          ? obj.equipment.trim()
          : 'body only',
      primaryMuscles: toStringArray(obj.primaryMuscles),
      secondaryMuscles: toStringArray(obj.secondaryMuscles),
      category: typeof obj.category === 'string' ? obj.category : 'strength',
      instructions: toStringArray(obj.instructions),
      images: toStringArray(obj.images),
    });
  }

  return result;
}

export function readCachedFreeExerciseDb(
  nowMs: number = Date.now(),
): FreeExerciseDbItem[] | null {
  if (
    memoryCatalog &&
    memoryCatalog.length > 0 &&
    nowMs - memoryFetchedAt >= 0 &&
    nowMs - memoryFetchedAt <= EXERCISE_DB_CACHE_TTL_MS
  ) {
    return memoryCatalog;
  }

  const raw = safeStorageGet(EXERCISE_DB_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ExerciseDbCachePayload>;
    if (
      !parsed ||
      typeof parsed.fetchedAt !== 'number' ||
      !Array.isArray(parsed.exercises) ||
      parsed.exercises.length === 0
    ) {
      return null;
    }
    const ageMs = nowMs - parsed.fetchedAt;
    if (ageMs < 0 || ageMs > EXERCISE_DB_CACHE_TTL_MS) {
      return null;
    }
    memoryCatalog = parsed.exercises;
    memoryFetchedAt = parsed.fetchedAt;
    return parsed.exercises;
  } catch {
    return null;
  }
}

export function writeCachedFreeExerciseDb(
  exercises: FreeExerciseDbItem[],
  nowMs: number = Date.now(),
): void {
  memoryCatalog = exercises;
  memoryFetchedAt = nowMs;
  const payload: ExerciseDbCachePayload = {
    fetchedAt: nowMs,
    exercises,
  };
  safeStorageSet(EXERCISE_DB_STORAGE_KEY, JSON.stringify(payload));
}

export function clearFreeExerciseDbMemoryCacheForTests(): void {
  memoryCatalog = null;
  memoryFetchedAt = 0;
  inflightPromise = null;
}

export async function loadFreeExerciseDb(options?: {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<{
  exercises: FreeExerciseDbItem[];
  fromCache: boolean;
  offline: boolean;
}> {
  const nowMs = options?.nowMs ?? Date.now();
  const fetchImpl = options?.fetchImpl ?? fetch;

  if (!options?.forceRefresh) {
    const cached = readCachedFreeExerciseDb(nowMs);
    if (cached) {
      return { exercises: cached, fromCache: true, offline: false };
    }
  }

  // Deduplicate concurrent browser fetches when using default fetch
  if (!options?.fetchImpl && !options?.forceRefresh && inflightPromise) {
    return inflightPromise;
  }

  const runFetch = async (): Promise<{
    exercises: FreeExerciseDbItem[];
    fromCache: boolean;
    offline: boolean;
  }> => {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), EXERCISE_DB_TIMEOUT_MS);
    try {
      const response = await fetchImpl(FREE_EXERCISE_DB_JSON_URL, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rawJson = await response.json();
      const normalized = normalizeRawFreeExerciseList(rawJson);
      if (normalized.length === 0) {
        return { exercises: [], fromCache: false, offline: true };
      }
      writeCachedFreeExerciseDb(normalized, nowMs);
      return { exercises: normalized, fromCache: false, offline: false };
    } catch {
      return { exercises: [], fromCache: false, offline: true };
    } finally {
      clearTimeout(timerId);
      inflightPromise = null;
    }
  };

  if (!options?.fetchImpl && !options?.forceRefresh) {
    inflightPromise = runFetch();
    return inflightPromise;
  }

  return runFetch();
}

// ============================================================================
// Fuzzy Matching (Hevy / BG exercise names -> Free Exercise DB)
// ============================================================================

const STOP_WORDS = new Set([
  'the',
  'with',
  'on',
  'to',
  'of',
  'and',
  'in',
  'a',
  'an',
  'for',
  'exercise',
  'на',
  'с',
  'за',
  'в',
  'от',
]);

function normalizeTextForMatch(raw: string): string {
  let text = raw.trim().toLowerCase();

  // Translate common Bulgarian exercise names to English equivalents
  for (const [bg, en] of BG_TO_EN_SYNONYMS) {
    if (text.includes(bg)) {
      text = `${text} ${en}`;
    }
  }

  // Normalize common Hevy hyphen/plural variants
  text = text
    .replace(/pull[\s-]?ups?/g, 'pullup pullups')
    .replace(/chin[\s-]?ups?/g, 'chinup chinups')
    .replace(/push[\s-]?ups?/g, 'pushup pushups')
    .replace(/sit[\s-]?ups?/g, 'situp situps')
    .replace(/rdl\b/g, 'romanian deadlift')
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/\boh\b|\bohp\b/g, 'overhead press')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function tokenize(normalized: string): string[] {
  return Array.from(
    new Set(
      normalized
        .split(' ')
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOP_WORDS.has(w)),
    ),
  );
}

function stemToken(token: string): string {
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

export function findBestExerciseMatches(
  query: string,
  catalog: FreeExerciseDbItem[],
  limit: number = 4,
): FreeExerciseDbItem[] {
  if (!query.trim() || catalog.length === 0) return [];

  const rawLower = query.trim().toLowerCase();
  // Strip Hevy trailing parentheses e.g. "Bench Press (Barbell)" -> base "bench press", hint "barbell"
  const parenMatch = rawLower.match(/\(([^)]+)\)/);
  const parenHint = parenMatch ? parenMatch[1].trim() : '';
  const strippedLower = rawLower.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  const normQuery = normalizeTextForMatch(query);
  const queryTokens = tokenize(normQuery);
  const queryStems = queryTokens.map(stemToken);

  const scored: Array<{ item: FreeExerciseDbItem; score: number }> = [];

  for (const item of catalog) {
    const itemLower = item.name.toLowerCase();
    const normItem = normalizeTextForMatch(`${item.name} ${item.equipment}`);
    const itemTokens = tokenize(normItem);
    const itemStems = new Set(itemTokens.map(stemToken));

    let score = 0;

    // Exact name match
    if (itemLower === rawLower || itemLower === strippedLower) {
      score += 120;
    } else if (
      strippedLower.length >= 4 &&
      (itemLower.includes(strippedLower) || strippedLower.includes(itemLower))
    ) {
      score += 45;
    }

    // Token overlap
    let matchedStems = 0;
    for (const qStem of queryStems) {
      if (itemStems.has(qStem)) {
        matchedStems += 1;
        score += 18;
      } else if (
        qStem.length >= 4 &&
        Array.from(itemStems).some(
          (is) => is.startsWith(qStem) || qStem.startsWith(is),
        )
      ) {
        matchedStems += 0.6;
        score += 10;
      }
    }

    if (queryStems.length > 0 && matchedStems > 0) {
      // Precision bonus: favor concise matches over long unrelated names
      const precision = matchedStems / Math.max(1, itemStems.size);
      const recall = matchedStems / queryStems.length;
      score += recall * 30 + precision * 15;
    }

    // Equipment match bonus from Hevy parenthetical hint e.g. "(Barbell)", "(Dumbbell)", "(Cable)"
    if (parenHint) {
      const eqLower = (item.equipment || '').toLowerCase();
      if (
        (parenHint.includes('barbell') && eqLower === 'barbell') ||
        (parenHint.includes('dumbbell') && eqLower === 'dumbbell') ||
        (parenHint.includes('cable') && eqLower === 'cable') ||
        (parenHint.includes('machine') && eqLower === 'machine') ||
        (parenHint.includes('bodyweight') && eqLower === 'body only')
      ) {
        score += 22;
      }
    }

    // Prefer items with photos when scores are close
    if (score > 0 && item.images.length > 0) {
      score += 2;
    }

    if (score >= 22) {
      scored.push({ item, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.item);
}

export function findBestExerciseMatch(
  query: string,
  catalog: FreeExerciseDbItem[],
): FreeExerciseDbItem | null {
  const matches = findBestExerciseMatches(query, catalog, 1);
  return matches.length > 0 ? matches[0] : null;
}

// ============================================================================
// Library Filtering (Muscle Group + Equipment + Search)
// ============================================================================

function matchesMuscleFilter(
  item: FreeExerciseDbItem,
  filter: ExerciseLibraryMuscleFilter,
): boolean {
  if (filter === 'all') return true;
  const allMuscles = [...item.primaryMuscles, ...item.secondaryMuscles].map((m) =>
    m.toLowerCase(),
  );
  const primary = item.primaryMuscles.map((m) => m.toLowerCase());
  const pool = primary.length > 0 ? primary : allMuscles;

  switch (filter) {
    case 'chest':
      return pool.includes('chest');
    case 'back':
      return (
        pool.includes('lats') ||
        pool.includes('middle back') ||
        pool.includes('lower back') ||
        pool.includes('traps')
      );
    case 'shoulders':
      return pool.includes('shoulders');
    case 'arms':
      return (
        pool.includes('biceps') ||
        pool.includes('triceps') ||
        pool.includes('forearms')
      );
    case 'legs':
      return (
        pool.includes('quadriceps') ||
        pool.includes('hamstrings') ||
        pool.includes('glutes') ||
        pool.includes('calves') ||
        pool.includes('adductors') ||
        pool.includes('abductors')
      );
    case 'core':
      return pool.includes('abdominals');
  }
}

function matchesEquipmentFilter(
  item: FreeExerciseDbItem,
  filter: ExerciseLibraryEquipmentFilter,
): boolean {
  if (filter === 'all') return true;
  const eq = (item.equipment || '').toLowerCase();
  switch (filter) {
    case 'bodyweight':
      return eq === 'body only' || eq === 'none' || eq === 'bands' || eq === '';
    case 'dumbbell':
      return eq === 'dumbbell' || eq === 'kettlebells';
    case 'barbell':
      return eq === 'barbell' || eq === 'e-z curl bar';
    case 'machine':
      return eq === 'machine' || eq === 'cable';
  }
}

export function filterExerciseCatalog(params: {
  catalog: FreeExerciseDbItem[];
  searchQuery?: string;
  muscleFilter?: ExerciseLibraryMuscleFilter;
  equipmentFilter?: ExerciseLibraryEquipmentFilter;
}): FreeExerciseDbItem[] {
  const {
    catalog,
    searchQuery = '',
    muscleFilter = 'all',
    equipmentFilter = 'all',
  } = params;

  const trimmed = searchQuery.trim().toLowerCase();
  const translatedSearch = trimmed ? normalizeTextForMatch(trimmed) : '';

  return catalog.filter((item) => {
    if (!matchesMuscleFilter(item, muscleFilter)) return false;
    if (!matchesEquipmentFilter(item, equipmentFilter)) return false;
    if (!trimmed) return true;

    const haystack = [
      item.name.toLowerCase(),
      item.equipment.toLowerCase(),
      translateExerciseEquipmentBg(item.equipment).toLowerCase(),
      ...item.primaryMuscles.map((m) => m.toLowerCase()),
      ...item.primaryMuscles.map((m) => translateExerciseMuscleBg(m).toLowerCase()),
      ...item.secondaryMuscles.map((m) => translateExerciseMuscleBg(m).toLowerCase()),
    ].join(' ');

    if (haystack.includes(trimmed)) return true;

    // Also match via BG->EN synonym tokens
    if (translatedSearch) {
      const tokens = tokenize(translatedSearch);
      if (tokens.length > 0 && tokens.every((t) => haystack.includes(stemToken(t)))) {
        return true;
      }
    }

    return false;
  });
}
