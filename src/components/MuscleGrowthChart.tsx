import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { DayLog, MuscleAllocationConfig, MuscleId } from '../types/fitness';
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  computeLast30DaysTrend,
  formatGrams,
  type DailyTrendPoint,
} from '../utils/fitnessMath';

interface MuscleGrowthChartProps {
  logs: Record<string, DayLog>;
  todayKey: string;
  dailyBaseGainGrams?: number;
  accrueOnRestDays?: boolean;
  allocationConfig?: MuscleAllocationConfig;
}

const CHART_HEIGHT = 270;
const MARGIN = { top: 20, right: 20, bottom: 34, left: 48 };

export function MuscleGrowthChart({
  logs,
  todayKey,
  dailyBaseGainGrams,
  accrueOnRestDays,
  allocationConfig,
}: MuscleGrowthChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState<number>(920);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<'all' | MuscleId>('all');

  const trend = useMemo(
    () =>
      computeLast30DaysTrend(
        logs,
        todayKey,
        30,
        dailyBaseGainGrams,
        accrueOnRestDays,
        allocationConfig,
      ),
    [logs, todayKey, dailyBaseGainGrams, accrueOnRestDays, allocationConfig],
  );

  const getCumulativeValue = (pt: DailyTrendPoint) =>
    selectedMuscle === 'all'
      ? pt.cumulativeGrams
      : pt.byMuscleCumulative[selectedMuscle] ?? 0;

  const getDailyValue = (pt: DailyTrendPoint) =>
    selectedMuscle === 'all'
      ? pt.dailyGainGrams
      : pt.byMuscleDaily[selectedMuscle] ?? 0;

  const displayedStats = useMemo(() => {
    if (selectedMuscle === 'all') {
      return {
        windowGain: trend.windowGainGrams,
        activeDays: trend.activeDaysCount,
        endTotal: trend.endTotalGrams,
      };
    }
    const pts = trend.points;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const startCum = first
      ? Math.max(0, (first.byMuscleCumulative[selectedMuscle] ?? 0) - (first.byMuscleDaily[selectedMuscle] ?? 0))
      : 0;
    const endTotal = last ? last.byMuscleCumulative[selectedMuscle] ?? 0 : 0;
    const activeDays = pts.filter(
      (pt) =>
        pt.trainedMuscles.includes(selectedMuscle) ||
        (pt.byMuscleDaily[selectedMuscle] ?? 0) > 0,
    ).length;
    return {
      windowGain: Math.max(0, Math.round((endTotal - startCum) * 10) / 10),
      activeDays,
      endTotal,
    };
  }, [trend, selectedMuscle]);

  // Measure container width cleanly for responsive D3 scales
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.getBoundingClientRect().width));
      setWidth(next);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerWidth = Math.max(120, width - MARGIN.left - MARGIN.right);
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const { xScale, yScale, linePath, areaPath, yTicks, xTickIndices } = useMemo(() => {
    const points = trend.points;
    const x = d3
      .scaleLinear()
      .domain([0, Math.max(1, points.length - 1)])
      .range([0, innerWidth]);

    const maxVal = d3.max(points, getCumulativeValue) ?? 0;
    const minVal = d3.min(points, getCumulativeValue) ?? 0;
    const yLower = minVal > 10 ? Math.max(0, Math.floor(minVal * 0.85)) : 0;
    const yUpper = maxVal > yLower ? maxVal * 1.12 : yLower + 20;

    const y = d3.scaleLinear().domain([yLower, yUpper]).nice(5).range([innerHeight, 0]);

    const lineGen = d3
      .line<DailyTrendPoint>()
      .x((_, i) => x(i))
      .y((d) => y(getCumulativeValue(d)))
      .curve(d3.curveMonotoneX);

    const areaGen = d3
      .area<DailyTrendPoint>()
      .x((_, i) => x(i))
      .y0(innerHeight)
      .y1((d) => y(getCumulativeValue(d)))
      .curve(d3.curveMonotoneX);

    const ticksY = y.ticks(5);
    const step = width < 560 ? 7 : 5;
    const minGap = width < 560 ? 5 : 3;
    const indices: number[] = [];
    for (let i = 0; i < points.length; i += step) {
      indices.push(i);
    }
    const lastIdx = points.length - 1;
    if (lastIdx >= 0 && indices[indices.length - 1] !== lastIdx) {
      if (lastIdx - indices[indices.length - 1] < minGap) {
        indices[indices.length - 1] = lastIdx;
      } else {
        indices.push(lastIdx);
      }
    }

    return {
      xScale: x,
      yScale: y,
      linePath: lineGen(points) ?? '',
      areaPath: areaGen(points) ?? '',
      yTicks: ticksY,
      xTickIndices: indices,
    };
  }, [trend.points, innerWidth, innerHeight, width, selectedMuscle]);

  // Render D3 axes cleanly into dedicated <g> mounts
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;

    const root = d3.select(svgEl);
    const yAxisG = root.select<SVGGElement>('.d3-y-axis');
    const xAxisG = root.select<SVGGElement>('.d3-x-axis');

    const yAxis = d3
      .axisLeft(yScale)
      .tickValues(yTicks)
      .tickSize(0)
      .tickPadding(10)
      .tickFormat((d) => `${formatGrams(Number(d))} г`);

    const xAxis = d3
      .axisBottom(xScale)
      .tickValues(xTickIndices)
      .tickSize(0)
      .tickPadding(10)
      .tickFormat((idx) => trend.points[Number(idx)]?.shortLabel ?? '');

    yAxisG.call(yAxis);
    yAxisG.select('.domain').remove();
    yAxisG
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px');

    xAxisG.call(xAxis);
    xAxisG.select('.domain').attr('stroke', 'rgba(255, 255, 255, 0.12)');
    xAxisG
      .selectAll('text')
      .attr('fill', '#94a3b8')
      .attr('font-family', 'JetBrains Mono, monospace')
      .attr('font-size', '11px');
  }, [xScale, yScale, yTicks, xTickIndices, trend.points]);

  const activePoint =
    hoveredIndex !== null && trend.points[hoveredIndex]
      ? trend.points[hoveredIndex]
      : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = Math.max(0, Math.min(innerWidth, e.clientX - rect.left));
    const idx = Math.round(xScale.invert(relX));
    const clamped = Math.max(0, Math.min(trend.points.length - 1, idx));
    setHoveredIndex(clamped);
  }

  return (
    <section
      id="progress-chart"
      aria-label="Графика на общото натрупано мускулно тегло за последните 30 дни"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            {selectedMuscle === 'all'
              ? 'Общо натрупано мускулно тегло (последните 30 дни)'
              : `Натрупана мускулна маса: ${MUSCLE_MAP[selectedMuscle]?.label} (30 дни)`}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Проследи как се натрупва мускулната маса ден след ден или филтрирай по конкретна мускулна група.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-5 shrink-0">
          <div>
            <label
              htmlFor="chart-muscle-filter"
              className="mb-1 block text-xs text-slate-400"
            >
              Мускулна група
            </label>
            <select
              id="chart-muscle-filter"
              data-testid="chart-muscle-filter"
              value={selectedMuscle}
              onChange={(e) => setSelectedMuscle(e.target.value as 'all' | MuscleId)}
              className="h-9 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-white focus:border-[var(--accent)]"
            >
              <option value="all">Всички групи (Общо)</option>
              {MUSCLE_GROUPS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs text-slate-400">За последните 30 дни</div>
            <div
              data-testid="chart-30d-gain"
              className="font-mono text-lg font-bold tabular-nums text-[var(--accent-text)]"
            >
              +{formatGrams(displayedStats.windowGain)} г
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Активни дни</div>
            <div
              data-testid="chart-30d-active-days"
              className="font-mono text-lg font-bold tabular-nums text-white"
            >
              {displayedStats.activeDays} / 30
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Общо към днес</div>
            <div
              data-testid="chart-30d-total"
              className="font-mono text-lg font-bold tabular-nums text-white"
            >
              {formatGrams(displayedStats.endTotal)} г
            </div>
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-6">
        <div ref={containerRef} className="relative w-full">
          <svg
            ref={svgRef}
            width={width}
            height={CHART_HEIGHT}
            viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
            className="block w-full overflow-visible"
            data-testid="d3-muscle-growth-svg"
            role="img"
            aria-label="Линейна D3 графика на общото натрупано мускулно тегло за последните 30 дни"
          >
            <defs>
              <linearGradient id="d3-muscle-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.34} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
              {/* Horizontal gridlines */}
              {yTicks.map((t) => (
                <line
                  key={t}
                  x1={0}
                  x2={innerWidth}
                  y1={yScale(t)}
                  y2={yScale(t)}
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth={1}
                />
              ))}

              {/* Area + Cumulative Curve */}
              <path
                d={areaPath}
                fill="url(#d3-muscle-area-grad)"
                className="transition-all duration-300"
              />
              <path
                d={linePath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-300"
              />

              {/* Dots on active workout days */}
              {trend.points.map((pt, idx) => {
                const ptDaily = getDailyValue(pt);
                const ptTrained =
                  selectedMuscle === 'all'
                    ? pt.trainedMuscleCount > 0 || ptDaily > 0
                    : pt.trainedMuscles.includes(selectedMuscle) || ptDaily > 0;
                if (!ptTrained) return null;
                const isActive = hoveredIndex === idx;
                return (
                  <circle
                    key={pt.dateKey}
                    cx={xScale(idx)}
                    cy={yScale(getCumulativeValue(pt))}
                    r={isActive ? 5.5 : 3.5}
                    fill={pt.isFatigued ? '#f43f5e' : 'var(--accent)'}
                    stroke="#0F141F"
                    strokeWidth={1.75}
                  />
                );
              })}

              {/* Crosshair & Active Day Highlight */}
              {activePoint && hoveredIndex !== null && (
                <g pointerEvents="none">
                  <line
                    x1={xScale(hoveredIndex)}
                    x2={xScale(hoveredIndex)}
                    y1={0}
                    y2={innerHeight}
                    stroke="rgba(255, 255, 255, 0.28)"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={xScale(hoveredIndex)}
                    cy={yScale(getCumulativeValue(activePoint))}
                    r={6}
                    fill={activePoint.isFatigued ? '#f43f5e' : 'var(--accent)'}
                    stroke="#ffffff"
                    strokeWidth={2}
                  />
                </g>
              )}

              {/* D3 Axes */}
              <g className="d3-y-axis" />
              <g
                className="d3-x-axis"
                transform={`translate(0,${innerHeight})`}
              />

              {/* Pointer capture surface */}
              <rect
                data-testid="d3-chart-overlay"
                x={0}
                y={0}
                width={innerWidth}
                height={innerHeight}
                fill="transparent"
                className="cursor-crosshair"
                onPointerDown={handlePointerMove}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHoveredIndex(null)}
              />
            </g>
          </svg>

          {/* Interactive Hover Tooltip */}
          {activePoint && hoveredIndex !== null && (
            <div
              role="status"
              data-testid="d3-chart-tooltip"
              className="pointer-events-none absolute top-2 z-20 w-56 rounded-xl border border-white/15 bg-[#090D15]/95 p-3 shadow-2xl backdrop-blur-sm"
              style={{
                left: `${Math.min(
                  Math.max(12, MARGIN.left + xScale(hoveredIndex) - 112),
                  Math.max(12, width - 236),
                )}px`,
              }}
            >
              <div className="font-display text-xs font-bold text-white">
                {activePoint.fullDateLabel}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Общо натрупано:</span>
                <span className="font-mono font-bold tabular-nums text-white">
                  {formatGrams(getCumulativeValue(activePoint))} г
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Прираст за деня:</span>
                <span
                  className={`font-mono font-semibold tabular-nums ${
                    activePoint.isFatigued
                      ? 'text-rose-400'
                      : getDailyValue(activePoint) > 0
                        ? 'text-[var(--accent-text)]'
                        : 'text-slate-500'
                  }`}
                >
                  {getDailyValue(activePoint) > 0
                    ? `+${formatGrams(getDailyValue(activePoint))} г`
                    : 'Почивка'}
                </span>
              </div>
              {activePoint.trainedMuscleCount > 0 && (
                <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
                  {activePoint.trainedMuscleCount} мускулни групи ·{' '}
                  {activePoint.recoverySource === 'huawei_gt6' &&
                  activePoint.huaweiSleepScore !== undefined
                    ? `GT 6: ${activePoint.huaweiSleepScore} т. (${activePoint.recoveryPercentage}%)`
                    : activePoint.recoverySource === 'manual'
                      ? `Ръчно: ${activePoint.recoveryPercentage}%`
                      : `${activePoint.sleepHours} ч сън`}
                </div>
              )}
            </div>
          )}

          {/* Empty state guidance when 0g */}
          {displayedStats.endTotal === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-lg border border-white/10 bg-[#0B0F17]/90 px-4 py-2 text-xs text-slate-300">
                Отбележи тренировка днес или в календара, за да видиш 30-дневната крива на растеж.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              <span>Тренировка (добър сън)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden="true" />
              <span>Тренировка с умора (&lt; 60 т. / &lt; 6 ч)</span>
            </span>
          </div>
          <span className="font-mono tabular-nums text-slate-400">
            {trend.points[0]?.fullDateLabel} — {trend.points[trend.points.length - 1]?.fullDateLabel}
          </span>
        </div>
      </div>
    </section>
  );
}
