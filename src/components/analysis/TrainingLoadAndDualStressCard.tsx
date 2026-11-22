import { useMemo } from 'react';
import { Scale, Target } from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  computeTrainingLoadFocusAndDualStress,
  type LoadZoneStatus,
} from '../../utils/biometricPerformanceEngine';
import { formatBgNumericDate, formatNumberBg } from '../../utils/fitnessMath';

interface TrainingLoadAndDualStressCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}

function getZoneStatusTextClass(status: LoadZoneStatus): string {
  if (status === 'optimal') return 'text-emerald-400';
  if (status === 'shortage') return 'text-amber-300';
  if (status === 'excess') return 'text-rose-400';
  return 'text-slate-500';
}

function getStressArcColor(score: number): string {
  if (score >= 78) return '#F43F5E';
  if (score >= 58) return '#F59E0B';
  if (score >= 30) return '#10B981';
  return '#38BDF8';
}

function SemiArcGauge({
  score,
  label,
  sublabel,
  testId,
}: {
  score: number;
  label: string;
  sublabel: string;
  testId: string;
}) {
  const radius = 48;
  const cx = 64;
  const cy = 62;
  const arcLen = Math.PI * radius; // Semi-circle circumference
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = arcLen - (clamped / 100) * arcLen;
  const strokeColor = getStressArcColor(clamped);

  return (
    <div data-testid={testId} className="flex flex-col items-center text-center">
      <svg
        viewBox="0 0 128 76"
        className="h-[74px] w-[124px]"
        role="img"
        aria-label={`${label}: ${clamped} от 100`}
      >
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.09)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={strokeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={arcLen}
          strokeDashoffset={dashOffset}
        />
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          fill="#FFFFFF"
          fontSize="22"
          fontWeight="800"
          className="font-mono tabular-nums"
        >
          {clamped}
        </text>
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fill="#94A3B8"
          fontSize="10"
          className="font-mono"
        >
          от 100
        </text>
      </svg>
      <div className="mt-1 text-xs font-bold text-white">{label}</div>
      <div
        className="text-[11px] font-medium"
        style={{ color: strokeColor }}
      >
        {sublabel}
      </div>
    </div>
  );
}

export function TrainingLoadAndDualStressCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
}: TrainingLoadAndDualStressCardProps) {
  const report = useMemo(
    () =>
      computeTrainingLoadFocusAndDualStress({
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, todayKey],
  );

  const { dualStress } = report;

  return (
    <section
      data-testid="training-load-dual-stress-section"
      aria-label="Training Load Focus и Двоен стрес метър"
      className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12"
    >
      {/* Лява част: 🎯 Training Load Focus (3 зони, последните 28 дни) */}
      <div
        data-testid="training-load-focus-card"
        className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-7"
      >
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Target
                  className="h-4 w-4 text-[var(--accent-text)]"
                  aria-hidden="true"
                />
                <span>
                  Последните 28 дни ({formatBgNumericDate(report.loadWindowStart)}{' '}
                  – {formatBgNumericDate(report.loadWindowEnd)})
                </span>
              </div>
              <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
                🎯 Training Load Focus (3 енергийни зони)
              </h2>
            </div>
            <div className="font-mono text-xs tabular-nums text-slate-400">
              Общ товар:{' '}
              <strong className="text-white">
                {formatNumberBg(report.totalLoad28d)} т.
              </strong>
            </div>
          </div>

          {/* 3 хоризонтални SVG ленти с оптимални целеви рамки */}
          <div className="mt-5 space-y-5">
            {report.zones.map((zone) => {
              const barScaleMax = 70; // 0..70% visual axis so target brackets 20–50% read with crisp precision
              const fillPct = Math.min(
                100,
                (zone.sharePct / barScaleMax) * 100,
              );
              const targetLeftPct = (zone.targetMinPct / barScaleMax) * 100;
              const targetWidthPct =
                ((zone.targetMaxPct - zone.targetMinPct) / barScaleMax) * 100;

              return (
                <div
                  key={zone.id}
                  data-testid={`load-zone-${zone.id}`}
                  className="space-y-1.5"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <div>
                      <span className="font-semibold text-white">
                        {zone.label}
                      </span>
                      <span className="ml-2 text-slate-400">
                        {zone.subtitle}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="font-bold text-white">
                        {zone.sharePct}%
                      </span>
                      <span className="text-slate-500">
                        ({formatNumberBg(zone.loadPoints)} т.)
                      </span>
                      <span
                        className={`font-sans text-[11px] font-semibold ${getZoneStatusTextClass(
                          zone.status,
                        )}`}
                      >
                        {zone.statusLabel}
                      </span>
                    </div>
                  </div>

                  {/* SVG хоризонтална лента + оптимална целева рамка */}
                  <svg
                    viewBox="0 0 420 26"
                    className="h-6 w-full"
                    role="img"
                    aria-label={`${zone.label}: ${zone.sharePct}% (целева рамка ${zone.targetMinPct}–${zone.targetMaxPct}%)`}
                  >
                    {/* Основа на лентата */}
                    <rect
                      x="0"
                      y="7"
                      width="420"
                      height="12"
                      rx="6"
                      fill="rgba(255,255,255,0.06)"
                    />

                    {/* Активен прогрес */}
                    {fillPct > 0 && (
                      <rect
                        x="0"
                        y="7"
                        width={Math.max(6, (fillPct / 100) * 420)}
                        height="12"
                        rx="6"
                        fill={zone.colorHex}
                        fillOpacity="0.88"
                      />
                    )}

                    {/* Оптимална целева рамка (Garmin Fenix bracket overlay) */}
                    <rect
                      x={(targetLeftPct / 100) * 420}
                      y="2"
                      width={(targetWidthPct / 100) * 420}
                      height="22"
                      rx="4"
                      fill="rgba(255,255,255,0.03)"
                      stroke="rgba(226,232,240,0.65)"
                      strokeWidth="1.4"
                      strokeDasharray="4 2"
                    />
                  </svg>

                  <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
                    <span>0%</span>
                    <span className="text-slate-400">
                      Целева рамка: {zone.targetMinPct}% – {zone.targetMaxPct}%
                    </span>
                    <span>70%+</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Резюме за 28-дневния баланс */}
        <div className="mt-5 border-t border-white/10 pt-3.5">
          <div className="text-xs font-bold text-white">
            {report.loadFocusHeadline}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {report.loadFocusAdvice}
          </p>
        </div>
      </div>

      {/* Дясна част: ⚖️ Двоен стрес метър (Мускулен срещу Кардио, 0–100 за последните 7 дни) */}
      <div
        data-testid="dual-stress-meter-card"
        className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-5"
      >
        <div>
          <div className="border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Scale
                className="h-4 w-4 text-amber-400"
                aria-hidden="true"
              />
              <span>
                Последните 7 дни (
                {formatBgNumericDate(dualStress.windowStartDate)} –{' '}
                {formatBgNumericDate(dualStress.windowEndDate)})
              </span>
            </div>
            <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white">
              ⚖️ Двоен стрес метър (0–100)
            </h2>
          </div>

          {/* Два паралелни SVG полукръгови метъра: Мускулен vs Кардио */}
          <div className="mt-5 grid grid-cols-2 gap-4">
            <SemiArcGauge
              score={dualStress.muscularScore}
              label="Мускулен стрес"
              sublabel={dualStress.muscularLabel}
              testId="dual-stress-muscular-gauge"
            />
            <SemiArcGauge
              score={dualStress.cardioScore}
              label="Кардио стрес"
              sublabel={dualStress.cardioLabel}
              testId="dual-stress-cardio-gauge"
            />
          </div>

          {/* Сравнителна разбивка на източниците */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/8 pt-3.5 text-xs">
            <div className="space-y-1">
              <div className="font-semibold text-slate-300">Hevy (сила и e1RM)</div>
              <div className="font-mono text-[11px] tabular-nums text-slate-400">
                {dualStress.muscularWorkingSets7d} раб. серии ·{' '}
                {dualStress.muscularHeavySets7d} тежки
              </div>
              <div className="font-mono text-[11px] tabular-nums text-slate-400">
                Тонаж: {formatNumberBg(dualStress.muscularTonnage7dKg)} кг
              </div>
            </div>

            <div className="space-y-1">
              <div className="font-semibold text-slate-300">
                Intervals.icu &amp; Бокс
              </div>
              <div className="font-mono text-[11px] tabular-nums text-slate-400">
                {dualStress.cardioMinutes7d} мин кардио · +
                {formatNumberBg(dualStress.cardioElevation7dM)} м D+
              </div>
              <div className="font-mono text-[11px] tabular-nums text-slate-400">
                Среден пулс:{' '}
                {dualStress.cardioAvgHr7d !== null
                  ? `${dualStress.cardioAvgHr7d} bpm`
                  : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Диагноза на разминаването (Мускули vs Сърце) */}
        <div className="mt-5 border-t border-white/10 pt-3.5">
          <div
            data-testid="dual-stress-divergence-headline"
            className="text-xs font-bold text-white"
          >
            {dualStress.divergenceHeadline}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            {dualStress.divergenceAdvice}
          </p>
        </div>
      </div>
    </section>
  );
}
