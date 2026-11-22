import { useMemo, useState } from 'react';
import type { DailyBiometricLog } from '../../types/fitness';
import { DEFAULT_DAILY_STEPS_GOAL } from '../../utils/dailyLogs';
import {
  diffCalendarDays,
  isValidDateKey,
  shiftDateKey,
} from '../../utils/fitnessMath';
import { DailyActivityEnergyCharts } from '../DailyActivityEnergyCharts';

interface BodyAndBiometricsChartsPanelProps {
  dailyLogs: DailyBiometricLog[];
  dailyStepsGoal?: number;
  profileWeightKg: number | '';
  profileHeightCm: number | '';
  todayKey: string;
}

interface SeriesPoint {
  date: string;
  shortDate: string;
  value: number;
}

function formatShortDate(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${Number(parts[2])}.${Number(parts[1])}`;
}

function MiniTrendSvgChart({
  title,
  unit,
  color,
  points,
  secondaryPoints,
  secondaryColor,
  secondaryLabel,
}: {
  title: string;
  unit: string;
  color: string;
  points: SeriesPoint[];
  secondaryPoints?: SeriesPoint[];
  secondaryColor?: string;
  secondaryLabel?: string;
}) {
  const svgW = 460;
  const svgH = 165;
  const padL = 42;
  const padR = 14;
  const padT = 18;
  const padB = 26;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const first = points.length >= 2 ? points[0] : null;
  const delta =
    latest && first ? Math.round((latest.value - first.value) * 10) / 10 : null;

  const latestSec =
    secondaryPoints && secondaryPoints.length > 0
      ? secondaryPoints[secondaryPoints.length - 1]
      : null;

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const vals = points.map((p) => p.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(1, maxV - minV);
    const yMin = minV - span * 0.15;
    const yMax = maxV + span * 0.15;
    const ySpan = Math.max(0.5, yMax - yMin);

    const coords = points.map((p, idx) => {
      const x =
        points.length === 1
          ? padL + plotW / 2
          : padL + (idx / (points.length - 1)) * plotW;
      const y = padT + (1 - (p.value - yMin) / ySpan) * plotH;
      return { x, y, p, idx };
    });

    const path = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const yTicks = [0, 0.5, 1].map((t) => ({
      val: yMin + t * ySpan,
      y: padT + (1 - t) * plotH,
    }));

    return { coords, path, yTicks };
  }, [points, plotW, plotH]);

  const secGeometry = useMemo(() => {
    if (!secondaryPoints || secondaryPoints.length < 2) return null;
    const vals = secondaryPoints.map((p) => p.value);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(4, maxV - minV);
    const yMin = minV - span * 0.15;
    const yMax = maxV + span * 0.15;
    const ySpan = Math.max(1, yMax - yMin);

    const coords = secondaryPoints.map((p, idx) => {
      const x = padL + (idx / (secondaryPoints.length - 1)) * plotW;
      const y = padT + (1 - (p.value - yMin) / ySpan) * plotH;
      return { x, y };
    });

    return coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');
  }, [secondaryPoints, plotW, plotH]);

  return (
    <div className="rounded-xl border border-white/10 bg-[#0F141F] p-4">
      <div className="flex items-start justify-between gap-2 border-b border-white/8 pb-2.5">
        <div>
          <div className="text-xs font-semibold text-white">{title}</div>
          {secondaryLabel && latestSec && (
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
              {secondaryLabel}:{' '}
              <span style={{ color: secondaryColor ?? '#34D399' }}>
                {latestSec.value.toFixed(0)} ms
              </span>
            </div>
          )}
        </div>
        <div className="text-right font-mono tabular-nums">
          <div className="text-sm font-bold text-white">
            {latest ? `${latest.value.toFixed(1)} ${unit}` : '—'}
          </div>
          {delta !== null && (
            <div className="text-[11px] text-slate-400">
              {delta >= 0 ? '+' : ''}
              {delta.toFixed(1)} {unit}
            </div>
          )}
        </div>
      </div>

      {geometry && points.length > 0 ? (
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          role="img"
          aria-label={title}
          className="mt-2 h-auto w-full"
        >
          {geometry.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={padL}
                x2={svgW - padR}
                y1={t.y}
                y2={t.y}
                stroke="rgba(148,163,184,0.12)"
                strokeDasharray="3 3"
              />
              <text
                x={padL - 6}
                y={t.y + 3}
                textAnchor="end"
                fill="#64748B"
                fontSize="9.5"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              >
                {t.val.toFixed(1)}
              </text>
            </g>
          ))}

          {secGeometry && (
            <path
              d={secGeometry}
              fill="none"
              stroke={secondaryColor ?? '#34D399'}
              strokeWidth="1.75"
              strokeDasharray="4 3"
              opacity="0.85"
            />
          )}

          {geometry.coords.length >= 2 && (
            <path
              d={geometry.path}
              fill="none"
              stroke={color}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {geometry.coords.map((c, idx) => {
            const step = Math.max(1, Math.ceil(geometry.coords.length / 5));
            const showX =
              idx === 0 || idx === geometry.coords.length - 1 || idx % step === 0;
            return (
              <g key={`${c.p.date}-${idx}`}>
                {showX && (
                  <text
                    x={c.x}
                    y={svgH - 6}
                    textAnchor="middle"
                    fill="#64748B"
                    fontSize="9.5"
                    fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                  >
                    {c.p.shortDate}
                  </text>
                )}
                <circle cx={c.x} cy={c.y} r="2.8" fill={color}>
                  <title>{`${c.p.date}: ${c.p.value.toFixed(1)} ${unit}`}</title>
                </circle>
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="py-8 text-center text-xs text-slate-500">
          Няма записани данни за избрания период.
        </div>
      )}
    </div>
  );
}

export function BodyAndBiometricsChartsPanel({
  dailyLogs,
  dailyStepsGoal = DEFAULT_DAILY_STEPS_GOAL,
  profileWeightKg,
  profileHeightCm,
  todayKey,
}: BodyAndBiometricsChartsPanelProps) {
  const [rangeDays, setRangeDays] = useState<14 | 30 | 60>(30);

  const anchorDate = useMemo(() => {
    const valid = dailyLogs
      .map((d) => d.date)
      .filter((d) => isValidDateKey(d))
      .sort();
    if (valid.length === 0) return todayKey;
    const latest = valid[valid.length - 1];
    return Math.abs(diffCalendarDays(latest, todayKey)) > 14 ? latest : todayKey;
  }, [dailyLogs, todayKey]);

  const startDate = shiftDateKey(anchorDate, -(rangeDays - 1));

  const series = useMemo(() => {
    const inRange = [...dailyLogs]
      .filter(
        (d) =>
          isValidDateKey(d.date) &&
          d.date >= startDate &&
          d.date <= anchorDate,
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    const weight: SeriesPoint[] = [];
    const sleep: SeriesPoint[] = [];
    const rhr: SeriesPoint[] = [];
    const hrv: SeriesPoint[] = [];

    for (const log of inRange) {
      const shortDate = formatShortDate(log.date);
      if (typeof log.weightKg === 'number' && log.weightKg >= 30) {
        weight.push({ date: log.date, shortDate, value: log.weightKg });
      }
      if (typeof log.sleepHours === 'number' && log.sleepHours > 0) {
        sleep.push({ date: log.date, shortDate, value: log.sleepHours });
      }
      if (typeof log.restingHr === 'number' && log.restingHr >= 30) {
        rhr.push({ date: log.date, shortDate, value: log.restingHr });
      }
      if (typeof log.hrv === 'number' && log.hrv > 0) {
        hrv.push({ date: log.date, shortDate, value: log.hrv });
      }
    }

    return { weight, sleep, rhr, hrv };
  }, [dailyLogs, startDate, anchorDate]);

  const latestWeightKg = useMemo(() => {
    if (series.weight.length > 0) {
      return series.weight[series.weight.length - 1].value;
    }
    return typeof profileWeightKg === 'number' && Number.isFinite(profileWeightKg)
      ? profileWeightKg
      : null;
  }, [series.weight, profileWeightKg]);

  return (
    <div data-testid="body-and-biometrics-charts" className="space-y-5">
      <div className="flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-white">
            Графики: Тегло, Сън, RHR / HRV и Калории
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Проследяване на биометричните трендове от Дневния запис и часовника.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0F141F] p-1 shrink-0">
          {([14, 30, 60] as const).map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setRangeDays(days)}
              className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                rangeDays === days
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              {days} дни
            </button>
          ))}
        </div>
      </div>

      {/* 3 компактни SVG графики: Тегло, Сън, RHR + HRV */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MiniTrendSvgChart
          title="Сутрешно тегло"
          unit="kg"
          color="#38BDF8"
          points={series.weight}
        />
        <MiniTrendSvgChart
          title="Продължителност на съня"
          unit="ч"
          color="#A78BFA"
          points={series.sleep}
        />
        <MiniTrendSvgChart
          title="Сутрешен пулс (RHR) & HRV"
          unit="bpm"
          color="#FB7185"
          points={series.rhr}
          secondaryPoints={series.hrv}
          secondaryColor="#34D399"
          secondaryLabel="HRV (пунктир)"
        />
      </div>

      {/* Калории и крачки */}
      <DailyActivityEnergyCharts
        dailyLogs={dailyLogs}
        dailyStepsGoal={dailyStepsGoal}
        latestWeightKg={latestWeightKg}
        profileHeightCm={profileHeightCm}
        todayKey={todayKey}
      />
    </div>
  );
}
