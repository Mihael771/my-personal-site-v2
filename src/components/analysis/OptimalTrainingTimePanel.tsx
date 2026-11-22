import { useMemo } from 'react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  analyzeOptimalTrainingTime,
  type TrainingTimeWindowStats,
} from '../../utils/relativeStrengthAndBiorhythm';

interface OptimalTrainingTimePanelProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  fallbackWeightKg?: number | null;
  onNavigateToHevy?: () => void;
  onNavigateToCheckin?: () => void;
}

function formatVolumeKg(val: number | null): string {
  if (val === null) return '—';
  return `${val.toLocaleString('bg-BG')} kg`;
}

function formatRhrDelta(delta: number | null): string {
  if (delta === null) return '—';
  if (Math.abs(delta) < 0.05) return '0.0 bpm';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} bpm`;
}

export function OptimalTrainingTimePanel({
  hevyWorkouts,
  dailyLogs,
  fallbackWeightKg = null,
  onNavigateToHevy,
  onNavigateToCheckin,
}: OptimalTrainingTimePanelProps) {
  const report = useMemo(
    () =>
      analyzeOptimalTrainingTime({
        hevyWorkouts,
        dailyLogs,
        fallbackWeightKg,
      }),
    [hevyWorkouts, dailyLogs, fallbackWeightKg],
  );

  const maxAvgVolume = useMemo(
    () => Math.max(1, ...report.windows.map((w) => w.avgVolumeKg ?? 0)),
    [report.windows],
  );

  const maxPrRate = useMemo(
    () => Math.max(20, ...report.windows.map((w) => w.prRatePct ?? 0)),
    [report.windows],
  );

  const maxAbsRhr = useMemo(
    () =>
      Math.max(
        4,
        ...report.windows.map((w) => Math.abs(w.nextMorningRhrDeltaAvg ?? 0)),
      ),
    [report.windows],
  );

  const hasAnyWorkouts = report.totalWorkoutsAnalyzed > 0;

  // Inline SVG comparison chart geometry
  const svgW = 720;
  const svgH = 210;
  const rowH = 54;
  const startY = 34;

  return (
    <div data-testid="module-optimal-training-time" className="space-y-6">
      {/* Заглавие */}
      <div className="border-b border-white/10 pb-5">
        <h2 className="font-display text-lg font-bold text-white sm:text-xl">
          ⏰ Оптимален час за тренировка (Биоритъм и сън)
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-slate-400">
          Групира всички тренировки от Hevy (силови и бокс) по начален час и ги съпоставя със съня и сутрешния пулс в покой на следващата сутрин (ден D+1) спрямо 30-дневната ти база.
        </p>
      </div>

      {!hasAnyWorkouts ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-[#0F141F] px-6 py-10 text-center">
          <p className="text-sm font-semibold text-white">
            Все още няма тренировки с отчетен начален час
          </p>
          <p className="mt-1.5 text-xs text-slate-400">
            Импортирай историята си от Hevy (workouts.csv), за да разпределим тренировките в Сутрин, Следобед и Вечер и да ги обвържем със сутрешните ти биометрики.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {onNavigateToHevy && (
              <button
                type="button"
                onClick={onNavigateToHevy}
                className="h-8 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)]"
              >
                Към Тренировки (Hevy)
              </button>
            )}
            {onNavigateToCheckin && (
              <button
                type="button"
                onClick={onNavigateToCheckin}
                className="h-8 rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 hover:border-white/30"
              >
                Към Дневен запис
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* 3-колонно сравнение на часовите прозорци */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {report.windows.map((win: TrainingTimeWindowStats) => {
              const isBestStrength =
                report.eligibleWindowsCount >= 2 &&
                report.bestStrengthWindowId === win.id;
              const isBestRecovery =
                report.eligibleWindowsCount >= 2 &&
                report.bestRecoveryWindowId === win.id;
              const progressPct = Math.min(
                100,
                Math.round((win.workoutsCount / win.requiredMinWorkouts) * 100),
              );

              const rhrClass =
                win.nextMorningRhrDeltaAvg === null
                  ? 'text-slate-400'
                  : win.nextMorningRhrDeltaAvg >= 1.5
                    ? 'text-rose-400'
                    : win.nextMorningRhrDeltaAvg <= -0.5
                      ? 'text-emerald-400'
                      : 'text-slate-200';

              return (
                <div
                  key={win.id}
                  data-testid={`time-window-card-${win.id}`}
                  className={`rounded-xl border bg-[#0F141F] p-5 ${
                    isBestStrength
                      ? 'border-emerald-500/40'
                      : 'border-white/10'
                  }`}
                >
                  {/* Заглавие на прозореца */}
                  <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3">
                    <div>
                      <div className="font-display text-base font-bold text-white">
                        {win.emoji} {win.label}
                      </div>
                      <div className="mt-0.5 font-mono text-xs tabular-nums text-slate-400">
                        {win.rangeLabel}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold tabular-nums text-white">
                        {win.workoutsCount}{' '}
                        <span className="text-xs font-normal text-slate-400">
                          {win.workoutsCount === 1 ? 'трен.' : 'трен.'}
                        </span>
                      </div>
                      {win.boxingWorkoutsCount > 0 && (
                        <div className="text-[11px] text-slate-500">
                          {win.strengthWorkoutsCount} силови · {win.boxingWorkoutsCount} бокс
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Прогрес индикатор, ако прозорецът има < 3 тренировки */}
                  {!win.hasEnoughData && (
                    <div className="mt-3 rounded-lg border border-white/10 bg-[#141B27] p-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-300">Събиране на база за сравнение</span>
                        <span className="font-mono font-semibold tabular-nums text-amber-300">
                          {win.progressLabel}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-amber-400 transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Силова продуктивност */}
                  <div className="mt-4 space-y-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Силова продуктивност
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Среден работен обем</span>
                      <span className="font-mono font-semibold tabular-nums text-white">
                        {formatVolumeKg(win.avgVolumeKg)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Тренировки с PR (Rep / 1RM)</span>
                      <span className="font-mono font-semibold tabular-nums text-emerald-400">
                        {win.prRatePct !== null
                          ? `${win.prRatePct.toFixed(0)}% (${win.prWorkoutsCount}/${win.strengthWorkoutsCount})`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Въздействие върху съня и пулса на следващата сутрин */}
                  <div className="mt-4 space-y-2.5 border-t border-white/10 pt-3.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Следваща сутрин (Ден D+1)
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Среден сън</span>
                      <span className="font-mono font-semibold tabular-nums text-white">
                        {win.nextMorningSleepHoursAvg !== null
                          ? `${win.nextMorningSleepHoursAvg.toFixed(1)} ч`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Качество на съня (1–5)</span>
                      <span className="font-mono font-semibold tabular-nums text-slate-200">
                        {win.nextMorningSleepQualityAvg !== null
                          ? `${win.nextMorningSleepQualityAvg.toFixed(1)} / 5`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Пулс спрямо 30-дн. база</span>
                      <span className={`font-mono font-semibold tabular-nums ${rhrClass}`}>
                        {formatRhrDelta(win.nextMorningRhrDeltaAvg)}
                      </span>
                    </div>
                  </div>

                  {/* Кратък статус ред (без pill кутийки) */}
                  {(isBestStrength || isBestRecovery) && (
                    <div className="mt-4 border-t border-white/10 pt-2.5 text-[11px] font-medium text-emerald-400">
                      {isBestStrength && isBestRecovery
                        ? 'Най-висока сила и най-добро възстановяване'
                        : isBestStrength
                          ? 'Водещ прозорец за сила и PR-и'
                          : 'Най-спокоен сън и пулс на сутринта'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Визуална SVG сравнителна диаграма (PR % и Δ пулс на следващата сутрин) */}
          <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
            <div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display text-sm font-bold text-white">
                Сравнение: Продуктивност (Обем & PR %) срещу Сутрешен пулс (Δ bpm)
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                Анализирани тренировки: {report.totalWorkoutsAnalyzed}
              </span>
            </div>

            <div className="mt-3 w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                role="img"
                aria-label="Сравнение на часовите прозорци по PR процент, среден обем и сутрешен пулс"
                className="h-auto w-full min-w-[540px]"
              >
                {/* Заглавия на колоните в SVG */}
                <text
                  x="12"
                  y="16"
                  fill="#94A3B8"
                  fontSize="11"
                  fontWeight="600"
                >
                  Часови прозорец
                </text>
                <text
                  x="165"
                  y="16"
                  fill="#94A3B8"
                  fontSize="11"
                  fontWeight="600"
                >
                  Относителен обем / PR %
                </text>
                <text
                  x="485"
                  y="16"
                  fill="#94A3B8"
                  fontSize="11"
                  fontWeight="600"
                >
                  Δ Сутрешен пулс (D+1)
                </text>

                {/* Централна нулева линия за Δ RHR */}
                <line
                  x1="575"
                  x2="575"
                  y1="26"
                  y2={svgH - 12}
                  stroke="rgba(148, 163, 184, 0.25)"
                  strokeDasharray="3 3"
                />
                <text
                  x="575"
                  y={svgH - 1}
                  textAnchor="middle"
                  fill="#64748B"
                  fontSize="10"
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  0 bpm
                </text>

                {report.windows.map((win, idx) => {
                  const y = startY + idx * rowH;
                  const volBarW =
                    win.avgVolumeKg !== null
                      ? Math.max(6, (win.avgVolumeKg / maxAvgVolume) * 190)
                      : 0;
                  const prBarW =
                    win.prRatePct !== null
                      ? Math.max(4, (win.prRatePct / maxPrRate) * 190)
                      : 0;

                  const rhrDelta = win.nextMorningRhrDeltaAvg;
                  const rhrHalfMaxW = 78;
                  const rhrBarW =
                    rhrDelta !== null
                      ? Math.min(
                          rhrHalfMaxW,
                          (Math.abs(rhrDelta) / maxAbsRhr) * rhrHalfMaxW,
                        )
                      : 0;
                  const rhrBarX =
                    rhrDelta !== null && rhrDelta < 0 ? 575 - rhrBarW : 575;
                  const rhrColor =
                    rhrDelta === null
                      ? '#475569'
                      : rhrDelta >= 1.5
                        ? '#FB7185'
                        : rhrDelta <= -0.5
                          ? '#34D399'
                          : '#38BDF8';

                  const rowOpacity = win.hasEnoughData ? 1 : 0.5;

                  return (
                    <g key={win.id} opacity={rowOpacity}>
                      {/* Разделител */}
                      {idx > 0 && (
                        <line
                          x1="8"
                          x2={svgW - 8}
                          y1={y - 8}
                          y2={y - 8}
                          stroke="rgba(255, 255, 255, 0.06)"
                        />
                      )}

                      {/* Име на прозорец */}
                      <text
                        x="12"
                        y={y + 14}
                        fill="#F8FAFC"
                        fontSize="12"
                        fontWeight="600"
                      >
                        {win.emoji} {win.label}
                      </text>
                      <text
                        x="12"
                        y={y + 30}
                        fill="#64748B"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {win.hasEnoughData
                          ? `${win.workoutsCount} тренировки`
                          : win.progressLabel}
                      </text>

                      {/* Лента за обем */}
                      <rect
                        x="165"
                        y={y + 4}
                        width="190"
                        height="10"
                        rx="3"
                        fill="rgba(255, 255, 255, 0.05)"
                      />
                      {volBarW > 0 && (
                        <rect
                          x="165"
                          y={y + 4}
                          width={volBarW}
                          height="10"
                          rx="3"
                          fill="#38BDF8"
                        />
                      )}
                      <text
                        x="363"
                        y={y + 13}
                        fill="#CBD5E1"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {win.avgVolumeKg !== null
                          ? `${win.avgVolumeKg.toLocaleString('bg-BG')} kg`
                          : '—'}
                      </text>

                      {/* Лента за PR % */}
                      <rect
                        x="165"
                        y={y + 21}
                        width="190"
                        height="10"
                        rx="3"
                        fill="rgba(255, 255, 255, 0.05)"
                      />
                      {prBarW > 0 && (
                        <rect
                          x="165"
                          y={y + 21}
                          width={prBarW}
                          height="10"
                          rx="3"
                          fill="#34D399"
                        />
                      )}
                      <text
                        x="363"
                        y={y + 30}
                        fill="#6EE7B7"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {win.prRatePct !== null ? `${win.prRatePct.toFixed(0)}% PR` : '—'}
                      </text>

                      {/* Δ RHR дивергираща лента */}
                      <rect
                        x="497"
                        y={y + 11}
                        width="156"
                        height="14"
                        rx="3"
                        fill="rgba(255, 255, 255, 0.04)"
                      />
                      {rhrDelta !== null && rhrBarW > 0 && (
                        <rect
                          x={rhrBarX}
                          y={y + 11}
                          width={rhrBarW}
                          height="14"
                          rx="3"
                          fill={rhrColor}
                        />
                      )}
                      <text
                        x="662"
                        y={y + 22}
                        fill={rhrColor}
                        fontSize="11"
                        fontWeight="600"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {formatRhrDelta(rhrDelta)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-sky-400" />
                Среден работен обем (силови)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-emerald-400" />
                % тренировки с PR (Rep PR / 1RM PR)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-3 rounded-sm bg-rose-400" />
                Повишен сутрешен пулс (D+1)
              </span>
            </div>
          </div>

          {/* Автоматичен личен извод */}
          <div
            data-testid="optimal-time-personal-insight"
            className="rounded-xl border border-white/15 bg-[#121826] p-5"
          >
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-display text-sm font-bold text-white">
                Автоматичен личен извод · {report.personalInsightHeadline}
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                Сравними прозорци (≥ 3 тр.): {report.eligibleWindowsCount}/3
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-200 sm:text-sm">
              {report.personalInsightBody}
            </p>
            {report.post19EveningCount >= 3 &&
              report.post19RhrDeltaAvg !== null && (
                <div className="mt-2.5 border-t border-white/10 pt-2.5 font-mono text-[11px] tabular-nums text-slate-400">
                  Тренировки след 19:00 ч.: {report.post19EveningCount} сесии · средна промяна на сутрешния пулс:{' '}
                  <span
                    className={
                      report.post19RhrDeltaAvg >= 1.2
                        ? 'font-semibold text-rose-400'
                        : 'font-semibold text-slate-200'
                    }
                  >
                    {formatRhrDelta(report.post19RhrDeltaAvg)}
                  </span>
                </div>
              )}
          </div>
        </>
      )}
    </div>
  );
}
