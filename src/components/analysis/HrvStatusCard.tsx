import { useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import {
  computeHrvStatusReport,
  type HrvStatusClassification,
} from '../../utils/biometricPerformanceEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface HrvStatusCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

function getStatusVisuals(status: HrvStatusClassification): {
  strokeHex: string;
  textClass: string;
  badgeClass: string;
} {
  if (status === 'balanced') {
    return {
      strokeHex: '#10B981',
      textClass: 'text-emerald-400',
      badgeClass: 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300',
    };
  }
  if (status === 'unbalanced') {
    return {
      strokeHex: '#F59E0B',
      textClass: 'text-amber-300',
      badgeClass: 'border-amber-500/40 bg-amber-950/30 text-amber-200',
    };
  }
  if (status === 'low_recovery') {
    return {
      strokeHex: '#F43F5E',
      textClass: 'text-rose-400',
      badgeClass: 'border-rose-500/40 bg-rose-950/30 text-rose-200',
    };
  }
  return {
    strokeHex: '#38BDF8',
    textClass: 'text-sky-300',
    badgeClass: 'border-sky-500/35 bg-sky-950/25 text-sky-200',
  };
}

export function HrvStatusCard({ dailyLogs, todayKey }: HrvStatusCardProps) {
  const report = useMemo(
    () => computeHrvStatusReport({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const visuals = getStatusVisuals(report.status);

  // Determine vertical scale safely without NaN
  const numericValues: number[] = [];
  for (const pt of report.points30d) {
    if (pt.dailyHrv !== null) numericValues.push(pt.dailyHrv);
    if (pt.rolling7dAvg !== null) numericValues.push(pt.rolling7dAvg);
  }
  if (report.corridorLow !== null) numericValues.push(report.corridorLow);
  if (report.corridorHigh !== null) numericValues.push(report.corridorHigh);

  const rawMin = numericValues.length > 0 ? Math.min(...numericValues) : 30;
  const rawMax = numericValues.length > 0 ? Math.max(...numericValues) : 90;
  const minYVal = Math.max(10, Math.floor((rawMin - 6) / 5) * 5);
  const maxYVal = Math.ceil((rawMax + 6) / 5) * 5;
  const ySpan = Math.max(15, maxYVal - minYVal);

  const svgW = 680;
  const svgH = 224;
  const padL = 42;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const totalPts = Math.max(1, report.points30d.length);
  const xForIndex = (idx: number) =>
    padL + (totalPts > 1 ? (idx / (totalPts - 1)) * plotW : plotW / 2);
  const yForHrv = (val: number) =>
    padT + plotH - ((val - minYVal) / ySpan) * plotH;

  // Build connected segments for the 7-day rolling average trend line
  const rollingSegments: string[] = [];
  let currentSegment: string[] = [];
  report.points30d.forEach((pt, idx) => {
    if (pt.rolling7dAvg !== null) {
      currentSegment.push(
        `${xForIndex(idx).toFixed(1)},${yForHrv(pt.rolling7dAvg).toFixed(1)}`,
      );
    } else if (currentSegment.length > 0) {
      rollingSegments.push(currentSegment.join(' '));
      currentSegment = [];
    }
  });
  if (currentSegment.length > 0) {
    rollingSegments.push(currentSegment.join(' '));
  }

  // Find latest rolling point for emphasis
  let latestRollingIdx = -1;
  for (let i = report.points30d.length - 1; i >= 0; i -= 1) {
    if (report.points30d[i].rolling7dAvg !== null) {
      latestRollingIdx = i;
      break;
    }
  }

  const activePoint =
    hoveredIdx !== null
      ? report.points30d[hoveredIdx]
      : latestRollingIdx >= 0
        ? report.points30d[latestRollingIdx]
        : null;

  const yTicks = [0, 0.33, 0.66, 1].map((t) =>
    Math.round(minYVal + t * ySpan),
  );

  return (
    <section
      data-testid="hrv-status-card"
      aria-label="HRV Status — Личен 30-дневен базов коридор"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + статус бадж */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Activity
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            />
            <span>
              30-дневен прозорец ({formatBgNumericDate(report.windowStartDate)} –{' '}
              {formatBgNumericDate(report.windowEndDate)})
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {report.samplesCount30d} сутрешни HRV записа
            </span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            📊 HRV Status — Личен 30-дневен базов коридор
          </h2>
        </div>

        <div
          data-testid="hrv-status-badge"
          className={`inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${visuals.badgeClass}`}
        >
          {report.statusLabel}
        </div>
      </div>

      {/* Ключови числени показатели (1 ред, tabular-nums) */}
      <div className="mt-4 grid grid-cols-2 gap-4 border-b border-white/8 pb-4 sm:grid-cols-4">
        <div>
          <div className="text-xs text-slate-400">7-дневна средна HRV</div>
          <div
            data-testid="hrv-7d-avg-value"
            className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-white"
          >
            {report.current7dAvg !== null ? `${report.current7dAvg} ms` : '—'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">Личен коридор (±1 SD)</div>
          <div
            data-testid="hrv-corridor-range"
            className="mt-1 font-mono text-lg font-bold tabular-nums text-emerald-400"
          >
            {report.corridorLow !== null && report.corridorHigh !== null
              ? `${report.corridorLow} – ${report.corridorHigh} ms`
              : `${report.samplesCount30d}/${report.requiredCalibrationSamples} записа`}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">30-дневна база (средно)</div>
          <div className="mt-1 font-mono text-lg font-bold tabular-nums text-slate-200">
            {report.baselineMean30d !== null
              ? `${report.baselineMean30d} ms`
              : '—'}
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-400">Отклонение от базата</div>
          <div
            className={`mt-1 font-mono text-lg font-bold tabular-nums ${visuals.textClass}`}
          >
            {report.deltaFromMeanMs !== null
              ? `${report.deltaFromMeanMs > 0 ? '+' : ''}${report.deltaFromMeanMs} ms`
              : 'Калибриране'}
            {report.deltaFromMeanPct !== null && (
              <span className="ml-1 text-xs font-medium text-slate-400">
                ({report.deltaFromMeanPct > 0 ? '+' : ''}
                {report.deltaFromMeanPct}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Вградена SVG графика: зелена фонова лента за личния коридор + плътна 7-дневна линия */}
      {report.status === 'calibrating' && report.samplesCount30d === 0 ? (
        <div
          data-testid="hrv-calibrating-empty"
          className="mt-4 rounded-xl border border-dashed border-white/15 bg-[#121826] px-4 py-6 text-center"
        >
          <p className="text-sm font-semibold text-white">
            Калибриране на личната HRV база (0 / {report.requiredCalibrationSamples})
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Синхронизирай сутрешния си HRV от часовника чрез Intervals.icu поне 7 дни, за да се изчисли персоналният ти зелен коридор (±1 стандартно отклонение).
          </p>
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-3 text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-4 rounded-xs bg-emerald-500/25 border border-emerald-400/50"
                  aria-hidden="true"
                />
                <span>Зелен базов коридор (±1 SD)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: visuals.strokeHex }}
                  aria-hidden="true"
                />
                <span>7-дневен пълзящ тренд</span>
              </span>
            </div>

            {activePoint && (
              <div className="font-mono text-[11px] tabular-nums text-slate-300">
                {formatBgNumericDate(activePoint.date)}
                {' · '}
                7д средно:{' '}
                <strong className="text-white">
                  {activePoint.rolling7dAvg !== null
                    ? `${activePoint.rolling7dAvg} ms`
                    : '—'}
                </strong>
                {' · '}
                Ден:{' '}
                <span className="text-slate-400">
                  {activePoint.dailyHrv !== null
                    ? `${activePoint.dailyHrv} ms`
                    : 'няма запис'}
                </span>
              </div>
            )}
          </div>

          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="h-auto w-full"
            role="img"
            aria-label="Графика на HRV Status с 30-дневен базов коридор и 7-дневен тренд"
          >
            {/* Референтни хоризонтални линии */}
            {yTicks.map((tickVal) => {
              const y = yForHrv(tickVal);
              return (
                <g key={tickVal}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={svgW - padR}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    className="font-mono tabular-nums"
                  >
                    {tickVal}
                  </text>
                </g>
              );
            })}

            {/* Зелена фонова лента за личния 30-дневен коридор (mean ± 1 SD) */}
            {report.corridorLow !== null && report.corridorHigh !== null && (
              <g>
                <rect
                  data-testid="hrv-corridor-band"
                  x={padL}
                  y={yForHrv(report.corridorHigh)}
                  width={plotW}
                  height={Math.max(
                    4,
                    yForHrv(report.corridorLow) - yForHrv(report.corridorHigh),
                  )}
                  fill="rgba(16, 185, 129, 0.14)"
                  stroke="rgba(16, 185, 129, 0.35)"
                  strokeWidth="1"
                  rx="2"
                />
                {report.baselineMean30d !== null && (
                  <line
                    x1={padL}
                    y1={yForHrv(report.baselineMean30d)}
                    x2={svgW - padR}
                    y2={yForHrv(report.baselineMean30d)}
                    stroke="rgba(16, 185, 129, 0.55)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                )}
              </g>
            )}

            {/* Индивидуални дневни HRV точки (фини маркери) */}
            {report.points30d.map((pt, idx) => {
              if (pt.dailyHrv === null) return null;
              return (
                <circle
                  key={`daily-${pt.date}`}
                  cx={xForIndex(idx)}
                  cy={yForHrv(pt.dailyHrv)}
                  r="2.4"
                  fill="rgba(148, 163, 184, 0.55)"
                />
              );
            })}

            {/* Плътна линия за 7-дневната пълзяща средна стойност */}
            {rollingSegments.map((pts, sIdx) => (
              <polyline
                key={`seg-${sIdx}`}
                data-testid="hrv-rolling-line"
                fill="none"
                stroke={visuals.strokeHex}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pts}
              />
            ))}

            {/* Подчертана последна точка на 7-дневния тренд */}
            {latestRollingIdx >= 0 &&
              report.points30d[latestRollingIdx].rolling7dAvg !== null && (
                <circle
                  cx={xForIndex(latestRollingIdx)}
                  cy={yForHrv(
                    report.points30d[latestRollingIdx].rolling7dAvg!,
                  )}
                  r="4.8"
                  fill={visuals.strokeHex}
                  stroke="#0F141F"
                  strokeWidth="2"
                />
              )}

            {/* Интерактивни зони за преглед по дати + X-етикети през 5 дни */}
            {report.points30d.map((pt, idx) => {
              const x = xForIndex(idx);
              const showLabel =
                idx === 0 ||
                idx === report.points30d.length - 1 ||
                idx % 6 === 0;
              const isHover = hoveredIdx === idx;
              const colW = plotW / totalPts;

              return (
                <g
                  key={`col-${pt.date}`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => setHoveredIdx(idx)}
                  className="cursor-pointer"
                >
                  <rect
                    x={x - colW / 2}
                    y={padT}
                    width={Math.max(8, colW)}
                    height={plotH}
                    fill="transparent"
                  />
                  {isHover && (
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + plotH}
                      stroke="rgba(255,255,255,0.22)"
                      strokeDasharray="2 2"
                    />
                  )}
                  {isHover && pt.rolling7dAvg !== null && (
                    <circle
                      cx={x}
                      cy={yForHrv(pt.rolling7dAvg)}
                      r="4.5"
                      fill="#FFFFFF"
                      stroke={visuals.strokeHex}
                      strokeWidth="2"
                    />
                  )}
                  {showLabel && (
                    <text
                      x={x}
                      y={svgH - 8}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="10"
                      className="font-mono tabular-nums"
                    >
                      {pt.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Интерпретация */}
      <p className="mt-3.5 border-t border-white/8 pt-3.5 text-xs leading-relaxed text-slate-300">
        {report.statusDetail}
      </p>
    </section>
  );
}
