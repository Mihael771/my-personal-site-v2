import { useEffect, useMemo, useState } from 'react';
import { Activity, Sliders } from 'lucide-react';
import type {
  AdaptedWorkoutPlan,
  AiReadinessResult,
  HevyWorkout,
} from '../../types/fitness';
import { getUniqueHevyRoutines } from '../../utils/analysisPrep';
import { adaptRoutineForReadiness } from '../../utils/coachMiniAi';
import { formatNumberBg } from '../../utils/fitnessMath';

interface CoachReadinessCardProps {
  readiness: AiReadinessResult;
  hevyWorkouts: HevyWorkout[];
}

function getTierStrokeColor(tier: AiReadinessResult['tier']): string {
  if (tier === 'peak') return '#10b981';
  if (tier === 'good') return '#38bdf8';
  if (tier === 'moderate') return '#f59e0b';
  return '#f43f5e';
}

function getTierTextClass(tier: AiReadinessResult['tier']): string {
  if (tier === 'peak') return 'text-emerald-400';
  if (tier === 'good') return 'text-sky-400';
  if (tier === 'moderate') return 'text-amber-300';
  return 'text-rose-400';
}

function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeSemiArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  const start = polarPoint(cx, cy, r, startDeg);
  const end = polarPoint(cx, cy, r, endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function CoachReadinessCard({
  readiness,
  hevyWorkouts,
}: CoachReadinessCardProps) {
  const routines = useMemo(
    () => getUniqueHevyRoutines(hevyWorkouts),
    [hevyWorkouts],
  );
  const [selectedRoutine, setSelectedRoutine] = useState<string>(
    () => routines[0]?.title ?? '',
  );
  const [adaptedPlan, setAdaptedPlan] = useState<AdaptedWorkoutPlan | null>(null);

  useEffect(() => {
    if (routines.length > 0 && !routines.some((r) => r.title === selectedRoutine)) {
      setSelectedRoutine(routines[0].title);
    }
  }, [routines, selectedRoutine]);

  // Semi-circular geometry: 180deg -> 360deg (left to right top arch)
  const cx = 130;
  const cy = 128;
  const radius = 92;
  const clampedScore = Math.max(0, Math.min(100, readiness.score));
  const needleDeg = 180 + (clampedScore / 100) * 180;
  const needleTip = polarPoint(cx, cy, radius - 16, needleDeg);
  const tierColor = getTierStrokeColor(readiness.tier);
  const tierTextClass = getTierTextClass(readiness.tier);

  function handleAdaptRoutine() {
    if (!selectedRoutine && routines.length === 0) return;
    const plan = adaptRoutineForReadiness(
      hevyWorkouts,
      selectedRoutine || routines[0]?.title || '',
      readiness.score,
    );
    setAdaptedPlan(plan);
  }

  return (
    <section
      data-testid="coach-readiness-section"
      aria-label="AI Индекс на готовност и авто-коректор"
      className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      {/* Ляво: Полукръгов SVG Индекс на готовност (0–100) */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-5">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-3">
          <div className="flex items-center gap-2">
            <Activity
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <h2 className="font-display text-base font-bold text-white">
              AI Индекс на готовност
            </h2>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Скала 0–100
          </span>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <svg
            viewBox="0 0 260 154"
            role="img"
            aria-label={`AI Индекс на готовност: ${readiness.score} от 100`}
            className="w-full max-w-[270px]"
          >
            {/* Фонова дъга по зони */}
            <path
              d={describeSemiArc(cx, cy, radius, 180, 259)}
              fill="none"
              stroke="rgba(244, 63, 94, 0.25)"
              strokeWidth={16}
              strokeLinecap="butt"
            />
            <path
              d={describeSemiArc(cx, cy, radius, 261, 290)}
              fill="none"
              stroke="rgba(245, 158, 11, 0.25)"
              strokeWidth={16}
              strokeLinecap="butt"
            />
            <path
              d={describeSemiArc(cx, cy, radius, 292, 322)}
              fill="none"
              stroke="rgba(56, 189, 248, 0.25)"
              strokeWidth={16}
              strokeLinecap="butt"
            />
            <path
              d={describeSemiArc(cx, cy, radius, 324, 360)}
              fill="none"
              stroke="rgba(16, 185, 129, 0.28)"
              strokeWidth={16}
              strokeLinecap="butt"
            />

            {/* Активна дъга до текущия резултат */}
            {clampedScore > 0 && (
              <path
                d={describeSemiArc(cx, cy, radius, 180, needleDeg)}
                fill="none"
                stroke={tierColor}
                strokeWidth={16}
                strokeLinecap="round"
              />
            )}

            {/* Стрелка */}
            <line
              x1={cx}
              y1={cy}
              x2={needleTip.x}
              y2={needleTip.y}
              stroke="#f8fafc"
              strokeWidth={2.5}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={5} fill="#f8fafc" />

            {/* Централен резултат */}
            <text
              x={cx}
              y={cy - 22}
              textAnchor="middle"
              fill="#ffffff"
              fontSize={34}
              fontWeight={800}
              className="font-mono tabular-nums"
            >
              {readiness.score}
            </text>
            <text
              x={cx}
              y={cy - 4}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={11}
              className="font-mono"
            >
              от 100
            </text>

            {/* Краища на скалата */}
            <text
              x={cx - radius}
              y={cy + 18}
              textAnchor="middle"
              fill="#64748b"
              fontSize={10}
              className="font-mono"
            >
              0
            </text>
            <text
              x={cx}
              y={cy - radius - 14}
              textAnchor="middle"
              fill="#64748b"
              fontSize={10}
              className="font-mono"
            >
              50
            </text>
            <text
              x={cx + radius}
              y={cy + 18}
              textAnchor="middle"
              fill="#64748b"
              fontSize={10}
              className="font-mono"
            >
              100
            </text>
          </svg>

          <div
            data-testid="coach-readiness-headline"
            className={`mt-1 text-center font-display text-sm font-bold sm:text-base ${tierTextClass}`}
          >
            {readiness.diagnosisHeadline}
          </div>
          <p className="mt-1.5 text-center text-xs leading-relaxed text-slate-300">
            {readiness.diagnosisDetail}
          </p>
        </div>

        {/* Разбивка по 4-те фактора */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-white/8 pt-4 text-xs">
          <div className="rounded-lg border border-white/8 bg-[#141B27] p-2.5">
            <div className="text-[11px] text-slate-400">Сън (посл. 48ч)</div>
            <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
              {readiness.factors.avgSleepHours48h !== null
                ? `${formatNumberBg(readiness.factors.avgSleepHours48h)} ч`
                : '—'}
              {readiness.factors.avgFreshness48h !== null
                ? ` · ${formatNumberBg(readiness.factors.avgFreshness48h)}/5`
                : ''}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-[#141B27] p-2.5">
            <div className="text-[11px] text-slate-400">Пулс Δ (14д база)</div>
            <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
              {readiness.factors.latestRestingHr !== null
                ? `${readiness.factors.latestRestingHr} bpm`
                : '—'}
              {readiness.factors.rhrDeltaBpm !== null
                ? ` (${readiness.factors.rhrDeltaBpm > 0 ? '+' : ''}${readiness.factors.rhrDeltaBpm})`
                : ''}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-[#141B27] p-2.5">
            <div className="text-[11px] text-slate-400">Натоварване ACWR</div>
            <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
              {readiness.factors.acwr !== null
                ? readiness.factors.acwr.toFixed(2)
                : 'Няма 28д база'}
            </div>
          </div>

          <div className="rounded-lg border border-white/8 bg-[#141B27] p-2.5">
            <div className="text-[11px] text-slate-400">Поредни тр. дни</div>
            <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
              {readiness.factors.consecutiveTrainingDays}{' '}
              {readiness.factors.consecutiveTrainingDays === 1 ? 'ден' : 'дни'}
            </div>
          </div>

          {readiness.factors.recentSteps24h !== null && (
            <div
              data-testid="readiness-steps-24h-factor"
              className={`col-span-2 rounded-lg border p-2.5 ${
                readiness.factors.highStepsLegFatigue
                  ? 'border-amber-500/35 bg-amber-950/20'
                  : 'border-white/8 bg-[#141B27]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  Крачки (посл. 24ч)
                </span>
                <span
                  className={`font-mono text-xs font-semibold tabular-nums ${
                    readiness.factors.highStepsLegFatigue
                      ? 'text-amber-300'
                      : 'text-white'
                  }`}
                >
                  {formatNumberBg(readiness.factors.recentSteps24h)} крачки
                  {readiness.factors.highStepsLegFatigue
                    ? ' · Умора в краката (>14 000)'
                    : ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Дясно: Авто-коректор на тренировката */}
      <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-7">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-3">
            <div className="flex items-center gap-2">
              <Sliders
                className="h-4 w-4 text-[var(--accent-text)]"
                aria-hidden="true"
              />
              <h2 className="font-display text-base font-bold text-white">
                Авто-коректор на тренировката
              </h2>
            </div>
            <span className="font-mono text-xs tabular-nums text-slate-400">
              {readiness.score < 50
                ? '-25% серии · -6% тежест'
                : readiness.score >= 80
                  ? '+2.5 kg пикова форма'
                  : 'Адаптивно натоварване'}
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-slate-300">
            {readiness.adaptationSummary}
          </p>

          {routines.length === 0 ? (
            <div className="mt-4 rounded-xl border border-white/8 bg-[#141B27] p-5 text-xs text-slate-400">
              Импортирай поне една тренировка от Hevy, за да може авто-коректорът да настрои сериите и тежестите на реалните ти рутини.
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label
                    htmlFor="coach-adapt-routine-select"
                    className="block text-xs font-medium text-slate-300"
                  >
                    Избери тренировъчна рутина от Hevy
                  </label>
                  <select
                    id="coach-adapt-routine-select"
                    data-testid="coach-adapt-routine-select"
                    value={selectedRoutine}
                    onChange={(e) => {
                      setSelectedRoutine(e.target.value);
                      if (adaptedPlan) {
                        const updated = adaptRoutineForReadiness(
                          hevyWorkouts,
                          e.target.value,
                          readiness.score,
                        );
                        setAdaptedPlan(updated);
                      }
                    }}
                    className="mt-1.5 h-10 w-full rounded-lg border border-white/15 bg-[#080B11] px-3 text-sm text-white focus:border-[var(--accent)] focus:outline-none"
                  >
                    {routines.map((r) => (
                      <option key={r.title} value={r.title}>
                        {r.title} ({r.exerciseTitles.length} упр. · посл. {r.lastDate})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  data-testid="coach-adapt-workout-btn"
                  onClick={handleAdaptRoutine}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  Адаптирай днешната ми тренировка според състоянието
                </button>
              </div>

              {adaptedPlan && (
                <div
                  data-testid="coach-adapted-plan-result"
                  className="mt-4 rounded-xl border border-white/10 bg-[#141B27] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2.5">
                    <div className="text-xs font-semibold text-white">
                      {adaptedPlan.routineTitle} — {adaptedPlan.modeLabel}
                    </div>
                    <span className="font-mono text-xs tabular-nums text-[var(--accent-text)]">
                      Индекс: {adaptedPlan.readinessScore}/100
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-[11px] text-slate-400">
                          <th className="py-1.5 pr-3">Упражнение</th>
                          <th className="py-1.5 pr-3 text-right">Обичайно</th>
                          <th className="py-1.5 pr-3 text-right">Днес (Корекция)</th>
                          <th className="py-1.5 text-right">Цел RPE</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/8">
                        {adaptedPlan.exercises.map((ex) => (
                          <tr key={ex.exerciseTitle}>
                            <td className="py-2 pr-3">
                              <div className="font-medium text-white">
                                {ex.exerciseTitle}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                {ex.adjustmentNote}
                              </div>
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                              {ex.originalSets}×{ex.originalRepsLabel}
                              {ex.originalWeightKg > 0
                                ? ` · ${formatNumberBg(ex.originalWeightKg)} kg`
                                : ' · BW'}
                            </td>
                            <td className="py-2 pr-3 text-right font-mono font-semibold tabular-nums text-white whitespace-nowrap">
                              {ex.adaptedSets}×{ex.adaptedRepsText}
                              {ex.adaptedWeightKg > 0
                                ? ` · ${formatNumberBg(ex.adaptedWeightKg)} kg`
                                : ' · BW'}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-[var(--accent-text)] whitespace-nowrap">
                              {ex.targetRpeText}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
