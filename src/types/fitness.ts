export type MuscleId =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'abs'
  | 'legs';

export type ThemeAccent = 'blue' | 'green' | 'purple' | 'orange';

export type BodyView = 'front' | 'back';

export type RecoveryMode = 'auto' | 'manual';

export type MuscleGainMode = 'auto' | 'manual';

export type MuscleAllocationMode = 'default' | 'custom_percent';

export type MuscleAllocationScope = 'trained_only' | 'all_groups';

export interface MuscleAllocationConfig {
  mode?: MuscleAllocationMode;
  scope?: MuscleAllocationScope;
  percents?: Partial<Record<MuscleId, number>>;
}

export interface UserProfile {
  name: string;
  heightCm: number | '';
  weightKg: number | '';
}

export interface BodyMeasurements {
  weightKg?: number;
  muscleMassKg?: number;
  bodyFatPercent?: number;
  bodyFatKg?: number;
}

export interface DayLog extends BodyMeasurements {
  date: string; // YYYY-MM-DD
  sleepHours: number;
  huaweiSleepScore?: number; // 0-100 points from Huawei Watch GT 6
  recoveryMode?: RecoveryMode; // 'auto' (from Huawei GT 6 / sleep) or 'manual'
  manualRecoveryPercent?: number; // 0-100 manual override when recoveryMode === 'manual'
  muscleGainMode?: MuscleGainMode; // 'auto' (scaled by sleep & recovery) or 'manual' (exact grams for the day)
  baseDailyGainGrams?: number; // optional custom daily base grams (before recovery scaling) for this day
  manualGainGrams?: number; // exact grams gained for this day when muscleGainMode === 'manual'
  manualMuscleGrams?: Partial<Record<MuscleId, number>>; // optional exact grams per muscle group for this day
  trained?: boolean; // explicit trained flag (defaults to muscles.length > 0)
  muscles: MuscleId[];
}

export type GoalType = 'target_weight' | 'muscle_mass_gain' | 'weight_loss';

export type GoalTimeMode = 'calendar_duration' | 'until_date' | 'estimate_time';

export type DurationUnit = 'days' | 'weeks' | 'months';

export type MuscleGoalUnit = 'g' | 'kg';

export interface FitnessGoal {
  id: 'goal-1' | 'goal-2' | 'goal-3';
  slotIndex: 1 | 2 | 3;
  enabled: boolean;
  title: string;
  type: GoalType;
  timeMode: GoalTimeMode;
  targetValue: number;
  muscleUnit: MuscleGoalUnit;
  startDate: string; // YYYY-MM-DD
  startWeightKg?: number;
  durationValue: number;
  durationUnit: DurationUnit;
  targetDate: string; // YYYY-MM-DD
}

export interface GoalEvaluation {
  goalId: FitnessGoal['id'];
  displayTitle: string;
  typeLabel: string;
  timeModeLabel: string;
  progressPercent: number;
  isCompleted: boolean;
  hasRequiredData: boolean;
  missingDataMessage?: string;
  currentText: string;
  targetText: string;
  remainingText: string;
  deadlineDate?: string;
  totalDays?: number;
  daysRemaining?: number;
  requiredPaceText?: string;
  actualPaceText?: string;
  estimatedDaysTotal?: number;
  estimatedDaysRemaining?: number;
  estimatedDurationText?: string;
  estimatedCompletionDate?: string;
  estimationNote?: string;
}

export interface HevySet {
  setIndex: number;
  setType?: string;
  weightKg?: number;
  reps?: number;
  distanceKm?: number;
  durationSeconds?: number;
  rpe?: number;
}

export interface HevyExercise {
  title: string;
  notes?: string;
  sets: HevySet[];
  totalVolumeKg: number;
  maxWeightKg: number;
}

export type TrainingGoalPhase = 'hypertrophy' | 'maintenance' | 'fat_loss';

export type CoachSubPriority =
  | 'boxing_explosiveness'
  | 'calisthenics_relative'
  | 'max_strength_1rm'
  | 'recovery_joints';

export type TodayScenarioId =
  | 'standard'
  | 'express_35'
  | 'evening_boxing'
  | 'pr_attack'
  | 'light_fatigue';

export interface UserSettings {
  goal: TrainingGoalPhase;
  intervalsApiKey?: string;
  targetWeight?: number;
  subPriorities?: CoachSubPriority[];
}

export type WorkoutEnvironment = 'gym' | 'street' | 'home';

export interface HevyWorkout {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  date: string; // YYYY-MM-DD
  description?: string;
  environment?: WorkoutEnvironment;
  exercises: HevyExercise[];
  totalVolumeKg: number;
  maxWeightKg: number;
  totalSets: number;
  importedAt: string;
}

export interface WatchActivityRecord {
  id?: string;
  type: string; // Run, TrailRun, Hike, Walk, Ride, AlpineSki, BackcountrySki, Snowboard
  name: string;
  distance?: number; // meters
  moving_time?: number; // seconds
  total_elevation_gain?: number; // meters
  average_heartrate?: number; // bpm
  max_heartrate?: number; // bpm
  max_speed?: number; // m/s
  calories?: number; // kcal
  start_date_local?: string;
}

export interface DailyBiometricLog {
  date: string; // YYYY-MM-DD (1 entry per date)
  weightKg?: number;
  sleepHours?: number;
  sleepStartTime?: string; // HH:MM local bedtime (optional, synced from Intervals.icu when available)
  sleepEndTime?: string; // HH:MM local wake time (optional, synced from Intervals.icu when available)
  deepSleepSecs?: number; // deep sleep duration in seconds (from Intervals.icu / watch)
  remSleepSecs?: number; // REM sleep duration in seconds (from Intervals.icu / watch)
  sleepQuality?: number; // 1-5 subjective freshness
  restingHr?: number; // bpm
  hrv?: number; // Heart Rate Variability (ms, e.g. rMSSD/SDNN from smartwatch)
  caloriesKcal?: number; // food intake (kcal)
  proteinGrams?: number;
  cardioDistanceKm?: number;
  cardioDurationMinutes?: number;
  cardioElevationGainM?: number; // elevation gain (m) from watch Run/TrailRun/Hike/Walk
  watchActivities?: WatchActivityRecord[]; // Detailed cardio & mountain activities from Intervals.icu
  steps?: number; // daily steps from smartwatch
  activeCalories?: number; // active burned calories (kcal) from smartwatch
  restingCalories?: number; // optional resting/BMR calories (kcal)
  completedHabits: string[];
  notes?: string; // optional short note for the day / workout
  watchSyncedAt?: string; // ISO timestamp when synced from Huawei Watch / Intervals.icu
  updatedAt?: string;
}

export type CoachAdviceTier = 'critical' | 'optimization' | 'achievement';

export interface CoachAdviceCard {
  id: string;
  tier: CoachAdviceTier;
  tierLabel: string;
  category: string;
  title: string;
  message: string;
  evidence: string;
}

export interface RelativeStrengthEntry {
  exerciseTitle: string;
  date: string;
  bodyWeightKg: number;
  addedWeightKg: number;
  totalLoadKg: number;
  reps: number;
  realTotal1RM: number;
  strengthToWeightRatio: number;
}

export interface WeeklyMuscleVolumeItem {
  groupId: string;
  label: string;
  pattern: 'push' | 'pull' | 'legs' | 'core';
  /** Effective working sets (1.0 per primary + 0.5 per secondary) */
  sets: number;
  primarySets: number;
  secondarySets: number;
  effectiveSets: number;
  status: 'low' | 'optimal' | 'high';
}

export interface CoachAnalysisReport {
  cards: CoachAdviceCard[];
  relativeStrength: RelativeStrengthEntry[];
  weeklyVolume: WeeklyMuscleVolumeItem[];
  pushSets7d: number;
  pullSets7d: number;
  pushPullDiffPercent: number | null;
  latestBodyWeightKg: number | null;
  avgWeightRecent7d: number | null;
  avgWeightPrev7d: number | null;
  weightWeeklyChangePct: number | null;
  avgProteinLast5d: number | null;
  avgProteinPerKgLast5d: number | null;
  avgRestingHr7d: number | null;
  latestRestingHr: number | null;
  avgSleepLast2d: number | null;
  avgSteps4d: number | null;
  avgSteps7d: number | null;
  avgActiveCalories7d: number | null;
  avgTdee7d: number | null;
  avgCaloricBalance7d: number | null;
  latestSteps24h: number | null;
  trainingGoal?: TrainingGoalPhase;
  recentHiddenPrCount?: number;
}

export type SupplementCycleMode = 'continuous' | 'cyclic';

export interface SupplementCycleConfig {
  name: string;
  mode: SupplementCycleMode;
  onWeeks: number;
  offWeeks: number;
  startDate: string; // YYYY-MM-DD
}

export type DetailedMuscleId =
  | 'chest'
  | 'front_delts'
  | 'side_delts'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'traps_upper_back'
  | 'lats'
  | 'lower_back'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves';

export type MuscleRecoveryZoneStatus = 'fatigued' | 'recovering' | 'recovered';

export interface MuscleRecoveryExerciseHit {
  exerciseTitle: string;
  workoutTitle: string;
  date: string;
  hoursAgo: number;
  role: 'primary' | 'secondary';
  workingSets: number;
}

export interface DetailedMuscleRecoveryItem {
  id: DetailedMuscleId;
  label: string;
  view: 'front' | 'back' | 'both';
  status: MuscleRecoveryZoneStatus;
  statusLabel: string;
  hoursSinceLast: number | null;
  lastTrainedDate: string | null;
  recentEffectiveSets48h: number;
  lastSessionSets: number;
  recoveryTargetHours: number;
  dominantLoadRole: 'primary' | 'secondary' | 'none';
  recentExercises: MuscleRecoveryExerciseHit[];
  primaryExercises: MuscleRecoveryExerciseHit[];
  secondaryExercises: MuscleRecoveryExerciseHit[];
  recommendation: string;
}

export type AcwrZone = 'undertraining' | 'sweet_spot' | 'elevated' | 'high_risk';

export interface AcwrDailyPoint {
  date: string;
  shortLabel: string;
  strengthLoad: number;
  cardioLoad: number;
  totalLoad: number;
  acute7d: number;
  chronicWeeklyAvg28d: number;
  acwr: number | null;
}

export interface AcwrReport {
  anchorDate: string;
  acuteLoad7d: number;
  chronicWeeklyAvg28d: number;
  acwr: number | null;
  zone: AcwrZone | null;
  zoneLabel: string;
  zoneAdvice: string;
  strengthSharePct: number;
  cardioSharePct: number;
  dailySeries28d: AcwrDailyPoint[];
}

export interface BeatLogSetSummary {
  workingSetsCount: number;
  lastWeightKg: number;
  minReps: number;
  maxReps: number;
  repsLabel: string;
  avgRpe: number | null;
  maxRpe: number | null;
  bestEstimated1RM: number;
  isBodyweightOnly: boolean;
}

export interface BeatLogExerciseTarget {
  exerciseTitle: string;
  lastDate: string;
  lastWorkoutTitle: string;
  strategy: 'increase_weight' | 'increase_reps';
  lastSummary: BeatLogSetSummary;
  lastLine: string;
  targetLine: string;
  targetWeightKg: number;
  targetRepsText: string;
  targetEstimated1RM: number;
  rpeNote: string;
}

export type StandardTier = 'beginner' | 'intermediate' | 'advanced' | 'elite';

export interface StrengthStandardEntry {
  id: string;
  label: string;
  matchedExerciseTitle: string;
  isBodyweightLift: boolean;
  date: string;
  bestWeightKg: number;
  bestAddedWeightKg: number;
  bestReps: number;
  bodyWeightKg: number;
  estimated1RM: number;
  ratioToBodyWeight: number;
  tier: StandardTier;
  tierLabel: string;
  nextTierLabel: string | null;
  nextTierTargetKg: number | null;
  kgRemainingToNext: number | null;
  progressPercent: number;
  thresholds: {
    intermediate: number;
    advanced: number;
    elite: number;
  };
}

export interface RunningHybridStandardEntry {
  distanceTargetKm: 5 | 10;
  label: string;
  bestDistanceKm: number;
  bestDurationMin: number;
  date: string;
  isProjected: boolean;
  paceMinPerKm: number;
  paceText: string;
  estimatedTimeSeconds: number;
  estimatedTimeText: string;
  tier: StandardTier;
  tierLabel: string;
  nextTierLabel: string | null;
  nextTierTargetSeconds: number | null;
  secondsRemainingToNext: number | null;
  progressPercent: number;
}

export interface SupplementCycleStatus {
  phase: 'continuous' | 'on' | 'off' | 'upcoming';
  badgeText: string;
  dayInPhase: number | null;
  phaseTotalDays: number | null;
}

export interface SupplementMetricComparison {
  onAvg: number | null;
  offAvg: number | null;
  onCount: number;
  offCount: number;
  diffPercent: number | null;
}

export interface SupplementImpactAnalysis {
  name: string;
  config: SupplementCycleConfig;
  cycleStatus: SupplementCycleStatus;
  daysOnCount: number;
  daysOffCount: number;
  sleepQuality: SupplementMetricComparison;
  restingHr: SupplementMetricComparison;
  workoutVolume: SupplementMetricComparison;
  peak1RM: SupplementMetricComparison;
}

export interface CustomExerciseMapping {
  primary: DetailedMuscleId[];
  secondary: DetailedMuscleId[];
}

export type CustomExerciseMappings = Record<string, CustomExerciseMapping>;

export interface DiaryState {
  profile: UserProfile;
  themeAccent: ThemeAccent;
  dailyMuscleGainGrams?: number; // user-configured daily base muscle gain (g/day at 100% recovery)
  autoAccrueDaily?: boolean; // auto-create/fill missed days up to today
  accrueOnRestDays?: boolean; // accrue daily base muscle mass even on rest days
  muscleAllocationMode?: MuscleAllocationMode; // 'default' (anatomical) or 'custom_percent'
  muscleAllocationScope?: MuscleAllocationScope; // 'trained_only' or 'all_groups'
  muscleAllocations?: Partial<Record<MuscleId, number>>; // custom % per muscle group (0-100)
  logs: Record<string, DayLog>;
  goals: FitnessGoal[];
  hevyWorkouts?: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  habitItems?: string[];
  dailyStepsGoal?: number;
  supplementCycles?: Record<string, SupplementCycleConfig>;
  analysisManualWeightKg?: number;
  customExerciseMappings?: CustomExerciseMappings;
  userSettings?: UserSettings;
}

export interface MuscleDefinition {
  id: MuscleId;
  label: string;
  anatomicalLabel: string;
  primaryView: BodyView;
  availableViews: BodyView[];
  baseGainGrams: number;
  description: string;
}

export type RecoveryStatus =
  | 'optimal'
  | 'good'
  | 'moderate'
  | 'fatigued'
  | 'exhausted';

export interface RecoveryOptions {
  huaweiSleepScore?: number;
  recoveryMode?: RecoveryMode;
  manualRecoveryPercent?: number;
}

export interface RecoveryInfo {
  sleepHours: number;
  huaweiSleepScore?: number;
  mode: RecoveryMode;
  source: 'manual' | 'huawei_gt6' | 'sleep_hours';
  multiplier: number;
  percentage: number;
  status: RecoveryStatus;
  label: string;
  isFatigued: boolean;
}

export interface MuscleCumulativeStats {
  muscleId: MuscleId;
  totalGrams: number;
  workoutCount: number;
  trainedOnDate: boolean;
  gainedOnDate: number;
}

export interface DateSnapshotStats {
  date: string;
  sleepHours: number;
  huaweiSleepScore?: number;
  recovery: RecoveryInfo;
  gainMode: MuscleGainMode;
  effectiveBaseDailyGrams?: number;
  trainedMuscles: MuscleId[];
  gainedOnDateTotal: number;
  totalCumulativeGrams: number;
  totalWorkouts: number;
  byMuscle: Record<MuscleId, MuscleCumulativeStats>;
}

export type SleepAdvicePriority = 'critical' | 'caution' | 'positive' | 'info';

export interface SleepAdviceItem {
  id: string;
  priority: SleepAdvicePriority;
  priorityLabel: string;
  category: string;
  title: string;
  body: string;
  action: string;
}

export interface SleepRecoveryInsights {
  hasLoggedData: boolean;
  headline: string;
  todaySleepHours: number;
  todayHuaweiScore?: number;
  todayRecovery: RecoveryInfo;
  loggedDays7d: number;
  avgSleepHours7d: number | null;
  avgHuaweiScore7d: number | null;
  fatiguedDays7d: number;
  hoursSpread7d: number | null;
  tips: SleepAdviceItem[];
}

export interface SevenDayDaySummary {
  date: string;
  trained: boolean;
  muscles: string[];
  gainedGrams: number;
  sleepHours: number;
  huaweiSleepScore?: number;
  recoveryPercentage: number;
  isFatigued: boolean;
  weightKg?: number;
}

export interface SevenDayTrainingSummary {
  startDate: string;
  endDate: string;
  workoutDays7d: number;
  restDays7d: number;
  totalGained7dGrams: number;
  avgSleepHours7d: number | null;
  avgHuaweiScore7d: number | null;
  fatiguedDays7d: number;
  muscleFrequency: Record<string, number>;
  days: SevenDayDaySummary[];
}

export type AiReadinessTier = 'peak' | 'good' | 'moderate' | 'fatigued';

export interface AiReadinessResult {
  score: number; // 0-100
  tier: AiReadinessTier;
  diagnosisHeadline: string;
  diagnosisDetail: string;
  adaptationSummary: string;
  factors: {
    sleepScore: number | null;
    avgSleepHours48h: number | null;
    avgFreshness48h: number | null;
    rhrScore: number | null;
    latestRestingHr: number | null;
    avgRestingHr14d: number | null;
    rhrDeltaBpm: number | null;
    acwrScore: number | null;
    acwr: number | null;
    streakScore: number;
    consecutiveTrainingDays: number;
    highStepsLegFatigue: boolean;
    recentSteps24h: number | null;
  };
}

export interface AdaptedExerciseItem {
  exerciseTitle: string;
  originalSets: number;
  originalWeightKg: number;
  originalRepsLabel: string;
  adaptedSets: number;
  adaptedWeightKg: number;
  adaptedRepsText: string;
  targetRpeText: string;
  adjustmentNote: string;
}

export interface AdaptedWorkoutPlan {
  routineTitle: string;
  readinessScore: number;
  modeLabel: string;
  exercises: AdaptedExerciseItem[];
}

export interface DiscoveredPattern {
  id: string;
  title: string;
  category: string;
  hasEnoughData: boolean;
  collectedSamples: number;
  requiredSamples: number;
  progressLabel: string;
  insightText: string;
  evidenceText: string;
  impactDirection: 'positive' | 'caution' | 'neutral';
}

export type WorkoutGeneratorGoal =
  | 'strength'
  | 'hypertrophy'
  | 'quick_40'
  | 'recovery_deload';

export interface GeneratedWorkoutExercise {
  exerciseTitle: string;
  targetMuscleLabel: string;
  sets: number;
  repsText: string;
  recommendedWeightKg: number | null;
  restSeconds: number;
  reason: string;
  isFromUserHistory: boolean;
}

export interface GeneratedWorkoutPlan {
  goal: WorkoutGeneratorGoal;
  goalLabel: string;
  estimatedMinutes: number;
  focusSummary: string;
  exercises: GeneratedWorkoutExercise[];
}

export type CoachChatIntent =
  | 'goal_environment_progress'
  | 'train_heavy_today'
  | 'stagnation_plateau'
  | 'exercise_add_swap'
  | 'deload_check'
  | 'strength_weight_cardio_balance'
  | 'lagging_muscle'
  | 'caloric_balance'
  | 'neat_steps'
  | 'general_status';

export interface CoachChatResponse {
  id: string;
  question: string;
  intent: CoachChatIntent;
  headline: string;
  analysis: string;
  metrics: string[];
  actionSteps: string[];
}
