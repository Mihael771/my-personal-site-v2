import { useMemo, useState } from 'react';
import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  DetailedMuscleId,
  DetailedMuscleRecoveryItem,
  HevyWorkout,
  MuscleRecoveryZoneStatus,
} from '../../types/fitness';
import {
  computeDetailedMuscleRecovery,
  findHighStepsLast24h,
} from '../../utils/analysisPrep';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';

interface MuscleRecoveryTabProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  customExerciseMappings?: CustomExerciseMappings;
  onNavigateToHevy: () => void;
}

const STATUS_STYLE: Record<
  MuscleRecoveryZoneStatus,
  {
    fill: string;
    fillSelected: string;
    stroke: string;
    textClass: string;
    dotColor: string;
    borderClass: string;
    bgClass: string;
  }
> = {
  fatigued: {
    fill: 'rgba(220, 38, 38, 0.72)',
    fillSelected: 'rgba(239, 68, 68, 0.92)',
    stroke: '#fca5a5',
    textClass: 'text-rose-300',
    dotColor: '#ef4444',
    borderClass: 'border-rose-500/40',
    bgClass: 'bg-rose-950/20',
  },
  recovering: {
    fill: 'rgba(217, 119, 6, 0.72)',
    fillSelected: 'rgba(245, 158, 11, 0.92)',
    stroke: '#fcd34d',
    textClass: 'text-amber-300',
    dotColor: '#f59e0b',
    borderClass: 'border-amber-500/40',
    bgClass: 'bg-amber-950/20',
  },
  recovered: {
    fill: 'rgba(22, 163, 74, 0.65)',
    fillSelected: 'rgba(34, 197, 94, 0.88)',
    stroke: '#86efac',
    textClass: 'text-emerald-300',
    dotColor: '#22c55e',
    borderClass: 'border-emerald-500/35',
    bgClass: 'bg-emerald-950/20',
  },
};

function formatHoursText(hours: number | null): string {
  if (hours === null) return 'Няма скорошна тренировка';
  if (hours < 24) return `${formatNumberBg(hours)} ч`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  return `${formatNumberBg(hours)} ч (${days} д. ${remHours} ч)`;
}

export function MuscleRecoveryTab({
  hevyWorkouts,
  dailyLogs = [],
  customExerciseMappings,
  onNavigateToHevy,
}: MuscleRecoveryTabProps) {
  const [selectedMuscleId, setSelectedMuscleId] =
    useState<DetailedMuscleId>('chest');
  const [hoveredMuscleId, setHoveredMuscleId] =
    useState<DetailedMuscleId | null>(null);

  const recoveryItems = useMemo(
    () =>
      computeDetailedMuscleRecovery(
        hevyWorkouts,
        Date.now(),
        dailyLogs,
        customExerciseMappings,
      ),
    [hevyWorkouts, dailyLogs, customExerciseMappings],
  );

  const highSteps24h = useMemo(
    () => findHighStepsLast24h(dailyLogs),
    [dailyLogs],
  );

  const recoveryMap = useMemo(() => {
    const map = {} as Record<DetailedMuscleId, DetailedMuscleRecoveryItem>;
    for (const item of recoveryItems) {
      map[item.id] = item;
    }
    return map;
  }, [recoveryItems]);

  const activeMuscleId = hoveredMuscleId ?? selectedMuscleId;
  const activeMuscle = recoveryMap[activeMuscleId] ?? recoveryItems[0];

  const summaryCounts = useMemo(() => {
    let fatigued = 0;
    let recovering = 0;
    let recovered = 0;
    for (const item of recoveryItems) {
      if (item.status === 'fatigued') fatigued += 1;
      else if (item.status === 'recovering') recovering += 1;
      else recovered += 1;
    }
    return { fatigued, recovering, recovered };
  }, [recoveryItems]);

  function zoneProps(id: DetailedMuscleId, prefix: 'front' | 'back') {
    const item = recoveryMap[id];
    const style = STATUS_STYLE[item.status];
    const isActive = activeMuscleId === id;
    return {
      role: 'button' as const,
      tabIndex: 0,
      'data-testid': `recovery-zone-${prefix}-${id}`,
      'data-status': item.status,
      'aria-label': `${item.label}: ${item.statusLabel}, ${item.recommendation}`,
      'aria-pressed': selectedMuscleId === id,
      onClick: () => setSelectedMuscleId(id),
      onMouseEnter: () => setHoveredMuscleId(id),
      onMouseLeave: () => setHoveredMuscleId(null),
      onFocus: () => setSelectedMuscleId(id),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelectedMuscleId(id);
        }
      },
      className: 'cursor-pointer outline-none transition-opacity duration-150',
      style: {
        fill: isActive ? style.fillSelected : style.fill,
        stroke: isActive ? '#ffffff' : style.stroke,
        strokeWidth: isActive ? 2 : 1.2,
      } as React.CSSProperties,
    };
  }

  return (
    <div data-testid="tab-muscle-recovery" className="space-y-6">
      {/* Статус лента и легенда */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Карта на мускулното възстановяване (15 зони)
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Основна мускулна група = 100% натоварване (48–72ч възстановяване) · Второстепенна = 50% натоварване (24–36ч). Кликни зона за разбивка по упражнения.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-mono tabular-nums">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#dc2626] border border-rose-300/60" />
            <span>Остра умора ({summaryCounts.fatigued})</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#d97706] border border-amber-300/60" />
            <span>Възстановява се ({summaryCounts.recovering})</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-[#16a34a] border border-emerald-300/60" />
            <span>Готова ({summaryCounts.recovered})</span>
          </span>
        </div>
      </div>

      {highSteps24h !== null && (
        <div
          data-testid="recovery-high-steps-banner"
          className="rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-3 text-xs text-amber-200"
        >
          Отчетени са <span className="font-mono font-bold tabular-nums">{formatNumberBg(highSteps24h)}</span> крачки в последните 24ч — добавен е +12ч буфер за възстановяване на краката (квадрицепс, задно бедро, седалище и прасци).
        </div>
      )}

      {hevyWorkouts.length === 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-300">
            Няма импортирани тренировки от Hevy — всички мускулни групи са в състояние „Напълно възстановена“. Импортирай CSV файл, за да видиш реалната умора.
          </p>
          <button
            type="button"
            onClick={onNavigateToHevy}
            className="h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] whitespace-nowrap shrink-0"
          >
            Към импорт от Hevy
          </button>
        </div>
      )}

      {/* Основна мрежа: Отпред + Отзад SVG + Детайлен панел */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Анатомични SVG фигури (Отпред и Отзад) */}
        <div className="grid grid-cols-1 gap-4 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:grid-cols-2 lg:col-span-7">
          {/* Изглед отпред */}
          <div className="flex flex-col items-center">
            <div className="mb-2 text-xs font-semibold text-slate-300">
              Изглед отпред
            </div>
            <svg
              viewBox="0 0 320 520"
              role="img"
              aria-label="Анатомична карта на възстановяването отпред"
              className="h-auto w-full max-w-[260px]"
            >
              <g
                pointerEvents="none"
                fill="#141c2b"
                stroke="rgba(148, 163, 184, 0.25)"
                strokeWidth="1.2"
              >
                <path d="M160 16 C173 16 182 27 182 43 C182 59 172 70 160 70 C148 70 138 59 138 43 C138 27 147 16 160 16 Z" />
                <path d="M148 67 L172 67 L177 92 L143 92 Z" />
                <path d="M114 95 Q160 87 206 95 L217 139 L198 226 L194 270 L160 280 L126 270 L122 226 L103 139 Z" />
                <path d="M104 101 L82 114 L64 195 L48 253 L37 274 L51 281 L66 256 L86 200 L106 141 Z" />
                <path d="M216 101 L238 114 L256 195 L272 253 L283 274 L269 281 L254 256 L234 200 L214 141 Z" />
                <path d="M126 268 L157 278 L152 384 L146 476 L124 480 L120 382 L114 312 Z" />
                <path d="M194 268 L163 278 L168 384 L174 476 L196 480 L200 382 L206 312 Z" />
                <ellipse cx="133" cy="488" rx="14" ry="7" />
                <ellipse cx="187" cy="488" rx="14" ry="7" />
              </g>

              {/* Трапец / Горен гръб (вратна линия отпред) */}
              <g {...zoneProps('traps_upper_back', 'front')}>
                <path d="M142 82 L120 97 L144 103 L148 82 Z" />
                <path d="M178 82 L200 97 L176 103 L172 82 Z" />
              </g>

              {/* Средно рамо */}
              <g {...zoneProps('side_delts', 'front')}>
                <path d="M99 102 C86 107 80 120 82 135 L94 134 C94 121 97 110 104 103 Z" />
                <path d="M221 102 C234 107 240 120 238 135 L226 134 C226 121 223 110 216 103 Z" />
              </g>

              {/* Предно рамо */}
              <g {...zoneProps('front_delts', 'front')}>
                <path d="M114 96 C106 99 101 104 97 112 L94 133 C103 135 111 128 115 114 Z" />
                <path d="M206 96 C214 99 219 104 223 112 L226 133 C217 135 209 128 205 114 Z" />
              </g>

              {/* Гърди */}
              <g {...zoneProps('chest', 'front')}>
                <path d="M117 109 Q138 104 157 118 L157 154 Q134 160 113 144 Q112 124 117 109 Z" />
                <path d="M203 109 Q182 104 163 118 L163 154 Q186 160 207 144 Q208 124 203 109 Z" />
              </g>

              {/* Бицепс */}
              <g {...zoneProps('biceps', 'front')}>
                <path d="M82 141 C72 154 69 175 73 192 C83 194 92 181 98 156 C95 147 89 141 82 141 Z" />
                <path d="M238 141 C248 154 251 175 247 192 C237 194 228 181 222 156 C225 147 231 141 238 141 Z" />
              </g>

              {/* Предмишници */}
              <g {...zoneProps('forearms', 'front')}>
                <path d="M70 198 L84 201 L71 251 L56 247 Z" />
                <path d="M250 198 L236 201 L249 251 L264 247 Z" />
              </g>

              {/* Корем */}
              <g {...zoneProps('abs', 'front')}>
                <rect x="139" y="162" width="18" height="20" rx="5" />
                <rect x="163" y="162" width="18" height="20" rx="5" />
                <rect x="140" y="186" width="17" height="20" rx="5" />
                <rect x="163" y="186" width="17" height="20" rx="5" />
                <rect x="142" y="210" width="15" height="20" rx="5" />
                <rect x="163" y="210" width="15" height="20" rx="5" />
                <path d="M144 234 L176 234 L168 262 L152 262 Z" />
              </g>

              {/* Квадрицепс */}
              <g {...zoneProps('quads', 'front')}>
                <path d="M122 278 Q139 282 154 290 L148 370 Q134 374 122 365 Q114 324 122 278 Z" />
                <path d="M198 278 Q181 282 166 290 L172 370 Q186 374 198 365 Q206 324 198 278 Z" />
              </g>

              {/* Прасци (отпред/странично) */}
              <g {...zoneProps('calves', 'front')}>
                <path d="M123 392 Q130 390 134 402 L133 458 L124 454 Z" />
                <path d="M197 392 Q190 390 186 402 L187 458 L196 454 Z" />
              </g>
            </svg>
          </div>

          {/* Изглед отзад */}
          <div className="flex flex-col items-center">
            <div className="mb-2 text-xs font-semibold text-slate-300">
              Изглед отзад
            </div>
            <svg
              viewBox="0 0 320 520"
              role="img"
              aria-label="Анатомична карта на възстановяването отзад"
              className="h-auto w-full max-w-[260px]"
            >
              <g
                pointerEvents="none"
                fill="#141c2b"
                stroke="rgba(148, 163, 184, 0.25)"
                strokeWidth="1.2"
              >
                <path d="M160 16 C173 16 182 27 182 43 C182 59 172 70 160 70 C148 70 138 59 138 43 C138 27 147 16 160 16 Z" />
                <path d="M148 67 L172 67 L177 92 L143 92 Z" />
                <path d="M114 95 Q160 87 206 95 L217 139 L198 226 L194 270 L160 280 L126 270 L122 226 L103 139 Z" />
                <path d="M104 101 L82 114 L64 195 L48 253 L37 274 L51 281 L66 256 L86 200 L106 141 Z" />
                <path d="M216 101 L238 114 L256 195 L272 253 L283 274 L269 281 L254 256 L234 200 L214 141 Z" />
                <path d="M126 268 L157 278 L152 384 L146 476 L124 480 L120 382 L114 312 Z" />
                <path d="M194 268 L163 278 L168 384 L174 476 L196 480 L200 382 L206 312 Z" />
                <ellipse cx="133" cy="488" rx="14" ry="7" />
                <ellipse cx="187" cy="488" rx="14" ry="7" />
              </g>

              {/* Горен гръб / Трапец */}
              <g {...zoneProps('traps_upper_back', 'back')}>
                <path d="M144 82 L176 82 L195 112 L160 138 L125 112 Z" />
              </g>

              {/* Средно рамо (външен ръб) */}
              <g {...zoneProps('side_delts', 'back')}>
                <path d="M98 103 C85 108 80 120 82 135 L94 134 C94 121 97 110 104 103 Z" />
                <path d="M222 103 C235 108 240 120 238 135 L226 134 C226 121 223 110 216 103 Z" />
              </g>

              {/* Задно рамо */}
              <g {...zoneProps('rear_delts', 'back')}>
                <path d="M114 96 C106 99 101 104 97 112 L94 133 C103 135 111 128 115 114 Z" />
                <path d="M206 96 C214 99 219 104 223 112 L226 133 C217 135 209 128 205 114 Z" />
              </g>

              {/* Широк гръбен мускул (Lats) */}
              <g {...zoneProps('lats', 'back')}>
                <path d="M116 120 L156 142 L154 214 L128 206 Q112 164 116 120 Z" />
                <path d="M204 120 L164 142 L166 214 L192 206 Q208 164 204 120 Z" />
              </g>

              {/* Кръст */}
              <g {...zoneProps('lower_back', 'back')}>
                <path d="M137 216 L183 216 L178 256 L142 256 Z" />
              </g>

              {/* Трицепс */}
              <g {...zoneProps('triceps', 'back')}>
                <path d="M83 140 C72 154 68 175 74 195 C84 195 94 181 99 156 C95 146 90 140 83 140 Z" />
                <path d="M237 140 C248 154 252 175 246 195 C236 195 226 181 221 156 C225 146 230 140 237 140 Z" />
              </g>

              {/* Предмишници */}
              <g {...zoneProps('forearms', 'back')}>
                <path d="M70 198 L84 201 L71 251 L56 247 Z" />
                <path d="M250 198 L236 201 L249 251 L264 247 Z" />
              </g>

              {/* Седалище */}
              <g {...zoneProps('glutes', 'back')}>
                <path d="M126 262 Q142 256 158 266 L156 302 Q135 308 121 292 Z" />
                <path d="M194 262 Q178 256 162 266 L164 302 Q185 308 199 292 Z" />
              </g>

              {/* Задно бедро */}
              <g {...zoneProps('hamstrings', 'back')}>
                <path d="M122 308 Q138 312 154 308 L148 372 Q134 376 122 368 Z" />
                <path d="M198 308 Q182 312 166 308 L172 372 Q186 376 198 368 Z" />
              </g>

              {/* Прасци */}
              <g {...zoneProps('calves', 'back')}>
                <path d="M122 388 Q136 382 148 392 L144 448 Q134 456 124 444 Z" />
                <path d="M198 388 Q184 382 172 392 L176 448 Q186 456 196 444 Z" />
              </g>
            </svg>
          </div>
        </div>

        {/* Детайлен панел за избраната мускулна група */}
        <div
          data-testid="recovery-detail-panel"
          className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-5"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
              <div>
                <div className="text-xs text-slate-400">Детайли за зона</div>
                <h3 className="font-display text-xl font-bold text-white">
                  {activeMuscle.label}
                </h3>
              </div>
              <span
                data-testid="recovery-detail-status"
                className={`text-xs font-semibold ${STATUS_STYLE[activeMuscle.status].textClass}`}
              >
                {activeMuscle.statusLabel}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#141B27] p-3.5">
                <div className="text-[11px] text-slate-400">Изминало време</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
                  {formatHoursText(activeMuscle.hoursSinceLast)}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#141B27] p-3.5">
                <div className="text-[11px] text-slate-400">
                  Ефективен обем (48ч) · Прозорец
                </div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
                  {formatNumberBg(activeMuscle.recentEffectiveSets48h)} сер. ·{' '}
                  {activeMuscle.recoveryTargetHours} ч
                </div>
              </div>
            </div>

            <div
              data-testid="recovery-detail-recommendation"
              className={`mt-4 rounded-xl border p-4 ${STATUS_STYLE[activeMuscle.status].borderClass} ${STATUS_STYLE[activeMuscle.status].bgClass}`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-300">
                <span>Препоръка</span>
                {activeMuscle.dominantLoadRole !== 'none' && (
                  <span className="font-mono text-[11px] text-slate-400">
                    {activeMuscle.dominantLoadRole === 'primary'
                      ? 'Основен товар (100% · 48–72ч)'
                      : 'Второстепенен товар (50% · 24–36ч)'}
                  </span>
                )}
              </div>
              <div
                className={`mt-1 font-display text-base font-bold ${STATUS_STYLE[activeMuscle.status].textClass}`}
              >
                {activeMuscle.recommendation}
              </div>
              {activeMuscle.lastTrainedDate && (
                <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                  Последна тренировка: {formatBgDate(activeMuscle.lastTrainedDate)}
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4">
              {activeMuscle.recentExercises.length === 0 ? (
                <div>
                  <div className="text-xs font-semibold text-slate-300">
                    Последно тренирани упражнения
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Няма записани упражнения за тази мускулна група в Hevy.
                  </p>
                </div>
              ) : (
                <>
                  {/* Основна мускулна група */}
                  <div data-testid="recovery-primary-exercises">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>
                        Натоварено като Основна група (100% · {activeMuscle.primaryExercises.length})
                      </span>
                    </div>
                    {activeMuscle.primaryExercises.length === 0 ? (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Няма скорошни упражнения, в които тази зона е основна.
                      </p>
                    ) : (
                      <ul className="mt-1.5 divide-y divide-white/8 text-xs">
                        {activeMuscle.primaryExercises.map((hit, idx) => (
                          <li
                            key={`p-${hit.workoutTitle}-${hit.exerciseTitle}-${idx}`}
                            className="flex items-center justify-between gap-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-100">
                                {hit.exerciseTitle}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {hit.date ? formatBgDate(hit.date) : ''} · 1.0× серия
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-300 shrink-0">
                              <div>{hit.workingSets} сер.</div>
                              <div className="text-[11px] text-slate-500">
                                преди {formatNumberBg(hit.hoursAgo)} ч
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Второстепенна мускулна група */}
                  <div
                    data-testid="recovery-secondary-exercises"
                    className="border-t border-white/8 pt-3"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      <span>
                        Натоварено като Второстепенна група (50% · {activeMuscle.secondaryExercises.length})
                      </span>
                    </div>
                    {activeMuscle.secondaryExercises.length === 0 ? (
                      <p className="mt-1.5 text-xs text-slate-500">
                        Няма скорошни упражнения, в които тази зона е второстепенна.
                      </p>
                    ) : (
                      <ul className="mt-1.5 divide-y divide-white/8 text-xs">
                        {activeMuscle.secondaryExercises.map((hit, idx) => (
                          <li
                            key={`s-${hit.workoutTitle}-${hit.exerciseTitle}-${idx}`}
                            className="flex items-center justify-between gap-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-200">
                                {hit.exerciseTitle}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {hit.date ? formatBgDate(hit.date) : ''} · 0.5× серия ({formatNumberBg(hit.workingSets * 0.5)} еф.)
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums text-slate-300 shrink-0">
                              <div>{hit.workingSets} сер.</div>
                              <div className="text-[11px] text-slate-500">
                                преди {formatNumberBg(hit.hoursAgo)} ч
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Пълен списък на всички 15 мускулни зони за бърз избор */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5">
        <h3 className="font-display text-sm font-bold text-white">
          Списък на всички 15 мускулни зони
        </h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {recoveryItems.map((item) => {
            const st = STATUS_STYLE[item.status];
            const isSelected = selectedMuscleId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMuscleId(item.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-white/10 bg-[#141B27] hover:border-white/25'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-white">
                    {item.label}
                  </div>
                  <div className={`mt-0.5 text-[11px] ${st.textClass}`}>
                    {item.recommendation}
                  </div>
                </div>
                <div className="text-right font-mono text-[11px] tabular-nums text-slate-300 shrink-0">
                  {item.hoursSinceLast !== null
                    ? `${formatNumberBg(item.hoursSinceLast)} ч`
                    : 'Готов'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
