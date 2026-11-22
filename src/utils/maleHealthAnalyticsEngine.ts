import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  DetailedMuscleId,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import {
  getWorkingSetsCount,
  resolveExerciseMuscles,
} from './exerciseMuscleEngine';
import {
  formatBgNumericDate,
  isValidDateKey,
  shiftDateKey,
} from './fitnessMath';
import {
  extractDailyWeightSamples,
  isBoxingWorkout,
  resolveWeightForDate,
} from './relativeStrengthAndBiorhythm';

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((acc, n) => acc + n, 0) / nums.length;
}

function stdDev(nums: number[]): number | null {
  if (nums.length < 2) return null;
  const mean = average(nums);
  if (mean === null) return null;
  const variance =
    nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

// ============================================================================
// МОДУЛ 2: 📈 Хипертрофиен обем (MEV / MAV / MRV тракер)
// ============================================================================

export type HypertrophyVolumeZone =
  | 'below_mev'
  | 'optimal_mev_mav'
  | 'near_mrv'
  | 'above_mrv';

export interface HypertrophyMuscleGroupRow {
  id: string;
  label: string;
  primarySets: number;
  secondarySets: number;
  effectiveSets: number;
  mev: number;
  mavHigh: number;
  mrv: number;
  zone: HypertrophyVolumeZone;
  zoneLabel: string;
  zoneAdvice: string;
}

export interface HypertrophyVolumeCoachSignal {
  severity: 'alert' | 'caution' | 'optimal' | 'no_data';
  headline: string;
  detail: string;
}

export interface HypertrophyVolumeReport {
  windowStartDate: string;
  windowEndDate: string;
  todayDate: string;
  strengthWorkoutsCount: number;
  excludedBoxingCount: number;
  totalEffectiveSets: number;
  groups: HypertrophyMuscleGroupRow[];
  belowMevGroups: HypertrophyMuscleGroupRow[];
  optimalGroups: HypertrophyMuscleGroupRow[];
  nearMrvGroups: HypertrophyMuscleGroupRow[];
  aboveMrvGroups: HypertrophyMuscleGroupRow[];
  coachSignal: HypertrophyVolumeCoachSignal;
}

interface HypertrophyGroupSpec {
  id: string;
  label: string;
  muscles: DetailedMuscleId[];
  mev: number;
  mavHigh: number;
  mrv: number;
}

const HYPERTROPHY_GROUP_SPECS: HypertrophyGroupSpec[] = [
  { id: 'chest', label: 'Гърди', muscles: ['chest'], mev: 6, mavHigh: 18, mrv: 20 },
  {
    id: 'back',
    label: 'Гръб (Lats / Горен)',
    muscles: ['lats', 'traps_upper_back'],
    mev: 6,
    mavHigh: 18,
    mrv: 20,
  },
  {
    id: 'shoulders',
    label: 'Рамене (Предно/Средно/Задно)',
    muscles: ['front_delts', 'side_delts', 'rear_delts'],
    mev: 6,
    mavHigh: 18,
    mrv: 20,
  },
  { id: 'biceps', label: 'Бицепс', muscles: ['biceps'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'triceps', label: 'Трицепс', muscles: ['triceps'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'quads', label: 'Квадрицепс', muscles: ['quads'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'hamstrings', label: 'Задно бедро', muscles: ['hamstrings'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'glutes', label: 'Седалище', muscles: ['glutes'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'calves', label: 'Прасци', muscles: ['calves'], mev: 6, mavHigh: 18, mrv: 20 },
  { id: 'abs', label: 'Корем', muscles: ['abs'], mev: 6, mavHigh: 18, mrv: 20 },
];

export function classifyHypertrophyZone(sets: number): {
  zone: HypertrophyVolumeZone;
  zoneLabel: string;
  zoneAdvice: string;
} {
  if (sets > 20) {
    return {
      zone: 'above_mrv',
      zoneLabel: 'Над MRV (> 20)',
      zoneAdvice:
        'Риск от претоварване — празен обем, който вдига кортизола и краде от възстановяването.',
    };
  }
  if (sets > 18) {
    return {
      zone: 'near_mrv',
      zoneLabel: 'Близо до MRV (18–20)',
      zoneAdvice:
        'Горна граница на адаптивния обем — следи съня и ставите преди да добавяш още серии.',
    };
  }
  if (sets >= 6) {
    return {
      zone: 'optimal_mev_mav',
      zoneLabel: 'Оптимална зона (MEV–MAV)',
      zoneAdvice: 'Оптимална зона (6–18 серии) за чиста хипертрофия и прогресия.',
    };
  }
  return {
    zone: 'below_mev',
    zoneLabel: 'Под MEV (< 6)',
    zoneAdvice:
      'Под минималния праг за растеж — добави 2–4 качествени работни серии през седмицата.',
  };
}

/**
 * Модул 2: Изчислява седмичния хипертрофиен обем (MEV / MAV / MRV)
 * за последните 7 завършени дни (до ВЧЕРА) без боксовите сесии,
 * с дробно броене: 1.0 за основен мускул, 0.5 за второстепенен.
 */
export function analyzeHypertrophyVolumeZones(params: {
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
}): HypertrophyVolumeReport {
  const { hevyWorkouts, todayKey, customExerciseMappings } = params;
  const windowEndDate = shiftDateKey(todayKey, -1);
  const windowStartDate = shiftDateKey(todayKey, -7);

  const windowWorkouts = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      w.date >= windowStartDate &&
      w.date <= windowEndDate,
  );

  let excludedBoxingCount = 0;
  const strengthWorkouts: HevyWorkout[] = [];
  for (const w of windowWorkouts) {
    if (isBoxingWorkout(w)) {
      excludedBoxingCount += 1;
    } else {
      strengthWorkouts.push(w);
    }
  }

  const primaryByGroup = new Map<string, number>();
  const secondaryByGroup = new Map<string, number>();
  for (const spec of HYPERTROPHY_GROUP_SPECS) {
    primaryByGroup.set(spec.id, 0);
    secondaryByGroup.set(spec.id, 0);
  }

  for (const workout of strengthWorkouts) {
    for (const ex of workout.exercises) {
      const workingSets = getWorkingSetsCount(ex.sets);
      if (workingSets <= 0) continue;

      const resolved = resolveExerciseMuscles(ex.title, customExerciseMappings);
      const primarySet = new Set<DetailedMuscleId>(resolved.primary);
      const secondarySet = new Set<DetailedMuscleId>(resolved.secondary);

      for (const spec of HYPERTROPHY_GROUP_SPECS) {
        const hitsPrimary = spec.muscles.some((m) => primarySet.has(m));
        if (hitsPrimary) {
          primaryByGroup.set(
            spec.id,
            (primaryByGroup.get(spec.id) ?? 0) + workingSets,
          );
          continue;
        }
        const hitsSecondary = spec.muscles.some((m) => secondarySet.has(m));
        if (hitsSecondary) {
          secondaryByGroup.set(
            spec.id,
            (secondaryByGroup.get(spec.id) ?? 0) + workingSets * 0.5,
          );
        }
      }
    }
  }

  const groups: HypertrophyMuscleGroupRow[] = HYPERTROPHY_GROUP_SPECS.map(
    (spec) => {
      const primarySets = round1(primaryByGroup.get(spec.id) ?? 0);
      const secondarySets = round1(secondaryByGroup.get(spec.id) ?? 0);
      const effectiveSets = round1(primarySets + secondarySets);
      const classified = classifyHypertrophyZone(effectiveSets);
      return {
        id: spec.id,
        label: spec.label,
        primarySets,
        secondarySets,
        effectiveSets,
        mev: spec.mev,
        mavHigh: spec.mavHigh,
        mrv: spec.mrv,
        zone: classified.zone,
        zoneLabel: classified.zoneLabel,
        zoneAdvice: classified.zoneAdvice,
      };
    },
  );

  const belowMevGroups = groups.filter((g) => g.zone === 'below_mev');
  const optimalGroups = groups.filter((g) => g.zone === 'optimal_mev_mav');
  const nearMrvGroups = groups.filter((g) => g.zone === 'near_mrv');
  const aboveMrvGroups = groups.filter((g) => g.zone === 'above_mrv');
  const totalEffectiveSets = round1(
    groups.reduce((acc, g) => acc + g.effectiveSets, 0),
  );

  let coachSignal: HypertrophyVolumeCoachSignal;
  if (strengthWorkouts.length === 0) {
    coachSignal = {
      severity: 'no_data',
      headline: 'Няма записани силови тренировки през последните 7 завършени дни',
      detail: `За периода ${formatBgNumericDate(windowStartDate)} – ${formatBgNumericDate(windowEndDate)} няма силови сесии в Hevy (извън бокса), по които да се оцени MEV/MAV/MRV.`,
    };
  } else if (aboveMrvGroups.length > 0 && belowMevGroups.length > 0) {
    const overNames = aboveMrvGroups
      .map((g) => `${g.label} (${g.effectiveSets} сер.)`)
      .join(', ');
    const underNames = belowMevGroups
      .slice(0, 3)
      .map((g) => `${g.label} (${g.effectiveSets} сер.)`)
      .join(', ');
    coachSignal = {
      severity: 'alert',
      headline: `Дисбаланс на обема: ${aboveMrvGroups.length} над MRV и ${belowMevGroups.length} под MEV`,
      detail: `Над MRV (>20 сер., риск от кортизол/претоварване): ${overNames}. Пренасочи 3–4 серии към изоставащите под MEV (<6 сер.): ${underNames}.`,
    };
  } else if (aboveMrvGroups.length > 0) {
    const overNames = aboveMrvGroups
      .map((g) => `${g.label} (${g.effectiveSets} сер.)`)
      .join(', ');
    coachSignal = {
      severity: 'alert',
      headline: `Над MRV (>20 серии): ${aboveMrvGroups.map((g) => g.label).join(', ')}`,
      detail: `Отчетени са ${overNames} за последните 7 завършени дни. Намали днешния обем за тези групи, за да избегнеш празен обем и скок на кортизола.`,
    };
  } else if (belowMevGroups.length > 0) {
    const underNames = belowMevGroups
      .slice(0, 4)
      .map((g) => `${g.label} (${g.effectiveSets} сер.)`)
      .join(', ');
    coachSignal = {
      severity: 'caution',
      headline: `${belowMevGroups.length} мускулни групи са под MEV (<6 серии)`,
      detail: `Изостават за хипертрофия през последните 7 дни: ${underNames}. Приоритизирай ги в днешната или следващата силова сесия.`,
    };
  } else {
    coachSignal = {
      severity: 'optimal',
      headline: 'Всички мускулни групи са в продуктивната зона MEV–MAV',
      detail: `Отличен седмичен баланс (${totalEffectiveSets} ефективни серии в ${strengthWorkouts.length} силови тренировки) без празен обем над MRV.`,
    };
  }

  return {
    windowStartDate,
    windowEndDate,
    todayDate: todayKey,
    strengthWorkoutsCount: strengthWorkouts.length,
    excludedBoxingCount,
    totalEffectiveSets,
    groups,
    belowMevGroups,
    optimalGroups,
    nearMrvGroups,
    aboveMrvGroups,
    coachSignal,
  };
}

// ============================================================================
// МОДУЛ 3: 🌙 Архитектура на съня и нощен анаболен пик
// ============================================================================

export type SleepStageStatus = 'optimal' | 'borderline' | 'low' | 'no_data';

export interface SleepStageSnapshot {
  date: string | null;
  totalSleepHours: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
  deepPct: number | null;
  remPct: number | null;
  deepStatus: SleepStageStatus;
  remStatus: SleepStageStatus;
}

export interface SleepArchitectureReport {
  windowStartDate: string;
  windowEndDate: string;
  todayDate: string;
  hasStageData: boolean;
  daysWithStages7d: number;
  lastNight: SleepStageSnapshot;
  avg7d: {
    avgTotalSleepHours: number | null;
    avgDeepMinutes: number | null;
    avgRemMinutes: number | null;
    avgDeepPct: number | null;
    avgRemPct: number | null;
    deepStatus: SleepStageStatus;
    remStatus: SleepStageStatus;
  };
  overallStatus: SleepStageStatus;
  todayImpactHeadline: string;
  muscleSynthesisNote: string;
  boxingReflexNote: string;
}

function classifyDeepPct(pct: number | null): SleepStageStatus {
  if (pct === null) return 'no_data';
  if (pct >= 18) return 'optimal';
  if (pct >= 14) return 'borderline';
  return 'low';
}

function classifyRemPct(pct: number | null): SleepStageStatus {
  if (pct === null) return 'no_data';
  if (pct >= 20) return 'optimal';
  if (pct >= 16) return 'borderline';
  return 'low';
}

function computeSnapshotFromLog(log: DailyBiometricLog | null): SleepStageSnapshot {
  if (!log) {
    return {
      date: null,
      totalSleepHours: null,
      deepMinutes: null,
      remMinutes: null,
      deepPct: null,
      remPct: null,
      deepStatus: 'no_data',
      remStatus: 'no_data',
    };
  }

  const totalSecs =
    typeof log.sleepHours === 'number' && log.sleepHours > 0
      ? log.sleepHours * 3600
      : null;
  const deepSecs =
    typeof log.deepSleepSecs === 'number' && log.deepSleepSecs > 0
      ? log.deepSleepSecs
      : null;
  const remSecs =
    typeof log.remSleepSecs === 'number' && log.remSleepSecs > 0
      ? log.remSleepSecs
      : null;

  const deepPct =
    deepSecs !== null && totalSecs !== null && totalSecs > 0
      ? round1(clamp((deepSecs / totalSecs) * 100, 0, 100))
      : null;
  const remPct =
    remSecs !== null && totalSecs !== null && totalSecs > 0
      ? round1(clamp((remSecs / totalSecs) * 100, 0, 100))
      : null;

  return {
    date: log.date,
    totalSleepHours:
      typeof log.sleepHours === 'number' && log.sleepHours > 0
        ? round1(log.sleepHours)
        : null,
    deepMinutes: deepSecs !== null ? Math.round(deepSecs / 60) : null,
    remMinutes: remSecs !== null ? Math.round(remSecs / 60) : null,
    deepPct,
    remPct,
    deepStatus: classifyDeepPct(deepPct),
    remStatus: classifyRemPct(remPct),
  };
}

/**
 * Модул 3: Архитектура на съня (Deep >= 18–20%, REM >= 20%)
 * Последна нощ + средно за последните 7 завършени дни (до ВЧЕРА).
 */
export function analyzeSleepArchitecture(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): SleepArchitectureReport {
  const { dailyLogs, todayKey } = params;
  const windowEndDate = shiftDateKey(todayKey, -1);
  const windowStartDate = shiftDateKey(todayKey, -7);

  const byDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    if (isValidDateKey(log.date)) byDate.set(log.date, log);
  }

  // Последната нощ: ако днешният утринен сън вече е синхронизиран от часовника с фази,
  // ползваме него; иначе последния наличен запис с фази до вчера (или вчерашния запис).
  const todayLog = byDate.get(todayKey) ?? null;
  const yesterdayLog = byDate.get(windowEndDate) ?? null;

  const hasStages = (l: DailyBiometricLog | null | undefined): boolean =>
    Boolean(
      l &&
        ((typeof l.deepSleepSecs === 'number' && l.deepSleepSecs > 0) ||
          (typeof l.remSleepSecs === 'number' && l.remSleepSecs > 0)),
    );

  let lastNightLog: DailyBiometricLog | null = null;
  if (hasStages(todayLog)) {
    lastNightLog = todayLog;
  } else if (hasStages(yesterdayLog)) {
    lastNightLog = yesterdayLog;
  } else {
    // Check last 7 completed days for most recent stage record
    for (let d = 1; d <= 7; d++) {
      const candidate = byDate.get(shiftDateKey(todayKey, -d));
      if (hasStages(candidate)) {
        lastNightLog = candidate ?? null;
        break;
      }
    }
    if (!lastNightLog) {
      lastNightLog =
        todayLog && typeof todayLog.sleepHours === 'number'
          ? todayLog
          : yesterdayLog;
    }
  }

  const lastNight = computeSnapshotFromLog(lastNightLog);

  // 7-day completed window (up to yesterday)
  const totalHoursList: number[] = [];
  const deepMinsList: number[] = [];
  const remMinsList: number[] = [];
  const deepPctList: number[] = [];
  const remPctList: number[] = [];
  let daysWithStages7d = 0;

  for (let d = 1; d <= 7; d++) {
    const log = byDate.get(shiftDateKey(todayKey, -d));
    if (!log) continue;
    const snap = computeSnapshotFromLog(log);
    if (snap.totalSleepHours !== null) totalHoursList.push(snap.totalSleepHours);
    if (snap.deepMinutes !== null) deepMinsList.push(snap.deepMinutes);
    if (snap.remMinutes !== null) remMinsList.push(snap.remMinutes);
    if (snap.deepPct !== null) deepPctList.push(snap.deepPct);
    if (snap.remPct !== null) remPctList.push(snap.remPct);
    if (snap.deepPct !== null || snap.remPct !== null) {
      daysWithStages7d += 1;
    }
  }

  const avgTotalSleepHours =
    totalHoursList.length > 0 ? round1(average(totalHoursList)!) : null;
  const avgDeepMinutes =
    deepMinsList.length > 0 ? Math.round(average(deepMinsList)!) : null;
  const avgRemMinutes =
    remMinsList.length > 0 ? Math.round(average(remMinsList)!) : null;
  const avgDeepPct =
    deepPctList.length > 0 ? round1(average(deepPctList)!) : null;
  const avgRemPct = remPctList.length > 0 ? round1(average(remPctList)!) : null;

  const avgDeepStatus = classifyDeepPct(avgDeepPct);
  const avgRemStatus = classifyRemPct(avgRemPct);

  const hasStageData =
    lastNight.deepPct !== null ||
    lastNight.remPct !== null ||
    daysWithStages7d > 0;

  const refDeepPct = lastNight.deepPct ?? avgDeepPct;
  const refRemPct = lastNight.remPct ?? avgRemPct;
  const refDeepStatus = classifyDeepPct(refDeepPct);
  const refRemStatus = classifyRemPct(refRemPct);

  let overallStatus: SleepStageStatus = 'no_data';
  if (hasStageData) {
    if (refDeepStatus === 'low' || refRemStatus === 'low') {
      overallStatus = 'low';
    } else if (refDeepStatus === 'optimal' && refRemStatus === 'optimal') {
      overallStatus = 'optimal';
    } else {
      overallStatus = 'borderline';
    }
  }

  let todayImpactHeadline: string;
  let muscleSynthesisNote: string;
  let boxingReflexNote: string;

  if (!hasStageData) {
    todayImpactHeadline =
      'Изчаква данни за фазите на съня (Deep и REM) от смарт часовника';
    muscleSynthesisNote =
      'При следваща синхронизация с Intervals.icu (Huawei Watch GT 6) системата автоматично ще изчисли дела на Дълбокия сън (цел ≥ 18–20%) за растежния хормон и сутрешния пик на тестостерона.';
    boxingReflexNote =
      'REM фазата (цел ≥ 20%) ще оцени възстановяването на централната нервна система, тайминга и остротата на реакциите ти в бокса.';
  } else {
    if (overallStatus === 'optimal') {
      todayImpactHeadline =
        'Пълен нощен анаболен пик — отлична среда за сила и остри реакции днес';
    } else if (overallStatus === 'borderline') {
      todayImpactHeadline =
        'Частично нощно възстановяване — едната фаза на съня е под оптимума';
    } else {
      todayImpactHeadline =
        'Потиснат нощен анаболен пик — нервната система и тъканите имат нужда от по-разумно темпо днес';
    }

    if (refDeepPct === null) {
      muscleSynthesisNote =
        'Часовникът не е подал Дълбок сън за последната нощ — следи общата продължителност ≥ 7.5 ч.';
    } else if (refDeepPct >= 18) {
      muscleSynthesisNote = `Дълбок сън ${refDeepPct}% (цел ≥ 18–20%): силен нощен пулс на растежен хормон и сутрешен пик на тестостерона — днес мускулният синтез и възстановяването на влакната работят на максимум.`;
    } else if (refDeepPct >= 14) {
      muscleSynthesisNote = `Дълбок сън ${refDeepPct}% (леко под 18%): базовият белтъчен синтез е активен, но при тежък обем днес заложи на чиста техника и ранно лягане без екрани/алкохол довечера.`;
    } else {
      muscleSynthesisNote = `Дълбок сън ${refDeepPct}% (< 14%): намален нощен пулс на растежен хормон и по-слаб тестостеронов пик днес — избягвай отказ на всяка серия и осигури 18–19°C в спалнята довечера.`;
    }

    if (refRemPct === null) {
      boxingReflexNote =
        'Няма подаден REM сън — прецени остротата на реакциите по сутрешната си свежест.';
    } else if (refRemPct >= 20) {
      boxingReflexNote = `REM сън ${refRemPct}% (цел ≥ 20%): ЦНС е напълно рестартирана — очаквай бързи рефлекси, остър тайминг и чисти комбинации при бокс/спаринг днес.`;
    } else if (refRemPct >= 16) {
      boxingReflexNote = `REM сън ${refRemPct}% (леко под 20%): моторната координация е стабилна, но при спаринг/тежка техника загрей по-дълго с работа с крака и защитни движения.`;
    } else {
      boxingReflexNote = `REM сън ${refRemPct}% (< 16%): по-бавна невронна реакция днес — при бокс предпочитай технична работа на чувал/лапи пред тежък спаринг и удължи последните 2 часа сън сутрин.`;
    }
  }

  return {
    windowStartDate,
    windowEndDate,
    todayDate: todayKey,
    hasStageData,
    daysWithStages7d,
    lastNight,
    avg7d: {
      avgTotalSleepHours,
      avgDeepMinutes,
      avgRemMinutes,
      avgDeepPct,
      avgRemPct,
      deepStatus: avgDeepStatus,
      remStatus: avgRemStatus,
    },
    overallStatus,
    todayImpactHeadline,
    muscleSynthesisNote,
    boxingReflexNote,
  };
}

// ============================================================================
// МОДУЛ 4: ❤️ Съдово и кардио-метаболитно здраве (Индекс от GT 6)
// ============================================================================

export type CardioVascularZone = 'optimal' | 'good' | 'caution' | 'no_data';

export interface CardioVascularHealthReport {
  window7dStart: string;
  window30dStart: string;
  windowEndDate: string;
  todayDate: string;
  hasData: boolean;
  score: number; // 0..100
  zone: CardioVascularZone;
  zoneLabel: string;
  rhr: {
    avg7d: number | null;
    avg30d: number | null;
    deltaBpm: number | null; // avg7d - avg30d (negative is better)
    score: number | null;
    summary: string;
  };
  hrv: {
    avg7d: number | null;
    avg30d: number | null;
    deltaPct: number | null;
    cv7dPct: number | null; // lower = more stable
    score: number | null;
    summary: string;
  };
  cardiacEfficiency: {
    avg7dMetersPerBeat: number | null;
    avg30dMetersPerBeat: number | null;
    trendPct: number | null;
    avgActivityHr30d: number | null;
    activitiesCount30d: number;
    score: number | null;
    summary: string;
  };
  effects: {
    musclePumpAndNutrients: string;
    boxingRoundRecovery: string;
    longTermHeartHealth: string;
  };
}

function computeActivityMetersPerBeat(act: {
  distance?: number;
  moving_time?: number;
  average_heartrate?: number;
}): number | null {
  if (
    typeof act.distance !== 'number' ||
    typeof act.moving_time !== 'number' ||
    typeof act.average_heartrate !== 'number' ||
    act.distance < 300 ||
    act.moving_time < 300 ||
    act.average_heartrate < 70
  ) {
    return null;
  }
  const minutes = act.moving_time / 60;
  const metersPerMin = act.distance / minutes;
  // meters per heartbeat = (m/min) / (beats/min)
  return metersPerMin / act.average_heartrate;
}

/**
 * Модул 4: Дългосрочен кардио-метаболитен и съдов индекс (0–100%)
 * Сравнява последните 7 завършени дни спрямо 30-дневната база от часовника:
 * - Тренд и ниво на сутрешния RHR
 * - Ниво и стабилност (CV%) на HRV
 * - Сърдечна ефективност (метри на удар на сърцето) от watchActivities
 */
export function analyzeCardioVascularHealth(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}): CardioVascularHealthReport {
  const { dailyLogs, todayKey } = params;
  const windowEndDate = shiftDateKey(todayKey, -1);
  const window7dStart = shiftDateKey(todayKey, -7);
  const window30dStart = shiftDateKey(todayKey, -30);

  const logs30d = dailyLogs.filter(
    (l) =>
      isValidDateKey(l.date) &&
      l.date >= window30dStart &&
      l.date <= windowEndDate,
  );
  const logs7d = logs30d.filter((l) => l.date >= window7dStart);

  // 1. RHR (7d vs 30d)
  const rhr7Vals = logs7d
    .map((l) => l.restingHr)
    .filter((v): v is number => typeof v === 'number' && v >= 30 && v <= 200);
  const rhr30Vals = logs30d
    .map((l) => l.restingHr)
    .filter((v): v is number => typeof v === 'number' && v >= 30 && v <= 200);

  const avgRhr7d = rhr7Vals.length > 0 ? round1(average(rhr7Vals)!) : null;
  const avgRhr30d = rhr30Vals.length > 0 ? round1(average(rhr30Vals)!) : null;
  const rhrDeltaBpm =
    avgRhr7d !== null && avgRhr30d !== null ? round1(avgRhr7d - avgRhr30d) : null;
  const rhrSd7 = stdDev(rhr7Vals);

  let rhrScore: number | null = null;
  if (avgRhr7d !== null || avgRhr30d !== null) {
    const refRhr = avgRhr7d ?? avgRhr30d!;
    // Base cardiovascular efficiency from resting HR
    let base =
      refRhr <= 52
        ? 96
        : refRhr <= 58
          ? 88
          : refRhr <= 64
            ? 78
            : refRhr <= 70
              ? 64
              : refRhr <= 76
                ? 50
                : 38;
    // Trend adjustment (lower 7d than 30d = bonus, spike = penalty)
    if (rhrDeltaBpm !== null) {
      if (rhrDeltaBpm <= -1.5) base += 6;
      else if (rhrDeltaBpm <= 0.5) base += 2;
      else if (rhrDeltaBpm >= 4) base -= 16;
      else if (rhrDeltaBpm >= 2) base -= 8;
    }
    // Stability adjustment
    if (rhrSd7 !== null) {
      if (rhrSd7 <= 1.8) base += 3;
      else if (rhrSd7 >= 4.0) base -= 6;
    }
    rhrScore = Math.round(clamp(base, 15, 100));
  }

  // 2. HRV (7d vs 30d + stability CV%)
  const hrv7Vals = logs7d
    .map((l) => l.hrv)
    .filter((v): v is number => typeof v === 'number' && v >= 5 && v <= 300);
  const hrv30Vals = logs30d
    .map((l) => l.hrv)
    .filter((v): v is number => typeof v === 'number' && v >= 5 && v <= 300);

  const avgHrv7d = hrv7Vals.length > 0 ? round1(average(hrv7Vals)!) : null;
  const avgHrv30d = hrv30Vals.length > 0 ? round1(average(hrv30Vals)!) : null;
  const hrvDeltaPct =
    avgHrv7d !== null && avgHrv30d !== null && avgHrv30d > 0
      ? round1(((avgHrv7d - avgHrv30d) / avgHrv30d) * 100)
      : null;
  const hrvSd7 = stdDev(hrv7Vals);
  const hrvCv7dPct =
    hrvSd7 !== null && avgHrv7d !== null && avgHrv7d > 0
      ? round1((hrvSd7 / avgHrv7d) * 100)
      : null;

  let hrvScore: number | null = null;
  if (avgHrv7d !== null || avgHrv30d !== null) {
    const refHrv = avgHrv7d ?? avgHrv30d!;
    let base =
      refHrv >= 75
        ? 92
        : refHrv >= 60
          ? 84
          : refHrv >= 45
            ? 74
            : refHrv >= 32
              ? 58
              : 42;
    if (hrvDeltaPct !== null) {
      if (hrvDeltaPct >= 5) base += 8;
      else if (hrvDeltaPct >= -5) base += 2;
      else if (hrvDeltaPct <= -15) base -= 18;
      else if (hrvDeltaPct <= -8) base -= 9;
    }
    if (hrvCv7dPct !== null) {
      if (hrvCv7dPct <= 10) base += 5;
      else if (hrvCv7dPct >= 22) base -= 8;
    }
    hrvScore = Math.round(clamp(base, 15, 100));
  }

  // 3. Cardiac efficiency from watchActivities (meters per heartbeat, 7d vs 30d)
  const eff7: number[] = [];
  const eff30: number[] = [];
  const hr30Activities: number[] = [];
  let activitiesCount30d = 0;

  for (const log of logs30d) {
    const acts = log.watchActivities ?? [];
    for (const act of acts) {
      const mpb = computeActivityMetersPerBeat(act);
      if (typeof act.average_heartrate === 'number' && act.average_heartrate >= 70) {
        hr30Activities.push(act.average_heartrate);
        activitiesCount30d += 1;
      }
      if (mpb !== null) {
        eff30.push(mpb);
        if (log.date >= window7dStart) {
          eff7.push(mpb);
        }
      }
    }
  }

  const avg7dMetersPerBeat = eff7.length > 0 ? round2(average(eff7)!) : null;
  const avg30dMetersPerBeat = eff30.length > 0 ? round2(average(eff30)!) : null;
  const efficiencyTrendPct =
    avg7dMetersPerBeat !== null &&
    avg30dMetersPerBeat !== null &&
    avg30dMetersPerBeat > 0
      ? round1(
          ((avg7dMetersPerBeat - avg30dMetersPerBeat) / avg30dMetersPerBeat) *
            100,
        )
      : null;
  const avgActivityHr30d =
    hr30Activities.length > 0 ? Math.round(average(hr30Activities)!) : null;

  let effScore: number | null = null;
  if (avg7dMetersPerBeat !== null || avg30dMetersPerBeat !== null) {
    const refEff = avg7dMetersPerBeat ?? avg30dMetersPerBeat!;
    // Running/hiking meters per beat: ~0.6–0.9 walking/steep hike, ~1.0–1.5 steady run
    let base =
      refEff >= 1.15
        ? 92
        : refEff >= 0.9
          ? 82
          : refEff >= 0.7
            ? 72
            : 62;
    if (efficiencyTrendPct !== null) {
      if (efficiencyTrendPct >= 3) base += 7;
      else if (efficiencyTrendPct <= -6) base -= 10;
    }
    effScore = Math.round(clamp(base, 25, 100));
  }

  // Weighted composite (normalize dynamically over available watch metrics)
  const parts: Array<{ score: number; weight: number }> = [];
  if (rhrScore !== null) parts.push({ score: rhrScore, weight: 0.45 });
  if (hrvScore !== null) parts.push({ score: hrvScore, weight: 0.35 });
  if (effScore !== null) parts.push({ score: effScore, weight: 0.2 });

  const hasData = parts.length > 0;
  const totalWeight = parts.reduce((acc, p) => acc + p.weight, 0);
  const score =
    hasData && totalWeight > 0
      ? Math.round(
          parts.reduce((acc, p) => acc + p.score * p.weight, 0) / totalWeight,
        )
      : 0;

  const zone: CardioVascularZone = !hasData
    ? 'no_data'
    : score >= 78
      ? 'optimal'
      : score >= 58
        ? 'good'
        : 'caution';

  const zoneLabel =
    zone === 'optimal'
      ? 'Отлично съдово здраве и висока аеробна ефективност'
      : zone === 'good'
        ? 'Стабилен кардио-метаболитен профил'
        : zone === 'caution'
          ? 'Повишено сърдечно-съдово напрежение — фокус върху възстановяване'
          : 'Изчаква данни от Huawei Watch GT 6 (RHR / HRV / активности)';

  const rhrSummary =
    avgRhr7d !== null && avgRhr30d !== null && rhrDeltaBpm !== null
      ? `7 д.: ${avgRhr7d} bpm спрямо 30 д.: ${avgRhr30d} bpm (${rhrDeltaBpm >= 0 ? '+' : ''}${rhrDeltaBpm} bpm)`
      : avgRhr30d !== null
        ? `30-дн. база: ${avgRhr30d} bpm`
        : 'Няма записан сутрешен RHR';

  const hrvSummary =
    avgHrv7d !== null && avgHrv30d !== null && hrvDeltaPct !== null
      ? `7 д.: ${avgHrv7d} ms (${hrvDeltaPct >= 0 ? '+' : ''}${hrvDeltaPct}% спрямо 30 д.)${hrvCv7dPct !== null ? ` · CV ${hrvCv7dPct}%` : ''}`
      : avgHrv30d !== null
        ? `30-дн. база: ${avgHrv30d} ms`
        : 'Няма записан HRV от часовника';

  const effSummary =
    avg7dMetersPerBeat !== null && avg30dMetersPerBeat !== null && efficiencyTrendPct !== null
      ? `7 д.: ${avg7dMetersPerBeat} м/удар (${efficiencyTrendPct >= 0 ? '+' : ''}${efficiencyTrendPct}% спрямо 30 д.)`
      : avg30dMetersPerBeat !== null
        ? `30 д.: ${avg30dMetersPerBeat} м/удар (${activitiesCount30d} акт.)`
        : 'Няма кардио активности с пулс от часовника';

  const effects =
    zone === 'optimal'
      ? {
          musclePumpAndNutrients:
            'Ниският и стабилен пулс в покой говори за висока съдова еластичност и силен кръвоток — днес очаквай плътно мускулно напомпване и ефективна доставка на аминокиселини и гликоген.',
          boxingRoundRecovery:
            'Високият парасимпатиков тонус ускорява свалянето на пулса в 60-те секунди между 3-минутните рундове на бокса — запазваш свежест и сила в късните рундове.',
          longTermHeartHealth:
            'Сърцето изтласква повече кръв с по-малко удари в покой — маркер за нисък хроничен стрес, здрава ендотелна функция и висока мъжка жизненост.',
        }
      : zone === 'good'
        ? {
            musclePumpAndNutrients:
              'Кръвоснабдяването и доставката на хранителни вещества до мускулите са стабилни; 2–3 аеробни сесии в Зона 2 седмично ще качат капилярната плътност още по-високо.',
            boxingRoundRecovery:
              'Сърдечната ефективност поддържа добро темпо в рундовете — добавянето на спокойни планински преходи или леко бягане ще ускори допълнително спада на пулса в почивките.',
            longTermHeartHealth:
              'Кардио-метаболитната база е в добра форма. Поддържай стабилен сън и редовни крачки, за да смъкнеш сутрешния RHR с още 1–2 bpm.',
          }
        : zone === 'caution'
          ? {
              musclePumpAndNutrients:
                'Повишеният пулс или потиснатият HRV показват съдово и нервно напрежение — днес хидратирай се обилно (вода + електролити) и избягвай прекомерен кофеин преди зала.',
              boxingRoundRecovery:
                'Пулсът ще спада по-бавно между 3-минутните рундове на бокса — работи с контролирано дишане в паузите и намали темпото при спаринг.',
              longTermHeartHealth:
                'Сигнал за натрупан хроничен стрес или недоспиване. Приоритизирай 2–3 чисти дни, лек аеробен режим (Зона 1–2) и 8 ч. сън за нормализиране на RHR и HRV.',
            }
          : {
              musclePumpAndNutrients:
                'Синхронизирай сутрешния RHR, HRV и активностите от Huawei Watch GT 6, за да проследиш съдовата перфузия и напомпването.',
              boxingRoundRecovery:
                'След натрупване на данни от часовника ще видиш как аеробната ти ефективност ускорява свалянето на пулса между рундовете.',
              longTermHeartHealth:
                'Дългосрочният 7-дн. спрямо 30-дн. тренд измерва силата на сърцето и нивото на хроничен стрес.',
            };

  return {
    window7dStart,
    window30dStart,
    windowEndDate,
    todayDate: todayKey,
    hasData,
    score,
    zone,
    zoneLabel,
    rhr: {
      avg7d: avgRhr7d,
      avg30d: avgRhr30d,
      deltaBpm: rhrDeltaBpm,
      score: rhrScore,
      summary: rhrSummary,
    },
    hrv: {
      avg7d: avgHrv7d,
      avg30d: avgHrv30d,
      deltaPct: hrvDeltaPct,
      cv7dPct: hrvCv7dPct,
      score: hrvScore,
      summary: hrvSummary,
    },
    cardiacEfficiency: {
      avg7dMetersPerBeat,
      avg30dMetersPerBeat,
      trendPct: efficiencyTrendPct,
      avgActivityHr30d,
      activitiesCount30d,
      score: effScore,
      summary: effSummary,
    },
    effects,
  };
}

// ============================================================================
// МОДУЛ 5: 🥩 Анаболен праг на протеина и защита от омазняване
// ============================================================================

export const ANABOLIC_PROTEIN_THRESHOLD_G_PER_KG = 1.8;

export type ProteinGuardStatus =
  | 'fat_gain_risk'
  | 'optimal_lean_progression'
  | 'protein_below_threshold'
  | 'steady'
  | 'no_data';

export interface ProteinDayPoint {
  date: string;
  proteinGrams: number | null;
  weightKg: number | null;
  proteinPerKg: number | null;
  meetsThreshold: boolean;
}

export interface ProteinLeanMassGuardReport {
  window7dStart: string;
  window14dStart: string;
  windowEndDate: string;
  todayDate: string;
  thresholdGPerKg: number;
  days7d: ProteinDayPoint[];
  daysWithProteinData: number;
  daysMeetingThreshold: number;
  avgProteinGrams7d: number | null;
  avgProteinPerKg7d: number | null;
  weightAvgRecent7d: number | null;
  weightAvgPrev7d: number | null;
  weightGainKgPerWeek: number | null;
  strengthTrendPct: number | null;
  volumeTrendPct: number | null;
  strengthIsGrowing: boolean;
  comparedExercisesCount: number;
  status: ProteinGuardStatus;
  statusHeadline: string;
  statusMessage: string;
}

function estimateExerciseBestE1RM(sets: HevyWorkout['exercises'][number]['sets']): number {
  let best = 0;
  for (const s of sets) {
    if ((s.setType ?? '').trim().toLowerCase() === 'warmup') continue;
    const w = s.weightKg ?? 0;
    const r = s.reps ?? 0;
    if (w <= 0 || r <= 0) continue;
    const e1rm = r === 1 ? w : w * (1 + r / 30);
    if (e1rm > best) best = e1rm;
  }
  return best;
}

/**
 * Модул 5: Анаболен праг на протеина (>= 1.8 g/kg за последните 7 завършени дни)
 * и кръстосана защита от омазняване (14-дневен тренд на теглото спрямо силова прогресия в Hevy).
 */
export function analyzeProteinAndLeanMassGuard(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  profile: UserProfile;
  todayKey: string;
}): ProteinLeanMassGuardReport {
  const { dailyLogs, hevyWorkouts, profile, todayKey } = params;
  const windowEndDate = shiftDateKey(todayKey, -1);
  const window7dStart = shiftDateKey(todayKey, -7);
  const window14dStart = shiftDateKey(todayKey, -14);
  const prev7dEnd = shiftDateKey(todayKey, -8);

  const fallbackWeightKg =
    typeof profile.weightKg === 'number' && profile.weightKg >= 30
      ? profile.weightKg
      : null;

  const byDate = new Map<string, DailyBiometricLog>();
  for (const log of dailyLogs) {
    if (isValidDateKey(log.date)) byDate.set(log.date, log);
  }

  const weightSamples = extractDailyWeightSamples(dailyLogs);

  // 1. Last 7 completed days protein g/kg
  const days7d: ProteinDayPoint[] = [];
  const proteinGramsList: number[] = [];
  const proteinPerKgList: number[] = [];

  for (let offset = 7; offset >= 1; offset--) {
    const date = shiftDateKey(todayKey, -offset);
    const log = byDate.get(date);
    const proteinGrams =
      log && typeof log.proteinGrams === 'number' && log.proteinGrams > 0
        ? round1(log.proteinGrams)
        : null;
    const resolvedWeight = resolveWeightForDate(date, weightSamples, fallbackWeightKg);
    const weightKg = resolvedWeight ? round1(resolvedWeight.weightKg) : null;
    const proteinPerKg =
      proteinGrams !== null && weightKg !== null && weightKg > 0
        ? round2(proteinGrams / weightKg)
        : null;
    const meetsThreshold =
      proteinPerKg !== null &&
      proteinPerKg >= ANABOLIC_PROTEIN_THRESHOLD_G_PER_KG;

    if (proteinGrams !== null) proteinGramsList.push(proteinGrams);
    if (proteinPerKg !== null) proteinPerKgList.push(proteinPerKg);

    days7d.push({
      date,
      proteinGrams,
      weightKg,
      proteinPerKg,
      meetsThreshold,
    });
  }

  const daysWithProteinData = days7d.filter((d) => d.proteinPerKg !== null).length;
  const daysMeetingThreshold = days7d.filter((d) => d.meetsThreshold).length;
  const avgProteinGrams7d =
    proteinGramsList.length > 0 ? Math.round(average(proteinGramsList)!) : null;
  const avgProteinPerKg7d =
    proteinPerKgList.length > 0 ? round2(average(proteinPerKgList)!) : null;

  // 2. 14-day weight trend (recent 7 completed days vs previous 7 completed days)
  const recentWeights = dailyLogs
    .filter(
      (l) =>
        isValidDateKey(l.date) &&
        l.date >= window7dStart &&
        l.date <= windowEndDate &&
        typeof l.weightKg === 'number' &&
        l.weightKg >= 30,
    )
    .map((l) => l.weightKg as number);

  const prevWeights = dailyLogs
    .filter(
      (l) =>
        isValidDateKey(l.date) &&
        l.date >= window14dStart &&
        l.date <= prev7dEnd &&
        typeof l.weightKg === 'number' &&
        l.weightKg >= 30,
    )
    .map((l) => l.weightKg as number);

  const weightAvgRecent7d =
    recentWeights.length > 0 ? round2(average(recentWeights)!) : null;
  const weightAvgPrev7d =
    prevWeights.length > 0 ? round2(average(prevWeights)!) : null;
  const weightGainKgPerWeek =
    weightAvgRecent7d !== null && weightAvgPrev7d !== null
      ? round2(weightAvgRecent7d - weightAvgPrev7d)
      : null;

  // 3. Strength progression in Hevy (excluding boxing) across recent 7d vs prev 7–21d
  const nonBoxingRecent = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      !isBoxingWorkout(w) &&
      w.date >= window7dStart &&
      w.date <= windowEndDate,
  );
  const prevStrengthWindowStart = shiftDateKey(todayKey, -21);
  const nonBoxingPrev = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      !isBoxingWorkout(w) &&
      w.date >= prevStrengthWindowStart &&
      w.date <= prev7dEnd,
  );

  const bestE1rmByExercise = (workouts: HevyWorkout[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const w of workouts) {
      for (const ex of w.exercises) {
        const key = ex.title.trim().toLowerCase();
        if (!key) continue;
        const best = estimateExerciseBestE1RM(ex.sets);
        if (best > 0 && best > (map.get(key) ?? 0)) {
          map.set(key, best);
        }
      }
    }
    return map;
  };

  const recentBestMap = bestE1rmByExercise(nonBoxingRecent);
  const prevBestMap = bestE1rmByExercise(nonBoxingPrev);

  const pctDeltas: number[] = [];
  for (const [exKey, recentVal] of recentBestMap.entries()) {
    const prevVal = prevBestMap.get(exKey);
    if (prevVal && prevVal > 0) {
      pctDeltas.push(((recentVal - prevVal) / prevVal) * 100);
    }
  }

  const strengthTrendPct =
    pctDeltas.length > 0 ? round1(average(pctDeltas)!) : null;

  const recentAvgVol =
    nonBoxingRecent.length > 0
      ? average(nonBoxingRecent.map((w) => w.totalVolumeKg))
      : null;
  const prevAvgVol =
    nonBoxingPrev.length > 0
      ? average(nonBoxingPrev.map((w) => w.totalVolumeKg))
      : null;
  const volumeTrendPct =
    recentAvgVol !== null && prevAvgVol !== null && prevAvgVol > 0
      ? round1(((recentAvgVol - prevAvgVol) / prevAvgVol) * 100)
      : null;

  const strengthIsGrowing =
    (strengthTrendPct !== null && strengthTrendPct >= 0.5) ||
    (strengthTrendPct === null &&
      volumeTrendPct !== null &&
      volumeTrendPct >= 3.0);

  // 4. Status classification with exact user rules
  let status: ProteinGuardStatus;
  let statusHeadline: string;
  let statusMessage: string;

  const hasFastWeightGainWithoutStrength =
    weightGainKgPerWeek !== null &&
    weightGainKgPerWeek > 0.4 &&
    !strengthIsGrowing &&
    (pctDeltas.length > 0 || nonBoxingRecent.length > 0);

  if (hasFastWeightGainWithoutStrength) {
    status = 'fat_gain_risk';
    statusHeadline = '⚠️ Риск от излишно омазняване и ароматизация';
    statusMessage =
      '⚠️ Риск от излишно омазняване: теглото расте по-бързо от силата. Наднормените мазнини засилват ароматизацията (превръщането на тестостерон в естроген) — намали леко калориите с 150–200 kcal, но запази протеина >= 1.8 g/kg.';
  } else if (daysMeetingThreshold >= 5 && strengthIsGrowing) {
    status = 'optimal_lean_progression';
    statusHeadline = '🥩 Оптимален белтъчен синтез и чиста прогресия';
    statusMessage = `Постигаш анаболния праг ≥ 1.8 g/kg в ${daysMeetingThreshold}/7 дни (средно ${avgProteinPerKg7d ?? 1.8} g/kg), а силата ти расте (${strengthTrendPct !== null ? `+${strengthTrendPct}% e1RM` : `+${volumeTrendPct ?? 0}% обем`}) — идеална среда за чиста мускулна маса без излишни мазнини.`;
  } else if (daysWithProteinData === 0) {
    status = 'no_data';
    statusHeadline = 'Няма записан протеин за последните 7 завършени дни';
    statusMessage =
      'Попълни дневния протеин и теглото си в „Дневен запис“, за да проследиш колко дни достигат анаболния праг ≥ 1.8 g/kg и да активираш защитата от излишно омазняване.';
  } else if (daysMeetingThreshold < 5) {
    status = 'protein_below_threshold';
    statusHeadline = `Под анаболния праг: ${daysMeetingThreshold}/7 дни с ≥ 1.8 g/kg протеин`;
    statusMessage = `Средният ти прием за последните 7 дни е ${avgProteinPerKg7d !== null ? `${avgProteinPerKg7d} g/kg` : '—'}. Целта за максимален мускулен белтъчен синтез е поне 5 от 7 дни с ≥ 1.8 g/kg (добави ~25–35 g чист протеин в дните под прага).`;
  } else {
    status = 'steady';
    statusHeadline = `Стабилен протеинов прием (${daysMeetingThreshold}/7 дни ≥ 1.8 g/kg)`;
    statusMessage = `Покриваш анаболния праг (${avgProteinPerKg7d ?? '—'} g/kg средно), а теглото е под контрол (${weightGainKgPerWeek !== null ? `${weightGainKgPerWeek >= 0 ? '+' : ''}${weightGainKgPerWeek} kg/седм.` : 'няма 14-дн. тренд'}). Следи прогресията в Hevy за чист ръст.`;
  }

  return {
    window7dStart,
    window14dStart,
    windowEndDate,
    todayDate: todayKey,
    thresholdGPerKg: ANABOLIC_PROTEIN_THRESHOLD_G_PER_KG,
    days7d,
    daysWithProteinData,
    daysMeetingThreshold,
    avgProteinGrams7d,
    avgProteinPerKg7d,
    weightAvgRecent7d,
    weightAvgPrev7d,
    weightGainKgPerWeek,
    strengthTrendPct,
    volumeTrendPct,
    strengthIsGrowing,
    comparedExercisesCount: pctDeltas.length,
    status,
    statusHeadline,
    statusMessage,
  };
}
