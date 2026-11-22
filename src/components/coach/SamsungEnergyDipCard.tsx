import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Dna,
  HeartPulse,
  Moon,
} from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  computeSamsungEnergyAndHrDipReport,
  type EnergyFactorId,
} from '../../utils/vitalsAndSleepCoachingEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface SamsungEnergyDipCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}

function getEnergyColorHex(score: number, hasData: boolean): string {
  if (!hasData) return '#64748B';
  if (score >= 82) return '#34D399';
  if (score >= 68) return '#38BDF8';
  if (score >= 52) return '#FBBF24';
  return '#FB7185';
}

function getDipVisual(status: 'optimal' | 'low_dip' | 'deep_dip' | 'no_data'): {
  colorHex: string;
  textClass: string;
} {
  if (status === 'optimal') {
    return { colorHex: '#34D399', textClass: 'text-emerald-300' };
  }
  if (status === 'deep_dip') {
    return { colorHex: '#38BDF8', textClass: 'text-sky-300' };
  }
  if (status === 'low_dip') {
    return { colorHex: '#FB7185', textClass: 'text-rose-300' };
  }
  return { colorHex: '#64748B', textClass: 'text-slate-400' };
}

export function SamsungEnergyDipCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
}: SamsungEnergyDipCardProps) {
  const report = useMemo(
    () =>
      computeSamsungEnergyAndHrDipReport({
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, todayKey],
  );

  const [selectedFactorId, setSelectedFactorId] =
    useState<EnergyFactorId>('sleep');

  const activeFactor =
    report.factors.find((f) => f.id === selectedFactorId) ?? report.factors[0];

  const energyHex = getEnergyColorHex(report.energyScore, report.hasEnoughData);
  const dipVisual = getDipVisual(report.hrDipStatus);

  // Energy Score radial 240° SVG arc geometry
  const radius = 56;
  const cx = 74;
  const cy = 74;
  const circ = 2 * Math.PI * radius;
  const arcLen = circ * (240 / 360);
  const clampedScore = Math.max(0, Math.min(100, report.energyScore));
  const dashOffset = arcLen - arcLen * (clampedScore / 100);

  // Sleeping HR Dip horizontal SVG gauge (-5% .. 30%, optimal 10% .. 20%)
  const dipMin = -5;
  const dipMax = 30;
  const dipToX = (pct: number) => {
    const norm = Math.max(0, Math.min(1, (pct - dipMin) / (dipMax - dipMin)));
    return 14 + norm * 272;
  };
  const dipOptX1 = dipToX(10);
  const dipOptX2 = dipToX(20);
  const dipMarkerX = report.hrDipPct !== null ? dipToX(report.hrDipPct) : null;

  return (
    <section
      data-testid="samsung-energy-dip-card"
      aria-label="Samsung Energy Score и Sleeping HR Dip"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавна линия */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <BatteryCharging
              className="h-4 w-4 text-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span>Сън · Циркадна стабилност · HRV · Пулс в покой · Активност</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {report.anchorNightDate
                ? `Нощ ${formatBgNumericDate(report.anchorNightDate)}`
                : 'Очаква данни'}
            </span>
          </div>
          <h3 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            🔋 Samsung Energy Score &amp; Sleeping HR Dip
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className="font-semibold"
            style={{ color: energyHex }}
          >
            {report.energyTierLabel}
          </span>
        </div>
      </div>

      {/* Двуколонен основен блок: Energy Score (ляво) + Sleeping HR Dip (дясно) */}
      <div className="mt-5 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* ЛЯВО: Energy Score 0–100 + 5 фактора */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            <div className="relative flex h-[148px] w-[148px] shrink-0 items-center justify-center">
              <svg
                viewBox="0 0 148 148"
                className="h-full w-full"
                role="img"
                aria-label={`Samsung Energy Score: ${clampedScore} от 100`}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke="rgba(255,255,255,0.09)"
                  strokeWidth="11"
                  strokeDasharray={`${arcLen} ${circ}`}
                  strokeLinecap="round"
                  transform={`rotate(150 ${cx} ${cy})`}
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="none"
                  stroke={energyHex}
                  strokeWidth="11"
                  strokeDasharray={`${arcLen} ${circ}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  transform={`rotate(150 ${cx} ${cy})`}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
                <span className="text-[10px] font-medium text-slate-400">
                  Energy Score
                </span>
                <span
                  data-testid="samsung-energy-score-value"
                  className="mt-0.5 font-mono text-3xl font-extrabold leading-none tabular-nums text-white"
                >
                  {report.hasEnoughData ? clampedScore : '—'}
                </span>
                <span className="mt-1 font-mono text-[10px] tabular-nums text-slate-400">
                  / 100
                </span>
              </div>
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div className="text-xs font-semibold text-white">
                Композитен сутрешен заряд за днес
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                {report.energySummary}
              </p>
            </div>
          </div>

          {/* 5 интерактивни фактора (плосък списък с hairline разделители) */}
          <div className="divide-y divide-white/8 border-t border-white/10 pt-2">
            {report.factors.map((factor) => {
              const isSelected = activeFactor?.id === factor.id;
              const barPct = factor.score !== null ? factor.score : 0;
              const barColor =
                factor.score === null
                  ? 'bg-slate-600'
                  : factor.score >= 80
                    ? 'bg-emerald-400'
                    : factor.score >= 60
                      ? 'bg-sky-400'
                      : 'bg-amber-400';

              return (
                <button
                  key={factor.id}
                  type="button"
                  data-testid={`energy-factor-${factor.id}`}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedFactorId(factor.id)}
                  className={`flex w-full items-center justify-between gap-3 py-2 text-left transition-colors ${
                    isSelected ? 'text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className={isSelected ? 'font-semibold text-white' : ''}>
                        {factor.label}{' '}
                        <span className="font-mono text-[10px] tabular-nums text-slate-500">
                          ({factor.weightPct}%)
                        </span>
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-slate-400 truncate">
                        {factor.valueText}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-9 text-right font-mono text-xs font-bold tabular-nums shrink-0">
                    {factor.score !== null ? factor.score : '—'}
                  </span>
                </button>
              );
            })}
          </div>

          {activeFactor && (
            <p className="text-xs leading-relaxed text-slate-400">
              <strong className="font-semibold text-slate-200">
                {activeFactor.label}:
              </strong>{' '}
              {activeFactor.note}
            </p>
          )}
        </div>

        {/* ДЯСНО: Sleeping HR Dip (%) + Връзка с нощния пик на тестостерон */}
        <div className="flex flex-col justify-between gap-4 border-t border-white/10 pt-5 lg:col-span-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <HeartPulse
                  className="h-4 w-4 text-rose-400 shrink-0"
                  aria-hidden="true"
                />
                <span>Sleeping HR Dip (Нощен спад на пулса)</span>
              </div>
              <span
                data-testid="sleeping-hr-dip-status"
                className={`text-xs font-semibold ${dipVisual.textClass}`}
              >
                {report.hrDipStatusLabel}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span
                  data-testid="sleeping-hr-dip-value"
                  className="text-3xl font-extrabold text-white"
                >
                  {report.hrDipPct !== null ? `${report.hrDipPct}%` : '—'}
                </span>
                <span className="text-xs text-slate-400">
                  оптимум 10–20%
                </span>
              </div>

              <div className="font-mono text-xs tabular-nums text-slate-300">
                Нощен:{' '}
                <strong className="text-white">
                  {report.sleepingHrBpm !== null
                    ? `${report.sleepingHrBpm} bpm`
                    : '—'}
                </strong>
                {' · '}Дневен:{' '}
                <strong className="text-white">
                  {report.daytimeHrBpm !== null
                    ? `${report.daytimeHrBpm} bpm`
                    : '—'}
                </strong>
              </div>
            </div>

            {/* SVG хоризонтален индикатор за Sleeping HR Dip (%) */}
            <div className="mt-3">
              <svg
                viewBox="0 0 300 54"
                className="h-auto w-full"
                role="img"
                aria-label={`Нощен спад на пулса: ${
                  report.hrDipPct !== null ? `${report.hrDipPct}%` : 'няма данни'
                }, оптимална зона 10 до 20 процента`}
              >
                {/* Пълна скала -5% .. 30% */}
                <rect
                  x="14"
                  y="18"
                  width="272"
                  height="12"
                  rx="6"
                  fill="rgba(255,255,255,0.08)"
                />
                {/* Предупредителна зона < 10% */}
                <rect
                  x="14"
                  y="18"
                  width={Math.max(0, dipOptX1 - 14)}
                  height="12"
                  rx="6"
                  fill="rgba(251, 113, 133, 0.20)"
                />
                {/* Оптимална зелена зона 10–20% */}
                <rect
                  x={dipOptX1}
                  y="16"
                  width={Math.max(10, dipOptX2 - dipOptX1)}
                  height="16"
                  rx="6"
                  fill="rgba(52, 211, 153, 0.28)"
                  stroke="rgba(52, 211, 153, 0.7)"
                  strokeWidth="1.3"
                />

                {/* Етикети по скалата */}
                {[0, 10, 20, 30].map((tick) => {
                  const x = dipToX(tick);
                  return (
                    <text
                      key={tick}
                      x={x}
                      y="48"
                      textAnchor="middle"
                      fill={tick === 10 || tick === 20 ? '#34D399' : '#94A3B8'}
                      fontSize="10"
                      className="font-mono tabular-nums"
                    >
                      {tick}%
                    </text>
                  );
                })}

                {/* Текущ маркер */}
                {dipMarkerX !== null && (
                  <g>
                    <line
                      x1={dipMarkerX}
                      y1="10"
                      x2={dipMarkerX}
                      y2="36"
                      stroke={dipVisual.colorHex}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={dipMarkerX}
                      cy="24"
                      r="6"
                      fill={dipVisual.colorHex}
                      stroke="#0F141F"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>
            </div>

            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Moon className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
              <span>Източник на дневната база: {report.hrDipSourceLabel}</span>
            </div>

            {/* Предупреждение при Sleeping HR Dip < 10% */}
            {report.hrDipWarning && (
              <div
                role="alert"
                data-testid="sleeping-hr-dip-warning"
                className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-500/40 bg-rose-950/25 px-3.5 py-3 text-xs leading-relaxed text-rose-100"
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
                  aria-hidden="true"
                />
                <p>{report.hrDipWarning}</p>
              </div>
            )}
          </div>

          {/* Физиологична връзка с нощния хормонален пик и тестостерона */}
          <div className="border-t border-white/10 pt-3.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Dna
                className="h-4 w-4 text-[var(--accent-text)] shrink-0"
                aria-hidden="true"
              />
              <span>Връзка с нощния хормонален пик (Тестостерон &amp; GH)</span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
              {report.hormonalPeakExplanation}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
