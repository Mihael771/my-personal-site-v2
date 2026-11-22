import { useMemo, useState } from 'react';
import { Clock, MoonStar, Sparkles } from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  computeSleepCoachingChronotypeReport,
  type CircadianStabilityStatus,
} from '../../utils/vitalsAndSleepCoachingEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface SleepCoachingChronotypeCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}

function getStabilityStyle(status: CircadianStabilityStatus): {
  textClass: string;
  accentHex: string;
} {
  if (status === 'stable') {
    return { textClass: 'text-emerald-300', accentHex: '#34D399' };
  }
  if (status === 'moderate') {
    return { textClass: 'text-amber-300', accentHex: '#FBBF24' };
  }
  if (status === 'irregular') {
    return { textClass: 'text-rose-300', accentHex: '#FB7185' };
  }
  return { textClass: 'text-slate-400', accentHex: '#64748B' };
}

/**
 * Maps clock minutes onto a continuous evening-to-morning axis centered on sleep:
 * 20:00 (1200) -> 0h offset ... 11:00 next day (660 + 1440 = 2100) -> 15h offset.
 */
function clockMinToNocturnalAxisHours(minutes: number): number {
  const shifted = minutes < 14 * 60 ? minutes + 1440 : minutes;
  const relativeMin = shifted - 20 * 60; // 0 = 20:00, 900 = 11:00
  return Math.max(0, Math.min(15, relativeMin / 60));
}

export function SleepCoachingChronotypeCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
}: SleepCoachingChronotypeCardProps) {
  const report = useMemo(
    () =>
      computeSleepCoachingChronotypeReport({
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, todayKey],
  );

  const [selectedNightIdx, setSelectedNightIdx] = useState<number>(
    Math.max(0, report.nights.length - 1),
  );

  const clampedIdx = Math.min(
    Math.max(0, selectedNightIdx),
    Math.max(0, report.nights.length - 1),
  );
  const inspectedNight = report.nights[clampedIdx] ?? null;
  const stabilityStyle = getStabilityStyle(report.stabilityStatus);

  // 14-night circadian timeline SVG geometry
  const svgW = 580;
  const svgH = 192;
  const padL = 44;
  const padR = 16;
  const padT = 16;
  const padB = 28;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  // Vertical axis: 20:00 (top = 0h) to 11:00 (bottom = 15h)
  const yForAxisHour = (h: number) => padT + (h / 15) * plotH;

  const avgBedY =
    report.avgBedtimeMin !== null
      ? yForAxisHour(clockMinToNocturnalAxisHours(report.avgBedtimeMin))
      : null;
  const avgWakeY =
    report.avgWakeTimeMin !== null
      ? yForAxisHour(clockMinToNocturnalAxisHours(report.avgWakeTimeMin))
      : null;

  const axisTicks = [
    { h: 2, label: '22:00' },
    { h: 4, label: '00:00' },
    { h: 7, label: '03:00' },
    { h: 10, label: '06:00' },
    { h: 13, label: '09:00' },
  ];

  const sourceSummary =
    report.intervalsDirectNights > 0 && report.estimatedNights > 0
      ? `${report.intervalsDirectNights} нощи от Intervals.icu · ${report.estimatedNights} авто-реконструирани`
      : report.intervalsDirectNights > 0
        ? `Точни часове от Intervals.icu (${report.intervalsDirectNights} нощи)`
        : report.nightsAnalyzed > 0
          ? `Автоматичен модел по наличния сън (${report.nightsAnalyzed} нощи)`
          : 'Очаква нощи за анализ';

  return (
    <section
      data-testid="sleep-coaching-chronotype-card"
      aria-label="Sleep Coaching и Хронотип — Циркадна стабилност"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавна линия */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <MoonStar
              className="h-4 w-4 text-sky-400 shrink-0"
              aria-hidden="true"
            />
            <span>Последни 14 завършени нощи</span>
            <span aria-hidden="true">·</span>
            <span>{sourceSummary}</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            🦉 Sleep Coaching и Хронотип — Циркадна стабилност
          </h2>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Clock
            className="h-3.5 w-3.5 text-slate-400 shrink-0"
            aria-hidden="true"
          />
          <span
            data-testid="circadian-stability-label"
            className={`font-semibold ${stabilityStyle.textClass}`}
          >
            {report.stabilityLabel}
          </span>
        </div>
      </div>

      {/* Горна сводка: Хронотип + Средно отклонение (цел < ±30 мин) + Оптимален прозорец */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Лява колона: Хронотип + ключови метрики + препоръчан прозорец */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-5">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-2xl" aria-hidden="true">
                {report.chronotypeEmoji}
              </span>
              <div>
                <div className="text-[11px] font-medium text-slate-400">
                  Определен хронотип
                </div>
                <h3
                  data-testid="chronotype-title"
                  className="font-display text-base font-bold text-white"
                >
                  {report.chronotypeTitle}
                </h3>
              </div>
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              {report.chronotypeDescription}
            </p>
          </div>

          {/* 3 таблични циркадни показателя */}
          <div className="grid grid-cols-3 gap-3 border-t border-white/8 pt-3.5">
            <div>
              <div className="text-[11px] text-slate-400">Отклонение</div>
              <div
                data-testid="circadian-avg-deviation"
                className={`mt-0.5 font-mono text-lg font-extrabold tabular-nums ${stabilityStyle.textClass}`}
              >
                {report.avgDeviationMin !== null
                  ? `±${report.avgDeviationMin} м`
                  : '—'}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                Цел &lt; ±{report.targetDeviationMin} мин
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400">Средно лягане</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-white">
                {report.avgBedtimeLabel}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                {report.withinTargetCount}/{report.nightsAnalyzed} в целта
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-400">Средно ставане</div>
              <div className="mt-0.5 font-mono text-lg font-extrabold tabular-nums text-white">
                {report.avgWakeTimeLabel}
              </div>
              <div className="font-mono text-[10px] tabular-nums text-slate-500">
                {report.avgSleepHours !== null
                  ? `Ср. ${report.avgSleepHours} ч сън`
                  : '—'}
              </div>
            </div>
          </div>

          {/* Препоръчан прозорец за максимален Deep Sleep */}
          <div className="border-t border-white/10 pt-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <Sparkles
                className="h-3.5 w-3.5 text-emerald-400 shrink-0"
                aria-hidden="true"
              />
              <span>Препоръчан прозорец за максимален Deep Sleep</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs tabular-nums">
              <span className="text-sky-300">
                Лягане: <strong className="text-white">{report.recommendedBedtimeWindow}</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-emerald-300">
                Събуждане: <strong className="text-white">{report.recommendedWakeWindow}</strong>
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
              {report.deepSleepTip}
            </p>
          </div>
        </div>

        {/* Дясна колона: 14-дневна SVG циркадна диаграма */}
        <div className="flex flex-col justify-between border-t border-white/10 pt-4 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-200">
              14-дневен прозорец на лягане и събуждане
            </span>
            {inspectedNight ? (
              <span className="font-mono text-[11px] tabular-nums text-slate-300">
                {inspectedNight.weekdayShort}{' '}
                {formatBgNumericDate(inspectedNight.date)} ·{' '}
                <strong className="text-white">
                  {inspectedNight.bedtimeLabel} → {inspectedNight.wakeTimeLabel}
                </strong>{' '}
                ({inspectedNight.sleepHours} ч · ±{inspectedNight.deviationMin}{' '}
                мин)
              </span>
            ) : (
              <span className="font-mono text-[11px] text-slate-400">
                Очаква записи за съня
              </span>
            )}
          </div>

          {report.nights.length === 0 ? (
            <div className="mt-4 flex h-[170px] items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-slate-400">
              Няма записани нощи в последните 14 дни.
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="mt-2 h-auto w-full"
              role="img"
              aria-label="14-дневна циркадна графика на часовете за лягане и събуждане"
            >
              {/* Хоризонтални часови линии */}
              {axisTicks.map((t) => {
                const y = yForAxisHour(t.h);
                return (
                  <g key={t.label}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={svgW - padR}
                      y2={y}
                      stroke="rgba(255,255,255,0.07)"
                      strokeDasharray={t.label === '00:00' ? '3 3' : undefined}
                    />
                    <text
                      x={padL - 7}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#64748B"
                      fontSize="9.5"
                      className="font-mono tabular-nums"
                    >
                      {t.label}
                    </text>
                  </g>
                );
              })}

              {/* Средна линия на лягане и събуждане (±30 мин коридор) */}
              {avgBedY !== null && (
                <line
                  x1={padL}
                  y1={avgBedY}
                  x2={svgW - padR}
                  y2={avgBedY}
                  stroke="#38BDF8"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
              )}
              {avgWakeY !== null && (
                <line
                  x1={padL}
                  y1={avgWakeY}
                  x2={svgW - padR}
                  y2={avgWakeY}
                  stroke="#34D399"
                  strokeOpacity="0.45"
                  strokeWidth="1.2"
                  strokeDasharray="4 3"
                />
              )}

              {/* Вертикални нощни блокове (лягане -> ставане) */}
              {report.nights.map((night, idx) => {
                const nCount = Math.max(1, report.nights.length);
                const slotW = plotW / nCount;
                const colX = padL + idx * slotW;
                const barW = Math.min(20, Math.max(8, slotW * 0.46));
                const barX = colX + (slotW - barW) / 2;

                const bedH = clockMinToNocturnalAxisHours(night.bedtimeMin);
                const wakeH = clockMinToNocturnalAxisHours(night.wakeTimeMin);
                const yTop = yForAxisHour(Math.min(bedH, wakeH));
                const yBot = yForAxisHour(Math.max(bedH, wakeH));
                const h = Math.max(8, yBot - yTop);
                const isSelected = idx === clampedIdx;

                const fillHex = night.withinTarget30m ? '#34D399' : '#FBBF24';

                return (
                  <g
                    key={night.date}
                    onClick={() => setSelectedNightIdx(idx)}
                    onMouseEnter={() => setSelectedNightIdx(idx)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={colX}
                      y={padT}
                      width={slotW}
                      height={plotH}
                      rx="4"
                      fill={
                        isSelected ? 'rgba(255,255,255,0.05)' : 'transparent'
                      }
                    />
                    <rect
                      x={barX}
                      y={yTop}
                      width={barW}
                      height={h}
                      rx="4"
                      fill={fillHex}
                      fillOpacity={isSelected ? 0.92 : 0.68}
                    />
                    <text
                      x={colX + slotW / 2}
                      y={svgH - 8}
                      textAnchor="middle"
                      fill={isSelected ? '#FFFFFF' : '#94A3B8'}
                      fontSize="9"
                      fontWeight={isSelected ? 700 : 500}
                      className="font-mono tabular-nums"
                    >
                      {nCount <= 9 || idx % 2 === 0 || idx === nCount - 1
                        ? night.shortLabel
                        : ''}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>
              <span className="text-emerald-300">■ В целта (≤ ±30 мин)</span> ·{' '}
              <span className="text-amber-300">■ Отклонение (&gt; ±30 мин)</span>
            </span>
            <span className="font-mono tabular-nums">
              {inspectedNight?.deepRemPct !== null &&
              inspectedNight?.deepRemPct !== undefined
                ? `Deep+REM: ${Math.round(inspectedNight.deepRemPct)}%`
                : 'Пунктир: 14д средно лягане/ставане'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
