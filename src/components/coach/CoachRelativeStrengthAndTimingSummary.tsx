import { useMemo } from 'react';
import type { DailyBiometricLog, HevyWorkout, UserProfile } from '../../types/fitness';
import {
  analyzeOptimalTrainingTime,
  analyzeRelativeStrengthAndBoxing,
} from '../../utils/relativeStrengthAndBiorhythm';

interface CoachRelativeStrengthAndTimingSummaryProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  targetWeight?: number;
  todayKey: string;
  onOpenAnalysisSubTab: (subTab: 'relative-strength' | 'biorhythm') => void;
}

export function CoachRelativeStrengthAndTimingSummary({
  hevyWorkouts,
  dailyLogs,
  profile,
  targetWeight,
  todayKey,
  onOpenAnalysisSubTab,
}: CoachRelativeStrengthAndTimingSummaryProps) {
  const fallbackWeightKg =
    typeof profile.weightKg === 'number' && Number.isFinite(profile.weightKg)
      ? profile.weightKg
      : null;

  const relReport = useMemo(
    () =>
      analyzeRelativeStrengthAndBoxing({
        hevyWorkouts,
        dailyLogs,
        fallbackWeightKg,
        targetWeightKg: targetWeight ?? null,
        todayKey,
        windowDays: 90,
      }),
    [hevyWorkouts, dailyLogs, fallbackWeightKg, targetWeight, todayKey],
  );

  const timeReport = useMemo(
    () =>
      analyzeOptimalTrainingTime({
        hevyWorkouts,
        dailyLogs,
        fallbackWeightKg,
      }),
    [hevyWorkouts, dailyLogs, fallbackWeightKg],
  );

  const topMovement = relReport.movements[0] ?? null;
  const bestWindow = timeReport.bestStrengthWindowId
    ? timeReport.windows.find((w) => w.id === timeReport.bestStrengthWindowId) ??
      null
    : null;

  return (
    <div
      data-testid="coach-relative-strength-timing-summary"
      className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2"
    >
      {/* Кратко обобщение 1: Относителна сила и боксова категория */}
      <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0F141F] p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-white">
              ⚖️ Относителна сила и боксова категория
            </h3>
            <button
              type="button"
              onClick={() => onOpenAnalysisSubTab('relative-strength')}
              className="text-xs font-medium text-[var(--accent-text)] transition-opacity hover:opacity-80 whitespace-nowrap shrink-0"
            >
              Пълна графика →
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <div className="font-mono text-lg font-bold tabular-nums text-white">
              {relReport.compositeLatestRatio !== null
                ? `${relReport.compositeLatestRatio.toFixed(2)}x BW`
                : topMovement
                  ? `${topMovement.latestPoint.ratio.toFixed(2)}x BW`
                  : '—'}
            </div>
            {relReport.compositeDeltaRatio !== null &&
              relReport.compositeDeltaPct !== null && (
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    relReport.compositeDeltaRatio > 0
                      ? 'text-emerald-400'
                      : relReport.compositeDeltaRatio < 0
                        ? 'text-rose-400'
                        : 'text-slate-400'
                  }`}
                >
                  {relReport.compositeDeltaRatio >= 0 ? '+' : ''}
                  {relReport.compositeDeltaRatio.toFixed(2)}x (
                  {relReport.compositeDeltaPct >= 0 ? '+' : ''}
                  {relReport.compositeDeltaPct.toFixed(1)}% / 90 д.)
                </span>
              )}
          </div>

          <p className="mt-1.5 text-xs text-slate-300">
            {relReport.trendHeadline}
            {topMovement && (
              <span className="text-slate-400">
                {' '}
                · {topMovement.shortLabel}:{' '}
                <span className="font-mono tabular-nums text-slate-200">
                  {topMovement.latestPoint.ratio.toFixed(2)}x BW
                </span>
              </span>
            )}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 font-mono text-[11px] tabular-nums text-slate-400">
          <span>
            🥊 7-дн. тегло:{' '}
            <strong className="text-slate-200">
              {relReport.boxingWeight.avgWeight7d !== null
                ? `${relReport.boxingWeight.avgWeight7d.toFixed(1)} kg`
                : '—'}
            </strong>
            {relReport.boxingWeight.currentClass && (
              <> · {relReport.boxingWeight.currentClass.label}</>
            )}
          </span>
          {relReport.boxingWeight.targetStatusText && (
            <span className="text-amber-300">
              {relReport.boxingWeight.targetStatusText}
            </span>
          )}
        </div>
      </div>

      {/* Кратко обобщение 2: Оптимален час за тренировка */}
      <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0F141F] p-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-white">
              ⏰ Оптимален час (Биоритъм и сън)
            </h3>
            <button
              type="button"
              onClick={() => onOpenAnalysisSubTab('biorhythm')}
              className="text-xs font-medium text-[var(--accent-text)] transition-opacity hover:opacity-80 whitespace-nowrap shrink-0"
            >
              Подробен анализ →
            </button>
          </div>

          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="font-display text-base font-bold text-white">
              {bestWindow
                ? `${bestWindow.emoji} ${bestWindow.label} (${bestWindow.rangeLabel})`
                : timeReport.personalInsightHeadline}
            </div>
            {bestWindow && bestWindow.prRatePct !== null && (
              <span className="font-mono text-xs font-semibold tabular-nums text-emerald-400">
                {bestWindow.prRatePct.toFixed(0)}% PR
              </span>
            )}
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
            {timeReport.personalInsightBody}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 font-mono text-[11px] tabular-nums text-slate-400">
          <span>
            {timeReport.windows
              .map((w) => `${w.emoji} ${w.workoutsCount}`)
              .join('  ·  ')}
          </span>
          {timeReport.post19EveningCount >= 3 &&
            timeReport.post19RhrDeltaAvg !== null && (
              <span
                className={
                  timeReport.post19RhrDeltaAvg >= 1.2
                    ? 'text-rose-400'
                    : 'text-slate-300'
                }
              >
                След 19:00: {timeReport.post19RhrDeltaAvg >= 0 ? '+' : ''}
                {timeReport.post19RhrDeltaAvg.toFixed(1)} bpm
              </span>
            )}
        </div>
      </div>
    </div>
  );
}
