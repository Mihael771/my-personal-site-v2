import { useMemo } from 'react';
import { HeartPulse } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import { formatBgNumericDate } from '../../utils/fitnessMath';
import { analyzeCardioVascularHealth } from '../../utils/maleHealthAnalyticsEngine';

interface CardioVascularHealthCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

export function CardioVascularHealthCard({
  dailyLogs,
  todayKey,
}: CardioVascularHealthCardProps) {
  const report = useMemo(
    () => analyzeCardioVascularHealth({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const gaugeRadius = 46;
  const gaugeCirc = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCirc - (report.score / 100) * gaugeCirc;
  const gaugeColor =
    report.zone === 'optimal'
      ? '#10B981'
      : report.zone === 'good'
        ? '#38BDF8'
        : report.zone === 'caution'
          ? '#F59E0B'
          : '#64748B';

  const zoneTextClass =
    report.zone === 'optimal'
      ? 'text-emerald-400'
      : report.zone === 'good'
        ? 'text-sky-300'
        : report.zone === 'caution'
          ? 'text-amber-300'
          : 'text-slate-400';

  return (
    <section
      data-testid="cardiovascular-health-card"
      aria-label="Съдово здраве и кръвоснабдяване"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + 7 д. срещу 30 д. контекст */}
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-5">
          {/* Вграден SVG радиален индикатор 0–100% */}
          <svg
            width={112}
            height={112}
            viewBox="0 0 112 112"
            role="img"
            aria-label={`Индекс на съдово и кардио-метаболитно здраве: ${report.hasData ? `${report.score}%` : 'няма данни'}`}
            className="shrink-0"
          >
            <circle
              cx={56}
              cy={56}
              r={gaugeRadius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={9}
            />
            {report.hasData && (
              <circle
                cx={56}
                cy={56}
                r={gaugeRadius}
                fill="none"
                stroke={gaugeColor}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={gaugeCirc}
                strokeDashoffset={gaugeOffset}
                transform="rotate(-90 56 56)"
              />
            )}
            <text
              x={56}
              y={55}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={22}
              fontWeight={800}
              className="font-mono tabular-nums"
            >
              {report.hasData ? `${report.score}%` : '—'}
            </text>
            <text
              x={56}
              y={71}
              textAnchor="middle"
              fill="#94A3B8"
              fontSize={10}
            >
              GT 6 индекс
            </text>
          </svg>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <HeartPulse
                className="h-3.5 w-3.5 text-rose-400 shrink-0"
                aria-hidden="true"
              />
              <span>
                Сравнение 7 д. ({formatBgNumericDate(report.window7dStart)} –{' '}
                {formatBgNumericDate(report.windowEndDate)}) спрямо 30-дн. база
              </span>
            </div>
            <h3 className="mt-1 font-display text-lg font-bold text-white text-balance">
              ❤️ Съдово здраве и кръвоснабдяване
            </h3>
            <p className={`mt-1 text-xs font-semibold ${zoneTextClass}`}>
              {report.zoneLabel}
            </p>
          </div>
        </div>

        {/* 3 компактни метрики: RHR, HRV стабилност, Сърдечна ефективност */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[560px] shrink-0">
          <div className="border-t border-white/10 pt-2.5 sm:border-t-0 sm:border-l sm:pl-3.5 sm:pt-0">
            <div className="text-[11px] font-medium text-slate-400">
              Сутрешен RHR (7д / 30д)
            </div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
              {report.rhr.avg7d !== null
                ? `${report.rhr.avg7d} bpm`
                : report.rhr.avg30d !== null
                  ? `${report.rhr.avg30d} bpm`
                  : '—'}
              {report.rhr.deltaBpm !== null && (
                <span
                  className={`ml-1.5 text-xs font-semibold ${
                    report.rhr.deltaBpm <= 0
                      ? 'text-emerald-400'
                      : report.rhr.deltaBpm >= 3
                        ? 'text-rose-400'
                        : 'text-amber-300'
                  }`}
                >
                  ({report.rhr.deltaBpm >= 0 ? '+' : ''}
                  {report.rhr.deltaBpm})
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {report.rhr.summary}
            </div>
          </div>

          <div className="border-t border-white/10 pt-2.5 sm:border-t-0 sm:border-l sm:pl-3.5 sm:pt-0">
            <div className="text-[11px] font-medium text-slate-400">
              HRV и стабилност
            </div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
              {report.hrv.avg7d !== null
                ? `${report.hrv.avg7d} ms`
                : report.hrv.avg30d !== null
                  ? `${report.hrv.avg30d} ms`
                  : '—'}
              {report.hrv.deltaPct !== null && (
                <span
                  className={`ml-1.5 text-xs font-semibold ${
                    report.hrv.deltaPct >= 0
                      ? 'text-emerald-400'
                      : report.hrv.deltaPct <= -10
                        ? 'text-rose-400'
                        : 'text-amber-300'
                  }`}
                >
                  ({report.hrv.deltaPct >= 0 ? '+' : ''}
                  {report.hrv.deltaPct}%)
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {report.hrv.summary}
            </div>
          </div>

          <div className="border-t border-white/10 pt-2.5 sm:border-t-0 sm:border-l sm:pl-3.5 sm:pt-0">
            <div className="text-[11px] font-medium text-slate-400">
              Сърдечна ефективност
            </div>
            <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
              {report.cardiacEfficiency.avg7dMetersPerBeat !== null
                ? `${report.cardiacEfficiency.avg7dMetersPerBeat} м/уд.`
                : report.cardiacEfficiency.avg30dMetersPerBeat !== null
                  ? `${report.cardiacEfficiency.avg30dMetersPerBeat} м/уд.`
                  : '—'}
              {report.cardiacEfficiency.trendPct !== null && (
                <span
                  className={`ml-1.5 text-xs font-semibold ${
                    report.cardiacEfficiency.trendPct >= 0
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                  }`}
                >
                  ({report.cardiacEfficiency.trendPct >= 0 ? '+' : ''}
                  {report.cardiacEfficiency.trendPct}%)
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400">
              {report.cardiacEfficiency.summary}
            </div>
          </div>
        </div>
      </div>

      {/* 3 практически ефекта: напомпване, рундове на бокса, дългосрочно сърце */}
      <div className="mt-4 grid grid-cols-1 gap-4 text-xs leading-relaxed text-slate-300 md:grid-cols-3">
        <div>
          <div className="font-semibold text-white">
            Напомпване и хранителни вещества
          </div>
          <p className="mt-1">{report.effects.musclePumpAndNutrients}</p>
        </div>

        <div className="border-t border-white/10 pt-3 md:border-t-0 md:border-l md:pl-4 md:pt-0">
          <div className="font-semibold text-white">
            Сваляне на пулса между рундовете на бокса
          </div>
          <p className="mt-1">{report.effects.boxingRoundRecovery}</p>
        </div>

        <div className="border-t border-white/10 pt-3 md:border-t-0 md:border-l md:pl-4 md:pt-0">
          <div className="font-semibold text-white">
            Дългосрочно здраве на сърцето
          </div>
          <p className="mt-1">{report.effects.longTermHeartHealth}</p>
        </div>
      </div>
    </section>
  );
}
