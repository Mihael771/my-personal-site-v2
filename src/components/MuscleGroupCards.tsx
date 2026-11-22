import { Check, Dumbbell } from 'lucide-react';
import type {
  DateSnapshotStats,
  DayLog,
  MuscleAllocationConfig,
  MuscleId,
} from '../types/fitness';
import {
  MUSCLE_GROUPS,
  calculateDayGainsBreakdown,
  calculateMuscleGainForDay,
  formatGrams,
  getMuscleProgress,
  roundGrams,
} from '../utils/fitnessMath';
import { MuscleAllocationPanel } from './MuscleAllocationPanel';

interface MuscleGroupCardsProps {
  todayStats: DateSnapshotStats;
  todayEntry?: DayLog;
  dailyBaseGainGrams?: number;
  accrueOnRestDays?: boolean;
  allocationConfig?: MuscleAllocationConfig;
  onToggleMuscle: (muscleId: MuscleId) => void;
  onAllocationChange: (next: MuscleAllocationConfig) => void;
  onTodayPerMuscleManualChange: (nextMap: Partial<Record<MuscleId, number>>) => void;
  onClearTodayPerMuscleManual: () => void;
}

export function MuscleGroupCards({
  todayStats,
  todayEntry,
  dailyBaseGainGrams,
  accrueOnRestDays,
  allocationConfig,
  onToggleMuscle,
  onAllocationChange,
  onTodayPerMuscleManualChange,
  onClearTodayPerMuscleManual,
}: MuscleGroupCardsProps) {
  const isFatigued = todayStats.recovery.isFatigued;
  const recoveryOpts = {
    huaweiSleepScore: todayStats.recovery.huaweiSleepScore,
    recoveryMode: todayStats.recovery.mode,
    manualRecoveryPercent:
      todayStats.recovery.mode === 'manual' ? todayStats.recovery.percentage : undefined,
  };
  const effectiveBase = todayStats.effectiveBaseDailyGrams ?? dailyBaseGainGrams;
  const scaledDailyTarget =
    effectiveBase !== undefined
      ? roundGrams(effectiveBase * todayStats.recovery.multiplier)
      : undefined;

  return (
    <section
      id="muscles"
      aria-label="Детайлна статистика по мускулни групи"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Мускулни групи и прогрес
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Прогрес баровете се пълнят постепенно с всяка тренировка. Потенциал днес{' '}
            {todayStats.recovery.source === 'huawei_gt6' &&
            todayStats.recovery.huaweiSleepScore !== undefined ? (
              <>
                при{' '}
                <span className="font-mono font-semibold text-slate-200">
                  Huawei GT 6: {todayStats.recovery.huaweiSleepScore} т.
                </span>
              </>
            ) : todayStats.recovery.source === 'manual' ? (
              <>
                (ръчен режим)
              </>
            ) : (
              <>
                при{' '}
                <span className="font-mono font-semibold text-slate-200">
                  {todayStats.sleepHours} ч сън
                </span>
              </>
            )}
            : {todayStats.recovery.percentage}%
            {todayStats.gainMode === 'manual'
              ? ` · ръчен прираст днес: +${formatGrams(todayStats.gainedOnDateTotal)} г.`
              : scaledDailyTarget !== undefined && effectiveBase !== undefined
                ? ` · дневна цел: ${formatGrams(effectiveBase)} г × ${todayStats.recovery.percentage}% = +${formatGrams(scaledDailyTarget)} г/ден.`
                : '.'}
          </p>
        </div>
      </div>

      <MuscleAllocationPanel
        todayStats={todayStats}
        todayEntry={todayEntry}
        dailyBaseGainGrams={dailyBaseGainGrams}
        allocationConfig={allocationConfig}
        onAllocationChange={onAllocationChange}
        onTodayPerMuscleManualChange={onTodayPerMuscleManualChange}
        onClearTodayPerMuscleManual={onClearTodayPerMuscleManual}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MUSCLE_GROUPS.map((def) => {
          const mStats = todayStats.byMuscle[def.id];
          const progress = getMuscleProgress(mStats.totalGrams);
          const trained = mStats.trainedOnDate;
          const hasGainedToday = mStats.gainedOnDate > 0;
          const sharePercent =
            todayStats.totalCumulativeGrams > 0
              ? ((mStats.totalGrams / todayStats.totalCumulativeGrams) * 100).toFixed(1)
              : '0.0';
          const potentialToday =
            trained || hasGainedToday
              ? mStats.gainedOnDate
              : todayStats.gainMode === 'manual'
                ? calculateDayGainsBreakdown(
                    {
                      date: todayStats.date,
                      sleepHours: todayStats.sleepHours,
                      muscleGainMode: 'manual',
                      manualGainGrams: todayStats.gainedOnDateTotal,
                      muscles: [...todayStats.trainedMuscles, def.id],
                    },
                    effectiveBase,
                    accrueOnRestDays,
                    allocationConfig,
                  ).byMuscle[def.id] ?? 0
                : effectiveBase !== undefined || allocationConfig?.mode === 'custom_percent'
                  ? calculateDayGainsBreakdown(
                      {
                        date: todayStats.date,
                        sleepHours: todayStats.sleepHours,
                        ...recoveryOpts,
                        ...(effectiveBase !== undefined
                          ? { baseDailyGainGrams: effectiveBase }
                          : {}),
                        muscles: [...todayStats.trainedMuscles, def.id],
                      },
                      effectiveBase,
                      accrueOnRestDays,
                      allocationConfig,
                    ).byMuscle[def.id] ?? 0
                  : calculateMuscleGainForDay(def.id, todayStats.sleepHours, recoveryOpts);

          return (
            <article
              key={def.id}
              data-testid={`muscle-card-${def.id}`}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${
                trained
                  ? isFatigued
                    ? 'border-rose-500/45 bg-rose-950/20'
                    : 'border-[var(--accent-border)] bg-[#131B2A]'
                  : 'border-white/10 bg-[#0F141F]'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-white">
                      {def.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {def.anatomicalLabel}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      data-testid={`card-grams-${def.id}`}
                      className="font-mono text-xl font-bold tabular-nums text-white"
                    >
                      {formatGrams(mStats.totalGrams)} г
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-slate-400">
                      {trained || hasGainedToday
                        ? `+${formatGrams(mStats.gainedOnDate)} г днес`
                        : `+${formatGrams(potentialToday)} г при тренировка`}
                    </div>
                  </div>
                </div>

                {/* Цветна лента (Progress bar) */}
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Ниво {progress.level}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {formatGrams(progress.currentInLevel)} / {progress.targetForLevel} г
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={`Прогрес за ${def.label}`}
                    aria-valuemin={0}
                    aria-valuemax={progress.targetForLevel}
                    aria-valuenow={progress.currentInLevel}
                    className="h-2.5 w-full overflow-hidden rounded-full bg-white/8"
                  >
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ${
                        trained && isFatigued
                          ? 'bg-rose-500'
                          : 'bg-[var(--accent)]'
                      }`}
                      style={{
                        width: `${Math.max(mStats.totalGrams > 0 ? 4 : 0, progress.percent)}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                  <span>Дял от общия мускул</span>
                  <span
                    data-testid={`card-share-${def.id}`}
                    className="font-mono font-semibold tabular-nums text-[var(--accent-text)]"
                  >
                    {sharePercent}%
                  </span>
                </div>

                <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                  <span>Общо тренировки</span>
                  <span
                    data-testid={`card-workouts-${def.id}`}
                    className="font-mono font-semibold tabular-nums text-slate-200"
                  >
                    {mStats.workoutCount}
                  </span>
                </div>
              </div>

              <button
                type="button"
                data-testid={`train-btn-${def.id}`}
                onClick={() => onToggleMuscle(def.id)}
                aria-pressed={trained}
                className={`mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors whitespace-nowrap ${
                  trained
                    ? isFatigued
                      ? 'border border-rose-400/50 bg-rose-600 text-white hover:bg-rose-500'
                      : 'bg-[var(--accent)] text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)]'
                    : 'border border-white/15 bg-[#161E2E] text-slate-100 hover:border-[var(--accent-border)] hover:text-white'
                }`}
              >
                {trained ? (
                  <>
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Тренирано днес</span>
                  </>
                ) : (
                  <>
                    <Dumbbell className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Тренирай</span>
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
