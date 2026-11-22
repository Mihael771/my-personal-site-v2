import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  DetailedMuscleId,
  HevySet,
  HevyWorkout,
  TrainingGoalPhase,
  WorkoutEnvironment,
} from '../types/fitness';
import { resolveExerciseMuscles } from './exerciseMuscleEngine';
import { shiftDateKey } from './fitnessMath';
import { calculateEpley1RM } from './hevyProgress';
import {
  DEFAULT_TRAINING_GOAL,
  WORKOUT_ENVIRONMENT_META_MAP,
  classifyWorkoutEnvironment,
  evaluateExercisePlateauInEnvironment,
} from './hiddenProgressAndEnvironment';

export type RecommenderSubgroupId =
  | 'upper_chest'
  | 'mid_lower_chest'
  | 'lats_vertical_pull'
  | 'mid_upper_back_horizontal_pull'
  | 'side_rear_delts'
  | 'quads'
  | 'hamstrings_glutes'
  | 'arms_core';

export type MovementPattern = 'push' | 'pull' | 'legs' | 'core';
export type EquipmentKind = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';

export interface CatalogExercise {
  id: string;
  hevyName: string;
  bgName: string;
  subgroup: RecommenderSubgroupId;
  pattern: MovementPattern;
  equipment: EquipmentKind;
  defaultSets: number;
  defaultReps: string;
  isUnilateralDumbbell?: boolean;
  /** Keywords to detect if user already performs this exact catalog movement */
  matchAliases: string[];
  /** Preferred biomechanical swap targets (catalog IDs) when plateaued */
  swapTargetIds: string[];
  /** Relative working-load ratio compared to a standard bilateral barbell anchor of its subgroup */
  relativeLoadFactor: number;
}

export interface SubgroupMeta {
  id: RecommenderSubgroupId;
  label: string;
  pattern: MovementPattern;
  targetMinSets7d: number;
  sessionHint: string;
}

export const RECOMMENDER_SUBGROUPS: SubgroupMeta[] = [
  {
    id: 'upper_chest',
    label: 'Горни гърди (бутане под наклон)',
    pattern: 'push',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за гърди / горна част',
  },
  {
    id: 'mid_lower_chest',
    label: 'Средни и долни гърди',
    pattern: 'push',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за гърди / бутащи',
  },
  {
    id: 'lats_vertical_pull',
    label: 'Широк гръбен мускул (вертикално дърпане)',
    pattern: 'pull',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за гръб / дърпащи',
  },
  {
    id: 'mid_upper_back_horizontal_pull',
    label: 'Среден и горен гръб (хоризонтално дърпане)',
    pattern: 'pull',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за горна част / гръб',
  },
  {
    id: 'side_rear_delts',
    label: 'Средно и задно рамо',
    pattern: 'pull',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за рамене / горна част',
  },
  {
    id: 'quads',
    label: 'Квадрицепс',
    pattern: 'legs',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за крака',
  },
  {
    id: 'hamstrings_glutes',
    label: 'Задно бедро и седалище',
    pattern: 'legs',
    targetMinSets7d: 6,
    sessionHint: 'тренировка за крака / задна верига',
  },
  {
    id: 'arms_core',
    label: 'Ръце и корем',
    pattern: 'core',
    targetMinSets7d: 6,
    sessionHint: 'края на тренировката за горна част',
  },
];

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // 1. Горни гърди / Бутане под наклон
  {
    id: 'incline_db_press',
    hevyName: 'Incline Dumbbell Press',
    bgName: 'Полулег с дъмбели',
    subgroup: 'upper_chest',
    pattern: 'push',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '8–10',
    isUnilateralDumbbell: true,
    matchAliases: ['incline dumbbell press', 'incline bench press (dumbbell)', 'incline db press'],
    swapTargetIds: ['incline_bb_press', 'weighted_dips'],
    relativeLoadFactor: 0.36,
  },
  {
    id: 'incline_bb_press',
    hevyName: 'Incline Bench Press (Barbell)',
    bgName: 'Полулег с щанга',
    subgroup: 'upper_chest',
    pattern: 'push',
    equipment: 'barbell',
    defaultSets: 3,
    defaultReps: '6–8',
    matchAliases: ['incline bench press (barbell)', 'incline barbell bench', 'incline bench press'],
    swapTargetIds: ['incline_db_press', 'low_to_high_cable_fly'],
    relativeLoadFactor: 0.82,
  },
  {
    id: 'low_to_high_cable_fly',
    hevyName: 'Low-to-High Cable Fly',
    bgName: 'Флайс на скрипец отдолу нагоре',
    subgroup: 'upper_chest',
    pattern: 'push',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['low-to-high cable fly', 'low to high cable', 'incline cable fly'],
    swapTargetIds: ['incline_db_press', 'incline_bb_press'],
    relativeLoadFactor: 0.22,
  },

  // 2. Средни / Долни гърди
  {
    id: 'bench_press_bb',
    hevyName: 'Bench Press (Barbell)',
    bgName: 'Хоризонтален лег с щанга',
    subgroup: 'mid_lower_chest',
    pattern: 'push',
    equipment: 'barbell',
    defaultSets: 4,
    defaultReps: '6–8',
    matchAliases: ['bench press (barbell)', 'barbell bench press', 'flat bench press'],
    swapTargetIds: ['incline_db_press', 'weighted_dips'],
    relativeLoadFactor: 1.0,
  },
  {
    id: 'weighted_dips',
    hevyName: 'Weighted Dips (Кофички с тежест)',
    bgName: 'Кофички с допълнителна тежест',
    subgroup: 'mid_lower_chest',
    pattern: 'push',
    equipment: 'bodyweight',
    defaultSets: 3,
    defaultReps: '6–10',
    matchAliases: ['weighted dip', 'chest dip', 'triceps dip', 'dips'],
    swapTargetIds: ['incline_db_press', 'flat_db_press'],
    relativeLoadFactor: 0.92,
  },
  {
    id: 'flat_db_press',
    hevyName: 'Flat Dumbbell Press',
    bgName: 'Хоризонтален лег с дъмбели',
    subgroup: 'mid_lower_chest',
    pattern: 'push',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '8–10',
    isUnilateralDumbbell: true,
    matchAliases: ['flat dumbbell press', 'bench press (dumbbell)', 'dumbbell bench press'],
    swapTargetIds: ['incline_db_press', 'weighted_dips'],
    relativeLoadFactor: 0.4,
  },

  // 3. Широк гръбен мускул (Вертикално дърпане)
  {
    id: 'pull_up',
    hevyName: 'Pull Up (Набирания)',
    bgName: 'Набирания на лост',
    subgroup: 'lats_vertical_pull',
    pattern: 'pull',
    equipment: 'bodyweight',
    defaultSets: 3,
    defaultReps: '6–10',
    matchAliases: ['pull up', 'pull-up', 'chin up', 'chin-up'],
    swapTargetIds: ['chest_supported_db_row', 'lat_pulldown_wide'],
    relativeLoadFactor: 1.0,
  },
  {
    id: 'weighted_pull_up',
    hevyName: 'Weighted Pull Up',
    bgName: 'Набирания с допълнителна тежест',
    subgroup: 'lats_vertical_pull',
    pattern: 'pull',
    equipment: 'bodyweight',
    defaultSets: 4,
    defaultReps: '5–8',
    matchAliases: ['weighted pull up', 'weighted pull-up', 'weighted chin up'],
    swapTargetIds: ['chest_supported_db_row', 'lat_pulldown_wide'],
    relativeLoadFactor: 1.08,
  },
  {
    id: 'lat_pulldown_wide',
    hevyName: 'Lat Pulldown (Wide Grip)',
    bgName: 'Вертикален скрипец с широк хват',
    subgroup: 'lats_vertical_pull',
    pattern: 'pull',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '8–12',
    matchAliases: ['lat pulldown', 'wide grip pulldown', 'pulldown'],
    swapTargetIds: ['pull_up', 'straight_arm_pulldown'],
    relativeLoadFactor: 0.82,
  },
  {
    id: 'straight_arm_pulldown',
    hevyName: 'Straight-Arm Pulldown',
    bgName: 'Пулоувър с прави ръце на скрипец',
    subgroup: 'lats_vertical_pull',
    pattern: 'pull',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['straight-arm pulldown', 'straight arm pulldown', 'cable pullover'],
    swapTargetIds: ['lat_pulldown_wide', 'pull_up'],
    relativeLoadFactor: 0.35,
  },

  // 4. Среден и горен гръб (Хоризонтално дърпане)
  {
    id: 'barbell_row',
    hevyName: 'Barbell Row',
    bgName: 'Гребане с щанга от наклон',
    subgroup: 'mid_upper_back_horizontal_pull',
    pattern: 'pull',
    equipment: 'barbell',
    defaultSets: 3,
    defaultReps: '6–10',
    matchAliases: ['barbell row', 'bent over row (barbell)', 'pendlay row'],
    swapTargetIds: ['chest_supported_db_row', 'seated_cable_row'],
    relativeLoadFactor: 1.0,
  },
  {
    id: 'chest_supported_db_row',
    hevyName: 'Chest Supported Dumbbell Row',
    bgName: 'Гребане с дъмбели с опора на гърди',
    subgroup: 'mid_upper_back_horizontal_pull',
    pattern: 'pull',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '8–10',
    isUnilateralDumbbell: true,
    matchAliases: ['chest supported', 'incline dumbbell row', 'seal row'],
    swapTargetIds: ['seated_cable_row', 'barbell_row'],
    relativeLoadFactor: 0.36,
  },
  {
    id: 'seated_cable_row',
    hevyName: 'Seated Cable Row',
    bgName: 'Хоризонтално гребане на скрипец',
    subgroup: 'mid_upper_back_horizontal_pull',
    pattern: 'pull',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '10–12',
    matchAliases: ['seated cable row', 'seated row', 'cable row'],
    swapTargetIds: ['chest_supported_db_row', 'barbell_row'],
    relativeLoadFactor: 0.85,
  },

  // 5. Средно и задно рамо
  {
    id: 'db_lateral_raise',
    hevyName: 'Dumbbell Lateral Raise (Разтваряне встрани)',
    bgName: 'Разтваряне встрани с дъмбели',
    subgroup: 'side_rear_delts',
    pattern: 'pull',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '12–15',
    isUnilateralDumbbell: true,
    matchAliases: ['lateral raise (dumbbell)', 'dumbbell lateral raise', 'side lateral raise'],
    swapTargetIds: ['cable_lateral_raise', 'face_pull'],
    relativeLoadFactor: 0.16,
  },
  {
    id: 'cable_lateral_raise',
    hevyName: 'Cable Lateral Raise',
    bgName: 'Разтваряне встрани на скрипец',
    subgroup: 'side_rear_delts',
    pattern: 'pull',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['cable lateral raise', 'lateral raise (cable)'],
    swapTargetIds: ['db_lateral_raise', 'face_pull'],
    relativeLoadFactor: 0.14,
  },
  {
    id: 'face_pull',
    hevyName: 'Face Pull (Въже за задно рамо)',
    bgName: 'Дърпане на въже към лицето за задно рамо',
    subgroup: 'side_rear_delts',
    pattern: 'pull',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['face pull', 'rope face pull'],
    swapTargetIds: ['rear_delt_reverse_fly', 'cable_lateral_raise'],
    relativeLoadFactor: 0.34,
  },
  {
    id: 'rear_delt_reverse_fly',
    hevyName: 'Rear Delt Reverse Fly',
    bgName: 'Обратен флайс за задно рамо',
    subgroup: 'side_rear_delts',
    pattern: 'pull',
    equipment: 'machine',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['reverse fly', 'rear delt fly', 'rear delt reverse fly', 'pec deck reverse'],
    swapTargetIds: ['face_pull', 'cable_lateral_raise'],
    relativeLoadFactor: 0.42,
  },

  // 6. Квадрицепс
  {
    id: 'squat_bb',
    hevyName: 'Squat (Barbell)',
    bgName: 'Клек с щанга',
    subgroup: 'quads',
    pattern: 'legs',
    equipment: 'barbell',
    defaultSets: 4,
    defaultReps: '5–8',
    matchAliases: ['squat (barbell)', 'barbell squat', 'back squat'],
    swapTargetIds: ['bulgarian_split_squat', 'leg_press'],
    relativeLoadFactor: 1.0,
  },
  {
    id: 'bulgarian_split_squat',
    hevyName: 'Bulgarian Split Squat (Български клек)',
    bgName: 'Български клек с дъмбели',
    subgroup: 'quads',
    pattern: 'legs',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '8–10 на крак',
    isUnilateralDumbbell: true,
    matchAliases: ['bulgarian split squat', 'split squat'],
    swapTargetIds: ['leg_press', 'squat_bb'],
    relativeLoadFactor: 0.24,
  },
  {
    id: 'leg_press',
    hevyName: 'Leg Press',
    bgName: 'Лег преса',
    subgroup: 'quads',
    pattern: 'legs',
    equipment: 'machine',
    defaultSets: 3,
    defaultReps: '10–12',
    matchAliases: ['leg press', 'hack squat'],
    swapTargetIds: ['bulgarian_split_squat', 'leg_extension'],
    relativeLoadFactor: 1.65,
  },
  {
    id: 'leg_extension',
    hevyName: 'Leg Extension',
    bgName: 'Бедрено разгъване на машина',
    subgroup: 'quads',
    pattern: 'legs',
    equipment: 'machine',
    defaultSets: 3,
    defaultReps: '12–15',
    matchAliases: ['leg extension'],
    swapTargetIds: ['bulgarian_split_squat', 'leg_press'],
    relativeLoadFactor: 0.55,
  },

  // 7. Задно бедро и седалище
  {
    id: 'romanian_deadlift',
    hevyName: 'Romanian Deadlift (Румънска тяга)',
    bgName: 'Румънска тяга с щанга/дъмбели',
    subgroup: 'hamstrings_glutes',
    pattern: 'legs',
    equipment: 'barbell',
    defaultSets: 3,
    defaultReps: '8–10',
    matchAliases: ['romanian deadlift', 'rdl', 'stiff leg deadlift'],
    swapTargetIds: ['hip_thrust', 'leg_curl'],
    relativeLoadFactor: 1.0,
  },
  {
    id: 'leg_curl',
    hevyName: 'Seated/Lying Leg Curl',
    bgName: 'Бедрено сгъване (седнал или легнал)',
    subgroup: 'hamstrings_glutes',
    pattern: 'legs',
    equipment: 'machine',
    defaultSets: 3,
    defaultReps: '10–15',
    matchAliases: ['leg curl', 'seated leg curl', 'lying leg curl', 'hamstring curl'],
    swapTargetIds: ['romanian_deadlift', 'hip_thrust'],
    relativeLoadFactor: 0.52,
  },
  {
    id: 'hip_thrust',
    hevyName: 'Hip Thrust',
    bgName: 'Хип тръст за седалище',
    subgroup: 'hamstrings_glutes',
    pattern: 'legs',
    equipment: 'barbell',
    defaultSets: 3,
    defaultReps: '8–12',
    matchAliases: ['hip thrust', 'glute bridge'],
    swapTargetIds: ['romanian_deadlift', 'leg_curl'],
    relativeLoadFactor: 1.15,
  },

  // 8. Ръце и корем
  {
    id: 'incline_db_curl',
    hevyName: 'Incline Dumbbell Curl',
    bgName: 'Бицепсово сгъване на наклонена пейка',
    subgroup: 'arms_core',
    pattern: 'pull',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '10–12',
    isUnilateralDumbbell: true,
    matchAliases: ['incline dumbbell curl', 'incline curl'],
    swapTargetIds: ['hammer_curl'],
    relativeLoadFactor: 0.34,
  },
  {
    id: 'hammer_curl',
    hevyName: 'Hammer Curl',
    bgName: 'Чуково сгъване с дъмбели',
    subgroup: 'arms_core',
    pattern: 'pull',
    equipment: 'dumbbell',
    defaultSets: 3,
    defaultReps: '10–12',
    isUnilateralDumbbell: true,
    matchAliases: ['hammer curl'],
    swapTargetIds: ['incline_db_curl'],
    relativeLoadFactor: 0.38,
  },
  {
    id: 'overhead_tricep_extension',
    hevyName: 'Overhead Tricep Extension',
    bgName: 'Френско / разгъване за трицепс над глава',
    subgroup: 'arms_core',
    pattern: 'push',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '10–14',
    matchAliases: ['overhead tricep', 'triceps extension', 'skullcrusher', 'french press'],
    swapTargetIds: ['tricep_pushdown'],
    relativeLoadFactor: 0.42,
  },
  {
    id: 'tricep_pushdown',
    hevyName: 'Tricep Pushdown',
    bgName: 'Трицепсово разгъване на горен скрипец',
    subgroup: 'arms_core',
    pattern: 'push',
    equipment: 'cable',
    defaultSets: 3,
    defaultReps: '10–15',
    matchAliases: ['tricep pushdown', 'triceps pushdown', 'rope pushdown'],
    swapTargetIds: ['overhead_tricep_extension'],
    relativeLoadFactor: 0.46,
  },
  {
    id: 'hanging_leg_raise',
    hevyName: 'Hanging Leg Raise',
    bgName: 'Повдигане на крака от вис за корем',
    subgroup: 'arms_core',
    pattern: 'core',
    equipment: 'bodyweight',
    defaultSets: 3,
    defaultReps: '10–15',
    matchAliases: ['hanging leg raise', 'leg raise', 'toes to bar', 'knee raise'],
    swapTargetIds: ['incline_db_curl'],
    relativeLoadFactor: 1.0,
  },
];

export interface SubgroupVolumeSummary {
  subgroup: RecommenderSubgroupId;
  label: string;
  pattern: MovementPattern;
  sets7d: number;
  targetMinSets7d: number;
  isLagging: boolean;
}

export interface ExerciseAddSuggestion {
  catalogId: string;
  hevyName: string;
  bgName: string;
  sets: number;
  reps: string;
  equipment: EquipmentKind;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export interface AddExerciseRecommendationCard {
  id: string;
  subgroup: RecommenderSubgroupId;
  subgroupLabel: string;
  reasonType: 'low_volume' | 'push_pull_imbalance';
  sets7d: number;
  headline: string;
  message: string;
  exercises: ExerciseAddSuggestion[];
}

export interface SwapAlternativeSuggestion {
  catalogId: string;
  hevyName: string;
  bgName: string;
  sets: number;
  reps: string;
  startingWeightKg: number | null;
  weightLabel: string;
  equipment: EquipmentKind;
  primaryMuscles: string[];
  secondaryMuscles: string[];
}

export interface PlateauSwapRecommendationCard {
  id: string;
  stalledExerciseTitle: string;
  subgroup: RecommenderSubgroupId;
  subgroupLabel: string;
  sessionsCount: number;
  lastThreeE1RMs: number[];
  lastThreeDates: string[];
  currentWorkingWeightKg: number;
  currentBestE1RM: number;
  headline: string;
  rationale: string;
  blockDurationWeeks: number;
  alternatives: SwapAlternativeSuggestion[];
}

export interface ExerciseRecommendationReport {
  anchorDate: string;
  windowStartDate: string;
  pushSets7d: number;
  pullSets7d: number;
  pushExceedsPullPct: number | null;
  hasPushPullImbalance: boolean;
  subgroupVolumes: SubgroupVolumeSummary[];
  addRecommendations: AddExerciseRecommendationCard[];
  swapRecommendations: PlateauSwapRecommendationCard[];
}

function roundToStep(val: number, step: number): number {
  if (!Number.isFinite(val) || val <= 0) return step;
  return Math.max(step, Math.round(val / step) * step);
}

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length > 0 ? nonWarmup : sets;
}

function parseWorkoutTs(w: HevyWorkout): number {
  if (w.startTime) {
    const dt = new Date(w.startTime);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
  const dt = new Date(`${w.date}T12:00:00`);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
}

export function matchCatalogExercise(title: string): CatalogExercise | null {
  const t = title.trim().toLowerCase();
  if (!t) return null;

  for (const item of EXERCISE_CATALOG) {
    if (item.hevyName.toLowerCase() === t) return item;
    for (const alias of item.matchAliases) {
      if (t.includes(alias)) {
        // Avoid matching "Incline Bench Press" as flat "Bench Press (Barbell)"
        if (
          item.id === 'bench_press_bb' &&
          (t.includes('incline') || t.includes('dumbbell'))
        ) {
          continue;
        }
        // Avoid matching "Bulgarian Split Squat" as "Squat (Barbell)"
        if (
          item.id === 'squat_bb' &&
          (t.includes('split') || t.includes('bulgarian') || t.includes('hack'))
        ) {
          continue;
        }
        // Avoid matching "Weighted Pull Up" as plain "Pull Up"
        if (item.id === 'pull_up' && t.includes('weighted')) {
          continue;
        }
        return item;
      }
    }
  }
  return null;
}

export function classifyExerciseSubgroup(title: string): {
  subgroup: RecommenderSubgroupId;
  pattern: MovementPattern;
} {
  const matched = matchCatalogExercise(title);
  if (matched) {
    return { subgroup: matched.subgroup, pattern: matched.pattern };
  }

  const t = title.trim().toLowerCase();

  // Upper chest
  if (
    t.includes('incline') &&
    (t.includes('bench') || t.includes('press') || t.includes('chest') || t.includes('fly'))
  ) {
    return { subgroup: 'upper_chest', pattern: 'push' };
  }
  if (t.includes('low-to-high') || t.includes('low to high')) {
    return { subgroup: 'upper_chest', pattern: 'push' };
  }

  // Mid / Lower chest
  if (
    t.includes('bench') ||
    t.includes('chest') ||
    t.includes('pec') ||
    t.includes('push up') ||
    t.includes('push-up') ||
    t.includes('dip') ||
    (t.includes('fly') && !t.includes('reverse') && !t.includes('rear'))
  ) {
    return { subgroup: 'mid_lower_chest', pattern: 'push' };
  }

  // Side & Rear delts (check before generic row/pull)
  if (
    t.includes('face pull') ||
    t.includes('rear delt') ||
    t.includes('reverse fly') ||
    t.includes('lateral raise') ||
    t.includes('side raise')
  ) {
    return { subgroup: 'side_rear_delts', pattern: 'pull' };
  }

  // Overhead / front shoulder push
  if (
    t.includes('overhead press') ||
    t.includes('shoulder press') ||
    t.includes('military press') ||
    t.includes('arnold press')
  ) {
    return { subgroup: 'upper_chest', pattern: 'push' };
  }

  // Lats (vertical pull)
  if (
    t.includes('pull up') ||
    t.includes('pull-up') ||
    t.includes('chin up') ||
    t.includes('chin-up') ||
    t.includes('pulldown') ||
    t.includes('lat ') ||
    t.includes('pullover')
  ) {
    return { subgroup: 'lats_vertical_pull', pattern: 'pull' };
  }

  // Mid & upper back (horizontal pull)
  if (t.includes('row') || t.includes('shrug') || t.includes('t-bar')) {
    return { subgroup: 'mid_upper_back_horizontal_pull', pattern: 'pull' };
  }

  // Hamstrings & glutes (check before generic squat/leg)
  if (
    t.includes('romanian') ||
    t.includes('rdl') ||
    t.includes('deadlift') ||
    t.includes('leg curl') ||
    t.includes('hamstring') ||
    t.includes('hip thrust') ||
    t.includes('glute') ||
    t.includes('good morning')
  ) {
    return { subgroup: 'hamstrings_glutes', pattern: 'legs' };
  }

  // Quads
  if (
    t.includes('squat') ||
    t.includes('leg press') ||
    t.includes('leg extension') ||
    t.includes('lunge') ||
    t.includes('step up') ||
    t.includes('quad')
  ) {
    return { subgroup: 'quads', pattern: 'legs' };
  }

  // Arms & Core
  if (
    t.includes('curl') ||
    t.includes('bicep') ||
    t.includes('tricep') ||
    t.includes('pushdown') ||
    t.includes('skull') ||
    t.includes('crunch') ||
    t.includes('plank') ||
    t.includes('leg raise') ||
    t.includes('ab ') ||
    t.includes('abs')
  ) {
    const pattern: MovementPattern =
      t.includes('tricep') || t.includes('pushdown') || t.includes('skull')
        ? 'push'
        : t.includes('curl') || t.includes('bicep')
          ? 'pull'
          : 'core';
    return { subgroup: 'arms_core', pattern };
  }

  return { subgroup: 'arms_core', pattern: 'core' };
}

function estimateSwapStartingWeight(params: {
  sourceWorkingWeightKg: number;
  sourceE1RM: number;
  sourceCatalog: CatalogExercise | null;
  target: CatalogExercise;
  bodyWeightKg: number;
}): { startingWeightKg: number | null; weightLabel: string } {
  const {
    sourceWorkingWeightKg,
    sourceE1RM,
    sourceCatalog,
    target,
    bodyWeightKg,
  } = params;

  const isSourceBw =
    sourceCatalog?.equipment === 'bodyweight' ||
    (sourceWorkingWeightKg === 0 && sourceE1RM === 0);

  // Determine effective total anchor load in kg
  let anchorWorkingLoad =
    sourceWorkingWeightKg > 0
      ? sourceWorkingWeightKg
      : sourceE1RM > 0
        ? sourceE1RM * 0.78
        : 0;

  if (isSourceBw) {
    anchorWorkingLoad = bodyWeightKg + sourceWorkingWeightKg;
  }

  // If source was unilateral dumbbell, convert to bilateral equivalent first
  if (sourceCatalog?.isUnilateralDumbbell && anchorWorkingLoad > 0) {
    anchorWorkingLoad = anchorWorkingLoad / Math.max(0.2, sourceCatalog.relativeLoadFactor);
  } else if (
    sourceCatalog &&
    sourceCatalog.relativeLoadFactor > 0 &&
    sourceCatalog.relativeLoadFactor !== 1
  ) {
    anchorWorkingLoad = anchorWorkingLoad / sourceCatalog.relativeLoadFactor;
  }

  if (anchorWorkingLoad <= 0) {
    return {
      startingWeightKg: null,
      weightLabel: 'Започни с умерена тежест (RPE 7–8)',
    };
  }

  // Conservative 4-week fresh-stimulus starting load (~90% of equivalent working weight)
  const rawTarget = anchorWorkingLoad * target.relativeLoadFactor * 0.9;

  if (target.equipment === 'bodyweight') {
    if (target.id === 'hanging_leg_raise' || target.id === 'pull_up') {
      return {
        startingWeightKg: null,
        weightLabel: 'Собствено тегло (контролирана техника)',
      };
    }
    const added = Math.max(0, rawTarget - bodyWeightKg);
    if (added < 2.5) {
      return {
        startingWeightKg: 0,
        weightLabel: 'Собствено тегло (или +2.5 kg колан)',
      };
    }
    const roundedAdded = roundToStep(added, 2.5);
    return {
      startingWeightKg: roundedAdded,
      weightLabel: `Собствено тегло + ${roundedAdded} kg`,
    };
  }

  if (target.isUnilateralDumbbell) {
    const roundedDb = roundToStep(rawTarget, 2);
    return {
      startingWeightKg: roundedDb,
      weightLabel: `~${roundedDb} kg на ръка (дъмбели)`,
    };
  }

  const rounded = roundToStep(rawTarget, 2.5);
  return {
    startingWeightKg: rounded,
    weightLabel: `~${rounded} kg`,
  };
}

function getSubgroupLabel(id: RecommenderSubgroupId): string {
  return RECOMMENDER_SUBGROUPS.find((s) => s.id === id)?.label ?? id;
}

function getSubgroupHint(id: RecommenderSubgroupId): string {
  return RECOMMENDER_SUBGROUPS.find((s) => s.id === id)?.sessionHint ?? 'следващата тренировка';
}

const SUBGROUP_PRIMARY_TARGETS: Record<RecommenderSubgroupId, DetailedMuscleId[]> = {
  upper_chest: ['chest', 'front_delts'],
  mid_lower_chest: ['chest'],
  lats_vertical_pull: ['lats'],
  mid_upper_back_horizontal_pull: ['traps_upper_back', 'lats'],
  side_rear_delts: ['side_delts', 'rear_delts'],
  quads: ['quads'],
  hamstrings_glutes: ['hamstrings', 'glutes'],
  arms_core: ['biceps', 'triceps', 'abs', 'forearms'],
};

export function buildExerciseRecommendations(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  profileWeightKg?: number | '';
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal?: TrainingGoalPhase;
}): ExerciseRecommendationReport {
  const {
    hevyWorkouts,
    dailyLogs = [],
    profileWeightKg,
    todayKey,
    customExerciseMappings,
    trainingGoal = DEFAULT_TRAINING_GOAL,
  } = params;

  // Resolve latest body weight for bodyweight lift calculations
  const latestLoggedWeight = [...dailyLogs]
    .filter((d) => d.weightKg !== undefined && d.weightKg > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0]?.weightKg;
  const effectiveBodyWeightKg =
    latestLoggedWeight ??
    (typeof profileWeightKg === 'number' && profileWeightKg > 0
      ? profileWeightKg
      : 80);

  const sortedDesc = [...hevyWorkouts].sort(
    (a, b) => parseWorkoutTs(b) - parseWorkoutTs(a),
  );
  const latestWorkoutDate = sortedDesc[0]?.date;

  // Use todayKey when recent workouts exist within 14d; fallback to latestWorkoutDate for historical datasets
  const recentCutoff14d = shiftDateKey(todayKey, -14);
  const hasRecentWorkouts =
    latestWorkoutDate !== undefined && latestWorkoutDate >= recentCutoff14d;
  const anchorDate =
    hasRecentWorkouts || !latestWorkoutDate ? todayKey : latestWorkoutDate;
  const windowStartDate = shiftDateKey(anchorDate, -6);
  const recent14dStart = shiftDateKey(anchorDate, -13);

  const subgroupSets = new Map<RecommenderSubgroupId, number>();
  for (const meta of RECOMMENDER_SUBGROUPS) {
    subgroupSets.set(meta.id, 0);
  }

  let pushSets7d = 0;
  let pullSets7d = 0;
  const performedRecentlyCatalogIds = new Set<string>();
  const performedRecentlyRawNames = new Set<string>();

  for (const w of hevyWorkouts) {
    if (w.date >= recent14dStart && w.date <= anchorDate) {
      for (const ex of w.exercises) {
        performedRecentlyRawNames.add(ex.title.trim().toLowerCase());
        const matched = matchCatalogExercise(ex.title);
        if (matched) performedRecentlyCatalogIds.add(matched.id);
      }
    }
    if (w.date >= windowStartDate && w.date <= anchorDate) {
      for (const ex of w.exercises) {
        const workingCount = getWorkingSets(ex.sets).length;
        const { subgroup, pattern } = classifyExerciseSubgroup(ex.title);
        subgroupSets.set(subgroup, (subgroupSets.get(subgroup) ?? 0) + workingCount);
        if (pattern === 'push') pushSets7d += workingCount;
        if (pattern === 'pull') pullSets7d += workingCount;
      }
    }
  }

  const pushExceedsPullPct =
    pushSets7d > 0 && pullSets7d > 0
      ? Math.round(((pushSets7d - pullSets7d) / pullSets7d) * 100)
      : pushSets7d >= 6 && pullSets7d === 0
        ? 100
        : null;

  const hasPushPullImbalance =
    pushSets7d >= 6 &&
    (pullSets7d === 0 || pushSets7d > pullSets7d * 1.3);

  const subgroupVolumes: SubgroupVolumeSummary[] = RECOMMENDER_SUBGROUPS.map(
    (meta) => {
      const sets7d = subgroupSets.get(meta.id) ?? 0;
      return {
        subgroup: meta.id,
        label: meta.label,
        pattern: meta.pattern,
        sets7d,
        targetMinSets7d: meta.targetMinSets7d,
        isLagging: sets7d < meta.targetMinSets7d,
      };
    },
  );

  // =========================================================================
  // A) ADD RECOMMENDATIONS (Subgroups < 6 sets in 7d OR Push > Pull by > 30%)
  // =========================================================================
  const addRecommendations: AddExerciseRecommendationCard[] = [];

  if (hevyWorkouts.length > 0) {
    const pickMissingCatalogExercises = (
      subgroup: RecommenderSubgroupId,
      preferredIds?: string[],
    ): ExerciseAddSuggestion[] => {
      const targetPrimaryIds = SUBGROUP_PRIMARY_TARGETS[subgroup];
      const pool = EXERCISE_CATALOG.filter((c) => {
        if (c.subgroup !== subgroup) return false;
        const resolved = resolveExerciseMuscles(c.hevyName, customExerciseMappings);
        return resolved.primary.some((p) => targetPrimaryIds.includes(p));
      });
      const effectivePool =
        pool.length > 0
          ? pool
          : EXERCISE_CATALOG.filter((c) => c.subgroup === subgroup);

      const sortedPool = preferredIds
        ? [...effectivePool].sort((a, b) => {
            const ia = preferredIds.indexOf(a.id);
            const ib = preferredIds.indexOf(b.id);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
          })
        : effectivePool;

      const missing = sortedPool.filter(
        (c) =>
          !performedRecentlyCatalogIds.has(c.id) &&
          !performedRecentlyRawNames.has(c.hevyName.toLowerCase()),
      );

      const chosen = (missing.length >= 2
        ? missing
        : [...missing, ...sortedPool.filter((c) => !missing.includes(c))]
      ).slice(0, 2);

      return chosen.map((c) => {
        const resolved = resolveExerciseMuscles(c.hevyName, customExerciseMappings);
        return {
          catalogId: c.id,
          hevyName: c.hevyName,
          bgName: c.bgName,
          sets: c.defaultSets,
          reps: c.defaultReps,
          equipment: c.equipment,
          primaryMuscles: resolved.primaryLabels,
          secondaryMuscles: resolved.secondaryLabels,
        };
      });
    };

    // Priority 1: Push exceeds Pull by > 30%
    if (hasPushPullImbalance) {
      const rearDeltSets = subgroupSets.get('side_rear_delts') ?? 0;
      const upperBackSets =
        subgroupSets.get('mid_upper_back_horizontal_pull') ?? 0;
      const pullPicks: ExerciseAddSuggestion[] = [
        ...pickMissingCatalogExercises('side_rear_delts', ['face_pull', 'rear_delt_reverse_fly']).slice(0, 1),
        ...pickMissingCatalogExercises('mid_upper_back_horizontal_pull', [
          'chest_supported_db_row',
          'seated_cable_row',
        ]).slice(0, 1),
      ];

      addRecommendations.push({
        id: 'add-push-pull-imbalance',
        subgroup: 'side_rear_delts',
        subgroupLabel: 'Задно рамо и горен гръб (Дисбаланс Бутане/Дърпане)',
        reasonType: 'push_pull_imbalance',
        sets7d: rearDeltSets + upperBackSets,
        headline: `Бутащите серии (${pushSets7d}) превишават дърпащите (${pullSets7d}) с ${pushExceedsPullPct ?? 100}%`,
        message: `Задното рамо и горният гръб изостават (${rearDeltSets + upperBackSets} серии за 7 дни). Включи ${pullPicks
          .map((e) => `${e.hevyName} (${e.sets}×${e.reps})`)
          .join(' или ')} в следващата тренировка за горна част.`,
        exercises: pullPicks,
      });
    }

    // Priority 2: Individual lagging subgroups (< 6 working sets in 7 days)
    const laggingSubgroups = subgroupVolumes
      .filter((sv) => sv.isLagging)
      .filter((sv) => {
        if (
          hasPushPullImbalance &&
          (sv.subgroup === 'side_rear_delts' ||
            sv.subgroup === 'mid_upper_back_horizontal_pull')
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.sets7d - b.sets7d)
      .slice(0, hasPushPullImbalance ? 3 : 4);

    for (const lag of laggingSubgroups) {
      const picks = pickMissingCatalogExercises(lag.subgroup);
      if (picks.length === 0) continue;

      addRecommendations.push({
        id: `add-${lag.subgroup}`,
        subgroup: lag.subgroup,
        subgroupLabel: lag.label,
        reasonType: 'low_volume',
        sets7d: lag.sets7d,
        headline: `${lag.label} изостава (само ${lag.sets7d} от мин. 6 серии за 7 дни)`,
        message: `Включи ${picks
          .map((e) => `${e.hevyName} (${e.sets}×${e.reps})`)
          .join(' или ')} в ${getSubgroupHint(lag.subgroup)}, за да запълниш дефицита от обем.`,
        exercises: picks,
      });
    }
  }

  // =========================================================================
  // B) PLATEAU SWAP RECOMMENDATIONS (True plateau in same environment: no 1RM/Rep/Volume PR in 3 sessions)
  // =========================================================================
  const sessionsByExerciseAndEnv = new Map<
    string,
    {
      displayTitle: string;
      environment: WorkoutEnvironment;
      sessions: Array<{
        date: string;
        ts: number;
        e1rm: number;
        maxWorkingWeightKg: number;
        bestReps: number;
      }>;
    }
  >();

  const sortedAsc = [...hevyWorkouts].sort(
    (a, b) => parseWorkoutTs(a) - parseWorkoutTs(b),
  );

  for (const w of sortedAsc) {
    const ts = parseWorkoutTs(w);
    const env = classifyWorkoutEnvironment(w);
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const working = getWorkingSets(ex.sets);
      let bestE1rm = 0;
      let maxWt = 0;
      let bestReps = 0;
      const isBwLift =
        key.includes('pull up') ||
        key.includes('pull-up') ||
        key.includes('chin up') ||
        key.includes('dip');

      for (const s of working) {
        const wt = s.weightKg ?? 0;
        const rp = s.reps ?? 0;
        if (wt > maxWt) maxWt = wt;
        if (rp > bestReps) bestReps = rp;

        const effectiveLoad = isBwLift ? effectiveBodyWeightKg + wt : wt;
        if (effectiveLoad > 0 && rp > 0) {
          const e = calculateEpley1RM(effectiveLoad, rp);
          if (e > bestE1rm) bestE1rm = e;
        }
      }

      if (bestE1rm <= 0) continue;

      const envKey = `${key}::${env}`;
      const list = sessionsByExerciseAndEnv.get(envKey) ?? {
        displayTitle: ex.title,
        environment: env,
        sessions: [],
      };
      list.displayTitle = ex.title;
      list.sessions.push({
        date: w.date,
        ts,
        e1rm: roundOne(bestE1rm),
        maxWorkingWeightKg: maxWt,
        bestReps,
      });
      sessionsByExerciseAndEnv.set(envKey, list);
    }
  }

  const swapRecommendations: PlateauSwapRecommendationCard[] = [];

  for (const [envKey, entry] of sessionsByExerciseAndEnv.entries()) {
    if (entry.sessions.length < 3) continue;
    const last3 = entry.sessions.slice(-3);
    const [s1, s2, s3] = last3;

    // Eliminate false plateaus: check true plateau in same environment (no 1RM PR, Rep PR, or Volume PR)
    const plateauEval = evaluateExercisePlateauInEnvironment({
      workouts: sortedAsc,
      exerciseTitle: entry.displayTitle,
      environment: entry.environment,
      bodyWeightKg: effectiveBodyWeightKg,
    });
    if (!plateauEval.isTruePlateau) continue;

    // In fat_loss phase, maintaining strength within -5% is success, not a plateau
    if (
      trainingGoal === 'fat_loss' &&
      (plateauEval.strengthDropPct === null || plateauEval.strengthDropPct >= -5)
    ) {
      continue;
    }

    const matchedCatalog = matchCatalogExercise(entry.displayTitle);
    const { subgroup } = classifyExerciseSubgroup(entry.displayTitle);
    const subgroupLabel = getSubgroupLabel(subgroup);

    // Build biomechanical swap candidates
    let candidateCatalogItems: CatalogExercise[] = [];
    if (matchedCatalog && matchedCatalog.swapTargetIds.length > 0) {
      candidateCatalogItems = matchedCatalog.swapTargetIds
        .map((id) => EXERCISE_CATALOG.find((c) => c.id === id))
        .filter((c): c is CatalogExercise => Boolean(c));
    }

    if (candidateCatalogItems.length < 2) {
      const sameSubgroupFallbacks = EXERCISE_CATALOG.filter(
        (c) =>
          c.subgroup === subgroup &&
          c.id !== matchedCatalog?.id &&
          !candidateCatalogItems.some((x) => x.id === c.id),
      );
      candidateCatalogItems = [
        ...candidateCatalogItems,
        ...sameSubgroupFallbacks,
      ].slice(0, 2);
    }

    const alternatives: SwapAlternativeSuggestion[] = candidateCatalogItems
      .slice(0, 2)
      .map((target) => {
        const est = estimateSwapStartingWeight({
          sourceWorkingWeightKg: s3.maxWorkingWeightKg,
          sourceE1RM: s3.e1rm,
          sourceCatalog: matchedCatalog,
          target,
          bodyWeightKg: effectiveBodyWeightKg,
        });
        const resolved = resolveExerciseMuscles(
          target.hevyName,
          customExerciseMappings,
        );
        return {
          catalogId: target.id,
          hevyName: target.hevyName,
          bgName: target.bgName,
          sets: target.defaultSets,
          reps: target.defaultReps,
          startingWeightKg: est.startingWeightKg,
          weightLabel: est.weightLabel,
          equipment: target.equipment,
          primaryMuscles: resolved.primaryLabels,
          secondaryMuscles: resolved.secondaryLabels,
        };
      });

    const envMeta = WORKOUT_ENVIRONMENT_META_MAP[entry.environment];
    swapRecommendations.push({
      id: `swap-${envKey.replace(/[^a-z0-9]+/g, '-')}`,
      stalledExerciseTitle: entry.displayTitle,
      subgroup,
      subgroupLabel,
      sessionsCount: entry.sessions.length,
      lastThreeE1RMs: [s1.e1rm, s2.e1rm, s3.e1rm],
      lastThreeDates: [s1.date, s2.date, s3.date],
      currentWorkingWeightKg: s3.maxWorkingWeightKg,
      currentBestE1RM: Math.max(s1.e1rm, s2.e1rm, s3.e1rm),
      headline: `Застой в ${entry.displayTitle} (${envMeta.badgeLabel} · 3 поредни сесии без 1RM/Rep/Volume PR)`,
      rationale: `${envMeta.badgeLabel} · Последни 3 сесии 1RM: ${s1.e1rm} → ${s2.e1rm} → ${s3.e1rm} kg без Rep PR или Volume PR. Замени го за 4 седмици с нов стимул, за да пробиеш платото и да разтовариш ставите.`,
      blockDurationWeeks: 4,
      alternatives,
    });
  }

  // Sort plateau swaps by most recently performed first
  swapRecommendations.sort((a, b) =>
    (b.lastThreeDates[2] ?? '').localeCompare(a.lastThreeDates[2] ?? ''),
  );

  return {
    anchorDate,
    windowStartDate,
    pushSets7d,
    pullSets7d,
    pushExceedsPullPct,
    hasPushPullImbalance,
    subgroupVolumes,
    addRecommendations,
    swapRecommendations,
  };
}
