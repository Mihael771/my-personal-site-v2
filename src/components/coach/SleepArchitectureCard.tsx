import { useMemo, useState } from 'react';
import { Moon } from 'lucide-react';
import type { DailyBiometricLog } from '../../types/fitness';
import { formatBgNumericDate } from '../../utils/fitnessMath';
import {
  analyzeSleepArchitecture,
  type SleepStageStatus,
} from '../../utils/maleHealthAnalyticsEngine';

interface SleepArchitectureCardProps {
  dailyLogs: DailyBiometricLog[];
  todayKey: string;
}

type SleepViewScope = 'last_night' | 'avg_7d';

function getStageBarColor(status: SleepStageStatus, fallback: string): string {
  if (status === 'optimal') return '#10B981';
  if (status === 'borderline') return '#F59E0B';
  if (status === 'low') return '#F43F5E';
  return fallback;
}

function getStageTextClass(status: SleepStageStatus): string {
  if (status === 'optimal') return 'text-emerald-400';
  if (status === 'borderline') return 'text-amber-300';
  if (status === 'low') return 'text-rose-400';
  return 'text-slate-400';
}

function formatDurationMinutes(mins: number | null): string {
  if (mins === null || mins <= 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}ч ${String(m).padStart(2, '0')}м` : `${m}м`;
}

export function SleepArchitectureCard({
  dailyLogs,
  todayKey,
}: SleepArchitectureCardProps) {
  const [scope, setScope] = useState<SleepViewScope>('last_night');

  const report = useMemo(
    () => analyzeSleepArchitecture({ dailyLogs, todayKey }),
    [dailyLogs, todayKey],
  );

  const activeDeepPct =
    scope === 'last_night' ? report.lastNight.deepPct : report.avg7d.avgDeepPct;
  const activeRemPct =
    scope === 'last_night' ? report.lastNight.remPct : report.avg7d.avgRemPct;
  const activeDeepMins =
    scope === 'last_night'
      ? report.lastNight.deepMinutes
      : report.avg7d.avgDeepMinutes;
  const activeRemMins =
    scope === 'last_night'
      ? report.lastNight.remMinutes
      : report.avg7d.avgRemMinutes;
  const activeTotalHours =
    scope === 'last_night'
      ? report.lastNight.totalSleepHours
      : report.avg7d.avgTotalSleepHours;
  const activeDeepStatus =
    scope === 'last_night'
      ? report.lastNight.deepStatus
      : report.avg7d.deepStatus;
  const activeRemStatus =
    scope === 'last_night' ? report.lastNight.remStatus : report.avg7d.remStatus;

  const deepMaxScale = 35;
  const remMaxScale = 35;
  const deepFillPct =
    activeDeepPct !== null ? Math.min(100, (activeDeepPct / deepMaxScale) * 100) : 0;
  const remFillPct =
    activeRemPct !== null ? Math.min(100, (activeRemPct / remMaxScale) * 100) : 0;
  const deepTargetX = (18 / deepMaxScale) * 280;
  const deepIdealX = (20 / deepMaxScale) * 280;
  const remTargetX = (20 / remMaxScale) * 280;

  return (
    <section
      data-testid="sleep-architecture-card"
      aria-label="Архитектура на съня и нощен анаболен пик"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + превключвател Последна нощ / 7-дн. средно */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Moon className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
            <span>
              Huawei Watch GT 6 ·{' '}
              {scope === 'last_night'
                ? report.lastNight.date
                  ? `Последна нощ (${formatBgNumericDate(report.lastNight.date)})`
                  : 'Последна нощ'
                : `7-дн. средно (${formatBgNumericDate(report.windowStartDate)} – ${formatBgNumericDate(report.windowEndDate)})`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-300">
              Общ сън: {activeTotalHours !== null ? `${activeTotalHours} ч` : '—'}
            </span>
          </div>
          <h3 className="mt-1 font-display text-base font-bold text-white sm:text-lg text-balance">
            🌙 Архитектура на съня и нощен анаболен пик
          </h3>
        </div>

        <div
          role="group"
          aria-label="Период за архитектура на съня"
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 shrink-0"
        >
          <button
            type="button"
            data-testid="sleep-arch-scope-last"
            onClick={() => setScope('last_night')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              scope === 'last_night'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Последна нощ
          </button>
          <button
            type="button"
            data-testid="sleep-arch-scope-7d"
            onClick={() => setScope('avg_7d')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              scope === 'avg_7d'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            7-дн. средно ({report.daysWithStages7d}/7)
          </button>
        </div>
      </div>

      {/* Визуални SVG ленти за Deep и REM сън */}
      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* 1. Дълбок сън (GH + Тестостерон) */}
        <div data-testid="sleep-arch-deep-bar">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white">
                Дълбок сън (GH и сутрешен тестостерон)
              </div>
              <div className="text-[11px] text-slate-400">
                Оптимум ≥ 18–20% от общия сън
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <span
                className={`text-base font-bold ${getStageTextClass(activeDeepStatus)}`}
              >
                {activeDeepPct !== null ? `${activeDeepPct}%` : '—'}
              </span>
              <span className="ml-1.5 text-[11px] text-slate-400">
                ({formatDurationMinutes(activeDeepMins)})
              </span>
            </div>
          </div>

          <svg
            viewBox="0 0 280 24"
            role="img"
            aria-label={`Дълбок сън: ${activeDeepPct !== null ? `${activeDeepPct}%` : 'няма данни'}`}
            className="mt-2 h-6 w-full"
            preserveAspectRatio="none"
          >
            <rect
              x={0}
              y={5}
              width={280}
              height={12}
              rx={4}
              fill="rgba(255,255,255,0.06)"
            />
            {/* Оптимална зона 18–35% */}
            <rect
              x={deepTargetX}
              y={5}
              width={280 - deepTargetX}
              height={12}
              rx={4}
              fill="rgba(16, 185, 129, 0.14)"
            />
            {activeDeepPct !== null && activeDeepPct > 0 && (
              <rect
                x={0}
                y={7}
                width={Math.max(4, (deepFillPct / 100) * 280)}
                height={8}
                rx={3}
                fill={getStageBarColor(activeDeepStatus, '#38BDF8')}
              />
            )}
            <line
              x1={deepTargetX}
              x2={deepTargetX}
              y1={2}
              y2={20}
              stroke="#34D399"
              strokeWidth={1.25}
              strokeDasharray="2 2"
            />
            <line
              x1={deepIdealX}
              x2={deepIdealX}
              y1={2}
              y2={20}
              stroke="rgba(52, 211, 153, 0.55)"
              strokeWidth={1}
            />
          </svg>
          <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
            <span>0%</span>
            <span className="text-emerald-400/90">Цел 18–20%+</span>
            <span>35%</span>
          </div>
        </div>

        {/* 2. REM сън (ЦНС и боксови рефлекси) */}
        <div data-testid="sleep-arch-rem-bar">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white">
                REM сън (ЦНС и рефлекси в бокса)
              </div>
              <div className="text-[11px] text-slate-400">
                Оптимум ≥ 20% от общия сън
              </div>
            </div>
            <div className="text-right font-mono tabular-nums">
              <span
                className={`text-base font-bold ${getStageTextClass(activeRemStatus)}`}
              >
                {activeRemPct !== null ? `${activeRemPct}%` : '—'}
              </span>
              <span className="ml-1.5 text-[11px] text-slate-400">
                ({formatDurationMinutes(activeRemMins)})
              </span>
            </div>
          </div>

          <svg
            viewBox="0 0 280 24"
            role="img"
            aria-label={`REM сън: ${activeRemPct !== null ? `${activeRemPct}%` : 'няма данни'}`}
            className="mt-2 h-6 w-full"
            preserveAspectRatio="none"
          >
            <rect
              x={0}
              y={5}
              width={280}
              height={12}
              rx={4}
              fill="rgba(255,255,255,0.06)"
            />
            {/* Оптимална зона 20–35% */}
            <rect
              x={remTargetX}
              y={5}
              width={280 - remTargetX}
              height={12}
              rx={4}
              fill="rgba(16, 185, 129, 0.14)"
            />
            {activeRemPct !== null && activeRemPct > 0 && (
              <rect
                x={0}
                y={7}
                width={Math.max(4, (remFillPct / 100) * 280)}
                height={8}
                rx={3}
                fill={getStageBarColor(activeRemStatus, '#A78BFA')}
              />
            )}
            <line
              x1={remTargetX}
              x2={remTargetX}
              y1={2}
              y2={20}
              stroke="#34D399"
              strokeWidth={1.25}
              strokeDasharray="2 2"
            />
          </svg>
          <div className="flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
            <span>0%</span>
            <span className="text-emerald-400/90">Цел 20%+</span>
            <span>35%</span>
          </div>
        </div>
      </div>

      {/* Конкретен извод за днес: мускулен синтез + боксови реакции */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <div
          className={`text-xs font-semibold ${
            report.overallStatus === 'optimal'
              ? 'text-emerald-400'
              : report.overallStatus === 'borderline'
                ? 'text-amber-300'
                : report.overallStatus === 'low'
                  ? 'text-rose-300'
                  : 'text-slate-300'
          }`}
        >
          {report.todayImpactHeadline}
        </div>
        <div className="mt-2.5 grid grid-cols-1 gap-4 text-xs leading-relaxed text-slate-300 md:grid-cols-2">
          <div>
            <div className="font-semibold text-white">
              Мускулен синтез и хормонален пик днес
            </div>
            <p className="mt-1">{report.muscleSynthesisNote}</p>
          </div>
          <div className="md:border-l md:border-white/10 md:pl-4">
            <div className="font-semibold text-white">
              Нервна система и острота на реакциите в бокса
            </div>
            <p className="mt-1">{report.boxingReflexNote}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
