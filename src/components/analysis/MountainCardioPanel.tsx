import { useMemo, useState } from 'react';
import type { DailyBiometricLog } from '../../types/fitness';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';
import {
  computeMountainCardioReport,
  formatPaceMinPerKm,
  type WatchActivityCategory,
} from '../../utils/mountainCardioEngine';

interface MountainCardioPanelProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
  onNavigateToCheckin: () => void;
}

type ActivityFilter = 'all' | WatchActivityCategory;

export function MountainCardioPanel({
  dailyLogs,
  todayKey,
  onNavigateToCheckin,
}: MountainCardioPanelProps) {
  const [windowDays, setWindowDays] = useState<60 | 90>(90);
  const [categoryFilter, setCategoryFilter] = useState<ActivityFilter>('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const report = useMemo(
    () =>
      computeMountainCardioReport({
        dailyLogs,
        todayKey,
        windowDays,
      }),
    [dailyLogs, todayKey, windowDays],
  );

  const filteredActivities = useMemo(() => {
    if (categoryFilter === 'all') return report.recentActivities;
    return report.recentActivities.filter((a) => a.category === categoryFilter);
  }, [report.recentActivities, categoryFilter]);

  const efPoints = report.efTrendPoints;

  // SVG chart geometry for Cardiac Efficiency Factor (EF)
  const svgW = 780;
  const svgH = 230;
  const padL = 46;
  const padR = 24;
  const padT = 22;
  const padB = 34;
  const innerW = svgW - padL - padR;
  const innerH = svgH - padT - padB;

  const chartGeom = useMemo(() => {
    if (efPoints.length === 0) return null;
    const values = efPoints.map((p) => p.ef);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const spread = Math.max(8, rawMax - rawMin);
    const yMin = Math.max(0, Math.floor(rawMin - spread * 0.18));
    const yMax = Math.ceil(rawMax + spread * 0.18);
    const yRange = Math.max(1, yMax - yMin);

    const coords = efPoints.map((pt, idx) => {
      const x =
        efPoints.length === 1
          ? padL + innerW / 2
          : padL + (idx / (efPoints.length - 1)) * innerW;
      const y = padT + innerH - ((pt.ef - yMin) / yRange) * innerH;
      return { x, y, pt };
    });

    const linePath = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const areaPath =
      coords.length >= 2
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
        : '';

    // Linear regression trend line across EF points
    let trendLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
    if (coords.length >= 3) {
      const n = coords.length;
      const sumX = coords.reduce((s, _, i) => s + i, 0);
      const sumY = coords.reduce((s, c) => s + c.pt.ef, 0);
      const sumXY = coords.reduce((s, c, i) => s + i * c.pt.ef, 0);
      const sumXX = coords.reduce((s, _, i) => s + i * i, 0);
      const denom = n * sumXX - sumX * sumX;
      if (denom !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denom;
        const intercept = (sumY - slope * sumX) / n;
        const startEf = intercept;
        const endEf = intercept + slope * (n - 1);
        const clampY = (val: number) =>
          padT + innerH - ((Math.max(yMin, Math.min(yMax, val)) - yMin) / yRange) * innerH;
        trendLine = {
          x1: coords[0].x,
          y1: clampY(startEf),
          x2: coords[n - 1].x,
          y2: clampY(endEf),
        };
      }
    }

    const ticks = [yMin, Math.round((yMin + yMax) / 2), yMax];

    return { coords, linePath, areaPath, trendLine, ticks, yMin, yMax, yRange };
  }, [efPoints, innerW, innerH]);

  const activePoint =
    hoveredIdx !== null && efPoints[hoveredIdx]
      ? efPoints[hoveredIdx]
      : efPoints.length > 0
        ? efPoints[efPoints.length - 1]
        : null;

  const efToneClass =
    report.efTrendStatus === 'improving'
      ? 'text-emerald-400'
      : report.efTrendStatus === 'declining'
        ? 'text-amber-300'
        : 'text-sky-300';

  const efStrokeColor =
    report.efTrendStatus === 'improving'
      ? '#10b981'
      : report.efTrendStatus === 'declining'
        ? '#f59e0b'
        : '#38bdf8';

  if (report.totalActivitiesCount === 0) {
    return (
      <div
        data-testid="mountain-cardio-empty"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center"
      >
        <h2 className="font-display text-lg font-bold text-white">
          🏔️ Все още няма синхронизирани планински и кардио активности
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">
          Синхронизирай смарт часовника си през Intervals.icu в „Дневен запис“ — системата автоматично ще извлече преходи, планински бягания, колоездене и зимни спускания (VAM, аеробна ефективност EF и лични рекорди).
        </p>
        <button
          type="button"
          onClick={onNavigateToCheckin}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap"
        >
          Към „Дневен запис“ и синхронизация
        </button>
      </div>
    );
  }

  return (
    <div data-testid="mountain-cardio-panel" className="space-y-6">
      {/* 1. Горни 4 ключови метрики (VAM, EF, 30д денивелация, 30д дистанция) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          data-testid="mountain-kpi-vam"
          className="rounded-xl border border-white/10 bg-[#0F141F] p-4"
        >
          <div className="text-xs font-medium text-slate-400">
            Вертикална скорост (VAM)
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-white">
            {report.avgVamMetersPerHour !== null
              ? `${formatNumberBg(report.avgVamMetersPerHour)} м/ч`
              : '—'}
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
            {report.bestVamMetersPerHour !== null
              ? `Рекорд: ${formatNumberBg(report.bestVamMetersPerHour)} м/ч (${report.bestVamDate ? formatBgDate(report.bestVamDate) : ''})`
              : 'Нужно е изкачване ≥ 100 м'}
          </div>
        </div>

        <div
          data-testid="mountain-kpi-ef"
          className="rounded-xl border border-white/10 bg-[#0F141F] p-4"
        >
          <div className="text-xs font-medium text-slate-400">
            Сърдечна ефективност (EF)
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-white">
              {report.latestEf !== null ? report.latestEf.toFixed(1) : '—'}
            </span>
            {report.efTrendPct !== null && (
              <span className={`font-mono text-xs font-semibold tabular-nums ${efToneClass}`}>
                {report.efTrendPct >= 0 ? '+' : ''}
                {report.efTrendPct}% ({windowDays} д.)
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Темпо + денивелация спрямо ср. пулс
          </div>
        </div>

        <div
          data-testid="mountain-kpi-elevation-30d"
          className="rounded-xl border border-white/10 bg-[#0F141F] p-4"
        >
          <div className="text-xs font-medium text-slate-400">
            Изкачена денивелация (30 д.)
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            +{formatNumberBg(report.totalElevation30dM)} м
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
            {report.activities30dCount} активности последния месец
          </div>
        </div>

        <div
          data-testid="mountain-kpi-distance-30d"
          className="rounded-xl border border-white/10 bg-[#0F141F] p-4"
        >
          <div className="text-xs font-medium text-slate-400">
            Кардио обем (30 дни)
          </div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums text-white">
            {formatNumberBg(report.totalDistance30dKm)} км
          </div>
          <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
            {formatNumberBg(report.totalAerobicMinutes30d)} мин. в движение
          </div>
        </div>
      </div>

      {/* 2. SVG Графика: Индекс на сърдечна ефективност (EF) за 60–90 дни */}
      <div
        data-testid="mountain-ef-chart-card"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-white">
              📈 Тренд на аеробната ефективност (EF) — последни {windowDays} дни
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {report.efTrendLabel}
            </p>
          </div>

          <div
            role="group"
            aria-label="Период за графиката на сърдечна ефективност"
            className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 self-start sm:self-auto"
          >
            {([60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                data-testid={`mountain-window-${days}`}
                onClick={() => {
                  setWindowDays(days);
                  setHoveredIdx(null);
                }}
                className={`h-7 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  windowDays === days
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {days} дни
              </button>
            ))}
          </div>
        </div>

        {!chartGeom || efPoints.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            За визуализация на EF тренда са нужни активности от часовника с отчетен среден пулс (average_heartrate).
          </div>
        ) : (
          <>
            {activePoint && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                <span className="font-semibold text-white">
                  {formatBgDate(activePoint.date)} · {activePoint.activityName}
                </span>
                <span className="font-mono tabular-nums text-emerald-400">
                  EF: {activePoint.ef.toFixed(1)}
                </span>
                <span className="font-mono tabular-nums text-slate-300">
                  Ср. пулс: {activePoint.averageHeartrate} bpm
                </span>
                {activePoint.distanceKm > 0 && (
                  <span className="font-mono tabular-nums text-slate-400">
                    {formatNumberBg(activePoint.distanceKm)} км
                  </span>
                )}
                {activePoint.elevationGainM > 0 && (
                  <span className="font-mono tabular-nums text-slate-400">
                    +{formatNumberBg(activePoint.elevationGainM)} м
                  </span>
                )}
                {activePoint.vam !== null && (
                  <span className="font-mono tabular-nums text-sky-300">
                    VAM: {formatNumberBg(activePoint.vam)} м/ч
                  </span>
                )}
              </div>
            )}

            <div className="mt-3 overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                role="img"
                aria-label="Тренд на индекса на сърдечна ефективност (EF)"
                className="w-full min-w-[540px]"
              >
                <defs>
                  <linearGradient id="efAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={efStrokeColor} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={efStrokeColor} stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {/* Horizontal gridlines + Y labels */}
                {chartGeom.ticks.map((tick) => {
                  const y =
                    padT +
                    innerH -
                    ((tick - chartGeom.yMin) / chartGeom.yRange) * innerH;
                  return (
                    <g key={tick}>
                      <line
                        x1={padL}
                        x2={svgW - padR}
                        y1={y}
                        y2={y}
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize={10}
                        className="font-mono"
                      >
                        {tick}
                      </text>
                    </g>
                  );
                })}

                {/* Area fill */}
                {chartGeom.areaPath && (
                  <path d={chartGeom.areaPath} fill="url(#efAreaGrad)" />
                )}

                {/* Linear trend line */}
                {chartGeom.trendLine && (
                  <line
                    x1={chartGeom.trendLine.x1}
                    y1={chartGeom.trendLine.y1}
                    x2={chartGeom.trendLine.x2}
                    y2={chartGeom.trendLine.y2}
                    stroke="#f8fafc"
                    strokeOpacity="0.4"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                  />
                )}

                {/* EF Line */}
                <path
                  d={chartGeom.linePath}
                  fill="none"
                  stroke={efStrokeColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data points + X axis date labels */}
                {chartGeom.coords.map((c, idx) => {
                  const showLabel =
                    chartGeom.coords.length <= 8 ||
                    idx === 0 ||
                    idx === chartGeom.coords.length - 1 ||
                    idx % Math.ceil(chartGeom.coords.length / 6) === 0;
                  const isFocused =
                    hoveredIdx === idx ||
                    (hoveredIdx === null && idx === chartGeom.coords.length - 1);

                  return (
                    <g
                      key={`${c.pt.date}_${idx}`}
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onFocus={() => setHoveredIdx(idx)}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={isFocused ? 5.5 : 3.5}
                        fill={isFocused ? '#ffffff' : efStrokeColor}
                        stroke={efStrokeColor}
                        strokeWidth={isFocused ? 2.5 : 1.5}
                      />
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={12}
                        fill="transparent"
                      />
                      {showLabel && (
                        <text
                          x={c.x}
                          y={svgH - 10}
                          textAnchor="middle"
                          fill="#94a3b8"
                          fontSize={10}
                          className="font-mono"
                        >
                          {c.pt.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </>
        )}
      </div>

      {/* 3. Зала на славата — Автоматични лични рекорди от часовника */}
      <div
        data-testid="mountain-hall-of-fame"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="border-b border-white/10 pb-3.5">
          <h2 className="font-display text-base font-bold text-white">
            🏅 Зала на славата — автоматични рекорди от часовника
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Извлечени автоматично от всички синхронизирани бягания, планински преходи и зимни спускания.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* Best Pace >= 1 km */}
          <div
            data-testid="hof-pace-1km"
            className="rounded-xl border border-white/8 bg-[#141B27] p-4"
          >
            <div className="text-[11px] font-medium text-slate-400">
              Най-добро темпо (≥ 1 км)
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-emerald-400">
              {report.hallOfFame.bestPace1Km
                ? report.hallOfFame.bestPace1Km.paceFormatted
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {report.hallOfFame.bestPace1Km
                ? `${formatNumberBg(report.hallOfFame.bestPace1Km.distanceKm)} км · ${formatBgDate(report.hallOfFame.bestPace1Km.date)}`
                : 'Няма бягане ≥ 1 км'}
            </div>
          </div>

          {/* Best Pace >= 3 km */}
          <div
            data-testid="hof-pace-3km"
            className="rounded-xl border border-white/8 bg-[#141B27] p-4"
          >
            <div className="text-[11px] font-medium text-slate-400">
              Най-добро темпо (≥ 3 км)
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-sky-300">
              {report.hallOfFame.bestPace3Km
                ? report.hallOfFame.bestPace3Km.paceFormatted
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {report.hallOfFame.bestPace3Km
                ? `${formatNumberBg(report.hallOfFame.bestPace3Km.distanceKm)} км · ${formatBgDate(report.hallOfFame.bestPace3Km.date)}`
                : 'Няма бягане ≥ 3 км'}
            </div>
          </div>

          {/* Max single-hike elevation */}
          <div
            data-testid="hof-max-elevation"
            className="rounded-xl border border-white/8 bg-[#141B27] p-4"
          >
            <div className="text-[11px] font-medium text-slate-400">
              Макс. денивелация в 1 преход
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-white">
              {report.hallOfFame.maxSingleElevation
                ? `+${formatNumberBg(report.hallOfFame.maxSingleElevation.elevationGainM)} м`
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {report.hallOfFame.maxSingleElevation
                ? `${report.hallOfFame.maxSingleElevation.name} · ${formatBgDate(report.hallOfFame.maxSingleElevation.date)}`
                : 'Няма записана денивелация'}
            </div>
          </div>

          {/* Longest hike */}
          <div
            data-testid="hof-longest-hike"
            className="rounded-xl border border-white/8 bg-[#141B27] p-4"
          >
            <div className="text-[11px] font-medium text-slate-400">
              Най-дълъг преход
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-white">
              {report.hallOfFame.longestHike
                ? `${formatNumberBg(report.hallOfFame.longestHike.distanceKm)} км`
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {report.hallOfFame.longestHike
                ? `+${formatNumberBg(report.hallOfFame.longestHike.elevationGainM)} м · ${formatBgDate(report.hallOfFame.longestHike.date)}`
                : 'Няма записан преход'}
            </div>
          </div>

          {/* Max winter downhill speed */}
          <div
            data-testid="hof-winter-speed"
            className="rounded-xl border border-white/8 bg-[#141B27] p-4"
          >
            <div className="text-[11px] font-medium text-slate-400">
              Макс. скорост (Ски / Сноуборд)
            </div>
            <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-amber-300">
              {report.hallOfFame.maxWinterSpeed
                ? `${formatNumberBg(report.hallOfFame.maxWinterSpeed.maxSpeedKmh)} км/ч`
                : '—'}
            </div>
            <div className="mt-1 text-[11px] text-slate-400 truncate">
              {report.hallOfFame.maxWinterSpeed
                ? `${report.hallOfFame.maxWinterSpeed.typeLabelBg} · ${formatBgDate(report.hallOfFame.maxWinterSpeed.date)}`
                : 'Очаква зимни спускания'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Списък на последните планински преходи и бягания */}
      <div
        data-testid="mountain-recent-activities"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-white">
              🥾 Последни планински преходи, бягания и кардио ({filteredActivities.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Дата, дистанция, изкачване (+D м), вертикална скорост (VAM), пулс и изгорени калории.
            </p>
          </div>

          <div
            role="group"
            aria-label="Филтър по тип активност"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 self-start sm:self-auto"
          >
            {(
              [
                { id: 'all', label: 'Всички' },
                { id: 'mountain', label: 'Планина' },
                { id: 'run', label: 'Бягане' },
                { id: 'ride_ski', label: 'Колело / Ски' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategoryFilter(opt.id)}
                className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  categoryFilter === opt.id
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {filteredActivities.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-400">
            Няма записани активности в избраната категория.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-medium text-slate-400">
                  <th className="py-2 pr-3">Дата</th>
                  <th className="py-2 pr-3">Активност</th>
                  <th className="py-2 pr-3 text-right">Дистанция</th>
                  <th className="py-2 pr-3 text-right">Денивелация</th>
                  <th className="py-2 pr-3 text-right">VAM / Темпо</th>
                  <th className="py-2 pr-3 text-right">Ср. пулс</th>
                  <th className="py-2 text-right">Калории</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredActivities.map((act) => (
                  <tr
                    key={act.key}
                    className="h-11 transition-colors hover:bg-white/[0.02]"
                  >
                    <td className="py-2 pr-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {formatBgDate(act.date)}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-white">{act.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {act.typeLabelBg}
                        {act.movingTimeMin > 0 ? ` · ${act.movingTimeMin} мин` : ''}
                        {act.maxSpeedKmh !== null && act.category === 'ride_ski'
                          ? ` · макс. ${formatNumberBg(act.maxSpeedKmh)} км/ч`
                          : ''}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono font-semibold tabular-nums text-white whitespace-nowrap">
                      {act.distanceKm > 0 ? `${formatNumberBg(act.distanceKm)} км` : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                      {act.elevationGainM > 0
                        ? `+${formatNumberBg(act.elevationGainM)} м`
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-sky-300 whitespace-nowrap">
                      {act.vamMetersPerHour !== null
                        ? `${formatNumberBg(act.vamMetersPerHour)} м/ч`
                        : act.paceSecPerKm !== null
                          ? formatPaceMinPerKm(act.paceSecPerKm)
                          : '—'}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {act.averageHeartrate !== null
                        ? `${act.averageHeartrate} bpm`
                        : '—'}
                    </td>
                    <td className="py-2 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      {act.calories !== null
                        ? `${formatNumberBg(act.calories)} kcal`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
