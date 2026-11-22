import type {
  DailyBiometricLog,
  HevyWorkout,
  WatchActivityRecord,
} from '../types/fitness';
import {
  diffCalendarDays,
  isValidDateKey,
  shiftDateKey,
} from './fitnessMath';
import { isBoxingWorkout } from './relativeStrengthAndBiorhythm';

export type WatchActivityCategory = 'mountain' | 'run' | 'ride_ski' | 'walk';

export interface EnrichedWatchActivity {
  key: string;
  date: string;
  type: string;
  typeLabelBg: string;
  category: WatchActivityCategory;
  name: string;
  distanceMeters: number;
  distanceKm: number;
  movingTimeSec: number;
  movingTimeMin: number;
  elevationGainM: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  maxSpeedMs: number | null;
  maxSpeedKmh: number | null;
  calories: number | null;
  /** Vertical Ascent in Meters per hour (only when elevationGainM >= 100 and movingTimeSec > 0) */
  vamMetersPerHour: number | null;
  /** Pace in seconds per km (only for Run/TrailRun with distance >= 500m and movingTime > 0) */
  paceSecPerKm: number | null;
  /** Cardiac Efficiency Factor (EF): grade-adjusted speed (m/min) / average_heartrate * 100 */
  efficiencyFactor: number | null;
  isFromLegacySummary: boolean;
}

export interface EfTrendPoint {
  date: string;
  label: string;
  activityName: string;
  typeLabelBg: string;
  ef: number;
  averageHeartrate: number;
  vam: number | null;
  distanceKm: number;
  elevationGainM: number;
}

export interface PaceRecordEntry {
  paceSecPerKm: number;
  paceFormatted: string; // e.g. "4:38 /км"
  distanceKm: number;
  date: string;
  name: string;
}

export interface ElevationRecordEntry {
  elevationGainM: number;
  distanceKm: number;
  vamMetersPerHour: number | null;
  date: string;
  name: string;
}

export interface LongestHikeRecordEntry {
  distanceKm: number;
  elevationGainM: number;
  movingTimeMin: number;
  date: string;
  name: string;
}

export interface WinterSpeedRecordEntry {
  maxSpeedKmh: number;
  typeLabelBg: string;
  date: string;
  name: string;
}

export interface MountainCardioHallOfFame {
  bestPace1Km: PaceRecordEntry | null;
  bestPace3Km: PaceRecordEntry | null;
  maxSingleElevation: ElevationRecordEntry | null;
  longestHike: LongestHikeRecordEntry | null;
  maxWinterSpeed: WinterSpeedRecordEntry | null;
}

export interface MountainCardioReport {
  anchorDate: string;
  windowDays: 60 | 90;
  totalActivitiesCount: number;
  activities30dCount: number;
  totalElevation30dM: number;
  totalDistance30dKm: number;
  totalAerobicMinutes30d: number;
  avgVamMetersPerHour: number | null;
  bestVamMetersPerHour: number | null;
  bestVamDate: string | null;
  bestVamName: string | null;
  latestEf: number | null;
  efTrendPct: number | null;
  efTrendStatus: 'improving' | 'stable' | 'declining' | 'insufficient';
  efTrendLabel: string;
  efTrendPoints: EfTrendPoint[];
  hallOfFame: MountainCardioHallOfFame;
  recentActivities: EnrichedWatchActivity[];
}

export interface AerobicBoxingSynergyReport {
  aerobicMinutes7d: number;
  aerobicSessions7d: number;
  elevationGain7dM: number;
  distance7dKm: number;
  boxingSessions14d: number;
  avgRhr7d: number | null;
  targetMinutesWeekly: number;
  progressPct: number;
  status: 'strong' | 'moderate' | 'low';
  statusLabel: string;
  boxingBenefitNote: string;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function formatPaceMinPerKm(paceSecPerKm: number | null): string {
  if (paceSecPerKm === null || !Number.isFinite(paceSecPerKm) || paceSecPerKm <= 0) {
    return '—';
  }
  const totalSec = Math.round(paceSecPerKm);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, '0')} мин/км`;
}

export function getWatchActivityTypeLabelBg(type: string): string {
  const norm = type.trim().toLowerCase();
  if (norm === 'trailrun' || norm === 'trail_run' || norm === 'trail run') {
    return 'Планинско бягане';
  }
  if (norm === 'run' || norm === 'virtualrun') return 'Бягане';
  if (norm === 'hike') return 'Планински преход';
  if (norm === 'walk') return 'Разходка';
  if (norm === 'ride' || norm === 'virtualride' || norm === 'cycling') {
    return 'Колоездене';
  }
  if (norm === 'alpineski' || norm === 'alpine_ski') return 'Алпийски ски';
  if (norm === 'backcountryski' || norm === 'backcountry_ski') {
    return 'Ски туринг';
  }
  if (norm === 'snowboard' || norm === 'snowboarding') return 'Сноуборд';
  return type;
}

export function classifyWatchActivityCategory(
  type: string,
  elevationGainM: number = 0,
): WatchActivityCategory {
  const norm = type.trim().toLowerCase();
  if (norm === 'hike' || norm === 'trailrun' || norm === 'trail_run') {
    return 'mountain';
  }
  if (norm === 'run' || norm === 'virtualrun') {
    return elevationGainM >= 150 ? 'mountain' : 'run';
  }
  if (
    norm === 'ride' ||
    norm === 'virtualride' ||
    norm === 'cycling' ||
    norm === 'alpineski' ||
    norm === 'alpine_ski' ||
    norm === 'backcountryski' ||
    norm === 'backcountry_ski' ||
    norm === 'snowboard' ||
    norm === 'snowboarding'
  ) {
    return 'ride_ski';
  }
  if (norm === 'walk' && elevationGainM >= 150) {
    return 'mountain';
  }
  return 'walk';
}

export function isRunningActivityType(type: string): boolean {
  const norm = type.trim().toLowerCase();
  return (
    norm === 'run' ||
    norm === 'virtualrun' ||
    norm === 'trailrun' ||
    norm === 'trail_run' ||
    norm === 'trail run'
  );
}

export function isWinterDownhillType(type: string): boolean {
  const norm = type.trim().toLowerCase();
  return (
    norm === 'alpineski' ||
    norm === 'alpine_ski' ||
    norm === 'backcountryski' ||
    norm === 'backcountry_ski' ||
    norm === 'snowboard' ||
    norm === 'snowboarding'
  );
}

export function isHikeOrMountainType(type: string): boolean {
  const norm = type.trim().toLowerCase();
  return (
    norm === 'hike' ||
    norm === 'trailrun' ||
    norm === 'trail_run' ||
    norm === 'trail run' ||
    norm === 'walk' ||
    norm === 'backcountryski' ||
    norm === 'backcountry_ski'
  );
}

/**
 * Computes Vertical Ascent in Meters per Hour (VAM = elevationGain / (movingTime / 3600)).
 * Only calculated for climbs with total_elevation_gain >= 100 m and moving_time >= 300 s.
 */
export function computeActivityVam(
  elevationGainM: number,
  movingTimeSec: number,
): number | null {
  if (
    !Number.isFinite(elevationGainM) ||
    !Number.isFinite(movingTimeSec) ||
    elevationGainM < 100 ||
    movingTimeSec < 300
  ) {
    return null;
  }
  const hours = movingTimeSec / 3600;
  if (hours <= 0) return null;
  const vam = elevationGainM / hours;
  if (!Number.isFinite(vam) || vam <= 0 || vam > 3500) return null;
  return Math.round(vam);
}

/**
 * Computes Cardiac Efficiency Factor (EF):
 * Grade-Adjusted Equivalent Speed (m/min) divided by average heart rate (bpm), scaled ×100
 * for readable precision (e.g. 85–160). Higher EF means faster / stronger climb per heartbeat.
 * Uses 1 m elevation gain ≈ 6 m flat equivalent workload (classic mountain endurance heuristic).
 */
export function computeCardiacEfficiencyFactor(params: {
  distanceMeters: number;
  elevationGainM: number;
  movingTimeSec: number;
  averageHeartrate: number | null;
  type: string;
}): number | null {
  const { distanceMeters, elevationGainM, movingTimeSec, averageHeartrate, type } =
    params;
  if (
    averageHeartrate === null ||
    !Number.isFinite(averageHeartrate) ||
    averageHeartrate < 60 ||
    averageHeartrate > 230 ||
    movingTimeSec < 300
  ) {
    return null;
  }
  // Exclude pure lift-assisted alpine skiing from aerobic EF trend
  if (type.trim().toLowerCase() === 'alpineski' || type.trim().toLowerCase() === 'snowboard') {
    return null;
  }

  const effectiveMeters =
    distanceMeters + (elevationGainM > 0 ? elevationGainM * 6 : 0);
  if (effectiveMeters < 400) return null;

  const movingMin = movingTimeSec / 60;
  const eqMetersPerMin = effectiveMeters / movingMin;
  // Cycling has ~2.5× higher horizontal speed per beat — normalize to running/hiking scale
  const normFactor =
    type.trim().toLowerCase() === 'ride' || type.trim().toLowerCase() === 'cycling'
      ? 0.4
      : 1;

  const ef = ((eqMetersPerMin * normFactor) / averageHeartrate) * 100;
  if (!Number.isFinite(ef) || ef <= 0 || ef > 500) return null;
  return round1(ef);
}

function enrichSingleWatchActivity(
  date: string,
  idx: number,
  act: WatchActivityRecord,
): EnrichedWatchActivity {
  const distanceMeters =
    typeof act.distance === 'number' && Number.isFinite(act.distance) && act.distance > 0
      ? Math.round(act.distance)
      : 0;
  const movingTimeSec =
    typeof act.moving_time === 'number' &&
    Number.isFinite(act.moving_time) &&
    act.moving_time > 0
      ? Math.round(act.moving_time)
      : 0;
  const elevationGainM =
    typeof act.total_elevation_gain === 'number' &&
    Number.isFinite(act.total_elevation_gain) &&
    act.total_elevation_gain > 0
      ? Math.round(act.total_elevation_gain)
      : 0;
  const averageHeartrate =
    typeof act.average_heartrate === 'number' &&
    Number.isFinite(act.average_heartrate) &&
    act.average_heartrate >= 30
      ? Math.round(act.average_heartrate)
      : null;
  const maxHeartrate =
    typeof act.max_heartrate === 'number' &&
    Number.isFinite(act.max_heartrate) &&
    act.max_heartrate >= 30
      ? Math.round(act.max_heartrate)
      : null;
  const maxSpeedMs =
    typeof act.max_speed === 'number' &&
    Number.isFinite(act.max_speed) &&
    act.max_speed > 0
      ? round2(act.max_speed)
      : null;
  const maxSpeedKmh = maxSpeedMs !== null ? round1(maxSpeedMs * 3.6) : null;
  const calories =
    typeof act.calories === 'number' &&
    Number.isFinite(act.calories) &&
    act.calories > 0
      ? Math.round(act.calories)
      : null;

  const distanceKm = round2(distanceMeters / 1000);
  const movingTimeMin = Math.round(movingTimeSec / 60);
  const vamMetersPerHour = computeActivityVam(elevationGainM, movingTimeSec);
  const paceSecPerKm =
    isRunningActivityType(act.type) && distanceMeters >= 500 && movingTimeSec > 0
      ? Math.round(movingTimeSec / (distanceMeters / 1000))
      : null;
  const efficiencyFactor = computeCardiacEfficiencyFactor({
    distanceMeters,
    elevationGainM,
    movingTimeSec,
    averageHeartrate,
    type: act.type,
  });

  return {
    key: `${date}_${act.id ?? idx}_${act.type}`,
    date,
    type: act.type,
    typeLabelBg: getWatchActivityTypeLabelBg(act.type),
    category: classifyWatchActivityCategory(act.type, elevationGainM),
    name: act.name?.trim() || getWatchActivityTypeLabelBg(act.type),
    distanceMeters,
    distanceKm,
    movingTimeSec,
    movingTimeMin,
    elevationGainM,
    averageHeartrate,
    maxHeartrate,
    maxSpeedMs,
    maxSpeedKmh,
    calories,
    vamMetersPerHour,
    paceSecPerKm,
    efficiencyFactor,
    isFromLegacySummary: false,
  };
}

/**
 * Extracts all mountain & cardio activities across dailyLogs.
 * Uses detailed `watchActivities` when present, and falls back to legacy
 * `cardioDistanceKm`/`cardioDurationMinutes`/`cardioElevationGainM` summary fields
 * for older entries synced before `watchActivities` caching was enabled.
 */
export function extractAllEnrichedWatchActivities(
  dailyLogs: DailyBiometricLog[],
): EnrichedWatchActivity[] {
  const results: EnrichedWatchActivity[] = [];

  for (const log of dailyLogs) {
    if (!isValidDateKey(log.date)) continue;

    if (Array.isArray(log.watchActivities) && log.watchActivities.length > 0) {
      log.watchActivities.forEach((act, idx) => {
        results.push(enrichSingleWatchActivity(log.date, idx, act));
      });
      continue;
    }

    // Backwards-compatible fallback from summary cardio fields
    const distKm = log.cardioDistanceKm ?? 0;
    const durMin = log.cardioDurationMinutes ?? 0;
    const elevM = log.cardioElevationGainM ?? 0;
    if (distKm > 0 || durMin > 0 || elevM >= 100) {
      const inferredType =
        elevM >= 200 ? 'Hike' : distKm >= 2 && durMin > 0 && distKm / (durMin / 60) >= 6.5 ? 'Run' : 'Walk';
      const synthetic: WatchActivityRecord = {
        type: inferredType,
        name:
          elevM >= 200
            ? 'Планински преход (обобщен запис)'
            : inferredType === 'Run'
              ? 'Бягане (обобщен запис)'
              : 'Кардио / Разходка',
        distance: Math.round(distKm * 1000),
        moving_time: Math.round(durMin * 60),
        total_elevation_gain: Math.round(elevM),
        calories: log.activeCalories,
      };
      const enriched = enrichSingleWatchActivity(log.date, 0, synthetic);
      enriched.isFromLegacySummary = true;
      results.push(enriched);
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date));
}

function formatShortDate(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${Number(parts[2])}.${Number(parts[1])}`;
}

export function computeMountainCardioReport(params: {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  windowDays?: 60 | 90;
}): MountainCardioReport {
  const { dailyLogs, todayKey, windowDays = 90 } = params;
  const all = extractAllEnrichedWatchActivities(dailyLogs);

  let anchorDate = todayKey;
  if (all.length > 0) {
    const latestDate = all[0].date;
    if (Math.abs(diffCalendarDays(latestDate, todayKey)) > 21) {
      anchorDate = latestDate;
    }
  }

  const start30d = shiftDateKey(anchorDate, -29);
  const startWindow = shiftDateKey(anchorDate, -(windowDays - 1));

  // 30-day totals
  let activities30dCount = 0;
  let totalElevation30dM = 0;
  let totalDistance30dKm = 0;
  let totalAerobicMinutes30d = 0;

  // VAM stats (across window)
  const vamValues: number[] = [];
  let bestVamMetersPerHour: number | null = null;
  let bestVamDate: string | null = null;
  let bestVamName: string | null = null;

  // Hall of Fame (all-time from recorded logs)
  let bestPace1Km: PaceRecordEntry | null = null;
  let bestPace3Km: PaceRecordEntry | null = null;
  let maxSingleElevation: ElevationRecordEntry | null = null;
  let longestHike: LongestHikeRecordEntry | null = null;
  let maxWinterSpeed: WinterSpeedRecordEntry | null = null;

  // EF trend points (chronological inside windowDays)
  const efTrendPoints: EfTrendPoint[] = [];

  for (const act of all) {
    if (act.date >= start30d && act.date <= anchorDate) {
      activities30dCount += 1;
      totalElevation30dM += act.elevationGainM;
      totalDistance30dKm += act.distanceKm;
      if (!isWinterDownhillType(act.type)) {
        totalAerobicMinutes30d += act.movingTimeMin;
      }
    }

    if (act.date >= startWindow && act.date <= anchorDate) {
      if (act.vamMetersPerHour !== null) {
        vamValues.push(act.vamMetersPerHour);
        if (
          bestVamMetersPerHour === null ||
          act.vamMetersPerHour > bestVamMetersPerHour
        ) {
          bestVamMetersPerHour = act.vamMetersPerHour;
          bestVamDate = act.date;
          bestVamName = act.name;
        }
      }

      if (act.efficiencyFactor !== null && act.averageHeartrate !== null) {
        efTrendPoints.push({
          date: act.date,
          label: formatShortDate(act.date),
          activityName: act.name,
          typeLabelBg: act.typeLabelBg,
          ef: act.efficiencyFactor,
          averageHeartrate: act.averageHeartrate,
          vam: act.vamMetersPerHour,
          distanceKm: act.distanceKm,
          elevationGainM: act.elevationGainM,
        });
      }
    }

    // Hall of Fame: Best running paces (>= 1 km and >= 3 km)
    if (
      isRunningActivityType(act.type) &&
      act.paceSecPerKm !== null &&
      act.paceSecPerKm >= 150 && // sanity filter >= 2:30 min/km
      act.paceSecPerKm <= 900
    ) {
      if (act.distanceMeters >= 1000) {
        if (!bestPace1Km || act.paceSecPerKm < bestPace1Km.paceSecPerKm) {
          bestPace1Km = {
            paceSecPerKm: act.paceSecPerKm,
            paceFormatted: formatPaceMinPerKm(act.paceSecPerKm),
            distanceKm: act.distanceKm,
            date: act.date,
            name: act.name,
          };
        }
      }
      if (act.distanceMeters >= 3000) {
        if (!bestPace3Km || act.paceSecPerKm < bestPace3Km.paceSecPerKm) {
          bestPace3Km = {
            paceSecPerKm: act.paceSecPerKm,
            paceFormatted: formatPaceMinPerKm(act.paceSecPerKm),
            distanceKm: act.distanceKm,
            date: act.date,
            name: act.name,
          };
        }
      }
    }

    // Hall of Fame: Max single-hike elevation gain
    if (act.elevationGainM > 0 && !isWinterDownhillType(act.type)) {
      if (
        !maxSingleElevation ||
        act.elevationGainM > maxSingleElevation.elevationGainM
      ) {
        maxSingleElevation = {
          elevationGainM: act.elevationGainM,
          distanceKm: act.distanceKm,
          vamMetersPerHour: act.vamMetersPerHour,
          date: act.date,
          name: act.name,
        };
      }
    }

    // Hall of Fame: Longest hike / mountain trek
    if (isHikeOrMountainType(act.type) && act.distanceKm > 0) {
      if (!longestHike || act.distanceKm > longestHike.distanceKm) {
        longestHike = {
          distanceKm: act.distanceKm,
          elevationGainM: act.elevationGainM,
          movingTimeMin: act.movingTimeMin,
          date: act.date,
          name: act.name,
        };
      }
    }

    // Hall of Fame: Top winter downhill speed (AlpineSki / BackcountrySki / Snowboard)
    if (isWinterDownhillType(act.type) && act.maxSpeedKmh !== null) {
      if (!maxWinterSpeed || act.maxSpeedKmh > maxWinterSpeed.maxSpeedKmh) {
        maxWinterSpeed = {
          maxSpeedKmh: act.maxSpeedKmh,
          typeLabelBg: act.typeLabelBg,
          date: act.date,
          name: act.name,
        };
      }
    }
  }

  // Sort EF trend chronologically (oldest -> newest)
  efTrendPoints.sort((a, b) => a.date.localeCompare(b.date));

  const latestEf =
    efTrendPoints.length > 0 ? efTrendPoints[efTrendPoints.length - 1].ef : null;

  let efTrendPct: number | null = null;
  let efTrendStatus: MountainCardioReport['efTrendStatus'] = 'insufficient';
  let efTrendLabel =
    'Нужни са поне 3 активности с отчетен среден пулс за тренд на аеробната ефективност.';

  if (efTrendPoints.length >= 3) {
    const splitIdx = Math.floor(efTrendPoints.length / 2);
    const firstHalf = efTrendPoints.slice(0, splitIdx);
    const secondHalf = efTrendPoints.slice(splitIdx);
    const firstAvg =
      firstHalf.reduce((s, p) => s + p.ef, 0) / Math.max(1, firstHalf.length);
    const secondAvg =
      secondHalf.reduce((s, p) => s + p.ef, 0) / Math.max(1, secondHalf.length);

    if (firstAvg > 0) {
      efTrendPct = round1(((secondAvg - firstAvg) / firstAvg) * 100);
      if (efTrendPct >= 2.5) {
        efTrendStatus = 'improving';
        efTrendLabel = `Сърдечно-съдовата ефективност расте (+${efTrendPct}% за ${windowDays} дни) — по-бързо темпо/изкачване при същия пулс.`;
      } else if (efTrendPct <= -2.5) {
        efTrendStatus = 'declining';
        efTrendLabel = `Лек спад в сърдечната ефективност (${efTrendPct}%) — възможна натрупана умора или по-висок пулс при изкачване.`;
      } else {
        efTrendStatus = 'stable';
        efTrendLabel = `Стабилна аеробна ефективност (${efTrendPct >= 0 ? '+' : ''}${efTrendPct}%) — добра и постоянна база.`;
      }
    }
  }

  const avgVamMetersPerHour =
    vamValues.length > 0
      ? Math.round(vamValues.reduce((s, v) => s + v, 0) / vamValues.length)
      : null;

  return {
    anchorDate,
    windowDays,
    totalActivitiesCount: all.length,
    activities30dCount,
    totalElevation30dM: Math.round(totalElevation30dM),
    totalDistance30dKm: round1(totalDistance30dKm),
    totalAerobicMinutes30d: Math.round(totalAerobicMinutes30d),
    avgVamMetersPerHour,
    bestVamMetersPerHour,
    bestVamDate,
    bestVamName,
    latestEf,
    efTrendPct,
    efTrendStatus,
    efTrendLabel,
    efTrendPoints,
    hallOfFame: {
      bestPace1Km,
      bestPace3Km,
      maxSingleElevation,
      longestHike,
      maxWinterSpeed,
    },
    recentActivities: all.slice(0, 30),
  };
}

/**
 * Computes Aerobic Base <-> Boxing Synergy indicator for Coach 2.1 („⚡ Днешна готовност и Бокс“).
 * Tracks weekly aerobic zone minutes (hikes/runs/rides) and explains how they support
 * heart-rate recovery between boxing rounds.
 */
export function analyzeAerobicBoxingSynergy(params: {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}): AerobicBoxingSynergyReport {
  const { dailyLogs, hevyWorkouts, todayKey } = params;
  const all = extractAllEnrichedWatchActivities(dailyLogs);

  let anchorDate = todayKey;
  const latestCandidates: string[] = [];
  if (all.length > 0) latestCandidates.push(all[0].date);
  for (const d of dailyLogs) {
    if (isValidDateKey(d.date)) latestCandidates.push(d.date);
  }
  for (const w of hevyWorkouts) {
    if (isValidDateKey(w.date)) latestCandidates.push(w.date);
  }
  if (latestCandidates.length > 0) {
    latestCandidates.sort();
    const latest = latestCandidates[latestCandidates.length - 1];
    if (Math.abs(diffCalendarDays(latest, todayKey)) > 14) {
      anchorDate = latest;
    }
  }

  const start7d = shiftDateKey(anchorDate, -6);
  const start14d = shiftDateKey(anchorDate, -13);

  let aerobicMinutes7d = 0;
  let aerobicSessions7d = 0;
  let elevationGain7dM = 0;
  let distance7dKm = 0;

  for (const act of all) {
    if (act.date < start7d || act.date > anchorDate) continue;
    if (isWinterDownhillType(act.type)) continue;
    if (act.movingTimeMin >= 10 || act.distanceKm >= 1 || act.elevationGainM >= 100) {
      aerobicMinutes7d += act.movingTimeMin;
      aerobicSessions7d += 1;
      elevationGain7dM += act.elevationGainM;
      distance7dKm += act.distanceKm;
    }
  }

  const boxingSessions14d = hevyWorkouts.filter(
    (w) =>
      isValidDateKey(w.date) &&
      w.date >= start14d &&
      w.date <= anchorDate &&
      isBoxingWorkout(w),
  ).length;

  const rhr7dValues = dailyLogs
    .filter(
      (d) =>
        isValidDateKey(d.date) &&
        d.date >= start7d &&
        d.date <= anchorDate &&
        typeof d.restingHr === 'number' &&
        d.restingHr > 0,
    )
    .map((d) => d.restingHr as number);

  const avgRhr7d =
    rhr7dValues.length > 0
      ? Math.round(rhr7dValues.reduce((s, v) => s + v, 0) / rhr7dValues.length)
      : null;

  const targetMinutesWeekly = 120;
  const progressPct = Math.min(
    100,
    Math.round((aerobicMinutes7d / targetMinutesWeekly) * 100),
  );

  let status: AerobicBoxingSynergyReport['status'];
  let statusLabel: string;
  let boxingBenefitNote: string;

  if (aerobicMinutes7d >= 120) {
    status = 'strong';
    statusLabel = 'Силна аеробна база';
    boxingBenefitNote =
      boxingSessions14d > 0
        ? `${aerobicMinutes7d} мин. преходи/бягане тази седмица ускоряват спада на пулса в 60-секундните почивки между боксовите рундове и пазят експлозивността в късните рундове.`
        : `${aerobicMinutes7d} мин. аеробен обем изграждат отлично сърдечно възстановяване — готов си за високотемпов бокс и спаринг без „задушаване“.`;
  } else if (aerobicMinutes7d >= 50) {
    status = 'moderate';
    statusLabel = 'Поддържаща аеробна база';
    boxingBenefitNote = `Имаш ${aerobicMinutes7d} мин. в аеробна зона (цел 120 мин./седм.). Още 1 леко бягане (30–40 мин.) или преход ще ускорят осезаемо възстановяването на пулса между рундовете на бокс.`;
  } else {
    status = 'low';
    statusLabel = 'Ниска аеробна база тази седмица';
    boxingBenefitNote =
      boxingSessions14d > 0
        ? `Само ${aerobicMinutes7d} мин. аеробно кардио за последните 7 дни. Добави 1–2 леки сесии в Зона 2 (преход или спокойно бягане 30–45 мин.), за да сваляш пулса по-бързо между боксовите рундове.`
        : `Само ${aerobicMinutes7d} мин. записано кардио от часовника тази седмица. Синхронизирай часовника или добави лек преход/бягане за по-силен аеробен резерв.`;
  }

  return {
    aerobicMinutes7d: Math.round(aerobicMinutes7d),
    aerobicSessions7d,
    elevationGain7dM: Math.round(elevationGain7dM),
    distance7dKm: round1(distance7dKm),
    boxingSessions14d,
    avgRhr7d,
    targetMinutesWeekly,
    progressPct,
    status,
    statusLabel,
    boxingBenefitNote,
  };
}
