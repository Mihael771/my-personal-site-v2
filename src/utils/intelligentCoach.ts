import type {
  CoachAdviceCard,
  CoachAnalysisReport,
  CustomExerciseMappings,
  DailyBiometricLog,
  DayLog,
  HevySet,
  HevyWorkout,
  RelativeStrengthEntry,
  TrainingGoalPhase,
  UserProfile,
  WeeklyMuscleVolumeItem,
  WorkoutEnvironment,
} from '../types/fitness';
import {
  DEFAULT_HABIT_ITEMS,
  computeDailyEnergySummary,
  isDateIncludedForEveningMetric,
  resolveEveningWindowEndDate,
} from './dailyLogs';
import {
  MUSCLE_META_15_MAP,
  findCustomExerciseMapping,
  resolveExerciseMuscles,
} from './exerciseMuscleEngine';
import { calculateEpley1RM } from './hevyProgress';
import {
  DEFAULT_TRAINING_GOAL,
  TRAINING_GOAL_META_MAP,
  WORKOUT_ENVIRONMENT_META_MAP,
  buildAllWorkoutsHiddenPrIndex,
  classifyWorkoutEnvironment,
  evaluateExercisePlateauInEnvironment,
  getEnvironmentProgressionAdvice,
} from './hiddenProgressAndEnvironment';

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100;
}

function formatShortBg(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function shiftDate(dateKey: string, deltaDays: number): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

function daysBetween(dateA: string, dateB: string): number {
  const ma = dateA.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mb = dateB.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!ma || !mb) return 9999;
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((ta - tb) / (24 * 60 * 60 * 1000));
}

function parseWorkoutTs(w: HevyWorkout): number {
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

function isBodyweightExerciseTitle(title: string): boolean {
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
    t.includes('лицеви опори') ||
    t.includes('лицева опора') ||
    t.includes('силово възлизане')
  );
}

interface MuscleClassification {
  groupId: 'chest' | 'shoulders' | 'triceps' | 'back' | 'biceps' | 'legs' | 'core';
  label: string;
  pattern: 'push' | 'pull' | 'legs' | 'core';
}

const MACRO_GROUP_LABELS: Record<MuscleClassification['groupId'], string> = {
  chest: 'Гърди',
  back: 'Гръб',
  shoulders: 'Рамене',
  legs: 'Крака',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  core: 'Корем',
};

export function classifyHevyExerciseMuscle(
  title: string,
  customExerciseMappings?: CustomExerciseMappings,
): MuscleClassification {
  const custom = findCustomExerciseMapping(title, customExerciseMappings);
  if (custom && custom.primary.length > 0) {
    const meta = MUSCLE_META_15_MAP[custom.primary[0]];
    if (meta) {
      return {
        groupId: meta.macroGroupId,
        label: MACRO_GROUP_LABELS[meta.macroGroupId],
        pattern: meta.pattern,
      };
    }
  }

  const t = title.toLowerCase();

  // Legs
  if (
    t.includes('squat') ||
    t.includes('leg press') ||
    t.includes('leg extension') ||
    t.includes('leg curl') ||
    t.includes('lunge') ||
    t.includes('calf') ||
    t.includes('romanian deadlift') ||
    t.includes('rdl') ||
    t.includes('hip thrust') ||
    t.includes('hack squat') ||
    t.includes('bulgarian') ||
    t.includes('glute') ||
    t.includes('hamstring') ||
    t.includes('quad') ||
    t.includes('клек') ||
    t.includes('крака') ||
    t.includes('напад') ||
    t.includes('прасец') ||
    t.includes('бедр')
  ) {
    return { groupId: 'legs', label: 'Крака', pattern: 'legs' };
  }

  // Core / Abs
  if (
    t.includes('crunch') ||
    t.includes('plank') ||
    t.includes('leg raise') ||
    t.includes('knee raise') ||
    t.includes('ab ') ||
    t.includes('abs') ||
    t.includes('russian twist') ||
    t.includes('woodchop') ||
    t.includes('корем') ||
    t.includes('планк')
  ) {
    return { groupId: 'core', label: 'Корем', pattern: 'core' };
  }

  // Pull — Rear delt / Face pull count as pull shoulders/back
  if (
    t.includes('face pull') ||
    t.includes('rear delt') ||
    t.includes('reverse fly') ||
    t.includes('задно рамо')
  ) {
    return { groupId: 'back', label: 'Гръб', pattern: 'pull' };
  }

  // Biceps (Pull)
  if (
    t.includes('bicep') ||
    t.includes('curl') ||
    t.includes('hammer') ||
    t.includes('preacher') ||
    t.includes('бицепс') ||
    t.includes('сгъване')
  ) {
    return { groupId: 'biceps', label: 'Бицепс', pattern: 'pull' };
  }

  // Back (Pull)
  if (
    t.includes('pull up') ||
    t.includes('pull-up') ||
    t.includes('pullup') ||
    t.includes('chin up') ||
    t.includes('chin-up') ||
    t.includes('lat pulldown') ||
    t.includes('pulldown') ||
    t.includes('row') ||
    t.includes('deadlift') ||
    t.includes('shrug') ||
    t.includes('pullover') ||
    t.includes('гръб') ||
    t.includes('набира') ||
    t.includes('гребане') ||
    t.includes('скрипец') ||
    t.includes('мъртва тяга') ||
    t.includes('тяга')
  ) {
    return { groupId: 'back', label: 'Гръб', pattern: 'pull' };
  }

  // Triceps (Push)
  if (
    t.includes('tricep') ||
    t.includes('pushdown') ||
    t.includes('skullcrusher') ||
    t.includes('skull crusher') ||
    t.includes('french press') ||
    t.includes('overhead extension') ||
    t.includes('close grip') ||
    t.includes('трицепс') ||
    t.includes('френско')
  ) {
    return { groupId: 'triceps', label: 'Трицепс', pattern: 'push' };
  }

  // Chest (Push)
  if (
    t.includes('bench') ||
    t.includes('chest') ||
    t.includes('pec') ||
    t.includes('push up') ||
    t.includes('push-up') ||
    t.includes('pushup') ||
    t.includes('dip') ||
    t.includes('incline') ||
    t.includes('decline') ||
    t.includes('fly') ||
    t.includes('гърди') ||
    t.includes('лег') ||
    t.includes('кофичк') ||
    t.includes('лицеви опори') ||
    t.includes('лицева опора') ||
    t.includes('флайс')
  ) {
    return { groupId: 'chest', label: 'Гърди', pattern: 'push' };
  }

  // Shoulders (Push)
  if (
    t.includes('shoulder') ||
    t.includes('overhead press') ||
    t.includes('ohp') ||
    t.includes('military press') ||
    t.includes('arnold press') ||
    t.includes('lateral raise') ||
    t.includes('front raise') ||
    t.includes('upright row') ||
    t.includes('delt') ||
    t.includes('рамо') ||
    t.includes('рамен') ||
    t.includes('разтваряне')
  ) {
    return { groupId: 'shoulders', label: 'Рамене', pattern: 'push' };
  }

  // Generic press -> Push (Chest/Shoulders)
  if (t.includes('press') || t.includes('преса')) {
    return { groupId: 'chest', label: 'Гърди', pattern: 'push' };
  }

  return { groupId: 'back', label: 'Гръб', pattern: 'pull' };
}

function getWorkingSets(sets: HevySet[]): HevySet[] {
  return sets.filter((s) => (s.setType ?? '').trim().toLowerCase() !== 'warmup');
}

function resolveLatestBodyWeight(
  dailyLogsAsc: DailyBiometricLog[],
  legacyLogs: Record<string, DayLog>,
  profile: UserProfile,
): number | null {
  for (let i = dailyLogsAsc.length - 1; i >= 0; i--) {
    const w = dailyLogsAsc[i].weightKg;
    if (w !== undefined && w > 0) return w;
  }

  const legacyDates = Object.keys(legacyLogs).sort();
  for (let i = legacyDates.length - 1; i >= 0; i--) {
    const w = legacyLogs[legacyDates[i]]?.weightKg;
    if (w !== undefined && w > 0) return w;
  }

  if (typeof profile.weightKg === 'number' && profile.weightKg > 0) {
    return profile.weightKg;
  }
  return null;
}

export function generateIntelligentCoachReport(params: {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  habitItems?: string[];
  legacyLogs?: Record<string, DayLog>;
  profile?: UserProfile;
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal?: TrainingGoalPhase;
}): CoachAnalysisReport {
  const {
    hevyWorkouts,
    dailyLogs,
    habitItems = DEFAULT_HABIT_ITEMS,
    legacyLogs = {},
    profile = { name: '', heightCm: '', weightKg: '' },
    todayKey,
    customExerciseMappings,
    trainingGoal = DEFAULT_TRAINING_GOAL,
  } = params;

  const activeGoal: TrainingGoalPhase = trainingGoal ?? DEFAULT_TRAINING_GOAL;
  const goalMeta = TRAINING_GOAL_META_MAP[activeGoal];
  const cards: CoachAdviceCard[] = [];

  const dailyAsc = [...dailyLogs].sort((a, b) => a.date.localeCompare(b.date));
  const workoutsAsc = [...hevyWorkouts].sort(
    (a, b) => parseWorkoutTs(a) - parseWorkoutTs(b),
  );

  const latestBodyWeightKg = resolveLatestBodyWeight(
    dailyAsc,
    legacyLogs,
    profile,
  );

  // =========================================================================
  // 1. Готовност за тренировка (Readiness & Auto-regulation)
  // =========================================================================
  const recent2SleepLogs = dailyAsc
    .filter((d) => d.sleepHours !== undefined)
    .slice(-2);
  const avgSleepLast2d =
    recent2SleepLogs.length > 0
      ? roundOne(
          recent2SleepLogs.reduce((s, d) => s + (d.sleepHours ?? 0), 0) /
            recent2SleepLogs.length,
        )
      : null;

  const recentFreshnessLogs = dailyAsc
    .filter((d) => d.sleepQuality !== undefined)
    .slice(-2);
  const latestFreshness =
    recentFreshnessLogs.length > 0
      ? recentFreshnessLogs[recentFreshnessLogs.length - 1].sleepQuality ?? null
      : null;

  const hrLogs = dailyAsc.filter((d) => d.restingHr !== undefined);
  const latestRestingHr =
    hrLogs.length > 0 ? hrLogs[hrLogs.length - 1].restingHr ?? null : null;
  const baselineHrLogs =
    hrLogs.length >= 3
      ? hrLogs.slice(Math.max(0, hrLogs.length - 8), hrLogs.length - 1)
      : hrLogs.length === 2
        ? [hrLogs[0]]
        : [];
  const avgRestingHr7d =
    baselineHrLogs.length > 0
      ? roundOne(
          baselineHrLogs.reduce((s, d) => s + (d.restingHr ?? 0), 0) /
            baselineHrLogs.length,
        )
      : null;

  const lowSleepTrigger = avgSleepLast2d !== null && avgSleepLast2d < 6.5;
  const lowFreshnessTrigger = latestFreshness !== null && latestFreshness <= 2;
  const highHrTrigger =
    latestRestingHr !== null &&
    avgRestingHr7d !== null &&
    latestRestingHr >= avgRestingHr7d + 5;

  if (lowSleepTrigger || lowFreshnessTrigger || highHrTrigger) {
    const evParts: string[] = [];
    if (recent2SleepLogs.length > 0) {
      evParts.push(
        `Сън: ${recent2SleepLogs.map((d) => `${d.sleepHours}ч`).join(' и ')} (ср. ${avgSleepLast2d}ч)`,
      );
    }
    if (latestFreshness !== null) {
      evParts.push(`Свежест: ${latestFreshness}/5`);
    }
    if (latestRestingHr !== null && avgRestingHr7d !== null) {
      evParts.push(`Пулс: ${latestRestingHr} bpm при средно ${avgRestingHr7d} bpm`);
    }

    cards.push({
      id: 'readiness-reduced',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Готовност (Readiness)',
      title: 'Намалена готовност за възстановяване',
      message:
        'Намалена готовност за възстановяване: днес намали работните тежести с 5–10% или направи лека сесия без отказ.',
      evidence: evParts.join(' | '),
    });
  } else if (
    avgSleepLast2d !== null &&
    avgSleepLast2d >= 7.5 &&
    (latestFreshness === null || latestFreshness >= 4)
  ) {
    const evParts: string[] = [
      `Сън (посл. ${recent2SleepLogs.length} д.): ${recent2SleepLogs.map((d) => `${d.sleepHours}ч`).join(' и ')}`,
    ];
    if (latestFreshness !== null) {
      evParts.push(`Свежест: ${latestFreshness}/5`);
    }
    if (latestRestingHr !== null && avgRestingHr7d !== null) {
      evParts.push(`Пулс: ${latestRestingHr} bpm (ср. ${avgRestingHr7d} bpm)`);
    }
    cards.push({
      id: 'readiness-optimal',
      tier: 'achievement',
      tierLabel: 'Постижения',
      category: 'Готовност (Readiness)',
      title: 'Висока готовност за тежки серии',
      message:
        'Възстановяването е в зелената зона — днес можеш да атакуваш прогресивно натоварване или нови лични рекорди.',
      evidence: evParts.join(' | '),
    });
  }

  // =========================================================================
  // 2. Прогресивно натоварване, Скрит прогрес (Rep/Volume PR) и Застой по среда
  // =========================================================================
  interface ExSessionSummary {
    date: string;
    workoutTitle: string;
    environment: WorkoutEnvironment;
    workingSets: HevySet[];
    maxWeightKg: number;
    e1rm: number;
  }

  const sessionsByExercise = new Map<
    string,
    { title: string; sessions: ExSessionSummary[] }
  >();
  const sessionsByExerciseAndEnv = new Map<
    string,
    { title: string; environment: WorkoutEnvironment; sessions: ExSessionSummary[] }
  >();

  for (const w of workoutsAsc) {
    const env = classifyWorkoutEnvironment(w);
    for (const ex of w.exercises) {
      const key = ex.title.trim().toLowerCase();
      if (!key) continue;
      const workingSets = getWorkingSets(ex.sets);
      let bestE1RM = 0;
      let maxW = 0;
      const isBwLift = isBodyweightExerciseTitle(ex.title);
      for (const s of workingSets.length > 0 ? workingSets : ex.sets) {
        const wt = s.weightKg ?? 0;
        const rp = s.reps ?? 0;
        if (wt > maxW) maxW = wt;
        const load =
          wt > 0
            ? isBwLift && latestBodyWeightKg !== null
              ? latestBodyWeightKg + wt
              : wt
            : isBwLift && latestBodyWeightKg !== null
              ? latestBodyWeightKg
              : 0;
        if (load > 0 && rp > 0) {
          const e = calculateEpley1RM(load, rp);
          if (e > bestE1RM) bestE1RM = e;
        }
      }

      const summary: ExSessionSummary = {
        date: w.date,
        workoutTitle: w.title,
        environment: env,
        workingSets,
        maxWeightKg: maxW,
        e1rm: roundOne(bestE1RM),
      };

      const existing = sessionsByExercise.get(key);
      if (existing) {
        existing.sessions.push(summary);
      } else {
        sessionsByExercise.set(key, { title: ex.title, sessions: [summary] });
      }

      const envKey = `${key}::${env}`;
      const existingEnv = sessionsByExerciseAndEnv.get(envKey);
      if (existingEnv) {
        existingEnv.sessions.push(summary);
      } else {
        sessionsByExerciseAndEnv.set(envKey, {
          title: ex.title,
          environment: env,
          sessions: [summary],
        });
      }
    }
  }

  // Hidden Progress Index (Rep PRs by weight & Session Volume PRs)
  const hiddenPrIndex = buildAllWorkoutsHiddenPrIndex(
    workoutsAsc,
    latestBodyWeightKg,
  );
  const latestAnyWorkoutDate =
    workoutsAsc.length > 0 ? workoutsAsc[workoutsAsc.length - 1].date : todayKey;
  const recentPrCutoff = shiftDate(latestAnyWorkoutDate, -14);
  const recentHiddenPrEvents = hiddenPrIndex.recentEvents.filter(
    (ev) => ev.date >= recentPrCutoff,
  );

  if (recentHiddenPrEvents.length > 0) {
    const topEvents = recentHiddenPrEvents.slice(0, 3);
    const repCount = recentHiddenPrEvents.filter((e) => e.isRepPR).length;
    const volCount = recentHiddenPrEvents.filter((e) => e.isVolumePR).length;
    cards.push({
      id: 'hidden-progress-prs',
      tier: 'achievement',
      tierLabel: 'Постижения',
      category: 'Скрит прогрес (Rep & Volume PR)',
      title: `Скрит прогрес: ${recentHiddenPrEvents.length} ${
        recentHiddenPrEvents.length === 1 ? 'рекорд' : 'рекорда'
      } в последните 14 дни (${repCount} Rep PR · ${volCount} Volume PR)`,
      message:
        'Дори без покачване на максималната тежест, добавените повторения на работна тежест и рекордният сесиен обем доказват реален хипертрофичен прогрес.',
      evidence: topEvents
        .map(
          (e) =>
            `${WORKOUT_ENVIRONMENT_META_MAP[e.environment].emoji} ${e.exerciseTitle} (${formatShortBg(e.date)}): ${e.summaryText}`,
        )
        .join(' | '),
    });
  }

  const readyToProgressList: Array<{
    title: string;
    environment: WorkoutEnvironment;
    currentWeight: number;
    minReps: number;
    evidence: string;
  }> = [];

  const plateauList: Array<{
    title: string;
    environment: WorkoutEnvironment;
    strengthDropPct: number | null;
    evidence: string;
  }> = [];

  const envStrengthDrops: Array<{
    title: string;
    environment: WorkoutEnvironment;
    dropPct: number;
    prevE1RM: number;
    currE1RM: number;
  }> = [];

  const seenProgressTitle = new Set<string>();
  const seenPlateauTitle = new Set<string>();

  for (const { title, environment, sessions } of sessionsByExerciseAndEnv.values()) {
    // Track significant strength drops (> 5%) within the same environment
    if (sessions.length >= 2) {
      const prev = sessions[sessions.length - 2];
      const curr = sessions[sessions.length - 1];
      if (prev.e1rm > 0 && curr.e1rm > 0) {
        const dropPct = roundOne(((curr.e1rm - prev.e1rm) / prev.e1rm) * 100);
        if (dropPct < -5) {
          envStrengthDrops.push({
            title,
            environment,
            dropPct,
            prevE1RM: prev.e1rm,
            currE1RM: curr.e1rm,
          });
        }
      }

      // Check last 2 workouts IN THE SAME ENVIRONMENT for ready-to-progress
      const qualifiesSet = (s: HevySet) => {
        const weightOk = environment === 'gym' ? (s.weightKg ?? 0) > 0 : true;
        return (
          weightOk &&
          (s.reps ?? 0) >= 8 &&
          s.rpe !== undefined &&
          s.rpe <= 8.5
        );
      };

      const prevQualifies =
        prev.workingSets.length > 0 && prev.workingSets.every(qualifiesSet);
      const currQualifies =
        curr.workingSets.length > 0 && curr.workingSets.every(qualifiesSet);

      if (prevQualifies && currQualifies && !seenProgressTitle.has(title)) {
        seenProgressTitle.add(title);
        const currentWeight = curr.maxWeightKg;
        const minReps = Math.min(
          ...prev.workingSets.map((s) => s.reps ?? 0),
          ...curr.workingSets.map((s) => s.reps ?? 0),
        );
        const maxRpe = Math.max(
          ...prev.workingSets.map((s) => s.rpe ?? 0),
          ...curr.workingSets.map((s) => s.rpe ?? 0),
        );
        const envBadge = WORKOUT_ENVIRONMENT_META_MAP[environment].badgeLabel;
        readyToProgressList.push({
          title,
          environment,
          currentWeight,
          minReps,
          evidence: `${envBadge} · Последни 2 сесии (${formatShortBg(prev.date)} и ${formatShortBg(curr.date)}): ${
            currentWeight > 0 ? `${currentWeight} kg` : 'собствено тегло'
          } · мин. ${minReps} повт. · макс RPE ${maxRpe}`,
        });
      }
    }

    // True Plateau evaluation per environment (eliminates false plateaus if Rep PR or Volume PR happened)
    if (sessions.length >= 3 && !seenPlateauTitle.has(title)) {
      const plateauEval = evaluateExercisePlateauInEnvironment({
        workouts: workoutsAsc,
        exerciseTitle: title,
        environment,
        bodyWeightKg: latestBodyWeightKg,
      });

      if (
        plateauEval.strengthDropPct !== null &&
        plateauEval.strengthDropPct < -5 &&
        !envStrengthDrops.some(
          (d) => d.title === title && d.environment === environment,
        )
      ) {
        envStrengthDrops.push({
          title,
          environment,
          dropPct: plateauEval.strengthDropPct,
          prevE1RM: plateauEval.lastThreeE1RMs[0] ?? 0,
          currE1RM: plateauEval.lastThreeE1RMs[2] ?? 0,
        });
      }

      if (plateauEval.isTruePlateau) {
        // In fat_loss phase, maintaining strength (drop <= 5%) is NOT a plateau
        const suppressForFatLoss =
          activeGoal === 'fat_loss' &&
          (plateauEval.strengthDropPct === null ||
            plateauEval.strengthDropPct >= -5);

        if (!suppressForFatLoss) {
          seenPlateauTitle.add(title);
          plateauList.push({
            title,
            environment,
            strengthDropPct: plateauEval.strengthDropPct,
            evidence: plateauEval.evidence,
          });
        }
      }
    }
  }

  for (const prog of readyToProgressList.slice(0, 3)) {
    const advice = getEnvironmentProgressionAdvice({
      exerciseTitle: prog.title,
      environment: prog.environment,
      currentWeightKg: prog.currentWeight,
      minReps: prog.minReps,
    });
    cards.push({
      id: `progress-up-${prog.title}`,
      tier: 'optimization',
      tierLabel: 'Оптимизация',
      category: `Прогресивно натоварване (${WORKOUT_ENVIRONMENT_META_MAP[prog.environment].shortLabel})`,
      title: advice.title,
      message: advice.message,
      evidence: prog.evidence,
    });
  }

  for (const plat of plateauList.slice(0, 3)) {
    const envMeta = WORKOUT_ENVIRONMENT_META_MAP[plat.environment];
    const platMessage =
      plat.environment === 'home'
        ? `В домашни условия „${plat.title}“ няма 1RM PR, Rep PR или Volume PR в 3 поредни сесии. Премини към по-труден вариант, забави спускането до 3 сек. или съкрати почивката.`
        : plat.environment === 'street'
          ? `На лостовете „${plat.title}“ няма 1RM PR, Rep PR или Volume PR в 3 поредни сесии. Включи паузи в горна/долна точка, по-трудна калистеник вариация или леко разтоварване.`
          : `В зала „${plat.title}“ няма 1RM PR, Rep PR или Volume PR в 3 поредни сесии. Смени диапазона повторения (напр. 5–6 за сила или 10–12 за хипертрофия), смени машината/варианта или планирай deload.`;
    cards.push({
      id: `plateau-${plat.title}`,
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: `Застой в силата (${envMeta.shortLabel})`,
      title: `Застой при „${plat.title}“ (3 поредни сесии · ${envMeta.badgeLabel})`,
      message: platMessage,
      evidence: plat.evidence,
    });
  }

  // =========================================================================
  // 3. Относителна сила при упражнения със собствено тегло
  // =========================================================================
  const relativeStrength: RelativeStrengthEntry[] = [];
  if (latestBodyWeightKg !== null) {
    for (const { title } of sessionsByExercise.values()) {
      if (!isBodyweightExerciseTitle(title)) continue;
      let bestEntry: RelativeStrengthEntry | null = null;

      for (const w of workoutsAsc) {
        for (const ex of w.exercises) {
          if (ex.title.trim().toLowerCase() !== title.trim().toLowerCase()) {
            continue;
          }
          for (const s of ex.sets) {
            const reps = s.reps ?? 0;
            if (reps <= 0) continue;
            const addedWeightKg = Math.max(0, s.weightKg ?? 0);
            const totalLoadKg = roundOne(latestBodyWeightKg + addedWeightKg);
            const realTotal1RM = calculateEpley1RM(totalLoadKg, reps);
            const ratio = roundTwo(realTotal1RM / latestBodyWeightKg);

            if (!bestEntry || realTotal1RM > bestEntry.realTotal1RM) {
              bestEntry = {
                exerciseTitle: title,
                date: w.date,
                bodyWeightKg: latestBodyWeightKg,
                addedWeightKg,
                totalLoadKg,
                reps,
                realTotal1RM,
                strengthToWeightRatio: ratio,
              };
            }
          }
        }
      }

      if (bestEntry) {
        relativeStrength.push(bestEntry);
      }
    }

    relativeStrength.sort(
      (a, b) => b.strengthToWeightRatio - a.strengthToWeightRatio,
    );

    if (relativeStrength.length > 0) {
      const top = relativeStrength[0];
      cards.push({
        id: 'relative-strength-highlight',
        tier: 'achievement',
        tierLabel: 'Постижения',
        category: 'Относителна сила',
        title: `Относителна сила при „${top.exerciseTitle}“: ${top.strengthToWeightRatio.toFixed(2)}× теглото`,
        message:
          'Комбинираното телесно тегло и добавената тежест дават точната оценка на реалния 1RM и съотношението сила/тегло.',
        evidence: `Тегло: ${top.bodyWeightKg} kg + Добавена: ${top.addedWeightKg} kg = ${top.totalLoadKg} kg × ${top.reps} повт. | Реален 1RM: ${top.realTotal1RM} kg | Коефициент: ${top.strengthToWeightRatio.toFixed(2)}×`,
      });
    }
  } else {
    const hasBwExercise = Array.from(sessionsByExercise.values()).some((item) =>
      isBodyweightExerciseTitle(item.title),
    );
    if (hasBwExercise) {
      cards.push({
        id: 'relative-strength-missing-weight',
        tier: 'optimization',
        tierLabel: 'Оптимизация',
        category: 'Относителна сила',
        title: 'Добави телесно тегло за оценка на упражненията със собствено тегло',
        message:
          'Имаш импортирани упражнения със собствено тегло (набирания, кофички, лицеви опори). Запиши сутрешното си тегло в „Дневен чек-ин“, за да изчислим реалния общ 1RM и коефициента сила/тегло.',
        evidence: 'Липсва записано телесно тегло в dailyLogs или профила',
      });
    }
  }

  // =========================================================================
  // 4. Корелация Хранене ↔ Тегло ↔ Сила
  // =========================================================================
  const weightLogs = dailyAsc.filter(
    (d) => d.weightKg !== undefined && d.weightKg > 0,
  );
  let avgWeightRecent7d: number | null = null;
  let avgWeightPrev7d: number | null = null;
  let weightWeeklyChangePct: number | null = null;

  if (weightLogs.length >= 2) {
    const latestWeightDate = weightLogs[weightLogs.length - 1].date;
    const recentStart = shiftDate(latestWeightDate, -6);
    const prevStart = shiftDate(latestWeightDate, -13);
    const prevEnd = shiftDate(latestWeightDate, -7);

    const recentWindow = weightLogs.filter(
      (d) => d.date >= recentStart && d.date <= latestWeightDate,
    );
    const prevWindow = weightLogs.filter(
      (d) => d.date >= prevStart && d.date <= prevEnd,
    );

    if (recentWindow.length > 0 && prevWindow.length > 0) {
      avgWeightRecent7d = roundTwo(
        recentWindow.reduce((s, d) => s + (d.weightKg ?? 0), 0) /
          recentWindow.length,
      );
      avgWeightPrev7d = roundTwo(
        prevWindow.reduce((s, d) => s + (d.weightKg ?? 0), 0) / prevWindow.length,
      );
      if (avgWeightPrev7d > 0) {
        weightWeeklyChangePct = roundTwo(
          ((avgWeightRecent7d - avgWeightPrev7d) / avgWeightPrev7d) * 100,
        );
      }
    }
  }

  // Check if main exercises' 1RM is stagnating or dropping
  const multiSessionExercises = Array.from(sessionsByExercise.values())
    .filter((item) => item.sessions.length >= 2 && item.sessions[item.sessions.length - 1].e1rm > 0)
    .sort((a, b) => b.sessions.length - a.sessions.length)
    .slice(0, 4);

  const stalledMainExercises = multiSessionExercises.filter((item) => {
    const prev = item.sessions[item.sessions.length - 2];
    const curr = item.sessions[item.sessions.length - 1];
    return curr.e1rm <= prev.e1rm;
  });

  if (
    weightWeeklyChangePct !== null &&
    weightWeeklyChangePct < -0.8 &&
    multiSessionExercises.length > 0 &&
    stalledMainExercises.length >= Math.ceil(multiSessionExercises.length / 2)
  ) {
    const sampleStalled = stalledMainExercises[0];
    const prevS = sampleStalled.sessions[sampleStalled.sessions.length - 2];
    const currS = sampleStalled.sessions[sampleStalled.sessions.length - 1];
    cards.push({
      id: 'nutrition-weight-strength-drop',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Хранене ↔ Тегло ↔ Сила',
      title: 'Риск от загуба на мускулна маса — увеличи калориите (+250 kcal)',
      message:
        '7-дневната средна на теглото пада с над 0.8% седмично, докато 1RM на основните упражнения стагнира или спада. Добави +250 kcal дневно за защита на чистата маса.',
      evidence: `Ср. тегло: ${avgWeightPrev7d} kg → ${avgWeightRecent7d} kg (${weightWeeklyChangePct}% / седм.) | 1RM стагнация: ${sampleStalled.title} ${prevS.e1rm} → ${currS.e1rm} kg`,
    });
  }

  // Protein check: threshold adapts to active goal phase (1.6 g/kg hypertrophy, 1.8 g/kg maintenance/fat_loss)
  const proteinLogs = dailyAsc
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'protein'))
    .slice(-5);
  let avgProteinLast5d: number | null = null;
  let avgProteinPerKgLast5d: number | null = null;
  const proteinThreshold = goalMeta.proteinThresholdGPerKg;

  if (proteinLogs.length > 0) {
    avgProteinLast5d = roundOne(
      proteinLogs.reduce((s, d) => s + (d.proteinGrams ?? 0), 0) /
        proteinLogs.length,
    );
    if (latestBodyWeightKg !== null && latestBodyWeightKg > 0) {
      avgProteinPerKgLast5d = roundTwo(avgProteinLast5d / latestBodyWeightKg);
      if (avgProteinPerKgLast5d < proteinThreshold) {
        const targetGrams = Math.round(proteinThreshold * latestBodyWeightKg);
        const deficitGrams = Math.max(1, Math.round(targetGrams - avgProteinLast5d));
        cards.push({
          id: 'protein-deficit',
          tier: 'critical',
          tierLabel: 'Критични / Внимание',
          category: `Прием на протеин (${goalMeta.shortLabel})`,
          title: `Протеинов дефицит: добави +${deficitGrams} g/ден`,
          message: `В режим „${goalMeta.label}“ средният прием на протеин е под целевия праг от ${proteinThreshold.toFixed(1)} g/kg. Увеличи дневния прием с поне ${deficitGrams} g за оптимален мускулен синтез и възстановяване.`,
          evidence: `Ср. протеин (посл. ${proteinLogs.length} д.): ${avgProteinLast5d} g/ден (${avgProteinPerKgLast5d} g/kg при ${latestBodyWeightKg} kg) | Цел ${proteinThreshold.toFixed(1)} g/kg: ${targetGrams} g/ден → Дефицит: -${deficitGrams} g`,
        });
      }
    }
  }

  // =========================================================================
  // 4.5 Реален калориен баланс, проверка на метаболизма и NEAT (крачки)
  // =========================================================================
  // Incomplete or 0 values for today are excluded so mid-day check-ins never
  // distort 4-day / 7-day averages; stats anchor to yesterday until today has > 0.
  const validStepsLogs = dailyAsc.filter((d) =>
    isDateIncludedForEveningMetric(d, todayKey, 'steps'),
  );
  const latestStepsDate =
    validStepsLogs.length > 0
      ? validStepsLogs[validStepsLogs.length - 1].date
      : todayKey;
  const resolvedStepsEnd = resolveEveningWindowEndDate(dailyAsc, todayKey, 'steps');
  const stepsAnchorDate =
    validStepsLogs.length > 0 &&
    Math.abs(daysBetween(resolvedStepsEnd, latestStepsDate)) > 7
      ? latestStepsDate
      : resolvedStepsEnd;
  const stepsStart7d = shiftDate(stepsAnchorDate, -6);

  const stepsVals7d = validStepsLogs
    .filter((d) => d.date >= stepsStart7d && d.date <= stepsAnchorDate)
    .map((d) => d.steps as number);
  const avgSteps7d =
    stepsVals7d.length > 0
      ? Math.round(stepsVals7d.reduce((a, b) => a + b, 0) / stepsVals7d.length)
      : null;

  const stepsLogs4d = validStepsLogs.slice(-4);
  const avgSteps4d =
    stepsLogs4d.length > 0
      ? Math.round(
          stepsLogs4d.reduce((a, d) => a + (d.steps ?? 0), 0) / stepsLogs4d.length,
        )
      : null;

  const yesterdayKey = shiftDate(todayKey, -1);
  const steps24hCandidates = dailyAsc
    .filter(
      (d) =>
        (d.date === todayKey || d.date === yesterdayKey) &&
        d.steps !== undefined &&
        d.steps > 0,
    )
    .map((d) => d.steps ?? 0);
  const latestSteps24h =
    steps24hCandidates.length > 0 ? Math.max(...steps24hCandidates) : null;

  const validEnergyLogs = dailyAsc.filter(
    (d) =>
      isDateIncludedForEveningMetric(d, todayKey, 'caloriesIntake') ||
      isDateIncludedForEveningMetric(d, todayKey, 'activeCalories') ||
      isDateIncludedForEveningMetric(d, todayKey, 'tdee'),
  );
  const latestEnergyDate =
    validEnergyLogs.length > 0
      ? validEnergyLogs[validEnergyLogs.length - 1].date
      : todayKey;
  const resolvedEnergyEnd = resolveEveningWindowEndDate(
    dailyAsc,
    todayKey,
    'energy',
  );
  const energyAnchorDate =
    validEnergyLogs.length > 0 &&
    Math.abs(daysBetween(resolvedEnergyEnd, latestEnergyDate)) > 7
      ? latestEnergyDate
      : resolvedEnergyEnd;
  const energyStart7d = shiftDate(energyAnchorDate, -6);

  const recent7dLogs = validEnergyLogs.filter(
    (d) => d.date >= energyStart7d && d.date <= energyAnchorDate,
  );

  const activeCalVals7d: number[] = [];
  const tdeeVals7d: number[] = [];
  const balanceVals7d: number[] = [];
  const intakeVals7d: number[] = [];

  for (const log of recent7dLogs) {
    const refW = log.weightKg ?? latestBodyWeightKg;
    const includeIntake = isDateIncludedForEveningMetric(
      log,
      todayKey,
      'caloriesIntake',
    );
    const includeActive = isDateIncludedForEveningMetric(
      log,
      todayKey,
      'activeCalories',
    );
    const includeTdee = isDateIncludedForEveningMetric(log, todayKey, 'tdee');

    const summary = computeDailyEnergySummary({
      caloriesIntake: includeIntake ? log.caloriesKcal : undefined,
      activeCalories: includeActive ? log.activeCalories : undefined,
      restingCalories: includeTdee ? log.restingCalories : undefined,
      weightKg: refW,
      heightCm: profile.heightCm,
    });
    if (includeActive && summary.activeCalories !== null) {
      activeCalVals7d.push(summary.activeCalories);
    }
    if (includeTdee && summary.tdee !== null) {
      tdeeVals7d.push(summary.tdee);
    }
    if (includeIntake && summary.caloriesIntake !== null) {
      intakeVals7d.push(summary.caloriesIntake);
    }
    if (includeIntake && includeTdee && summary.netBalance !== null) {
      balanceVals7d.push(summary.netBalance);
    }
  }

  const avgActiveCalories7d =
    activeCalVals7d.length > 0
      ? Math.round(
          activeCalVals7d.reduce((a, b) => a + b, 0) / activeCalVals7d.length,
        )
      : null;
  const avgTdee7d =
    tdeeVals7d.length > 0
      ? Math.round(tdeeVals7d.reduce((a, b) => a + b, 0) / tdeeVals7d.length)
      : null;
  const avgCaloricBalance7d =
    balanceVals7d.length > 0
      ? Math.round(
          balanceVals7d.reduce((a, b) => a + b, 0) / balanceVals7d.length,
        )
      : null;
  const avgIntake7d =
    intakeVals7d.length > 0
      ? Math.round(
          intakeVals7d.reduce((a, b) => a + b, 0) / intakeVals7d.length,
        )
      : null;

  // Check 1: Persistent caloric deficit (<= -250 kcal/day) but 7-day average weight hasn't dropped over 2 weeks
  if (
    balanceVals7d.length >= 3 &&
    avgCaloricBalance7d !== null &&
    avgCaloricBalance7d <= -250 &&
    weightWeeklyChangePct !== null &&
    weightWeeklyChangePct > -0.15
  ) {
    cards.push({
      id: 'metabolism-deficit-stall',
      tier: 'optimization',
      tierLabel: 'Оптимизация',
      category: 'Калориен баланс и метаболизъм',
      title: 'Постоянен дефицит без спад в теглото (2 седмици)',
      message:
        'Отчиташ постоянен калориен дефицит, но 7-дневното средно телесно тегло не спада вече 2 седмици. Провери за възможно подценяване на приетите калории (масла, сосове, течности) или адаптивно забавяне на метаболизма и NEAT.',
      evidence: `7-дн. баланс: ${avgCaloricBalance7d} kcal/ден (Прием: ${avgIntake7d ?? '—'} vs TDEE: ${avgTdee7d ?? '—'} kcal) | Ср. тегло: ${avgWeightPrev7d} → ${avgWeightRecent7d} kg (${weightWeeklyChangePct > 0 ? '+' : ''}${weightWeeklyChangePct}%)`,
    });
  }

  // Check 2: Severe deficit (< -750 kcal/day) AND 1RM in Hevy starts dropping
  const droppingMainExercises = multiSessionExercises.filter((item) => {
    const prev = item.sessions[item.sessions.length - 2];
    const curr = item.sessions[item.sessions.length - 1];
    return curr.e1rm < prev.e1rm;
  });

  if (
    avgCaloricBalance7d !== null &&
    avgCaloricBalance7d < -750 &&
    droppingMainExercises.length > 0
  ) {
    const sampleDrop = droppingMainExercises[0];
    const prevS = sampleDrop.sessions[sampleDrop.sessions.length - 2];
    const currS = sampleDrop.sessions[sampleDrop.sessions.length - 1];
    cards.push({
      id: 'severe-deficit-muscle-loss',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Калориен баланс ↔ Сила',
      title: `Риск от загуба на мускулна маса (дефицит ${avgCaloricBalance7d} kcal/ден)`,
      message:
        'Калорийният дефицит надвишава -750 kcal/ден и 1RM в Hevy започва да пада. Препоръчително е веднага да вдигнеш калориите с +300–400 kcal/ден (основно въглехидрати около тренировката), за да защитиш мускулната маса.',
      evidence: `7-дн. баланс: ${avgCaloricBalance7d} kcal/ден (Прием: ${avgIntake7d ?? '—'} vs TDEE: ${avgTdee7d ?? '—'} kcal) | Спад 1RM: ${sampleDrop.title} ${prevS.e1rm} → ${currS.e1rm} kg`,
    });
  }

  // Check 3: NEAT monitoring (4-day average steps < 6,000)
  if (stepsLogs4d.length >= 2 && avgSteps4d !== null && avgSteps4d < 6000) {
    const isLosingWeight =
      activeGoal === 'fat_loss' ||
      (avgCaloricBalance7d !== null && avgCaloricBalance7d < -150) ||
      (weightWeeklyChangePct !== null && weightWeeklyChangePct < -0.1);
    cards.push({
      id: 'neat-steps-drop',
      tier: isLosingWeight ? 'critical' : 'optimization',
      tierLabel: isLosingWeight ? 'Критични / Внимание' : 'Оптимизация',
      category: 'Ежедневна активност (NEAT)',
      title: `Спад в ежедневната активност (NEAT): средно ${avgSteps4d.toLocaleString('bg-BG')} крачки/ден`,
      message: `Спад в ежедневната активност (NEAT): средно ${avgSteps4d.toLocaleString('bg-BG')} крачки/ден. Добави 20-минутна разходка, за да поддържаш разхода на енергия.${
        isLosingWeight
          ? ' При сваляне на тегло тялото несъзнателно намалява движението извън залата.'
          : ''
      }`,
      evidence: `Последни ${stepsLogs4d.length} дни: ${stepsLogs4d
        .map((d) => `${formatShortBg(d.date)}: ${(d.steps ?? 0).toLocaleString('bg-BG')}`)
        .join(' · ')} (праг ≥ 6 000)`,
    });
  }

  // =========================================================================
  // 4.6 Оценка спрямо избрания Режим на целта (Хипертрофия / Поддържане / Сваляне)
  // =========================================================================
  const weeklyWeightDeltaKg =
    avgWeightRecent7d !== null && avgWeightPrev7d !== null
      ? roundTwo(avgWeightRecent7d - avgWeightPrev7d)
      : null;

  if (activeGoal === 'hypertrophy') {
    if (
      weightWeeklyChangePct !== null &&
      Math.abs(weightWeeklyChangePct) <= 0.15 &&
      (avgCaloricBalance7d === null || avgCaloricBalance7d > -250)
    ) {
      cards.push({
        id: 'goal-hypertrophy-flat-weight',
        tier: 'optimization',
        tierLabel: 'Оптимизация',
        category: 'Режим: Хипертрофия (Качване)',
        title: 'Теглото стои на едно място 2 седмици — добави +200 kcal/ден',
        message:
          'За стабилно покачване на мускулна маса целта е лек калориен излишък (+100 до +300 kcal/ден). Увеличи дневния прием с +200 kcal (основно въглехидрати около тренировката) и запази протеина ≥ 1.6 g/kg.',
        evidence: `Ср. тегло: ${avgWeightPrev7d} → ${avgWeightRecent7d} kg (${weightWeeklyChangePct > 0 ? '+' : ''}${weightWeeklyChangePct}%/седм.)${
          avgCaloricBalance7d !== null
            ? ` | 7-дн. баланс: ${avgCaloricBalance7d > 0 ? '+' : ''}${avgCaloricBalance7d} kcal/ден`
            : ''
        }`,
      });
    }
  } else if (activeGoal === 'maintenance') {
    const weightStable =
      weeklyWeightDeltaKg !== null && Math.abs(weeklyWeightDeltaKg) <= 0.25;
    const hasStrengthGain =
      recentHiddenPrEvents.length > 0 ||
      multiSessionExercises.some((item) => {
        const prev = item.sessions[item.sessions.length - 2];
        const curr = item.sessions[item.sessions.length - 1];
        return curr.e1rm > prev.e1rm;
      });

    if (weightStable && hasStrengthGain) {
      const topRel = relativeStrength[0];
      cards.push({
        id: 'goal-maintenance-recomp',
        tier: 'achievement',
        tierLabel: 'Постижения',
        category: 'Режим: Поддържане / Рекомпозиция',
        title: 'Успешна телесна рекомпозиция — силата расте при стабилно тегло',
        message:
          'Теглото ти остава в целевия коридор (±0.25 kg/седм.), докато качваш повторения/сила. Това е класически знак за паралелно изграждане на мускул и подобряване на относителната сила (1RM/BW).',
        evidence: `Ср. тегло: ${avgWeightPrev7d} → ${avgWeightRecent7d} kg (${weeklyWeightDeltaKg > 0 ? '+' : ''}${weeklyWeightDeltaKg} kg/седм.) | Скрити PR: ${recentHiddenPrEvents.length}${
          topRel
            ? ` | Топ 1RM/BW: ${topRel.exerciseTitle} ${topRel.strengthToWeightRatio.toFixed(2)}×`
            : ''
        }`,
      });
    } else if (weeklyWeightDeltaKg !== null && Math.abs(weeklyWeightDeltaKg) > 0.25) {
      const driftingUp = weeklyWeightDeltaKg > 0.25;
      cards.push({
        id: 'goal-maintenance-weight-drift',
        tier: 'optimization',
        tierLabel: 'Оптимизация',
        category: 'Режим: Поддържане / Рекомпозиция',
        title: driftingUp
          ? `Теглото се покачва над коридора (+${weeklyWeightDeltaKg} kg/седм.)`
          : `Теглото пада под коридора (${weeklyWeightDeltaKg} kg/седм.)`,
        message: driftingUp
          ? 'В режим Поддържане / Рекомпозиция целта е стабилност (±0.25 kg/седм.). Намали приема с ~150–200 kcal или добави 2 000 крачки дневно, като пазиш протеина ≥ 1.8 g/kg.'
          : 'Теглото спада по-бързо от коридора ±0.25 kg/седм. Добави ~150–200 kcal дневно и запази протеина ≥ 1.8 g/kg за качествена рекомпозиция.',
        evidence: `Ср. тегло: ${avgWeightPrev7d} → ${avgWeightRecent7d} kg (${weeklyWeightDeltaKg > 0 ? '+' : ''}${weeklyWeightDeltaKg} kg/седм.)`,
      });
    }
  } else if (activeGoal === 'fat_loss') {
    if (envStrengthDrops.length > 0) {
      const worst = [...envStrengthDrops].sort((a, b) => a.dropPct - b.dropPct)[0];
      cards.push({
        id: 'goal-fat-loss-strength-drop',
        tier: 'critical',
        tierLabel: 'Критични / Внимание',
        category: 'Режим: Сваляне на мазнини',
        title: `Спад на силата над 5% в дефицит (${worst.title}: ${worst.dropPct}%)`,
        message:
          'При сваляне на мазнини спад в силата над 5% сигнализира за прекален дефицит или твърде висок обем. Намали дефицита с +200–300 kcal или намали работните серии с 20–30%, но запази тежестите на щангата високи.',
        evidence: `${WORKOUT_ENVIRONMENT_META_MAP[worst.environment].badgeLabel} · ${worst.title}: 1RM ${worst.prevE1RM} → ${worst.currE1RM} kg (${worst.dropPct}%)${
          weightWeeklyChangePct !== null
            ? ` | Тегло: ${weightWeeklyChangePct}%/седм.`
            : ''
        }`,
      });
    } else if (
      weightWeeklyChangePct !== null &&
      weightWeeklyChangePct <= -0.3 &&
      weightWeeklyChangePct >= -0.8 &&
      workoutsAsc.length > 0
    ) {
      cards.push({
        id: 'goal-fat-loss-muscle-preserved',
        tier: 'achievement',
        tierLabel: 'Постижения',
        category: 'Режим: Сваляне на мазнини',
        title: '🏆 Успешно запазване на силата и мускулите в дефицит',
        message:
          'Теглото спада в идеалния темп (0.3–0.8%/седм.), докато задържаш работните тежести и повторенията си без спад на силата над 5%. Продължавай по същия план и пази протеина ≥ 1.8 g/kg.',
        evidence: `Ср. тегло: ${avgWeightPrev7d} → ${avgWeightRecent7d} kg (${weightWeeklyChangePct}%/седм.) | Без спад на 1RM > 5%${
          avgCaloricBalance7d !== null
            ? ` | 7-дн. баланс: ${avgCaloricBalance7d} kcal/ден`
            : ''
        }`,
      });
    }
  }

  // =========================================================================
  // 5. Седмичен обем, Push/Pull баланс и Кардио конфликти
  // =========================================================================
  const latestWorkoutDate =
    workoutsAsc.length > 0 ? workoutsAsc[workoutsAsc.length - 1].date : '';
  const volumeAnchorDate =
    latestWorkoutDate && Math.abs(daysBetween(todayKey, latestWorkoutDate)) > 14
      ? latestWorkoutDate
      : todayKey;
  const volumeWindowStart = shiftDate(volumeAnchorDate, -6);

  const volumeCounter: Record<
    MuscleClassification['groupId'],
    {
      label: string;
      pattern: MuscleClassification['pattern'];
      primarySets: number;
      secondarySets: number;
    }
  > = {
    chest: { label: 'Гърди', pattern: 'push', primarySets: 0, secondarySets: 0 },
    back: { label: 'Гръб', pattern: 'pull', primarySets: 0, secondarySets: 0 },
    shoulders: { label: 'Рамене', pattern: 'push', primarySets: 0, secondarySets: 0 },
    legs: { label: 'Крака', pattern: 'legs', primarySets: 0, secondarySets: 0 },
    biceps: { label: 'Бицепс', pattern: 'pull', primarySets: 0, secondarySets: 0 },
    triceps: { label: 'Трицепс', pattern: 'push', primarySets: 0, secondarySets: 0 },
    core: { label: 'Корем', pattern: 'core', primarySets: 0, secondarySets: 0 },
  };

  let pushSets7d = 0;
  let pullSets7d = 0;
  let totalSets7d = 0;

  for (const w of workoutsAsc) {
    if (!w.date || w.date < volumeWindowStart || w.date > volumeAnchorDate) {
      continue;
    }
    for (const ex of w.exercises) {
      const working = getWorkingSets(ex.sets);
      const count = working.length;
      if (count === 0) continue;

      const cls = classifyHevyExerciseMuscle(ex.title, customExerciseMappings);
      const res = resolveExerciseMuscles(ex.title, customExerciseMappings);

      if (res.recognized && res.primary.length > 0) {
        const primaryMacros = new Set(
          res.primary.map((id) => MUSCLE_META_15_MAP[id].macroGroupId),
        );
        const secondaryMacros = new Set(
          res.secondary
            .map((id) => MUSCLE_META_15_MAP[id].macroGroupId)
            .filter((g) => !primaryMacros.has(g)),
        );
        for (const macro of primaryMacros) {
          volumeCounter[macro].primarySets += count;
        }
        for (const macro of secondaryMacros) {
          volumeCounter[macro].secondarySets += count * 0.5;
        }
      } else {
        volumeCounter[cls.groupId].primarySets += count;
      }

      totalSets7d += count;
      if (cls.pattern === 'push') pushSets7d += count;
      if (cls.pattern === 'pull') pullSets7d += count;
    }
  }

  const weeklyVolume: WeeklyMuscleVolumeItem[] = Object.entries(volumeCounter).map(
    ([groupId, data]) => {
      const primarySets = roundOne(data.primarySets);
      const secondarySets = roundOne(data.secondarySets);
      const effectiveSets = roundOne(primarySets + secondarySets);
      return {
        groupId,
        label: data.label,
        pattern: data.pattern,
        sets: effectiveSets,
        primarySets,
        secondarySets,
        effectiveSets,
        status:
          effectiveSets < 6 ? 'low' : effectiveSets <= 18 ? 'optimal' : 'high',
      };
    },
  );

  if (totalSets7d > 0) {
    const laggingGroups = weeklyVolume.filter(
      (g) => g.groupId !== 'core' && g.effectiveSets < 6,
    );
    if (laggingGroups.length > 0) {
      cards.push({
        id: 'weekly-volume-lagging',
        tier: 'optimization',
        tierLabel: 'Оптимизация',
        category: 'Седмичен обем (10–18 серии)',
        title: `Изоставащи мускулни групи (< 6 ефективни серии за 7 дни)`,
        message: `Следните мускулни групи са под минимума от 6 ефективни серии (1.0 основни + 0.5 второстепенни) за последните 7 дни (оптимална зона: 10–18 серии): ${laggingGroups.map((g) => g.label).join(', ')}.`,
        evidence: `Период ${formatShortBg(volumeWindowStart)}–${formatShortBg(volumeAnchorDate)}: ${laggingGroups.map((g) => `${g.label}: ${g.effectiveSets} сер.`).join(' · ')}`,
      });
    }
  }

  const maxPushPull = Math.max(pushSets7d, pullSets7d);
  const pushPullDiffPercent =
    maxPushPull > 0
      ? Math.round((Math.abs(pushSets7d - pullSets7d) / maxPushPull) * 100)
      : null;

  if (
    pushPullDiffPercent !== null &&
    pushPullDiffPercent > 35 &&
    maxPushPull >= 6
  ) {
    const dominant = pushSets7d > pullSets7d ? 'Бутащите' : 'Дърпащите';
    const weaker = pushSets7d > pullSets7d ? 'дърпащи (Гръб / Бицепс)' : 'бутащи (Гърди / Рамене / Трицепс)';
    cards.push({
      id: 'push-pull-imbalance',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Push / Pull баланс',
      title: `Дисбаланс Бутащи / Дърпащи (${pushPullDiffPercent}% разлика)`,
      message: `${dominant} упражнения превишават с над 35% обема през последните 7 дни. Добави повече ${weaker} серии за стабилност на раменете и стойката.`,
      evidence: `Бутащи: ${pushSets7d} серии vs Дърпащи: ${pullSets7d} серии (разлика ${pushPullDiffPercent}% при праг 35%)`,
    });
  }

  // Cardio >= 6 km within 24h before or after a Hevy leg workout
  const legWorkouts = workoutsAsc.filter((w) =>
    w.exercises.some(
      (ex) => classifyHevyExerciseMuscle(ex.title, customExerciseMappings).groupId === 'legs',
    ),
  );
  const longCardioDays = dailyAsc.filter(
    (d) => (d.cardioDistanceKm ?? 0) >= 6,
  );

  const cardioConflicts: Array<{
    cardioDate: string;
    distanceKm: number;
    workoutDate: string;
    workoutTitle: string;
  }> = [];

  for (const cardio of longCardioDays) {
    for (const legW of legWorkouts) {
      if (!legW.date) continue;
      if (Math.abs(daysBetween(cardio.date, legW.date)) <= 1) {
        cardioConflicts.push({
          cardioDate: cardio.date,
          distanceKm: cardio.cardioDistanceKm ?? 0,
          workoutDate: legW.date,
          workoutTitle: legW.title,
        });
      }
    }
  }

  if (cardioConflicts.length > 0) {
    const latestConflict = cardioConflicts[cardioConflicts.length - 1];
    cards.push({
      id: 'cardio-leg-conflict',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Кардио ↔ Крака конфликт',
      title: 'Наслагване на умората в краката (Кардио ≥ 6 km близо до тренировка за крака)',
      message:
        'Дълго бягане/кардио (≥ 6 km) в рамките на 24 часа преди или след тежка тренировка за крака забавя възстановяването на квадрицепсите и задното бедро. Раздели ги с поне 36–48 часа.',
      evidence: `Кардио: ${latestConflict.distanceKm} km (${formatShortBg(latestConflict.cardioDate)}) ↔ Hevy „${latestConflict.workoutTitle}“ (${formatShortBg(latestConflict.workoutDate)})`,
    });
  }

  // High steps (> 14,000) within 24h of a Hevy leg workout
  const highStepsDays = dailyAsc.filter((d) => (d.steps ?? 0) > 14000);
  const highStepLegConflicts: Array<{
    stepsDate: string;
    steps: number;
    workoutDate: string;
    workoutTitle: string;
  }> = [];

  for (const stepDay of highStepsDays) {
    for (const legW of legWorkouts) {
      if (!legW.date) continue;
      if (Math.abs(daysBetween(stepDay.date, legW.date)) <= 1) {
        highStepLegConflicts.push({
          stepsDate: stepDay.date,
          steps: stepDay.steps ?? 0,
          workoutDate: legW.date,
          workoutTitle: legW.title,
        });
      }
    }
  }

  if (highStepLegConflicts.length > 0) {
    const latestStepConflict =
      highStepLegConflicts[highStepLegConflicts.length - 1];
    cards.push({
      id: 'high-steps-leg-recovery',
      tier: 'critical',
      tierLabel: 'Критични / Внимание',
      category: 'Крачки ↔ Възстановяване на краката',
      title: 'Над 14 000 крачки близо до тренировка за крака',
      message:
        'Високият обем ходене (> 14 000 крачки) в рамките на 24 часа от тежка тренировка за крака увеличава умората в прасците и бедрата. Предвиди +12 часа за възстановяване или намали сериите за крака днес.',
      evidence: `Крачки: ${latestStepConflict.steps.toLocaleString('bg-BG')} (${formatShortBg(latestStepConflict.stepsDate)}) ↔ Hevy „${latestStepConflict.workoutTitle}“ (${formatShortBg(latestStepConflict.workoutDate)})`,
    });
  }

  // =========================================================================
  // 6. Влияние на навиците и добавките (missed >= 3 of last 5 completed days)
  // =========================================================================
  const last5Daily = dailyAsc
    .filter((d) => isDateIncludedForEveningMetric(d, todayKey, 'habits'))
    .slice(-5);
  if (last5Daily.length >= 3 && habitItems.length > 0) {
    const keyHabits = habitItems.filter((h) => {
      const l = h.toLowerCase();
      return (
        l.includes('вода') ||
        l.includes('креатин') ||
        l.includes('добав') ||
        l.includes('витамин') ||
        l.includes('магнез') ||
        l.includes('омега') ||
        l.includes('протеин') ||
        l.includes('water') ||
        l.includes('creatine') ||
        l.includes('supplement')
      );
    });
    const inspectedHabits = keyHabits.length > 0 ? keyHabits : habitItems;

    const missedDetails: Array<{ habit: string; missed: number; total: number }> = [];
    for (const habit of inspectedHabits) {
      const target = habit.trim().toLowerCase();
      let completedCount = 0;
      for (const day of last5Daily) {
        if (
          day.completedHabits.some((c) => c.trim().toLowerCase() === target)
        ) {
          completedCount += 1;
        }
      }
      const missedCount = last5Daily.length - completedCount;
      if (missedCount >= 3) {
        missedDetails.push({
          habit,
          missed: missedCount,
          total: last5Daily.length,
        });
      }
    }

    if (missedDetails.length > 0) {
      cards.push({
        id: 'habits-supplements-missed',
        tier: 'optimization',
        tierLabel: 'Оптимизация',
        category: 'Навици и добавки',
        title: 'Пропуснат прием на вода / добавки в ≥ 3 от последните 5 дни',
        message:
          'Редовната хидратация и приемът на креатин/добавки пряко подобряват клетъчния обем, напомпването по време на тренировка и междусерийното възстановяване.',
        evidence: missedDetails
          .map((m) => `„${m.habit}“ пропуснат ${m.missed} от ${m.total} дни`)
          .join(' | '),
      });
    } else if (last5Daily.length === 5) {
      cards.push({
        id: 'habits-consistency-strong',
        tier: 'achievement',
        tierLabel: 'Постижения',
        category: 'Навици и добавки',
        title: 'Последователност при водата и добавките',
        message:
          'Поддържаш стабилен прием на ключовите добавки и хидратация през последните 5 записани дни.',
        evidence: inspectedHabits
          .map((habit) => {
            const done = last5Daily.filter((d) =>
              d.completedHabits.some(
                (c) => c.trim().toLowerCase() === habit.trim().toLowerCase(),
              ),
            ).length;
            return `„${habit}“: ${done}/5 дни`;
          })
          .join(' | '),
      });
    }
  }

  // Sort cards by priority: critical -> optimization -> achievement
  const tierOrder: Record<CoachAdviceCard['tier'], number> = {
    critical: 0,
    optimization: 1,
    achievement: 2,
  };
  cards.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);

  return {
    cards,
    relativeStrength,
    weeklyVolume,
    pushSets7d,
    pullSets7d,
    pushPullDiffPercent,
    latestBodyWeightKg,
    avgWeightRecent7d,
    avgWeightPrev7d,
    weightWeeklyChangePct,
    avgProteinLast5d,
    avgProteinPerKgLast5d,
    avgRestingHr7d,
    latestRestingHr,
    avgSleepLast2d,
    avgSteps4d,
    avgSteps7d,
    avgActiveCalories7d,
    avgTdee7d,
    avgCaloricBalance7d,
    latestSteps24h,
    trainingGoal: activeGoal,
    recentHiddenPrCount: recentHiddenPrEvents.length,
  };
}
