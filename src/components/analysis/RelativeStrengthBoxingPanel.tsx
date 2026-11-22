import { useEffect, useMemo, useState } from 'react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import { formatBgDate, formatNumberBg, getLocalDateKey } from '../../utils/fitnessMath';
import {
  analyzeRelativeStrengthAndBoxing,
  type RelativeMovementId,
} from '../../utils/relativeStrengthAndBiorhythm';

interface RelativeStrengthBoxingPanelProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profileWeightKg: number | '';
  analysisManualWeightKg?: number;
  targetWeight?: number;
  onSaveTargetWeight: (weightKg: number | undefined) => Promise<void>;
  onNavigateToHevy?: () => void;
  onNavigateToCheckin?: () => void;
}

interface ChartPoint {
  date: string;
  shortDate: string;
  ratio: number;
  bodyWeightKg: number;
  subtitle: string;
  weightNote: string;
}

function formatShortDateBg(dateKey: string): string {
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  return `${Number(parts[2])}.${Number(parts[1])}`;
}

function formatSignedDelta(value: number, unit: string, decimals = 1): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (Math.abs(value) < 0.05) return `0.0 ${unit}`;
  return `${value > 0 ? '+' : '-'}${fixed} ${unit}`;
}

export function RelativeStrengthBoxingPanel({
  hevyWorkouts,
  dailyLogs,
  profileWeightKg,
  analysisManualWeightKg,
  targetWeight,
  onSaveTargetWeight,
  onNavigateToHevy,
  onNavigateToCheckin,
}: RelativeStrengthBoxingPanelProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const [windowDays, setWindowDays] = useState<60 | 90>(90);
  const [selectedSeries, setSelectedSeries] = useState<'composite' | RelativeMovementId>(
    'composite',
  );
  const [selectedPointIdx, setSelectedPointIdx] = useState<number | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);

  const [targetInput, setTargetInput] = useState<string>(() =>
    targetWeight !== undefined ? String(targetWeight) : '',
  );
  const [savingTarget, setSavingTarget] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  useEffect(() => {
    setTargetInput(targetWeight !== undefined ? String(targetWeight) : '');
  }, [targetWeight]);

  const fallbackWeightKg = useMemo(() => {
    if (typeof profileWeightKg === 'number' && Number.isFinite(profileWeightKg)) {
      return profileWeightKg;
    }
    if (
      typeof analysisManualWeightKg === 'number' &&
      Number.isFinite(analysisManualWeightKg)
    ) {
      return analysisManualWeightKg;
    }
    return null;
  }, [profileWeightKg, analysisManualWeightKg]);

  const report = useMemo(
    () =>
      analyzeRelativeStrengthAndBoxing({
        hevyWorkouts,
        dailyLogs,
        fallbackWeightKg,
        targetWeightKg: targetWeight ?? null,
        todayKey,
        windowDays,
      }),
    [
      hevyWorkouts,
      dailyLogs,
      fallbackWeightKg,
      targetWeight,
      todayKey,
      windowDays,
    ],
  );

  // Reset selected series if a movement is no longer available
  const effectiveSeries = useMemo<'composite' | RelativeMovementId>(() => {
    if (selectedSeries === 'composite') return 'composite';
    return report.movements.some((m) => m.id === selectedSeries)
      ? selectedSeries
      : 'composite';
  }, [selectedSeries, report.movements]);

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (effectiveSeries === 'composite') {
      return report.compositeSeriesInWindow.map((pt) => ({
        date: pt.date,
        shortDate: formatShortDateBg(pt.date),
        ratio: pt.ratio,
        bodyWeightKg: pt.bodyWeightKg,
        subtitle: pt.triggerLabel,
        weightNote: `Тегло: ${formatNumberBg(pt.bodyWeightKg)} kg · ${pt.activeMovementsCount} движ.`,
      }));
    }

    const mov = report.movements.find((m) => m.id === effectiveSeries);
    if (!mov) return [];
    return mov.pointsInWindow.map((pt) => {
      const weightSourceText =
        pt.weightSource === 'exact'
          ? `точно тегло ${formatNumberBg(pt.bodyWeightKg)} kg`
          : pt.weightSource === 'nearest_7d' && pt.weightDayOffset !== null
            ? `най-близко тегло ${formatNumberBg(pt.bodyWeightKg)} kg (${
                pt.weightDayOffset > 0 ? `+${pt.weightDayOffset}` : pt.weightDayOffset
              } д.)`
            : `последно тегло ${formatNumberBg(pt.bodyWeightKg)} kg`;

      return {
        date: pt.date,
        shortDate: formatShortDateBg(pt.date),
        ratio: pt.ratio,
        bodyWeightKg: pt.bodyWeightKg,
        subtitle: pt.detailText,
        weightNote: weightSourceText,
      };
    });
  }, [effectiveSeries, report.compositeSeriesInWindow, report.movements]);

  useEffect(() => {
    setSelectedPointIdx(null);
  }, [effectiveSeries, windowDays]);

  const activeMovement = useMemo(
    () =>
      effectiveSeries === 'composite'
        ? null
        : report.movements.find((m) => m.id === effectiveSeries) ?? null,
    [effectiveSeries, report.movements],
  );

  const seriesStats = useMemo(() => {
    if (chartPoints.length === 0) {
      return {
        startRatio: null,
        latestRatio: null,
        deltaRatio: null,
        deltaPct: null,
      };
    }
    const latestRatio = chartPoints[chartPoints.length - 1].ratio;
    if (chartPoints.length < 2) {
      return {
        startRatio: null,
        latestRatio,
        deltaRatio: null,
        deltaPct: null,
      };
    }
    const startRatio = chartPoints[0].ratio;
    const deltaRatio = Math.round((latestRatio - startRatio) * 100) / 100;
    const deltaPct =
      startRatio > 0 ? Math.round((deltaRatio / startRatio) * 1000) / 10 : null;
    return { startRatio, latestRatio, deltaRatio, deltaPct };
  }, [chartPoints]);

  // SVG Geometry
  const svgW = 760;
  const svgH = 240;
  const padL = 52;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const chartGeometry = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const ratios = chartPoints.map((p) => p.ratio);
    const rawMin = Math.min(...ratios);
    const rawMax = Math.max(...ratios);
    const span = Math.max(0.12, rawMax - rawMin);
    const yMin = Math.max(0, Math.floor((rawMin - span * 0.2) * 20) / 20);
    const yMax = Math.ceil((rawMax + span * 0.2) * 20) / 20;
    const ySpan = Math.max(0.05, yMax - yMin);

    const coords = chartPoints.map((pt, idx) => {
      const x =
        chartPoints.length === 1
          ? padL + plotW / 2
          : padL + (idx / (chartPoints.length - 1)) * plotW;
      const y = padT + (1 - (pt.ratio - yMin) / ySpan) * plotH;
      return { x, y, pt, idx };
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      coords.length >= 2
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
        : '';

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const val = yMin + t * ySpan;
      const y = padT + (1 - t) * plotH;
      return { val, y };
    });

    const xLabelStep = Math.max(1, Math.ceil(coords.length / 7));

    return { coords, linePath, areaPath, yTicks, xLabelStep };
  }, [chartPoints, plotW, plotH]);

  const activePoint =
    selectedPointIdx !== null && chartPoints[selectedPointIdx]
      ? chartPoints[selectedPointIdx]
      : chartPoints.length > 0
        ? chartPoints[chartPoints.length - 1]
        : null;

  async function handleSaveTargetSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = targetInput.trim().replace(',', '.');
    let nextVal: number | undefined;

    if (cleaned === '') {
      nextVal = undefined;
    } else {
      const parsed = Number(cleaned);
      if (!Number.isFinite(parsed) || parsed < 30 || parsed > 250) {
        setSaveFeedback('Въведи валидно целево тегло между 30 и 250 kg.');
        return;
      }
      nextVal = Math.round(parsed * 10) / 10;
    }

    setSavingTarget(true);
    setSaveFeedback(null);
    try {
      await onSaveTargetWeight(nextVal);
      setSaveFeedback(
        nextVal !== undefined
          ? `Целевото тегло (${nextVal.toFixed(1)} kg) е записано.`
          : 'Целевото тегло е изчистено.',
      );
    } finally {
      setSavingTarget(false);
    }
  }

  const verdictColorClass =
    report.trendVerdict === 'gaining'
      ? 'text-emerald-400'
      : report.trendVerdict === 'declining'
        ? 'text-rose-400'
        : report.trendVerdict === 'stable'
          ? 'text-sky-300'
          : 'text-slate-400';

  const displayedClasses = showAllClasses
    ? report.boxingWeight.allClasses
    : report.boxingWeight.nearestClasses;

  return (
    <div
      data-testid="module-relative-strength-boxing"
      className="space-y-6"
    >
      {/* Горна секция: Заглавие + Избор на период */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white sm:text-xl">
            ⚖️ Относителна сила и боксова категория
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Свързва всяка силова тренировка от Hevy със сутрешното лично тегло за деня (или най-близкото в ±7 дни), за да покаже дали качваш реална сила килограм за килограм.
            {report.excludedBoxingWorkoutsCount > 0 && (
              <span className="ml-1 text-slate-500">
                Изключени са {report.excludedBoxingWorkoutsCount} боксови сесии.
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0F141F] p-1 shrink-0">
          {([60, 90] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                windowDays === days
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              Последни {days} дни
            </button>
          ))}
        </div>
      </div>

      {/* Основен 2-колонен layout: SVG тренд (ляво) + Боксова категория и тегло (дясно) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ЛЯВА КОЛОНА: SVG тренд на относителната сила */}
        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-8">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-medium text-slate-400">
                {activeMovement
                  ? `${activeMovement.label} · ${
                      activeMovement.category === 'bodyweight'
                        ? '(Тегло + добавена) / Тегло'
                        : '1RM / Лично тегло'
                    }`
                  : `Общ индекс на относителна сила (последни ${windowDays} дни)`}
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-2xl font-bold tabular-nums text-white">
                  {seriesStats.latestRatio !== null
                    ? `${seriesStats.latestRatio.toFixed(2)}x BW`
                    : '—'}
                </span>
                {seriesStats.deltaRatio !== null && seriesStats.deltaPct !== null && (
                  <span
                    className={`font-mono text-sm font-semibold tabular-nums ${
                      seriesStats.deltaRatio > 0
                        ? 'text-emerald-400'
                        : seriesStats.deltaRatio < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                    }`}
                  >
                    {seriesStats.deltaRatio >= 0 ? '+' : ''}
                    {seriesStats.deltaRatio.toFixed(2)}x BW (
                    {seriesStats.deltaPct >= 0 ? '+' : ''}
                    {seriesStats.deltaPct.toFixed(1)}%)
                  </span>
                )}
              </div>
              <div className={`mt-1 text-xs font-medium ${verdictColorClass}`}>
                {report.trendHeadline}
              </div>
            </div>

            {activePoint && (
              <div className="text-left sm:text-right">
                <div className="font-mono text-xs font-semibold tabular-nums text-slate-200">
                  {formatBgDate(activePoint.date)} · {activePoint.ratio.toFixed(2)}x BW
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {activePoint.subtitle}
                </div>
                <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                  {activePoint.weightNote}
                </div>
              </div>
            )}
          </div>

          {/* Селектор на движение */}
          {report.movements.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedSeries('composite')}
                className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  effectiveSeries === 'composite'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-white font-semibold'
                    : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                }`}
              >
                Общ индекс
              </button>
              {report.movements.map((mov) => (
                <button
                  key={mov.id}
                  type="button"
                  onClick={() => setSelectedSeries(mov.id)}
                  className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    effectiveSeries === mov.id
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-white font-semibold'
                      : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {mov.shortLabel}
                  <span className="ml-1.5 font-mono text-[11px] tabular-nums text-slate-400">
                    {mov.latestPoint.ratio.toFixed(2)}x
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* SVG Линейна графика */}
          <div className="mt-4">
            {chartGeometry && chartPoints.length > 0 ? (
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  role="img"
                  aria-label="Тренд на относителната сила спрямо личното тегло"
                  className="h-auto w-full min-w-[440px]"
                >
                  <defs>
                    <linearGradient
                      id="relStrengthAreaGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#10B981" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {/* Хоризонтални линии и Y-ос */}
                  {chartGeometry.yTicks.map((tick, i) => (
                    <g key={i}>
                      <line
                        x1={padL}
                        x2={svgW - padR}
                        y1={tick.y}
                        y2={tick.y}
                        stroke="rgba(148, 163, 184, 0.14)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={tick.y + 4}
                        textAnchor="end"
                        fill="#94A3B8"
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {tick.val.toFixed(2)}x
                      </text>
                    </g>
                  ))}

                  {/* Зона под кривата */}
                  {chartGeometry.areaPath && (
                    <path
                      d={chartGeometry.areaPath}
                      fill="url(#relStrengthAreaGrad)"
                    />
                  )}

                  {/* Тренд линия */}
                  {chartGeometry.coords.length >= 2 && (
                    <path
                      d={chartGeometry.linePath}
                      fill="none"
                      stroke="#34D399"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Точки и X-етикети */}
                  {chartGeometry.coords.map((c) => {
                    const isFocused =
                      selectedPointIdx !== null
                        ? selectedPointIdx === c.idx
                        : c.idx === chartGeometry.coords.length - 1;
                    const showLabel =
                      c.idx === 0 ||
                      c.idx === chartGeometry.coords.length - 1 ||
                      c.idx % chartGeometry.xLabelStep === 0;

                    return (
                      <g key={`${c.pt.date}-${c.idx}`}>
                        {showLabel && (
                          <text
                            x={c.x}
                            y={svgH - 10}
                            textAnchor="middle"
                            fill="#64748B"
                            fontSize="10"
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          >
                            {c.pt.shortDate}
                          </text>
                        )}
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r={isFocused ? 5.5 : 3.5}
                          fill={isFocused ? '#34D399' : '#0F141F'}
                          stroke="#34D399"
                          strokeWidth="2"
                          className="cursor-pointer transition-all"
                          onMouseEnter={() => setSelectedPointIdx(c.idx)}
                          onClick={() => setSelectedPointIdx(c.idx)}
                        >
                          <title>
                            {`${c.pt.date}: ${c.pt.ratio.toFixed(2)}x BW — ${c.pt.subtitle}`}
                          </title>
                        </circle>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#141B27]/50 px-5 py-8 text-center">
                <p className="text-sm font-medium text-slate-200">
                  Няма достатъчно данни за графика в последните {windowDays} дни
                </p>
                <p className="mt-1.5 text-xs text-slate-400">
                  Импортирай силови тренировки от Hevy (набирания, кофички, силови, лежанка, клек, тяга, раменна преса) и запиши сутрешно тегло в Дневния запис.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {onNavigateToHevy && (
                    <button
                      type="button"
                      onClick={onNavigateToHevy}
                      className="h-8 rounded-lg bg-[var(--accent)] px-3 text-xs font-semibold text-[var(--accent-contrast)]"
                    >
                      Импортирай от Hevy
                    </button>
                  )}
                  {onNavigateToCheckin && (
                    <button
                      type="button"
                      onClick={onNavigateToCheckin}
                      className="h-8 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 hover:border-white/30"
                    >
                      Запиши сутрешно тегло
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Обобщение под графиката */}
          <p className="mt-3 border-t border-white/10 pt-3 text-xs leading-relaxed text-slate-400">
            {report.trendDetail}
          </p>
        </div>

        {/* ДЯСНА КОЛОНА: Боксова категория и тегло */}
        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-4">
          <div>
            <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-3.5">
              <div>
                <h3 className="font-display text-base font-bold text-white">
                  🥊 Боксова категория и тегло
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {report.boxingWeight.weightSourceLabel}
                </p>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-bold tabular-nums text-white">
                  {report.boxingWeight.avgWeight7d !== null
                    ? `${report.boxingWeight.avgWeight7d.toFixed(1)} kg`
                    : '—'}
                </div>
                {report.boxingWeight.currentClass && (
                  <div className="text-[11px] font-medium text-emerald-400">
                    {report.boxingWeight.currentClass.label} (
                    {report.boxingWeight.currentClass.rangeLabel})
                  </div>
                )}
              </div>
            </div>

            {/* Таблица с най-близки боксови категории */}
            <div className="mt-3 divide-y divide-white/[0.06]">
              {displayedClasses.map((cls) => {
                const diffColor =
                  cls.diffKg === null
                    ? 'text-slate-500'
                    : cls.isCurrentClass
                      ? 'text-emerald-400'
                      : cls.diffKg > 0
                        ? 'text-amber-300'
                        : 'text-sky-300';

                return (
                  <div
                    key={cls.id}
                    className={`flex items-center justify-between gap-2 py-2.5 text-xs ${
                      cls.isCurrentClass ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-medium">
                        {cls.isCurrentClass && (
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{cls.label}</span>
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-slate-500">
                        {cls.rangeLabel}
                      </div>
                    </div>
                    <div className={`text-right font-mono text-xs font-semibold tabular-nums shrink-0 ${diffColor}`}>
                      {cls.diffKg !== null
                        ? cls.isOpenEnded
                          ? cls.diffKg > 0
                            ? `+${cls.diffKg.toFixed(1)} kg`
                            : `${cls.diffKg.toFixed(1)} kg`
                          : formatSignedDelta(cls.diffKg, 'kg')
                        : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowAllClasses((prev) => !prev)}
              className="mt-2 text-[11px] font-medium text-slate-400 transition-colors hover:text-white"
            >
              {showAllClasses
                ? 'Покажи само най-близките 4 категории'
                : 'Покажи всички боксови категории (63.5 – +92 kg)'}
            </button>
          </div>

          {/* Персонално целево тегло (userSettings.targetWeight) */}
          <form
            onSubmit={handleSaveTargetSubmit}
            className="mt-5 border-t border-white/10 pt-4"
          >
            <label
              htmlFor="boxing-target-weight-input"
              className="block text-xs font-medium text-slate-300"
            >
              Лично целево тегло (kg)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="boxing-target-weight-input"
                type="number"
                step="0.1"
                min="30"
                max="250"
                inputMode="decimal"
                placeholder="напр. 80.5"
                value={targetInput}
                onChange={(e) => {
                  setTargetInput(e.target.value);
                  setSaveFeedback(null);
                }}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-xs tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={savingTarget}
                className="h-9 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {savingTarget ? 'Запис...' : 'Запази'}
              </button>
            </div>

            {report.boxingWeight.targetStatusText && (
              <div
                className={`mt-2 font-mono text-xs font-medium tabular-nums ${
                  report.boxingWeight.diffToTargetKg !== null &&
                  Math.abs(report.boxingWeight.diffToTargetKg) <= 0.5
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                {report.boxingWeight.targetStatusText}
              </div>
            )}

            {saveFeedback && (
              <div className="mt-1.5 text-[11px] text-slate-400">
                {saveFeedback}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Таблица с всички засечени ключови движения */}
      {report.movements.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
          <div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="font-display text-sm font-bold text-white">
              Относителна сила по ключови движения
            </h3>
            <span className="text-[11px] text-slate-400">
              Кликни на ред, за да видиш тренда му на графиката горе
            </span>
          </div>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-medium text-slate-400">
                  <th className="py-2.5 pr-3">Движение</th>
                  <th className="py-2.5 px-3">Последен резултат</th>
                  <th className="py-2.5 px-3 text-right">Текущ коеф.</th>
                  <th className="py-2.5 px-3 text-right">Рекорд (All-Time)</th>
                  <th className="py-2.5 pl-3 text-right">Промяна ({windowDays} д.)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {report.movements.map((mov) => {
                  const isSelected = effectiveSeries === mov.id;
                  const deltaClass =
                    mov.windowDeltaRatio === null
                      ? 'text-slate-500'
                      : mov.windowDeltaRatio > 0
                        ? 'text-emerald-400'
                        : mov.windowDeltaRatio < 0
                          ? 'text-rose-400'
                          : 'text-slate-400';

                  return (
                    <tr
                      key={mov.id}
                      onClick={() => setSelectedSeries(mov.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent)]/10'
                          : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-white">
                          {mov.shortLabel}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {mov.category === 'bodyweight'
                            ? 'Собствено + добавена'
                            : 'Щанга · Epley 1RM / Тегло'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono text-xs tabular-nums text-slate-200">
                          {mov.category === 'bodyweight'
                            ? mov.latestPoint.externalWeightKg > 0
                              ? `+${mov.latestPoint.externalWeightKg} kg × ${mov.latestPoint.reps} (общо ${mov.latestPoint.primaryLoadKg} kg)`
                              : `0 kg × ${mov.latestPoint.reps} (тегло ${mov.latestPoint.bodyWeightKg} kg)`
                            : `${mov.latestPoint.externalWeightKg} kg × ${mov.latestPoint.reps} (1RM ${mov.latestPoint.primaryLoadKg} kg)`}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {formatBgDate(mov.latestPoint.date)} · Тегло{' '}
                          {formatNumberBg(mov.latestPoint.bodyWeightKg)} kg
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-sm font-bold tabular-nums text-white">
                        {mov.latestPoint.ratio.toFixed(2)}x BW
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs tabular-nums text-slate-300">
                        <div>{mov.bestPoint.ratio.toFixed(2)}x BW</div>
                        <div className="text-[10px] text-slate-500">
                          {formatShortDateBg(mov.bestPoint.date)}
                        </div>
                      </td>
                      <td className={`py-3 pl-3 text-right font-mono text-xs font-semibold tabular-nums ${deltaClass}`}>
                        {mov.windowDeltaRatio !== null && mov.windowDeltaPct !== null ? (
                          <>
                            {mov.windowDeltaRatio >= 0 ? '+' : ''}
                            {mov.windowDeltaRatio.toFixed(2)}x (
                            {mov.windowDeltaPct >= 0 ? '+' : ''}
                            {mov.windowDeltaPct.toFixed(1)}%)
                          </>
                        ) : (
                          <span>{mov.pointsInWindow.length} тр.</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
