import { useMemo, useState } from 'react';
import type { AcwrZone, DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import { computeAcwrReport } from '../../utils/analysisPrep';
import { formatBgDate, formatBgNumericDate, formatNumberBg, getLocalDateKey } from '../../utils/fitnessMath';

interface AcwrLoadTabProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
}

const ZONE_META: Record<
  AcwrZone,
  {
    color: string;
    textClass: string;
    borderClass: string;
    bgClass: string;
    rangeText: string;
  }
> = {
  undertraining: {
    color: '#38bdf8',
    textClass: 'text-sky-300',
    borderClass: 'border-sky-500/35',
    bgClass: 'bg-sky-950/20',
    rangeText: '< 0.80',
  },
  sweet_spot: {
    color: '#10b981',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/35',
    bgClass: 'bg-emerald-950/20',
    rangeText: '0.80 – 1.30',
  },
  elevated: {
    color: '#f59e0b',
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/35',
    bgClass: 'bg-amber-950/20',
    rangeText: '1.30 – 1.50',
  },
  high_risk: {
    color: '#ef4444',
    textClass: 'text-rose-300',
    borderClass: 'border-rose-500/40',
    bgClass: 'bg-rose-950/20',
    rangeText: '> 1.50',
  },
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngleDeg: number,
  endAngleDeg: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngleDeg);
  const end = polarToCartesian(cx, cy, r, endAngleDeg);
  const largeArc = Math.abs(endAngleDeg - startAngleDeg) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

export function AcwrLoadTab({ hevyWorkouts, dailyLogs }: AcwrLoadTabProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);

  const latestActivityDate = useMemo(() => {
    const dates: string[] = [];
    for (const w of hevyWorkouts) {
      if (w.date) dates.push(w.date);
    }
    for (const d of dailyLogs) {
      if (
        d.date &&
        ((d.cardioDistanceKm ?? 0) > 0 ||
          (d.cardioDurationMinutes ?? 0) > 0 ||
          (d.steps ?? 0) > 0 ||
          (d.activeCalories ?? 0) > 0)
      ) {
        dates.push(d.date);
      }
    }
    dates.sort();
    return dates.length > 0 ? dates[dates.length - 1] : todayKey;
  }, [hevyWorkouts, dailyLogs, todayKey]);

  const [anchorMode, setAnchorMode] = useState<'today' | 'latest'>('today');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const effectiveAnchor =
    anchorMode === 'latest' && latestActivityDate ? latestActivityDate : todayKey;

  const report = useMemo(
    () => computeAcwrReport(hevyWorkouts, dailyLogs, effectiveAnchor),
    [hevyWorkouts, dailyLogs, effectiveAnchor],
  );

  const gaugeMax = 2.2;
  const acwrClamped =
    report.acwr !== null ? Math.max(0, Math.min(gaugeMax, report.acwr)) : 0;
  // Angle goes from 180 deg (left, ACWR=0) to 360 deg (right, ACWR=2.2)
  const acwrToAngle = (val: number) => 180 + (Math.min(gaugeMax, Math.max(0, val)) / gaugeMax) * 180;
  const needleAngle = acwrToAngle(acwrClamped);
  const needleTip = polarToCartesian(160, 152, 96, needleAngle);

  const activeZoneStyle = report.zone ? ZONE_META[report.zone] : null;

  // 28-day SVG trend chart geometry
  const svgW = 760;
  const svgH = 264;
  const padL = 44;
  const padR = 18;
  const padT = 18;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const acwrChartMax = 2.2;

  const yForAcwr = (val: number) => {
    const clamped = Math.max(0, Math.min(acwrChartMax, val));
    return padT + plotH - (clamped / acwrChartMax) * plotH;
  };

  const maxDailyLoad = useMemo(
    () => Math.max(400, ...report.dailySeries28d.map((p) => p.totalLoad)),
    [report.dailySeries28d],
  );

  const acwrLinePath = useMemo(() => {
    const parts: string[] = [];
    report.dailySeries28d.forEach((pt, idx) => {
      if (pt.acwr === null) return;
      const x =
        padL +
        (report.dailySeries28d.length > 1
          ? (idx / (report.dailySeries28d.length - 1)) * plotW
          : plotW / 2);
      const y = yForAcwr(pt.acwr);
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return parts.join(' ');
  }, [report.dailySeries28d, plotW]);

  const hoveredPoint =
    hoveredIdx !== null ? report.dailySeries28d[hoveredIdx] ?? null : null;

  return (
    <div data-testid="tab-acwr-load" className="space-y-6">
      {/* Заглавие и избор на референтна дата */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Съотношение на натоварването (ACWR: 7 дни / 28 дни)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Комбинира силовите серии от Hevy (серии × RPE / обем), кардиото (km/мин) и дневните крачки и активни калории от смарт часовника, за да оцени риска от претрениране.
          </p>
        </div>

        <div
          role="group"
          aria-label="Референтна дата за ACWR"
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 shrink-0"
        >
          <button
            type="button"
            data-testid="acwr-anchor-today"
            onClick={() => setAnchorMode('today')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
              anchorMode === 'today'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Към днес ({formatBgNumericDate(todayKey)})
          </button>
          {latestActivityDate !== todayKey && (
            <button
              type="button"
              data-testid="acwr-anchor-latest"
              onClick={() => setAnchorMode('latest')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                anchorMode === 'latest'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Последен запис ({formatBgNumericDate(latestActivityDate)})
            </button>
          )}
        </div>
      </div>

      {/* Полукръгов SVG Gauge + KPI метрики */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-5">
          <svg
            viewBox="0 0 320 190"
            role="img"
            aria-label="Полукръгов индикатор за ACWR съотношение"
            className="w-full max-w-[320px]"
          >
            {/* 4 зони по дъгата */}
            <path
              d={describeArc(160, 152, 114, acwrToAngle(0), acwrToAngle(0.8))}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="18"
              strokeLinecap="butt"
              opacity="0.85"
            />
            <path
              d={describeArc(160, 152, 114, acwrToAngle(0.8), acwrToAngle(1.3))}
              fill="none"
              stroke="#10b981"
              strokeWidth="18"
              strokeLinecap="butt"
              opacity="0.9"
            />
            <path
              d={describeArc(160, 152, 114, acwrToAngle(1.3), acwrToAngle(1.5))}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="18"
              strokeLinecap="butt"
              opacity="0.9"
            />
            <path
              d={describeArc(160, 152, 114, acwrToAngle(1.5), acwrToAngle(gaugeMax))}
              fill="none"
              stroke="#ef4444"
              strokeWidth="18"
              strokeLinecap="butt"
              opacity="0.9"
            />

            {/* Деления */}
            {[0, 0.8, 1.3, 1.5, 2.2].map((mark) => {
              const ang = acwrToAngle(mark);
              const outer = polarToCartesian(160, 152, 134, ang);
              return (
                <text
                  key={mark}
                  x={outer.x}
                  y={outer.y + 3}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={10}
                  className="font-mono"
                >
                  {mark}
                </text>
              );
            })}

            {/* Стрелка */}
            {report.acwr !== null && (
              <>
                <line
                  x1="160"
                  y1="152"
                  x2={needleTip.x}
                  y2={needleTip.y}
                  stroke="#f8fafc"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="160" cy="152" r="6" fill="#f8fafc" />
              </>
            )}

            <text
              x="160"
              y="124"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="30"
              fontWeight="700"
              className="font-mono tabular-nums"
              data-testid="acwr-gauge-value"
            >
              {report.acwr !== null ? report.acwr.toFixed(2) : '—'}
            </text>
            <text
              x="160"
              y="176"
              textAnchor="middle"
              fill={activeZoneStyle ? activeZoneStyle.color : '#94a3b8'}
              fontSize="12"
              fontWeight="600"
            >
              {report.zoneLabel}
            </text>
          </svg>

          <p className="mt-2 text-center text-xs leading-relaxed text-slate-300">
            {report.zoneAdvice}
          </p>
        </div>

        {/* Обяснителни карти + Acute vs Chronic числа */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-4">
              <div className="text-xs text-slate-400">Остро (Acute, 7 дни)</div>
              <div
                data-testid="acwr-acute-load"
                className="mt-1.5 font-mono text-xl font-bold tabular-nums text-white"
              >
                {formatNumberBg(report.acuteLoad7d)} AU
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Сума на натоварването за посл. 7 дни
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-4">
              <div className="text-xs text-slate-400">
                Хронично (Chronic, 28 д.)
              </div>
              <div
                data-testid="acwr-chronic-load"
                className="mt-1.5 font-mono text-xl font-bold tabular-nums text-white"
              >
                {formatNumberBg(report.chronicWeeklyAvg28d)} AU
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Средно седмично за посл. 28 дни
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-4">
              <div className="text-xs text-slate-400">Сила / Кардио (28 д.)</div>
              <div className="mt-1.5 font-mono text-xl font-bold tabular-nums text-white">
                {report.strengthSharePct}% / {report.cardioSharePct}%
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Дял в общия тренировъчен стрес
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5">
            <h3 className="font-display text-sm font-bold text-white">
              Цветови зони за управление на риска
            </h3>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-xl border border-sky-500/25 bg-sky-950/15 px-3.5 py-2.5 text-xs">
                <div className="font-mono font-bold text-sky-300">
                  &lt; 0.8 · Недостатъчно натоварване
                </div>
                <div className="mt-0.5 text-slate-400">
                  Риск от загуба на адаптация и спад във формата.
                </div>
              </div>
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 px-3.5 py-2.5 text-xs">
                <div className="font-mono font-bold text-emerald-300">
                  0.8 – 1.3 · Оптимална зона (Sweet Spot)
                </div>
                <div className="mt-0.5 text-slate-400">
                  Най-сигурният диапазон за мускулен и силов прогрес.
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-3.5 py-2.5 text-xs">
                <div className="font-mono font-bold text-amber-300">
                  1.3 – 1.5 · Повишено натоварване
                </div>
                <div className="mt-0.5 text-slate-400">
                  Изисква отличен сън, хранене и внимание към ставите.
                </div>
              </div>
              <div className="rounded-xl border border-rose-500/30 bg-rose-950/15 px-3.5 py-2.5 text-xs">
                <div className="font-mono font-bold text-rose-300">
                  &gt; 1.5 · Червена зона (Висок риск)
                </div>
                <div className="mt-0.5 text-slate-400">
                  Остър скок спрямо 4-седмичната база — висок риск от претрениране.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 28-дневна SVG графика на тренда */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-white">
              28-дневен тренд на ACWR и дневно натоварване
            </h3>
            <p className="text-xs text-slate-400">
              Линията показва динамиката на ACWR спрямо цветовите зони, а стълбовете отдолу — дневното силово и кардио натоварване.
            </p>
          </div>
          {hoveredPoint && (
            <div className="font-mono text-xs tabular-nums text-slate-200">
              {formatBgDate(hoveredPoint.date)} · ACWR:{' '}
              <span className="font-bold text-white">
                {hoveredPoint.acwr !== null ? hoveredPoint.acwr.toFixed(2) : '—'}
              </span>{' '}
              · Сила: {hoveredPoint.strengthLoad} AU · Кардио:{' '}
              {hoveredPoint.cardioLoad} AU
            </div>
          )}
        </div>

        <div className="mt-4">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            role="img"
            aria-label="28-дневна графика на ACWR и дневно натоварване"
            className="w-full"
          >
            {/* Фонови зони */}
            <rect
              x={padL}
              y={yForAcwr(acwrChartMax)}
              width={plotW}
              height={yForAcwr(1.5) - yForAcwr(acwrChartMax)}
              fill="rgba(239, 68, 68, 0.1)"
            />
            <rect
              x={padL}
              y={yForAcwr(1.5)}
              width={plotW}
              height={yForAcwr(1.3) - yForAcwr(1.5)}
              fill="rgba(245, 158, 11, 0.1)"
            />
            <rect
              x={padL}
              y={yForAcwr(1.3)}
              width={plotW}
              height={yForAcwr(0.8) - yForAcwr(1.3)}
              fill="rgba(16, 185, 129, 0.12)"
            />
            <rect
              x={padL}
              y={yForAcwr(0.8)}
              width={plotW}
              height={yForAcwr(0) - yForAcwr(0.8)}
              fill="rgba(56, 189, 248, 0.06)"
            />

            {/* Хоризонтални линии по ACWR */}
            {[0, 0.8, 1.3, 1.5, 2.0].map((tick) => {
              const y = yForAcwr(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray={tick === 0 ? undefined : '3 3'}
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize={10}
                    className="font-mono"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* Дневни стълбове натоварване (до 35% от височината на графиката) */}
            {report.dailySeries28d.map((pt, idx) => {
              const xCenter =
                padL +
                (report.dailySeries28d.length > 1
                  ? (idx / (report.dailySeries28d.length - 1)) * plotW
                  : plotW / 2);
              const barMaxH = plotH * 0.35;
              const sH = (pt.strengthLoad / maxDailyLoad) * barMaxH;
              const cH = (pt.cardioLoad / maxDailyLoad) * barMaxH;
              const baseLine = padT + plotH;

              return (
                <g key={pt.date}>
                  {sH > 0 && (
                    <rect
                      x={xCenter - 6}
                      y={baseLine - sH}
                      width={12}
                      height={sH}
                      rx={2}
                      fill="rgba(59, 130, 246, 0.45)"
                    />
                  )}
                  {cH > 0 && (
                    <rect
                      x={xCenter - 6}
                      y={baseLine - sH - cH}
                      width={12}
                      height={cH}
                      rx={2}
                      fill="rgba(249, 115, 22, 0.55)"
                    />
                  )}
                </g>
              );
            })}

            {/* ACWR крива */}
            {acwrLinePath && (
              <path
                d={acwrLinePath}
                fill="none"
                stroke="#f8fafc"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}

            {/* Интерактивни точки и X-оси */}
            {report.dailySeries28d.map((pt, idx) => {
              const xCenter =
                padL +
                (report.dailySeries28d.length > 1
                  ? (idx / (report.dailySeries28d.length - 1)) * plotW
                  : plotW / 2);
              const showLabel = idx % 4 === 0 || idx === report.dailySeries28d.length - 1;
              const ptColor =
                pt.acwr === null
                  ? '#64748b'
                  : pt.acwr < 0.8
                    ? '#38bdf8'
                    : pt.acwr <= 1.3
                      ? '#10b981'
                      : pt.acwr <= 1.5
                        ? '#f59e0b'
                        : '#ef4444';

              return (
                <g
                  key={pt.date}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <rect
                    x={xCenter - 11}
                    y={padT}
                    width={22}
                    height={plotH}
                    fill="transparent"
                    className="cursor-crosshair"
                  />
                  {pt.acwr !== null && (
                    <circle
                      cx={xCenter}
                      cy={yForAcwr(pt.acwr)}
                      r={hoveredIdx === idx ? 5.5 : 3.2}
                      fill={ptColor}
                      stroke="#0F141F"
                      strokeWidth="1.5"
                    />
                  )}
                  {showLabel && (
                    <text
                      x={xCenter}
                      y={svgH - 10}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize={10}
                      className="font-mono"
                    >
                      {pt.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-blue-500/60" />
            <span>Силово натоварване (Hevy)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-orange-500/65" />
            <span>Кардио натоварване</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-white" />
            <span>ACWR тренд (дясна скала 0.0–2.2)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
