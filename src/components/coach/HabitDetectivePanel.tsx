import { useMemo } from 'react';
import { BarChart2, CheckCircle2, Clock, Search } from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import { analyzeHabitDetective60d } from '../../utils/biometricRadarAndDetective';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';

interface HabitDetectivePanelProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
}

export function HabitDetectivePanel({
  dailyLogs,
  hevyWorkouts,
  todayKey,
  bodyWeightKg = null,
}: HabitDetectivePanelProps) {
  const report = useMemo(
    () =>
      analyzeHabitDetective60d({
        dailyLogs,
        hevyWorkouts,
        todayKey,
        bodyWeightKg,
      }),
    [dailyLogs, hevyWorkouts, todayKey, bodyWeightKg],
  );

  return (
    <section
      data-testid="habit-detective-panel"
      aria-label="Детектив на навиците"
      className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-2 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--accent-text)]">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>🔍 Детектив на навиците (твоята лична статистика)</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold text-white">
            Автоматични корелации за последните 60 дни
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Кръстосва дневните ти навици със силовите тренировки (обем, макс. тежест и Rep PRs). Процентни изводи се отключват само при ≥ 3 тренировки във всяка група.
          </p>
        </div>

        <div className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
          {formatBgDate(report.windowStart)} – {formatBgDate(report.windowEnd)} ·{' '}
          {report.totalWorkoutsIn60d} трен. · {report.unlockedCount}/3 активни
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {report.comparisons.map((item) => {
          const progressPct = Math.round(
            (item.collectedSamplesForProgress / item.requiredSamplesTotal) * 100,
          );
          const isPositiveVol =
            item.volumeDiffPct !== null && item.volumeDiffPct > 0;
          const isNegativeVol =
            item.volumeDiffPct !== null && item.volumeDiffPct < 0;

          return (
            <article
              key={item.id}
              data-testid={`habit-detective-card-${item.id}`}
              data-unlocked={item.unlocked ? 'true' : 'false'}
              className={`flex flex-col justify-between rounded-xl border p-4 ${
                item.unlocked
                  ? 'border-emerald-500/30 bg-[#121A26]'
                  : 'border-white/10 bg-[#121722]'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display text-sm font-bold text-white">
                    {item.title}
                  </h3>
                  {item.unlocked ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-hidden="true"
                    />
                  ) : (
                    <Clock
                      className="h-4 w-4 shrink-0 text-slate-500"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  {item.subtitle}
                </p>

                {item.unlocked ? (
                  <>
                    <div className="mt-3 rounded-lg border border-white/8 bg-[#0B101A] p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-slate-400">
                          Разлика в обема
                        </span>
                        <span
                          className={`font-mono text-base font-extrabold tabular-nums ${
                            isPositiveVol
                              ? 'text-emerald-400'
                              : isNegativeVol
                                ? 'text-amber-300'
                                : 'text-slate-200'
                          }`}
                        >
                          {item.volumeDiffPct !== null
                            ? `${item.volumeDiffPct > 0 ? '+' : ''}${formatNumberBg(item.volumeDiffPct)}%`
                            : '—'}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs font-semibold leading-snug text-white">
                        {item.headlineInsight}
                      </p>
                      <p className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                        {item.detailText}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
                      <div className="rounded-lg border border-white/8 bg-[#0D131E] p-2">
                        <div className="truncate text-[10px] text-slate-400">
                          {item.groupA.label} ({item.groupA.workoutsCount})
                        </div>
                        <div className="mt-0.5 font-semibold text-white">
                          {item.groupA.avgVolumeKg !== null
                            ? `${formatNumberBg(item.groupA.avgVolumeKg)} kg`
                            : '—'}
                        </div>
                        <div className="text-[10px] text-emerald-400">
                          PR: {item.groupA.repPrRatePct ?? 0}%
                        </div>
                      </div>
                      <div className="rounded-lg border border-white/8 bg-[#0D131E] p-2">
                        <div className="truncate text-[10px] text-slate-400">
                          {item.groupB.label} ({item.groupB.workoutsCount})
                        </div>
                        <div className="mt-0.5 font-semibold text-slate-200">
                          {item.groupB.avgVolumeKg !== null
                            ? `${formatNumberBg(item.groupB.avgVolumeKg)} kg`
                            : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          PR: {item.groupB.repPrRatePct ?? 0}%
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 rounded-lg border border-white/8 bg-[#0B101A] p-3">
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                        <span>{item.headlineInsight}</span>
                      </span>
                    </div>
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                      role="progressbar"
                      aria-valuenow={item.collectedSamplesForProgress}
                      aria-valuemin={0}
                      aria-valuemax={item.requiredSamplesTotal}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                      {item.detailText}
                    </p>
                  </div>
                )}
              </div>

              {item.subjectiveNote && (
                <div className="mt-3 border-t border-white/8 pt-2.5 text-[11px] leading-relaxed text-sky-300">
                  {item.subjectiveNote}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
