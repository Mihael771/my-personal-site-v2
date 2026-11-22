import { useMemo } from 'react';
import { Mountain } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import { computeEnduranceAndHillScore } from '../../utils/biometricPerformanceEngine';
import { formatBgNumericDate, formatNumberBg } from '../../utils/fitnessMath';

interface EnduranceHillScoreCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

function getScoreStrokeHex(score: number, hasData: boolean): string {
  if (!hasData) return '#475569';
  if (score >= 80) return '#10B981';
  if (score >= 60) return '#38BDF8';
  if (score >= 38) return '#F59E0B';
  return '#94A3B8';
}

export function EnduranceHillScoreCard({
  dailyLogs,
  todayKey,
}: EnduranceHillScoreCardProps) {
  const report = useMemo(
    () => computeEnduranceAndHillScore({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const { current30d, previous30d } = report;
  const strokeHex = getScoreStrokeHex(report.score, current30d.hasData);

  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    circumference - (Math.max(0, Math.min(100, report.score)) / 100) * circumference;

  const trendArrow =
    report.trendDirection === 'up'
      ? '▲'
      : report.trendDirection === 'down'
        ? '▼'
        : '→';

  const trendToneClass =
    report.trendDirection === 'up'
      ? 'text-emerald-400'
      : report.trendDirection === 'down'
        ? 'text-rose-400'
        : 'text-slate-400';

  return (
    <section
      data-testid="endurance-hill-score-card"
      aria-label="Endurance & Hill Score — Индекс за издръжливост и изкачване"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Ляво: Компактен SVG кръгов индекс 0–100 + тренд спрямо предходния месец */}
        <div className="flex items-center gap-4">
          <svg
            viewBox="0 0 92 92"
            className="h-[88px] w-[88px] shrink-0"
            role="img"
            aria-label={`Endurance & Hill Score: ${report.score} от 100`}
          >
            <circle
              cx="46"
              cy="46"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="8"
            />
            <circle
              cx="46"
              cy="46"
              r={radius}
              fill="none"
              stroke={strokeHex}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 46 46)"
            />
            <text
              x="46"
              y="47"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="22"
              fontWeight="800"
              className="font-mono tabular-nums"
            >
              {report.score}
            </text>
            <text
              x="46"
              y="62"
              textAnchor="middle"
              fill="#94A3B8"
              fontSize="9.5"
              className="font-mono"
            >
              / 100
            </text>
          </svg>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Mountain
                className="h-3.5 w-3.5 text-emerald-400"
                aria-hidden="true"
              />
              <span>
                Последни 30 дни ({formatBgNumericDate(current30d.startDate)} –{' '}
                {formatBgNumericDate(current30d.endDate)})
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-lg font-bold tracking-tight text-white">
                🏔️ Endurance &amp; Hill Score
              </h2>
              <span
                data-testid="endurance-hill-trend"
                className={`font-mono text-xs font-bold tabular-nums ${trendToneClass}`}
              >
                {report.trendDelta !== null
                  ? `${trendArrow} ${report.trendDelta > 0 ? '+' : ''}${report.trendDelta} т. спрямо предх. месец (${previous30d.score})`
                  : 'Първи проследен 30-дневен период'}
              </span>
            </div>

            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-300">
              <strong className="font-semibold text-white">
                {report.tierLabel}
              </strong>
              {' · '}
              {report.summaryText}
            </p>
          </div>
        </div>

        {/* Дясно: 3 компонента на индекса (Обем / Денивелация / Сърдечна ефективност) */}
        <div className="grid grid-cols-3 gap-4 border-t border-white/8 pt-4 lg:w-[440px] lg:shrink-0 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div>
            <div className="text-[11px] text-slate-400">Аеробен обем</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
              {formatNumberBg(current30d.aerobicMinutes)} мин
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-sky-300">
              {current30d.aerobicVolumeScore}/40 т. · {current30d.distanceKm} км
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Денивелация D+</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
              +{formatNumberBg(current30d.elevationGainM)} м
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-emerald-400">
              {current30d.hillClimbScore}/30 т.
              {current30d.avgVamMetersPerHour !== null
                ? ` · ${current30d.avgVamMetersPerHour} VAM`
                : ''}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-slate-400">Сърд. ефективност</div>
            <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
              {current30d.avgEfficiencyFactor !== null
                ? `${current30d.avgEfficiencyFactor} EF`
                : '—'}
            </div>
            <div className="mt-0.5 font-mono text-[11px] tabular-nums text-amber-300">
              {current30d.cardiacEfficiencyScore}/30 т.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
