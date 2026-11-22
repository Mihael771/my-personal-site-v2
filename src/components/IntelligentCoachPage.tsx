import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Brain,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type {
  CoachAdviceTier,
  CoachSubPriority,
  CustomExerciseMappings,
  DailyBiometricLog,
  DayLog,
  HevyWorkout,
  TrainingGoalPhase,
  UserProfile,
} from '../types/fitness';
import { computeAcwrReport } from '../utils/analysisPrep';
import {
  computeAiReadinessScore,
  discoverPersonalPatterns,
} from '../utils/coachMiniAi';
import {
  formatBgNumericDate,
  formatNumberBg,
  getLocalDateKey,
  shiftDateKey,
} from '../utils/fitnessMath';
import { generateIntelligentCoachReport } from '../utils/intelligentCoach';
import {
  COACH_SUB_TABS,
  type AppPage,
  type CoachSubTab,
  type NavLocation,
} from '../utils/navigation';
import {
  analyzeHypertrophyVolumeZones,
  analyzeProteinAndLeanMassGuard,
} from '../utils/maleHealthAnalyticsEngine';
import { analyzeBoxingStrengthBalance } from '../utils/smartCoachEngine';
import { ExerciseTechniqueModal } from './ExerciseTechniqueModal';
import { MuscleRecoveryTab } from './analysis/MuscleRecoveryTab';
import { AerobicBoxingSynergyCard } from './coach/AerobicBoxingSynergyCard';
import { AnabolicEnvironmentPanel } from './coach/AnabolicEnvironmentPanel';
import { AppleVitalsCard } from './coach/AppleVitalsCard';
import { AutoDeloadPlannerCard } from './coach/AutoDeloadPlannerCard';
import { BiometricRadarCard } from './coach/BiometricRadarCard';
import { BodyBatteryCard } from './coach/BodyBatteryCard';
import { CoachChatPanel } from './coach/CoachChatPanel';
import { CoachPatternsPanel } from './coach/CoachPatternsPanel';
import { CoachRelativeStrengthAndTimingSummary } from './coach/CoachRelativeStrengthAndTimingSummary';
import { CoachWorkoutGenerator } from './coach/CoachWorkoutGenerator';
import { ExerciseRecommenderPanel } from './coach/ExerciseRecommenderPanel';
import { HabitBodyImpactChart } from './coach/HabitBodyImpactChart';
import { HabitDetectivePanel } from './coach/HabitDetectivePanel';
import { OutdoorWeatherCard } from './coach/OutdoorWeatherCard';
import { SmartCoachReadinessHub } from './coach/SmartCoachReadinessHub';
import { TestosteroneAndHabitsPanel } from './coach/TestosteroneAndHabitsPanel';

interface IntelligentCoachPageProps {
  activeSubTab: CoachSubTab;
  onSelectSubTab: (subTab: CoachSubTab) => void;
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  habitItems: string[];
  legacyLogs: Record<string, DayLog>;
  profile: UserProfile;
  dailyStepsGoal?: number;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal: TrainingGoalPhase;
  subPriorities: CoachSubPriority[];
  targetWeight?: number;
  onChangeTrainingGoal: (nextGoal: TrainingGoalPhase) => Promise<void>;
  onChangeSubPriorities: (nextSubPriorities: CoachSubPriority[]) => Promise<void>;
  onNavigateLocation: (location: NavLocation) => void;
  onNavigate?: (page: AppPage) => void;
}

type TierFilter = 'all' | CoachAdviceTier;

const TIER_STYLES: Record<
  CoachAdviceTier,
  {
    borderClass: string;
    bgClass: string;
    labelClass: string;
    Icon: typeof AlertTriangle;
  }
> = {
  critical: {
    borderClass: 'border-rose-500/35',
    bgClass: 'bg-rose-950/15',
    labelClass: 'text-rose-400',
    Icon: AlertTriangle,
  },
  optimization: {
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-[#121722]',
    labelClass: 'text-amber-300',
    Icon: SlidersHorizontal,
  },
  achievement: {
    borderClass: 'border-emerald-500/30',
    bgClass: 'bg-[#0F141F]',
    labelClass: 'text-emerald-400',
    Icon: Award,
  },
};

export function IntelligentCoachPage({
  activeSubTab,
  onSelectSubTab,
  hevyWorkouts,
  dailyLogs,
  habitItems,
  legacyLogs,
  profile,
  dailyStepsGoal = 10000,
  customExerciseMappings,
  trainingGoal,
  subPriorities,
  targetWeight,
  onChangeTrainingGoal,
  onChangeSubPriorities,
  onNavigateLocation,
}: IntelligentCoachPageProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const yesterdayKey = useMemo(() => shiftDateKey(todayKey, -1), [todayKey]);
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [techniqueQuery, setTechniqueQuery] = useState<string | null>(null);

  const report = useMemo(
    () =>
      generateIntelligentCoachReport({
        hevyWorkouts,
        dailyLogs,
        habitItems,
        legacyLogs,
        profile,
        todayKey,
        customExerciseMappings,
        trainingGoal,
      }),
    [
      hevyWorkouts,
      dailyLogs,
      habitItems,
      legacyLogs,
      profile,
      todayKey,
      customExerciseMappings,
      trainingGoal,
    ],
  );

  const legacyReadiness = useMemo(
    () =>
      computeAiReadinessScore({
        hevyWorkouts,
        dailyLogs,
        todayKey,
        customExerciseMappings,
      }),
    [hevyWorkouts, dailyLogs, todayKey, customExerciseMappings],
  );

  const discoveredPatterns = useMemo(
    () =>
      activeSubTab === 'habit-detective'
        ? discoverPersonalPatterns({
            hevyWorkouts,
            dailyLogs,
            habitItems,
            todayKey,
          })
        : [],
    [activeSubTab, hevyWorkouts, dailyLogs, habitItems, todayKey],
  );

  const acwrReport = useMemo(
    () =>
      activeSubTab === 'weekly-plan'
        ? computeAcwrReport(hevyWorkouts, dailyLogs, todayKey)
        : null,
    [activeSubTab, hevyWorkouts, dailyLogs, todayKey],
  );

  const boxingBalance = useMemo(
    () =>
      activeSubTab === 'weekly-plan'
        ? analyzeBoxingStrengthBalance({
            hevyWorkouts,
            dailyLogs,
            todayKey,
            customExerciseMappings,
          })
        : null,
    [activeSubTab, hevyWorkouts, dailyLogs, todayKey, customExerciseMappings],
  );

  const hypertrophyVolumeReport = useMemo(
    () =>
      activeSubTab === 'readiness'
        ? analyzeHypertrophyVolumeZones({
            hevyWorkouts,
            todayKey,
            customExerciseMappings,
          })
        : null,
    [activeSubTab, hevyWorkouts, todayKey, customExerciseMappings],
  );

  const proteinGuardReport = useMemo(
    () =>
      activeSubTab === 'readiness'
        ? analyzeProteinAndLeanMassGuard({
            dailyLogs,
            hevyWorkouts,
            profile,
            todayKey,
          })
        : null,
    [activeSubTab, dailyLogs, hevyWorkouts, profile, todayKey],
  );

  const showHypertrophyReadinessSignal =
    hypertrophyVolumeReport !== null &&
    hypertrophyVolumeReport.strengthWorkoutsCount > 0 &&
    (hypertrophyVolumeReport.belowMevGroups.length > 0 ||
      hypertrophyVolumeReport.aboveMrvGroups.length > 0);

  const showProteinReadinessSignal =
    proteinGuardReport !== null &&
    (proteinGuardReport.status === 'fat_gain_risk' ||
      proteinGuardReport.status === 'optimal_lean_progression');

  const counts = useMemo(() => {
    let critical = 0;
    let optimization = 0;
    let achievement = 0;
    for (const c of report.cards) {
      if (c.tier === 'critical') critical += 1;
      else if (c.tier === 'optimization') optimization += 1;
      else achievement += 1;
    }
    return { critical, optimization, achievement };
  }, [report.cards]);

  const visibleCards = useMemo(() => {
    if (tierFilter === 'all') return report.cards;
    return report.cards.filter((c) => c.tier === tierFilter);
  }, [report.cards, tierFilter]);

  const hasAnyData = hevyWorkouts.length > 0 || dailyLogs.length > 0;

  return (
    <section
      id="coach"
      data-testid="intelligent-coach-page"
      aria-label="Интелигентен треньор"
      className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8"
    >
      {/* Заглавие + 3 чисти подменюта */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Brain
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>Многофакторен локален алгоритъм · Гъвкави цели и Бокс + Сила</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
            🧠 Интелигентен треньор
          </h1>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-400">
            Днешна готовност, гъвкави приоритети, 7-дневен план (Зала / Навън / Бокс), 60-дневен детектив на навиците и анаболна среда.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              onNavigateLocation({
                page: 'analysis',
                analysisSubTab: 'weekly-review',
              })
            }
            className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
          >
            🏆 Неделен обзор
          </button>
          <button
            type="button"
            onClick={() => onNavigateLocation({ page: 'hevy' })}
            className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
          >
            Тренировки (Hevy)
          </button>
        </div>
      </div>

      {/* Подменюта (рендира се САМО активният под-таб) */}
      <div
        role="tablist"
        aria-label="Подраздели на Интелигентен треньор"
        data-testid="coach-subtabs-bar"
        className="mt-5 flex flex-nowrap items-center gap-1.5 overflow-x-auto rounded-xl border border-white/10 bg-[#0F141F] p-1.5 md:flex-wrap md:overflow-visible"
      >
        {COACH_SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`coach-subtab-${tab.id}`}
              onClick={() => onSelectSubTab(tab.id)}
              className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9 ${
                isActive
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <span aria-hidden="true">{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* ПОДМЕНЮ 2.1: ⚡ Днешна готовност и Бокс                               */}
      {/* ===================================================================== */}
      {activeSubTab === 'readiness' && (
        <div data-testid="coach-panel-readiness" className="mt-6 space-y-6">
          {/* Ясна граница между отчет до ВЧЕРА и план за ДНЕС */}
          <div
            data-testid="coach-date-boundary-banner"
            className="rounded-xl border border-white/10 bg-[#0F141F] px-4 py-3.5 sm:px-5"
          >
            <div className="font-display text-xs font-bold text-white sm:text-sm">
              📊 Анализ на база записите до ВЧЕРА ({formatBgNumericDate(yesterdayKey)}) → 🎯 План и готовност за ДНЕС ({formatBgNumericDate(todayKey)})
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Всички препоръки за тренировка, целево RPE, сценарии, хранене и възстановяване се отнасят за <strong className="font-semibold text-slate-200">ДНЕС</strong>, изчислени на база завършения вчерашен ден и последната нощ сън.
            </p>
          </div>

          {/* ⚡ Body Battery (Жива батерия на енергията 0–100% + 7-дневна крива) */}
          <BodyBatteryCard
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            todayKey={todayKey}
          />

          {/* 🩺 Apple Vitals (Нощен здравен радар — 30-дневен IQR диапазон) */}
          <AppleVitalsCard dailyLogs={dailyLogs} todayKey={todayKey} />

          {/* Биометричен радар (24–48 ч. превенция при настинка / претрениране) */}
          <BiometricRadarCard dailyLogs={dailyLogs} todayKey={todayKey} />

          {/* Автоматични сигнали за MEV/MRV хипертрофиен обем и Анаболен протеинов праг / защита от омазняване */}
          {(showHypertrophyReadinessSignal || showProteinReadinessSignal) && (
            <div
              data-testid="coach-readiness-male-health-signals"
              className={`grid grid-cols-1 gap-4 ${
                showHypertrophyReadinessSignal && showProteinReadinessSignal
                  ? 'lg:grid-cols-2'
                  : ''
              }`}
            >
              {showHypertrophyReadinessSignal && hypertrophyVolumeReport && (
                <section
                  data-testid="coach-readiness-mev-mrv-signal"
                  className={`flex flex-col justify-between rounded-2xl border p-5 ${
                    hypertrophyVolumeReport.aboveMrvGroups.length > 0
                      ? 'border-rose-500/35 bg-rose-950/15'
                      : 'border-amber-500/30 bg-[#0F141F]'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          hypertrophyVolumeReport.aboveMrvGroups.length > 0
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        📈 Хипертрофиен обем (7 завършени дни до{' '}
                        {formatBgNumericDate(hypertrophyVolumeReport.windowEndDate)})
                      </span>
                      <span className="font-mono tabular-nums text-slate-400">
                        {hypertrophyVolumeReport.aboveMrvGroups.length > 0
                          ? `Над MRV: ${hypertrophyVolumeReport.aboveMrvGroups.length}`
                          : ''}
                        {hypertrophyVolumeReport.aboveMrvGroups.length > 0 &&
                        hypertrophyVolumeReport.belowMevGroups.length > 0
                          ? ' · '
                          : ''}
                        {hypertrophyVolumeReport.belowMevGroups.length > 0
                          ? `Под MEV: ${hypertrophyVolumeReport.belowMevGroups.length}`
                          : ''}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-sm font-bold text-white sm:text-base">
                      {hypertrophyVolumeReport.coachSignal.headline}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-300 sm:text-sm">
                      {hypertrophyVolumeReport.coachSignal.detail}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <span className="font-mono text-xs tabular-nums text-slate-400">
                      Ефективни серии (без бокс):{' '}
                      <strong className="text-slate-200">
                        {formatNumberBg(hypertrophyVolumeReport.totalEffectiveSets)}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onNavigateLocation({
                          page: 'analysis',
                          analysisSubTab: 'weekly-review',
                        })
                      }
                      className="inline-flex items-center text-xs font-medium text-[var(--accent-text)] transition-opacity hover:opacity-85 whitespace-nowrap"
                    >
                      Отвори MEV/MRV тракера в Неделен обзор →
                    </button>
                  </div>
                </section>
              )}

              {showProteinReadinessSignal && proteinGuardReport && (
                <section
                  data-testid="coach-readiness-protein-guard-signal"
                  className={`flex flex-col justify-between rounded-2xl border p-5 ${
                    proteinGuardReport.status === 'fat_gain_risk'
                      ? 'border-rose-500/35 bg-rose-950/15'
                      : 'border-emerald-500/35 bg-emerald-950/15'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-semibold ${
                          proteinGuardReport.status === 'fat_gain_risk'
                            ? 'text-rose-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        🥩 Протеинов праг и защита от омазняване
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {proteinGuardReport.daysMeetingThreshold}/7 дни ≥ 1.8 g/kg
                        {proteinGuardReport.weightGainKgPerWeek !== null
                          ? ` · ${proteinGuardReport.weightGainKgPerWeek >= 0 ? '+' : ''}${proteinGuardReport.weightGainKgPerWeek.toFixed(2)} kg/седм.`
                          : ''}
                      </span>
                    </div>

                    <h3 className="mt-2 font-display text-sm font-bold text-white sm:text-base">
                      {proteinGuardReport.statusHeadline}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-200 sm:text-sm">
                      {proteinGuardReport.statusMessage}
                    </p>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
                    <span className="font-mono text-xs tabular-nums text-slate-400">
                      Среден протеин:{' '}
                      <strong className="text-slate-200">
                        {proteinGuardReport.avgProteinPerKg7d !== null
                          ? `${proteinGuardReport.avgProteinPerKg7d.toFixed(2)} g/kg`
                          : '—'}
                      </strong>
                      {proteinGuardReport.strengthTrendPct !== null
                        ? ` · Сила: ${proteinGuardReport.strengthTrendPct >= 0 ? '+' : ''}${proteinGuardReport.strengthTrendPct.toFixed(1)}% e1RM`
                        : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectSubTab('testosterone-anabolic')}
                      className="inline-flex items-center text-xs font-medium text-[var(--accent-text)] transition-opacity hover:opacity-85 whitespace-nowrap"
                    >
                      Пълен анаболен анализ →
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Многофакторен център: Гъвкава цел + Под-приоритети + Сценарии + Готовност 0–100% + Плато + Бокс/Сила */}
          <SmartCoachReadinessHub
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            profile={profile}
            customExerciseMappings={customExerciseMappings}
            trainingGoal={trainingGoal}
            subPriorities={subPriorities}
            todayKey={todayKey}
            onChangeTrainingGoal={onChangeTrainingGoal}
            onChangeSubPriorities={onChangeSubPriorities}
          />

          {/* Синергия „Аеробна база ↔ Бокс“ (седмични минути преходи/бягане) */}
          <AerobicBoxingSynergyCard
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            todayKey={todayKey}
            onOpenMountainCardio={() =>
              onNavigateLocation({
                page: 'analysis',
                analysisSubTab: 'mountain-cardio',
              })
            }
          />

          {/* SVG карта на мускулното възстановяване (72 часа) */}
          <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
            <div className="mb-4 border-b border-white/10 pb-3">
              <h2 className="font-display text-base font-bold text-white">
                🦴 Карта на мускулното възстановяване за ДНЕС ({formatBgNumericDate(todayKey)})
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                Изчислена по натоварванията до вчера ({formatBgNumericDate(yesterdayKey)}): кои мускули са свежи за тренировка ДНЕС и кои се възстановяват.
              </p>
            </div>
            <MuscleRecoveryTab
              hevyWorkouts={hevyWorkouts}
              dailyLogs={dailyLogs}
              customExerciseMappings={customExerciseMappings}
              onNavigateToHevy={() => onNavigateLocation({ page: 'hevy' })}
            />
          </div>

          {/* Кратко обобщение: Относителна сила, боксова категория и оптимален час */}
          <CoachRelativeStrengthAndTimingSummary
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            profile={profile}
            targetWeight={targetWeight}
            todayKey={todayKey}
            onOpenAnalysisSubTab={(subTab) =>
              onNavigateLocation({
                page: 'analysis',
                analysisSubTab:
                  subTab === 'biorhythm' ? 'biorhythm-body' : 'strength-boxing',
              })
            }
          />

          {/* Препоръчител на конкретни упражнения + Смяна при застой */}
          <ExerciseRecommenderPanel
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            profileWeightKg={profile.weightKg}
            todayKey={todayKey}
            customExerciseMappings={customExerciseMappings}
            trainingGoal={trainingGoal}
            onOpenTechnique={setTechniqueQuery}
          />

          {/* Умен генератор на тренировка за днес */}
          <CoachWorkoutGenerator
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            coachReport={report}
            todayKey={todayKey}
            customExerciseMappings={customExerciseMappings}
            onOpenTechnique={setTechniqueQuery}
          />

          {/* Офлайн „Попитай треньора“ */}
          <CoachChatPanel
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            profile={profile}
            coachReport={report}
            readiness={legacyReadiness}
            todayKey={todayKey}
            dailyStepsGoal={dailyStepsGoal}
            customExerciseMappings={customExerciseMappings}
            trainingGoal={trainingGoal}
          />

          {/* Приоритизирани съвети */}
          {!hasAnyData ? (
            <div
              data-testid="coach-empty-state"
              className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 sm:p-10"
            >
              <Sparkles
                className="h-6 w-6 text-[var(--accent-text)]"
                aria-hidden="true"
              />
              <h2 className="mt-4 font-display text-xl font-bold text-white">
                Все още няма достатъчно данни за анализ
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Импортирай тренировки от Hevy или попълни първия си „Дневен запис“, за да активираш пълната многофакторна оценка.
              </p>
            </div>
          ) : (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Приоритизирани съвети за ДНЕС ({formatBgNumericDate(todayKey)}) · ({visibleCards.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Изчислени на база записите до ВЧЕРА ({formatBgNumericDate(yesterdayKey)}) и последната нощ сън.
                  </p>
                </div>

                <div
                  role="group"
                  aria-label="Филтър по приоритет на съветите"
                  className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
                >
                  <button
                    type="button"
                    data-testid="coach-filter-all"
                    onClick={() => setTierFilter('all')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      tierFilter === 'all'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Всички ({report.cards.length})
                  </button>
                  <button
                    type="button"
                    data-testid="coach-filter-critical"
                    onClick={() => setTierFilter('critical')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      tierFilter === 'critical'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Критични ({counts.critical})
                  </button>
                  <button
                    type="button"
                    data-testid="coach-filter-optimization"
                    onClick={() => setTierFilter('optimization')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      tierFilter === 'optimization'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Оптимизация ({counts.optimization})
                  </button>
                  <button
                    type="button"
                    data-testid="coach-filter-achievement"
                    onClick={() => setTierFilter('achievement')}
                    className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      tierFilter === 'achievement'
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Постижения ({counts.achievement})
                  </button>
                </div>
              </div>

              {visibleCards.length === 0 ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-[#0F141F] p-6 text-center text-sm text-slate-400">
                  Няма активни сигнали в избраната категория.
                </div>
              ) : (
                <div
                  data-testid="coach-advice-cards-list"
                  className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2"
                >
                  {visibleCards.map((card) => {
                    const style = TIER_STYLES[card.tier];
                    const Icon = style.Icon;
                    return (
                      <article
                        key={card.id}
                        data-testid={`coach-card-${card.id}`}
                        className={`flex flex-col justify-between rounded-2xl border p-5 ${style.borderClass} ${style.bgClass}`}
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                            <span
                              className={`inline-flex items-center gap-1.5 ${style.labelClass}`}
                            >
                              <Icon
                                className="h-3.5 w-3.5 shrink-0"
                                aria-hidden="true"
                              />
                              <span>{card.tierLabel}</span>
                            </span>
                            <span className="text-slate-500" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-slate-400">{card.category}</span>
                          </div>

                          <h3 className="mt-2 font-display text-base font-bold text-white">
                            {card.title}
                          </h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                            {card.message}
                          </p>
                        </div>

                        <div
                          data-testid={`coach-evidence-${card.id}`}
                          className="mt-4 border-t border-white/8 pt-3 font-mono text-xs tabular-nums text-slate-300"
                        >
                          <span className="text-slate-500">Данни: </span>
                          {card.evidence}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* ПОДМЕНЮ 2.2: 🌦️ Седмичен план (Зала / Навън)                          */}
      {/* ===================================================================== */}
      {activeSubTab === 'weekly-plan' && (
        <div data-testid="coach-panel-weekly-plan" className="mt-6 space-y-6">
          {/* 7-дневна прогноза за Карлово + Зала / Лостове / Балкан */}
          <OutdoorWeatherCard
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            todayKey={todayKey}
            customExerciseMappings={customExerciseMappings}
          />

          {/* Разпределение на тежките силови дни и бокса спрямо ACWR */}
          <div
            data-testid="weekly-plan-acwr-boxing-card"
            className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
          >
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-display text-base font-bold text-white">
                  ⚖️ Разпределение на тежки силови дни и Бокс спрямо ACWR
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  Комбинира индекса на натоварване (ACWR) и боксовите сесии за оптимална седмична структура без преумора.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onNavigateLocation({
                    page: 'analysis',
                    analysisSubTab: 'acwr',
                  })
                }
                className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
              >
                Пълна ACWR графика →
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-[#141B27] p-4">
                <div className="text-[11px] font-medium text-slate-400">
                  Текущ ACWR (7 д. / 28 д.)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {acwrReport && acwrReport.acwr !== null
                    ? acwrReport.acwr.toFixed(2)
                    : '—'}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {acwrReport?.zoneLabel ?? 'Натрупване на данни'}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#141B27] p-4">
                <div className="text-[11px] font-medium text-slate-400">
                  Бокс и раменен баланс (7 дни)
                </div>
                <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">
                  {boxingBalance
                    ? `${boxingBalance.boxingSessionsCount} сесии`
                    : '0 сесии'}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {boxingBalance
                    ? `Бутащи (+${boxingBalance.boxingPushEquivalentSets} бокс): ${formatNumberBg(boxingBalance.totalPushSets)} / Дърпащи: ${formatNumberBg(boxingBalance.totalPullSets)}`
                    : 'Няма записани сесии'}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#141B27] p-4">
                <div className="text-[11px] font-medium text-slate-400">
                  Препоръчана структура за седмицата
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                  {acwrReport?.acwr !== null && acwrReport && acwrReport.acwr > 1.35
                    ? 'Висок ACWR: разреди тежките силови дни (макс. 2 сесии на RPE 7–7.5) и остави минимум 24 ч. между спаринг/бокс и тежки крака.'
                    : acwrReport?.acwr !== null && acwrReport && acwrReport.acwr < 0.85
                      ? 'Имаш резерв за обем: планирай 3–4 силови дни + 2 боксови сесии, като поставиш тежкия ден за крака поне 48 ч. преди интензивен бокс.'
                      : 'Оптимална зона (0.85–1.30): редувай тежка сила (2–3 дни), бокс/кондиция (2 дни) и 1 активен ден на открито (лостове или разходка).'}
                </p>
              </div>
            </div>
          </div>

          {/* Автоматичен брояч до разтоварваща седмица (Auto-Deload Planner) */}
          <AutoDeloadPlannerCard
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            todayKey={todayKey}
            onOpenTechnique={setTechniqueQuery}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* ПОДМЕНЮ 2.3: 🔍 Детектив на навиците                                  */}
      {/* ===================================================================== */}
      {activeSubTab === 'habit-detective' && (
        <div
          data-testid="coach-panel-habit-detective"
          className="mt-6 space-y-6"
        >
          {/* 60-дневни автоматични корелации */}
          <HabitDetectivePanel
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            todayKey={todayKey}
            bodyWeightKg={report.latestBodyWeightKg}
          />

          {/* Бабини зъби (Tribulus), Тестостерон и навици */}
          <TestosteroneAndHabitsPanel
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            todayKey={todayKey}
            bodyWeightKg={report.latestBodyWeightKg}
            profileHeightCm={profile.heightCm}
            dailyStepsGoal={dailyStepsGoal}
          />

          {/* 30-дневни синхронизирани SVG писти на навиците */}
          <HabitBodyImpactChart
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            habitItems={habitItems}
            todayKey={todayKey}
          />

          {/* Открити лични закономерности */}
          <CoachPatternsPanel patterns={discoveredPatterns} />
        </div>
      )}

      {/* ===================================================================== */}
      {/* ПОДМЕНЮ 2.4: 🧬 Тестостерон и Анаболна среда                          */}
      {/* ===================================================================== */}
      {activeSubTab === 'testosterone-anabolic' && (
        <div data-testid="coach-panel-testosterone-anabolic">
          <AnabolicEnvironmentPanel
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            profile={profile}
            trainingGoal={trainingGoal}
            todayKey={todayKey}
            onChangeTrainingGoal={onChangeTrainingGoal}
            onOpenReadinessGoal={() => onSelectSubTab('readiness')}
          />
        </div>
      )}

      <ExerciseTechniqueModal
        exerciseQuery={techniqueQuery}
        onClose={() => setTechniqueQuery(null)}
      />
    </section>
  );
}
