import { useMemo, useState } from 'react';
import { BatteryCharging, Dumbbell, Flame } from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  computeBodyBatteryReport,
  type BodyBatteryTier,
} from '../../utils/biometricPerformanceEngine';
import { formatBgNumericDate, formatNumberBg } from '../../utils/fitnessMath';

interface BodyBatteryCardProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
}

function getBatteryColorHex(charge: number, hasData: boolean): string {
  if (!hasData) return '#64748B';
  if (charge >= 80) return '#10B981';
  if (charge >= 60) return '#38BDF8';
  if (charge >= 40) return '#F59E0B';
  return '#F43F5E';
}

function getTierTextClass(tier: BodyBatteryTier, hasData: boolean): string {
  if (!hasData) return 'text-slate-400';
  if (tier === 'peak') return 'text-emerald-400';
  if (tier === 'solid') return 'text-sky-400';
  if (tier === 'moderate') return 'text-amber-300';
  return 'text-rose-400';
}

export function BodyBatteryCard({
  dailyLogs,
  hevyWorkouts,
  todayKey,
}: BodyBatteryCardProps) {
  const report = useMemo(
    () =>
      computeBodyBatteryReport({
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, todayKey],
  );

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(
    Math.max(0, report.series7d.length - 1),
  );

  const clampedIndex = Math.min(
    selectedDayIndex,
    Math.max(0, report.series7d.length - 1),
  );
  const inspectedDay = report.series7d[clampedIndex] ?? null;

  const batteryColor = getBatteryColorHex(
    report.currentCharge,
    report.hasEnoughData,
  );
  const tierTextClass = getTierTextClass(report.tier, report.hasEnoughData);

  // Build 7-day sawtooth charge (morning peak) -> drain (evening low) SVG polyline
  const chartW = 520;
  const chartH = 162;
  const padL = 34;
  const padR = 16;
  const padT = 16;
  const padB = 26;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const nDays = Math.max(1, report.series7d.length);
  const dayStep = plotW / nDays;

  const yForPct = (pct: number) =>
    padT + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;

  const sawtoothCoords: Array<{
    x: number;
    y: number;
    kind: 'peak' | 'low';
    dayIdx: number;
    val: number;
  }> = [];

  report.series7d.forEach((pt, idx) => {
    const xMorning = padL + idx * dayStep + dayStep * 0.24;
    const xEvening = padL + idx * dayStep + dayStep * 0.78;
    sawtoothCoords.push({
      x: xMorning,
      y: yForPct(pt.morningPeak),
      kind: 'peak',
      dayIdx: idx,
      val: pt.morningPeak,
    });
    sawtoothCoords.push({
      x: xEvening,
      y: yForPct(pt.eveningLevel),
      kind: 'low',
      dayIdx: idx,
      val: pt.eveningLevel,
    });
  });

  const polylinePoints = sawtoothCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const areaPath =
    sawtoothCoords.length > 0
      ? `M ${sawtoothCoords[0].x.toFixed(1)} ${(padT + plotH).toFixed(1)} ` +
        sawtoothCoords
          .map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
          .join(' ') +
        ` L ${sawtoothCoords[sawtoothCoords.length - 1].x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
      : '';

  // Battery SVG fill geometry (0-100%)
  const batteryInnerMaxW = 132;
  const batteryFillW = Math.max(
    4,
    Math.round((report.currentCharge / 100) * batteryInnerMaxW),
  );

  return (
    <section
      data-testid="body-battery-card"
      aria-label="Body Battery — Жива батерия на енергията"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Горна заглавна линия */}
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <BatteryCharging
              className="h-4 w-4 text-emerald-400"
              aria-hidden="true"
            />
            <span>Сутрешно зареждане (Сън, Deep+REM, RHR, HRV)</span>
            <span aria-hidden="true">·</span>
            <span>Дневно изтощаване (Hevy + Часовник)</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold tracking-tight text-white sm:text-xl text-balance">
            ⚡ Body Battery — Жива батерия на енергията
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`font-semibold ${tierTextClass}`}>
            {report.tierLabel}
          </span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-slate-400">
            Днес ({formatBgNumericDate(todayKey)})
          </span>
        </div>
      </div>

      {/* Основна двуколонна решетка: SVG батерия + 7-дневна крива */}
      <div className="mt-5 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* Лява колона: Голям SVG индикатор на батерията + зареждане/изтощаване днес */}
        <div className="flex flex-col justify-between gap-4 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-5">
            <svg
              viewBox="0 0 184 86"
              className="h-[82px] w-[176px] shrink-0"
              role="img"
              aria-label={`Текущ заряд на Body Battery: ${report.currentCharge}%`}
            >
              <defs>
                <linearGradient id="bodyBatteryFillGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={batteryColor} stopOpacity="0.82" />
                  <stop offset="100%" stopColor={batteryColor} stopOpacity="1" />
                </linearGradient>
              </defs>
              {/* Корпус на батерията */}
              <rect
                x="4"
                y="6"
                width="156"
                height="74"
                rx="12"
                fill="#0B101A"
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="2.5"
              />
              {/* Плюс терминал */}
              <rect
                x="163"
                y="26"
                width="13"
                height="34"
                rx="4"
                fill="rgba(255,255,255,0.22)"
              />
              {/* Вътрешен фон */}
              <rect
                x="16"
                y="18"
                width={batteryInnerMaxW}
                height="50"
                rx="7"
                fill="rgba(255,255,255,0.05)"
              />
              {/* Активен заряд */}
              <rect
                x="16"
                y="18"
                width={batteryFillW}
                height="50"
                rx="7"
                fill="url(#bodyBatteryFillGrad)"
              />
              {/* Деления на 25 / 50 / 75% */}
              {[0.25, 0.5, 0.75].map((tick) => (
                <line
                  key={tick}
                  x1={16 + batteryInnerMaxW * tick}
                  y1="18"
                  x2={16 + batteryInnerMaxW * tick}
                  y2="68"
                  stroke="#0B101A"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                />
              ))}
              {/* Стойност в центъра */}
              <text
                x="82"
                y="51"
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize="24"
                fontWeight="800"
                className="font-mono tabular-nums"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85)' }}
              >
                {report.currentCharge}%
              </text>
            </svg>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="text-xs text-slate-400">Текущ енергиен резерв</div>
              <div className="flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-3xl font-extrabold text-white">
                  {report.currentCharge}
                </span>
                <span className="text-sm text-slate-400">/ 100</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
                <span className="text-emerald-400">
                  +{report.morningRechargeGain} зареждане
                </span>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-amber-300">
                  −{report.todayTotalDrain} изтощаване
                </span>
              </div>
            </div>
          </div>

          {/* 4 биометрични фактора като чиста таблична лента без вложени карти */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-white/8 pt-3.5 text-xs sm:grid-cols-4 lg:grid-cols-2">
            <div>
              <div className="text-slate-400">Последен сън</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                {report.factors.sleepHours !== null
                  ? `${formatNumberBg(report.factors.sleepHours)} ч`
                  : '—'}
                {report.factors.restorativeSleepPct !== null && (
                  <span className="ml-1.5 text-[11px] text-sky-300">
                    ({report.factors.restorativeSleepPct}% D+R)
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">Пулс в покой vs 30д</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                {report.factors.restingHr !== null
                  ? `${report.factors.restingHr} bpm`
                  : '—'}
                {report.factors.rhrDeltaBpm !== null && (
                  <span
                    className={`ml-1.5 text-[11px] ${
                      report.factors.rhrDeltaBpm <= 1
                        ? 'text-emerald-400'
                        : report.factors.rhrDeltaBpm <= 3
                          ? 'text-amber-300'
                          : 'text-rose-400'
                    }`}
                  >
                    ({report.factors.rhrDeltaBpm > 0 ? '+' : ''}
                    {report.factors.rhrDeltaBpm})
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">Сутрешен HRV vs база</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                {report.factors.hrv !== null ? `${report.factors.hrv} ms` : '—'}
                {report.factors.hrvDeltaPct !== null && (
                  <span
                    className={`ml-1.5 text-[11px] ${
                      report.factors.hrvDeltaPct >= -4
                        ? 'text-emerald-400'
                        : report.factors.hrvDeltaPct >= -12
                          ? 'text-amber-300'
                          : 'text-rose-400'
                    }`}
                  >
                    ({report.factors.hrvDeltaPct > 0 ? '+' : ''}
                    {report.factors.hrvDeltaPct}%)
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">Днешно изтощаване</div>
              <div className="mt-0.5 font-mono font-semibold tabular-nums text-white">
                Hevy −{report.todayStrengthDrain} · Час. −{report.todayWatchDrain}
              </div>
            </div>
          </div>
        </div>

        {/* Дясна колона: 7-дневна крива на зареждане (сутрин) и изтощаване (вечер) */}
        <div className="flex flex-col justify-between border-t border-white/8 pt-4 lg:col-span-7 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-xs font-semibold text-slate-200">
              7-дневна крива на зареждане и изтощаване
            </div>
            {inspectedDay && (
              <div className="font-mono text-[11px] tabular-nums text-slate-300">
                {inspectedDay.isToday
                  ? 'Днес'
                  : formatBgNumericDate(inspectedDay.date)}
                {' · '}
                <span className="text-emerald-400">
                  Пик {inspectedDay.morningPeak}%
                </span>
                {' → '}
                <span className="text-amber-300">
                  Край {inspectedDay.eveningLevel}%
                </span>
                {' · '}
                <span className="text-slate-400">
                  −{inspectedDay.totalDrain} разход
                </span>
              </div>
            )}
          </div>

          <div className="mt-2">
            <svg
              viewBox={`0 0 ${chartW} ${chartH}`}
              className="h-auto w-full"
              role="img"
              aria-label="7-дневна графика на Body Battery зареждане и изтощаване"
            >
              <defs>
                <linearGradient id="bbAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={batteryColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={batteryColor} stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Хоризонтални референтни линии 25 / 50 / 75 / 100 */}
              {[25, 50, 75, 100].map((lvl) => {
                const y = yForPct(lvl);
                return (
                  <g key={lvl}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={chartW - padR}
                      y2={y}
                      stroke="rgba(255,255,255,0.07)"
                      strokeDasharray={lvl === 50 ? '3 3' : undefined}
                    />
                    <text
                      x={padL - 6}
                      y={y + 3.5}
                      textAnchor="end"
                      fill="#64748B"
                      fontSize="10"
                      className="font-mono tabular-nums"
                    >
                      {lvl}
                    </text>
                  </g>
                );
              })}

              {/* Запълнена площ под кривата */}
              {areaPath && <path d={areaPath} fill="url(#bbAreaGrad)" />}

              {/* Свързваща назъбена линия (сутрешен пик -> вечерен спад) */}
              {polylinePoints && (
                <polyline
                  fill="none"
                  stroke={batteryColor}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylinePoints}
                />
              )}

              {/* Интерактивни колони за всеки от 7-те дни */}
              {report.series7d.map((pt, idx) => {
                const colX = padL + idx * dayStep;
                const centerX = colX + dayStep * 0.5;
                const xMorning = colX + dayStep * 0.24;
                const xEvening = colX + dayStep * 0.78;
                const isSelected = idx === clampedIndex;
                return (
                  <g
                    key={pt.date}
                    onClick={() => setSelectedDayIndex(idx)}
                    onMouseEnter={() => setSelectedDayIndex(idx)}
                    className="cursor-pointer"
                  >
                    <rect
                      x={colX}
                      y={padT}
                      width={dayStep}
                      height={plotH}
                      fill={
                        isSelected ? 'rgba(255,255,255,0.045)' : 'transparent'
                      }
                      rx="4"
                    />
                    {/* Сутрешен пик */}
                    <circle
                      cx={xMorning}
                      cy={yForPct(pt.morningPeak)}
                      r={isSelected ? 4 : 2.8}
                      fill="#10B981"
                      stroke="#0F141F"
                      strokeWidth="1.5"
                    />
                    {/* Вечерно ниво / текущо ниво днес */}
                    <circle
                      cx={xEvening}
                      cy={yForPct(pt.eveningLevel)}
                      r={isSelected ? 4.5 : 3}
                      fill={pt.isToday ? batteryColor : '#F59E0B'}
                      stroke="#0F141F"
                      strokeWidth="1.5"
                    />
                    <text
                      x={centerX}
                      y={chartH - 6}
                      textAnchor="middle"
                      fill={isSelected ? '#FFFFFF' : '#94A3B8'}
                      fontSize="10"
                      fontWeight={isSelected ? 700 : 500}
                      className="font-mono tabular-nums"
                    >
                      {pt.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Конкретна препоръка за днешния резерв: Тежка щанга vs Спаринг / Бокс */}
      <div className="mt-5 grid grid-cols-1 gap-4 border-t border-white/10 pt-4 md:grid-cols-2">
        <div className="flex items-start gap-3">
          <Dumbbell
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-text)]"
            aria-hidden="true"
          />
          <div>
            <div className="text-xs font-semibold text-white">
              Резерв за тежка щанга днес
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
              {report.barbellReserveText}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Flame
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
            aria-hidden="true"
          />
          <div>
            <div className="text-xs font-semibold text-white">
              Резерв за боксови рундове и спаринг
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
              {report.boxingReserveText}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
