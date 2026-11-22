import { useMemo } from 'react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../../types/fitness';
import { formatBgNumericDate } from '../../utils/fitnessMath';
import { analyzeProteinAndLeanMassGuard } from '../../utils/maleHealthAnalyticsEngine';

interface ProteinLeanMassGuardCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  profile: UserProfile;
  todayKey: string;
}

function shortDayMonth(ymd: string): string {
  const parts = ymd.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}` : ymd;
}

export function ProteinLeanMassGuardCard({
  dailyLogs,
  hevyWorkouts,
  profile,
  todayKey,
}: ProteinLeanMassGuardCardProps) {
  const report = useMemo(
    () =>
      analyzeProteinAndLeanMassGuard({
        dailyLogs,
        hevyWorkouts,
        profile,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, profile, todayKey],
  );

  const maxY = useMemo(() => {
    const peak = Math.max(
      2.6,
      ...report.days7d.map((d) => (d.proteinPerKg ?? 0) + 0.3),
    );
    return Math.ceil(peak * 2) / 2;
  }, [report.days7d]);

  const svgW = 360;
  const svgH = 128;
  const padL = 34;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;
  const yForVal = (val: number) =>
    padT + plotH - (Math.min(maxY, Math.max(0, val)) / maxY) * plotH;
  const thresholdY = yForVal(report.thresholdGPerKg);

  const bannerClasses =
    report.status === 'fat_gain_risk'
      ? 'border-amber-500/45 bg-amber-950/25 text-amber-100'
      : report.status === 'optimal_lean_progression'
        ? 'border-emerald-500/45 bg-emerald-950/25 text-emerald-100'
        : report.status === 'protein_below_threshold'
          ? 'border-sky-500/35 bg-sky-950/20 text-sky-100'
          : 'border-white/10 bg-[#141B27] text-slate-200';

  const headlineTextClass =
    report.status === 'fat_gain_risk'
      ? 'text-amber-300'
      : report.status === 'optimal_lean_progression'
        ? 'text-emerald-400'
        : report.status === 'protein_below_threshold'
          ? 'text-sky-300'
          : 'text-white';

  return (
    <section
      data-testid="protein-lean-mass-guard-card"
      data-guard-status={report.status}
      aria-label="Анаболен праг на протеина и защита от омазняване"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + 7-дневен обхват */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Последни 7 завършени дни (до вчера)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-300">
              {formatBgNumericDate(report.window7dStart)} –{' '}
              {formatBgNumericDate(report.windowEndDate)}
            </span>
            <span aria-hidden="true">·</span>
            <span>Кръстосан 14-дн. тренд тегло ↔ сила</span>
          </div>
          <h3 className="mt-1 font-display text-base font-bold text-white sm:text-lg text-balance">
            🥩 Анаболен праг на протеина и защита от омазняване
          </h3>
        </div>

        <div className="font-mono text-xs tabular-nums text-slate-300 shrink-0">
          Праг ≥ 1.8 g/kg:{' '}
          <strong
            className={
              report.daysMeetingThreshold >= 5
                ? 'text-emerald-400'
                : 'text-amber-300'
            }
          >
            {report.daysMeetingThreshold}/7 дни
          </strong>
        </div>
      </div>

      {/* Главна оценка / Предупреждение за ароматизация или Зелен статус */}
      <div
        data-testid="protein-guard-status-banner"
        className={`mt-4 rounded-xl border p-4 ${bannerClasses}`}
      >
        <div className={`text-sm font-bold ${headlineTextClass}`}>
          {report.statusHeadline}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-slate-200">
          {report.statusMessage}
        </p>
      </div>

      {/* SVG 7-дневна графика (g/kg спрямо прага 1.8) + 14-дневни KPI метрики */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
            <span>Дневен протеин на кг тегло (g/kg)</span>
            <span className="font-mono text-[11px] tabular-nums text-emerald-400">
              Анаболен праг: {report.thresholdGPerKg.toFixed(1)} g/kg
            </span>
          </div>

          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            role="img"
            aria-label="7-дневна графика на протеина на килограм тегло спрямо анаболния праг 1.8 g/kg"
            className="w-full"
          >
            {/* Y-ос деления */}
            {[0, 1, 1.8, Math.round(maxY * 10) / 10].map((tick) => {
              const y = yForVal(tick);
              const isThreshold = tick === 1.8;
              return (
                <g key={tick}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={y}
                    y2={y}
                    stroke={
                      isThreshold
                        ? '#34D399'
                        : 'rgba(255,255,255,0.07)'
                    }
                    strokeDasharray={isThreshold ? '4 3' : undefined}
                    strokeWidth={isThreshold ? 1.3 : 1}
                  />
                  <text
                    x={padL - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={isThreshold ? '#34D399' : '#94A3B8'}
                    fontSize={9.5}
                    className="font-mono"
                  >
                    {tick.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {/* 7 стълба за завършените дни */}
            {report.days7d.map((day, idx) => {
              const slotW = plotW / report.days7d.length;
              const cx = padL + slotW * idx + slotW / 2;
              const barW = Math.min(26, slotW * 0.56);
              const baseLine = padT + plotH;
              const hasVal = day.proteinPerKg !== null;
              const barH = hasVal
                ? Math.max(3, baseLine - yForVal(day.proteinPerKg!))
                : 0;
              const fill = !hasVal
                ? 'transparent'
                : day.meetsThreshold
                  ? '#10B981'
                  : '#F59E0B';

              return (
                <g key={day.date}>
                  {hasVal ? (
                    <>
                      <rect
                        x={cx - barW / 2}
                        y={baseLine - barH}
                        width={barW}
                        height={barH}
                        rx={3}
                        fill={fill}
                        opacity={0.9}
                      />
                      <text
                        x={cx}
                        y={Math.max(10, baseLine - barH - 4)}
                        textAnchor="middle"
                        fill="#E2E8F0"
                        fontSize={9}
                        className="font-mono"
                      >
                        {day.proteinPerKg!.toFixed(1)}
                      </text>
                    </>
                  ) : (
                    <line
                      x1={cx - barW / 3}
                      x2={cx + barW / 3}
                      y1={baseLine - 1}
                      y2={baseLine - 1}
                      stroke="rgba(148,163,184,0.3)"
                      strokeWidth={1.5}
                    />
                  )}
                  <text
                    x={cx}
                    y={svgH - 7}
                    textAnchor="middle"
                    fill="#94A3B8"
                    fontSize={9.5}
                    className="font-mono"
                  >
                    {shortDayMonth(day.date)}
                  </text>
                </g>
              );
            })}

            {/* Невидим маркер на 1.8 g/kg за достъпност */}
            <circle
              cx={padL + plotW - 2}
              cy={thresholdY}
              r={2.5}
              fill="#34D399"
            />
          </svg>
        </div>

        {/* Дясна колона: 14-дневна кръстосана проверка тегло ↔ сила */}
        <div className="space-y-3 border-t border-white/10 pt-4 lg:col-span-5 lg:border-t-0 lg:border-l lg:pl-5 lg:pt-0">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-slate-400">Среден протеин (7 д.)</span>
            <span className="font-mono font-bold tabular-nums text-white">
              {report.avgProteinPerKg7d !== null
                ? `${report.avgProteinPerKg7d.toFixed(2)} g/kg`
                : '—'}
              {report.avgProteinGrams7d !== null
                ? ` (${report.avgProteinGrams7d} g)`
                : ''}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-white/8 pt-2.5 text-xs">
            <span className="text-slate-400">14-дн. тренд на теглото</span>
            <span
              className={`font-mono font-bold tabular-nums ${
                report.weightGainKgPerWeek !== null &&
                report.weightGainKgPerWeek > 0.4 &&
                !report.strengthIsGrowing
                  ? 'text-amber-300'
                  : 'text-white'
              }`}
            >
              {report.weightGainKgPerWeek !== null
                ? `${report.weightGainKgPerWeek >= 0 ? '+' : ''}${report.weightGainKgPerWeek.toFixed(2)} kg/седм.`
                : 'Нужни ≥2 седмици'}
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2 border-t border-white/8 pt-2.5 text-xs">
            <span className="text-slate-400">Силова прогресия (Hevy e1RM)</span>
            <span
              className={`font-mono font-bold tabular-nums ${
                report.strengthIsGrowing
                  ? 'text-emerald-400'
                  : report.strengthTrendPct !== null &&
                      report.strengthTrendPct < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
              }`}
            >
              {report.strengthTrendPct !== null
                ? `${report.strengthTrendPct >= 0 ? '+' : ''}${report.strengthTrendPct.toFixed(1)}% (${report.comparedExercisesCount} упр.)`
                : report.volumeTrendPct !== null
                  ? `${report.volumeTrendPct >= 0 ? '+' : ''}${report.volumeTrendPct.toFixed(1)}% обем`
                  : 'Недостатъчно сесии'}
            </span>
          </div>

          <p className="border-t border-white/8 pt-2.5 text-[11px] leading-relaxed text-slate-400">
            Праг за предупреждение: ръст на теглото &gt; 0.4 kg/седм. без силов ръст в Hevy → сигнал за излишно омазняване и повишена ароматизация.
          </p>
        </div>
      </div>
    </section>
  );
}
