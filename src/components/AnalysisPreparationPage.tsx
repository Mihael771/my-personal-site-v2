import { useMemo } from 'react';
import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
  SupplementCycleConfig,
  UserProfile,
} from '../types/fitness';
import {
  formatBgNumericDate,
  getLocalDateKey,
  shiftDateKey,
} from '../utils/fitnessMath';
import {
  ANALYSIS_PRIMARY_SUB_TABS,
  type AnalysisHubSubTab,
  type AppPage,
  type NavLocation,
} from '../utils/navigation';
import { AcwrLoadTab } from './analysis/AcwrLoadTab';
import { BeatTheLogTab } from './analysis/BeatTheLogTab';
import { BodyAndBiometricsChartsPanel } from './analysis/BodyAndBiometricsChartsPanel';
import { BoxingSessionsSummaryCard } from './analysis/BoxingSessionsSummaryCard';
import { EffortTrainingLoadCard } from './analysis/EffortTrainingLoadCard';
import { EnduranceHillScoreCard } from './analysis/EnduranceHillScoreCard';
import { HrvStatusCard } from './analysis/HrvStatusCard';
import { HypertrophyVolumeMevMrvPanel } from './analysis/HypertrophyVolumeMevMrvPanel';
import { MountainCardioPanel } from './analysis/MountainCardioPanel';
import { MuscleRecoveryTab } from './analysis/MuscleRecoveryTab';
import { OptimalTrainingTimePanel } from './analysis/OptimalTrainingTimePanel';
import { RelativeStrengthBoxingPanel } from './analysis/RelativeStrengthBoxingPanel';
import { SleepCoachingChronotypeCard } from './analysis/SleepCoachingChronotypeCard';
import { StrengthStandardsTab } from './analysis/StrengthStandardsTab';
import { SupplementCyclingTab } from './analysis/SupplementCyclingTab';
import { TrainingLoadAndDualStressCard } from './analysis/TrainingLoadAndDualStressCard';
import { WeeklySetsAndPrsPanel } from './analysis/WeeklySetsAndPrsPanel';
import { SleepArchitectureCard } from './coach/SleepArchitectureCard';
import { WeeklyScorecardPanel } from './coach/WeeklyScorecardPanel';

interface AnalysisPreparationPageProps {
  activeSubTab: AnalysisHubSubTab;
  onSelectSubTab: (subTab: AnalysisHubSubTab) => void;
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  habitItems: string[];
  supplementCycles: Record<string, SupplementCycleConfig>;
  profile: UserProfile;
  dailyStepsGoal?: number;
  analysisManualWeightKg?: number;
  targetWeight?: number;
  customExerciseMappings?: CustomExerciseMappings;
  onSaveCycleConfig: (config: SupplementCycleConfig) => Promise<void>;
  onUpdateHabitItems: (nextHabits: string[]) => Promise<void>;
  onSaveManualWeight: (weightKg: number | undefined) => Promise<void>;
  onSaveTargetWeight: (weightKg: number | undefined) => Promise<void>;
  onNavigateLocation: (location: NavLocation) => void;
  onNavigate?: (page: AppPage) => void;
}

const AUXILIARY_TAB_LABELS: Partial<Record<AnalysisHubSubTab, string>> = {
  recovery: 'Карта на възстановяването (72 ч.)',
  acwr: 'Натоварване и риск (ACWR)',
  'beat-log': 'Победи дневника',
  standards: 'Нива на сила и стандарти',
  supplements: 'Цикли на добавките',
};

export function AnalysisPreparationPage({
  activeSubTab,
  onSelectSubTab,
  hevyWorkouts,
  dailyLogs,
  habitItems,
  supplementCycles,
  profile,
  dailyStepsGoal = 10000,
  analysisManualWeightKg,
  targetWeight,
  customExerciseMappings,
  onSaveCycleConfig,
  onUpdateHabitItems,
  onSaveManualWeight,
  onSaveTargetWeight,
  onNavigateLocation,
}: AnalysisPreparationPageProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const yesterdayKey = useMemo(() => shiftDateKey(todayKey, -1), [todayKey]);

  const fallbackWeightKg =
    typeof profile.weightKg === 'number' && Number.isFinite(profile.weightKg)
      ? profile.weightKg
      : analysisManualWeightKg ?? null;

  const activeAuxiliaryLabel = AUXILIARY_TAB_LABELS[activeSubTab] ?? null;

  return (
    <section
      id="analysis"
      data-testid="analysis-preparation-page"
      aria-label="Анализи и графики"
      className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8"
    >
      {/* Заглавие на раздела */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
            📊 Анализи и графики
          </h1>
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-400">
            Относителна сила и боксова категория, биоритъм, сън, планинско кардио и пълен неделен обзор със серии и рекорди.
          </p>
          <p
            data-testid="analysis-date-boundary-note"
            className="mt-1.5 font-mono text-[11px] tabular-nums text-sky-300/90"
          >
            📊 Отчет по завършените записи до ВЧЕРА ({formatBgNumericDate(yesterdayKey)}) · Непопълнените данни за ДНЕС ({formatBgNumericDate(todayKey)}) не изкривяват тенденциите.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              onNavigateLocation({ page: 'coach', coachSubTab: 'readiness' })
            }
            className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap"
          >
            🧠 Интелигентен треньор
          </button>
          <button
            type="button"
            onClick={() => onNavigateLocation({ page: 'hevy' })}
            className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap"
          >
            Тренировки (Hevy)
          </button>
        </div>
      </div>

      {/* 3 основни подменюта (рендира се САМО активният под-таб) */}
      <div
        role="tablist"
        aria-label="Основни подраздели на Анализи и графики"
        data-testid="analysis-subtabs-bar"
        className="mt-5 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0F141F] p-1.5"
      >
        {ANALYSIS_PRIMARY_SUB_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`analysis-subtab-${tab.id}`}
              onClick={() => onSelectSubTab(tab.id)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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

        {activeAuxiliaryLabel && (
          <div
            data-testid={`analysis-subtab-aux-${activeSubTab}`}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-semibold text-white whitespace-nowrap"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            <span>{activeAuxiliaryLabel}</span>
          </div>
        )}
      </div>

      {/* Активно съдържание — рендира се САМО избраният под-таб */}
      <div className="mt-6">
        {/* 3.1 ⚖️ Сила, Бокс и Категория */}
        {activeSubTab === 'strength-boxing' && (
          <div data-testid="analysis-panel-strength-boxing" className="space-y-6">
            <RelativeStrengthBoxingPanel
              hevyWorkouts={hevyWorkouts}
              dailyLogs={dailyLogs}
              profileWeightKg={profile.weightKg}
              analysisManualWeightKg={analysisManualWeightKg}
              targetWeight={targetWeight}
              onSaveTargetWeight={onSaveTargetWeight}
              onNavigateToHevy={() => onNavigateLocation({ page: 'hevy' })}
              onNavigateToCheckin={() => onNavigateLocation({ page: 'checkin' })}
            />

            <BoxingSessionsSummaryCard
              hevyWorkouts={hevyWorkouts}
              dailyLogs={dailyLogs}
            />
          </div>
        )}

        {/* 3.2 ⏰ Биоритъм, Сън и Тяло */}
        {activeSubTab === 'biorhythm-body' && (
          <div data-testid="analysis-panel-biorhythm-body" className="space-y-6">
            <HrvStatusCard dailyLogs={dailyLogs} todayKey={todayKey} />

            <SleepArchitectureCard dailyLogs={dailyLogs} todayKey={todayKey} />

            <SleepCoachingChronotypeCard
              dailyLogs={dailyLogs}
              hevyWorkouts={hevyWorkouts}
              todayKey={todayKey}
            />

            <OptimalTrainingTimePanel
              hevyWorkouts={hevyWorkouts}
              dailyLogs={dailyLogs}
              fallbackWeightKg={fallbackWeightKg}
              onNavigateToHevy={() => onNavigateLocation({ page: 'hevy' })}
              onNavigateToCheckin={() => onNavigateLocation({ page: 'checkin' })}
            />

            <BodyAndBiometricsChartsPanel
              dailyLogs={dailyLogs}
              dailyStepsGoal={dailyStepsGoal}
              profileWeightKg={profile.weightKg}
              profileHeightCm={profile.heightCm}
              todayKey={todayKey}
            />
          </div>
        )}

        {/* 3.3 🏆 Неделен обзор */}
        {activeSubTab === 'weekly-review' && (
          <div data-testid="analysis-panel-weekly-review" className="space-y-6">
            <WeeklyScorecardPanel
              dailyLogs={dailyLogs}
              hevyWorkouts={hevyWorkouts}
              habitItems={habitItems}
              profile={profile}
              todayKey={todayKey}
              dailyStepsGoal={dailyStepsGoal}
              embedded
            />

            <EffortTrainingLoadCard
              dailyLogs={dailyLogs}
              hevyWorkouts={hevyWorkouts}
              todayKey={todayKey}
            />

            <TrainingLoadAndDualStressCard
              dailyLogs={dailyLogs}
              hevyWorkouts={hevyWorkouts}
              todayKey={todayKey}
            />

            <EnduranceHillScoreCard dailyLogs={dailyLogs} todayKey={todayKey} />

            <HypertrophyVolumeMevMrvPanel
              hevyWorkouts={hevyWorkouts}
              todayKey={todayKey}
              customExerciseMappings={customExerciseMappings}
            />

            <WeeklySetsAndPrsPanel
              hevyWorkouts={hevyWorkouts}
              dailyLogs={dailyLogs}
              profile={profile}
              todayKey={todayKey}
              customExerciseMappings={customExerciseMappings}
            />
          </div>
        )}

        {/* 3.4 🏔️ Планина и Кардио */}
        {activeSubTab === 'mountain-cardio' && (
          <div data-testid="analysis-panel-mountain-cardio">
            <MountainCardioPanel
              dailyLogs={dailyLogs}
              todayKey={todayKey}
              onNavigateToCheckin={() => onNavigateLocation({ page: 'checkin' })}
            />
          </div>
        )}

        {/* Помощни подраздели (достъпни през „Още ▾“) */}
        {activeSubTab === 'recovery' && (
          <MuscleRecoveryTab
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            customExerciseMappings={customExerciseMappings}
            onNavigateToHevy={() => onNavigateLocation({ page: 'hevy' })}
          />
        )}

        {activeSubTab === 'acwr' && (
          <AcwrLoadTab hevyWorkouts={hevyWorkouts} dailyLogs={dailyLogs} />
        )}

        {activeSubTab === 'beat-log' && (
          <BeatTheLogTab
            hevyWorkouts={hevyWorkouts}
            onNavigateToHevy={() => onNavigateLocation({ page: 'hevy' })}
          />
        )}

        {activeSubTab === 'standards' && (
          <StrengthStandardsTab
            hevyWorkouts={hevyWorkouts}
            dailyLogs={dailyLogs}
            profileWeightKg={profile.weightKg}
            analysisManualWeightKg={analysisManualWeightKg}
            onSaveManualWeight={onSaveManualWeight}
          />
        )}

        {activeSubTab === 'supplements' && (
          <SupplementCyclingTab
            habitItems={habitItems}
            supplementCycles={supplementCycles}
            dailyLogs={dailyLogs}
            hevyWorkouts={hevyWorkouts}
            onSaveCycleConfig={onSaveCycleConfig}
            onUpdateHabitItems={onUpdateHabitItems}
          />
        )}
      </div>
    </section>
  );
}
