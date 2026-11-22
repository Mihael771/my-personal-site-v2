import type {
  CoachSubPriority,
  HevySet,
  HevyWorkout,
  TrainingGoalPhase,
  UserSettings,
  WorkoutEnvironment,
} from '../types/fitness';
import { calculateEpley1RM } from './hevyProgress';

export const DEFAULT_TRAINING_GOAL: TrainingGoalPhase = 'hypertrophy';

export interface TrainingGoalMeta {
  id: TrainingGoalPhase;
  label: string;
  shortLabel: string;
  emoji: string;
  buttonLabel: string;
  calorieTargetText: string;
  proteinThresholdGPerKg: number;
  summaryText: string;
}

export const TRAINING_GOAL_OPTIONS: TrainingGoalMeta[] = [
  {
    id: 'hypertrophy',
    label: 'Хипертрофия (Качване)',
    shortLabel: 'Хипертрофия',
    emoji: '💪',
    buttonLabel: '💪 Хипертрофия (Качване)',
    calorieTargetText: '+100 до +300 kcal/ден',
    proteinThresholdGPerKg: 1.6,
    summaryText: 'Лек излишък (+100..+300 kcal), протеин ≥ 1.6 g/kg, активни Rep PR / прогресия',
  },
  {
    id: 'maintenance',
    label: 'Поддържане / Рекомпозиция',
    shortLabel: 'Поддържане',
    emoji: '⚖️',
    buttonLabel: '⚖️ Поддържане / Рекомпозиция',
    calorieTargetText: 'Баланс (±0.25 kg/седм.)',
    proteinThresholdGPerKg: 1.8,
    summaryText: 'Тегло в ±0.25 kg/седм., протеин ≥ 1.8 g/kg, фокус върху относителна сила (1RM/BW)',
  },
  {
    id: 'fat_loss',
    label: 'Сваляне на мазнини',
    shortLabel: 'Сваляне',
    emoji: '🔥',
    buttonLabel: '🔥 Сваляне на мазнини',
    calorieTargetText: 'Дефицит (-0.3% до -0.8%/седм.)',
    proteinThresholdGPerKg: 1.8,
    summaryText: 'Запазване на силата в дефицит, протеин ≥ 1.8 g/kg, защита при спад > 5%',
  },
];

export const TRAINING_GOAL_META_MAP: Record<TrainingGoalPhase, TrainingGoalMeta> = {
  hypertrophy: TRAINING_GOAL_OPTIONS[0],
  maintenance: TRAINING_GOAL_OPTIONS[1],
  fat_loss: TRAINING_GOAL_OPTIONS[2],
};

export interface WorkoutEnvironmentMeta {
  id: WorkoutEnvironment;
  label: string;
  shortLabel: string;
  emoji: string;
  badgeLabel: string;
  progressionStyle: string;
}

export const WORKOUT_ENVIRONMENT_OPTIONS: WorkoutEnvironmentMeta[] = [
  {
    id: 'gym',
    label: 'Зала',
    shortLabel: 'Зала',
    emoji: '🏋️',
    badgeLabel: '🏋️ Зала',
    progressionStyle: 'Микро-натоварване (+1.25 / +2.5 kg) и смяна на машини/свободни тежести',
  },
  {
    id: 'street',
    label: 'Лостове (Street Workout)',
    shortLabel: 'Лостове',
    emoji: '🤸',
    badgeLabel: '🤸 Лостове',
    progressionStyle: 'Повторения, комбиниран товар (тегло + раница/колан) и калистеник прогресии',
  },
  {
    id: 'home',
    label: 'Вкъщи',
    shortLabel: 'Вкъщи',
    emoji: '🏠',
    badgeLabel: '🏠 Вкъщи',
    progressionStyle: '+1–2 повторения, бавно темпо (3 сек. спускане), по-кратка почивка или по-труден вариант',
  },
];

export const WORKOUT_ENVIRONMENT_META_MAP: Record<
  WorkoutEnvironment,
  WorkoutEnvironmentMeta
> = {
  gym: WORKOUT_ENVIRONMENT_OPTIONS[0],
  street: WORKOUT_ENVIRONMENT_OPTIONS[1],
  home: WORKOUT_ENVIRONMENT_OPTIONS[2],
};

export function sanitizeTrainingGoal(raw: unknown): TrainingGoalPhase | undefined {
  if (raw === 'hypertrophy' || raw === 'maintenance' || raw === 'fat_loss') {
    return raw;
  }
  return undefined;
}

export interface CoachSubPriorityMeta {
  id: CoachSubPriority;
  emoji: string;
  label: string;
  shortLabel: string;
  description: string;
}

export const COACH_SUB_PRIORITY_OPTIONS: CoachSubPriorityMeta[] = [
  {
    id: 'boxing_explosiveness',
    emoji: '🥊',
    label: 'Бокс и експлозивност',
    shortLabel: 'Бокс',
    description: 'Пази раменната свежест, експлозивността и енергията за спаринг/чувал.',
  },
  {
    id: 'calisthenics_relative',
    emoji: '🤸',
    label: 'Сила на лостове (Относителна сила)',
    shortLabel: 'Лостове',
    description: 'Фокус върху набирания, кофички, силови и съотношението сила/тегло.',
  },
  {
    id: 'max_strength_1rm',
    emoji: '⚡',
    label: 'Максимална сила (1RM)',
    shortLabel: 'Макс. сила',
    description: 'Приоритет на базовите движения с 3–6 повторения и прогресия в 1RM.',
  },
  {
    id: 'recovery_joints',
    emoji: '🛡️',
    label: 'Възстановяване и стави',
    shortLabel: 'Стави',
    description: 'Контролиран RPE, мобилност и баланс бутащи/дърпащи за здрави стави.',
  },
];

const VALID_SUB_PRIORITIES = new Set<CoachSubPriority>([
  'boxing_explosiveness',
  'calisthenics_relative',
  'max_strength_1rm',
  'recovery_joints',
]);

export function sanitizeSubPriorities(
  raw: unknown,
): CoachSubPriority[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const deduped: CoachSubPriority[] = [];
  for (const item of raw) {
    if (
      typeof item === 'string' &&
      VALID_SUB_PRIORITIES.has(item as CoachSubPriority) &&
      !deduped.includes(item as CoachSubPriority)
    ) {
      deduped.push(item as CoachSubPriority);
    }
  }
  return deduped.length > 0 ? deduped : undefined;
}

export function sanitizeTargetWeight(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string'
        ? Number(raw.trim().replace(',', '.'))
        : Number.NaN;
  if (!Number.isFinite(num) || num < 30 || num > 250) return undefined;
  return Math.round(num * 10) / 10;
}

export function sanitizeUserSettings(raw: unknown): UserSettings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const obj = raw as {
    goal?: unknown;
    intervalsApiKey?: unknown;
    targetWeight?: unknown;
    subPriorities?: unknown;
  };
  const goal = sanitizeTrainingGoal(obj.goal);
  const intervalsApiKey =
    typeof obj.intervalsApiKey === 'string' && obj.intervalsApiKey.trim()
      ? obj.intervalsApiKey.trim().slice(0, 200)
      : undefined;
  const targetWeight = sanitizeTargetWeight(obj.targetWeight);
  const subPriorities = sanitizeSubPriorities(obj.subPriorities);
  if (
    !goal &&
    !intervalsApiKey &&
    targetWeight === undefined &&
    subPriorities === undefined
  ) {
    return undefined;
  }
  return {
    goal: goal ?? DEFAULT_TRAINING_GOAL,
    ...(intervalsApiKey ? { intervalsApiKey } : {}),
    ...(targetWeight !== undefined ? { targetWeight } : {}),
    ...(subPriorities !== undefined ? { subPriorities } : {}),
  };
}

export function sanitizeWorkoutEnvironment(
  raw: unknown,
): WorkoutEnvironment | undefined {
  if (raw === 'gym' || raw === 'street' || raw === 'home') {
    return raw;
  }
  return undefined;
}

export function getNextWorkoutEnvironment(
  current: WorkoutEnvironment,
): WorkoutEnvironment {
  if (current === 'gym') return 'street';
  if (current === 'street') return 'home';
  return 'gym';
}

// ============================================================================
// 3. Автоматично разпознаване на средата (Зала vs. Лостове vs. Вкъщи)
// ============================================================================

const GYM_TITLE_KEYWORDS = [
  'gym',
  'зала',
  'фитнес',
  'fitness',
  'iron',
];

const STREET_TITLE_KEYWORDS = [
  'лост',
  'лостове',
  'street',
  'calisthenics',
  'калистеник',
  'успоредка',
  'парк',
  'outdoor',
];

const HOME_TITLE_KEYWORDS = [
  'вкъщи',
  'у дома',
  'домашн',
  'home',
];

const GYM_EQUIPMENT_KEYWORDS = [
  'bench',
  'cable',
  'machine',
  'leg press',
  'lat pulldown',
  'barbell',
  'dumbbell',
  'smith',
  'hack squat',
  'pec deck',
  'ez bar',
  't-bar',
  'seated row',
  'leg extension',
  'leg curl',
  'chest press',
  'shoulder press (machine)',
  'щанга',
  'дъмбел',
  'скрипец',
  'машина',
  'лег преса',
  'лежанка',
];

const STREET_EXERCISE_KEYWORDS = [
  'muscle up',
  'muscle-up',
  'muscleup',
  'pull up',
  'pull-up',
  'pullup',
  'chin up',
  'chin-up',
  'chinup',
  'dip',
  'dips',
  'hanging leg raise',
  'hanging knee raise',
  'toes to bar',
  'l-sit',
  'front lever',
  'back lever',
  'skin the cat',
  'australian pull',
  'inverted row',
  'набира',
  'кофичк',
  'силово възлизане',
  'успоредка',
];

const HOME_EXERCISE_KEYWORDS = [
  'push up',
  'push-up',
  'pushup',
  'лицеви',
  'лицева опора',
  'pike',
  'plank',
  'планк',
  'bodyweight',
  'burpee',
  'mountain climber',
  'crunch',
  'sit up',
  'dead bug',
  'glute bridge',
  'jumping jack',
  'коремни преси',
  'крънч',
];

function containsAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((kw) => haystack.includes(kw));
}

/**
 * Classifies any workout into 'gym' | 'street' | 'home'.
 * Manual `workout.environment` override always takes priority.
 */
export function classifyWorkoutEnvironment(
  workout: Pick<HevyWorkout, 'title' | 'description' | 'exercises' | 'environment'>,
): WorkoutEnvironment {
  if (
    workout.environment === 'gym' ||
    workout.environment === 'street' ||
    workout.environment === 'home'
  ) {
    return workout.environment;
  }

  const headerText = `${workout.title ?? ''} ${workout.description ?? ''}`
    .trim()
    .toLowerCase();

  // Explicit environment cue in workout title/description takes priority
  if (containsAny(headerText, HOME_TITLE_KEYWORDS)) return 'home';
  if (containsAny(headerText, STREET_TITLE_KEYWORDS)) return 'street';
  if (containsAny(headerText, GYM_TITLE_KEYWORDS)) return 'gym';

  const exerciseTitles = (workout.exercises ?? []).map((e) =>
    e.title.trim().toLowerCase(),
  );
  const allText = `${headerText} ${exerciseTitles.join(' ')}`;

  let gymHits = 0;
  let streetHits = 0;
  let homeHits = 0;

  for (const exTitle of exerciseTitles) {
    const isGymEx = containsAny(exTitle, GYM_EQUIPMENT_KEYWORDS);
    const isStreetEx = containsAny(exTitle, STREET_EXERCISE_KEYWORDS);
    const isHomeEx = containsAny(exTitle, HOME_EXERCISE_KEYWORDS);

    if (isGymEx) {
      gymHits += 2;
    }
    if (isStreetEx && !isGymEx) {
      streetHits += 2;
    }
    if (isHomeEx && !isGymEx) {
      homeHits += 2;
    }
  }

  // Fallback header equipment keywords (e.g. title "Bench & Cable" with no exercises yet)
  if (gymHits === 0 && containsAny(allText, GYM_EQUIPMENT_KEYWORDS)) {
    gymHits += 2;
  }
  if (streetHits === 0 && containsAny(allText, STREET_EXERCISE_KEYWORDS)) {
    streetHits += 1;
  }
  if (homeHits === 0 && containsAny(allText, HOME_EXERCISE_KEYWORDS)) {
    homeHits += 1;
  }

  // If any gym machines/barbells/cables are present, classify as gym
  if (gymHits > 0) {
    return 'gym';
  }
  if (streetHits > 0 && streetHits >= homeHits) {
    return 'street';
  }
  if (homeHits > 0) {
    return 'home';
  }

  // Check if all sets have 0/undefined weight -> bodyweight fallback
  const hasAnyAddedWeight = (workout.exercises ?? []).some((ex) =>
    ex.sets.some((s) => (s.weightKg ?? 0) > 0),
  );
  if (!hasAnyAddedWeight && exerciseTitles.length > 0) {
    return 'home';
  }

  return 'gym';
}

// ============================================================================
// 1. Детектор за „Скрит прогрес“ (Rep PRs по тежест и Volume PRs)
// ============================================================================

export interface RepPrWeightRow {
  weightKg: number; // 0 represents Bodyweight (Собствено тегло)
  weightLabel: string;
  maxReps: number;
  achievedDate: string;
  workoutId: string;
  workoutTitle: string;
  environment: WorkoutEnvironment;
  estimated1RM: number;
}

export interface SessionRepPrHit {
  weightKg: number;
  weightLabel: string;
  prevReps: number;
  newReps: number;
}

export interface SessionHiddenProgressPoint {
  workoutId: string;
  workoutTitle: string;
  date: string;
  timestamp: number;
  environment: WorkoutEnvironment;
  maxWeightKg: number;
  bestE1RM: number;
  sessionVolumeKg: number;
  totalReps: number;
  effectiveBodyweightLoadKg: number;
  isRepPR: boolean;
  isVolumePR: boolean;
  is1RMPR: boolean;
  repPrHits: SessionRepPrHit[];
  volumePrPrev: number | null;
  volumePrNew: number;
  volumeUnit: 'kg' | 'повт.';
}

export interface ExerciseVolumePrSummary {
  bestVolumeKg: number;
  bestTotalReps: number;
  bestEffectiveBodyweightLoadKg: number;
  displayValueText: string;
  achievedDate: string | null;
  workoutId: string | null;
  workoutTitle: string | null;
  environment: WorkoutEnvironment | null;
}

export interface ExerciseHiddenProgressReport {
  exerciseTitle: string;
  isBodyweightOnly: boolean;
  environmentsPresent: WorkoutEnvironment[];
  sessions: SessionHiddenProgressPoint[];
  sessionByWorkoutId: Record<string, SessionHiddenProgressPoint>;
  repPrRows: RepPrWeightRow[];
  volumePr: ExerciseVolumePrSummary;
  totalRepPrSessions: number;
  totalVolumePrSessions: number;
}

export interface RecentHiddenPrEvent {
  exerciseTitle: string;
  workoutId: string;
  workoutTitle: string;
  date: string;
  environment: WorkoutEnvironment;
  isRepPR: boolean;
  isVolumePR: boolean;
  summaryText: string;
}

export interface ExercisePlateauEvaluation {
  exerciseTitle: string;
  environment: WorkoutEnvironment;
  hasEnoughSessions: boolean;
  isTruePlateau: boolean;
  hasHiddenProgressInLast3: boolean;
  hiddenProgressEvidence: string | null;
  lastThreeDates: string[];
  lastThreeE1RMs: number[];
  strengthDropPct: number | null;
  latestWorkingWeightKg: number;
  latestBestReps: number;
  evidence: string;
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundHalfKg(val: number): number {
  if (!Number.isFinite(val) || val <= 0) return 0;
  return Math.round(val * 2) / 2;
}

function formatWeightBucketLabel(weightKg: number): string {
  if (weightKg <= 0) return '0 kg (Собствено тегло)';
  return `${Number.isInteger(weightKg) ? weightKg : weightKg.toFixed(1)} kg`;
}

function parseWorkoutTs(w: Pick<HevyWorkout, 'startTime' | 'date'>): number {
  if (w.startTime) {
    const dt = new Date(w.startTime);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
  if (w.date) {
    const dt = new Date(`${w.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
  return 0;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function isBodyweightLiftTitle(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes('pull up') ||
    t.includes('pull-up') ||
    t.includes('pullup') ||
    t.includes('chin up') ||
    t.includes('chin-up') ||
    t.includes('chinup') ||
    t.includes('dip') ||
    t.includes('push up') ||
    t.includes('push-up') ||
    t.includes('pushup') ||
    t.includes('muscle up') ||
    t.includes('muscle-up') ||
    t.includes('inverted row') ||
    t.includes('набира') ||
    t.includes('кофичк') ||
    t.includes('лицеви') ||
    t.includes('силово възлизане')
  );
}

/**
 * Computes Rep PRs per exact weight (including 0 kg / Bodyweight) and Session Volume PRs
 * for a specific exercise, keeping records scoped per training environment.
 */
export function analyzeExerciseHiddenProgress(params: {
  workouts: HevyWorkout[];
  exerciseTitle: string;
  bodyWeightKg?: number | null;
  environmentFilter?: WorkoutEnvironment | 'all';
}): ExerciseHiddenProgressReport {
  const {
    workouts,
    exerciseTitle,
    bodyWeightKg = null,
    environmentFilter = 'all',
  } = params;
  const targetKey = exerciseTitle.trim().toLowerCase();

  const rawMatched: Array<{
    workout: HevyWorkout;
    sets: HevySet[];
    timestamp: number;
    environment: WorkoutEnvironment;
  }> = [];

  const envSet = new Set<WorkoutEnvironment>();
  let hasAnyWeight = false;

  for (const w of workouts) {
    const matching = w.exercises.filter(
      (ex) => ex.title.trim().toLowerCase() === targetKey,
    );
    if (matching.length === 0) continue;
    const combinedSets = matching.flatMap((ex) => ex.sets);
    if (combinedSets.length === 0) continue;

    const env = classifyWorkoutEnvironment(w);
    envSet.add(env);

    if (combinedSets.some((s) => (s.weightKg ?? 0) > 0)) {
      hasAnyWeight = true;
    }

    if (environmentFilter !== 'all' && env !== environmentFilter) {
      continue;
    }

    rawMatched.push({
      workout: w,
      sets: combinedSets,
      timestamp: parseWorkoutTs(w),
      environment: env,
    });
  }

  rawMatched.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.workout.date.localeCompare(b.workout.date);
  });

  const isBodyweightOnly = !hasAnyWeight;
  const bw =
    typeof bodyWeightKg === 'number' && Number.isFinite(bodyWeightKg) && bodyWeightKg > 0
      ? bodyWeightKg
      : 0;
  const treatAsBwLift = isBodyweightOnly || isBodyweightLiftTitle(exerciseTitle);

  // Per-environment running records so gym / street / home are never conflated
  const runningBestRepsByEnvAndWeight = new Map<string, number>();
  const runningBestVolumeByEnv = new Map<WorkoutEnvironment, number>();
  const runningBest1RMByEnv = new Map<WorkoutEnvironment, number>();
  const seenSessionsByEnv = new Map<WorkoutEnvironment, number>();

  // Global (filtered) all-time Rep PR table by weight
  const repPrMap = new Map<number, RepPrWeightRow>();

  let bestVolMetric = -1;
  let volumePr: ExerciseVolumePrSummary = {
    bestVolumeKg: 0,
    bestTotalReps: 0,
    bestEffectiveBodyweightLoadKg: 0,
    displayValueText: '—',
    achievedDate: null,
    workoutId: null,
    workoutTitle: null,
    environment: null,
  };

  const sessions: SessionHiddenProgressPoint[] = [];
  const sessionByWorkoutId: Record<string, SessionHiddenProgressPoint> = {};

  for (const item of rawMatched) {
    const working = getWorkingSets(item.sets);
    const env = item.environment;
    const priorEnvSessions = seenSessionsByEnv.get(env) ?? 0;

    let maxWeightKg = 0;
    let bestE1RM = 0;
    let sessionVolumeKg = 0;
    let totalReps = 0;
    let effectiveBodyweightLoadKg = 0;

    // Track highest reps achieved per weight bucket in this session
    const sessionMaxRepsByWeight = new Map<number, number>();

    for (const s of working) {
      const wRaw = s.weightKg ?? 0;
      const wBucket = roundHalfKg(wRaw);
      const reps = Math.max(0, Math.round(s.reps ?? 0));
      if (wBucket > maxWeightKg) maxWeightKg = wBucket;
      if (reps <= 0) continue;

      totalReps += reps;
      if (wRaw > 0) {
        sessionVolumeKg += wRaw * reps;
      }
      if (treatAsBwLift && bw > 0) {
        effectiveBodyweightLoadKg += (bw + Math.max(0, wRaw)) * reps;
      } else if (wRaw > 0) {
        effectiveBodyweightLoadKg += wRaw * reps;
      }

      const prevInSession = sessionMaxRepsByWeight.get(wBucket) ?? 0;
      if (reps > prevInSession) {
        sessionMaxRepsByWeight.set(wBucket, reps);
      }

      const loadFor1RM =
        wRaw > 0
          ? treatAsBwLift && bw > 0
            ? bw + wRaw
            : wRaw
          : treatAsBwLift && bw > 0
            ? bw
            : 0;

      if (loadFor1RM > 0) {
        const e1rm = calculateEpley1RM(loadFor1RM, reps);
        if (e1rm > bestE1RM) bestE1RM = e1rm;
      }
    }

    sessionVolumeKg = roundOne(sessionVolumeKg);
    effectiveBodyweightLoadKg = roundOne(effectiveBodyweightLoadKg);
    bestE1RM = roundOne(bestE1RM);

    // Evaluate Rep PRs per exact weight bucket within the same environment
    const repPrHits: SessionRepPrHit[] = [];
    for (const [wBucket, reps] of sessionMaxRepsByWeight.entries()) {
      const envWeightKey = `${env}::${wBucket}`;
      const prevBest = runningBestRepsByEnvAndWeight.get(envWeightKey);
      if (prevBest !== undefined && reps > prevBest) {
        repPrHits.push({
          weightKg: wBucket,
          weightLabel: formatWeightBucketLabel(wBucket),
          prevReps: prevBest,
          newReps: reps,
        });
      }
      if (prevBest === undefined || reps > prevBest) {
        runningBestRepsByEnvAndWeight.set(envWeightKey, reps);
      }

      // Update global table row (across current filter)
      const existingRow = repPrMap.get(wBucket);
      const rowLoad =
        wBucket > 0
          ? treatAsBwLift && bw > 0
            ? bw + wBucket
            : wBucket
          : treatAsBwLift && bw > 0
            ? bw
            : 0;
      const rowE1rm = rowLoad > 0 ? calculateEpley1RM(rowLoad, reps) : 0;

      if (!existingRow || reps > existingRow.maxReps) {
        repPrMap.set(wBucket, {
          weightKg: wBucket,
          weightLabel: formatWeightBucketLabel(wBucket),
          maxReps: reps,
          achievedDate: item.workout.date,
          workoutId: item.workout.id,
          workoutTitle: item.workout.title,
          environment: env,
          estimated1RM: rowE1rm,
        });
      }
    }

    // Evaluate Session Volume PR within the same environment
    const volumeMetric =
      sessionVolumeKg > 0
        ? sessionVolumeKg
        : effectiveBodyweightLoadKg > 0
          ? effectiveBodyweightLoadKg
          : totalReps;
    const volumeUnit: 'kg' | 'повт.' =
      sessionVolumeKg > 0 || effectiveBodyweightLoadKg > 0 ? 'kg' : 'повт.';

    const prevBestVol = runningBestVolumeByEnv.get(env);
    const isVolumePR =
      priorEnvSessions > 0 &&
      prevBestVol !== undefined &&
      volumeMetric > prevBestVol &&
      volumeMetric > 0;

    if (prevBestVol === undefined || volumeMetric > prevBestVol) {
      runningBestVolumeByEnv.set(env, volumeMetric);
    }

    // Update overall Volume PR summary
    if (volumeMetric > bestVolMetric && volumeMetric > 0) {
      bestVolMetric = volumeMetric;
      const displayValueText =
        sessionVolumeKg > 0
          ? `${Math.round(sessionVolumeKg).toLocaleString('bg-BG')} kg`
          : effectiveBodyweightLoadKg > 0
            ? `${totalReps} повт. (${Math.round(effectiveBodyweightLoadKg).toLocaleString('bg-BG')} kg с тегло)`
            : `${totalReps} повт.`;
      volumePr = {
        bestVolumeKg: sessionVolumeKg,
        bestTotalReps: totalReps,
        bestEffectiveBodyweightLoadKg: effectiveBodyweightLoadKg,
        displayValueText,
        achievedDate: item.workout.date,
        workoutId: item.workout.id,
        workoutTitle: item.workout.title,
        environment: env,
      };
    }

    // Evaluate 1RM PR within the same environment
    const prevBest1RM = runningBest1RMByEnv.get(env);
    const is1RMPR =
      priorEnvSessions > 0 &&
      prevBest1RM !== undefined &&
      bestE1RM > prevBest1RM &&
      bestE1RM > 0;

    if (prevBest1RM === undefined || bestE1RM > prevBest1RM) {
      runningBest1RMByEnv.set(env, bestE1RM);
    }

    seenSessionsByEnv.set(env, priorEnvSessions + 1);

    const point: SessionHiddenProgressPoint = {
      workoutId: item.workout.id,
      workoutTitle: item.workout.title,
      date: item.workout.date,
      timestamp: item.timestamp,
      environment: env,
      maxWeightKg,
      bestE1RM,
      sessionVolumeKg,
      totalReps,
      effectiveBodyweightLoadKg,
      isRepPR: repPrHits.length > 0,
      isVolumePR,
      is1RMPR,
      repPrHits,
      volumePrPrev: isVolumePR && prevBestVol !== undefined ? roundOne(prevBestVol) : null,
      volumePrNew: roundOne(volumeMetric),
      volumeUnit,
    };

    sessions.push(point);
    sessionByWorkoutId[item.workout.id] = point;
  }

  const repPrRows = Array.from(repPrMap.values()).sort(
    (a, b) => a.weightKg - b.weightKg,
  );

  return {
    exerciseTitle,
    isBodyweightOnly,
    environmentsPresent: Array.from(envSet),
    sessions,
    sessionByWorkoutId,
    repPrRows,
    volumePr,
    totalRepPrSessions: sessions.filter((s) => s.isRepPR).length,
    totalVolumePrSessions: sessions.filter((s) => s.isVolumePR).length,
  };
}

/**
 * Evaluates whether an exercise is truly plateaued in a given environment.
 * Eliminates false plateaus: requires NO 1RM PR, NO Rep PR, AND NO Volume PR
 * across the last 3 sessions in the same environment.
 */
export function evaluateExercisePlateauInEnvironment(params: {
  workouts: HevyWorkout[];
  exerciseTitle: string;
  environment: WorkoutEnvironment;
  bodyWeightKg?: number | null;
}): ExercisePlateauEvaluation {
  const { workouts, exerciseTitle, environment, bodyWeightKg = null } = params;
  const report = analyzeExerciseHiddenProgress({
    workouts,
    exerciseTitle,
    bodyWeightKg,
    environmentFilter: environment,
  });

  const envSessions = report.sessions;
  if (envSessions.length < 3) {
    return {
      exerciseTitle,
      environment,
      hasEnoughSessions: false,
      isTruePlateau: false,
      hasHiddenProgressInLast3: false,
      hiddenProgressEvidence: null,
      lastThreeDates: envSessions.map((s) => s.date),
      lastThreeE1RMs: envSessions.map((s) => s.bestE1RM),
      strengthDropPct: null,
      latestWorkingWeightKg:
        envSessions.length > 0 ? envSessions[envSessions.length - 1].maxWeightKg : 0,
      latestBestReps:
        envSessions.length > 0 ? envSessions[envSessions.length - 1].totalReps : 0,
      evidence: '',
    };
  }

  const s1 = envSessions[envSessions.length - 3];
  const s2 = envSessions[envSessions.length - 2];
  const s3 = envSessions[envSessions.length - 1];

  const hiddenParts: string[] = [];
  for (const s of [s2, s3]) {
    if (s.isRepPR && s.repPrHits.length > 0) {
      const hit = s.repPrHits[0];
      hiddenParts.push(
        `🏅 Rep PR (${hit.weightLabel}: ${hit.prevReps} → ${hit.newReps} повт.)`,
      );
    }
    if (s.isVolumePR) {
      hiddenParts.push(
        `📈 Volume PR (${s.volumePrNew} ${s.volumeUnit})`,
      );
    }
  }

  const hasHiddenProgressInLast3 = hiddenParts.length > 0;
  const has1RMProgress =
    (s1.bestE1RM > 0 && (s2.bestE1RM > s1.bestE1RM || s3.bestE1RM > s2.bestE1RM)) ||
    s2.is1RMPR ||
    s3.is1RMPR;

  const hasMeasurable1RM = s1.bestE1RM > 0 && s2.bestE1RM > 0 && s3.bestE1RM > 0;
  const hasMeasurableReps = s1.totalReps > 0 && s2.totalReps > 0 && s3.totalReps > 0;

  let isTruePlateau = false;
  if (!hasHiddenProgressInLast3 && !has1RMProgress) {
    if (hasMeasurable1RM) {
      isTruePlateau = s2.bestE1RM <= s1.bestE1RM && s3.bestE1RM <= s2.bestE1RM;
    } else if (hasMeasurableReps) {
      isTruePlateau = s2.totalReps <= s1.totalReps && s3.totalReps <= s2.totalReps;
    }
  }

  const strengthDropPct =
    s1.bestE1RM > 0 && s3.bestE1RM > 0
      ? roundOne(((s3.bestE1RM - s1.bestE1RM) / s1.bestE1RM) * 100)
      : null;

  const envBadge = WORKOUT_ENVIRONMENT_META_MAP[environment].badgeLabel;
  const evidence = hasMeasurable1RM
    ? `${envBadge} · 1RM в 3 поредни сесии: ${s1.bestE1RM} kg (${s1.date}) → ${s2.bestE1RM} kg (${s2.date}) → ${s3.bestE1RM} kg (${s3.date})`
    : `${envBadge} · Общо повторения (3 сесии): ${s1.totalReps} → ${s2.totalReps} → ${s3.totalReps}`;

  return {
    exerciseTitle,
    environment,
    hasEnoughSessions: true,
    isTruePlateau,
    hasHiddenProgressInLast3,
    hiddenProgressEvidence: hiddenParts.length > 0 ? hiddenParts.join(' · ') : null,
    lastThreeDates: [s1.date, s2.date, s3.date],
    lastThreeE1RMs: [s1.bestE1RM, s2.bestE1RM, s3.bestE1RM],
    strengthDropPct,
    latestWorkingWeightKg: s3.maxWeightKg,
    latestBestReps: s3.totalReps,
    evidence,
  };
}

/**
 * Scans all exercises across workouts and returns a fast lookup map of
 * workoutId::exerciseTitleLower -> SessionHiddenProgressPoint (for badges on workout cards)
 * plus a chronological newest-first list of recent Rep PR / Volume PR hits.
 */
export function buildAllWorkoutsHiddenPrIndex(
  workouts: HevyWorkout[],
  bodyWeightKg?: number | null,
): {
  byWorkoutAndExercise: Map<string, SessionHiddenProgressPoint>;
  recentEvents: RecentHiddenPrEvent[];
} {
  const uniqueTitles = new Map<string, string>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (key && !uniqueTitles.has(key)) {
        uniqueTitles.set(key, ex.title.trim());
      }
    }
  }

  const byWorkoutAndExercise = new Map<string, SessionHiddenProgressPoint>();
  const recentEvents: RecentHiddenPrEvent[] = [];

  for (const [key, title] of uniqueTitles.entries()) {
    const report = analyzeExerciseHiddenProgress({
      workouts,
      exerciseTitle: title,
      bodyWeightKg,
      environmentFilter: 'all',
    });

    for (const session of report.sessions) {
      byWorkoutAndExercise.set(`${session.workoutId}::${key}`, session);
      if (session.isRepPR || session.isVolumePR) {
        const parts: string[] = [];
        if (session.isRepPR && session.repPrHits.length > 0) {
          const h = session.repPrHits[0];
          parts.push(`🏅 Rep PR (${h.weightLabel}: ${h.prevReps} → ${h.newReps} повт.)`);
        }
        if (session.isVolumePR) {
          parts.push(`📈 Volume PR (${session.volumePrNew} ${session.volumeUnit})`);
        }
        recentEvents.push({
          exerciseTitle: title,
          workoutId: session.workoutId,
          workoutTitle: session.workoutTitle,
          date: session.date,
          environment: session.environment,
          isRepPR: session.isRepPR,
          isVolumePR: session.isVolumePR,
          summaryText: parts.join(' + '),
        });
      }
    }
  }

  recentEvents.sort((a, b) => b.date.localeCompare(a.date));

  return { byWorkoutAndExercise, recentEvents };
}

/**
 * Generates concrete, environment-appropriate progression advice so the coach
 * never recommends "+2.5 kg" for home bodyweight workouts.
 */
export function getEnvironmentProgressionAdvice(params: {
  exerciseTitle: string;
  environment: WorkoutEnvironment;
  currentWeightKg: number;
  minReps?: number;
}): {
  title: string;
  message: string;
} {
  const { exerciseTitle, environment, currentWeightKg } = params;
  const lower = exerciseTitle.toLowerCase();

  if (environment === 'home') {
    let harderVariant = 'по-труден вариант (напр. едностранно изпълнение или пауза в долна точка)';
    if (lower.includes('push up') || lower.includes('push-up') || lower.includes('лицеви')) {
      harderVariant = 'диамантени лицеви опори, лицеви с вдигнати крака или Пайк лицеви опори';
    } else if (lower.includes('squat') || lower.includes('клек')) {
      harderVariant = 'български клек на един крак или пистолет клек с контрол';
    } else if (lower.includes('plank') || lower.includes('планк')) {
      harderVariant = 'планк с изнесени напред ръце или Hollow Body Hold';
    } else if (lower.includes('dip') || lower.includes('кофичк')) {
      harderVariant = 'кофички с бавно спускане (3 сек.) и пауза долу';
    }

    return {
      title: `🏠 Вкъщи · ${exerciseTitle}: прогресия без нови тежести`,
      message: `За домашната тренировка на „${exerciseTitle}“ увеличи стимула чрез +1–2 повторения на серия, бавно темпо (3 сек. спускане), по-кратка почивка (45–60 сек.) или премини към по-труден вариант: ${harderVariant}.`,
    };
  }

  if (environment === 'street') {
    let calisthenicsStep =
      'набирания с пауза горе (2 сек.), L-sit набирания, кофички с дълбок обхват или добавяне на раница/колан (+2.5–5 kg)';
    if (lower.includes('pull') || lower.includes('chin') || lower.includes('набира')) {
      calisthenicsStep =
        'набирания с 2-секундна пауза горе, L-sit набирания, по-широк хват или раница/колан (+2.5–5 kg)';
    } else if (lower.includes('dip') || lower.includes('кофичк')) {
      calisthenicsStep =
        'кофички с дълбок обхват и 1-секундна пауза долу, бавно спускане или колан с тежест (+2.5–5 kg)';
    } else if (lower.includes('muscle') || lower.includes('силово')) {
      calisthenicsStep = 'експлозивни високи набирания до гърди и чисти преходи с минимален кипинг';
    }

    return {
      title: `🤸 Лостове · ${exerciseTitle}: калистеник прогресия`,
      message: `На лостовете при „${exerciseTitle}“${
        currentWeightKg > 0 ? ` (текуща добавена тежест: +${currentWeightKg} kg)` : ''
      } прогресирай чрез +1–2 чисти повторения или усложни техниката: ${calisthenicsStep}.`,
    };
  }

  // Gym: standard micro-loading
  const step = currentWeightKg > 0 && currentWeightKg <= 20 ? 1.25 : 2.5;
  const nextWeight = roundOne(currentWeightKg + step);
  return {
    title: `🏋️ Зала · ${exerciseTitle}: време е за +${step} kg (${nextWeight} kg)`,
    message: `В последните 2 тренировки в зала всички работни серии на „${exerciseTitle}“ са с ≥ 8 повторения и RPE ≤ 8.5. Увеличи тежестта с +${step} kg до ${nextWeight} kg следващия път.`,
  };
}
