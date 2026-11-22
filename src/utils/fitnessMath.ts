import type {
  BodyMeasurements,
  DateSnapshotStats,
  DayLog,
  DiaryState,
  DurationUnit,
  FitnessGoal,
  GoalEvaluation,
  GoalTimeMode,
  GoalType,
  MuscleAllocationConfig,
  MuscleAllocationMode,
  MuscleAllocationScope,
  MuscleCumulativeStats,
  MuscleDefinition,
  MuscleGainMode,
  MuscleGoalUnit,
  MuscleId,
  RecoveryInfo,
  RecoveryMode,
  RecoveryOptions,
  SevenDayDaySummary,
  SevenDayTrainingSummary,
  SleepAdviceItem,
  SleepRecoveryInsights,
  ThemeAccent,
  UserProfile,
} from '../types/fitness';
import {
  sanitizeDailyLogsArray,
  sanitizeDailyStepsGoal,
  sanitizeHabitItemsArray,
  sanitizeOptionalAnalysisWeight,
  sanitizeSupplementCyclesMap,
} from './dailyLogs';
import { sanitizeCustomExerciseMappings } from './exerciseMuscleEngine';
import { sanitizeUserSettings } from './hiddenProgressAndEnvironment';
import { sanitizeHevyWorkoutsArray } from './hevyParser';

export const MUSCLE_GROUPS: MuscleDefinition[] = [
  {
    id: 'chest',
    label: 'Гърди',
    anatomicalLabel: 'Големи гръдни мускули',
    primaryView: 'front',
    availableViews: ['front'],
    baseGainGrams: 5.0,
    description: 'Горна и средна част на торса',
  },
  {
    id: 'back',
    label: 'Гръб',
    anatomicalLabel: 'Широк гръбен мускул и трапец',
    primaryView: 'back',
    availableViews: ['back'],
    baseGainGrams: 5.5,
    description: 'Задна верига, широчина и стойка',
  },
  {
    id: 'shoulders',
    label: 'Рамо',
    anatomicalLabel: 'Делтовидни мускули',
    primaryView: 'front',
    availableViews: ['front', 'back'],
    baseGainGrams: 4.5,
    description: 'Предно, средно и задно рамо',
  },
  {
    id: 'biceps',
    label: 'Бицепс',
    anatomicalLabel: 'Двуглав мишничен мускул',
    primaryView: 'front',
    availableViews: ['front'],
    baseGainGrams: 3.5,
    description: 'Предна част на горната ръка',
  },
  {
    id: 'triceps',
    label: 'Трицепс',
    anatomicalLabel: 'Триглав мишничен мускул',
    primaryView: 'back',
    availableViews: ['back'],
    baseGainGrams: 3.5,
    description: 'Задна част на горната ръка',
  },
  {
    id: 'abs',
    label: 'Корем',
    anatomicalLabel: 'Прав и коси коремни мускули',
    primaryView: 'front',
    availableViews: ['front'],
    baseGainGrams: 3.0,
    description: 'Стабилизиращо ядро и преса',
  },
  {
    id: 'legs',
    label: 'Крака',
    anatomicalLabel: 'Квадрицепс, задно бедро и прасци',
    primaryView: 'front',
    availableViews: ['front', 'back'],
    baseGainGrams: 6.0,
    description: 'Най-голямата мускулна група',
  },
];

export const MUSCLE_MAP: Record<MuscleId, MuscleDefinition> = MUSCLE_GROUPS.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MuscleId, MuscleDefinition>,
);

export const VALID_MUSCLE_IDS = new Set<MuscleId>(MUSCLE_GROUPS.map((m) => m.id));

export const THEME_ACCENTS: { id: ThemeAccent; label: string; swatch: string }[] = [
  { id: 'blue', label: 'Синьо', swatch: '#3b82f6' },
  { id: 'green', label: 'Зелено', swatch: '#10b981' },
  { id: 'purple', label: 'Лилаво', swatch: '#8b5cf6' },
  { id: 'orange', label: 'Оранжево', swatch: '#f97316' },
];

export const DEFAULT_SLEEP_HOURS = 8;
export const MILESTONE_STEP_GRAMS = 100;

export function roundGrams(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatGrams(value: number): string {
  const rounded = roundGrams(value);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function clampSleepHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_SLEEP_HOURS;
  return Math.max(0, Math.min(16, Math.round(hours * 10) / 10));
}

export function clampHuaweiSleepScore(score: unknown): number | undefined {
  if (score === undefined || score === null || score === '') return undefined;
  const num = typeof score === 'number' ? score : Number(score);
  if (!Number.isFinite(num)) return undefined;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function clampManualRecoveryPercent(pct: unknown): number | undefined {
  if (pct === undefined || pct === null || pct === '') return undefined;
  const num = typeof pct === 'number' ? pct : Number(pct);
  if (!Number.isFinite(num)) return undefined;
  return Math.max(0, Math.min(100, Math.round(num)));
}

export function clampDailyMuscleGainGrams(grams: unknown): number | undefined {
  if (grams === undefined || grams === null || grams === '') return undefined;
  const num = typeof grams === 'number' ? grams : Number(grams);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  return roundGrams(Math.max(0.5, Math.min(500, num)));
}

export function clampManualDayGainGrams(grams: unknown): number | undefined {
  if (grams === undefined || grams === null || grams === '') return undefined;
  const num = typeof grams === 'number' ? grams : Number(grams);
  if (!Number.isFinite(num) || num < 0) return undefined;
  return roundGrams(Math.max(0, Math.min(50000, num)));
}

export const DEFAULT_MUSCLE_ALLOCATION_PERCENTS: Record<MuscleId, number> = {
  chest: 16,
  back: 18,
  shoulders: 14,
  biceps: 11,
  triceps: 11,
  abs: 10,
  legs: 20,
};

export const EQUAL_MUSCLE_ALLOCATION_PERCENTS: Record<MuscleId, number> = {
  chest: 14,
  back: 15,
  shoulders: 14,
  biceps: 14,
  triceps: 14,
  abs: 14,
  legs: 15,
};

export function sanitizeMusclePercentMap(
  raw?: Partial<Record<MuscleId, unknown>> | null,
): Partial<Record<MuscleId, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: Partial<Record<MuscleId, number>> = {};
  let hasAny = false;
  for (const def of MUSCLE_GROUPS) {
    const v = raw[def.id];
    if (v === undefined || v === null || v === '') continue;
    const num = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(num)) continue;
    result[def.id] = Math.max(0, Math.min(100, roundGrams(num)));
    hasAny = true;
  }
  return hasAny ? result : undefined;
}

export function sanitizeManualMuscleGramsMap(
  raw?: Partial<Record<MuscleId, unknown>> | null,
): Partial<Record<MuscleId, number>> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const result: Partial<Record<MuscleId, number>> = {};
  let hasAny = false;
  for (const def of MUSCLE_GROUPS) {
    const v = raw[def.id];
    if (v === undefined || v === null || v === '') continue;
    const clamped = clampManualDayGainGrams(v);
    if (clamped !== undefined) {
      result[def.id] = clamped;
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

export function normalizeMusclePercentsTo100(
  percents?: Partial<Record<MuscleId, number>> | null,
): Record<MuscleId, number> {
  const ids = MUSCLE_GROUPS.map((m) => m.id);
  const values = ids.map((id) => Math.max(0, Number(percents?.[id] ?? 0) || 0));
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return { ...EQUAL_MUSCLE_ALLOCATION_PERCENTS };
  }

  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map((v) => Math.floor(v));
  let remainder = 100 - floors.reduce((sum, v) => sum + v, 0);

  const order = exact
    .map((val, idx) => ({ idx, frac: val - floors[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < order.length && remainder > 0; i++) {
    floors[order[i].idx] += 1;
    remainder -= 1;
  }

  const out = {} as Record<MuscleId, number>;
  ids.forEach((id, idx) => {
    out[id] = floors[idx];
  });
  return out;
}

export function getAllocationConfigFromState(
  state?: Pick<DiaryState, 'muscleAllocationMode' | 'muscleAllocationScope' | 'muscleAllocations'> | null,
): MuscleAllocationConfig | undefined {
  if (!state) return undefined;
  if (state.muscleAllocationMode !== 'custom_percent') return undefined;
  return {
    mode: 'custom_percent',
    scope: state.muscleAllocationScope ?? 'trained_only',
    percents: state.muscleAllocations,
  };
}

export function getRecoveryOptionsFromLog(entry?: Partial<DayLog> | null): RecoveryOptions {
  if (!entry) return {};
  return {
    huaweiSleepScore: entry.huaweiSleepScore,
    recoveryMode: entry.recoveryMode,
    manualRecoveryPercent: entry.manualRecoveryPercent,
  };
}

export function getSleepRecoveryInfo(
  rawHours: number,
  options?: RecoveryOptions,
): RecoveryInfo {
  const sleepHours = clampSleepHours(rawHours);
  const huaweiSleepScore = clampHuaweiSleepScore(options?.huaweiSleepScore);
  const mode: RecoveryMode = options?.recoveryMode === 'manual' ? 'manual' : 'auto';
  const manualPct = clampManualRecoveryPercent(options?.manualRecoveryPercent);

  if (mode === 'manual' && manualPct !== undefined) {
    const multiplier = Math.round((manualPct / 100) * 100) / 100;
    const isFatigued = manualPct < 60;
    const status =
      manualPct >= 85
        ? 'optimal'
        : manualPct >= 70
          ? 'good'
          : manualPct >= 60
            ? 'moderate'
            : manualPct >= 35
              ? 'fatigued'
              : 'exhausted';
    return {
      sleepHours,
      huaweiSleepScore,
      mode: 'manual',
      source: 'manual',
      multiplier,
      percentage: manualPct,
      status,
      label: `Ръчно зададено възстановяване (${manualPct}%)`,
      isFatigued,
    };
  }

  if (huaweiSleepScore !== undefined) {
    let percentage: number;
    let status: RecoveryInfo['status'];
    let label: string;
    let isFatigued: boolean;

    if (huaweiSleepScore >= 90) {
      percentage = 100;
      status = 'optimal';
      label = 'Отличен сън от Huawei GT 6';
      isFatigued = false;
    } else if (huaweiSleepScore >= 60) {
      percentage = Math.round(60 + ((huaweiSleepScore - 60) / 30) * 40);
      status = huaweiSleepScore >= 75 ? 'good' : 'moderate';
      label =
        huaweiSleepScore >= 75
          ? 'Добър сън от Huawei GT 6'
          : 'Умерен сън от Huawei GT 6';
      isFatigued = false;
    } else if (huaweiSleepScore >= 40) {
      percentage = Math.round(30 + ((huaweiSleepScore - 40) / 20) * 28);
      status = 'fatigued';
      label = 'Изморени мускули (под 60 т. в Huawei GT 6)';
      isFatigued = true;
    } else {
      percentage = Math.max(10, Math.round(10 + (huaweiSleepScore / 40) * 20));
      status = 'exhausted';
      label = 'Критична умора (нисък Huawei GT 6 резултат)';
      isFatigued = true;
    }

    return {
      sleepHours,
      huaweiSleepScore,
      mode: 'auto',
      source: 'huawei_gt6',
      multiplier: Math.round((percentage / 100) * 100) / 100,
      percentage,
      status,
      label,
      isFatigued,
    };
  }

  if (sleepHours >= 8) {
    return {
      sleepHours,
      mode,
      source: 'sleep_hours',
      multiplier: 1.0,
      percentage: 100,
      status: 'optimal',
      label: 'Оптимално възстановяване',
      isFatigued: false,
    };
  }
  if (sleepHours >= 7) {
    return {
      sleepHours,
      mode,
      source: 'sleep_hours',
      multiplier: 0.85,
      percentage: 85,
      status: 'good',
      label: 'Добро възстановяване',
      isFatigued: false,
    };
  }
  if (sleepHours >= 6) {
    return {
      sleepHours,
      mode,
      source: 'sleep_hours',
      multiplier: 0.65,
      percentage: 65,
      status: 'moderate',
      label: 'Умерено възстановяване',
      isFatigued: false,
    };
  }
  if (sleepHours >= 4) {
    return {
      sleepHours,
      mode,
      source: 'sleep_hours',
      multiplier: 0.35,
      percentage: 35,
      status: 'fatigued',
      label: 'Изморени мускули (под 6 ч сън)',
      isFatigued: true,
    };
  }
  return {
    sleepHours,
    mode,
    source: 'sleep_hours',
    multiplier: 0.15,
    percentage: 15,
    status: 'exhausted',
    label: 'Критична умора (недостатъчен сън)',
    isFatigued: true,
  };
}

export function calculateMuscleGainForDay(
  muscleId: MuscleId,
  sleepHours: number,
  options?: RecoveryOptions,
): number {
  const def = MUSCLE_MAP[muscleId];
  const recovery = getSleepRecoveryInfo(sleepHours, options);
  return roundGrams(def.baseGainGrams * recovery.multiplier);
}

export function calculateDayTotalGain(
  muscles: MuscleId[],
  sleepHours: number,
  options?: RecoveryOptions,
): number {
  const unique = Array.from(new Set(muscles));
  return roundGrams(
    unique.reduce(
      (sum, muscleId) => sum + calculateMuscleGainForDay(muscleId, sleepHours, options),
      0,
    ),
  );
}

export interface DayGainsBreakdown {
  totalGrams: number;
  byMuscle: Partial<Record<MuscleId, number>>;
  gainMode: MuscleGainMode;
  recovery: RecoveryInfo;
  effectiveBaseGrams?: number;
}

function distributeTotalAcrossMuscles(
  muscles: MuscleId[],
  totalGrams: number,
  customWeights?: Partial<Record<MuscleId, number>>,
): Partial<Record<MuscleId, number>> {
  const byMuscle: Partial<Record<MuscleId, number>> = {};
  if (muscles.length === 0 || totalGrams <= 0) {
    for (const m of muscles) byMuscle[m] = 0;
    return byMuscle;
  }

  const getWeight = (id: MuscleId): number =>
    customWeights
      ? Math.max(0, Number(customWeights[id] ?? 0) || 0)
      : MUSCLE_MAP[id].baseGainGrams;

  const positiveIds = muscles.filter((id) => getWeight(id) > 0);
  const totalWeight = positiveIds.reduce((sum, id) => sum + getWeight(id), 0);

  if (positiveIds.length === 0 || totalWeight <= 0) {
    const share = roundGrams(totalGrams / muscles.length);
    muscles.forEach((id, idx) => {
      byMuscle[id] =
        idx === muscles.length - 1
          ? Math.max(0, roundGrams(totalGrams - share * (muscles.length - 1)))
          : share;
    });
    return byMuscle;
  }

  for (const id of muscles) {
    if (getWeight(id) <= 0) {
      byMuscle[id] = 0;
    }
  }

  let allocated = 0;
  positiveIds.forEach((id, idx) => {
    if (idx === positiveIds.length - 1) {
      byMuscle[id] = Math.max(0, roundGrams(totalGrams - allocated));
    } else {
      const share = roundGrams(totalGrams * (getWeight(id) / totalWeight));
      byMuscle[id] = share;
      allocated = roundGrams(allocated + share);
    }
  });
  return byMuscle;
}

function hasCustomAllocationWeights(
  allocationConfig?: MuscleAllocationConfig,
): allocationConfig is MuscleAllocationConfig & {
  mode: 'custom_percent';
  percents: Partial<Record<MuscleId, number>>;
} {
  if (allocationConfig?.mode !== 'custom_percent' || !allocationConfig.percents) {
    return false;
  }
  return MUSCLE_GROUPS.some((m) => (allocationConfig.percents?.[m.id] ?? 0) > 0);
}

export function calculateDayGainsBreakdown(
  entry?: Partial<DayLog> | null,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): DayGainsBreakdown {
  const sleepHours = entry ? clampSleepHours(entry.sleepHours ?? DEFAULT_SLEEP_HOURS) : DEFAULT_SLEEP_HOURS;
  const recovery = getSleepRecoveryInfo(sleepHours, getRecoveryOptionsFromLog(entry));
  const uniqueMuscles = entry && Array.isArray(entry.muscles)
    ? Array.from(new Set(entry.muscles)).filter((id): id is MuscleId => VALID_MUSCLE_IDS.has(id))
    : [];

  const gainMode: MuscleGainMode = entry?.muscleGainMode === 'manual' ? 'manual' : 'auto';
  const cleanManualMuscleGrams = sanitizeManualMuscleGramsMap(entry?.manualMuscleGrams);
  const manualGrams = clampManualDayGainGrams(entry?.manualGainGrams);

  const useCustomAllocation = hasCustomAllocationWeights(allocationConfig);
  const allocationScope: MuscleAllocationScope = allocationConfig?.scope ?? 'trained_only';
  const allMuscleIds = MUSCLE_GROUPS.map((m) => m.id);

  if (gainMode === 'manual' && cleanManualMuscleGrams) {
    const byMuscle: Partial<Record<MuscleId, number>> = {};
    let totalGrams = 0;
    for (const def of MUSCLE_GROUPS) {
      const val = cleanManualMuscleGrams[def.id] ?? 0;
      if (val > 0 || def.id in cleanManualMuscleGrams) {
        byMuscle[def.id] = val;
        totalGrams = roundGrams(totalGrams + val);
      }
    }
    return {
      totalGrams,
      byMuscle,
      gainMode: 'manual',
      recovery,
    };
  }

  if (gainMode === 'manual' && manualGrams !== undefined) {
    const targetMuscles =
      useCustomAllocation && allocationScope === 'all_groups'
        ? allMuscleIds
        : uniqueMuscles;
    return {
      totalGrams: manualGrams,
      byMuscle: distributeTotalAcrossMuscles(
        targetMuscles,
        manualGrams,
        useCustomAllocation ? allocationConfig.percents : undefined,
      ),
      gainMode: 'manual',
      recovery,
    };
  }

  const perDayBase = clampDailyMuscleGainGrams(entry?.baseDailyGainGrams);
  const globalBase = clampDailyMuscleGainGrams(defaultDailyBaseGrams);
  const effectiveBaseGrams = perDayBase ?? globalBase;

  if (uniqueMuscles.length === 0) {
    const shouldAccrueAllGroups =
      effectiveBaseGrams !== undefined &&
      (accrueOnRestDays || (useCustomAllocation && allocationScope === 'all_groups' && Boolean(entry?.trained)));

    if (shouldAccrueAllGroups && effectiveBaseGrams !== undefined) {
      const totalGrams = roundGrams(effectiveBaseGrams * recovery.multiplier);
      if (useCustomAllocation) {
        return {
          totalGrams,
          byMuscle: distributeTotalAcrossMuscles(
            allMuscleIds,
            totalGrams,
            allocationConfig.percents,
          ),
          gainMode: 'auto',
          recovery,
          effectiveBaseGrams,
        };
      }
      const evenShare = roundGrams(totalGrams / allMuscleIds.length);
      const byMuscle: Partial<Record<MuscleId, number>> = {};
      let allocated = 0;
      allMuscleIds.forEach((id, idx) => {
        if (idx === allMuscleIds.length - 1) {
          byMuscle[id] = Math.max(0, roundGrams(totalGrams - allocated));
        } else {
          byMuscle[id] = evenShare;
          allocated = roundGrams(allocated + evenShare);
        }
      });
      return {
        totalGrams,
        byMuscle,
        gainMode: 'auto',
        recovery,
        effectiveBaseGrams,
      };
    }
    return {
      totalGrams: 0,
      byMuscle: {},
      gainMode: 'auto',
      recovery,
      ...(effectiveBaseGrams !== undefined ? { effectiveBaseGrams } : {}),
    };
  }

  if (effectiveBaseGrams !== undefined) {
    const totalGrams = roundGrams(effectiveBaseGrams * recovery.multiplier);
    const targetMuscles =
      useCustomAllocation && allocationScope === 'all_groups'
        ? allMuscleIds
        : uniqueMuscles;
    return {
      totalGrams,
      byMuscle: distributeTotalAcrossMuscles(
        targetMuscles,
        totalGrams,
        useCustomAllocation ? allocationConfig.percents : undefined,
      ),
      gainMode: 'auto',
      recovery,
      effectiveBaseGrams,
    };
  }

  let totalGrams = 0;
  for (const muscleId of uniqueMuscles) {
    totalGrams = roundGrams(totalGrams + roundGrams(MUSCLE_MAP[muscleId].baseGainGrams * recovery.multiplier));
  }

  if (useCustomAllocation) {
    const targetMuscles = allocationScope === 'all_groups' ? allMuscleIds : uniqueMuscles;
    return {
      totalGrams,
      byMuscle: distributeTotalAcrossMuscles(
        targetMuscles,
        totalGrams,
        allocationConfig.percents,
      ),
      gainMode: 'auto',
      recovery,
    };
  }

  const byMuscle: Partial<Record<MuscleId, number>> = {};
  let defaultTotal = 0;
  for (const muscleId of uniqueMuscles) {
    const gained = roundGrams(MUSCLE_MAP[muscleId].baseGainGrams * recovery.multiplier);
    byMuscle[muscleId] = gained;
    defaultTotal = roundGrams(defaultTotal + gained);
  }

  return {
    totalGrams: defaultTotal,
    byMuscle,
    gainMode: 'auto',
    recovery,
  };
}

export function computeStatsUpToDate(
  logs: Record<string, DayLog>,
  targetDate: string,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): DateSnapshotStats {
  const byMuscle = {} as Record<MuscleId, MuscleCumulativeStats>;
  for (const def of MUSCLE_GROUPS) {
    byMuscle[def.id] = {
      muscleId: def.id,
      totalGrams: 0,
      workoutCount: 0,
      trainedOnDate: false,
      gainedOnDate: 0,
    };
  }

  const sortedDates = Object.keys(logs)
    .filter((d) => isValidDateKey(d) && d <= targetDate)
    .sort();

  let totalWorkouts = 0;
  let manualOnlyTotal = 0;

  for (const dateKey of sortedDates) {
    const entry = logs[dateKey];
    if (!entry) continue;
    const uniqueMuscles = Array.from(new Set(entry.muscles)).filter((id) =>
      VALID_MUSCLE_IDS.has(id),
    );
    const breakdown = calculateDayGainsBreakdown(
      entry,
      defaultDailyBaseGrams,
      accrueOnRestDays,
      allocationConfig,
    );
    const hasPerMuscleManual =
      breakdown.gainMode === 'manual' &&
      Boolean(entry.manualMuscleGrams && Object.values(entry.manualMuscleGrams).some((v) => (v ?? 0) > 0));
    if (uniqueMuscles.length > 0 || entry.trained || hasPerMuscleManual) {
      totalWorkouts += 1;
    }

    let allocated = 0;
    for (const def of MUSCLE_GROUPS) {
      const gained = breakdown.byMuscle[def.id] ?? 0;
      if (gained > 0) {
        byMuscle[def.id].totalGrams = roundGrams(byMuscle[def.id].totalGrams + gained);
        allocated = roundGrams(allocated + gained);
      }
      const trainedThisMuscle =
        uniqueMuscles.includes(def.id) ||
        (breakdown.gainMode === 'manual' && (entry.manualMuscleGrams?.[def.id] ?? 0) > 0);
      if (trainedThisMuscle) {
        byMuscle[def.id].workoutCount += 1;
      }
      if (dateKey === targetDate) {
        if (trainedThisMuscle) {
          byMuscle[def.id].trainedOnDate = true;
        }
        byMuscle[def.id].gainedOnDate = gained;
      }
    }

    const unallocated = roundGrams(breakdown.totalGrams - allocated);
    if (unallocated > 0) {
      manualOnlyTotal = roundGrams(manualOnlyTotal + unallocated);
    }
  }

  const targetEntry = logs[targetDate];
  const targetBreakdown = calculateDayGainsBreakdown(
    targetEntry,
    defaultDailyBaseGrams,
    accrueOnRestDays,
    allocationConfig,
  );
  const sleepHours = targetEntry ? clampSleepHours(targetEntry.sleepHours) : DEFAULT_SLEEP_HOURS;
  const recovery = targetBreakdown.recovery;
  const trainedMuscles = targetEntry
    ? Array.from(new Set(targetEntry.muscles)).filter((id) => VALID_MUSCLE_IDS.has(id))
    : [];

  const gainedOnDateTotal = targetBreakdown.totalGrams;

  const muscleSum = Object.values(byMuscle).reduce((sum, m) => sum + m.totalGrams, 0);
  const totalCumulativeGrams = roundGrams(muscleSum + manualOnlyTotal);

  return {
    date: targetDate,
    sleepHours,
    huaweiSleepScore: recovery.huaweiSleepScore,
    recovery,
    gainMode: targetBreakdown.gainMode,
    effectiveBaseDailyGrams: targetBreakdown.effectiveBaseGrams,
    trainedMuscles,
    gainedOnDateTotal,
    totalCumulativeGrams,
    totalWorkouts,
    byMuscle,
  };
}

export interface DailyTrendPoint {
  dateKey: string;
  shortLabel: string;
  fullDateLabel: string;
  dailyGainGrams: number;
  cumulativeGrams: number;
  byMuscleCumulative: Record<MuscleId, number>;
  byMuscleDaily: Record<MuscleId, number>;
  trainedMuscles: MuscleId[];
  trainedMuscleCount: number;
  sleepHours: number;
  huaweiSleepScore?: number;
  recoveryPercentage: number;
  recoverySource: RecoveryInfo['source'];
  isFatigued: boolean;
}

export interface ThirtyDayTrendSummary {
  points: DailyTrendPoint[];
  startBaselineGrams: number;
  endTotalGrams: number;
  windowGainGrams: number;
  activeDaysCount: number;
}

export function computeLast30DaysTrend(
  logs: Record<string, DayLog>,
  todayKey: string,
  daysCount: number = 30,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): ThirtyDayTrendSummary {
  const safeDays = Math.max(1, daysCount);
  const windowStartKey = shiftDateKey(todayKey, -(safeDays - 1));

  // Baseline cumulative mass accrued strictly before the 30-day window
  let runningTotal = 0;
  const runningByMuscle = {} as Record<MuscleId, number>;
  for (const def of MUSCLE_GROUPS) {
    runningByMuscle[def.id] = 0;
  }

  const sortedDates = Object.keys(logs)
    .filter((d) => isValidDateKey(d) && d < windowStartKey)
    .sort();

  for (const d of sortedDates) {
    const entry = logs[d];
    if (!entry) continue;
    const breakdown = calculateDayGainsBreakdown(
      entry,
      defaultDailyBaseGrams,
      accrueOnRestDays,
      allocationConfig,
    );
    runningTotal = roundGrams(runningTotal + breakdown.totalGrams);
    for (const def of MUSCLE_GROUPS) {
      runningByMuscle[def.id] = roundGrams(
        runningByMuscle[def.id] + (breakdown.byMuscle[def.id] ?? 0),
      );
    }
  }

  const startBaselineGrams = runningTotal;
  const points: DailyTrendPoint[] = [];
  let activeDaysCount = 0;

  for (let i = 0; i < safeDays; i++) {
    const dateKey = shiftDateKey(windowStartKey, i);
    const entry = logs[dateKey];
    const muscles = entry
      ? Array.from(new Set(entry.muscles)).filter((id) => VALID_MUSCLE_IDS.has(id))
      : [];
    const sleepHours = entry ? clampSleepHours(entry.sleepHours) : DEFAULT_SLEEP_HOURS;
    const breakdown = calculateDayGainsBreakdown(
      entry,
      defaultDailyBaseGrams,
      entry ? accrueOnRestDays : false,
      allocationConfig,
    );
    const recovery = breakdown.recovery;
    const dailyGainGrams = breakdown.totalGrams;

    if (
      muscles.length > 0 ||
      entry?.trained ||
      (breakdown.gainMode === 'manual' && dailyGainGrams > 0)
    ) {
      activeDaysCount += 1;
    }

    runningTotal = roundGrams(runningTotal + dailyGainGrams);
    const byMuscleCumulative = {} as Record<MuscleId, number>;
    const byMuscleDaily = {} as Record<MuscleId, number>;
    for (const def of MUSCLE_GROUPS) {
      const mDaily = breakdown.byMuscle[def.id] ?? 0;
      byMuscleDaily[def.id] = mDaily;
      runningByMuscle[def.id] = roundGrams(runningByMuscle[def.id] + mDaily);
      byMuscleCumulative[def.id] = runningByMuscle[def.id];
    }

    const [, m, d] = dateKey.split('-');

    points.push({
      dateKey,
      shortLabel: `${Number(d)}.${Number(m)}`,
      fullDateLabel: formatBgDate(dateKey),
      dailyGainGrams,
      cumulativeGrams: runningTotal,
      byMuscleCumulative,
      byMuscleDaily,
      trainedMuscles: muscles,
      trainedMuscleCount: muscles.length,
      sleepHours,
      huaweiSleepScore: recovery.huaweiSleepScore,
      recoveryPercentage: recovery.percentage,
      recoverySource: recovery.source,
      isFatigued: (muscles.length > 0 || Boolean(entry?.trained)) && recovery.isFatigued,
    });
  }

  return {
    points,
    startBaselineGrams,
    endTotalGrams: runningTotal,
    windowGainGrams: roundGrams(runningTotal - startBaselineGrams),
    activeDaysCount,
  };
}

export interface HistoryLogRow {
  dayNumber: number;
  date: string;
  trained: boolean;
  muscles: MuscleId[];
  dailyGainGrams: number;
  cumulativeGrams: number;
  sleepHours: number;
  huaweiSleepScore?: number;
  recoveryPercentage: number;
  gainMode: MuscleGainMode;
}

export function buildChronologicalHistoryRows(
  logs: Record<string, DayLog>,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): HistoryLogRow[] {
  const sortedDates = Object.keys(logs)
    .filter((d) => isValidDateKey(d))
    .sort();

  let cumulative = 0;
  return sortedDates.map((dateKey, idx) => {
    const entry = logs[dateKey];
    const muscles = Array.from(new Set(entry.muscles)).filter((id) =>
      VALID_MUSCLE_IDS.has(id),
    );
    const breakdown = calculateDayGainsBreakdown(
      entry,
      defaultDailyBaseGrams,
      accrueOnRestDays,
      allocationConfig,
    );
    cumulative = roundGrams(cumulative + breakdown.totalGrams);
    return {
      dayNumber: idx + 1,
      date: dateKey,
      trained: Boolean(entry.trained || muscles.length > 0),
      muscles,
      dailyGainGrams: breakdown.totalGrams,
      cumulativeGrams: cumulative,
      sleepHours: clampSleepHours(entry.sleepHours),
      huaweiSleepScore: breakdown.recovery.huaweiSleepScore,
      recoveryPercentage: breakdown.recovery.percentage,
      gainMode: breakdown.gainMode,
    };
  });
}

export function applyAutoDailyRollover(
  state: DiaryState,
  todayKey: string,
): { state: DiaryState; changed: boolean } {
  if (!state.autoAccrueDaily) {
    return { state, changed: false };
  }

  const dates = Object.keys(state.logs)
    .filter((d) => isValidDateKey(d))
    .sort();

  if (dates.length === 0) {
    return {
      changed: true,
      state: {
        ...state,
        logs: {
          [todayKey]: {
            date: todayKey,
            sleepHours: DEFAULT_SLEEP_HOURS,
            trained: false,
            muscles: [],
          },
        },
      },
    };
  }

  const latest = dates[dates.length - 1];
  if (latest >= todayKey) {
    return { state, changed: false };
  }

  const nextLogs = { ...state.logs };
  let cursor = shiftDateKey(latest, 1);
  let changed = false;
  let guard = 0;

  while (cursor <= todayKey && guard < 366) {
    guard += 1;
    if (!nextLogs[cursor]) {
      nextLogs[cursor] = {
        date: cursor,
        sleepHours: DEFAULT_SLEEP_HOURS,
        trained: false,
        muscles: [],
      };
      changed = true;
    }
    cursor = shiftDateKey(cursor, 1);
  }

  return changed ? { state: { ...state, logs: nextLogs }, changed: true } : { state, changed: false };
}

export type BulkBackfillMode = 'total_grams' | 'daily_grams';

export interface BulkBackfillOptions {
  startDate: string;
  endDate: string;
  mode: BulkBackfillMode;
  amountGrams: number;
  muscles: MuscleId[];
  sleepHours?: number;
  overwriteExisting?: boolean;
  existingLogs?: Record<string, DayLog>;
}

export interface BulkBackfillResult {
  targetDates: string[];
  generatedLogs: Record<string, DayLog>;
  mergedLogs: Record<string, DayLog>;
  totalAddedGrams: number;
  avgPerDayGrams: number;
}

export function generateBulkBackfillLogs(
  options: BulkBackfillOptions,
): BulkBackfillResult {
  const existingLogs = options.existingLogs ?? {};
  const mergedLogs: Record<string, DayLog> = { ...existingLogs };
  const generatedLogs: Record<string, DayLog> = {};

  if (
    !isValidDateKey(options.startDate) ||
    !isValidDateKey(options.endDate) ||
    options.startDate > options.endDate
  ) {
    return {
      targetDates: [],
      generatedLogs,
      mergedLogs,
      totalAddedGrams: 0,
      avgPerDayGrams: 0,
    };
  }

  const safeAmount = Number.isFinite(options.amountGrams)
    ? Math.max(0, Math.min(50000, roundGrams(options.amountGrams)))
    : 0;
  const cleanMuscles = Array.from(new Set(options.muscles)).filter((id) =>
    VALID_MUSCLE_IDS.has(id),
  );
  const defaultSleep = clampSleepHours(options.sleepHours ?? DEFAULT_SLEEP_HOURS);
  const overwriteExisting = Boolean(options.overwriteExisting);

  const allDatesInRange: string[] = [];
  let cursor = options.startDate;
  let guard = 0;
  while (cursor <= options.endDate && guard < 3650) {
    guard += 1;
    allDatesInRange.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }

  const targetDates = allDatesInRange.filter((d) => {
    if (overwriteExisting) return true;
    const prev = existingLogs[d];
    if (!prev) return true;
    const hasExistingMuscleData =
      prev.muscles.length > 0 ||
      Boolean(prev.trained) ||
      (prev.muscleGainMode === 'manual' && (prev.manualGainGrams ?? 0) > 0);
    return !hasExistingMuscleData;
  });

  if (targetDates.length === 0) {
    return {
      targetDates,
      generatedLogs,
      mergedLogs,
      totalAddedGrams: 0,
      avgPerDayGrams: 0,
    };
  }

  const perDayGramsList: number[] = [];
  if (options.mode === 'daily_grams') {
    const clampedDaily = clampManualDayGainGrams(safeAmount) ?? 0;
    for (let i = 0; i < targetDates.length; i++) {
      perDayGramsList.push(clampedDaily);
    }
  } else {
    const even = roundGrams(safeAmount / targetDates.length);
    let allocated = 0;
    for (let i = 0; i < targetDates.length; i++) {
      if (i === targetDates.length - 1) {
        perDayGramsList.push(Math.max(0, roundGrams(safeAmount - allocated)));
      } else {
        perDayGramsList.push(even);
        allocated = roundGrams(allocated + even);
      }
    }
  }

  let totalAddedGrams = 0;
  targetDates.forEach((dateKey, idx) => {
    const dayGrams = perDayGramsList[idx] ?? 0;
    totalAddedGrams = roundGrams(totalAddedGrams + dayGrams);
    const prev = existingLogs[dateKey];
    const entry: DayLog = {
      ...(prev ?? { date: dateKey, sleepHours: defaultSleep, muscles: [] }),
      date: dateKey,
      sleepHours: prev ? prev.sleepHours : defaultSleep,
      muscleGainMode: 'manual',
      manualGainGrams: dayGrams,
      trained: cleanMuscles.length > 0 || dayGrams > 0,
      muscles: cleanMuscles,
    };
    generatedLogs[dateKey] = entry;
    mergedLogs[dateKey] = entry;
  });

  return {
    targetDates,
    generatedLogs,
    mergedLogs,
    totalAddedGrams,
    avgPerDayGrams: roundGrams(totalAddedGrams / targetDates.length),
  };
}

export function getMuscleProgress(totalGrams: number): {
  level: number;
  currentInLevel: number;
  targetForLevel: number;
  percent: number;
} {
  const safeGrams = Math.max(0, totalGrams);
  const level = Math.floor(safeGrams / MILESTONE_STEP_GRAMS) + 1;
  const currentInLevel = roundGrams(safeGrams % MILESTONE_STEP_GRAMS);
  const percent = Math.min(
    100,
    Math.round((currentInLevel / MILESTONE_STEP_GRAMS) * 100),
  );
  return {
    level,
    currentInLevel,
    targetForLevel: MILESTONE_STEP_GRAMS,
    percent,
  };
}

export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y &&
    dt.getMonth() === m - 1 &&
    dt.getDate() === d
  );
}

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return getLocalDateKey(dt);
}

const BG_MONTHS = [
  'януари',
  'февруари',
  'март',
  'април',
  'май',
  'юни',
  'юли',
  'август',
  'септември',
  'октомври',
  'ноември',
  'декември',
];

const BG_MONTHS_TITLE = [
  'Януари',
  'Февруари',
  'Март',
  'Април',
  'Май',
  'Юни',
  'Юли',
  'Август',
  'Септември',
  'Октомври',
  'Ноември',
  'Декември',
];

const BG_WEEKDAYS = [
  'Неделя',
  'Понеделник',
  'Вторник',
  'Сряда',
  'Четвъртък',
  'Петък',
  'Събота',
];

export function formatBgDate(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${d} ${BG_MONTHS[m - 1]} ${y}`;
}

export function formatBgNumericDate(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return dateKey;
  const [y, m, d] = dateKey.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export function getBgWeekdayName(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return BG_WEEKDAYS[dt.getDay()] ?? '';
}

export interface SelectedDateBadgeInfo {
  kind: 'yesterday' | 'today' | 'older';
  numericDate: string;
  weekdayName: string;
  fullBadge: string;
  shortContext: string;
}

export function formatSelectedDateBadge(
  selectedDate: string,
  todayKey: string,
): SelectedDateBadgeInfo {
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const numericDate = formatBgNumericDate(selectedDate);
  const weekdayName = getBgWeekdayName(selectedDate);

  if (selectedDate === yesterdayKey) {
    return {
      kind: 'yesterday',
      numericDate,
      weekdayName,
      fullBadge: `📅 ВЧЕРА (${numericDate})`,
      shortContext: 'Вчера',
    };
  }
  if (selectedDate === todayKey) {
    return {
      kind: 'today',
      numericDate,
      weekdayName,
      fullBadge: `📅 ДНЕС (${numericDate})`,
      shortContext: 'Днес',
    };
  }
  const olderLabel = weekdayName ? `${weekdayName}, ${numericDate}` : numericDate;
  return {
    kind: 'older',
    numericDate,
    weekdayName,
    fullBadge: `📅 ${olderLabel}`,
    shortContext: olderLabel,
  };
}

export function formatBgMonthYear(year: number, monthIndex: number): string {
  return `${BG_MONTHS_TITLE[monthIndex]} ${year}`;
}

export interface CalendarCell {
  dateKey: string;
  dayNumber: number;
  inCurrentMonth: boolean;
}

export function getMonthGrid(year: number, monthIndex: number): CalendarCell[] {
  const firstDay = new Date(year, monthIndex, 1);
  // Convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dt = new Date(year, monthIndex, 1 - startOffset + i);
    cells.push({
      dateKey: getLocalDateKey(dt),
      dayNumber: dt.getDate(),
      inCurrentMonth: dt.getMonth() === monthIndex,
    });
  }
  return cells;
}

export function roundOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatNumberBg(value: number): string {
  const rounded = roundOneDecimal(value);
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
}

export function sanitizeMeasurementValue(
  raw: unknown,
  min: number,
  max: number,
): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  const clamped = Math.max(min, Math.min(max, num));
  return roundOneDecimal(clamped);
}

export function sanitizeBodyMeasurements(
  raw?: Partial<BodyMeasurements> | null,
): BodyMeasurements {
  if (!raw || typeof raw !== 'object') return {};
  const result: BodyMeasurements = {};
  const weightKg = sanitizeMeasurementValue(raw.weightKg, 20, 400);
  const muscleMassKg = sanitizeMeasurementValue(raw.muscleMassKg, 5, 250);
  const bodyFatPercent = sanitizeMeasurementValue(raw.bodyFatPercent, 2, 80);
  const bodyFatKg = sanitizeMeasurementValue(raw.bodyFatKg, 0.5, 250);

  if (weightKg !== undefined) result.weightKg = weightKg;
  if (muscleMassKg !== undefined) result.muscleMassKg = muscleMassKg;
  if (bodyFatPercent !== undefined) result.bodyFatPercent = bodyFatPercent;
  if (bodyFatKg !== undefined) result.bodyFatKg = bodyFatKg;
  return result;
}

export function hasAnyBodyMeasurement(entry?: Partial<BodyMeasurements> | null): boolean {
  if (!entry) return false;
  return (
    entry.weightKg !== undefined ||
    entry.muscleMassKg !== undefined ||
    entry.bodyFatPercent !== undefined ||
    entry.bodyFatKg !== undefined
  );
}

export function getLatestBodyMeasurement(
  logs: Record<string, DayLog>,
  field: keyof BodyMeasurements,
  upToDate?: string,
): { date: string; value: number } | null {
  const dates = Object.keys(logs)
    .filter((d) => isValidDateKey(d) && (!upToDate || d <= upToDate))
    .sort()
    .reverse();

  for (const d of dates) {
    const val = logs[d]?.[field];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return { date: d, value: val };
    }
  }
  return null;
}

export function getCurrentWeightKg(
  state: Pick<DiaryState, 'logs' | 'profile'>,
  todayKey: string,
): number | undefined {
  const todayWeight = state.logs[todayKey]?.weightKg;
  if (typeof todayWeight === 'number' && Number.isFinite(todayWeight)) {
    return todayWeight;
  }
  const latestLogged = getLatestBodyMeasurement(state.logs, 'weightKg', todayKey);
  if (latestLogged) return latestLogged.value;
  if (typeof state.profile.weightKg === 'number' && Number.isFinite(state.profile.weightKg)) {
    return state.profile.weightKg;
  }
  return undefined;
}

export function getWeightAtOrBeforeDate(
  logs: Record<string, DayLog>,
  dateKey: string,
  fallbackWeight?: number | '',
): number | undefined {
  const atOrBefore = getLatestBodyMeasurement(logs, 'weightKg', dateKey);
  if (atOrBefore) return atOrBefore.value;

  const afterDates = Object.keys(logs)
    .filter((d) => isValidDateKey(d) && d >= dateKey && typeof logs[d]?.weightKg === 'number')
    .sort();
  if (afterDates.length > 0) {
    return logs[afterDates[0]].weightKg;
  }
  if (typeof fallbackWeight === 'number' && Number.isFinite(fallbackWeight)) {
    return fallbackWeight;
  }
  return undefined;
}

export function diffCalendarDays(fromDateKey: string, toDateKey: string): number {
  if (!isValidDateKey(fromDateKey) || !isValidDateKey(toDateKey)) return 0;
  const [fy, fm, fd] = fromDateKey.split('-').map(Number);
  const [ty, tm, td] = toDateKey.split('-').map(Number);
  const fromDt = new Date(fy, fm - 1, fd, 12, 0, 0);
  const toDt = new Date(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toDt.getTime() - fromDt.getTime()) / (24 * 60 * 60 * 1000));
}

export function addCalendarDuration(
  startDateKey: string,
  value: number,
  unit: DurationUnit,
): string {
  if (!isValidDateKey(startDateKey)) return startDateKey;
  const safeVal = Math.max(1, Math.round(value));
  const [y, m, d] = startDateKey.split('-').map(Number);
  if (unit === 'days') {
    return shiftDateKey(startDateKey, safeVal);
  }
  if (unit === 'weeks') {
    return shiftDateKey(startDateKey, safeVal * 7);
  }
  const targetMonthIndex = m - 1 + safeVal;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const normMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDayInMonth = new Date(targetYear, normMonth + 1, 0).getDate();
  const clampedDay = Math.min(d, maxDayInMonth);
  return getLocalDateKey(new Date(targetYear, normMonth, clampedDay));
}

export function formatDurationBg(totalDays: number): string {
  const days = Math.max(0, Math.round(totalDays));
  if (days === 0) return 'Постигнато днес';
  if (days === 1) return '1 ден';
  if (days < 14) return `${days} дни`;
  if (days < 60) {
    const weeks = Math.floor(days / 7);
    const remDays = days % 7;
    const wLabel = weeks === 1 ? '1 седмица' : `${weeks} седмици`;
    if (remDays === 0) return wLabel;
    return `${wLabel} и ${remDays} ${remDays === 1 ? 'ден' : 'дни'}`;
  }
  const months = Math.floor(days / 30);
  const remDays = days % 30;
  const mLabel = months === 1 ? '1 месец' : `${months} месеца`;
  if (remDays < 3) return `${mLabel} (${days} дни)`;
  return `${mLabel} и ${remDays} дни`;
}

export function computeGainedMuscleBetween(
  logs: Record<string, DayLog>,
  startDateKey: string,
  endDateKey: string,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): number {
  let total = 0;
  for (const [dateKey, entry] of Object.entries(logs)) {
    if (!isValidDateKey(dateKey)) continue;
    if (dateKey < startDateKey || dateKey > endDateKey) continue;
    if (!entry) continue;
    total = roundGrams(
      total +
        calculateDayGainsBreakdown(
          entry,
          defaultDailyBaseGrams,
          accrueOnRestDays,
          allocationConfig,
        ).totalGrams,
    );
  }
  return total;
}

const GOAL_IDS: FitnessGoal['id'][] = ['goal-1', 'goal-2', 'goal-3'];

export function createEmptyGoal(
  slotIndex: 1 | 2 | 3,
  todayKey: string,
  defaultWeight?: number,
): FitnessGoal {
  const id = GOAL_IDS[slotIndex - 1];
  return {
    id,
    slotIndex,
    enabled: false,
    title: '',
    type: slotIndex === 1 ? 'target_weight' : slotIndex === 2 ? 'muscle_mass_gain' : 'weight_loss',
    timeMode: slotIndex === 2 ? 'estimate_time' : 'calendar_duration',
    targetValue: slotIndex === 1 ? Math.max(45, (defaultWeight ?? 78) - 3) : slotIndex === 2 ? 500 : 4,
    muscleUnit: 'g',
    startDate: todayKey,
    ...(typeof defaultWeight === 'number' && Number.isFinite(defaultWeight) && defaultWeight > 0
      ? { startWeightKg: defaultWeight }
      : {}),
    durationValue: 8,
    durationUnit: 'weeks',
    targetDate: shiftDateKey(todayKey, 60),
  };
}

export function createDefaultGoals(todayKey: string, defaultWeight?: number): FitnessGoal[] {
  return [
    createEmptyGoal(1, todayKey, defaultWeight),
    createEmptyGoal(2, todayKey, defaultWeight),
    createEmptyGoal(3, todayKey, defaultWeight),
  ];
}

export function createSampleGoals(todayKey: string): FitnessGoal[] {
  return [
    {
      id: 'goal-1',
      slotIndex: 1,
      enabled: true,
      title: '',
      type: 'target_weight',
      timeMode: 'until_date',
      targetValue: 76,
      muscleUnit: 'g',
      startDate: shiftDateKey(todayKey, -12),
      startWeightKg: 80.4,
      durationValue: 60,
      durationUnit: 'days',
      targetDate: shiftDateKey(todayKey, 45),
    },
    {
      id: 'goal-2',
      slotIndex: 2,
      enabled: true,
      title: '',
      type: 'muscle_mass_gain',
      timeMode: 'estimate_time',
      targetValue: 500,
      muscleUnit: 'g',
      startDate: shiftDateKey(todayKey, -12),
      durationValue: 12,
      durationUnit: 'weeks',
      targetDate: shiftDateKey(todayKey, 90),
    },
    {
      id: 'goal-3',
      slotIndex: 3,
      enabled: true,
      title: '',
      type: 'weight_loss',
      timeMode: 'calendar_duration',
      targetValue: 4,
      muscleUnit: 'g',
      startDate: shiftDateKey(todayKey, -12),
      startWeightKg: 80.4,
      durationValue: 8,
      durationUnit: 'weeks',
      targetDate: shiftDateKey(todayKey, 44),
    },
  ];
}

export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  target_weight: 'Целево тегло',
  muscle_mass_gain: 'Мускулна маса',
  weight_loss: 'Свалено тегло',
};

export const GOAL_TIME_MODE_LABELS: Record<GoalTimeMode, string> = {
  calendar_duration: 'За календарно време',
  until_date: 'До дата',
  estimate_time: 'Колко време ще отнеме',
};

const DURATION_UNIT_LABELS: Record<DurationUnit, [string, string]> = {
  days: ['ден', 'дни'],
  weeks: ['седмица', 'седмици'],
  months: ['месец', 'месеца'],
};

export function evaluateGoal(
  goal: FitnessGoal,
  state: Pick<
    DiaryState,
    | 'logs'
    | 'profile'
    | 'dailyMuscleGainGrams'
    | 'accrueOnRestDays'
    | 'muscleAllocationMode'
    | 'muscleAllocationScope'
    | 'muscleAllocations'
  >,
  todayKey: string,
): GoalEvaluation {
  const typeLabel = GOAL_TYPE_LABELS[goal.type];
  const timeModeLabel = GOAL_TIME_MODE_LABELS[goal.timeMode];
  const fallbackTitle =
    goal.type === 'target_weight'
      ? `Целево тегло: ${formatNumberBg(goal.targetValue)} кг`
      : goal.type === 'weight_loss'
        ? `Сваляне на ${formatNumberBg(goal.targetValue)} кг`
        : `Мускулна маса: +${formatNumberBg(goal.targetValue)} ${goal.muscleUnit === 'kg' ? 'кг' : 'г'}`;
  const displayTitle = goal.title.trim() || fallbackTitle;

  const currentWeight = getCurrentWeightKg(state, todayKey);
  const startWeight =
    goal.startWeightKg ??
    getWeightAtOrBeforeDate(state.logs, goal.startDate, state.profile.weightKg);

  let progressPercent = 0;
  let isCompleted = false;
  let hasRequiredData = true;
  let missingDataMessage: string | undefined;
  let currentText = '';
  let targetText = '';
  let remainingText = '';
  let remainingNumeric = 0;
  let unitLabel = 'кг';

  if (goal.type === 'target_weight') {
    targetText = `${formatNumberBg(goal.targetValue)} кг`;
    if (currentWeight === undefined || startWeight === undefined) {
      hasRequiredData = false;
      missingDataMessage =
        'Въведи тегло (кг) в дневните измервания или в профила, за да следиш целта.';
      currentText = '— кг';
      remainingText = 'Няма въведено тегло';
    } else {
      currentText = `${formatNumberBg(currentWeight)} кг`;
      const totalSpan = Math.abs(goal.targetValue - startWeight);
      const isCutting = goal.targetValue < startWeight;
      const diffRemaining = isCutting
        ? currentWeight - goal.targetValue
        : goal.targetValue - currentWeight;

      if (totalSpan < 0.05) {
        isCompleted = Math.abs(currentWeight - goal.targetValue) < 0.1;
        progressPercent = isCompleted ? 100 : 0;
        remainingNumeric = Math.abs(currentWeight - goal.targetValue);
      } else if (diffRemaining <= 0) {
        isCompleted = true;
        progressPercent = 100;
        remainingNumeric = 0;
      } else {
        const progressed = isCutting
          ? startWeight - currentWeight
          : currentWeight - startWeight;
        progressPercent = Math.max(0, Math.min(100, Math.round((progressed / totalSpan) * 100)));
        remainingNumeric = roundOneDecimal(diffRemaining);
      }

      remainingText = isCompleted
        ? 'Целта е постигната!'
        : `Остават ${formatNumberBg(remainingNumeric)} кг (${isCutting ? 'за сваляне' : 'за качване'})`;
    }
  } else if (goal.type === 'weight_loss') {
    const targetLoss = Math.max(0.1, goal.targetValue);
    targetText = `-${formatNumberBg(targetLoss)} кг`;
    if (currentWeight === undefined || startWeight === undefined) {
      hasRequiredData = false;
      missingDataMessage =
        'Въведи начално и текущо тегло (кг), за да изчислим свалените килограми.';
      currentText = '— кг';
      remainingText = 'Няма въведено тегло';
    } else {
      const lost = Math.max(0, roundOneDecimal(startWeight - currentWeight));
      currentText = `${formatNumberBg(lost)} кг свалени (сега ${formatNumberBg(currentWeight)} кг)`;
      progressPercent = Math.max(0, Math.min(100, Math.round((lost / targetLoss) * 100)));
      remainingNumeric = Math.max(0, roundOneDecimal(targetLoss - lost));
      isCompleted = remainingNumeric <= 0;
      remainingText = isCompleted
        ? 'Целта е постигната!'
        : `Остават ${formatNumberBg(remainingNumeric)} кг за сваляне`;
    }
  } else {
    // muscle_mass_gain
    const targetGrams =
      goal.muscleUnit === 'kg'
        ? Math.max(10, goal.targetValue * 1000)
        : Math.max(1, goal.targetValue);
    const gainedGrams = computeGainedMuscleBetween(
      state.logs,
      goal.startDate,
      todayKey,
      state.dailyMuscleGainGrams,
      state.accrueOnRestDays,
      getAllocationConfigFromState(state),
    );
    const remainingGrams = Math.max(0, roundGrams(targetGrams - gainedGrams));
    progressPercent = Math.max(0, Math.min(100, Math.round((gainedGrams / targetGrams) * 100)));
    isCompleted = remainingGrams <= 0;

    if (goal.muscleUnit === 'kg') {
      unitLabel = 'кг';
      const gainedKg = Math.round((gainedGrams / 1000) * 1000) / 1000;
      const remKg = Math.round((remainingGrams / 1000) * 1000) / 1000;
      currentText = `${gainedKg.toFixed(2)} кг (${formatGrams(gainedGrams)} г)`;
      targetText = `+${formatNumberBg(goal.targetValue)} кг`;
      remainingText = isCompleted
        ? 'Целта е постигната!'
        : `Остават ${remKg.toFixed(2)} кг (${formatGrams(remainingGrams)} г)`;
      remainingNumeric = remainingGrams;
    } else {
      unitLabel = 'г';
      currentText = `+${formatGrams(gainedGrams)} г`;
      targetText = `+${formatGrams(targetGrams)} г`;
      remainingText = isCompleted
        ? 'Целта е постигната!'
        : `Остават ${formatGrams(remainingGrams)} г`;
      remainingNumeric = remainingGrams;
    }
  }

  // Timeframe & estimation computations
  let deadlineDate: string | undefined;
  let totalDays: number | undefined;
  let daysRemaining: number | undefined;
  let requiredPaceText: string | undefined;
  let actualPaceText: string | undefined;
  let estimatedDaysTotal: number | undefined;
  let estimatedDaysRemaining: number | undefined;
  let estimatedDurationText: string | undefined;
  let estimatedCompletionDate: string | undefined;
  let estimationNote: string | undefined;

  if (goal.timeMode === 'calendar_duration' || goal.timeMode === 'until_date') {
    deadlineDate =
      goal.timeMode === 'calendar_duration'
        ? addCalendarDuration(goal.startDate, goal.durationValue, goal.durationUnit)
        : goal.targetDate;

    totalDays = Math.max(1, diffCalendarDays(goal.startDate, deadlineDate));
    daysRemaining = diffCalendarDays(todayKey, deadlineDate);

    if (goal.timeMode === 'calendar_duration') {
      const [sing, plur] = DURATION_UNIT_LABELS[goal.durationUnit];
      estimationNote = `Срок: ${goal.durationValue} ${goal.durationValue === 1 ? sing : plur} (до ${formatBgDate(deadlineDate)})`;
    } else {
      estimationNote = `Крайна дата: ${formatBgDate(deadlineDate)}`;
    }

    if (hasRequiredData && !isCompleted) {
      if (daysRemaining > 0) {
        const weeksLeft = daysRemaining / 7;
        if (goal.type === 'muscle_mass_gain') {
          const gramsPerWeek = remainingNumeric / weeksLeft;
          const gramsPerDay = remainingNumeric / daysRemaining;
          requiredPaceText = `${formatGrams(gramsPerWeek)} г/седм. (${formatGrams(gramsPerDay)} г/ден)`;
        } else {
          const kgPerWeek = remainingNumeric / weeksLeft;
          requiredPaceText = `${(Math.round(kgPerWeek * 100) / 100).toFixed(2)} кг/седм.`;
        }
      } else {
        requiredPaceText = 'Срокът по датата е изтекъл';
      }
    }
  } else {
    // estimate_time: "Колко време ще ми отнеме"
    if (goal.type === 'muscle_mass_gain') {
      const targetGrams =
        goal.muscleUnit === 'kg'
          ? Math.max(10, goal.targetValue * 1000)
          : Math.max(1, goal.targetValue);
      const workoutDates = Object.keys(state.logs)
        .filter((d) => {
          if (!isValidDateKey(d) || d > todayKey) return false;
          const entry = state.logs[d];
          return (
            entry.muscles.length > 0 ||
            Boolean(entry.trained) ||
            (entry.muscleGainMode === 'manual' && (entry.manualGainGrams ?? 0) > 0)
          );
        })
        .sort();

      let dailyRateGrams = 0;
      let usingReferenceRate = false;

      if (workoutDates.length > 0) {
        const firstWorkout = workoutDates[0];
        const historyDays = Math.max(7, diffCalendarDays(firstWorkout, todayKey) + 1);
        const totalHistoryGrams = computeGainedMuscleBetween(
          state.logs,
          firstWorkout,
          todayKey,
          state.dailyMuscleGainGrams,
          state.accrueOnRestDays,
          getAllocationConfigFromState(state),
        );
        if (totalHistoryGrams > 0) {
          dailyRateGrams = totalHistoryGrams / historyDays;
        }
      }

      if (dailyRateGrams <= 0) {
        // Fallback reference pace: ~3 workouts/week (~14g each at 8h sleep = 42g/week = 6g/day)
        dailyRateGrams = 6;
        usingReferenceRate = true;
      }

      const weeklyRateGrams = roundGrams(dailyRateGrams * 7);
      actualPaceText = usingReferenceRate
        ? `~${formatGrams(weeklyRateGrams)} г/седм. (ориентир 3 тр./седм.)`
        : `${formatGrams(weeklyRateGrams)} г/седм. (${formatGrams(dailyRateGrams)} г/ден)`;

      estimatedDaysTotal = Math.ceil(targetGrams / dailyRateGrams);
      estimatedDaysRemaining = isCompleted ? 0 : Math.ceil(remainingNumeric / dailyRateGrams);
      estimatedDurationText = isCompleted
        ? 'Целта вече е достигната'
        : formatDurationBg(estimatedDaysRemaining);
      estimatedCompletionDate = shiftDateKey(todayKey, estimatedDaysRemaining);
      estimationNote = usingReferenceRate
        ? 'Нямаш записани тренировки за реална статистика — прогнозата е по стандартно темпо (~42 г/седм. при 8 ч сън).'
        : 'Изчислено по твоето реално темпо от тренировките и съня досега.';
    } else if (hasRequiredData) {
      // Weight-based time estimation from logged daily weights
      const weightEntries = Object.keys(state.logs)
        .filter((d) => isValidDateKey(d) && d <= todayKey && typeof state.logs[d]?.weightKg === 'number')
        .sort()
        .map((d) => ({ date: d, weight: state.logs[d].weightKg as number }));

      if (isCompleted) {
        estimatedDaysRemaining = 0;
        estimatedDurationText = 'Постигнато';
        estimatedCompletionDate = todayKey;
      } else if (weightEntries.length >= 2) {
        const first = weightEntries[0];
        const last = weightEntries[weightEntries.length - 1];
        const spanDays = Math.max(1, diffCalendarDays(first.date, last.date));
        const deltaKg = last.weight - first.weight;
        const wantsLoss =
          goal.type === 'weight_loss' ||
          (goal.type === 'target_weight' &&
            currentWeight !== undefined &&
            goal.targetValue < currentWeight);
        const dailyProgressKg = wantsLoss ? -deltaKg / spanDays : deltaKg / spanDays;

        if (dailyProgressKg > 0.005) {
          const weeklyKg = Math.round(dailyProgressKg * 7 * 100) / 100;
          actualPaceText = `${weeklyKg.toFixed(2)} ${unitLabel}/седм.`;
          estimatedDaysRemaining = Math.ceil(remainingNumeric / dailyProgressKg);
          estimatedDurationText = formatDurationBg(estimatedDaysRemaining);
          estimatedCompletionDate = shiftDateKey(todayKey, estimatedDaysRemaining);
          estimationNote = `На база ${weightEntries.length} измервания на теглото.`;
        } else {
          estimatedDurationText = 'Недостатъчен тренд';
          estimationNote =
            'Теглото все още не се движи към целта — добави още измервания или коригирай режима.';
        }
      } else {
        estimatedDurationText = 'Нужни са ≥ 2 измервания';
        estimationNote =
          'Въведи тегло в поне 2 различни дни, за да изчислим очакваното време.';
      }
    }
  }

  return {
    goalId: goal.id,
    displayTitle,
    typeLabel,
    timeModeLabel,
    progressPercent,
    isCompleted,
    hasRequiredData,
    missingDataMessage,
    currentText,
    targetText,
    remainingText,
    deadlineDate,
    totalDays,
    daysRemaining,
    requiredPaceText,
    actualPaceText,
    estimatedDaysTotal,
    estimatedDaysRemaining,
    estimatedDurationText,
    estimatedCompletionDate,
    estimationNote,
  };
}

export function getDefaultProfile(): UserProfile {
  return {
    name: '',
    heightCm: '',
    weightKg: '',
  };
}

export function createInitialDiaryState(): DiaryState {
  const todayKey = getLocalDateKey();
  return {
    profile: getDefaultProfile(),
    themeAccent: 'blue',
    logs: {},
    goals: createDefaultGoals(todayKey),
  };
}

export function createSampleDiaryLogs(todayKey: string): Record<string, DayLog> {
  const samplePattern: ({
    offset: number;
    sleepHours: number;
    huaweiSleepScore: number;
    muscles: MuscleId[];
  } & BodyMeasurements)[] = [
    { offset: -12, sleepHours: 8, huaweiSleepScore: 91, muscles: ['chest', 'triceps', 'abs'], weightKg: 80.4, bodyFatPercent: 18.2 },
    { offset: -10, sleepHours: 8.5, huaweiSleepScore: 94, muscles: ['back', 'biceps'], weightKg: 80.1 },
    { offset: -8, sleepHours: 5.5, huaweiSleepScore: 52, muscles: ['legs', 'shoulders'], weightKg: 79.8, muscleMassKg: 35.1, bodyFatPercent: 17.8, bodyFatKg: 14.2 },
    { offset: -6, sleepHours: 8, huaweiSleepScore: 86, muscles: ['chest', 'shoulders', 'triceps'], weightKg: 79.6, bodyFatPercent: 17.6 },
    { offset: -4, sleepHours: 7.5, huaweiSleepScore: 79, muscles: ['back', 'biceps', 'abs'], weightKg: 79.4, muscleMassKg: 35.3 },
    { offset: -2, sleepHours: 8, huaweiSleepScore: 90, muscles: ['legs', 'abs'], weightKg: 79.2 },
    { offset: -1, sleepHours: 8, huaweiSleepScore: 88, muscles: ['shoulders', 'biceps', 'triceps'], weightKg: 79.0, muscleMassKg: 35.5, bodyFatPercent: 17.2, bodyFatKg: 13.6 },
  ];

  const logs: Record<string, DayLog> = {};
  for (const item of samplePattern) {
    const dateKey = shiftDateKey(todayKey, item.offset);
    const measurements = sanitizeBodyMeasurements(item);
    logs[dateKey] = {
      date: dateKey,
      sleepHours: item.sleepHours,
      huaweiSleepScore: item.huaweiSleepScore,
      recoveryMode: 'auto',
      muscles: item.muscles,
      ...measurements,
    };
  }
  return logs;
}

export function getLatestPastLoggedDate(
  logs: Record<string, DayLog>,
  todayKey: string,
): string | null {
  const pastDates = Object.keys(logs)
    .filter((d) => isValidDateKey(d) && d < todayKey && logs[d].muscles.length > 0)
    .sort();
  if (pastDates.length === 0) return null;
  return pastDates[pastDates.length - 1];
}

export function exportDiaryPayload(state: DiaryState): string {
  return JSON.stringify(
    {
      app: 'FizioProgres',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  );
}

const VALID_GOAL_TYPES: GoalType[] = ['target_weight', 'muscle_mass_gain', 'weight_loss'];
const VALID_TIME_MODES: GoalTimeMode[] = ['calendar_duration', 'until_date', 'estimate_time'];
const VALID_DURATION_UNITS: DurationUnit[] = ['days', 'weeks', 'months'];
const VALID_MUSCLE_UNITS: MuscleGoalUnit[] = ['g', 'kg'];

function parseGoalSlot(
  raw: unknown,
  slotIndex: 1 | 2 | 3,
  todayKey: string,
  defaultWeight?: number,
): FitnessGoal {
  const fallback = createEmptyGoal(slotIndex, todayKey, defaultWeight);
  if (!raw || typeof raw !== 'object') return fallback;
  const obj = raw as Partial<FitnessGoal>;

  const type = VALID_GOAL_TYPES.includes(obj.type as GoalType)
    ? (obj.type as GoalType)
    : fallback.type;
  const timeMode = VALID_TIME_MODES.includes(obj.timeMode as GoalTimeMode)
    ? (obj.timeMode as GoalTimeMode)
    : fallback.timeMode;
  const durationUnit = VALID_DURATION_UNITS.includes(obj.durationUnit as DurationUnit)
    ? (obj.durationUnit as DurationUnit)
    : fallback.durationUnit;
  const muscleUnit = VALID_MUSCLE_UNITS.includes(obj.muscleUnit as MuscleGoalUnit)
    ? (obj.muscleUnit as MuscleGoalUnit)
    : fallback.muscleUnit;

  const targetValue =
    typeof obj.targetValue === 'number' && Number.isFinite(obj.targetValue) && obj.targetValue > 0
      ? roundOneDecimal(obj.targetValue)
      : fallback.targetValue;

  const durationValue =
    typeof obj.durationValue === 'number' &&
    Number.isFinite(obj.durationValue) &&
    obj.durationValue >= 1
      ? Math.min(1825, Math.round(obj.durationValue))
      : fallback.durationValue;

  const startWeightKg = sanitizeMeasurementValue(obj.startWeightKg, 20, 400);

  return {
    id: GOAL_IDS[slotIndex - 1],
    slotIndex,
    enabled: Boolean(obj.enabled),
    title: typeof obj.title === 'string' ? obj.title.slice(0, 80) : '',
    type,
    timeMode,
    targetValue,
    muscleUnit,
    startDate:
      typeof obj.startDate === 'string' && isValidDateKey(obj.startDate)
        ? obj.startDate
        : fallback.startDate,
    ...(startWeightKg !== undefined ? { startWeightKg } : {}),
    durationValue,
    durationUnit,
    targetDate:
      typeof obj.targetDate === 'string' && isValidDateKey(obj.targetDate)
        ? obj.targetDate
        : fallback.targetDate,
  };
}

export function parseDiaryPayload(rawText: string): {
  ok: true;
  state: DiaryState;
} | {
  ok: false;
  error: string;
} {
  try {
    const parsed = JSON.parse(rawText);
    const candidate = parsed && typeof parsed === 'object' && 'data' in parsed
      ? parsed.data
      : parsed;

    if (!candidate || typeof candidate !== 'object') {
      return { ok: false, error: 'Файлът не съдържа валидни данни за дневника.' };
    }

    const todayKey = getLocalDateKey();

    // Compatibility with MuscleTrackerDB_v2 JSON format (dailyGainRateGrams + entries[])
    if (Array.isArray((candidate as Record<string, unknown>).entries)) {
      const legacy = candidate as {
        dailyGainRateGrams?: unknown;
        entries: Array<{
          date?: unknown;
          trained?: unknown;
          gainedGrams?: unknown;
          groups?: unknown;
        }>;
      };
      const logs: Record<string, DayLog> = {};
      const mapLegacyGroup = (g: unknown): MuscleId[] => {
        if (typeof g !== 'string') return [];
        if (g === 'arms') return ['biceps', 'triceps'];
        if (g === 'core') return ['abs'];
        if (VALID_MUSCLE_IDS.has(g as MuscleId)) return [g as MuscleId];
        return [];
      };

      for (const item of legacy.entries) {
        if (!item || typeof item !== 'object') continue;
        if (typeof item.date !== 'string' || !isValidDateKey(item.date)) continue;
        const muscles = Array.isArray(item.groups)
          ? Array.from(new Set(item.groups.flatMap(mapLegacyGroup)))
          : [];
        const manualGainGrams = clampManualDayGainGrams(item.gainedGrams);
        const trained = Boolean(item.trained || muscles.length > 0);
        logs[item.date] = {
          date: item.date,
          sleepHours: DEFAULT_SLEEP_HOURS,
          trained,
          muscles,
          ...(manualGainGrams !== undefined
            ? { muscleGainMode: 'manual' as const, manualGainGrams }
            : {}),
        };
      }

      const dailyMuscleGainGrams = clampDailyMuscleGainGrams(legacy.dailyGainRateGrams);
      return {
        ok: true,
        state: {
          profile: getDefaultProfile(),
          themeAccent: 'blue',
          ...(dailyMuscleGainGrams !== undefined ? { dailyMuscleGainGrams } : {}),
          autoAccrueDaily: true,
          accrueOnRestDays: true,
          logs,
          goals: createDefaultGoals(todayKey),
        },
      };
    }

    const rawProfile = candidate.profile ?? {};
    const name = typeof rawProfile.name === 'string' ? rawProfile.name.slice(0, 60) : '';
    const heightCm =
      typeof rawProfile.heightCm === 'number' && Number.isFinite(rawProfile.heightCm)
        ? rawProfile.heightCm
        : '';
    const weightKg =
      typeof rawProfile.weightKg === 'number' && Number.isFinite(rawProfile.weightKg)
        ? rawProfile.weightKg
        : '';

    const validAccents: ThemeAccent[] = ['blue', 'green', 'purple', 'orange'];
    const themeAccent: ThemeAccent = validAccents.includes(candidate.themeAccent)
      ? candidate.themeAccent
      : 'blue';

    const logs: Record<string, DayLog> = {};
    if (candidate.logs && typeof candidate.logs === 'object') {
      for (const [key, val] of Object.entries(candidate.logs)) {
        if (!isValidDateKey(key) || !val || typeof val !== 'object') continue;
        const entry = val as Partial<DayLog>;
        const sleepHours = clampSleepHours(
          typeof entry.sleepHours === 'number' ? entry.sleepHours : DEFAULT_SLEEP_HOURS,
        );
        const muscles = Array.isArray(entry.muscles)
          ? Array.from(
              new Set(
                entry.muscles.filter((m): m is MuscleId =>
                  VALID_MUSCLE_IDS.has(m as MuscleId),
                ),
              ),
            )
          : [];
        const measurements = sanitizeBodyMeasurements(entry);
        const huaweiSleepScore = clampHuaweiSleepScore(entry.huaweiSleepScore);
        const recoveryMode: RecoveryMode | undefined =
          entry.recoveryMode === 'manual' ? 'manual' : entry.recoveryMode === 'auto' ? 'auto' : undefined;
        const manualRecoveryPercent = clampManualRecoveryPercent(entry.manualRecoveryPercent);
        const muscleGainMode: MuscleGainMode | undefined =
          entry.muscleGainMode === 'manual' ? 'manual' : entry.muscleGainMode === 'auto' ? 'auto' : undefined;
        const baseDailyGainGrams = clampDailyMuscleGainGrams(entry.baseDailyGainGrams);
        const manualGainGrams = clampManualDayGainGrams(entry.manualGainGrams);
        const manualMuscleGrams = sanitizeManualMuscleGramsMap(entry.manualMuscleGrams);
        const trained = typeof entry.trained === 'boolean' ? entry.trained : undefined;
        logs[key] = {
          date: key,
          sleepHours,
          muscles,
          ...(trained !== undefined ? { trained } : {}),
          ...(huaweiSleepScore !== undefined ? { huaweiSleepScore } : {}),
          ...(recoveryMode !== undefined ? { recoveryMode } : {}),
          ...(manualRecoveryPercent !== undefined ? { manualRecoveryPercent } : {}),
          ...(muscleGainMode !== undefined ? { muscleGainMode } : {}),
          ...(baseDailyGainGrams !== undefined ? { baseDailyGainGrams } : {}),
          ...(manualGainGrams !== undefined ? { manualGainGrams } : {}),
          ...(manualMuscleGrams !== undefined ? { manualMuscleGrams } : {}),
          ...measurements,
        };
      }
    }

    const dailyMuscleGainGrams = clampDailyMuscleGainGrams(candidate.dailyMuscleGainGrams);
    const autoAccrueDaily = Boolean(candidate.autoAccrueDaily);
    const accrueOnRestDays = Boolean(candidate.accrueOnRestDays);
    const muscleAllocationMode: MuscleAllocationMode | undefined =
      candidate.muscleAllocationMode === 'custom_percent' ? 'custom_percent' : undefined;
    const muscleAllocationScope: MuscleAllocationScope | undefined =
      candidate.muscleAllocationScope === 'all_groups'
        ? 'all_groups'
        : candidate.muscleAllocationScope === 'trained_only'
          ? 'trained_only'
          : undefined;
    const muscleAllocations = sanitizeMusclePercentMap(candidate.muscleAllocations);

    const numericWeight = typeof weightKg === 'number' ? weightKg : undefined;
    const rawGoals = Array.isArray(candidate.goals) ? candidate.goals : [];
    const goals: FitnessGoal[] = [1, 2, 3].map((slot) =>
      parseGoalSlot(rawGoals[slot - 1], slot as 1 | 2 | 3, todayKey, numericWeight),
    );
    const hevyWorkouts = sanitizeHevyWorkoutsArray(candidate.hevyWorkouts);
    const dailyLogs = sanitizeDailyLogsArray(candidate.dailyLogs);
    const habitItems = sanitizeHabitItemsArray(candidate.habitItems);
    const dailyStepsGoal = sanitizeDailyStepsGoal(candidate.dailyStepsGoal);
    const supplementCycles = sanitizeSupplementCyclesMap(candidate.supplementCycles);
    const analysisManualWeightKg = sanitizeOptionalAnalysisWeight(
      candidate.analysisManualWeightKg,
    );
    const customExerciseMappings = sanitizeCustomExerciseMappings(
      candidate.customExerciseMappings,
    );
    const userSettings = sanitizeUserSettings(candidate.userSettings);

    return {
      ok: true,
      state: {
        profile: { name, heightCm, weightKg },
        themeAccent,
        ...(dailyMuscleGainGrams !== undefined ? { dailyMuscleGainGrams } : {}),
        ...(autoAccrueDaily ? { autoAccrueDaily: true } : {}),
        ...(accrueOnRestDays ? { accrueOnRestDays: true } : {}),
        ...(muscleAllocationMode !== undefined ? { muscleAllocationMode } : {}),
        ...(muscleAllocationScope !== undefined ? { muscleAllocationScope } : {}),
        ...(muscleAllocations !== undefined ? { muscleAllocations } : {}),
        logs,
        goals,
        ...(hevyWorkouts !== undefined ? { hevyWorkouts } : {}),
        ...(dailyLogs !== undefined ? { dailyLogs } : {}),
        ...(habitItems !== undefined ? { habitItems } : {}),
        ...(dailyStepsGoal !== undefined ? { dailyStepsGoal } : {}),
        ...(supplementCycles !== undefined ? { supplementCycles } : {}),
        ...(analysisManualWeightKg !== undefined ? { analysisManualWeightKg } : {}),
        ...(customExerciseMappings !== undefined ? { customExerciseMappings } : {}),
        ...(userSettings !== undefined ? { userSettings } : {}),
      },
    };
  } catch {
    return {
      ok: false,
      error: 'Неуспешно прочитане на файла. Увери се, че избираш валиден JSON архив.',
    };
  }
}

export interface HuaweiSleepImportEntry {
  date: string;
  huaweiSleepScore?: number;
  sleepHours?: number;
}

function normalizeImportedDate(raw: unknown): string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 19000101 && raw <= 29991231) {
      const s = String(Math.round(raw));
      const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
      return isValidDateKey(iso) ? iso : null;
    }
    const ms = raw > 1e12 ? raw : raw * 1000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      return getLocalDateKey(dt);
    }
    return null;
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    return isValidDateKey(candidate) ? candidate : null;
  }

  const compactMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compactMatch) {
    const candidate = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
    return isValidDateKey(candidate) ? candidate : null;
  }

  const bgMatch = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (bgMatch) {
    const candidate = `${bgMatch[3]}-${bgMatch[2].padStart(2, '0')}-${bgMatch[1].padStart(2, '0')}`;
    return isValidDateKey(candidate) ? candidate : null;
  }

  return null;
}

function normalizeImportedSleepHours(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'string') {
    const hm = raw.trim().match(/^(\d{1,2})[:чh](\d{1,2})?/i);
    if (hm) {
      const h = Number(hm[1]);
      const m = hm[2] ? Number(hm[2]) : 0;
      if (Number.isFinite(h) && Number.isFinite(m) && h <= 16) {
        return clampSleepHours(h + m / 60);
      }
    }
  }
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) return undefined;
  // Huawei Health JSON exports often store allSleepTime in minutes (e.g. 465)
  if (num > 24 && num <= 960) {
    return clampSleepHours(num / 60);
  }
  if (num <= 16) {
    return clampSleepHours(num);
  }
  return undefined;
}

export function parseHuaweiSleepImport(rawText: string): {
  ok: true;
  entries: HuaweiSleepImportEntry[];
} | {
  ok: false;
  error: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Постави данни или избери файл от Huawei Health.' };
  }

  const byDate = new Map<string, HuaweiSleepImportEntry>();

  // Try JSON format (Huawei Health export array or nested sleep array)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list: unknown[] = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.sleep)
          ? parsed.sleep
          : Array.isArray(parsed?.records)
            ? parsed.records
            : Array.isArray(parsed?.data)
              ? parsed.data
              : [parsed];

      for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const rec = item as Record<string, unknown>;
        const dateKey = normalizeImportedDate(
          rec.date ?? rec.day ?? rec.recordDay ?? rec.startTime ?? rec.sleepDate ?? rec.wakeUpTime,
        );
        if (!dateKey) continue;

        const score = clampHuaweiSleepScore(
          rec.huaweiSleepScore ??
            rec.sleepScore ??
            rec.trusleepScore ??
            rec.qualityScore ??
            rec.score,
        );
        const sleepHours = normalizeImportedSleepHours(
          rec.sleepHours ?? rec.allSleepTime ?? rec.totalSleepMinutes ?? rec.duration ?? rec.hours,
        );

        if (score !== undefined || sleepHours !== undefined) {
          byDate.set(dateKey, {
            date: dateKey,
            ...(score !== undefined ? { huaweiSleepScore: score } : {}),
            ...(sleepHours !== undefined ? { sleepHours } : {}),
          });
        }
      }

      if (byDate.size > 0) {
        return {
          ok: true,
          entries: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
        };
      }
      return {
        ok: false,
        error: 'JSON файлът не съдържа разпознаваеми записи за дата и точки за сън от Huawei GT 6.',
      };
    } catch {
      return { ok: false, error: 'Невалиден JSON формат от Huawei Health.' };
    }
  }

  // Try CSV / semicolon / tab / plain lines (e.g. "2026-11-16, 86, 7.8" or "16.11.2026; 84; 7:30")
  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(/[;,|\t]+/).map((p) => p.trim());
    let dateKey: string | null = null;
    let score: number | undefined;
    let sleepHours: number | undefined;

    if (parts.length >= 2) {
      dateKey = normalizeImportedDate(parts[0]);
      if (!dateKey) continue; // skip header row

      const p1Clean = parts[1].replace(/[^\d.]/g, '');
      const n1 = p1Clean ? Number(p1Clean) : NaN;
      if (Number.isFinite(n1)) {
        if (parts[1].includes('ч') || parts[1].includes('h') || n1 <= 16 && parts.length === 2 && parts[1].includes('.')) {
          sleepHours = normalizeImportedSleepHours(parts[1]);
        } else {
          score = clampHuaweiSleepScore(n1);
        }
      }
      if (parts[2]) {
        const hCandidate = normalizeImportedSleepHours(parts[2].replace(/[чh]/gi, '').trim());
        if (hCandidate !== undefined) {
          sleepHours = hCandidate;
        } else if (score === undefined) {
          score = clampHuaweiSleepScore(parts[2].replace(/[^\d.]/g, ''));
        }
      }
    } else {
      // Single-line natural text like "2026-11-16 86т 7.5ч"
      dateKey = normalizeImportedDate(line);
      if (!dateKey) continue;
      const scoreMatch = line.match(/(?:^|\s)(\d{1,3})\s*(?:т\.?|точки|pts|score)?(?=\s|$)/i);
      if (scoreMatch) {
        score = clampHuaweiSleepScore(scoreMatch[1]);
      }
      const hoursMatch = line.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:ч|h)/i);
      if (hoursMatch) {
        sleepHours = normalizeImportedSleepHours(hoursMatch[1].replace(',', '.'));
      }
    }

    if (dateKey && (score !== undefined || sleepHours !== undefined)) {
      byDate.set(dateKey, {
        date: dateKey,
        ...(score !== undefined ? { huaweiSleepScore: score } : {}),
        ...(sleepHours !== undefined ? { sleepHours } : {}),
      });
    }
  }

  if (byDate.size === 0) {
    return {
      ok: false,
      error:
        'Не бяха открити валидни редове. Използвай формат например „2026-11-16, 86, 7.8“ (дата, Huawei GT 6 точки, часове) или JSON от Huawei Health.',
    };
  }

  return {
    ok: true,
    entries: Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export function generateSleepRecoveryAdvice(
  logs: Record<string, DayLog>,
  todayKey: string,
): SleepRecoveryInsights {
  const todayEntry = logs[todayKey];
  const todaySleepHours = todayEntry ? clampSleepHours(todayEntry.sleepHours) : DEFAULT_SLEEP_HOURS;
  const todayScore = clampHuaweiSleepScore(todayEntry?.huaweiSleepScore);
  const todayRecovery = getSleepRecoveryInfo(
    todaySleepHours,
    getRecoveryOptionsFromLog(todayEntry),
  );
  const trainedTodayMuscles = todayEntry
    ? Array.from(new Set(todayEntry.muscles)).filter((id) => VALID_MUSCLE_IDS.has(id))
    : [];
  const todayGainGrams = calculateDayTotalGain(
    trainedTodayMuscles,
    todaySleepHours,
    getRecoveryOptionsFromLog(todayEntry),
  );

  // Collect 7-day rolling sleep context up to todayKey
  const windowEntries: DayLog[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const key = shiftDateKey(todayKey, -offset);
    if (logs[key]) {
      windowEntries.push(logs[key]);
    }
  }

  const hasLoggedData = Object.keys(logs).length > 0;
  const loggedDays7d = windowEntries.length;

  let avgSleepHours7d: number | null = null;
  let avgHuaweiScore7d: number | null = null;
  let fatiguedDays7d = 0;
  let hoursSpread7d: number | null = null;

  if (windowEntries.length > 0) {
    const hoursList = windowEntries.map((e) => clampSleepHours(e.sleepHours));
    const sumHours = hoursList.reduce((acc, h) => acc + h, 0);
    avgSleepHours7d = Math.round((sumHours / hoursList.length) * 10) / 10;

    if (hoursList.length >= 2) {
      hoursSpread7d =
        Math.round((Math.max(...hoursList) - Math.min(...hoursList)) * 10) / 10;
    }

    const scoresList = windowEntries
      .map((e) => clampHuaweiSleepScore(e.huaweiSleepScore))
      .filter((s): s is number => s !== undefined);
    if (scoresList.length > 0) {
      avgHuaweiScore7d = Math.round(
        scoresList.reduce((acc, s) => acc + s, 0) / scoresList.length,
      );
    }

    for (const entry of windowEntries) {
      const rec = getSleepRecoveryInfo(entry.sleepHours, getRecoveryOptionsFromLog(entry));
      if (rec.isFatigued) {
        fatiguedDays7d += 1;
      }
    }
  }

  const tips: SleepAdviceItem[] = [];

  // 1. Primary contextual analysis of today's sleep hours vs Huawei GT 6 score
  if (todayScore !== undefined && todaySleepHours >= 7.5 && todayScore < 65) {
    tips.push({
      id: 'gt6-quality-mismatch',
      priority: 'caution',
      priorityLabel: 'Качество (GT 6)',
      category: 'Huawei GT 6 анализ',
      title: 'Дълъг сън, но ниско качество по Huawei GT 6',
      body: `Спал си ${formatNumberBg(todaySleepHours)} ч, но часовникът отчита ${todayScore} т. — вероятна накъсаност на дълбокия или REM съня.`,
      action: 'Охлади спалнята до 18–19°C и спри екраните и тежките храни 90 мин преди лягане.',
    });
  } else if (todayScore !== undefined && todaySleepHours < 6.5 && todayScore >= 65) {
    tips.push({
      id: 'short-duration-good-efficiency',
      priority: 'caution',
      priorityLabel: 'Продължителност',
      category: 'Време в леглото',
      title: 'Добра ефективност, но недостатъчни часове сън',
      body: `Huawei GT 6 дава ${todayScore} т., но ${formatNumberBg(todaySleepHours)} ч сън ограничават пълния хормонален и мускулен цикъл.`,
      action: 'Премести часа на лягане с 45–60 мин по-рано довечера, за да достигнеш 7.5–8 ч.',
    });
  } else if (todayRecovery.isFatigued) {
    const metricContext =
      todayScore !== undefined
        ? `${todayScore} т. от Huawei GT 6 и ${formatNumberBg(todaySleepHours)} ч сън`
        : `${formatNumberBg(todaySleepHours)} ч сън`;
    tips.push({
      id: 'acute-fatigue-recovery',
      priority: 'critical',
      priorityLabel: 'Приоритет',
      category: 'Остра умора',
      title: 'Синтезът на мускулна маса днес е понижен',
      body: `При ${metricContext} възстановяването е ${todayRecovery.percentage}% — тялото не разполага с оптимален ресурс за тежка хипертрофия.`,
      action: 'Намали тренировъчния обем с 20–30% днес и планирай 8+ часа сън още тази нощ.',
    });
  } else if (todayRecovery.percentage >= 95) {
    const metricContext =
      todayScore !== undefined
        ? `${todayScore} т. от Huawei GT 6 (${formatNumberBg(todaySleepHours)} ч)`
        : `${formatNumberBg(todaySleepHours)} ч сън`;
    tips.push({
      id: 'peak-anabolic-window',
      priority: 'positive',
      priorityLabel: 'Оптимално',
      category: 'Днешен баланс',
      title: 'Пълен анаболен прозорец за растеж',
      body: `Данните (${metricContext}) осигуряват ${todayRecovery.percentage}% възстановяване и максимален мускулен прираст за всяка тренирана зона.`,
      action: 'Запази същия час на лягане и днес за най-добър резултат при тежки серии.',
    });
  } else {
    const reservePct = Math.max(0, 100 - todayRecovery.percentage);
    const metricContext =
      todayScore !== undefined
        ? `${todayScore} т. от Huawei GT 6 и ${formatNumberBg(todaySleepHours)} ч`
        : `${formatNumberBg(todaySleepHours)} ч сън`;
    tips.push({
      id: 'moderate-reserve',
      priority: 'info',
      priorityLabel: 'Резерв',
      category: 'Днешен баланс',
      title: `Близо до максимума (+${reservePct}% потенциален прираст)`,
      body: `Текущите ${metricContext} носят ${todayRecovery.percentage}% възстановяване. Малка корекция ще отключи 100% мускулен растеж.`,
      action: 'Добави 30–45 мин по-ранно заспиване и ограничи кофеина след 14:00 ч.',
    });
  }

  // 2. Manual mode context (if user overrode automatic calculation)
  if (todayRecovery.mode === 'manual') {
    const autoBasis = getSleepRecoveryInfo(todaySleepHours, {
      huaweiSleepScore: todayScore,
      recoveryMode: 'auto',
    });
    tips.push({
      id: 'manual-mode-comparison',
      priority: autoBasis.isFatigued && !todayRecovery.isFatigued ? 'caution' : 'info',
      priorityLabel: 'Ръчен режим',
      category: 'Сравнение',
      title: `Ръчната оценка (${todayRecovery.percentage}%) се различава от автоматичната (${autoBasis.percentage}%)`,
      body:
        todayRecovery.percentage > autoBasis.percentage
          ? `Реалните данни за сън дават ${autoBasis.percentage}%, затова внимавай да не надцениш готовността при тежки тежести.`
          : `Задал си по-консервативно възстановяване (${todayRecovery.percentage}%) спрямо автоматичните ${autoBasis.percentage}% — добър подход при мускулна треска.`,
      action: 'Превключи на „Автоматично“, когато искаш сметките да следват директно часовника.',
    });
  }

  // 3. 7-day rolling consistency / sleep debt / Huawei trend
  if (fatiguedDays7d >= 2) {
    tips.push({
      id: 'sleep-debt-7d',
      priority: 'critical',
      priorityLabel: 'Натрупване',
      category: '7-дневен тренд',
      title: `Натрупан дефицит: ${fatiguedDays7d} изморени дни през последната седмица`,
      body: `Честите нощи под прага на възстановяване повишават кортизола и забавят натрупването на мускулна маса дори при редовни тренировки.`,
      action: 'Планирай 2 последователни нощи с по 8–8.5 ч сън, без аларми и късни екрани.',
    });
  } else if (hoursSpread7d !== null && hoursSpread7d >= 2.0) {
    tips.push({
      id: 'circadian-consistency-spread',
      priority: 'caution',
      priorityLabel: 'Ритъм',
      category: '7-дневен тренд',
      title: `Голямо колебание в съня (${formatNumberBg(hoursSpread7d)} ч разлика)`,
      body: `В последните ${loggedDays7d} записани дни продължителността варира силно, което разстройва циркадния ритъм и сваля точките за сън.`,
      action: 'Дръж часа на ставане в рамките на ±30 минути всеки ден, включително през уикенда.',
    });
  } else if (avgSleepHours7d !== null && avgSleepHours7d >= 7.6 && fatiguedDays7d === 0) {
    tips.push({
      id: 'steady-7d-streak',
      priority: 'positive',
      priorityLabel: 'Постоянство',
      category: '7-дневен тренд',
      title: `Стабилна седмица — средно ${formatNumberBg(avgSleepHours7d)} ч на нощ`,
      body:
        avgHuaweiScore7d !== null
          ? `Поддържаш отличен ритъм без дни в умора, със средна оценка ${avgHuaweiScore7d} т. от Huawei GT 6.`
          : `Поддържаш постоянен 7-дневен режим без спадове под 6 часа — основа за устойчива хипертрофия.`,
      action: 'Продължавай със същата вечерна рутина и хидратация през първата половина на деня.',
    });
  } else if (avgHuaweiScore7d !== null && avgHuaweiScore7d < 75) {
    tips.push({
      id: 'gt6-7d-quality-lift',
      priority: 'caution',
      priorityLabel: 'Хигиена на съня',
      category: 'Huawei GT 6 тренд',
      title: `Средната оценка за 7 дни е ${avgHuaweiScore7d} т.`,
      body: 'Можеш да качиш оценката на часовника с 8–12 точки, като стабилизираш температурата и светлината вечер.',
      action: 'Намали яркостта на осветлението 60 мин преди сън и избягвай тежки ястия късно.',
    });
  } else if (avgSleepHours7d !== null) {
    tips.push({
      id: 'hours-7d-baseline',
      priority: 'info',
      priorityLabel: 'Наблюдение',
      category: '7-дневен тренд',
      title: `Средно ${formatNumberBg(avgSleepHours7d)} ч сън за последните ${loggedDays7d} дни`,
      body: 'Увеличаването на средния сън към 7.8–8.2 ч директно ускорява постигането на целите ти за мускулна маса.',
      action: 'Постави си вечерно напомняне за подготовка за сън 45 мин преди желания час.',
    });
  }

  // 4. Workout load & body composition synergy
  if (trainedTodayMuscles.length >= 2 && todayRecovery.percentage < 80) {
    tips.push({
      id: 'heavy-load-low-recovery',
      priority: 'caution',
      priorityLabel: 'Натоварване',
      category: 'Тренировка + Сън',
      title: `Натовари ${trainedTodayMuscles.length} зони при ${todayRecovery.percentage}% възстановяване`,
      body: `Комбинираното натоварване изисква по-дълбоко нощно възстановяване, за да усвоиш пълноценно стимула (+${formatGrams(todayGainGrams)} г днес).`,
      action: 'Осигури богата на протеин вечеря с магнезий и легни поне 30 мин по-рано.',
    });
  } else if (trainedTodayMuscles.length >= 1 && todayRecovery.percentage >= 85) {
    tips.push({
      id: 'synced-training-recovery',
      priority: 'positive',
      priorityLabel: 'Синхрон',
      category: 'Тренировка + Сън',
      title: `Силна комбинация: ${trainedTodayMuscles.length} тренирани зони и ${todayRecovery.percentage}% готовност`,
      body: `Натрупаният за деня прираст (+${formatGrams(todayGainGrams)} г) се подкрепя от висок капацитет за възстановяване на тъканите.`,
      action: 'Завърши деня без късен стрес и дай на мускулите 7.5–8.5 ч качествен нощен покой.',
    });
  } else if (trainedTodayMuscles.length === 0 && todayRecovery.isFatigued) {
    tips.push({
      id: 'rest-day-recommendation',
      priority: 'info',
      priorityLabel: 'Активна почивка',
      category: 'Тренировка + Сън',
      title: 'Днес почивката носи повече полза от тежката тренировка',
      body: 'Още нямаш отбелязани мускулни групи за днес и сънят е в червената зона — лека разходка или стречинг ще ускорят регенерацията.',
      action: 'Съхрани енергията за утре и фокусирай усилията си върху пълноценен сън довечера.',
    });
  } else {
    tips.push({
      id: 'evening-nutrition-synergy',
      priority: 'info',
      priorityLabel: 'Вечерен навик',
      category: 'Подкрепа на растежа',
      title: 'Използвай готовността за качествена стимулация',
      body: `Имаш ${todayRecovery.percentage}% възстановяване и възможност за максимално усвояване на тренировката днес.`,
      action: 'Избери 1–2 големи мускулни групи (Крака, Гръб или Гърди) и поддържай добра хидратация.',
    });
  }

  // 5. Contextual sleep hygiene / body composition tip to complete 2x2 grid cleanly
  if (tips.length < 4) {
    const latestWeight = getLatestBodyMeasurement(logs, 'weightKg', todayKey);
    const latestBodyFat = getLatestBodyMeasurement(logs, 'bodyFatPercent', todayKey);
    if (latestBodyFat !== null && latestBodyFat.value > 18) {
      tips.push({
        id: 'sleep-body-comp-protection',
        priority: 'info',
        priorityLabel: 'Телесен състав',
        category: 'Метаболизъм и сън',
        title: 'Сънят пази чистата мускулна маса при редукция',
        body: `При последно измерени ${formatNumberBg(latestBodyFat.value)}% подкожни мазнини, достатъчният сън (7.5–8.5 ч) намалява вечерния глад и насочва тялото към изгаряне на мазнини вместо мускул.`,
        action: 'Приключи последното хранене поне 2–3 часа преди лягане за по-дълбок нощен сън.',
      });
    } else if (latestWeight !== null && todaySleepHours < 8) {
      tips.push({
        id: 'evening-protein-hydration',
        priority: 'info',
        priorityLabel: 'Хранене и режим',
        category: 'Нощно възстановяване',
        title: 'Подкрепи нощния синтез при 7–8 ч цел',
        body: `За текущото тегло (${formatNumberBg(latestWeight.value)} кг), бавноусвоим протеин (напр. извара или кисело мляко) вечер и по-малко течности точно преди сън подобряват непрекъснатостта на съня.`,
        action: 'Избягвай обилно пиене на вода в последния 1 час преди лягане, за да не прекъсваш дълбокия сън.',
      });
    } else {
      tips.push({
        id: 'evening-winddown-protocol',
        priority: 'info',
        priorityLabel: 'Вечерен протокол',
        category: 'Хигиена на съня',
        title: '30-минутен преход към дълбок сън',
        body: 'Регулярното затъмняване и отсъствието на синя светлина повишават секрецията на мелатонин и стабилизират резултата в Huawei GT 6.',
        action: 'Активирай нощен режим на телефона 45 мин преди сън и проветри стаята.',
      });
    }
  }

  // Headline synthesis
  let headline: string;
  if (!hasLoggedData) {
    headline = 'Въведи днешните часове сън или точки от Huawei GT 6 горе, за да получиш персонализиран план за възстановяване.';
  } else if (todayRecovery.isFatigued) {
    headline = `Тялото сигнализира умора (${todayRecovery.percentage}% възстановяване) — фокусът за следващите 24 ч е качествен сън и по-лек обем.`;
  } else if (todayRecovery.percentage >= 90) {
    headline = `Отлична основа за растеж (${todayRecovery.percentage}% възстановяване) — поддържай постоянен вечерен ритъм, за да запазиш темпото.`;
  } else {
    headline = `Добро базово възстановяване (${todayRecovery.percentage}%), с ясен резерв за още по-силен мускулен синтез чрез съня довечера.`;
  }

  return {
    hasLoggedData,
    headline,
    todaySleepHours,
    todayHuaweiScore: todayScore,
    todayRecovery,
    loggedDays7d,
    avgSleepHours7d,
    avgHuaweiScore7d,
    fatiguedDays7d,
    hoursSpread7d,
    tips: tips.slice(0, 4),
  };
}

export function buildLast7DaysTrainingSummary(
  logs: Record<string, DayLog>,
  todayKey: string,
  defaultDailyBaseGrams?: number,
  accrueOnRestDays?: boolean,
  allocationConfig?: MuscleAllocationConfig,
): SevenDayTrainingSummary {
  const startDate = shiftDateKey(todayKey, -6);
  const days: SevenDayDaySummary[] = [];
  const muscleFrequency: Record<string, number> = {};

  let workoutDays7d = 0;
  let restDays7d = 0;
  let totalGained7dGrams = 0;
  let fatiguedDays7d = 0;
  const sleepHoursList: number[] = [];
  const gt6ScoreList: number[] = [];

  for (let offset = 6; offset >= 0; offset--) {
    const dateKey = shiftDateKey(todayKey, -offset);
    const entry = logs[dateKey];
    const uniqueMuscles = entry
      ? Array.from(new Set(entry.muscles)).filter((id) => VALID_MUSCLE_IDS.has(id))
      : [];
    const muscleLabels = uniqueMuscles.map((id) => MUSCLE_MAP[id]?.label ?? id);
    const breakdown = calculateDayGainsBreakdown(
      entry,
      defaultDailyBaseGrams,
      entry ? accrueOnRestDays : false,
      allocationConfig,
    );
    const trained = Boolean(entry && (entry.trained || uniqueMuscles.length > 0));
    const sleepHours = entry ? clampSleepHours(entry.sleepHours) : DEFAULT_SLEEP_HOURS;
    const huaweiSleepScore = clampHuaweiSleepScore(entry?.huaweiSleepScore);

    if (trained) {
      workoutDays7d += 1;
      for (const label of muscleLabels) {
        muscleFrequency[label] = (muscleFrequency[label] ?? 0) + 1;
      }
    } else {
      restDays7d += 1;
    }

    totalGained7dGrams = roundGrams(totalGained7dGrams + breakdown.totalGrams);

    if (entry) {
      sleepHoursList.push(sleepHours);
      if (huaweiSleepScore !== undefined) {
        gt6ScoreList.push(huaweiSleepScore);
      }
      if (breakdown.recovery.isFatigued) {
        fatiguedDays7d += 1;
      }
    }

    days.push({
      date: dateKey,
      trained,
      muscles: muscleLabels,
      gainedGrams: breakdown.totalGrams,
      sleepHours,
      ...(huaweiSleepScore !== undefined ? { huaweiSleepScore } : {}),
      recoveryPercentage: breakdown.recovery.percentage,
      isFatigued: breakdown.recovery.isFatigued,
      ...(entry?.weightKg !== undefined ? { weightKg: entry.weightKg } : {}),
    });
  }

  const avgSleepHours7d =
    sleepHoursList.length > 0
      ? Math.round((sleepHoursList.reduce((sum, h) => sum + h, 0) / sleepHoursList.length) * 10) / 10
      : null;

  const avgHuaweiScore7d =
    gt6ScoreList.length > 0
      ? Math.round(gt6ScoreList.reduce((sum, s) => sum + s, 0) / gt6ScoreList.length)
      : null;

  return {
    startDate,
    endDate: todayKey,
    workoutDays7d,
    restDays7d,
    totalGained7dGrams,
    avgSleepHours7d,
    avgHuaweiScore7d,
    fatiguedDays7d,
    muscleFrequency,
    days,
  };
}


