import type {
  CustomExerciseMapping,
  CustomExerciseMappings,
  DetailedMuscleId,
  HevySet,
  HevyWorkout,
} from '../types/fitness';

export interface MuscleGroupMeta15 {
  id: DetailedMuscleId;
  label: string;
  pattern: 'push' | 'pull' | 'legs' | 'core';
  macroGroupId: 'chest' | 'back' | 'shoulders' | 'legs' | 'biceps' | 'triceps' | 'core';
  view: 'front' | 'back' | 'both';
}

export const MUSCLE_GROUPS_15: MuscleGroupMeta15[] = [
  { id: 'chest', label: 'Гърди', pattern: 'push', macroGroupId: 'chest', view: 'front' },
  { id: 'lats', label: 'Широк гръб (Lats)', pattern: 'pull', macroGroupId: 'back', view: 'back' },
  { id: 'traps_upper_back', label: 'Горен гръб / Трапец', pattern: 'pull', macroGroupId: 'back', view: 'back' },
  { id: 'lower_back', label: 'Кръст', pattern: 'pull', macroGroupId: 'back', view: 'back' },
  { id: 'front_delts', label: 'Предно рамо', pattern: 'push', macroGroupId: 'shoulders', view: 'front' },
  { id: 'side_delts', label: 'Средно рамо', pattern: 'push', macroGroupId: 'shoulders', view: 'both' },
  { id: 'rear_delts', label: 'Задно рамо', pattern: 'pull', macroGroupId: 'shoulders', view: 'back' },
  { id: 'biceps', label: 'Бицепс', pattern: 'pull', macroGroupId: 'biceps', view: 'front' },
  { id: 'triceps', label: 'Трицепс', pattern: 'push', macroGroupId: 'triceps', view: 'back' },
  { id: 'forearms', label: 'Предмишници', pattern: 'pull', macroGroupId: 'biceps', view: 'both' },
  { id: 'quads', label: 'Квадрицепс', pattern: 'legs', macroGroupId: 'legs', view: 'front' },
  { id: 'hamstrings', label: 'Задно бедро', pattern: 'legs', macroGroupId: 'legs', view: 'back' },
  { id: 'glutes', label: 'Седалище', pattern: 'legs', macroGroupId: 'legs', view: 'back' },
  { id: 'calves', label: 'Прасци', pattern: 'legs', macroGroupId: 'legs', view: 'both' },
  { id: 'abs', label: 'Корем', pattern: 'core', macroGroupId: 'core', view: 'front' },
];

export const VALID_DETAILED_MUSCLE_IDS = new Set<DetailedMuscleId>(
  MUSCLE_GROUPS_15.map((m) => m.id),
);

export const MUSCLE_LABEL_15_MAP: Record<DetailedMuscleId, string> = Object.fromEntries(
  MUSCLE_GROUPS_15.map((m) => [m.id, m.label]),
) as Record<DetailedMuscleId, string>;

export const MUSCLE_META_15_MAP: Record<DetailedMuscleId, MuscleGroupMeta15> =
  Object.fromEntries(MUSCLE_GROUPS_15.map((m) => [m.id, m])) as Record<
    DetailedMuscleId,
    MuscleGroupMeta15
  >;

export interface ExerciseDictionaryEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  primary: DetailedMuscleId[];
  secondary: DetailedMuscleId[];
}

/**
 * Built-in offline exercise-to-muscle dictionary (88 popular Hevy, barbell,
 * dumbbell, cable, machine, and calisthenics movements with EN + BG aliases).
 */
export const EXERCISE_MUSCLE_DICTIONARY: ExerciseDictionaryEntry[] = [
  // ================= CHEST (ГЪРДИ) =================
  {
    id: 'bench_press_barbell',
    canonicalName: 'Bench Press (Barbell)',
    aliases: ['bench press (barbell)', 'barbell bench press', 'flat bench press', 'bench press', 'хоризонтален лег', 'лег с щанга', 'лежанка'],
    primary: ['chest'],
    secondary: ['front_delts', 'triceps'],
  },
  {
    id: 'bench_press_dumbbell',
    canonicalName: 'Bench Press (Dumbbell)',
    aliases: ['bench press (dumbbell)', 'flat dumbbell press', 'dumbbell bench press', 'dumbbell chest press', 'лег с дъмбели'],
    primary: ['chest'],
    secondary: ['front_delts', 'triceps'],
  },
  {
    id: 'bench_press_smith',
    canonicalName: 'Bench Press (Smith Machine)',
    aliases: ['bench press (smith machine)', 'smith machine bench press', 'лег на смит'],
    primary: ['chest'],
    secondary: ['front_delts', 'triceps'],
  },
  {
    id: 'chest_press_machine',
    canonicalName: 'Chest Press (Machine)',
    aliases: ['chest press (machine)', 'machine chest press', 'seated chest press', 'chest press', 'преса за гърди'],
    primary: ['chest'],
    secondary: ['front_delts', 'triceps'],
  },
  {
    id: 'incline_bench_barbell',
    canonicalName: 'Incline Bench Press (Barbell)',
    aliases: ['incline bench press (barbell)', 'incline barbell bench press', 'incline bench press', 'incline bench', 'полулег с щанга', 'горен лег с щанга'],
    primary: ['chest', 'front_delts'],
    secondary: ['triceps'],
  },
  {
    id: 'incline_bench_dumbbell',
    canonicalName: 'Incline Dumbbell Press',
    aliases: ['incline dumbbell press', 'incline bench press (dumbbell)', 'incline db press', 'incline chest press', 'полулег с дъмбели', 'горен лег с дъмбели'],
    primary: ['chest', 'front_delts'],
    secondary: ['triceps'],
  },
  {
    id: 'incline_bench_smith',
    canonicalName: 'Incline Bench Press (Smith Machine)',
    aliases: ['incline bench press (smith machine)', 'incline chest press (machine)', 'полулег на машина'],
    primary: ['chest', 'front_delts'],
    secondary: ['triceps'],
  },
  {
    id: 'decline_bench_press',
    canonicalName: 'Decline Bench Press (Barbell)',
    aliases: ['decline bench press', 'decline dumbbell press', 'долен лег', 'обратен наклон лег'],
    primary: ['chest'],
    secondary: ['triceps', 'front_delts'],
  },
  {
    id: 'push_up',
    canonicalName: 'Push Up',
    aliases: ['push up', 'push-up', 'pushup', 'incline push up', 'decline push up', 'weighted push up', 'лицеви опори', 'лицева опора'],
    primary: ['chest'],
    secondary: ['front_delts', 'triceps'],
  },
  {
    id: 'diamond_push_up',
    canonicalName: 'Diamond Push Up',
    aliases: ['diamond push up', 'diamond push-up', 'диамантени лицеви опори'],
    primary: ['triceps', 'chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'weighted_dips',
    canonicalName: 'Weighted Dips',
    aliases: ['weighted dips', 'weighted dip', 'chest dip', 'chest dips', 'dips', 'dip', 'parallel bar dip', 'ring dip', 'кофички с тежест', 'кофички'],
    primary: ['chest', 'triceps'],
    secondary: ['front_delts'],
  },
  {
    id: 'low_to_high_cable_fly',
    canonicalName: 'Low-to-High Cable Fly',
    aliases: ['low-to-high cable fly', 'low to high cable fly', 'incline cable fly', 'флайс отдолу нагоре'],
    primary: ['chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'cable_fly',
    canonicalName: 'Cable Fly Crossovers',
    aliases: ['cable fly', 'cable crossover', 'standing cable fly', 'high to low cable fly', 'кросоувър', 'флайс на скрипец'],
    primary: ['chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'pec_deck_fly',
    canonicalName: 'Butterfly (Pec Deck)',
    aliases: ['butterfly (pec deck)', 'pec deck', 'chest fly (machine)', 'machine fly', 'пек дек', 'пеперуда'],
    primary: ['chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'dumbbell_fly',
    canonicalName: 'Chest Fly (Dumbbell)',
    aliases: ['chest fly (dumbbell)', 'dumbbell fly', 'incline dumbbell fly', 'флайс с дъмбели'],
    primary: ['chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'floor_press',
    canonicalName: 'Floor Press (Barbell)',
    aliases: ['floor press', 'dumbbell floor press', 'преса от пода'],
    primary: ['chest', 'triceps'],
    secondary: ['front_delts'],
  },
  {
    id: 'dumbbell_pullover',
    canonicalName: 'Pullover (Dumbbell)',
    aliases: ['pullover (dumbbell)', 'dumbbell pullover', 'пулоувър с дъмбел'],
    primary: ['lats', 'chest'],
    secondary: ['triceps', 'abs'],
  },

  // ================= BACK / LATS / TRAPS / LOWER BACK =================
  {
    id: 'pull_up',
    canonicalName: 'Pull Up',
    aliases: ['pull up', 'pull-up', 'pullup', 'wide grip pull up', 'набирания', 'набиране'],
    primary: ['lats'],
    secondary: ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
  },
  {
    id: 'weighted_pull_up',
    canonicalName: 'Weighted Pull Up',
    aliases: ['weighted pull up', 'weighted pull-up', 'pull up (weighted)', 'набирания с тежест'],
    primary: ['lats'],
    secondary: ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
  },
  {
    id: 'chin_up',
    canonicalName: 'Chin Up',
    aliases: ['chin up', 'chin-up', 'chinup', 'weighted chin up', 'набирания с подхват'],
    primary: ['lats'],
    secondary: ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
  },
  {
    id: 'assisted_pull_up',
    canonicalName: 'Pull Up (Assisted)',
    aliases: ['pull up (assisted)', 'assisted pull up', 'band assisted pull up', 'асистирани набирания'],
    primary: ['lats'],
    secondary: ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
  },
  {
    id: 'lat_pulldown_wide',
    canonicalName: 'Lat Pulldown (Wide Grip)',
    aliases: ['lat pulldown (wide grip)', 'lat pulldown (cable)', 'lat pulldown', 'wide grip lat pulldown', 'close grip lat pulldown', 'reverse grip lat pulldown', 'single arm lat pulldown', 'вертикален скрипец', 'горен скрипец'],
    primary: ['lats'],
    secondary: ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
  },
  {
    id: 'straight_arm_pulldown',
    canonicalName: 'Straight-Arm Pulldown',
    aliases: ['straight-arm pulldown', 'straight arm pulldown', 'straight arm lat pulldown', 'cable pullover', 'пулоувър на скрипец'],
    primary: ['lats'],
    secondary: ['triceps', 'abs'],
  },
  {
    id: 'barbell_row',
    canonicalName: 'Barbell Row',
    aliases: ['barbell row', 'bent over row (barbell)', 'bent over barbell row', 'pendlay row', 'гребане с щанга'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms', 'lower_back'],
  },
  {
    id: 'dumbbell_row',
    canonicalName: 'Dumbbell Row',
    aliases: ['dumbbell row', 'bent over row (dumbbell)', 'single arm dumbbell row', 'one arm dumbbell row', 'kroc row', 'гребане с дъмбел', 'гребане с дъмбели'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms'],
  },
  {
    id: 'chest_supported_db_row',
    canonicalName: 'Chest Supported Dumbbell Row',
    aliases: ['chest supported dumbbell row', 'chest supported row', 'incline dumbbell row', 'seal row', 'гребане с опора на гърди'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms'],
  },
  {
    id: 'seated_cable_row',
    canonicalName: 'Seated Cable Row',
    aliases: ['seated cable row', 'seated row (cable)', 'cable row', 'seated row (machine)', 'iso-lateral row', 'хоризонтално гребане', 'гребане на скрипец', 'долен скрипец'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms'],
  },
  {
    id: 't_bar_row',
    canonicalName: 'T Bar Row',
    aliases: ['t bar row', 't-bar row', 'meadows row', 'т-бар гребане'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms'],
  },
  {
    id: 'inverted_row',
    canonicalName: 'Inverted Row',
    aliases: ['inverted row', 'australian pull up', 'bodyweight row', 'австралийски набирания', 'обърнато гребане'],
    primary: ['traps_upper_back', 'lats'],
    secondary: ['rear_delts', 'biceps', 'forearms'],
  },
  {
    id: 'muscle_up',
    canonicalName: 'Muscle Up',
    aliases: ['muscle up', 'muscle-up', 'ring muscle up', 'силово възлизане'],
    primary: ['lats', 'chest', 'triceps'],
    secondary: ['biceps', 'front_delts', 'forearms', 'abs'],
  },
  {
    id: 'barbell_shrug',
    canonicalName: 'Shrug (Barbell)',
    aliases: ['shrug (barbell)', 'barbell shrug', 'shrug (dumbbell)', 'dumbbell shrug', 'shrug (smith machine)', 'trap bar shrug', 'повдигане на рамене', 'трапец'],
    primary: ['traps_upper_back'],
    secondary: ['forearms'],
  },
  {
    id: 'back_extension',
    canonicalName: 'Back Extension',
    aliases: ['back extension', 'hyperextension', 'back extension (weighted)', 'хиперекстензии', 'екстензии за кръст'],
    primary: ['lower_back'],
    secondary: ['glutes', 'hamstrings'],
  },
  {
    id: 'good_morning',
    canonicalName: 'Good Morning (Barbell)',
    aliases: ['good morning', 'добро утро'],
    primary: ['lower_back', 'hamstrings'],
    secondary: ['glutes'],
  },
  {
    id: 'rack_pull',
    canonicalName: 'Rack Pull',
    aliases: ['rack pull', 'рак пул'],
    primary: ['lower_back', 'traps_upper_back'],
    secondary: ['glutes', 'hamstrings', 'forearms'],
  },

  // ================= SHOULDERS (РАМЕНЕ) =================
  {
    id: 'overhead_press_barbell',
    canonicalName: 'Overhead Press (Barbell)',
    aliases: ['overhead press (barbell)', 'overhead press', 'standing military press', 'military press', 'ohp', 'военна преса', 'раменна преса с щанга'],
    primary: ['front_delts', 'side_delts'],
    secondary: ['triceps', 'traps_upper_back'],
  },
  {
    id: 'shoulder_press_dumbbell',
    canonicalName: 'Shoulder Press (Dumbbell)',
    aliases: ['shoulder press (dumbbell)', 'seated shoulder press', 'dumbbell shoulder press', 'overhead press (dumbbell)', 'shoulder press (machine)', 'shoulder press', 'раменна преса', 'раменна преса с дъмбели'],
    primary: ['front_delts', 'side_delts'],
    secondary: ['triceps', 'traps_upper_back'],
  },
  {
    id: 'arnold_press',
    canonicalName: 'Arnold Press (Dumbbell)',
    aliases: ['arnold press', 'арнолд преса'],
    primary: ['front_delts', 'side_delts'],
    secondary: ['triceps', 'traps_upper_back'],
  },
  {
    id: 'push_press',
    canonicalName: 'Push Press',
    aliases: ['push press', 'пуш преса'],
    primary: ['front_delts', 'side_delts'],
    secondary: ['triceps', 'quads', 'traps_upper_back'],
  },
  {
    id: 'landmine_press',
    canonicalName: 'Landmine Press',
    aliases: ['landmine press', 'ландмайн преса'],
    primary: ['front_delts', 'chest'],
    secondary: ['triceps', 'abs'],
  },
  {
    id: 'pike_push_up',
    canonicalName: 'Pike Push Up',
    aliases: ['pike push up', 'handstand push up', 'hspu', 'лицеви на стойка на ръце'],
    primary: ['front_delts', 'side_delts'],
    secondary: ['triceps', 'traps_upper_back'],
  },
  {
    id: 'lateral_raise_dumbbell',
    canonicalName: 'Dumbbell Lateral Raise',
    aliases: ['dumbbell lateral raise', 'lateral raise (dumbbell)', 'side lateral raise', 'lateral raise', 'разтваряне встрани', 'разтваряне встрани с дъмбели'],
    primary: ['side_delts'],
    secondary: ['traps_upper_back'],
  },
  {
    id: 'lateral_raise_cable',
    canonicalName: 'Cable Lateral Raise',
    aliases: ['cable lateral raise', 'lateral raise (cable)', 'single arm cable lateral raise', 'разтваряне встрани на скрипец'],
    primary: ['side_delts'],
    secondary: ['traps_upper_back'],
  },
  {
    id: 'lateral_raise_machine',
    canonicalName: 'Lateral Raise (Machine)',
    aliases: ['lateral raise (machine)', 'machine lateral raise', 'разтваряне на машина'],
    primary: ['side_delts'],
    secondary: ['traps_upper_back'],
  },
  {
    id: 'upright_row',
    canonicalName: 'Upright Row (Barbell)',
    aliases: ['upright row', 'вертикално гребане'],
    primary: ['side_delts', 'traps_upper_back'],
    secondary: ['front_delts', 'biceps'],
  },
  {
    id: 'front_raise',
    canonicalName: 'Front Raise (Dumbbell)',
    aliases: ['front raise', 'front plate raise', 'cable front raise', 'повдигане напред'],
    primary: ['front_delts'],
    secondary: ['side_delts'],
  },
  {
    id: 'face_pull',
    canonicalName: 'Face Pull',
    aliases: ['face pull', 'face pull (cable)', 'rope face pull', 'фейс пул', 'въже за задно рамо'],
    primary: ['rear_delts', 'traps_upper_back'],
    secondary: ['biceps'],
  },
  {
    id: 'reverse_fly',
    canonicalName: 'Rear Delt Reverse Fly',
    aliases: ['rear delt reverse fly', 'reverse fly', 'reverse fly (machine)', 'reverse fly (cable)', 'reverse fly (dumbbell)', 'reverse pec deck', 'bent over reverse fly', 'обратен флайс', 'задно рамо'],
    primary: ['rear_delts', 'traps_upper_back'],
    secondary: ['biceps'],
  },
  {
    id: 'band_pull_apart',
    canonicalName: 'Band Pull Apart',
    aliases: ['band pull apart', 'pull apart', 'разтваряне с ластик'],
    primary: ['rear_delts', 'traps_upper_back'],
    secondary: [],
  },

  // ================= BICEPS, TRICEPS, FOREARMS (РЪЦЕ) =================
  {
    id: 'bicep_curl_barbell',
    canonicalName: 'Bicep Curl (Barbell)',
    aliases: ['bicep curl (barbell)', 'barbell curl', 'ez bar biceps curl', 'ez bar curl', 'сгъване с щанга', 'бицепсово сгъване'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'bicep_curl_dumbbell',
    canonicalName: 'Bicep Curl (Dumbbell)',
    aliases: ['bicep curl (dumbbell)', 'dumbbell bicep curl', 'alternating bicep curl', 'bicep curl', 'сгъване с дъмбели', 'сгъване за бицепс'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'incline_dumbbell_curl',
    canonicalName: 'Incline Dumbbell Curl',
    aliases: ['incline dumbbell curl', 'incline curl', 'seated incline curl', 'бицепс на наклонена пейка'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'hammer_curl',
    canonicalName: 'Hammer Curl',
    aliases: ['hammer curl', 'hammer curl (dumbbell)', 'hammer curl (cable)', 'rope hammer curl', 'чуково сгъване'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'preacher_curl',
    canonicalName: 'Preacher Curl',
    aliases: ['preacher curl', 'preacher curl (barbell)', 'preacher curl (dumbbell)', 'preacher curl (machine)', 'скотово сгъване'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'cable_bicep_curl',
    canonicalName: 'Bicep Curl (Cable)',
    aliases: ['bicep curl (cable)', 'cable curl', 'bayesian curl', 'бицепс на скрипец'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'concentration_curl',
    canonicalName: 'Concentration Curl',
    aliases: ['concentration curl', 'spider curl', 'концентрирано сгъване'],
    primary: ['biceps'],
    secondary: ['forearms'],
  },
  {
    id: 'reverse_curl',
    canonicalName: 'Reverse Curl (Barbell)',
    aliases: ['reverse curl', 'reverse bicep curl', 'обратно сгъване'],
    primary: ['forearms', 'biceps'],
    secondary: [],
  },
  {
    id: 'tricep_pushdown',
    canonicalName: 'Tricep Pushdown',
    aliases: ['tricep pushdown', 'triceps pushdown', 'triceps rope pushdown', 'rope pushdown', 'cable pushdown', 'трицепс на скрипец', 'разгъване на скрипец'],
    primary: ['triceps'],
    secondary: [],
  },
  {
    id: 'overhead_tricep_extension',
    canonicalName: 'Overhead Tricep Extension',
    aliases: ['overhead tricep extension', 'triceps extension (cable)', 'triceps extension (dumbbell)', 'overhead triceps extension', 'katana extension', 'разгъване над глава'],
    primary: ['triceps'],
    secondary: [],
  },
  {
    id: 'skullcrusher',
    canonicalName: 'Skullcrusher (Barbell)',
    aliases: ['skullcrusher', 'skull crusher', 'lying tricep extension', 'french press', 'френско разгъване', 'френско'],
    primary: ['triceps'],
    secondary: [],
  },
  {
    id: 'close_grip_bench',
    canonicalName: 'Bench Press - Close Grip (Barbell)',
    aliases: ['close grip bench press', 'bench press - close grip', 'тесен лег'],
    primary: ['triceps', 'chest'],
    secondary: ['front_delts'],
  },
  {
    id: 'tricep_kickback',
    canonicalName: 'Tricep Kickback',
    aliases: ['tricep kickback', 'triceps kickback', 'bench dip', 'кикбек за трицепс'],
    primary: ['triceps'],
    secondary: [],
  },
  {
    id: 'wrist_curl',
    canonicalName: 'Wrist Curl',
    aliases: ['wrist curl', 'reverse wrist curl', 'wrist roller', 'сгъване за предмишници'],
    primary: ['forearms'],
    secondary: [],
  },
  {
    id: 'farmers_walk',
    canonicalName: 'Farmers Walk',
    aliases: ['farmers walk', "farmer's walk", 'farmer carry', 'dead hang', 'фермерска разходка', 'висене на лост'],
    primary: ['forearms'],
    secondary: ['traps_upper_back', 'abs'],
  },

  // ================= LEGS (КРАКА) =================
  {
    id: 'squat_barbell',
    canonicalName: 'Squat (Barbell)',
    aliases: ['squat (barbell)', 'barbell squat', 'back squat', 'high bar squat', 'low bar squat', 'squat', 'клек', 'клек с щанга'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lower_back', 'abs'],
  },
  {
    id: 'front_squat',
    canonicalName: 'Front Squat',
    aliases: ['front squat', 'преден клек'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lower_back', 'abs'],
  },
  {
    id: 'goblet_squat',
    canonicalName: 'Goblet Squat',
    aliases: ['goblet squat', 'squat (dumbbell)', 'гоблет клек'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lower_back', 'abs'],
  },
  {
    id: 'hack_squat',
    canonicalName: 'Hack Squat',
    aliases: ['hack squat', 'pendulum squat', 'squat (smith machine)', 'хакен клек'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings'],
  },
  {
    id: 'leg_press',
    canonicalName: 'Leg Press',
    aliases: ['leg press', 'leg press (machine)', 'horizontal leg press', 'лег преса', 'преса за крака'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lower_back', 'abs'],
  },
  {
    id: 'bulgarian_split_squat',
    canonicalName: 'Bulgarian Split Squat',
    aliases: ['bulgarian split squat', 'split squat', 'български клек'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'lower_back', 'abs'],
  },
  {
    id: 'lunge',
    canonicalName: 'Walking Lunge',
    aliases: ['walking lunge', 'lunge', 'reverse lunge', 'dumbbell lunge', 'barbell lunge', 'step up', 'напади', 'напад'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'calves'],
  },
  {
    id: 'pistol_squat',
    canonicalName: 'Pistol Squat',
    aliases: ['pistol squat', 'sissy squat', 'пистолет клек'],
    primary: ['quads', 'glutes'],
    secondary: ['hamstrings', 'abs'],
  },
  {
    id: 'leg_extension',
    canonicalName: 'Leg Extension',
    aliases: ['leg extension', 'leg extension (machine)', 'бедрено разгъване'],
    primary: ['quads'],
    secondary: [],
  },
  {
    id: 'deadlift_barbell',
    canonicalName: 'Deadlift (Barbell)',
    aliases: ['deadlift (barbell)', 'conventional deadlift', 'deadlift', 'мъртва тяга'],
    primary: ['hamstrings', 'glutes', 'lower_back'],
    secondary: ['traps_upper_back', 'quads', 'forearms'],
  },
  {
    id: 'sumo_deadlift',
    canonicalName: 'Sumo Deadlift',
    aliases: ['sumo deadlift', 'сумо тяга'],
    primary: ['glutes', 'quads', 'hamstrings', 'lower_back'],
    secondary: ['traps_upper_back', 'forearms'],
  },
  {
    id: 'trap_bar_deadlift',
    canonicalName: 'Trap Bar Deadlift',
    aliases: ['trap bar deadlift', 'hex bar deadlift', 'тяга с хекс лост'],
    primary: ['quads', 'glutes', 'hamstrings', 'lower_back'],
    secondary: ['traps_upper_back', 'forearms'],
  },
  {
    id: 'romanian_deadlift',
    canonicalName: 'Romanian Deadlift (RDL)',
    aliases: ['romanian deadlift', 'romanian deadlift (barbell)', 'romanian deadlift (dumbbell)', 'rdl', 'stiff leg deadlift', 'single leg rdl', 'румънска тяга'],
    primary: ['hamstrings', 'glutes'],
    secondary: ['lower_back', 'forearms'],
  },
  {
    id: 'leg_curl_seated',
    canonicalName: 'Seated Leg Curl',
    aliases: ['seated leg curl', 'lying leg curl', 'seated/lying leg curl', 'leg curl', 'nordic hamstring curl', 'бедрено сгъване'],
    primary: ['hamstrings'],
    secondary: ['calves'],
  },
  {
    id: 'hip_thrust',
    canonicalName: 'Hip Thrust',
    aliases: ['hip thrust', 'hip thrust (barbell)', 'hip thrust (machine)', 'glute bridge', 'cable pull through', 'хип тръст', 'глутеус мост'],
    primary: ['glutes'],
    secondary: ['hamstrings'],
  },
  {
    id: 'hip_abduction',
    canonicalName: 'Hip Abduction (Machine)',
    aliases: ['hip abduction', 'glute kickback', 'cable kickback', 'абдуктор'],
    primary: ['glutes'],
    secondary: [],
  },
  {
    id: 'hip_adduction',
    canonicalName: 'Hip Adduction (Machine)',
    aliases: ['hip adduction', 'аддуктор'],
    primary: ['quads'],
    secondary: ['glutes'],
  },
  {
    id: 'calf_raise',
    canonicalName: 'Standing Calf Raise',
    aliases: ['standing calf raise', 'seated calf raise', 'calf press', 'donkey calf raise', 'calf raise', 'прасци', 'повдигане на пръсти'],
    primary: ['calves'],
    secondary: [],
  },

  // ================= CORE / ABS (КОРЕМ) =================
  {
    id: 'hanging_leg_raise',
    canonicalName: 'Hanging Leg Raise',
    aliases: ['hanging leg raise', 'hanging knee raise', 'toes to bar', 'повдигане на крака от вис'],
    primary: ['abs'],
    secondary: ['forearms'],
  },
  {
    id: 'leg_raise_floor',
    canonicalName: 'Lying Leg Raise',
    aliases: ['lying leg raise', "captain's chair leg raise", 'leg raise', 'knee raise', 'повдигане на крака'],
    primary: ['abs'],
    secondary: [],
  },
  {
    id: 'cable_crunch',
    canonicalName: 'Cable Crunch',
    aliases: ['cable crunch', 'crunch', 'crunch (machine)', 'decline crunch', 'sit up', 'bicycle crunch', 'коремни преси', 'крънч'],
    primary: ['abs'],
    secondary: [],
  },
  {
    id: 'plank',
    canonicalName: 'Plank',
    aliases: ['plank', 'side plank', 'weighted plank', 'hollow body hold', 'l-sit', 'планк'],
    primary: ['abs'],
    secondary: [],
  },
  {
    id: 'ab_wheel',
    canonicalName: 'Ab Wheel',
    aliases: ['ab wheel', 'ab rollout', 'dragon flag', 'колело за корем'],
    primary: ['abs'],
    secondary: ['lats', 'triceps'],
  },
  {
    id: 'russian_twist',
    canonicalName: 'Russian Twist',
    aliases: ['russian twist', 'cable twist', 'woodchopper', 'woodchop', 'pallof press', 'mountain climber', 'dead bug', 'руско усукване'],
    primary: ['abs'],
    secondary: [],
  },
];

export type MuscleResolutionSource =
  | 'custom'
  | 'dictionary'
  | 'keyword'
  | 'unrecognized';

export interface ExerciseMuscleResolution {
  exerciseTitle: string;
  primary: DetailedMuscleId[];
  secondary: DetailedMuscleId[];
  primaryLabels: string[];
  secondaryLabels: string[];
  source: MuscleResolutionSource;
  recognized: boolean;
}

export function normalizeExerciseKey(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function dedupeMuscles(
  primary: DetailedMuscleId[],
  secondary: DetailedMuscleId[],
): { primary: DetailedMuscleId[]; secondary: DetailedMuscleId[] } {
  const cleanPrimary = Array.from(
    new Set(primary.filter((m) => VALID_DETAILED_MUSCLE_IDS.has(m))),
  );
  const primarySet = new Set(cleanPrimary);
  const cleanSecondary = Array.from(
    new Set(
      secondary.filter(
        (m) => VALID_DETAILED_MUSCLE_IDS.has(m) && !primarySet.has(m),
      ),
    ),
  );
  return { primary: cleanPrimary, secondary: cleanSecondary };
}

function formatResolution(
  exerciseTitle: string,
  primary: DetailedMuscleId[],
  secondary: DetailedMuscleId[],
  source: MuscleResolutionSource,
): ExerciseMuscleResolution {
  const cleaned = dedupeMuscles(primary, secondary);
  return {
    exerciseTitle,
    primary: cleaned.primary,
    secondary: cleaned.secondary,
    primaryLabels: cleaned.primary.map((id) => MUSCLE_LABEL_15_MAP[id]),
    secondaryLabels: cleaned.secondary.map((id) => MUSCLE_LABEL_15_MAP[id]),
    source,
    recognized: source !== 'unrecognized' && cleaned.primary.length > 0,
  };
}

/**
 * Lookup custom user mapping (supports exact key or case-insensitive normalized match).
 */
export function findCustomExerciseMapping(
  title: string,
  customMappings?: CustomExerciseMappings,
): CustomExerciseMapping | null {
  if (!customMappings) return null;
  if (customMappings[title]) return customMappings[title];
  const norm = normalizeExerciseKey(title);
  if (!norm) return null;
  for (const [k, v] of Object.entries(customMappings)) {
    if (normalizeExerciseKey(k) === norm) {
      return v;
    }
  }
  return null;
}

/**
 * Resolves primary & secondary muscles for any exercise title:
 * 1. User's customExerciseMappings (highest priority)
 * 2. Exact / longest-alias match in the 88-exercise offline dictionary
 * 3. Smart EN + BG keyword heuristics
 * 4. Marks as 'unrecognized' if unknown so UI can prompt manual mapping
 */
export function resolveExerciseMuscles(
  title: string,
  customMappings?: CustomExerciseMappings,
): ExerciseMuscleResolution {
  const cleanTitle = title.trim();
  const norm = normalizeExerciseKey(cleanTitle);

  if (!norm) {
    return formatResolution(cleanTitle, [], [], 'unrecognized');
  }

  // 1. Custom user override
  const custom = findCustomExerciseMapping(cleanTitle, customMappings);
  if (custom && custom.primary.length > 0) {
    return formatResolution(cleanTitle, custom.primary, custom.secondary, 'custom');
  }

  // 2. Exact canonical or longest alias match in EXERCISE_MUSCLE_DICTIONARY
  let bestDictMatch: { entry: ExerciseDictionaryEntry; score: number } | null = null;
  for (const entry of EXERCISE_MUSCLE_DICTIONARY) {
    const canonNorm = normalizeExerciseKey(entry.canonicalName);
    if (canonNorm === norm) {
      return formatResolution(cleanTitle, entry.primary, entry.secondary, 'dictionary');
    }
    for (const alias of entry.aliases) {
      if (norm === alias) {
        return formatResolution(cleanTitle, entry.primary, entry.secondary, 'dictionary');
      }
      if (norm.includes(alias)) {
        // Prevent generic "bench press" from beating "incline bench press", etc., by preferring longest alias match
        const score = alias.length;
        if (!bestDictMatch || score > bestDictMatch.score) {
          bestDictMatch = { entry, score };
        }
      }
    }
  }
  if (bestDictMatch) {
    return formatResolution(
      cleanTitle,
      bestDictMatch.entry.primary,
      bestDictMatch.entry.secondary,
      'dictionary',
    );
  }

  // 3. Smart EN + BG keyword fallback
  if (norm.includes('calf') || norm.includes('прасец') || norm.includes('прасц')) {
    return formatResolution(cleanTitle, ['calves'], [], 'keyword');
  }
  if (norm.includes('romanian') || norm.includes('rdl') || norm.includes('румънск')) {
    return formatResolution(
      cleanTitle,
      ['hamstrings', 'glutes'],
      ['lower_back', 'forearms'],
      'keyword',
    );
  }
  if (norm.includes('deadlift') || norm.includes('мъртва тяга') || norm.includes('тяга')) {
    return formatResolution(
      cleanTitle,
      ['hamstrings', 'glutes', 'lower_back'],
      ['traps_upper_back', 'quads', 'forearms'],
      'keyword',
    );
  }
  if (norm.includes('hamstring') || norm.includes('задно бедро')) {
    return formatResolution(cleanTitle, ['hamstrings'], ['calves'], 'keyword');
  }
  if (norm.includes('glute') || norm.includes('седалищ') || norm.includes('глутеус')) {
    return formatResolution(cleanTitle, ['glutes'], ['hamstrings'], 'keyword');
  }
  if (
    norm.includes('squat') ||
    norm.includes('quad') ||
    norm.includes('клек') ||
    norm.includes('напад') ||
    norm.includes('бедр')
  ) {
    return formatResolution(
      cleanTitle,
      ['quads', 'glutes'],
      ['hamstrings', 'lower_back'],
      'keyword',
    );
  }
  if (norm.includes('rear delt') || norm.includes('задно рамо')) {
    return formatResolution(
      cleanTitle,
      ['rear_delts', 'traps_upper_back'],
      ['biceps'],
      'keyword',
    );
  }
  if (norm.includes('lateral') || norm.includes('средно рамо') || norm.includes('встрани')) {
    return formatResolution(cleanTitle, ['side_delts'], ['traps_upper_back'], 'keyword');
  }
  if (norm.includes('shoulder') || norm.includes('delt') || norm.includes('рамен') || norm.includes('рамо')) {
    return formatResolution(
      cleanTitle,
      ['front_delts', 'side_delts'],
      ['triceps', 'traps_upper_back'],
      'keyword',
    );
  }
  if (norm.includes('tricep') || norm.includes('трицепс') || norm.includes('френско')) {
    return formatResolution(cleanTitle, ['triceps'], [], 'keyword');
  }
  if (norm.includes('bicep') || norm.includes('curl') || norm.includes('бицепс') || norm.includes('сгъване')) {
    return formatResolution(cleanTitle, ['biceps'], ['forearms'], 'keyword');
  }
  if (norm.includes('forearm') || norm.includes('wrist') || norm.includes('предмишниц')) {
    return formatResolution(cleanTitle, ['forearms'], [], 'keyword');
  }
  if (norm.includes('incline') && (norm.includes('press') || norm.includes('bench') || norm.includes('лег'))) {
    return formatResolution(cleanTitle, ['chest', 'front_delts'], ['triceps'], 'keyword');
  }
  if (
    norm.includes('chest') ||
    /\bpecs?\b/.test(norm) ||
    norm.includes('гърди') ||
    norm.includes('лег')
  ) {
    return formatResolution(cleanTitle, ['chest'], ['front_delts', 'triceps'], 'keyword');
  }
  if (
    /\blats?\b/.test(norm) ||
    norm.includes('pulldown') ||
    norm.includes('набира')
  ) {
    return formatResolution(
      cleanTitle,
      ['lats'],
      ['biceps', 'traps_upper_back', 'rear_delts', 'forearms'],
      'keyword',
    );
  }
  if (
    /\brows?\b/.test(norm) ||
    norm.includes('rowing') ||
    norm.includes('гребан') ||
    norm.includes('гръб') ||
    norm.includes('скрипец')
  ) {
    return formatResolution(
      cleanTitle,
      ['traps_upper_back', 'lats'],
      ['rear_delts', 'biceps', 'forearms'],
      'keyword',
    );
  }
  if (/\btraps?\b/.test(norm) || norm.includes('shrug') || norm.includes('трапец')) {
    return formatResolution(cleanTitle, ['traps_upper_back'], ['forearms'], 'keyword');
  }
  if (norm.includes('lower back') || norm.includes('кръст') || norm.includes('екстензи')) {
    return formatResolution(cleanTitle, ['lower_back'], ['glutes', 'hamstrings'], 'keyword');
  }
  if (/\babs?\b/.test(norm) || /\bcore\b/.test(norm) || norm.includes('корем')) {
    const isHanging = norm.includes('hang') || norm.includes('вис');
    return formatResolution(cleanTitle, ['abs'], isHanging ? ['forearms'] : [], 'keyword');
  }

  return formatResolution(cleanTitle, [], [], 'unrecognized');
}

/**
 * Returns unique exercise titles across all workouts that were NOT automatically
 * recognized by dictionary/keywords and do not yet have a custom mapping.
 */
export function findUnrecognizedExercises(
  workouts: HevyWorkout[],
  customMappings?: CustomExerciseMappings,
): string[] {
  const seen = new Set<string>();
  const unrecognized: string[] = [];

  for (const w of workouts) {
    for (const ex of w.exercises) {
      const norm = normalizeExerciseKey(ex.title);
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      const res = resolveExerciseMuscles(ex.title, customMappings);
      if (!res.recognized) {
        unrecognized.push(ex.title.trim());
      }
    }
  }

  return unrecognized.sort((a, b) => a.localeCompare(b));
}

export interface DetailedMuscleVolume15Item {
  id: DetailedMuscleId;
  label: string;
  pattern: 'push' | 'pull' | 'legs' | 'core';
  primarySets: number;
  secondarySets: number;
  effectiveSets: number;
}

export function getWorkingSetsCount(sets: HevySet[]): number {
  const nonWarmup = sets.filter(
    (s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup',
  );
  return nonWarmup.length;
}

function roundHalf(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Computes fractional weekly volume across all 15 muscle groups:
 * 1.0 set for every Primary muscle, 0.5 set for every Secondary muscle.
 */
export function computeDetailedWeeklyEffectiveVolume(params: {
  hevyWorkouts: HevyWorkout[];
  startDate: string;
  endDate: string;
  customExerciseMappings?: CustomExerciseMappings;
}): DetailedMuscleVolume15Item[] {
  const { hevyWorkouts, startDate, endDate, customExerciseMappings } = params;

  const primaryCounter = new Map<DetailedMuscleId, number>();
  const secondaryCounter = new Map<DetailedMuscleId, number>();
  for (const m of MUSCLE_GROUPS_15) {
    primaryCounter.set(m.id, 0);
    secondaryCounter.set(m.id, 0);
  }

  for (const w of hevyWorkouts) {
    if (!w.date || w.date < startDate || w.date > endDate) continue;
    for (const ex of w.exercises) {
      const setsCount = getWorkingSetsCount(ex.sets);
      if (setsCount <= 0) continue;
      const res = resolveExerciseMuscles(ex.title, customExerciseMappings);
      for (const p of res.primary) {
        primaryCounter.set(p, (primaryCounter.get(p) ?? 0) + setsCount);
      }
      for (const s of res.secondary) {
        secondaryCounter.set(s, (secondaryCounter.get(s) ?? 0) + setsCount * 0.5);
      }
    }
  }

  return MUSCLE_GROUPS_15.map((m) => {
    const primarySets = roundHalf(primaryCounter.get(m.id) ?? 0);
    const secondarySets = roundHalf(secondaryCounter.get(m.id) ?? 0);
    return {
      id: m.id,
      label: m.label,
      pattern: m.pattern,
      primarySets,
      secondarySets,
      effectiveSets: roundHalf(primarySets + secondarySets),
    };
  });
}

/**
 * Safely sanitizes `customExerciseMappings` for JSON persistence in `database.json`.
 */
export function sanitizeCustomExerciseMappings(
  raw: unknown,
): CustomExerciseMappings | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const result: CustomExerciseMappings = {};
  let count = 0;

  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    const cleanKey = key.trim().slice(0, 120);
    if (!cleanKey || !val || typeof val !== 'object') continue;
    const obj = val as { primary?: unknown; secondary?: unknown };
    const rawPrimary = Array.isArray(obj.primary) ? obj.primary : [];
    const rawSecondary = Array.isArray(obj.secondary) ? obj.secondary : [];

    const primary = Array.from(
      new Set(
        rawPrimary.filter(
          (id): id is DetailedMuscleId =>
            typeof id === 'string' &&
            VALID_DETAILED_MUSCLE_IDS.has(id as DetailedMuscleId),
        ),
      ),
    );
    if (primary.length === 0) continue;

    const primarySet = new Set(primary);
    const secondary = Array.from(
      new Set(
        rawSecondary.filter(
          (id): id is DetailedMuscleId =>
            typeof id === 'string' &&
            VALID_DETAILED_MUSCLE_IDS.has(id as DetailedMuscleId) &&
            !primarySet.has(id as DetailedMuscleId),
        ),
      ),
    );

    result[cleanKey] = { primary, secondary };
    count += 1;
  }

  return count > 0 ? result : undefined;
}
