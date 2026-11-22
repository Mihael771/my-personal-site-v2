import type {
  AcwrDailyPoint,
  AcwrReport,
  AcwrZone,
  BeatLogExerciseTarget,
  CustomExerciseMappings,
  DailyBiometricLog,
  DetailedMuscleId,
  DetailedMuscleRecoveryItem,
  HevySet,
  HevyWorkout,
  MuscleRecoveryExerciseHit,
  MuscleRecoveryZoneStatus,
  RunningHybridStandardEntry,
  StandardTier,
  StrengthStandardEntry,
  SupplementCycleConfig,
  SupplementCycleStatus,
  SupplementImpactAnalysis,
  SupplementMetricComparison,
} from '../types/fitness';
import {
  MUSCLE_GROUPS_15,
  resolveExerciseMuscles,
} from './exerciseMuscleEngine';
import { calculateEpley1RM } from './hevyProgress';

function roundOne(val: number): number {
  return Math.round(val * 10) / 10;
}

function roundTwo(val: number): number {
  return Math.round(val * 100) / 100;
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

function diffDays(startKey: string, endKey: string): number {
  const ma = startKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const mb = endKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!ma || !mb) return 0;
  const ta = Date.UTC(Number(ma[1]), Number(ma[2]) - 1, Number(ma[3]));
  const tb = Date.UTC(Number(mb[1]), Number(mb[2]) - 1, Number(mb[3]));
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

function parseWorkoutEndTs(w: HevyWorkout): number {
  if (w.endTime) {
    const dt = new Date(w.endTime);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }
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

function parseWorkoutSortTs(w: HevyWorkout): number {
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

function formatWeightClean(kg: number): string {
  const r = roundTwo(kg);
  return Number.isInteger(r) ? String(r) : String(r);
}

// ============================================================================
// 1. Карта на възстановяването (15 мускулни групи)
// ============================================================================

export interface DetailedMuscleMeta {
  id: DetailedMuscleId;
  label: string;
  view: 'front' | 'back' | 'both';
}

export const DETAILED_MUSCLE_GROUPS: DetailedMuscleMeta[] = MUSCLE_GROUPS_15.map(
  (m) => ({
    id: m.id,
    label: m.label,
    view: m.view,
  }),
);

export function mapExerciseToDetailedMuscles(
  title: string,
  customMappings?: CustomExerciseMappings,
): {
  primary: DetailedMuscleId[];
  secondary: DetailedMuscleId[];
} {
  const res = resolveExerciseMuscles(title, customMappings);
  return {
    primary: res.primary,
    secondary: res.secondary,
  };
}

const LEG_DETAILED_MUSCLES = new Set<DetailedMuscleId>([
  'quads',
  'hamstrings',
  'glutes',
  'calves',
]);

const MOUNTAIN_CARDIO_LEG_MUSCLES = new Set<DetailedMuscleId>([
  'quads',
  'calves',
  'glutes',
]);

function getUtcOrLocalDateKey(timestampMs: number): string {
  const dt = new Date(timestampMs);
  const y = dt.getFullYear();
  const mon = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${mon}-${d}`;
}

export function findHighStepsLast24h(
  dailyLogs: DailyBiometricLog[],
  referenceTimestampMs: number = Date.now(),
): number | null {
  if (!dailyLogs || dailyLogs.length === 0) return null;
  const refDate = getUtcOrLocalDateKey(referenceTimestampMs);
  const prevDate = shiftDate(refDate, -1);
  let maxSteps: number | null = null;
  for (const log of dailyLogs) {
    if (log.date !== refDate && log.date !== prevDate) continue;
    if (log.steps !== undefined && log.steps > 0) {
      if (maxSteps === null || log.steps > maxSteps) {
        maxSteps = log.steps;
      }
    }
  }
  return maxSteps;
}

export function findHighElevationGainLast24h(
  dailyLogs: DailyBiometricLog[],
  referenceTimestampMs: number = Date.now(),
): number | null {
  if (!dailyLogs || dailyLogs.length === 0) return null;
  const refDate = getUtcOrLocalDateKey(referenceTimestampMs);
  const prevDate = shiftDate(refDate, -1);
  let maxElevationM: number | null = null;
  for (const log of dailyLogs) {
    if (log.date !== refDate && log.date !== prevDate) continue;
    if (log.cardioElevationGainM !== undefined && log.cardioElevationGainM > 0) {
      if (maxElevationM === null || log.cardioElevationGainM > maxElevationM) {
        maxElevationM = log.cardioElevationGainM;
      }
    }
  }
  return maxElevationM;
}

function parseWatchActivityEndTs(
  dateKey: string,
  startDateLocal?: string,
  movingTimeSec?: number,
): number {
  if (startDateLocal) {
    const parsed = Date.parse(startDateLocal);
    if (!Number.isNaN(parsed)) {
      return parsed + Math.max(0, movingTimeSec ?? 0) * 1000;
    }
  }
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 15, 0, 0).getTime();
}

function isRunTypeForRecovery(type: string): boolean {
  const norm = type.trim().toLowerCase();
  return (
    norm === 'run' ||
    norm === 'virtualrun' ||
    norm === 'trailrun' ||
    norm === 'trail_run' ||
    norm === 'trail run'
  );
}

/**
 * Extracts proportional leg fatigue hits (quads, calves, glutes) from smartwatch
 * mountain hikes (elevation >= 250 m) and runs (distance >= 2 km) over the last 72 hours.
 */
function extractWatchCardioLegHitsLast72h(
  dailyLogs: DailyBiometricLog[],
  referenceTimestampMs: number,
): MuscleRecoveryExerciseHit[] {
  if (!dailyLogs || dailyLogs.length === 0) return [];
  const hits: MuscleRecoveryExerciseHit[] = [];

  for (const log of dailyLogs) {
    if (!log.date) continue;
    const activities = Array.isArray(log.watchActivities)
      ? log.watchActivities
      : [];

    if (activities.length > 0) {
      for (const act of activities) {
        const elevM = act.total_elevation_gain ?? 0;
        const distM = act.distance ?? 0;
        const isRun = isRunTypeForRecovery(act.type);
        const qualifiesClimb = elevM >= 250;
        const qualifiesRun = isRun && distM >= 2000;
        if (!qualifiesClimb && !qualifiesRun) continue;

        const endTs = parseWatchActivityEndTs(
          log.date,
          act.start_date_local,
          act.moving_time,
        );
        if (endTs <= 0 || endTs > referenceTimestampMs + 6 * 3600000) continue;
        const hoursAgo = Math.max(
          0,
          roundOne((referenceTimestampMs - endTs) / 3600000),
        );
        if (hoursAgo > 72) continue;

        // Proportional equivalent sets (4 to 14 sets) scaling with climb & run distance
        const climbSets = qualifiesClimb
          ? Math.min(12, Math.max(4, Math.round(elevM / 95)))
          : 0;
        const runSets = qualifiesRun
          ? Math.min(10, Math.max(4, Math.round(distM / 1200)))
          : 0;
        const workingSets = Math.min(14, Math.max(4, climbSets + runSets));
        const isHeavyLegLoad = elevM >= 450 || (isRun && distM >= 5000);

        const labelParts: string[] = [];
        if (distM >= 1000) labelParts.push(`${roundOne(distM / 1000)} км`);
        if (elevM >= 100) labelParts.push(`+${Math.round(elevM)} м`);

        hits.push({
          exerciseTitle: `${qualifiesClimb ? '🏔️' : '🏃'} ${act.name || act.type}${labelParts.length > 0 ? ` (${labelParts.join(', ')})` : ''}`,
          workoutTitle: 'Часовник (Планина и Кардио)',
          date: log.date,
          hoursAgo,
          role: isHeavyLegLoad ? 'primary' : 'secondary',
          workingSets,
        });
      }
    }
  }

  return hits.sort((a, b) => a.hoursAgo - b.hoursAgo);
}

export function computeDetailedMuscleRecovery(
  workouts: HevyWorkout[],
  referenceTimestampMs: number = Date.now(),
  dailyLogs: DailyBiometricLog[] = [],
  customExerciseMappings?: CustomExerciseMappings,
): DetailedMuscleRecoveryItem[] {
  const sortedDesc = [...workouts].sort(
    (a, b) => parseWorkoutEndTs(b) - parseWorkoutEndTs(a),
  );
  const recentSteps24h = findHighStepsLast24h(dailyLogs, referenceTimestampMs);
  const hasHighSteps24h = recentSteps24h !== null && recentSteps24h > 14000;
  const recentElevation24h = findHighElevationGainLast24h(
    dailyLogs,
    referenceTimestampMs,
  );
  const hasHighElevation24h =
    recentElevation24h !== null && recentElevation24h > 300;
  const hasExtraLegLoad24h = hasHighSteps24h || hasHighElevation24h;
  const watchCardioLegHits72h = extractWatchCardioLegHitsLast72h(
    dailyLogs,
    referenceTimestampMs,
  );

  return DETAILED_MUSCLE_GROUPS.map((meta) => {
    const hits: MuscleRecoveryExerciseHit[] = [];
    let recentEffectiveSets48h = 0;
    let recentPrimarySets72h = 0;
    let lastSessionWorkoutId: string | null = null;
    let lastSessionSets = 0;

    for (const workout of sortedDesc) {
      const endTs = parseWorkoutEndTs(workout);
      if (endTs <= 0 || endTs > referenceTimestampMs + 6 * 3600000) continue;
      const hoursAgo = Math.max(
        0,
        roundOne((referenceTimestampMs - endTs) / 3600000),
      );

      for (const ex of workout.exercises) {
        const mapped = mapExerciseToDetailedMuscles(ex.title, customExerciseMappings);
        const isPrimary = mapped.primary.includes(meta.id);
        const isSecondary = !isPrimary && mapped.secondary.includes(meta.id);
        if (!isPrimary && !isSecondary) continue;

        const workingCount = getWorkingSets(ex.sets).length;
        if (workingCount === 0) continue;

        const role: 'primary' | 'secondary' = isPrimary ? 'primary' : 'secondary';
        hits.push({
          exerciseTitle: ex.title,
          workoutTitle: workout.title,
          date: workout.date,
          hoursAgo,
          role,
          workingSets: workingCount,
        });

        if (hoursAgo <= 48) {
          recentEffectiveSets48h = roundOne(
            recentEffectiveSets48h + workingCount * (isPrimary ? 1 : 0.5),
          );
        }
        if (isPrimary && hoursAgo <= 72) {
          recentPrimarySets72h += workingCount;
        }

        if (lastSessionWorkoutId === null) {
          lastSessionWorkoutId = workout.id;
        }
        if (workout.id === lastSessionWorkoutId) {
          lastSessionSets += workingCount;
        }
      }
    }

    // Add proportional leg fatigue from watchActivities (>=250m elevation or >=2km run) on quads, calves, glutes
    if (
      MOUNTAIN_CARDIO_LEG_MUSCLES.has(meta.id) &&
      watchCardioLegHits72h.length > 0
    ) {
      for (const wHit of watchCardioLegHits72h) {
        hits.push(wHit);
        if (wHit.hoursAgo <= 48) {
          recentEffectiveSets48h = roundOne(
            recentEffectiveSets48h +
              wHit.workingSets * (wHit.role === 'primary' ? 1 : 0.7),
          );
        }
        if (wHit.role === 'primary' && wHit.hoursAgo <= 72) {
          recentPrimarySets72h += wHit.workingSets;
        }
      }
      hits.sort((a, b) => a.hoursAgo - b.hoursAgo);
    }

    const primaryHits = hits.filter((h) => h.role === 'primary');
    const secondaryHits = hits.filter((h) => h.role === 'secondary');
    const latestHit = hits[0] ?? null;
    const latestPrimaryHit = primaryHits[0] ?? null;

    const hoursSinceLast = latestHit ? latestHit.hoursAgo : null;
    const lastTrainedDate = latestHit ? latestHit.date : null;
    const isLegMuscle = LEG_DETAILED_MUSCLES.has(meta.id);

    // Primary load gets 100% load (48–72h recovery); secondary-only gets 50% load (24–36h recovery)
    const hasRecentPrimary =
      latestPrimaryHit !== null &&
      (latestPrimaryHit.hoursAgo <= 72 || recentPrimarySets72h > 0);
    const dominantLoadRole: 'primary' | 'secondary' | 'none' =
      latestHit === null
        ? 'none'
        : hasRecentPrimary || latestHit.role === 'primary'
          ? 'primary'
          : 'secondary';

    let baseTargetHours = 48;
    if (dominantLoadRole === 'primary') {
      baseTargetHours =
        recentEffectiveSets48h >= 14
          ? 72
          : recentEffectiveSets48h >= 10
            ? 60
            : 48;
    } else if (dominantLoadRole === 'secondary') {
      baseTargetHours = recentEffectiveSets48h >= 5 ? 36 : 24;
    } else {
      baseTargetHours = isLegMuscle && hasExtraLegLoad24h ? 36 : 48;
    }

    const extraLegHours =
      (hasHighSteps24h ? 12 : 0) + (hasHighElevation24h ? 12 : 0);
    const targetHours =
      isLegMuscle && hasExtraLegLoad24h
        ? Math.min(72, baseTargetHours + extraLegHours)
        : baseTargetHours;

    // Effective reference age: if there is a primary hit within 72h, primary recovery drives status;
    // otherwise latest hit drives status with the 24–36h secondary window.
    const refHoursForPrimary =
      dominantLoadRole === 'primary' && latestPrimaryHit !== null
        ? Math.min(latestPrimaryHit.hoursAgo, hoursSinceLast ?? latestPrimaryHit.hoursAgo)
        : hoursSinceLast;

    let status: MuscleRecoveryZoneStatus = 'recovered';
    if (hoursSinceLast !== null) {
      if (dominantLoadRole === 'primary') {
        const hrs = refHoursForPrimary ?? hoursSinceLast;
        if (
          hrs < 24 ||
          (hrs < 36 && recentEffectiveSets48h >= 8) ||
          (hrs < 48 && recentEffectiveSets48h >= 14) ||
          (isLegMuscle && hasExtraLegLoad24h && hrs < 36)
        ) {
          status = 'fatigued';
        } else if (
          hrs < targetHours ||
          (isLegMuscle && hasExtraLegLoad24h && hrs < targetHours)
        ) {
          status = 'recovering';
        } else {
          status = 'recovered';
        }
      } else {
        // Secondary-only load (50% stimulus -> 24–36h recovery)
        if (
          hoursSinceLast < 16 ||
          (hoursSinceLast < 24 && recentEffectiveSets48h >= 6) ||
          (isLegMuscle && hasExtraLegLoad24h && hoursSinceLast < 24)
        ) {
          status = 'fatigued';
        } else if (hoursSinceLast < targetHours) {
          status = 'recovering';
        } else {
          status = 'recovered';
        }
      }
    } else if (isLegMuscle && hasExtraLegLoad24h) {
      status =
        hasHighElevation24h && recentElevation24h !== null && recentElevation24h >= 600
          ? 'fatigued'
          : 'recovering';
    }

    const statusLabel =
      status === 'fatigued'
        ? 'Остра умора'
        : status === 'recovering'
          ? 'Възстановява се'
          : 'Напълно възстановена';

    const effectiveHoursForRemaining =
      dominantLoadRole === 'primary' && refHoursForPrimary !== null
        ? refHoursForPrimary
        : hoursSinceLast;

    const remainingHours =
      effectiveHoursForRemaining !== null && status !== 'recovered'
        ? Math.max(1, Math.ceil(targetHours - effectiveHoursForRemaining))
        : 0;

    let recommendation =
      status === 'recovered'
        ? 'Готов за тежка сесия'
        : dominantLoadRole === 'secondary'
          ? `Изчакай още ${remainingHours} часа (второстепенно натоварване 50%)`
          : `Изчакай още ${remainingHours} часа (основно натоварване 100%)`;

    if (isLegMuscle && hasExtraLegLoad24h) {
      const reasons: string[] = [];
      if (hasHighElevation24h && recentElevation24h !== null) {
        reasons.push(`+${recentElevation24h.toLocaleString('bg-BG')} m денивелация`);
      }
      if (hasHighSteps24h && recentSteps24h !== null) {
        reasons.push(`${recentSteps24h.toLocaleString('bg-BG')} крачки`);
      }
      const reasonText = reasons.join(' и ');
      if (hoursSinceLast !== null && hoursSinceLast < targetHours) {
        recommendation = `Изчакай още ${remainingHours} часа (${reasonText} за 24 ч забавят възстановяването на краката)`;
      } else {
        recommendation = `Високо натоварване на краката (${reasonText} / 24 ч) — намали тежките серии за крака днес`;
      }
    }

    return {
      id: meta.id,
      label: meta.label,
      view: meta.view,
      status,
      statusLabel,
      hoursSinceLast,
      lastTrainedDate,
      recentEffectiveSets48h,
      lastSessionSets,
      recoveryTargetHours: targetHours,
      dominantLoadRole,
      recentExercises: hits.slice(0, 6),
      primaryExercises: primaryHits.slice(0, 6),
      secondaryExercises: secondaryHits.slice(0, 6),
      recommendation,
    };
  });
}

// ============================================================================
// 2. Натоварване и риск (ACWR — Acute:Chronic Workload Ratio)
// ============================================================================

export function computeStrengthWorkoutLoad(workout: HevyWorkout): number {
  let load = 0;
  for (const ex of workout.exercises) {
    const workingSets = getWorkingSets(ex.sets);
    for (const s of workingSets) {
      if (s.rpe !== undefined && s.rpe > 0) {
        load += s.rpe * 10;
      } else if ((s.weightKg ?? 0) > 0 && (s.reps ?? 0) > 0) {
        const volBonus = Math.min(25, ((s.weightKg ?? 0) * (s.reps ?? 0)) / 100);
        load += 65 + volBonus;
      } else if ((s.reps ?? 0) > 0) {
        load += 60 + Math.min(20, s.reps ?? 0);
      } else if ((s.durationSeconds ?? 0) > 0) {
        load += Math.min(100, (s.durationSeconds ?? 0) / 3);
      } else {
        load += 70;
      }
    }
  }
  return Math.round(load);
}

export function computeCardioDailyLoad(log: DailyBiometricLog | undefined): number {
  if (!log) return 0;
  const km = Math.max(0, log.cardioDistanceKm ?? 0);
  const min = Math.max(0, log.cardioDurationMinutes ?? 0);
  let cardioBase = 0;
  if (km > 0 && min > 0) {
    cardioBase = Math.round(min * 8 + km * 35);
  } else if (min > 0) {
    cardioBase = Math.round(min * 10);
  } else if (km > 0) {
    cardioBase = Math.round(km * 65);
  }

  const steps = Math.max(0, log.steps ?? 0);
  const activeCal = Math.max(0, log.activeCalories ?? 0);
  const stepsLoad = steps > 0 ? Math.round((steps / 1000) * 16) : 0;
  const activeCalLoad = activeCal > 0 ? Math.round(activeCal * 0.22) : 0;

  let watchLoad = 0;
  if (stepsLoad > 0 && activeCalLoad > 0) {
    watchLoad =
      Math.max(stepsLoad, activeCalLoad) +
      Math.round(Math.min(stepsLoad, activeCalLoad) * 0.35);
  } else {
    watchLoad = stepsLoad + activeCalLoad;
  }

  if (cardioBase > 0 && watchLoad > 0) {
    return Math.round(cardioBase + watchLoad * 0.55);
  }
  return cardioBase + watchLoad;
}

export function classifyAcwrZone(acwr: number | null): {
  zone: AcwrZone | null;
  zoneLabel: string;
  zoneAdvice: string;
} {
  if (acwr === null) {
    return {
      zone: null,
      zoneLabel: 'Недостатъчно данни',
      zoneAdvice:
        'Нужни са силови тренировки от Hevy или кардио записи в последните 28 дни за изчисляване на съотношението.',
    };
  }
  if (acwr < 0.8) {
    return {
      zone: 'undertraining',
      zoneLabel: 'Недостатъчно натоварване',
      zoneAdvice:
        'Острото натоварване е под 80% от 4-седмичната база — възможен е спад във формата. Планирай постепенно повишаване на обема.',
    };
  }
  if (acwr <= 1.3) {
    return {
      zone: 'sweet_spot',
      zoneLabel: 'Оптимална зона за прогрес (Sweet Spot)',
      zoneAdvice:
        'Перфектен баланс между стимул и адаптация (0.8–1.3). Продължавай с текущата прогресия.',
    };
  }
  if (acwr <= 1.5) {
    return {
      zone: 'elevated',
      zoneLabel: 'Повишено натоварване',
      zoneAdvice:
        'Натоварването е повишено (1.3–1.5). Осигури достатъчно сън, калории и следи умората в ставите.',
    };
  }
  return {
    zone: 'high_risk',
    zoneLabel: 'Червена зона (висок риск)',
    zoneAdvice:
      'Висок риск от претрениране и травми (> 1.5). Намали обема с 20–30% или включи разтоварващи дни.',
  };
}

export function computeAcwrReport(
  workouts: HevyWorkout[],
  dailyLogs: DailyBiometricLog[],
  anchorDate: string,
): AcwrReport {
  const strengthByDate = new Map<string, number>();
  for (const w of workouts) {
    if (!w.date) continue;
    const prev = strengthByDate.get(w.date) ?? 0;
    strengthByDate.set(w.date, prev + computeStrengthWorkoutLoad(w));
  }

  const cardioByDate = new Map<string, number>();
  for (const d of dailyLogs) {
    if (!d.date) continue;
    const cLoad = computeCardioDailyLoad(d);
    if (cLoad > 0) {
      cardioByDate.set(d.date, (cardioByDate.get(d.date) ?? 0) + cLoad);
    }
  }

  // Build 55 days back so every day inside the 28-day chart window has its own full 28-day chronic history
  const extendedStart = shiftDate(anchorDate, -54);
  const dailyLoads: Array<{
    date: string;
    strengthLoad: number;
    cardioLoad: number;
    totalLoad: number;
  }> = [];

  for (let i = 0; i < 55; i++) {
    const d = shiftDate(extendedStart, i);
    const sLoad = strengthByDate.get(d) ?? 0;
    const cLoad = cardioByDate.get(d) ?? 0;
    dailyLoads.push({
      date: d,
      strengthLoad: sLoad,
      cardioLoad: cLoad,
      totalLoad: sLoad + cLoad,
    });
  }

  const seriesStartIdx = 27; // last 28 days: indices 27..54
  const dailySeries28d: AcwrDailyPoint[] = [];

  for (let idx = seriesStartIdx; idx < dailyLoads.length; idx++) {
    const item = dailyLoads[idx];
    let acute7d = 0;
    for (let j = Math.max(0, idx - 6); j <= idx; j++) {
      acute7d += dailyLoads[j].totalLoad;
    }

    let sum28d = 0;
    for (let j = Math.max(0, idx - 27); j <= idx; j++) {
      sum28d += dailyLoads[j].totalLoad;
    }
    const chronicWeeklyAvg28d = Math.round(sum28d / 4);
    const acwr =
      chronicWeeklyAvg28d > 0
        ? roundTwo(acute7d / chronicWeeklyAvg28d)
        : null;

    const parts = item.date.split('-');
    const shortLabel =
      parts.length === 3 ? `${Number(parts[2])}.${Number(parts[1])}` : item.date;

    dailySeries28d.push({
      date: item.date,
      shortLabel,
      strengthLoad: item.strengthLoad,
      cardioLoad: item.cardioLoad,
      totalLoad: item.totalLoad,
      acute7d,
      chronicWeeklyAvg28d,
      acwr,
    });
  }

  const latestPoint = dailySeries28d[dailySeries28d.length - 1];
  const acuteLoad7d = latestPoint?.acute7d ?? 0;
  const chronicWeeklyAvg28d = latestPoint?.chronicWeeklyAvg28d ?? 0;
  const acwr = latestPoint?.acwr ?? null;
  const zoneInfo = classifyAcwrZone(acwr);

  let totalStrength28d = 0;
  let totalCardio28d = 0;
  for (const pt of dailySeries28d) {
    totalStrength28d += pt.strengthLoad;
    totalCardio28d += pt.cardioLoad;
  }
  const combined28d = totalStrength28d + totalCardio28d;
  const strengthSharePct =
    combined28d > 0 ? Math.round((totalStrength28d / combined28d) * 100) : 0;
  const cardioSharePct =
    combined28d > 0 ? 100 - strengthSharePct : 0;

  return {
    anchorDate,
    acuteLoad7d,
    chronicWeeklyAvg28d,
    acwr,
    zone: zoneInfo.zone,
    zoneLabel: zoneInfo.zoneLabel,
    zoneAdvice: zoneInfo.zoneAdvice,
    strengthSharePct,
    cardioSharePct,
    dailySeries28d,
  };
}

// ============================================================================
// 3. Победи дневника (Next Session Targets)
// ============================================================================

export interface HevyRoutineOption {
  title: string;
  workoutCount: number;
  lastDate: string;
  exerciseTitles: string[];
}

export function getUniqueHevyRoutines(workouts: HevyWorkout[]): HevyRoutineOption[] {
  const sortedDesc = [...workouts].sort(
    (a, b) => parseWorkoutSortTs(b) - parseWorkoutSortTs(a),
  );
  const byTitle = new Map<string, HevyRoutineOption>();

  for (const w of sortedDesc) {
    const cleanTitle = w.title.trim();
    if (!cleanTitle) continue;
    const key = cleanTitle.toLowerCase();
    const existing = byTitle.get(key);
    if (!existing) {
      byTitle.set(key, {
        title: cleanTitle,
        workoutCount: 1,
        lastDate: w.date,
        exerciseTitles: Array.from(
          new Set(w.exercises.map((e) => e.title.trim()).filter(Boolean)),
        ),
      });
    } else {
      existing.workoutCount += 1;
    }
  }

  return Array.from(byTitle.values()).sort((a, b) => {
    if (b.lastDate !== a.lastDate) return b.lastDate.localeCompare(a.lastDate);
    return b.workoutCount - a.workoutCount;
  });
}

export function computeExerciseNextTarget(
  workouts: HevyWorkout[],
  exerciseTitle: string,
): BeatLogExerciseTarget | null {
  const targetKey = exerciseTitle.trim().toLowerCase();
  if (!targetKey) return null;

  const sortedDesc = [...workouts].sort(
    (a, b) => parseWorkoutSortTs(b) - parseWorkoutSortTs(a),
  );

  for (const w of sortedDesc) {
    const matchedExercises = w.exercises.filter(
      (ex) => ex.title.trim().toLowerCase() === targetKey,
    );
    if (matchedExercises.length === 0) continue;

    const allSets = matchedExercises.flatMap((e) => e.sets);
    const workingSets = getWorkingSets(allSets);
    if (workingSets.length === 0) continue;

    const weights = workingSets.map((s) => s.weightKg ?? 0);
    const maxWeightKg = Math.max(0, ...weights);
    const isBodyweightOnly = maxWeightKg <= 0;

    const repsList = workingSets
      .map((s) => s.reps ?? 0)
      .filter((r) => r > 0);
    const minReps = repsList.length > 0 ? Math.min(...repsList) : 0;
    const maxReps = repsList.length > 0 ? Math.max(...repsList) : 0;
    const repsLabel =
      minReps === maxReps
        ? String(minReps)
        : `${minReps}–${maxReps}`;

    const rpeValues = workingSets
      .map((s) => s.rpe)
      .filter((r): r is number => r !== undefined && Number.isFinite(r) && r > 0);
    const avgRpe =
      rpeValues.length > 0
        ? roundOne(rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length)
        : null;
    const maxRpe = rpeValues.length > 0 ? Math.max(...rpeValues) : null;

    let bestEstimated1RM = 0;
    for (const s of workingSets) {
      const wt = s.weightKg ?? 0;
      const rp = s.reps ?? 0;
      if (wt > 0 && rp > 0) {
        const e = calculateEpley1RM(wt, rp);
        if (e > bestEstimated1RM) bestEstimated1RM = e;
      }
    }

    const setsCount = workingSets.length;
    const hasAllReps8Plus =
      workingSets.length > 0 && workingSets.every((s) => (s.reps ?? 0) >= 8);
    const hasAllRpeUnder9 =
      workingSets.length > 0 &&
      workingSets.every(
        (s) => s.rpe !== undefined && Number.isFinite(s.rpe) && s.rpe < 9,
      );

    const shouldIncreaseWeight =
      !isBodyweightOnly && hasAllReps8Plus && hasAllRpeUnder9;

    const lastLine = isBodyweightOnly
      ? `Миналия път: ${setsCount}×${repsLabel} повт.`
      : `Миналия път: ${setsCount}×${repsLabel} с ${formatWeightClean(maxWeightKg)} kg`;

    if (shouldIncreaseWeight) {
      const targetWeightKg = roundOne(maxWeightKg + 2.5);
      const targetRepsText = '6–8';
      const minTargetE1RM = calculateEpley1RM(targetWeightKg, 6);
      const targetEstimated1RM = Math.max(
        minTargetE1RM,
        roundOne(bestEstimated1RM + 0.5),
      );
      return {
        exerciseTitle: matchedExercises[0].title,
        lastDate: w.date,
        lastWorkoutTitle: w.title,
        strategy: 'increase_weight',
        lastSummary: {
          workingSetsCount: setsCount,
          lastWeightKg: maxWeightKg,
          minReps,
          maxReps,
          repsLabel,
          avgRpe,
          maxRpe,
          bestEstimated1RM: roundOne(bestEstimated1RM),
          isBodyweightOnly,
        },
        lastLine,
        targetLine: `Днес гони: ${setsCount}×${targetRepsText} с ${formatWeightClean(targetWeightKg)} kg`,
        targetWeightKg,
        targetRepsText,
        targetEstimated1RM,
        rpeNote: `Всички серии с ≥ 8 повт. и RPE ≤ ${maxRpe} (< 9)`,
      };
    }

    const nextMin = minReps + 1;
    const nextMax = maxReps + 1;
    const targetRepsText =
      nextMin === nextMax ? String(nextMax) : `${nextMin}–${nextMax}`;
    const targetLine = isBodyweightOnly
      ? `Днес гони: ${setsCount}×${targetRepsText} повт.`
      : `Днес гони: ${setsCount}×${targetRepsText} с ${formatWeightClean(maxWeightKg)} kg`;

    const projected1RM = !isBodyweightOnly
      ? Math.max(
          calculateEpley1RM(maxWeightKg, nextMax),
          roundOne(bestEstimated1RM + 0.5),
        )
      : 0;

    const rpeNote =
      maxRpe === null
        ? 'Няма записан RPE → добави +1 повторение на серия'
        : hasAllReps8Plus
          ? `RPE ${maxRpe} (≥ 9) → затвърди с +1 повторение`
          : `Под 8 повт. на всички серии → добави +1 повторение`;

    return {
      exerciseTitle: matchedExercises[0].title,
      lastDate: w.date,
      lastWorkoutTitle: w.title,
      strategy: 'increase_reps',
      lastSummary: {
        workingSetsCount: setsCount,
        lastWeightKg: maxWeightKg,
        minReps,
        maxReps,
        repsLabel,
        avgRpe,
        maxRpe,
        bestEstimated1RM: roundOne(bestEstimated1RM),
        isBodyweightOnly,
      },
      lastLine,
      targetLine,
      targetWeightKg: maxWeightKg,
      targetRepsText,
      targetEstimated1RM: projected1RM,
      rpeNote,
    };
  }

  return null;
}

export function buildBeatTheLogTargets(
  workouts: HevyWorkout[],
  exerciseTitles: string[],
): BeatLogExerciseTarget[] {
  const results: BeatLogExerciseTarget[] = [];
  const seen = new Set<string>();
  for (const title of exerciseTitles) {
    const key = title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const target = computeExerciseNextTarget(workouts, title);
    if (target) results.push(target);
  }
  return results;
}

export function formatTargetsForClipboard(
  routineLabel: string,
  targets: BeatLogExerciseTarget[],
): string {
  const lines = [`Цели за днес — ${routineLabel}`, ''];
  targets.forEach((item, index) => {
    const e1rmPart =
      item.targetEstimated1RM > 0
        ? ` | Целеви 1RM: ${formatWeightClean(item.targetEstimated1RM)} kg`
        : '';
    lines.push(
      `${index + 1}. ${item.exerciseTitle}: ${item.lastLine} → ${item.targetLine}${e1rmPart}`,
    );
  });
  return lines.join('\n');
}

// ============================================================================
// 4. Нива на сила и хибридни цели (Strength Standards + Running)
// ============================================================================

interface LiftStandardBenchmark {
  id: string;
  label: string;
  isBodyweightLift: boolean;
  matches: (titleLower: string) => boolean;
  thresholds: { intermediate: number; advanced: number; elite: number };
}

const KEY_STRENGTH_BENCHMARKS: LiftStandardBenchmark[] = [
  {
    id: 'squat',
    label: 'Клек (Squat)',
    isBodyweightLift: false,
    matches: (t) =>
      (t.includes('squat') || t.includes('клек')) &&
      !t.includes('split') &&
      !t.includes('goblet') &&
      !t.includes('bulgarian'),
    thresholds: { intermediate: 1.0, advanced: 1.5, elite: 2.0 },
  },
  {
    id: 'bench',
    label: 'Избутване от лег (Bench Press)',
    isBodyweightLift: false,
    matches: (t) =>
      (t.includes('bench press') || t.includes('лежанка') || t.includes('лег')) &&
      !t.includes('incline') &&
      !t.includes('decline'),
    thresholds: { intermediate: 0.75, advanced: 1.25, elite: 1.6 },
  },
  {
    id: 'deadlift',
    label: 'Мъртва тяга (Deadlift)',
    isBodyweightLift: false,
    matches: (t) =>
      (t.includes('deadlift') || t.includes('мъртва тяга')) &&
      !t.includes('romanian') &&
      !t.includes('rdl') &&
      !t.includes('румънска'),
    thresholds: { intermediate: 1.25, advanced: 1.85, elite: 2.4 },
  },
  {
    id: 'ohp',
    label: 'Раменна преса (OHP)',
    isBodyweightLift: false,
    matches: (t) =>
      t.includes('overhead press') ||
      t.includes('military press') ||
      t.includes('ohp') ||
      t.includes('shoulder press') ||
      t.includes('раменна преса'),
    thresholds: { intermediate: 0.5, advanced: 0.85, elite: 1.15 },
  },
  {
    id: 'pullup',
    label: 'Набирания (Pull Up / Chin Up)',
    isBodyweightLift: true,
    matches: (t) =>
      t.includes('pull up') ||
      t.includes('pull-up') ||
      t.includes('pullup') ||
      t.includes('chin up') ||
      t.includes('chin-up') ||
      t.includes('набира'),
    thresholds: { intermediate: 1.05, advanced: 1.3, elite: 1.6 },
  },
  {
    id: 'dip',
    label: 'Кофички (Dips)',
    isBodyweightLift: true,
    matches: (t) => t.includes('dip') || t.includes('кофичк'),
    thresholds: { intermediate: 1.1, advanced: 1.35, elite: 1.65 },
  },
  {
    id: 'row',
    label: 'Гребане с щанга (Barbell Row)',
    isBodyweightLift: false,
    matches: (t) =>
      t.includes('barbell row') ||
      t.includes('bent over row') ||
      t.includes('pendlay row') ||
      t.includes('гребане с щанга'),
    thresholds: { intermediate: 0.7, advanced: 1.1, elite: 1.45 },
  },
];

const TIER_LABELS: Record<StandardTier, string> = {
  beginner: 'Начинаещ',
  intermediate: 'Среден',
  advanced: 'Напреднал',
  elite: 'Елит',
};

function evaluateStrengthTier(
  ratio: number,
  bodyWeightKg: number,
  estimated1RM: number,
  thresholds: { intermediate: number; advanced: number; elite: number },
): {
  tier: StandardTier;
  tierLabel: string;
  nextTierLabel: string | null;
  nextTierTargetKg: number | null;
  kgRemainingToNext: number | null;
  progressPercent: number;
} {
  let tier: StandardTier = 'beginner';
  let nextTierLabel: string | null = TIER_LABELS.intermediate;
  let nextRatio: number | null = thresholds.intermediate;

  if (ratio >= thresholds.elite) {
    tier = 'elite';
    nextTierLabel = null;
    nextRatio = null;
  } else if (ratio >= thresholds.advanced) {
    tier = 'advanced';
    nextTierLabel = TIER_LABELS.elite;
    nextRatio = thresholds.elite;
  } else if (ratio >= thresholds.intermediate) {
    tier = 'intermediate';
    nextTierLabel = TIER_LABELS.advanced;
    nextRatio = thresholds.advanced;
  }

  const nextTierTargetKg =
    nextRatio !== null ? roundOne(nextRatio * bodyWeightKg) : null;
  const kgRemainingToNext =
    nextTierTargetKg !== null
      ? Math.max(0.5, roundOne(nextTierTargetKg - estimated1RM))
      : null;

  // Map ratio across 4 equal visual quartiles (0-25, 25-50, 50-75, 75-100)
  let progressPercent = 0;
  if (ratio <= 0) {
    progressPercent = 0;
  } else if (ratio < thresholds.intermediate) {
    progressPercent = Math.min(25, (ratio / thresholds.intermediate) * 25);
  } else if (ratio < thresholds.advanced) {
    progressPercent =
      25 +
      ((ratio - thresholds.intermediate) /
        (thresholds.advanced - thresholds.intermediate)) *
        25;
  } else if (ratio < thresholds.elite) {
    progressPercent =
      50 +
      ((ratio - thresholds.advanced) /
        (thresholds.elite - thresholds.advanced)) *
        25;
  } else {
    progressPercent = Math.min(
      100,
      75 + ((ratio - thresholds.elite) / Math.max(0.25, thresholds.elite * 0.25)) * 25,
    );
  }

  return {
    tier,
    tierLabel: TIER_LABELS[tier],
    nextTierLabel,
    nextTierTargetKg,
    kgRemainingToNext,
    progressPercent: Math.round(Math.max(4, Math.min(100, progressPercent))),
  };
}

export function computeStrengthStandards(
  workouts: HevyWorkout[],
  bodyWeightKg: number | null,
): StrengthStandardEntry[] {
  if (!bodyWeightKg || bodyWeightKg <= 0 || workouts.length === 0) return [];

  const entries: StrengthStandardEntry[] = [];

  for (const bench of KEY_STRENGTH_BENCHMARKS) {
    let best: {
      exerciseTitle: string;
      date: string;
      totalLoadKg: number;
      addedWeightKg: number;
      reps: number;
      e1rm: number;
    } | null = null;

    for (const w of workouts) {
      for (const ex of w.exercises) {
        const lower = ex.title.trim().toLowerCase();
        if (!bench.matches(lower)) continue;

        for (const s of getWorkingSets(ex.sets)) {
          const reps = s.reps ?? 0;
          if (reps <= 0) continue;
          const rawWeight = Math.max(0, s.weightKg ?? 0);
          if (!bench.isBodyweightLift && rawWeight <= 0) continue;

          const totalLoadKg = bench.isBodyweightLift
            ? roundOne(bodyWeightKg + rawWeight)
            : rawWeight;
          const e1rm = calculateEpley1RM(totalLoadKg, reps);
          if (
            !best ||
            e1rm > best.e1rm ||
            (e1rm === best.e1rm && w.date > best.date)
          ) {
            best = {
              exerciseTitle: ex.title,
              date: w.date,
              totalLoadKg,
              addedWeightKg: rawWeight,
              reps,
              e1rm,
            };
          }
        }
      }
    }

    if (!best) continue;

    const ratioToBodyWeight = roundTwo(best.e1rm / bodyWeightKg);
    const evalTier = evaluateStrengthTier(
      ratioToBodyWeight,
      bodyWeightKg,
      best.e1rm,
      bench.thresholds,
    );

    entries.push({
      id: bench.id,
      label: bench.label,
      matchedExerciseTitle: best.exerciseTitle,
      isBodyweightLift: bench.isBodyweightLift,
      date: best.date,
      bestWeightKg: best.totalLoadKg,
      bestAddedWeightKg: best.addedWeightKg,
      bestReps: best.reps,
      bodyWeightKg,
      estimated1RM: best.e1rm,
      ratioToBodyWeight,
      tier: evalTier.tier,
      tierLabel: evalTier.tierLabel,
      nextTierLabel: evalTier.nextTierLabel,
      nextTierTargetKg: evalTier.nextTierTargetKg,
      kgRemainingToNext: evalTier.kgRemainingToNext,
      progressPercent: evalTier.progressPercent,
      thresholds: bench.thresholds,
    });
  }

  return entries;
}

export function formatTimeMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function computeRunningStandards(
  dailyLogs: DailyBiometricLog[],
): RunningHybridStandardEntry[] {
  const runs = dailyLogs
    .filter(
      (d) =>
        d.cardioDistanceKm !== undefined &&
        d.cardioDistanceKm > 0 &&
        d.cardioDurationMinutes !== undefined &&
        d.cardioDurationMinutes > 0,
    )
    .map((d) => {
      const km = d.cardioDistanceKm as number;
      const min = d.cardioDurationMinutes as number;
      return {
        date: d.date,
        km,
        min,
        paceMinPerKm: min / km,
      };
    });

  if (runs.length === 0) return [];

  const configs: Array<{
    distanceTargetKm: 5 | 10;
    label: string;
    minActualKm: number;
    thresholdsSec: { intermediate: number; advanced: number; elite: number };
  }> = [
    {
      distanceTargetKm: 5,
      label: 'Бягане 5 km',
      minActualKm: 4.5,
      thresholdsSec: {
        intermediate: 30 * 60, // 30:00
        advanced: 25 * 60, // 25:00
        elite: 20 * 60, // 20:00
      },
    },
    {
      distanceTargetKm: 10,
      label: 'Бягане 10 km',
      minActualKm: 9.2,
      thresholdsSec: {
        intermediate: 62 * 60, // 62:00
        advanced: 50 * 60, // 50:00
        elite: 42 * 60, // 42:00
      },
    },
  ];

  const results: RunningHybridStandardEntry[] = [];

  for (const cfg of configs) {
    const qualifyingRuns = runs.filter((r) => r.km >= cfg.minActualKm);
    const pool = qualifyingRuns.length > 0 ? qualifyingRuns : runs;
    const isProjected = qualifyingRuns.length === 0;

    // Pick fastest pace (lowest paceMinPerKm)
    const bestRun = [...pool].sort(
      (a, b) => a.paceMinPerKm - b.paceMinPerKm,
    )[0];
    if (!bestRun) continue;

    const estimatedTimeSeconds = Math.round(
      bestRun.paceMinPerKm * cfg.distanceTargetKm * 60,
    );
    const paceSecPerKm = Math.round(bestRun.paceMinPerKm * 60);

    const { intermediate, advanced, elite } = cfg.thresholdsSec;
    let tier: StandardTier = 'beginner';
    let nextTierLabel: string | null = TIER_LABELS.intermediate;
    let nextTierTargetSeconds: number | null = intermediate;

    if (estimatedTimeSeconds <= elite) {
      tier = 'elite';
      nextTierLabel = null;
      nextTierTargetSeconds = null;
    } else if (estimatedTimeSeconds <= advanced) {
      tier = 'advanced';
      nextTierLabel = TIER_LABELS.elite;
      nextTierTargetSeconds = elite;
    } else if (estimatedTimeSeconds <= intermediate) {
      tier = 'intermediate';
      nextTierLabel = TIER_LABELS.advanced;
      nextTierTargetSeconds = advanced;
    }

    const secondsRemainingToNext =
      nextTierTargetSeconds !== null
        ? Math.max(1, estimatedTimeSeconds - nextTierTargetSeconds)
        : null;

    // Progress percentage (faster time = higher progress)
    const beginnerCeiling = intermediate * 1.25;
    let progressPercent = 0;
    if (estimatedTimeSeconds > intermediate) {
      progressPercent = Math.max(
        5,
        ((beginnerCeiling - estimatedTimeSeconds) /
          (beginnerCeiling - intermediate)) *
          25,
      );
    } else if (estimatedTimeSeconds > advanced) {
      progressPercent =
        25 + ((intermediate - estimatedTimeSeconds) / (intermediate - advanced)) * 25;
    } else if (estimatedTimeSeconds > elite) {
      progressPercent =
        50 + ((advanced - estimatedTimeSeconds) / (advanced - elite)) * 25;
    } else {
      progressPercent = Math.min(
        100,
        75 + ((elite - estimatedTimeSeconds) / Math.max(120, elite * 0.15)) * 25,
      );
    }

    results.push({
      distanceTargetKm: cfg.distanceTargetKm,
      label: cfg.label,
      bestDistanceKm: roundTwo(bestRun.km),
      bestDurationMin: bestRun.min,
      date: bestRun.date,
      isProjected,
      paceMinPerKm: roundTwo(bestRun.paceMinPerKm),
      paceText: `${formatTimeMmSs(paceSecPerKm)} /km`,
      estimatedTimeSeconds,
      estimatedTimeText: formatTimeMmSs(estimatedTimeSeconds),
      tier,
      tierLabel: TIER_LABELS[tier],
      nextTierLabel,
      nextTierTargetSeconds,
      secondsRemainingToNext,
      progressPercent: Math.round(Math.max(4, Math.min(100, progressPercent))),
    });
  }

  return results;
}

// ============================================================================
// 5. Цикли и ефект на добавките (Supplement Cycling & Impact)
// ============================================================================

export function getDefaultCycleConfig(
  name: string,
  todayKey: string,
): SupplementCycleConfig {
  return {
    name,
    mode: 'continuous',
    onWeeks: 8,
    offWeeks: 2,
    startDate: todayKey,
  };
}

export function computeSupplementCycleStatus(
  config: SupplementCycleConfig,
  referenceDateKey: string,
): SupplementCycleStatus {
  if (config.mode === 'continuous') {
    return {
      phase: 'continuous',
      badgeText: 'Постоянен прием',
      dayInPhase: null,
      phaseTotalDays: null,
    };
  }

  const startDate = config.startDate || referenceDateKey;
  const elapsed = diffDays(startDate, referenceDateKey);
  if (elapsed < 0) {
    const daysUntil = Math.abs(elapsed);
    return {
      phase: 'upcoming',
      badgeText: `Стартира след ${daysUntil} д.`,
      dayInPhase: null,
      phaseTotalDays: null,
    };
  }

  const onDays = Math.max(1, config.onWeeks) * 7;
  const offDays = Math.max(1, config.offWeeks) * 7;
  const cycleLen = onDays + offDays;
  const posInCycle = elapsed % cycleLen;

  if (posInCycle < onDays) {
    const dayInPhase = posInCycle + 1;
    return {
      phase: 'on',
      badgeText: `Фаза прием: Ден ${dayInPhase}/${onDays}`,
      dayInPhase,
      phaseTotalDays: onDays,
    };
  }

  const dayInPhase = posInCycle - onDays + 1;
  return {
    phase: 'off',
    badgeText: `Фаза почивка: Ден ${dayInPhase}/${offDays} — време за пауза`,
    dayInPhase,
    phaseTotalDays: offDays,
  };
}

function compareMetricGroup(
  onValues: number[],
  offValues: number[],
  decimals: number = 1,
): SupplementMetricComparison {
  const roundFn = decimals === 2 ? roundTwo : roundOne;
  const onAvg =
    onValues.length > 0
      ? roundFn(onValues.reduce((a, b) => a + b, 0) / onValues.length)
      : null;
  const offAvg =
    offValues.length > 0
      ? roundFn(offValues.reduce((a, b) => a + b, 0) / offValues.length)
      : null;
  const diffPercent =
    onAvg !== null && offAvg !== null && offAvg > 0
      ? roundOne(((onAvg - offAvg) / offAvg) * 100)
      : null;

  return {
    onAvg,
    offAvg,
    onCount: onValues.length,
    offCount: offValues.length,
    diffPercent,
  };
}

export function computeSupplementImpactAnalysis(params: {
  habitItems: string[];
  supplementCycles?: Record<string, SupplementCycleConfig>;
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): SupplementImpactAnalysis[] {
  const {
    habitItems,
    supplementCycles = {},
    dailyLogs,
    hevyWorkouts,
    todayKey,
  } = params;

  // Index Hevy volume and peak 1RM per date
  const workoutStatsByDate = new Map<
    string,
    { totalVolumeKg: number; peak1RM: number }
  >();

  for (const w of hevyWorkouts) {
    if (!w.date) continue;
    let peak1RM = 0;
    for (const ex of w.exercises) {
      for (const s of getWorkingSets(ex.sets)) {
        const wt = s.weightKg ?? 0;
        const rp = s.reps ?? 0;
        if (wt > 0 && rp > 0) {
          const e = calculateEpley1RM(wt, rp);
          if (e > peak1RM) peak1RM = e;
        }
      }
    }
    const existing = workoutStatsByDate.get(w.date);
    if (!existing) {
      workoutStatsByDate.set(w.date, {
        totalVolumeKg: roundOne(w.totalVolumeKg),
        peak1RM: roundOne(peak1RM),
      });
    } else {
      existing.totalVolumeKg = roundOne(existing.totalVolumeKg + w.totalVolumeKg);
      if (peak1RM > existing.peak1RM) {
        existing.peak1RM = roundOne(peak1RM);
      }
    }
  }

  return habitItems.map((name) => {
    const config =
      supplementCycles[name] ?? getDefaultCycleConfig(name, todayKey);
    const cycleStatus = computeSupplementCycleStatus(config, todayKey);
    const targetLower = name.trim().toLowerCase();

    const onSleep: number[] = [];
    const offSleep: number[] = [];
    const onHr: number[] = [];
    const offHr: number[] = [];
    const onVolume: number[] = [];
    const offVolume: number[] = [];
    const on1RM: number[] = [];
    const off1RM: number[] = [];

    let daysOnCount = 0;
    let daysOffCount = 0;

    for (const log of dailyLogs) {
      const taken = log.completedHabits.some(
        (h) => h.trim().toLowerCase() === targetLower,
      );
      if (taken) {
        daysOnCount += 1;
      } else {
        daysOffCount += 1;
      }

      if (log.sleepQuality !== undefined) {
        (taken ? onSleep : offSleep).push(log.sleepQuality);
      }
      if (log.restingHr !== undefined) {
        (taken ? onHr : offHr).push(log.restingHr);
      }

      const wStats = workoutStatsByDate.get(log.date);
      if (wStats) {
        if (wStats.totalVolumeKg > 0) {
          (taken ? onVolume : offVolume).push(wStats.totalVolumeKg);
        }
        if (wStats.peak1RM > 0) {
          (taken ? on1RM : off1RM).push(wStats.peak1RM);
        }
      }
    }

    return {
      name,
      config,
      cycleStatus,
      daysOnCount,
      daysOffCount,
      sleepQuality: compareMetricGroup(onSleep, offSleep, 2),
      restingHr: compareMetricGroup(onHr, offHr, 1),
      workoutVolume: compareMetricGroup(onVolume, offVolume, 1),
      peak1RM: compareMetricGroup(on1RM, off1RM, 1),
    };
  });
}
