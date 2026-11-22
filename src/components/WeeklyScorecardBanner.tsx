import { useMemo } from 'react';
import { ArrowRight, CalendarCheck2, X } from 'lucide-react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import { formatBgDate } from '../utils/fitnessMath';
import { computeWeeklyScorecardReport } from '../utils/weeklyScorecard';

interface WeeklyScorecardBannerProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  habitItems: string[];
  profile: UserProfile;
  todayKey: string;
  dailyStepsGoal?: number;
  onOpenWeeklyScorecard: () => void;
  onDismiss: () => void;
}

export function WeeklyScorecardBanner({
  dailyLogs,
  hevyWorkouts,
  habitItems,
  profile,
  todayKey,
  dailyStepsGoal = 10000,
  onOpenWeeklyScorecard,
  onDismiss,
}: WeeklyScorecardBannerProps) {
  const report = useMemo(
    () =>
      computeWeeklyScorecardReport({
        dailyLogs,
        hevyWorkouts,
        habitItems,
        profile,
        todayKey,
        dailyStepsGoal,
      }),
    [dailyLogs, hevyWorkouts, habitItems, profile, todayKey, dailyStepsGoal],
  );

  if (!report.isBannerDay) {
    return null;
  }

  return (
    <div
      data-testid="weekly-scorecard-banner"
      role="region"
      aria-label="Неделен обзор за завършената седмица"
      className="border-b border-white/10 bg-[#101827]"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <CalendarCheck2
              className="h-3.5 w-3.5 shrink-0 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span className="font-semibold text-white">
              Неделен обзор ({formatBgDate(report.currentWeek.startDate).slice(0, 5)} –{' '}
              {formatBgDate(report.currentWeek.endDate).slice(0, 5)})
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-semibold tabular-nums text-emerald-400">
              Оценка: {report.overallScore}/100 ({report.scoreTierLabel})
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-200">{report.mainFocus.headline}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="weekly-banner-open-btn"
            onClick={onOpenWeeklyScorecard}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
          >
            <span>Отвори Неделен обзор</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Скрий банера за Неделен обзор"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#141B27] text-slate-400 transition-colors hover:border-white/30 hover:text-white shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
