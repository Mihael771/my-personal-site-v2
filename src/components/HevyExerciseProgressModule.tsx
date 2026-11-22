import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, TrendingUp } from 'lucide-react';
import type {
  CustomExerciseMappings,
  HevyWorkout,
  WorkoutEnvironment,
} from '../types/fitness';
import { formatBgDate, formatNumberBg, getLocalDateKey } from '../utils/fitnessMath';
import {
  buildExerciseProgressDataset,
  computeNiceAxisTicks,
  getExercisesSortedByFrequency,
  type ExerciseProgressMetric,
  type ExerciseProgressPeriod,
  type ExerciseSessionPoint,
} from '../utils/hevyProgress';
import {
  WORKOUT_ENVIRONMENT_META_MAP,
  analyzeExerciseHiddenProgress,
  classifyWorkoutEnvironment,
} from '../utils/hiddenProgressAndEnvironment';
import { ExerciseMuscleTags } from './ExerciseMuscleTags';

interface HevyExerciseProgressModuleProps {
  workouts: HevyWorkout[];
  bodyWeightKg?: number | null;
  customExerciseMappings?: CustomExerciseMappings;
  onEditExerciseMuscles?: (exerciseTitle: string) => void;
}

const CHART_HEIGHT = 290;
const MARGIN = { top: 24, right: 24, bottom: 38, left: 54 };

const PRIMARY_LINE_COLOR = '#38bdf8'; // Sky cyan for Estimated 1RM / Max Reps
const SECONDARY_LINE_COLOR = '#f59e0b'; // Amber for Max Weight / Total Reps

const PERIOD_OPTIONS: Array<{ id: ExerciseProgressPeriod; label: string }> = [
  { id: '1m', label: '1М' },
  { id: '3m', label: '3М' },
  { id: '6m', label: '6М' },
  { id: '1y', label: '1Г' },
  { id: 'all', label: 'Всички' },
];

function formatShortAxisDate(dateKey: string): string {
  const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return dateKey;
  return `${m[3]}.${m[2]}`;
}

export function HevyExerciseProgressModule({
  workouts,
  bodyWeightKg = null,
  customExerciseMappings,
  onEditExerciseMuscles,
}: HevyExerciseProgressModuleProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const exerciseOptions = useMemo(
    () => getExercisesSortedByFrequency(workouts),
    [workouts],
  );

  const [selectedExercise, setSelectedExercise] = useState<string>(
    () => exerciseOptions[0]?.title ?? '',
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [metric, setMetric] = useState<ExerciseProgressMetric>('e1rm');
  const [period, setPeriod] = useState<ExerciseProgressPeriod>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<
    WorkoutEnvironment | 'all'
  >('all');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const [chartWidth, setChartWidth] = useState(920);

  // Keep selectedExercise valid when workouts change
  useEffect(() => {
    if (exerciseOptions.length === 0) {
      setSelectedExercise('');
      return;
    }
    const exists = exerciseOptions.some(
      (opt) => opt.title.toLowerCase() === selectedExercise.toLowerCase(),
    );
    if (!exists) {
      setSelectedExercise(exerciseOptions[0].title);
    }
  }, [exerciseOptions, selectedExercise]);

  // Close searchable dropdown on outside click or Escape
  useEffect(() => {
    if (!dropdownOpen) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  // Focus search input when opening dropdown
  useEffect(() => {
    if (dropdownOpen) {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
      return () => window.clearTimeout(timer);
    }
  }, [dropdownOpen]);

  // Observe container width for crisp responsive pure SVG coordinates
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = Math.max(320, Math.floor(el.getBoundingClientRect().width));
      setChartWidth(next);
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const filteredDropdownOptions = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return exerciseOptions;
    return exerciseOptions.filter((opt) =>
      opt.title.toLowerCase().includes(q),
    );
  }, [exerciseOptions, exerciseSearch]);

  const envScopedWorkouts = useMemo(() => {
    if (environmentFilter === 'all') return workouts;
    return workouts.filter(
      (w) => classifyWorkoutEnvironment(w) === environmentFilter,
    );
  }, [workouts, environmentFilter]);

  const dataset = useMemo(
    () =>
      buildExerciseProgressDataset(
        envScopedWorkouts,
        selectedExercise,
        period,
        metric,
        todayKey,
      ),
    [envScopedWorkouts, selectedExercise, period, metric, todayKey],
  );

  const hiddenProgress = useMemo(
    () =>
      analyzeExerciseHiddenProgress({
        workouts,
        exerciseTitle: selectedExercise,
        bodyWeightKg,
        environmentFilter,
      }),
    [workouts, selectedExercise, bodyWeightKg, environmentFilter],
  );

  // Reset environment filter when switching to an exercise that doesn't have the filtered env
  useEffect(() => {
    if (
      environmentFilter !== 'all' &&
      hiddenProgress.environmentsPresent.length > 0 &&
      !hiddenProgress.environmentsPresent.includes(environmentFilter)
    ) {
      setEnvironmentFilter('all');
    }
  }, [selectedExercise, environmentFilter, hiddenProgress.environmentsPresent]);

  // Reset hovered point when data selection changes
  useEffect(() => {
    setHoveredIdx(null);
  }, [selectedExercise, period, metric, environmentFilter, workouts.length]);

  const selectedMeta = useMemo(
    () =>
      exerciseOptions.find(
        (opt) => opt.title.toLowerCase() === selectedExercise.toLowerCase(),
      ),
    [exerciseOptions, selectedExercise],
  );

  const isBodyweight = dataset.isBodyweightOnly;
  const unitLabel = isBodyweight ? 'повт.' : 'kg';
  const primaryLabel = isBodyweight
    ? 'Максимални повторения'
    : 'Изчислен 1RM (kg)';
  const secondaryLabel = isBodyweight
    ? 'Общо повторения за тренировка'
    : 'Максимална тежест (kg)';

  const showPrimary = metric === 'e1rm' || metric === 'both';
  const showSecondary = metric === 'max_weight' || metric === 'both';

  const getPrimaryVal = (pt: ExerciseSessionPoint) =>
    isBodyweight ? pt.maxReps : pt.estimated1RM;
  const getSecondaryVal = (pt: ExerciseSessionPoint) =>
    isBodyweight ? pt.totalReps : pt.maxWeightKg;

  const innerWidth = Math.max(140, chartWidth - MARGIN.left - MARGIN.right);
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  const chartGeometry = useMemo(() => {
    const sessions = dataset.filteredSessions;
    if (sessions.length === 0) {
      return null;
    }

    const values: number[] = [];
    for (const s of sessions) {
      if (showPrimary) values.push(getPrimaryVal(s));
      if (showSecondary) values.push(getSecondaryVal(s));
    }

    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const paddedMin = rawMin > 5 ? rawMin * 0.88 : 0;
    const paddedMax = rawMax > 0 ? rawMax * 1.08 : 10;
    const yAxis = computeNiceAxisTicks(paddedMin, paddedMax, 5);

    const getX = (idx: number) => {
      if (sessions.length === 1) return innerWidth / 2;
      return (idx / (sessions.length - 1)) * innerWidth;
    };

    const getY = (val: number) => {
      const span = Math.max(0.001, yAxis.max - yAxis.min);
      const ratio = (val - yAxis.min) / span;
      return innerHeight - ratio * innerHeight;
    };

    const primaryCoords = sessions.map((s, idx) => ({
      x: getX(idx),
      y: getY(getPrimaryVal(s)),
      val: getPrimaryVal(s),
    }));

    const secondaryCoords = sessions.map((s, idx) => ({
      x: getX(idx),
      y: getY(getSecondaryVal(s)),
      val: getSecondaryVal(s),
    }));

    const buildLinePath = (coords: Array<{ x: number; y: number }>) =>
      coords
        .map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
        .join(' ');

    const buildAreaPath = (coords: Array<{ x: number; y: number }>) => {
      if (coords.length < 2) return '';
      const top = buildLinePath(coords);
      const last = coords[coords.length - 1];
      const first = coords[0];
      return `${top} L ${last.x.toFixed(1)} ${innerHeight.toFixed(1)} L ${first.x.toFixed(1)} ${innerHeight.toFixed(1)} Z`;
    };

    // Smart X-axis tick indices without label overlap
    const maxLabels = Math.max(2, Math.min(8, Math.floor(innerWidth / 76)));
    const xTickIndices: number[] = [];
    if (sessions.length <= maxLabels) {
      for (let i = 0; i < sessions.length; i++) xTickIndices.push(i);
    } else {
      const step = (sessions.length - 1) / (maxLabels - 1);
      for (let k = 0; k < maxLabels; k++) {
        const idx = Math.round(k * step);
        if (!xTickIndices.includes(idx)) xTickIndices.push(idx);
      }
    }

    return {
      sessions,
      yAxis,
      getX,
      getY,
      primaryCoords,
      secondaryCoords,
      primaryPath: buildLinePath(primaryCoords),
      secondaryPath: buildLinePath(secondaryCoords),
      primaryArea: showPrimary && !showSecondary ? buildAreaPath(primaryCoords) : '',
      secondaryArea: !showPrimary && showSecondary ? buildAreaPath(secondaryCoords) : '',
      xTickIndices,
    };
  }, [
    dataset.filteredSessions,
    showPrimary,
    showSecondary,
    innerWidth,
    innerHeight,
    isBodyweight,
  ]);

  if (exerciseOptions.length === 0) {
    return null;
  }

  const activeSession =
    hoveredIdx !== null && chartGeometry
      ? chartGeometry.sessions[hoveredIdx] ?? null
      : null;

  const activeAnchorX =
    hoveredIdx !== null && chartGeometry
      ? MARGIN.left + chartGeometry.getX(hoveredIdx)
      : 0;
  const activeAnchorY =
    hoveredIdx !== null && chartGeometry
      ? MARGIN.top +
        (showPrimary
          ? chartGeometry.primaryCoords[hoveredIdx].y
          : chartGeometry.secondaryCoords[hoveredIdx].y)
      : 0;

  // Clamp tooltip horizontally inside the container
  const tooltipLeftPct =
    chartWidth > 0
      ? Math.max(14, Math.min(86, (activeAnchorX / chartWidth) * 100))
      : 50;

  return (
    <section
      id="hevy-exercise-progress"
      data-testid="hevy-exercise-progress-module"
      aria-label="Прогрес по упражнения"
      className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие и избор на упражнение с търсачка */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <TrendingUp className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
            <span>Анализ на силата и повторенията</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
            Прогрес по упражнения
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {isBodyweight
              ? 'Упражнението е със собствено тегло — графиката автоматично следи максимални и общи повторения.'
              : 'Изчислен 1RM по формулата на Epley и максимална тежест за всяка тренировъчна сесия.'}
          </p>
        </div>

        {/* Търсещо се падащо меню за избор на упражнение (подредено по брой тренировки) */}
        <div ref={dropdownRef} className="relative w-full lg:w-[340px] shrink-0">
          <div className="mb-1 text-xs font-medium text-slate-300">
            Упражнение (подредени по честота)
          </div>
          <button
            type="button"
            data-testid="progress-exercise-dropdown-trigger"
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-white/15 bg-[#141B27] px-3 text-left text-sm font-medium text-white transition-colors hover:border-white/30"
          >
            <span className="truncate">{selectedExercise || 'Избери упражнение'}</span>
            <span className="flex items-center gap-2 shrink-0">
              {selectedMeta && (
                <span className="font-mono text-xs tabular-nums text-slate-400">
                  {selectedMeta.workoutCount} тр.
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          {dropdownOpen && (
            <div
              data-testid="progress-exercise-dropdown-menu"
              className="absolute right-0 z-30 mt-1.5 w-full rounded-xl border border-white/15 bg-[#131926] p-2 shadow-2xl"
            >
              <div className="relative mb-2">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  data-testid="progress-exercise-search-input"
                  type="text"
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                  placeholder="Търси упражнение…"
                  className="h-9 w-full rounded-lg border border-white/12 bg-[#0D121B] pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                />
              </div>

              <ul
                role="listbox"
                aria-label="Списък с упражнения"
                className="max-h-60 overflow-y-auto divide-y divide-white/6"
              >
                {filteredDropdownOptions.length === 0 ? (
                  <li className="px-3 py-3 text-center text-xs text-slate-400">
                    Няма съвпадение за „{exerciseSearch}“
                  </li>
                ) : (
                  filteredDropdownOptions.map((opt) => {
                    const isSelected =
                      opt.title.toLowerCase() === selectedExercise.toLowerCase();
                    return (
                      <li key={opt.title} role="option" aria-selected={isSelected}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedExercise(opt.title);
                            setDropdownOpen(false);
                            setExerciseSearch('');
                          }}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                              : 'text-slate-200 hover:bg-white/[0.05]'
                          }`}
                        >
                          <span className="truncate">{opt.title}</span>
                          <span className="font-mono text-[11px] tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                            {opt.workoutCount} тр. · {opt.setCount} сер.
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          )}
        </div>
      </div>

      {selectedExercise && (
        <div
          data-testid="progress-exercise-muscle-tags"
          className="mt-3.5 flex flex-col gap-2.5 rounded-xl border border-white/8 bg-[#131926] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <ExerciseMuscleTags
            exerciseTitle={selectedExercise}
            customExerciseMappings={customExerciseMappings}
            onEdit={onEditExerciseMuscles}
          />
          {hiddenProgress.environmentsPresent.length > 0 && (
            <div
              role="group"
              aria-label="Филтър по тренировъчна среда за упражнението"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-[#0D121B] p-0.5 shrink-0"
            >
              {hiddenProgress.environmentsPresent.length > 1 && (
                <button
                  type="button"
                  aria-pressed={environmentFilter === 'all'}
                  onClick={() => setEnvironmentFilter('all')}
                  className={`h-7 rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    environmentFilter === 'all'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Всички среди
                </button>
              )}
              {hiddenProgress.environmentsPresent.map((env) => {
                const meta = WORKOUT_ENVIRONMENT_META_MAP[env];
                const active =
                  environmentFilter === env ||
                  hiddenProgress.environmentsPresent.length === 1;
                return (
                  <button
                    key={env}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      hiddenProgress.environmentsPresent.length > 1 &&
                      setEnvironmentFilter(env)
                    }
                    className={`h-7 rounded-md px-2 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      hiddenProgress.environmentsPresent.length > 1
                        ? 'cursor-pointer'
                        : 'cursor-default'
                    } ${
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {meta.badgeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Обобщаващи карти (KPI) за избраното упражнение */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#131926] p-4">
          <div className="text-xs font-medium text-slate-400">
            {isBodyweight ? 'Личен рекорд (Макс. повторения)' : 'Личен рекорд (PR тежест)'}
          </div>
          <div
            data-testid="progress-kpi-pr"
            className="mt-1.5 font-mono text-xl font-bold tabular-nums text-white"
          >
            {isBodyweight
              ? `${dataset.personalRecordMaxReps} ${unitLabel}`
              : `${formatNumberBg(dataset.personalRecordWeightKg)} ${unitLabel}`}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-400">
            {isBodyweight
              ? dataset.personalRecordMaxRepsDate
                ? `Постигнат на ${formatBgDate(dataset.personalRecordMaxRepsDate)}`
                : 'Няма данни в периода'
              : dataset.personalRecordWeightDate
                ? `Постигнат на ${formatBgDate(dataset.personalRecordWeightDate)}`
                : 'Няма данни в периода'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#131926] p-4">
          <div className="text-xs font-medium text-slate-400">
            {isBodyweight ? 'Рекорд общо повторения (сесия)' : 'Най-висок изчислен 1RM'}
          </div>
          <div
            data-testid="progress-kpi-1rm"
            className="mt-1.5 font-mono text-xl font-bold tabular-nums text-[#38bdf8]"
          >
            {isBodyweight
              ? `${dataset.peakTotalReps} ${unitLabel}`
              : `${formatNumberBg(dataset.peakEstimated1RM)} ${unitLabel}`}
          </div>
          <div className="mt-1 font-mono text-xs tabular-nums text-slate-400">
            {isBodyweight
              ? dataset.peakTotalRepsDate
                ? `Отчетен на ${formatBgDate(dataset.peakTotalRepsDate)}`
                : 'Няма данни в периода'
              : dataset.peakEstimated1RMDate
                ? `По формулата на Epley · ${formatBgDate(dataset.peakEstimated1RMDate)}`
                : 'Няма данни в периода'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#131926] p-4">
          <div className="text-xs font-medium text-slate-400">
            Прогрес за избрания период
          </div>
          <div
            data-testid="progress-kpi-delta"
            className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
              dataset.progressDelta === null
                ? 'text-slate-300'
                : dataset.progressDelta > 0
                  ? 'text-emerald-400'
                  : dataset.progressDelta < 0
                    ? 'text-rose-400'
                    : 'text-slate-200'
            }`}
          >
            {dataset.progressDelta === null
              ? '—'
              : `${dataset.progressDelta > 0 ? '+' : ''}${formatNumberBg(dataset.progressDelta)} ${unitLabel}${
                  dataset.progressPercent !== null
                    ? ` (${dataset.progressPercent > 0 ? '+' : ''}${formatNumberBg(dataset.progressPercent)}%)`
                    : ''
                }`}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {dataset.filteredSessions.length < 2
              ? 'Нужни са поне 2 тренировки в периода'
              : `${dataset.progressLabel} · ${dataset.filteredSessions.length} сесии`}
          </div>
        </div>
      </div>

      {/* Контроли над графиката: превключвател за метрика + период */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Избор на метрика за графиката"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
        >
          <button
            type="button"
            data-testid="progress-metric-e1rm"
            aria-pressed={metric === 'e1rm'}
            onClick={() => setMetric('e1rm')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              metric === 'e1rm'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {primaryLabel}
          </button>
          <button
            type="button"
            data-testid="progress-metric-max"
            aria-pressed={metric === 'max_weight'}
            onClick={() => setMetric('max_weight')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              metric === 'max_weight'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            {secondaryLabel}
          </button>
          <button
            type="button"
            data-testid="progress-metric-both"
            aria-pressed={metric === 'both'}
            onClick={() => setMetric('both')}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              metric === 'both'
                ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            И двете
          </button>
        </div>

        <div
          role="group"
          aria-label="Филтър по период"
          className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 self-start sm:self-auto"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = period === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`progress-period-${opt.id}`}
                aria-pressed={active}
                onClick={() => setPeriod(opt.id)}
                className={`h-8 min-w-[40px] rounded-md px-2.5 font-mono text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Легенда */}
      <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-slate-300">
        {showPrimary && (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: PRIMARY_LINE_COLOR }}
              aria-hidden="true"
            />
            <span>{primaryLabel}</span>
          </span>
        )}
        {showSecondary && (
          <span className="inline-flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: SECONDARY_LINE_COLOR }}
              aria-hidden="true"
            />
            <span>{secondaryLabel}</span>
          </span>
        )}
      </div>

      {/* Интерактивна адаптивна React SVG графика */}
      <div
        ref={chartContainerRef}
        className="relative mt-3 w-full select-none"
      >
        {!chartGeometry ? (
          <div
            data-testid="progress-chart-empty-period"
            className="flex h-[240px] flex-col items-center justify-center rounded-xl border border-white/8 bg-[#121723] px-4 text-center"
          >
            <p className="text-sm text-slate-300">
              Няма записани тренировки за „{selectedExercise}“ в избрания период.
            </p>
            {period !== 'all' && (
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className="mt-3 inline-flex h-8 items-center rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 hover:border-white/30 hover:text-white"
              >
                Покажи за целия период
              </button>
            )}
          </div>
        ) : (
          <>
            <svg
              width={chartWidth}
              height={CHART_HEIGHT}
              viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
              role="img"
              aria-label={`Графика за прогреса на ${selectedExercise}`}
              data-testid="hevy-progress-svg"
              className="block w-full overflow-visible"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id="hevy-primary-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PRIMARY_LINE_COLOR} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={PRIMARY_LINE_COLOR} stopOpacity="0.01" />
                </linearGradient>
                <linearGradient id="hevy-secondary-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SECONDARY_LINE_COLOR} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={SECONDARY_LINE_COLOR} stopOpacity="0.01" />
                </linearGradient>
              </defs>

              <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                {/* Хоризонтални помощни линии и Y-ос */}
                {chartGeometry.yAxis.ticks.map((tickVal) => {
                  const yPos = chartGeometry.getY(tickVal);
                  return (
                    <g key={`y-${tickVal}`}>
                      <line
                        x1={0}
                        x2={innerWidth}
                        y1={yPos}
                        y2={yPos}
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="3 4"
                      />
                      <text
                        x={-10}
                        y={yPos + 4}
                        textAnchor="end"
                        fill="#94a3b8"
                        fontSize={11}
                        className="font-mono tabular-nums"
                      >
                        {formatNumberBg(tickVal)}
                      </text>
                    </g>
                  );
                })}

                {/* Етикет за мерната единица на вертикалната ос */}
                <text
                  x={-10}
                  y={-10}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize={10}
                  className="font-mono"
                >
                  {unitLabel}
                </text>

                {/* Базова хоризонтална ос X */}
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={innerHeight}
                  y2={innerHeight}
                  stroke="rgba(255,255,255,0.16)"
                />

                {/* Дати по хоризонталната ос */}
                {chartGeometry.xTickIndices.map((idx) => {
                  const session = chartGeometry.sessions[idx];
                  const xPos = chartGeometry.getX(idx);
                  return (
                    <g key={`x-${idx}`} transform={`translate(${xPos},${innerHeight})`}>
                      <line
                        x1={0}
                        x2={0}
                        y1={0}
                        y2={5}
                        stroke="rgba(255,255,255,0.2)"
                      />
                      <text
                        x={0}
                        y={19}
                        textAnchor="middle"
                        fill="#94a3b8"
                        fontSize={11}
                        className="font-mono tabular-nums"
                      >
                        {formatShortAxisDate(session.date)}
                      </text>
                    </g>
                  );
                })}

                {/* Запълнена площ при единична метрика */}
                {chartGeometry.primaryArea && (
                  <path
                    d={chartGeometry.primaryArea}
                    fill="url(#hevy-primary-grad)"
                  />
                )}
                {chartGeometry.secondaryArea && (
                  <path
                    d={chartGeometry.secondaryArea}
                    fill="url(#hevy-secondary-grad)"
                  />
                )}

                {/* Вертикална линия при посочване */}
                {hoveredIdx !== null && (
                  <line
                    x1={chartGeometry.getX(hoveredIdx)}
                    x2={chartGeometry.getX(hoveredIdx)}
                    y1={0}
                    y2={innerHeight}
                    stroke="rgba(255,255,255,0.28)"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Линии на сериите */}
                {showPrimary && chartGeometry.sessions.length > 1 && (
                  <path
                    d={chartGeometry.primaryPath}
                    fill="none"
                    stroke={PRIMARY_LINE_COLOR}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {showSecondary && chartGeometry.sessions.length > 1 && (
                  <path
                    d={chartGeometry.secondaryPath}
                    fill="none"
                    stroke={SECONDARY_LINE_COLOR}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Точки за всяка тренировка (с пръстен за 🏅 Rep PR / 📈 Volume PR) */}
                {chartGeometry.sessions.map((session, idx) => {
                  const isActive = hoveredIdx === idx;
                  const pCoord = chartGeometry.primaryCoords[idx];
                  const sCoord = chartGeometry.secondaryCoords[idx];
                  const hiddenPt = hiddenProgress.sessionByWorkoutId[session.workoutId];
                  const hasPrBadge = Boolean(
                    hiddenPt && (hiddenPt.isRepPR || hiddenPt.isVolumePR),
                  );
                  const anchorCoord = showPrimary ? pCoord : sCoord;

                  return (
                    <g key={session.workoutId || `${session.date}-${idx}`}>
                      {hasPrBadge && (
                        <circle
                          cx={anchorCoord.x}
                          cy={anchorCoord.y}
                          r={isActive ? 10 : 7.5}
                          fill="none"
                          stroke={hiddenPt?.isRepPR ? '#fbbf24' : '#34d399'}
                          strokeWidth={1.75}
                          strokeOpacity={0.85}
                        />
                      )}
                      {showSecondary && (
                        <circle
                          cx={sCoord.x}
                          cy={sCoord.y}
                          r={isActive ? 6 : 4}
                          fill={isActive ? '#ffffff' : SECONDARY_LINE_COLOR}
                          stroke={SECONDARY_LINE_COLOR}
                          strokeWidth={isActive ? 2.5 : 1.5}
                        />
                      )}
                      {showPrimary && (
                        <circle
                          cx={pCoord.x}
                          cy={pCoord.y}
                          r={isActive ? 6 : 4}
                          fill={isActive ? '#ffffff' : PRIMARY_LINE_COLOR}
                          stroke={PRIMARY_LINE_COLOR}
                          strokeWidth={isActive ? 2.5 : 1.5}
                        />
                      )}
                    </g>
                  );
                })}

                {/* Широки невидими зони за плавно посочване на всяка точка */}
                {chartGeometry.sessions.map((session, idx) => {
                  const total = chartGeometry.sessions.length;
                  const xCenter = chartGeometry.getX(idx);
                  const prevX = idx > 0 ? chartGeometry.getX(idx - 1) : 0;
                  const nextX =
                    idx < total - 1 ? chartGeometry.getX(idx + 1) : innerWidth;
                  const leftEdge = idx === 0 ? 0 : (prevX + xCenter) / 2;
                  const rightEdge =
                    idx === total - 1 ? innerWidth : (xCenter + nextX) / 2;

                  return (
                    <rect
                      key={`hit-${session.workoutId}-${idx}`}
                      data-testid={`progress-point-hit-${idx}`}
                      x={leftEdge}
                      y={0}
                      width={Math.max(12, rightEdge - leftEdge)}
                      height={innerHeight}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onFocus={() => setHoveredIdx(idx)}
                      onClick={() => setHoveredIdx(idx)}
                    />
                  );
                })}
              </g>
            </svg>

            {/* Плаваща подсказка (Tooltip) при посочване */}
            {activeSession && (() => {
              const hiddenPt =
                hiddenProgress.sessionByWorkoutId[activeSession.workoutId];
              return (
                <div
                  data-testid="hevy-progress-tooltip"
                  style={{
                    left: `${tooltipLeftPct}%`,
                    top: `${Math.max(12, activeAnchorY - 12)}px`,
                  }}
                  className="pointer-events-none absolute z-20 min-w-[235px] -translate-x-1/2 -translate-y-full rounded-xl border border-white/15 bg-[#0A0E17]/95 px-3.5 py-2.5 text-xs shadow-2xl"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono font-semibold tabular-nums text-white">
                      {activeSession.date
                        ? formatBgDate(activeSession.date)
                        : activeSession.startTime}
                    </span>
                    <span className="truncate max-w-[130px] text-[11px] text-slate-400">
                      {hiddenPt
                        ? `${WORKOUT_ENVIRONMENT_META_MAP[hiddenPt.environment].emoji} ${activeSession.workoutTitle}`
                        : activeSession.workoutTitle}
                    </span>
                  </div>

                  {hiddenPt && (hiddenPt.isRepPR || hiddenPt.isVolumePR) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {hiddenPt.isRepPR && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200 whitespace-nowrap">
                          🏅 Rep PR
                        </span>
                      )}
                      {hiddenPt.isVolumePR && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200 whitespace-nowrap">
                          📈 Volume PR
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-1.5 border-t border-white/10 pt-1.5 space-y-1">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-400">Най-добра серия:</span>
                      <span className="font-mono font-semibold tabular-nums text-white">
                        {activeSession.bestSetText}
                      </span>
                    </div>

                    {isBodyweight ? (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Макс. повторения:</span>
                          <span
                            className="font-mono font-semibold tabular-nums"
                            style={{ color: PRIMARY_LINE_COLOR }}
                          >
                            {activeSession.maxReps} повт.
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Общо повторения:</span>
                          <span
                            className="font-mono font-semibold tabular-nums"
                            style={{ color: SECONDARY_LINE_COLOR }}
                          >
                            {activeSession.totalReps} повт.
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Изчислен 1RM:</span>
                          <span
                            className="font-mono font-semibold tabular-nums"
                            style={{ color: PRIMARY_LINE_COLOR }}
                          >
                            {formatNumberBg(activeSession.estimated1RM)} kg
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-400">Макс. тежест:</span>
                          <span
                            className="font-mono font-semibold tabular-nums"
                            style={{ color: SECONDARY_LINE_COLOR }}
                          >
                            {formatNumberBg(activeSession.maxWeightKg)} kg
                          </span>
                        </div>
                      </>
                    )}

                    {hiddenPt && hiddenPt.repPrHits.length > 0 && (
                      <div className="border-t border-white/8 pt-1 text-[11px] text-amber-200">
                        {hiddenPt.repPrHits[0].weightLabel}:{' '}
                        {hiddenPt.repPrHits[0].prevReps} →{' '}
                        {hiddenPt.repPrHits[0].newReps} повт.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Скрит прогрес: Лични рекорди по тежести (Rep PRs) и Рекорден сесиен обем (Volume PR) */}
      {hiddenProgress.repPrRows.length > 0 && (
        <div
          data-testid="exercise-hidden-progress-section"
          className="mt-6 grid grid-cols-1 gap-4 border-t border-white/10 pt-5 lg:grid-cols-12"
        >
          {/* Компактна таблица „Лични рекорди по тежести (Rep PRs)“ */}
          <div className="rounded-xl border border-white/10 bg-[#131926] p-4 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">
                🏅 Лични рекорди по тежести (Rep PRs)
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {hiddenProgress.repPrRows.length}{' '}
                {hiddenProgress.repPrRows.length === 1 ? 'тежест' : 'тежести'}
              </span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-[11px] font-medium text-slate-400">
                    <th className="py-1.5 pr-3">Тежест</th>
                    <th className="py-1.5 pr-3 text-right">Макс. повт.</th>
                    <th className="py-1.5 pr-3">Среда</th>
                    <th className="py-1.5 text-right">Дата</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {hiddenProgress.repPrRows.map((row) => (
                    <tr
                      key={`${row.weightKg}-${row.environment}`}
                      className="h-8 text-slate-200 hover:bg-white/[0.02]"
                    >
                      <td className="py-1 pr-3 font-mono font-semibold tabular-nums text-white">
                        {row.weightLabel}
                      </td>
                      <td className="py-1 pr-3 text-right font-mono font-bold tabular-nums text-amber-300">
                        {row.maxReps} повт.
                      </td>
                      <td className="py-1 pr-3 text-slate-300 whitespace-nowrap">
                        {WORKOUT_ENVIRONMENT_META_MAP[row.environment].badgeLabel}
                      </td>
                      <td className="py-1 text-right font-mono tabular-nums text-slate-400 whitespace-nowrap">
                        {row.achievedDate ? formatBgDate(row.achievedDate) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Рекорден обем за сесия (Volume PR) и последни бейджове */}
          <div className="rounded-xl border border-white/10 bg-[#131926] p-4 lg:col-span-5 flex flex-col justify-between gap-4">
            <div>
              <div className="text-xs font-medium text-slate-400">
                📈 Рекорден обем за 1 тренировка (Volume PR)
              </div>
              <div
                data-testid="exercise-volume-pr-value"
                className="mt-1.5 font-mono text-xl font-bold tabular-nums text-emerald-400"
              >
                {hiddenProgress.volumePr.displayValueText}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {hiddenProgress.volumePr.achievedDate && (
                  <span className="font-mono tabular-nums">
                    {formatBgDate(hiddenProgress.volumePr.achievedDate)}
                  </span>
                )}
                {hiddenProgress.volumePr.environment && (
                  <span>
                    ·{' '}
                    {
                      WORKOUT_ENVIRONMENT_META_MAP[
                        hiddenProgress.volumePr.environment
                      ].badgeLabel
                    }
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-white/8 pt-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Сесии с 🏅 Rep PR:</span>
                <span className="font-mono font-semibold tabular-nums text-amber-300">
                  {hiddenProgress.totalRepPrSessions}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Сесии с 📈 Volume PR:</span>
                <span className="font-mono font-semibold tabular-nums text-emerald-300">
                  {hiddenProgress.totalVolumePrSessions}
                </span>
              </div>
              <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                Застой се отчита единствено ако в 3 поредни сесии в една и съща среда липсват 1RM PR, Rep PR и Volume PR.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
