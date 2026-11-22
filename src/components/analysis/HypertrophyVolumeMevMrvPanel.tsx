import { useMemo, useState } from 'react';
import type {
  CustomExerciseMappings,
  HevyWorkout,
} from '../../types/fitness';
import { formatBgNumericDate } from '../../utils/fitnessMath';
import {
  analyzeHypertrophyVolumeZones,
  type HypertrophyVolumeZone,
} from '../../utils/maleHealthAnalyticsEngine';

interface HypertrophyVolumeMevMrvPanelProps {
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
}

type ZoneFilter = 'all' | 'below_mev' | 'optimal' | 'above_mrv';

const MAX_SCALE_SETS = 24;

function getZoneBarColor(zone: HypertrophyVolumeZone): string {
  if (zone === 'optimal_mev_mav') return '#10B981';
  if (zone === 'above_mrv') return '#F43F5E';
  if (zone === 'near_mrv') return '#F59E0B';
  return '#38BDF8';
}

function getZoneTextClass(zone: HypertrophyVolumeZone): string {
  if (zone === 'optimal_mev_mav') return 'text-emerald-400';
  if (zone === 'above_mrv') return 'text-rose-400';
  if (zone === 'near_mrv') return 'text-amber-300';
  return 'text-sky-300';
}

export function HypertrophyVolumeMevMrvPanel({
  hevyWorkouts,
  todayKey,
  customExerciseMappings,
}: HypertrophyVolumeMevMrvPanelProps) {
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('all');

  const report = useMemo(
    () =>
      analyzeHypertrophyVolumeZones({
        hevyWorkouts,
        todayKey,
        customExerciseMappings,
      }),
    [hevyWorkouts, todayKey, customExerciseMappings],
  );

  const visibleGroups = useMemo(() => {
    if (zoneFilter === 'all') return report.groups;
    if (zoneFilter === 'below_mev') return report.belowMevGroups;
    if (zoneFilter === 'optimal') {
      return report.groups.filter(
        (g) => g.zone === 'optimal_mev_mav' || g.zone === 'near_mrv',
      );
    }
    return report.aboveMrvGroups;
  }, [report, zoneFilter]);

  const maxDisplaySets = useMemo(() => {
    const peak = Math.max(
      MAX_SCALE_SETS,
      ...report.groups.map((g) => Math.ceil(g.effectiveSets + 2)),
    );
    return Math.min(36, peak);
  }, [report.groups]);

  const mevX = (6 / maxDisplaySets) * 100;
  const mavX = (18 / maxDisplaySets) * 100;
  const mrvX = (20 / maxDisplaySets) * 100;

  return (
    <section
      data-testid="hypertrophy-mev-mrv-panel"
      aria-label="Хипертрофиен обем (MEV / MAV / MRV тракер)"
      className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие + филтри по зона */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Последни 7 завършени дни (до вчера)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-300">
              {formatBgNumericDate(report.windowStartDate)} –{' '}
              {formatBgNumericDate(report.windowEndDate)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {report.strengthWorkoutsCount} силови сесии
              {report.excludedBoxingCount > 0
                ? ` (${report.excludedBoxingCount} бокс изключени)`
                : ''}
            </span>
          </div>

          <h2 className="mt-1 font-display text-lg font-bold text-white sm:text-xl text-balance">
            📈 Хипертрофиен обем (MEV / MAV / MRV тракер)
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Дробно броене на работните серии (1.0 основен мускул + 0.5 второстепенен, без бокс) спрямо научните зони за мускулен растеж: Под MEV (&lt;6), Оптимална зона MEV–MAV (6–18) и Над MRV (&gt;20).
          </p>
        </div>

        <div
          role="group"
          aria-label="Филтър по зона на хипертрофийния обем"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 shrink-0"
        >
          <button
            type="button"
            data-testid="mev-filter-all"
            onClick={() => setZoneFilter('all')}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              zoneFilter === 'all'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Всички ({report.groups.length})
          </button>
          <button
            type="button"
            data-testid="mev-filter-below"
            onClick={() => setZoneFilter('below_mev')}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              zoneFilter === 'below_mev'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Под MEV ({report.belowMevGroups.length})
          </button>
          <button
            type="button"
            data-testid="mev-filter-optimal"
            onClick={() => setZoneFilter('optimal')}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              zoneFilter === 'optimal'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            MEV–MAV ({report.optimalGroups.length + report.nearMrvGroups.length})
          </button>
          <button
            type="button"
            data-testid="mev-filter-above"
            onClick={() => setZoneFilter('above_mrv')}
            className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              zoneFilter === 'above_mrv'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Над MRV ({report.aboveMrvGroups.length})
          </button>
        </div>
      </div>

      {/* Обобщена лента с легенда за зоните */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-sky-400" aria-hidden="true" />
            <span>Под MEV (&lt;6)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" />
            <span>MEV–MAV (6–18)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" aria-hidden="true" />
            <span>Граница MRV (18–20)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" aria-hidden="true" />
            <span>Над MRV (&gt;20)</span>
          </span>
        </div>

        <span className="font-mono text-[11px] tabular-nums text-slate-400">
          Общо ефективни серии: <strong className="text-white">{report.totalEffectiveSets}</strong>
        </span>
      </div>

      {/* Цветни хоризонтални SVG ленти по мускулна група */}
      {visibleGroups.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-[#141B27] p-5 text-center text-xs text-slate-400">
          Няма мускулни групи в избрания филтър за последните 7 завършени дни.
        </div>
      ) : (
        <div className="mt-4 divide-y divide-white/[0.06]">
          {visibleGroups.map((row) => {
            const barPct = Math.min(100, (row.effectiveSets / maxDisplaySets) * 100);
            const barColor = getZoneBarColor(row.zone);
            const statusTextClass = getZoneTextClass(row.zone);

            return (
              <div
                key={row.id}
                data-testid={`mev-mrv-row-${row.id}`}
                className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-12 sm:items-center sm:gap-4"
              >
                <div className="sm:col-span-3 min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    {row.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                    {row.primarySets} осн. + {row.secondarySets} вт.
                  </div>
                </div>

                {/* Вградена SVG лента със зони MEV / MAV / MRV */}
                <div className="sm:col-span-6">
                  <svg
                    viewBox="0 0 300 22"
                    role="img"
                    aria-label={`${row.label}: ${row.effectiveSets} серии (${row.zoneLabel})`}
                    className="h-5 w-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    {/* Зонови фонове */}
                    <rect
                      x={0}
                      y={4}
                      width={(mevX / 100) * 300}
                      height={12}
                      rx={3}
                      fill="rgba(56, 189, 248, 0.10)"
                    />
                    <rect
                      x={(mevX / 100) * 300}
                      y={4}
                      width={((mavX - mevX) / 100) * 300}
                      height={12}
                      fill="rgba(16, 185, 129, 0.14)"
                    />
                    <rect
                      x={(mavX / 100) * 300}
                      y={4}
                      width={((mrvX - mavX) / 100) * 300}
                      height={12}
                      fill="rgba(245, 158, 11, 0.14)"
                    />
                    <rect
                      x={(mrvX / 100) * 300}
                      y={4}
                      width={((100 - mrvX) / 100) * 300}
                      height={12}
                      rx={3}
                      fill="rgba(244, 63, 94, 0.12)"
                    />

                    {/* Текуща лента на обема */}
                    {row.effectiveSets > 0 && (
                      <rect
                        x={0}
                        y={6}
                        width={Math.max(4, (barPct / 100) * 300)}
                        height={8}
                        rx={3}
                        fill={barColor}
                      />
                    )}

                    {/* Прагови линии MEV (6), MAV (18), MRV (20) */}
                    <line
                      x1={(mevX / 100) * 300}
                      x2={(mevX / 100) * 300}
                      y1={1}
                      y2={19}
                      stroke="rgba(148, 163, 184, 0.6)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                    <line
                      x1={(mavX / 100) * 300}
                      x2={(mavX / 100) * 300}
                      y1={1}
                      y2={19}
                      stroke="rgba(16, 185, 129, 0.7)"
                      strokeWidth={1}
                      strokeDasharray="2 2"
                    />
                    <line
                      x1={(mrvX / 100) * 300}
                      x2={(mrvX / 100) * 300}
                      y1={1}
                      y2={19}
                      stroke="rgba(244, 63, 94, 0.85)"
                      strokeWidth={1.25}
                    />
                  </svg>
                  <div className="mt-0.5 flex items-center justify-between font-mono text-[10px] tabular-nums text-slate-500">
                    <span>0</span>
                    <span>MEV 6</span>
                    <span>MAV 18</span>
                    <span>MRV 20+</span>
                  </div>
                </div>

                {/* Точна стойност + статус */}
                <div className="sm:col-span-3 sm:text-right">
                  <div className="font-mono text-sm font-bold tabular-nums text-white">
                    {row.effectiveSets} сер.
                  </div>
                  <div className={`text-[11px] font-medium ${statusTextClass}`}>
                    {row.zoneLabel}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Обобщен извод за треньора */}
      <div className="mt-4 border-t border-white/10 pt-3.5 text-xs">
        <div
          className={`font-semibold ${
            report.coachSignal.severity === 'alert'
              ? 'text-rose-300'
              : report.coachSignal.severity === 'caution'
                ? 'text-amber-300'
                : report.coachSignal.severity === 'optimal'
                  ? 'text-emerald-400'
                  : 'text-slate-300'
          }`}
        >
          {report.coachSignal.headline}
        </div>
        <p className="mt-1 leading-relaxed text-slate-300">
          {report.coachSignal.detail}
        </p>
      </div>
    </section>
  );
}
