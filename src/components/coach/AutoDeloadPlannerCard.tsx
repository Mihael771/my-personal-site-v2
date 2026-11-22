import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Check,
  Copy,
  Eye,
  RefreshCw,
} from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  analyzeDeloadCycle,
  formatDeloadPlanClipboard,
  generateDeloadWeekPlan,
} from '../../utils/deloadPlanner';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';

interface AutoDeloadPlannerCardProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  onOpenTechnique?: (exerciseName: string) => void;
}

export function AutoDeloadPlannerCard({
  hevyWorkouts,
  dailyLogs,
  todayKey,
  onOpenTechnique,
}: AutoDeloadPlannerCardProps) {
  const [showPlan, setShowPlan] = useState(false);
  const [copied, setCopied] = useState(false);

  const analysis = useMemo(
    () => analyzeDeloadCycle({ hevyWorkouts, dailyLogs, todayKey }),
    [hevyWorkouts, dailyLogs, todayKey],
  );

  const deloadPlan = useMemo(
    () => (showPlan ? generateDeloadWeekPlan(hevyWorkouts) : null),
    [showPlan, hevyWorkouts],
  );

  const maxBucketSets = useMemo(
    () => Math.max(20, ...analysis.weeklyBuckets.map((b) => b.totalSets)),
    [analysis.weeklyBuckets],
  );

  const borderAccent =
    analysis.status === 'deload_now'
      ? 'border-amber-500/45 bg-amber-950/15'
      : analysis.status === 'approaching'
        ? 'border-sky-500/35 bg-[#0F141F]'
        : 'border-white/10 bg-[#0F141F]';

  const headlineColor =
    analysis.status === 'deload_now'
      ? 'text-amber-300'
      : analysis.status === 'approaching'
        ? 'text-sky-300'
        : 'text-emerald-400';

  async function handleCopyPlan() {
    if (!deloadPlan) return;
    try {
      await navigator.clipboard.writeText(formatDeloadPlanClipboard(deloadPlan));
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard API unavailable inside restricted context
    }
  }

  return (
    <section
      data-testid="auto-deload-planner-card"
      aria-label="Автоматичен брояч до разтоварваща седмица"
      className={`mt-6 rounded-2xl border p-5 sm:p-6 ${borderAccent}`}
    >
      {/* Горен ред: Статус на цикъла + Бутон за Deload план */}
      <div className="flex flex-col gap-4 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-400">
            <BatteryCharging className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
            <span>Auto-Deload Planner · Анализ на последните 6 седмици</span>
            {analysis.acwr !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums ${
                    analysis.acwr > 1.35 ? 'text-amber-300 font-semibold' : 'text-slate-300'
                  }`}
                >
                  ACWR {analysis.acwr.toFixed(2)}
                </span>
              </>
            )}
            {analysis.rhrDeltaBpm !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums ${
                    analysis.rhrDeltaBpm > 4 ? 'text-amber-300 font-semibold' : 'text-slate-300'
                  }`}
                >
                  RHR {analysis.rhrDeltaBpm >= 0 ? `+${analysis.rhrDeltaBpm}` : analysis.rhrDeltaBpm} bpm
                </span>
              </>
            )}
            {analysis.recentSleepQualityAvg !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums ${
                    analysis.recentSleepQualityAvg <= 3
                      ? 'text-amber-300 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  Бодрост {analysis.recentSleepQualityAvg}/5
                </span>
              </>
            )}
          </div>

          <h2
            data-testid="deload-cycle-headline"
            className={`mt-1.5 font-display text-lg font-bold tracking-tight sm:text-xl ${headlineColor}`}
          >
            {analysis.headline}
          </h2>
          <p className="mt-1 text-sm text-slate-300">{analysis.subtext}</p>
        </div>

        <button
          type="button"
          data-testid="generate-deload-btn"
          onClick={() => setShowPlan((prev) => !prev)}
          disabled={hevyWorkouts.length === 0}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {showPlan ? 'Скрий Deload плана' : '🔄 Генерирай Deload тренировка'}
          </span>
        </button>
      </div>

      {/* Лента на цикъла (5 седмици натрупване) + 6-седмична SVG визуализация */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Прогрес на тренировъчния цикъл</span>
            <span className="font-mono font-semibold tabular-nums text-white">
              Седмица {Math.min(analysis.currentCycleWeek, analysis.targetCycleWeeks)}/
              {analysis.targetCycleWeeks}
            </span>
          </div>

          <div
            className="mt-2 grid grid-cols-5 gap-1.5"
            aria-label={`Текуща седмица ${analysis.currentCycleWeek} от ${analysis.targetCycleWeeks}`}
          >
            {[1, 2, 3, 4, 5].map((step) => {
              const filled = step <= analysis.currentCycleWeek;
              const isAlert = analysis.status === 'deload_now' && filled;
              return (
                <div
                  key={step}
                  className={`h-2.5 rounded-sm transition-colors ${
                    isAlert
                      ? 'bg-amber-400'
                      : filled
                        ? 'bg-emerald-400'
                        : 'bg-white/10'
                  }`}
                />
              );
            })}
          </div>

          {/* Маркери за натрупана умора */}
          {analysis.fatigueSignals.length > 0 ? (
            <div
              data-testid="deload-fatigue-signals"
              className="mt-3 space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-950/20 p-3"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Засечени маркери за умора ({analysis.fatigueSignals.length})</span>
              </div>
              <ul className="space-y-1 text-xs text-slate-200">
                {analysis.fatigueSignals.map((sig) => (
                  <li key={sig.id} className="font-mono text-[11px] tabular-nums">
                    <span className="font-sans font-medium text-amber-200">
                      {sig.label}:
                    </span>{' '}
                    {sig.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              Няма активни биометрични червени флагове (RHR ≤ +4 bpm, сън &gt; 3/5, ACWR ≤ 1.35).
            </p>
          )}
        </div>

        {/* 6-седмична SVG графика на натоварването */}
        <div className="lg:col-span-7">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>Седмичен обем (работни серии, последните 6 седмици)</span>
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-xs bg-emerald-400" aria-hidden="true" />
                Тежка седмица (≥ 3 тр.)
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-xs bg-slate-500" aria-hidden="true" />
                По-лека / частична
              </span>
            </span>
          </div>

          <svg
            viewBox="0 0 420 112"
            role="img"
            aria-label="Седмично натоварване за последните 6 седмици"
            className="w-full rounded-xl border border-white/8 bg-[#121826] p-1"
          >
            {analysis.weeklyBuckets.map((bucket, idx) => {
              const slotW = 400 / 6;
              const x = 14 + idx * slotW;
              const barW = 36;
              const maxH = 62;
              const barH =
                bucket.totalSets > 0
                  ? Math.max(6, Math.round((bucket.totalSets / maxBucketSets) * maxH))
                  : 3;
              const y = 78 - barH;
              const fill = bucket.isHighLoad
                ? analysis.status === 'deload_now'
                  ? '#f59e0b'
                  : '#10b981'
                : 'rgba(148, 163, 184, 0.35)';

              return (
                <g key={bucket.weekIndex}>
                  <text
                    x={x + barW / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize={9.5}
                    className="font-mono tabular-nums"
                  >
                    {bucket.totalSets > 0 ? `${bucket.totalSets}с` : '0'}
                  </text>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx={4}
                    fill={fill}
                  />
                  <text
                    x={x + barW / 2}
                    y={92}
                    textAnchor="middle"
                    fill="#94a3b8"
                    fontSize={8.5}
                    className="font-mono"
                  >
                    {bucket.label}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={104}
                    textAnchor="middle"
                    fill="#64748b"
                    fontSize={8}
                    className="font-mono"
                  >
                    {bucket.workoutCount} тр.
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Генериран 7-дневен Deload план */}
      {showPlan && deloadPlan && (
        <div
          data-testid="generated-deload-plan"
          className="mt-5 border-t border-white/10 pt-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold text-white">
                Готов 7-дневен Deload план (−{deloadPlan.setsReductionPct}% серии, −
                {deloadPlan.weightReductionPct}% тежест, закръглено до 2.5 kg)
              </h3>
              <p className="mt-0.5 text-xs text-slate-400">{deloadPlan.summaryNote}</p>
            </div>
            <button
              type="button"
              data-testid="copy-deload-plan-btn"
              onClick={() => void handleCopyPlan()}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Копирано</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Копирай плана</span>
                </>
              )}
            </button>
          </div>

          {deloadPlan.days.length === 0 ? (
            <p className="mt-4 text-xs text-slate-400">
              Няма достатъчно импортирани тренировки от Hevy за генериране на Deload седмица.
            </p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              {deloadPlan.days.map((day, idx) => (
                <article
                  key={day.sourceWorkoutId}
                  data-testid={`deload-day-${idx + 1}`}
                  className="rounded-xl border border-white/10 bg-[#131926] p-4"
                >
                  <div className="flex items-start justify-between gap-2 border-b border-white/8 pb-2.5">
                    <div className="min-w-0">
                      <div className="font-mono text-[11px] text-[var(--accent-text)]">
                        Ден {idx + 1} · база {formatBgDate(day.sourceDate)}
                      </div>
                      <h4 className="truncate font-display text-sm font-bold text-white">
                        {day.sourceTitle}
                      </h4>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-emerald-300">
                      {day.deloadTotalSets} сер.
                      <div className="text-[10px] text-slate-500 line-through">
                        {day.originalTotalSets} сер.
                      </div>
                    </div>
                  </div>

                  <ul className="mt-3 space-y-2.5">
                    {day.exercises.map((ex) => (
                      <li
                        key={`${day.sourceWorkoutId}-${ex.title}`}
                        className="flex items-start justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-slate-100">{ex.title}</div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                            <span className="font-semibold text-emerald-300">
                              {ex.deloadSets} сер.
                            </span>{' '}
                            <span className="text-slate-500">
                              (от {ex.originalSets})
                            </span>{' '}
                            × {ex.targetRepsText} ·{' '}
                            {ex.isBodyweight ? (
                              <span className="text-sky-300">собствено тегло</span>
                            ) : (
                              <>
                                <span className="font-semibold text-white">
                                  {formatNumberBg(ex.deloadWeightKg)} kg
                                </span>{' '}
                                <span className="text-slate-500">
                                  (от {formatNumberBg(ex.originalWeightKg)})
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {onOpenTechnique && (
                          <button
                            type="button"
                            onClick={() => onOpenTechnique(ex.title)}
                            title="Виж техника и снимки"
                            aria-label={`Техника и снимки за ${ex.title}`}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#0F141F] text-slate-400 transition-colors hover:border-white/25 hover:text-white"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
