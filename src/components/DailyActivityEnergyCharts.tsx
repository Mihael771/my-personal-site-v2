import { useMemo, useState } from 'react';
import { Flame, Footprints } from 'lucide-react';
import type { DailyBiometricLog } from '../types/fitness';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  computeDailyEnergySummary,
  isDateIncludedForEveningMetric,
} from '../utils/dailyLogs';
import {
  formatBgDate,
  formatNumberBg,
  shiftDateKey,
} from '../utils/fitnessMath';

interface DailyActivityEnergyChartsProps {
  dailyLogs: DailyBiometricLog[];
  dailyStepsGoal: number;
  latestWeightKg: number | null;
  profileHeightCm: number | '';
  todayKey: string;
}

interface DayChartRow {
  date: string;
  shortLabel: string;
  steps: number | null;
  intakeKcal: number | null;
  activeKcal: number | null;
  restingKcal: number | null;
  restingSource: 'manual' | 'mifflin' | 'weight_22x' | null;
  tdeeKcal: number | null;
  netBalance: number | null;
  balanceLabel: string | null;
  balanceStatus: 'deficit' | 'surplus' | 'balanced' | null;
}

function formatShortDay(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}.${parts[1]}`;
}

export function DailyActivityEnergyCharts({
  dailyLogs,
  dailyStepsGoal,
  latestWeightKg,
  profileHeightCm,
  todayKey,
}: DailyActivityEnergyChartsProps) {
  const [rangeDays, setRangeDays] = useState<14 | 30>(14);
  const [hoveredStepIdx, setHoveredStepIdx] = useState<number | null>(null);
  const [hoveredCalIdx, setHoveredCalIdx] = useState<number | null>(null);

  const safeGoal =
    Number.isFinite(dailyStepsGoal) && dailyStepsGoal >= 1000
      ? Math.round(dailyStepsGoal)
      : DEFAULT_DAILY_STEPS_GOAL;

  const latestActivityDate = useMemo(() => {
    let latest: string | null = null;
    for (const d of dailyLogs) {
      if (
        isDateIncludedForEveningMetric(d, todayKey, 'steps') ||
        isDateIncludedForEveningMetric(d, todayKey, 'activeCalories') ||
        isDateIncludedForEveningMetric(d, todayKey, 'caloriesIntake') ||
        isDateIncludedForEveningMetric(d, todayKey, 'tdee')
      ) {
        if (!latest || d.date > latest) latest = d.date;
      }
    }
    return latest;
  }, [dailyLogs, todayKey]);

  // If the user has smartwatch/calorie logs only in an older window before today, anchor to latest so the charts show their data immediately.
  const anchorDate = useMemo(() => {
    if (!latestActivityDate) return todayKey;
    const windowStart = shiftDateKey(todayKey, -(rangeDays - 1));
    if (latestActivityDate >= windowStart && latestActivityDate <= todayKey) {
      return todayKey;
    }
    return latestActivityDate;
  }, [latestActivityDate, todayKey, rangeDays]);

  const series = useMemo<DayChartRow[]>(() => {
    const byDate = new Map<string, DailyBiometricLog>();
    for (const d of dailyLogs) {
      byDate.set(d.date, d);
    }

    const startDate = shiftDateKey(anchorDate, -(rangeDays - 1));
    const rows: DayChartRow[] = [];

    for (let i = 0; i < rangeDays; i++) {
      const dateKey = shiftDateKey(startDate, i);
      const log = byDate.get(dateKey);
      const includeSteps = isDateIncludedForEveningMetric(log, todayKey, 'steps');
      const includeIntake = isDateIncludedForEveningMetric(
        log,
        todayKey,
        'caloriesIntake',
      );
      const includeActive = isDateIncludedForEveningMetric(
        log,
        todayKey,
        'activeCalories',
      );
      const includeTdee = isDateIncludedForEveningMetric(log, todayKey, 'tdee');

      const energy =
        log && (includeIntake || includeActive || includeTdee)
          ? computeDailyEnergySummary({
              caloriesIntake: includeIntake ? log.caloriesKcal : undefined,
              activeCalories: includeActive ? log.activeCalories : undefined,
              restingCalories: includeTdee ? log.restingCalories : undefined,
              weightKg: log.weightKg ?? latestWeightKg,
              heightCm: profileHeightCm,
            })
          : null;

      rows.push({
        date: dateKey,
        shortLabel: formatShortDay(dateKey),
        steps: includeSteps && log?.steps !== undefined ? log.steps : null,
        intakeKcal: includeIntake ? (energy?.caloriesIntake ?? null) : null,
        activeKcal: includeActive ? (energy?.activeCalories ?? null) : null,
        restingKcal: energy?.effectiveRestingCalories ?? null,
        restingSource: energy?.restingSource ?? null,
        tdeeKcal: includeTdee ? (energy?.tdee ?? null) : null,
        netBalance:
          includeIntake && includeTdee ? (energy?.netBalance ?? null) : null,
        balanceLabel:
          includeIntake && includeTdee ? (energy?.label ?? null) : null,
        balanceStatus:
          includeIntake && includeTdee ? (energy?.status ?? null) : null,
      });
    }

    return rows;
  }, [dailyLogs, anchorDate, rangeDays, latestWeightKg, profileHeightCm, todayKey]);

  const stepStats = useMemo(() => {
    const valid = series.filter((r) => r.steps !== null);
    const total = valid.reduce((s, r) => s + (r.steps ?? 0), 0);
    const avg = valid.length > 0 ? Math.round(total / valid.length) : null;
    const metGoal = valid.filter((r) => (r.steps ?? 0) >= safeGoal).length;
    const maxSteps = Math.max(
      safeGoal * 1.15,
      12000,
      ...valid.map((r) => r.steps ?? 0),
    );
    const niceMax = Math.ceil(maxSteps / 2000) * 2000;
    return { count: valid.length, avg, metGoal, niceMax };
  }, [series, safeGoal]);

  const calStats = useMemo(() => {
    const intakes = series
      .map((r) => r.intakeKcal)
      .filter((v): v is number => v !== null);
    const tdees = series
      .map((r) => r.tdeeKcal)
      .filter((v): v is number => v !== null);
    const nets = series
      .map((r) => r.netBalance)
      .filter((v): v is number => v !== null);

    const avgIntake =
      intakes.length > 0
        ? Math.round(intakes.reduce((a, b) => a + b, 0) / intakes.length)
        : null;
    const avgTdee =
      tdees.length > 0
        ? Math.round(tdees.reduce((a, b) => a + b, 0) / tdees.length)
        : null;
    const avgNet =
      nets.length > 0
        ? Math.round(nets.reduce((a, b) => a + b, 0) / nets.length)
        : null;

    const allVals = [...intakes, ...tdees];
    const minRaw = allVals.length > 0 ? Math.min(...allVals) : 1200;
    const maxRaw = allVals.length > 0 ? Math.max(...allVals) : 3200;
    const yMin = Math.max(0, Math.floor((minRaw - 250) / 250) * 250);
    const yMax = Math.max(yMin + 500, Math.ceil((maxRaw + 250) / 250) * 250);

    return {
      hasData: allVals.length > 0,
      avgIntake,
      avgTdee,
      avgNet,
      yMin,
      yMax,
    };
  }, [series]);

  // Shared SVG geometry
  const svgW = 580;
  const svgH = 232;
  const padL = 48;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const yForSteps = (val: number) =>
    padT + plotH - (Math.min(stepStats.niceMax, Math.max(0, val)) / stepStats.niceMax) * plotH;

  const yForKcal = (val: number) => {
    const span = Math.max(1, calStats.yMax - calStats.yMin);
    const clamped = Math.min(calStats.yMax, Math.max(calStats.yMin, val));
    return padT + plotH - ((clamped - calStats.yMin) / span) * plotH;
  };

  const xForIndex = (idx: number) => {
    if (series.length <= 1) return padL + plotW / 2;
    const slotW = plotW / series.length;
    return padL + slotW * idx + slotW / 2;
  };

  const intakePath = useMemo(() => {
    const parts: string[] = [];
    series.forEach((row, idx) => {
      if (row.intakeKcal === null) return;
      const x = xForIndex(idx);
      const y = yForKcal(row.intakeKcal);
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return parts.join(' ');
  }, [series, calStats.yMin, calStats.yMax]);

  const tdeePath = useMemo(() => {
    const parts: string[] = [];
    series.forEach((row, idx) => {
      if (row.tdeeKcal === null) return;
      const x = xForIndex(idx);
      const y = yForKcal(row.tdeeKcal);
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return parts.join(' ');
  }, [series, calStats.yMin, calStats.yMax]);

  const activeStepRow =
    hoveredStepIdx !== null ? series[hoveredStepIdx] ?? null : null;
  const activeCalRow =
    hoveredCalIdx !== null ? series[hoveredCalIdx] ?? null : null;

  const labelStep = rangeDays === 14 ? 2 : 5;
  const barWidth = rangeDays === 14 ? 20 : 10;

  return (
    <div
      data-testid="daily-activity-energy-charts"
      className="mt-8 space-y-5"
    >
      {/* Заглавие и превключвател 14 / 30 дни */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Графики: Дневни крачки и Калориен баланс (Приети vs TDEE)
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Проследяване на NEAT активността спрямо целта и сравнение между приетата храна и общо изгорените калории от смарт часовника.
          </p>
        </div>

        <div
          role="group"
          aria-label="Период за графиките"
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 shrink-0"
        >
          <button
            type="button"
            data-testid="activity-charts-range-14"
            onClick={() => {
              setRangeDays(14);
              setHoveredStepIdx(null);
              setHoveredCalIdx(null);
            }}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
              rangeDays === 14
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            14 дни
          </button>
          <button
            type="button"
            data-testid="activity-charts-range-30"
            onClick={() => {
              setRangeDays(30);
              setHoveredStepIdx(null);
              setHoveredCalIdx(null);
            }}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
              rangeDays === 30
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            30 дни
          </button>
        </div>
      </div>

      {/* Две SVG графики една до друга на широки екрани */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Стълбовидна SVG графика за дневни крачки */}
        <div
          data-testid="steps-bar-chart-card"
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/8 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Footprints
                  className="h-4 w-4 text-[var(--accent-text)]"
                  aria-hidden="true"
                />
                <span>Дневни крачки ({rangeDays} дни)</span>
              </div>
              <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                {stepStats.avg !== null ? (
                  <>
                    Средно:{' '}
                    <span className="font-semibold text-white">
                      {formatNumberBg(stepStats.avg)}
                    </span>{' '}
                    крачки/ден · Цел постигната: {stepStats.metGoal}/
                    {stepStats.count} д.
                  </>
                ) : (
                  'Няма записани крачки за избрания период'
                )}
              </div>
            </div>

            {activeStepRow && (
              <div
                data-testid="steps-chart-hover-readout"
                className="text-right font-mono text-[11px] tabular-nums text-slate-200"
              >
                <div className="font-semibold text-white">
                  {formatBgDate(activeStepRow.date)}
                </div>
                <div>
                  {activeStepRow.steps !== null
                    ? `${formatNumberBg(activeStepRow.steps)} крачки (${Math.round(
                        (activeStepRow.steps / safeGoal) * 100,
                      )}%)`
                    : 'Няма запис'}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              role="img"
              aria-label={`Стълбовидна графика на дневните крачки за последните ${rangeDays} дни`}
              className="w-full"
            >
              {/* Y-ос деления */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const val = Math.round(stepStats.niceMax * frac);
                const y = yForSteps(val);
                return (
                  <g key={frac}>
                    <line
                      x1={padL}
                      x2={padL + plotW}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <text
                      x={padL - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize={10}
                      className="font-mono"
                    >
                      {val >= 1000 ? `${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : val}
                    </text>
                  </g>
                );
              })}

              {/* Прагова линия NEAT 6 000 */}
              {safeGoal !== 6000 && 6000 < stepStats.niceMax && (
                <g>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={yForSteps(6000)}
                    y2={yForSteps(6000)}
                    stroke="rgba(245, 158, 11, 0.35)"
                    strokeDasharray="3 4"
                    strokeWidth={1}
                  />
                </g>
              )}

              {/* Пунктирана линия за дневната цел (напр. 10 000) */}
              <g>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={yForSteps(safeGoal)}
                  y2={yForSteps(safeGoal)}
                  stroke="#34d399"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                />
                <text
                  x={padL + plotW - 2}
                  y={Math.max(12, yForSteps(safeGoal) - 5)}
                  textAnchor="end"
                  fill="#34d399"
                  fontSize={10}
                  className="font-mono"
                >
                  Цел {formatNumberBg(safeGoal)}
                </text>
              </g>

              {/* Стълбове за всеки ден */}
              {series.map((row, idx) => {
                const cx = xForIndex(idx);
                const baseLine = padT + plotH;
                const isHovered = hoveredStepIdx === idx;
                const hasVal = row.steps !== null;
                const barH = hasVal
                  ? Math.max(2, baseLine - yForSteps(row.steps ?? 0))
                  : 0;
                const fill = !hasVal
                  ? 'transparent'
                  : (row.steps ?? 0) >= safeGoal
                    ? '#10b981'
                    : (row.steps ?? 0) >= 6000
                      ? '#38bdf8'
                      : '#f59e0b';
                const showLabel =
                  idx % labelStep === 0 || idx === series.length - 1;

                return (
                  <g
                    key={row.date}
                    onMouseEnter={() => setHoveredStepIdx(idx)}
                    onMouseLeave={() => setHoveredStepIdx(null)}
                    onClick={() =>
                      setHoveredStepIdx((prev) => (prev === idx ? null : idx))
                    }
                    className="cursor-pointer"
                  >
                    <rect
                      x={cx - plotW / series.length / 2}
                      y={padT}
                      width={plotW / series.length}
                      height={plotH}
                      fill={isHovered ? 'rgba(255,255,255,0.04)' : 'transparent'}
                    />
                    {hasVal ? (
                      <rect
                        x={cx - barWidth / 2}
                        y={baseLine - barH}
                        width={barWidth}
                        height={barH}
                        rx={3}
                        fill={fill}
                        opacity={isHovered ? 1 : 0.85}
                      />
                    ) : (
                      <line
                        x1={cx - barWidth / 3}
                        x2={cx + barWidth / 3}
                        y1={baseLine - 1}
                        y2={baseLine - 1}
                        stroke="rgba(148, 163, 184, 0.25)"
                        strokeWidth={1.5}
                      />
                    )}
                    {showLabel && (
                      <text
                        x={cx}
                        y={svgH - 9}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={10}
                        className="font-mono"
                      >
                        {row.shortLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
              <span>≥ Цел ({formatNumberBg(safeGoal)})</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" />
              <span>6 000 – цел</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
              <span>&lt; 6 000 (нисък NEAT)</span>
            </span>
          </div>
        </div>

        {/* 2. Сравнителна SVG графика: Приети калории vs Изгорени калории (TDEE) */}
        <div
          data-testid="calories-balance-chart-card"
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/8 pb-3">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Flame
                  className="h-4 w-4 text-orange-400"
                  aria-hidden="true"
                />
                <span>Приети vs Изгорени калории (TDEE)</span>
              </div>
              <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                {calStats.avgNet !== null ? (
                  <>
                    Ср. прием:{' '}
                    <span className="text-sky-300">
                      {formatNumberBg(calStats.avgIntake ?? 0)}
                    </span>{' '}
                    · TDEE:{' '}
                    <span className="text-orange-300">
                      {formatNumberBg(calStats.avgTdee ?? 0)}
                    </span>{' '}
                    · Баланс:{' '}
                    <span
                      className={
                        calStats.avgNet < -50
                          ? 'font-semibold text-emerald-400'
                          : calStats.avgNet > 50
                            ? 'font-semibold text-amber-300'
                            : 'font-semibold text-slate-200'
                      }
                    >
                      {calStats.avgNet > 0 ? '+' : ''}
                      {calStats.avgNet} kcal
                    </span>
                  </>
                ) : calStats.hasData ? (
                  'Запиши едновременно приети и активни калории за нетен баланс'
                ) : (
                  'Няма записани калории за избрания период'
                )}
              </div>
            </div>

            {activeCalRow && (
              <div
                data-testid="calories-chart-hover-readout"
                className="text-right font-mono text-[11px] tabular-nums text-slate-200"
              >
                <div className="font-semibold text-white">
                  {formatBgDate(activeCalRow.date)}
                </div>
                <div>
                  {activeCalRow.intakeKcal !== null
                    ? `Приети: ${formatNumberBg(activeCalRow.intakeKcal)}`
                    : 'Приети: —'}{' '}
                  ·{' '}
                  {activeCalRow.tdeeKcal !== null
                    ? `TDEE: ${formatNumberBg(activeCalRow.tdeeKcal)}`
                    : 'TDEE: —'}
                </div>
                {activeCalRow.balanceLabel && (
                  <div
                    className={
                      activeCalRow.balanceStatus === 'deficit'
                        ? 'text-emerald-400'
                        : activeCalRow.balanceStatus === 'surplus'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                    }
                  >
                    {activeCalRow.balanceLabel}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              role="img"
              aria-label={`Сравнителна графика на приетите калории спрямо общо изгорените калории (TDEE) за последните ${rangeDays} дни`}
              className="w-full"
            >
              {/* Y-ос деления */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const val = Math.round(
                  calStats.yMin + (calStats.yMax - calStats.yMin) * frac,
                );
                const y = yForKcal(val);
                return (
                  <g key={frac}>
                    <line
                      x1={padL}
                      x2={padL + plotW}
                      y1={y}
                      y2={y}
                      stroke="rgba(255,255,255,0.08)"
                    />
                    <text
                      x={padL - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize={10}
                      className="font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Вертикални разлики между Приети и TDEE (зелено = дефицит, кехлибарено = излишък) */}
              {series.map((row, idx) => {
                if (row.intakeKcal === null || row.tdeeKcal === null) return null;
                const x = xForIndex(idx);
                const yIn = yForKcal(row.intakeKcal);
                const yOut = yForKcal(row.tdeeKcal);
                const isDeficit = row.intakeKcal <= row.tdeeKcal;
                return (
                  <line
                    key={`gap-${row.date}`}
                    x1={x}
                    x2={x}
                    y1={yIn}
                    y2={yOut}
                    stroke={
                      isDeficit
                        ? 'rgba(16, 185, 129, 0.45)'
                        : 'rgba(245, 158, 11, 0.5)'
                    }
                    strokeWidth={rangeDays === 14 ? 5 : 3}
                    strokeLinecap="round"
                  />
                );
              })}

              {/* Крива TDEE (Общо изгорени) */}
              {tdeePath && (
                <path
                  d={tdeePath}
                  fill="none"
                  stroke="#fb923c"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Крива Приети калории */}
              {intakePath && (
                <path
                  d={intakePath}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}

              {/* Интерактивни точки и дати */}
              {series.map((row, idx) => {
                const cx = xForIndex(idx);
                const isHovered = hoveredCalIdx === idx;
                const showLabel =
                  idx % labelStep === 0 || idx === series.length - 1;

                return (
                  <g
                    key={row.date}
                    onMouseEnter={() => setHoveredCalIdx(idx)}
                    onMouseLeave={() => setHoveredCalIdx(null)}
                    onClick={() =>
                      setHoveredCalIdx((prev) => (prev === idx ? null : idx))
                    }
                    className="cursor-pointer"
                  >
                    <rect
                      x={cx - plotW / series.length / 2}
                      y={padT}
                      width={plotW / series.length}
                      height={plotH}
                      fill={isHovered ? 'rgba(255,255,255,0.04)' : 'transparent'}
                    />
                    {row.tdeeKcal !== null && (
                      <circle
                        cx={cx}
                        cy={yForKcal(row.tdeeKcal)}
                        r={isHovered ? 5 : 3.2}
                        fill="#fb923c"
                        stroke="#0F141F"
                        strokeWidth={1.5}
                      />
                    )}
                    {row.intakeKcal !== null && (
                      <circle
                        cx={cx}
                        cy={yForKcal(row.intakeKcal)}
                        r={isHovered ? 5 : 3.2}
                        fill="#38bdf8"
                        stroke="#0F141F"
                        strokeWidth={1.5}
                      />
                    )}
                    {showLabel && (
                      <text
                        x={cx}
                        y={svgH - 9}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={10}
                        className="font-mono"
                      >
                        {row.shortLabel}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
              <span>Приети калории (храна)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
              <span>Общо изгорени (TDEE)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/60" />
              <span>Дефицит</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/60" />
              <span>Излишък</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
