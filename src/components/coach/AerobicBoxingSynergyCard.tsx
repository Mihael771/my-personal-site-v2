import { useMemo } from 'react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  formatBgNumericDate,
  formatNumberBg,
  shiftDateKey,
} from '../../utils/fitnessMath';
import { analyzeAerobicBoxingSynergy } from '../../utils/mountainCardioEngine';

interface AerobicBoxingSynergyCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  onOpenMountainCardio: () => void;
}

export function AerobicBoxingSynergyCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
  onOpenMountainCardio,
}: AerobicBoxingSynergyCardProps) {
  const synergy = useMemo(
    () =>
      analyzeAerobicBoxingSynergy({
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, todayKey],
  );

  const toneBarClass =
    synergy.status === 'strong'
      ? 'bg-emerald-400'
      : synergy.status === 'moderate'
        ? 'bg-sky-400'
        : 'bg-amber-400';

  const toneTextClass =
    synergy.status === 'strong'
      ? 'text-emerald-400'
      : synergy.status === 'moderate'
        ? 'text-sky-300'
        : 'text-amber-300';

  return (
    <div
      data-testid="aerobic-boxing-synergy-card"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-medium text-slate-400">
            Синергия „Аеробна база ↔ Бокс“ · Последни 7 завършени дни (до вчера, {formatBgNumericDate(shiftDateKey(todayKey, -1))}) → ефект за ДНЕС
          </div>
          <h3 className="mt-0.5 font-display text-base font-bold text-white">
            🏔️ Аеробни минути и възстановяване на пулса при бокс
          </h3>
        </div>

        <button
          type="button"
          onClick={onOpenMountainCardio}
          className="inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          Към „🏔️ Планина и Кардио“ →
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-white">
              {formatNumberBg(synergy.aerobicMinutes7d)} мин
            </span>
            <span className={`text-xs font-semibold ${toneTextClass}`}>
              {synergy.statusLabel}
            </span>
          </div>

          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full transition-all ${toneBarClass}`}
              style={{ width: `${synergy.progressPct}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] tabular-nums text-slate-400">
            <span>Цел: {synergy.targetMinutesWeekly} мин/седм.</span>
            <span>·</span>
            <span>{synergy.aerobicSessions7d} сесии</span>
            {synergy.elevationGain7dM > 0 && (
              <>
                <span>·</span>
                <span className="text-emerald-400">
                  +{formatNumberBg(synergy.elevationGain7dM)} м
                </span>
              </>
            )}
            {synergy.avgRhr7d !== null && (
              <>
                <span>·</span>
                <span>Ср. RHR: {synergy.avgRhr7d} bpm</span>
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 lg:border-l lg:border-white/10 lg:pl-5">
          <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
            {synergy.boxingBenefitNote}
          </p>
        </div>
      </div>
    </div>
  );
}
