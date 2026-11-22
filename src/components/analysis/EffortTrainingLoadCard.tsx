import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  computeEffortTrainingLoadReport,
  type EffortLoadSourceFilter,
  type EffortLoadStatus,
} from '../../utils/vitalsAndSleepCoachingEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface EffortTrainingLoadCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}

const SOURCE_OPTIONS: Array<{ id: EffortLoadSourceFilter; label: string }> = [
  { id: 'all', label: 'Всички сесии' },
  { id: 'strength', label: 'Сила (Hevy)' },
  { id: 'cardio', label: 'Кардио / Часовник' },
];

function getStatusVisual(status: EffortLoadStatus): {
  textClass: string;
  accentHex: string;
  Icon: typeof CheckCircle2;
} {
  if (status === 'optimal') {
    return {
      textClass: 'text-emerald-300',
      accentHex: '#34D399',
      Icon: CheckCircle2,
    };
  }
  if (status === 'above') {
    return {
      textClass: 'text-rose-300',
      accentHex: '#FB7185',
      Icon: ArrowUpRight,
    };
  }
  if (status === 'below') {
    return {
      textClass: 'text-sky-300',
      accentHex: '#38BDF8',
      Icon: ArrowDownRight,
    };
  }
  return {
    textClass: 'text-slate-400',
    accentHex: '#64748B',
    Icon: Activity,
  };
}

export function EffortTrainingLoadCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
}: EffortTrainingLoadCardProps) {
  const [sourceFilter, setSourceFilter] =
    useState<EffortLoadSourceFilter>('all');
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(6);

  const report = useMemo(
    () =>
      computeEffortTrainingLoadReport({
        dailyLogs,
        hevyWorkouts,
        todayKey,
        sourceFilter,
      }),
    [dailyLogs, hevyWorkouts, todayKey, sourceFilter],
  );

  const clampedDayIdx = Math.min(
    Math.max(0, selectedDayIdx),
    Math.max(0, report.dailySeries7d.length - 1),
  );
  const inspectedDay = report.dailySeries7d[clampedDayIdx] ?? null;

  const statusVisual = getStatusVisual(report.status);
  const StatusIcon = statusVisual.Icon;

  // Weekly 4-week comparison SVG geometry (left chart)
  const wChartW = 340;
  const wChartH = 166;
  const wPadL = 32;
  const wPadR = 14;
  const wPadT = 18;
  const wPadB = 28;
  const wPlotW = wChartW - wPadL - wPadR;
  const wPlotH = wChartH - wPadT - wPadB;

  const maxWeeklyVal = Math.max(
    10,
    report.baseline28dWeekly * 1.4,
    ...report.weeklySeries4w.map((w) => w.totalEffort),
  );
  const yForWeekly = (v: number) =>
    wPadT + wPlotH - (Math.max(0, v) / maxWeeklyVal) * wPlotH;

  const optBandTop = yForWeekly(report.baseline28dWeekly * 1.22);
  const optBandBottom = yForWeekly(report.baseline28dWeekly * 0.82);
  const baselineY = yForWeekly(report.baseline28dWeekly);

  // Daily 7d bar SVG geometry (right chart)
  const dChartW = 360;
  const dChartH = 166;
  const dPadL = 28;
  const dPadR = 12;
  const dPadT = 18;
  const dPadB = 28;
  const dPlotW = dChartW - dPadL - dPadR;
  const dPlotH = dChartH - dPadT - dPadB;
  const maxDailyVal = Math.max(
    10,
    ...report.dailySeries7d.map((d) => d.totalEffort),
  );
  const yForDaily = (v: number) =>
    dPadT + dPlotH - (Math.max(0, v) / maxDailyVal) * dPlotH;

  return (
    <section
      data-testid="effort-training-load-card"
      aria-label="Training Load — 7-дневно срещу 28-дневно усилие"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + Филтър по източник */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <TrendingUp
              className="h-4 w-4 text-sky-400 shrink-0"
              aria-hidden="true"
            />
            <span>Скала 1–10 усилие на сесия (пулс, време, серии)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {formatBgNumericDate(report.windowStartDate)} –{' '}
              {formatBgNumericDate(report.windowEndDate)}
            </span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            📈 Training Load — 7-дневно срещу 28-дневно усилие
          </h2>
        </div>

        <div
          role="group"
          aria-label="Филтър по тип тренировки"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 self-start lg:self-auto"
        >
          {SOURCE_OPTIONS.map((opt) => {
            const active = sourceFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`effort-load-filter-${opt.id}`}
                aria-pressed={active}
                onClick={() => setSourceFilter(opt.id)}
                className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI обобщение (4 чисти колони без вложени карти) */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-b border-white/8 pb-4 md:grid-cols-4">
        <div>
          <div className="text-xs text-slate-400">7-дневно усилие</div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
            <span
              data-testid="effort-load-7d-value"
              className="text-2xl font-extrabold text-white"
            >
              {report.load7d}
            </span>
            <span className="text-xs text-slate-400">т.</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
            Сила {report.strengthLoad7d} · Кардио {report.cardioLoad7d}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">28-дневна седм. база</div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
            <span
              data-testid="effort-load-28d-value"
              className="text-2xl font-extrabold text-slate-200"
            >
              {report.baseline28dWeekly}
            </span>
            <span className="text-xs text-slate-400">т./седм.</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
            {report.sessionsCount28d} сесии за 28 дни
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">Статус 7д / 28д</div>
          <div className="mt-1 flex items-center gap-1.5">
            <StatusIcon
              className={`h-4 w-4 shrink-0 ${statusVisual.textClass}`}
              aria-hidden="true"
            />
            <span
              data-testid="effort-load-status-label"
              className={`text-sm font-bold ${statusVisual.textClass}`}
            >
              {report.statusLabel}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
            {report.deltaPct !== null
              ? `${report.deltaPct >= 0 ? '+' : ''}${report.deltaPct}% спрямо 28д норма`
              : 'Няма база за сравнение'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">Средно усилие / сесия</div>
          <div className="mt-1 flex items-baseline gap-1.5 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-white">
              {report.avgSessionEffort7d !== null
                ? report.avgSessionEffort7d
                : '—'}
            </span>
            <span className="text-xs text-slate-400">/ 10</span>
          </div>
          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
            {report.sessionsCount7d}{' '}
            {report.sessionsCount7d === 1 ? 'тренировка' : 'тренировки'} за 7д
          </div>
        </div>
      </div>

      {/* Двуколонна SVG визуализация: 4 седмици vs 28д зона + 7-дневна разбивка */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Лява SVG графика: 7-дневно усилие срещу 28-дневната седмична норма */}
        <div className="lg:col-span-6">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              Последни 4 седмици срещу 28-дневната норма
            </span>
            <span className="font-mono text-[11px] tabular-nums text-emerald-300/90">
              Оптимална зона: 82–122%
            </span>
          </div>

          <svg
            viewBox={`0 0 ${wChartW} ${wChartH}`}
            className="mt-2 h-auto w-full"
            role="img"
            aria-label="Сравнителна графика на 7-дневното усилие спрямо 28-дневната седмична норма"
          >
            {/* Оптимална зелена зона около 28-дневната норма */}
            {report.baseline28dWeekly > 0 && (
              <g>
                <rect
                  x={wPadL}
                  y={optBandTop}
                  width={wPlotW}
                  height={Math.max(4, optBandBottom - optBandTop)}
                  fill="rgba(52, 211, 153, 0.10)"
                />
                <line
                  x1={wPadL}
                  y1={baselineY}
                  x2={wChartW - wPadR}
                  y2={baselineY}
                  stroke="#34D399"
                  strokeOpacity="0.65"
                  strokeWidth="1.4"
                  strokeDasharray="4 3"
                />
                <text
                  x={wPadL - 5}
                  y={baselineY + 3}
                  textAnchor="end"
                  fill="#34D399"
                  fontSize="9.5"
                  className="font-mono tabular-nums"
                >
                  {Math.round(report.baseline28dWeekly)}
                </text>
              </g>
            )}

            {/* Хоризонтална базова ос */}
            <line
              x1={wPadL}
              y1={wPadT + wPlotH}
              x2={wChartW - wPadR}
              y2={wPadT + wPlotH}
              stroke="rgba(255,255,255,0.12)"
            />

            {/* 4 седмични колони */}
            {report.weeklySeries4w.map((week, idx) => {
              const slotW = wPlotW / 4;
              const barW = Math.min(44, slotW * 0.52);
              const x = wPadL + idx * slotW + (slotW - barW) / 2;
              const y = yForWeekly(week.totalEffort);
              const h = Math.max(2, wPadT + wPlotH - y);
              const fillColor = week.isCurrent7d
                ? statusVisual.accentHex
                : 'rgba(148, 163, 184, 0.42)';

              return (
                <g key={week.startDate}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx="5"
                    fill={fillColor}
                  />
                  <text
                    x={x + barW / 2}
                    y={Math.max(wPadT + 10, y - 5)}
                    textAnchor="middle"
                    fill={week.isCurrent7d ? '#FFFFFF' : '#CBD5E1'}
                    fontSize="10.5"
                    fontWeight={week.isCurrent7d ? 700 : 500}
                    className="font-mono tabular-nums"
                  >
                    {week.totalEffort}
                  </text>
                  <text
                    x={x + barW / 2}
                    y={wChartH - 8}
                    textAnchor="middle"
                    fill={week.isCurrent7d ? '#FFFFFF' : '#94A3B8'}
                    fontSize="9.5"
                    fontWeight={week.isCurrent7d ? 700 : 500}
                  >
                    {week.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Дясна SVG графика: Интерактивна разбивка по дни за последните 7 завършени дни */}
        <div className="border-t border-white/8 pt-4 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              Дневно усилие (кликни ден за сесиите)
            </span>
            <span className="font-mono text-[11px] tabular-nums text-slate-400">
              <span className="text-sky-400">■ Сила</span> ·{' '}
              <span className="text-amber-300">■ Кардио</span>
            </span>
          </div>

          <svg
            viewBox={`0 0 ${dChartW} ${dChartH}`}
            className="mt-2 h-auto w-full"
            role="img"
            aria-label="Дневна графика на тренировъчното усилие за последните 7 завършени дни"
          >
            {/* Референтни линии 5 и 10 */}
            {[5, 10].map((tick) => {
              if (tick > maxDailyVal) return null;
              const y = yForDaily(tick);
              return (
                <g key={tick}>
                  <line
                    x1={dPadL}
                    y1={y}
                    x2={dChartW - dPadR}
                    y2={y}
                    stroke="rgba(255,255,255,0.07)"
                    strokeDasharray="3 3"
                  />
                  <text
                    x={dPadL - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="9.5"
                    className="font-mono tabular-nums"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            <line
              x1={dPadL}
              y1={dPadT + dPlotH}
              x2={dChartW - dPadR}
              y2={dPadT + dPlotH}
              stroke="rgba(255,255,255,0.12)"
            />

            {report.dailySeries7d.map((day, idx) => {
              const slotW = dPlotW / 7;
              const barW = Math.min(28, slotW * 0.56);
              const colX = dPadL + idx * slotW;
              const barX = colX + (slotW - barW) / 2;
              const isSelected = idx === clampedDayIdx;

              const totalH =
                day.totalEffort > 0
                  ? Math.max(4, dPadT + dPlotH - yForDaily(day.totalEffort))
                  : 0;
              const strengthH =
                day.totalEffort > 0
                  ? (day.strengthEffort / day.totalEffort) * totalH
                  : 0;
              const cardioH = totalH - strengthH;
              const topY = dPadT + dPlotH - totalH;

              return (
                <g
                  key={day.date}
                  onClick={() => setSelectedDayIdx(idx)}
                  onMouseEnter={() => setSelectedDayIdx(idx)}
                  className="cursor-pointer"
                >
                  <rect
                    x={colX + 2}
                    y={dPadT}
                    width={slotW - 4}
                    height={dPlotH}
                    rx="4"
                    fill={isSelected ? 'rgba(255,255,255,0.05)' : 'transparent'}
                  />
                  {cardioH > 0 && (
                    <rect
                      x={barX}
                      y={topY}
                      width={barW}
                      height={cardioH}
                      rx={strengthH > 0 ? '2' : '4'}
                      fill="#FBBF24"
                    />
                  )}
                  {strengthH > 0 && (
                    <rect
                      x={barX}
                      y={topY + cardioH}
                      width={barW}
                      height={strengthH}
                      rx={cardioH > 0 ? '2' : '4'}
                      fill="#38BDF8"
                    />
                  )}
                  {day.totalEffort > 0 && (
                    <text
                      x={barX + barW / 2}
                      y={Math.max(dPadT + 10, topY - 4)}
                      textAnchor="middle"
                      fill={isSelected ? '#FFFFFF' : '#CBD5E1'}
                      fontSize="9.5"
                      fontWeight={isSelected ? 700 : 500}
                      className="font-mono tabular-nums"
                    >
                      {day.totalEffort}
                    </text>
                  )}
                  <text
                    x={colX + slotW / 2}
                    y={dChartH - 8}
                    textAnchor="middle"
                    fill={isSelected ? '#FFFFFF' : '#94A3B8'}
                    fontSize="9.5"
                    fontWeight={isSelected ? 700 : 500}
                  >
                    {day.weekdayShort}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Инспектиран ден + Треньорско заключение */}
      <div className="mt-4 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <div className="text-xs font-semibold text-white">
            {report.headline}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {report.guidance}
          </p>
        </div>

        <div className="border-t border-white/8 pt-3 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          {inspectedDay && (
            <div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-200">
                  Сесии на {inspectedDay.weekdayShort},{' '}
                  {formatBgNumericDate(inspectedDay.date)}
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  Общо {inspectedDay.totalEffort} т.
                </span>
              </div>
              {inspectedDay.sessions.length === 0 ? (
                <p className="mt-1.5 text-xs text-slate-400">
                  Почивен ден (0 записани сесии за избрания филтър).
                </p>
              ) : (
                <ul className="mt-1.5 space-y-1.5 text-xs">
                  {inspectedDay.sessions.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="truncate text-slate-200">
                        {s.source === 'strength' ? '🏋️' : '🏃'} {s.title}{' '}
                        <span className="font-mono text-[11px] tabular-nums text-slate-400">
                          ({s.summaryText})
                        </span>
                      </span>
                      <span className="font-mono font-bold tabular-nums text-white shrink-0">
                        {s.effortScore}/10
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
