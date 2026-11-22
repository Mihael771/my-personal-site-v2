import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, HeartPulse } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import {
  computeAppleVitalsReport,
  type AppleVitalMetricId,
  type AppleVitalMetricItem,
} from '../../utils/vitalsAndSleepCoachingEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface AppleVitalsCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

function formatMetricValue(metric: AppleVitalMetricItem, val: number): string {
  if (metric.id === 'restingHr' || metric.id === 'deepRemPct') {
    return `${Math.round(val)}`;
  }
  return Number.isInteger(val) ? `${val}` : val.toFixed(1);
}

function getStatusColorHex(metric: AppleVitalMetricItem): string {
  if (metric.status === 'no_data') return '#64748B';
  if (metric.status === 'in_range') return '#34D399';
  return '#FB7185';
}

function getStatusTextClass(metric: AppleVitalMetricItem): string {
  if (metric.status === 'no_data') return 'text-slate-400';
  if (metric.status === 'in_range') return 'text-emerald-300';
  return 'text-rose-300';
}

export function AppleVitalsCard({ dailyLogs, todayKey }: AppleVitalsCardProps) {
  const report = useMemo(
    () => computeAppleVitalsReport({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const [selectedMetricId, setSelectedMetricId] = useState<AppleVitalMetricId>(
    () => {
      const firstOut = report.metrics.find((m) => m.isOutOfRange);
      return firstOut?.id ?? 'restingHr';
    },
  );

  const activeMetric =
    report.metrics.find((m) => m.id === selectedMetricId) ?? report.metrics[0];

  const overallColorClass =
    report.overallStatus === 'alert'
      ? 'text-rose-300'
      : report.overallStatus === 'caution'
        ? 'text-amber-300'
        : report.overallStatus === 'normal'
          ? 'text-emerald-300'
          : 'text-slate-400';

  return (
    <section
      data-testid="apple-vitals-card"
      aria-label="Apple Vitals — Нощен здравен радар"
      className={`rounded-2xl border p-5 sm:p-6 ${
        report.hasMultiMetricAlert
          ? 'border-rose-500/40 bg-[#0F141F]'
          : 'border-white/10 bg-[#0F141F]'
      }`}
    >
      {/* Заглавна линия */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <HeartPulse
              className="h-4 w-4 text-sky-400 shrink-0"
              aria-hidden="true"
            />
            <span>Лична 30-дневна норма (25–75 персентил IQR)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {report.anchorNightDate
                ? `Нощ ${formatBgNumericDate(report.anchorNightDate)}`
                : 'Очаква нощен запис'}
            </span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            🩺 Apple Vitals — Нощен здравен радар
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {report.overallStatus === 'alert' ? (
            <AlertTriangle
              className="h-4 w-4 text-rose-400 shrink-0"
              aria-hidden="true"
            />
          ) : report.overallStatus === 'normal' ? (
            <CheckCircle2
              className="h-4 w-4 text-emerald-400 shrink-0"
              aria-hidden="true"
            />
          ) : (
            <Activity
              className="h-4 w-4 text-amber-300 shrink-0"
              aria-hidden="true"
            />
          )}
          <span className={`font-semibold ${overallColorClass}`}>
            {report.overallStatusLabel}
          </span>
        </div>
      </div>

      {/* Предупредителен банер при 2+ показателя извън личната норма */}
      {report.hasMultiMetricAlert && report.alertMessage && (
        <div
          role="alert"
          data-testid="apple-vitals-alert-banner"
          className="mt-4 flex items-start gap-3 rounded-xl border border-rose-500/45 bg-rose-950/30 px-4 py-3.5 text-xs leading-relaxed text-rose-100 sm:text-sm"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
            aria-hidden="true"
          />
          <p className="font-medium">{report.alertMessage}</p>
        </div>
      )}

      {/* 4 компактни SVG индикатора на личния диапазон */}
      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {report.metrics.map((metric) => {
          const isSelected = activeMetric?.id === metric.id;
          const markerColor = getStatusColorHex(metric);
          const statusClass = getStatusTextClass(metric);

          // SVG coordinates inside viewBox 0 0 280 42
          const barX = 10;
          const barW = 260;
          const barY = 16;
          const barH = 10;
          const bandX = barX + (metric.bandStartPct / 100) * barW;
          const bandW = Math.max(
            12,
            ((metric.bandEndPct - metric.bandStartPct) / 100) * barW,
          );
          const valueX =
            metric.valuePct !== null
              ? barX + (metric.valuePct / 100) * barW
              : null;

          return (
            <button
              key={metric.id}
              type="button"
              data-testid={`apple-vital-row-${metric.id}`}
              aria-pressed={isSelected}
              onClick={() => setSelectedMetricId(metric.id)}
              className={`group w-full rounded-xl border px-3.5 py-3 text-left transition-colors ${
                isSelected
                  ? metric.isOutOfRange
                    ? 'border-rose-400/50 bg-rose-950/15'
                    : 'border-sky-400/40 bg-white/[0.04]'
                  : 'border-white/8 bg-transparent hover:border-white/20 hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-white">
                    {metric.label}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 shrink-0">
                  <span className="font-mono text-base font-bold tabular-nums text-white">
                    {metric.lastNightValue !== null
                      ? `${formatMetricValue(metric, metric.lastNightValue)} ${metric.unit}`
                      : '—'}
                  </span>
                  <span className={`text-[11px] font-semibold ${statusClass}`}>
                    {metric.statusLabel}
                  </span>
                </div>
              </div>

              {/* Компактна хоризонтална SVG лента за личния IQR диапазон */}
              <div className="mt-2">
                <svg
                  viewBox="0 0 280 42"
                  className="h-auto w-full"
                  role="img"
                  aria-label={`${metric.label}: ${
                    metric.lastNightValue !== null
                      ? `${formatMetricValue(metric, metric.lastNightValue)} ${metric.unit}`
                      : 'няма данни'
                  }, типичен диапазон ${formatMetricValue(metric, metric.q1)} до ${formatMetricValue(metric, metric.q3)} ${metric.unit}`}
                >
                  {/* Базова скала */}
                  <rect
                    x={barX}
                    y={barY}
                    width={barW}
                    height={barH}
                    rx="5"
                    fill="rgba(255,255,255,0.08)"
                  />

                  {/* Личен 25–75% IQR диапазон */}
                  <rect
                    x={bandX}
                    y={barY - 2}
                    width={bandW}
                    height={barH + 4}
                    rx="6"
                    fill={
                      metric.isOutOfRange
                        ? 'rgba(56, 189, 248, 0.24)'
                        : 'rgba(52, 211, 153, 0.28)'
                    }
                    stroke={
                      metric.isOutOfRange
                        ? 'rgba(56, 189, 248, 0.55)'
                        : 'rgba(52, 211, 153, 0.65)'
                    }
                    strokeWidth="1.2"
                  />

                  {/* Етикети за Q1 и Q3 под диапазона */}
                  <text
                    x={bandX}
                    y={40}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="9.5"
                    className="font-mono tabular-nums"
                  >
                    {formatMetricValue(metric, metric.q1)}
                  </text>
                  <text
                    x={bandX + bandW}
                    y={40}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize="9.5"
                    className="font-mono tabular-nums"
                  >
                    {formatMetricValue(metric, metric.q3)}
                  </text>

                  {/* Маркер за последната нощ */}
                  {valueX !== null && (
                    <g>
                      <line
                        x1={valueX}
                        y1={barY - 6}
                        x2={valueX}
                        y2={barY + barH + 5}
                        stroke={markerColor}
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <circle
                        cx={valueX}
                        cy={barY + barH / 2}
                        r="5.5"
                        fill={markerColor}
                        stroke="#0F141F"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>
              </div>
            </button>
          );
        })}
      </div>

      {/* Детайлен ред за избрания показател */}
      {activeMetric && (
        <div
          data-testid="apple-vitals-detail-bar"
          className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3.5 text-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="leading-relaxed text-slate-300">
            <strong className="font-semibold text-white">
              {activeMetric.shortLabel}:
            </strong>{' '}
            {activeMetric.detailNote}
          </p>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
            <span>
              IQR: {formatMetricValue(activeMetric, activeMetric.q1)}–
              {formatMetricValue(activeMetric, activeMetric.q3)}{' '}
              {activeMetric.unit}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Медиана: {formatMetricValue(activeMetric, activeMetric.median)}{' '}
              {activeMetric.unit}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {activeMetric.isPersonalBaseline
                ? `${activeMetric.baselineSamplesCount}/30 нощи`
                : `Реф. база (${activeMetric.baselineSamplesCount}/5 нощи)`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
