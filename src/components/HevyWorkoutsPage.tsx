import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Filter,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  CustomExerciseMapping,
  CustomExerciseMappings,
  HevyWorkout,
  WorkoutEnvironment,
} from '../types/fitness';
import { findUnrecognizedExercises } from '../utils/exerciseMuscleEngine';
import { formatBgDate, formatNumberBg } from '../utils/fitnessMath';
import type { FreeExerciseDbItem } from '../utils/freeExerciseDb';
import {
  computeHevyStats,
  extractUniqueHevyExercises,
  filterHevyWorkouts,
  mergeHevyWorkoutsWithoutDuplicates,
  parseHevyCsv,
} from '../utils/hevyParser';
import {
  WORKOUT_ENVIRONMENT_META_MAP,
  WORKOUT_ENVIRONMENT_OPTIONS,
  buildAllWorkoutsHiddenPrIndex,
  classifyWorkoutEnvironment,
  getNextWorkoutEnvironment,
} from '../utils/hiddenProgressAndEnvironment';
import { ExerciseLibraryPanel } from './ExerciseLibraryPanel';
import { ExerciseMuscleEditorModal } from './ExerciseMuscleEditorModal';
import { ExerciseMuscleTags } from './ExerciseMuscleTags';
import { ExerciseTechniqueModal } from './ExerciseTechniqueModal';
import { HevyExerciseProgressModule } from './HevyExerciseProgressModule';

interface HevyWorkoutsPageProps {
  workouts: HevyWorkout[];
  bodyWeightKg?: number | null;
  customExerciseMappings?: CustomExerciseMappings;
  onSaveWorkouts: (nextWorkouts: HevyWorkout[]) => Promise<void>;
  onSaveCustomExerciseMapping: (
    exerciseTitle: string,
    mapping: CustomExerciseMapping | null,
  ) => Promise<void>;
}

interface ImportFeedback {
  type: 'success' | 'info' | 'error';
  message: string;
}

const SET_TYPE_LABELS: Record<string, string> = {
  normal: 'Работна',
  warmup: 'Загряваща',
  failure: 'До отказ',
  dropset: 'Дроп сет',
};

function formatSetType(rawType: string | undefined): string {
  if (!rawType) return 'Работна';
  const key = rawType.trim().toLowerCase();
  return SET_TYPE_LABELS[key] ?? rawType;
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined) return '—';
  if (seconds < 60) return `${seconds} сек`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem > 0 ? `${mins} м ${rem} с` : `${mins} мин`;
}

export function HevyWorkoutsPage({
  workouts,
  bodyWeightKg = null,
  customExerciseMappings,
  onSaveWorkouts,
  onSaveCustomExerciseMapping,
}: HevyWorkoutsPageProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [environmentFilter, setEnvironmentFilter] = useState<
    WorkoutEnvironment | 'all'
  >('all');
  const [importing, setImporting] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [editingExerciseTitle, setEditingExerciseTitle] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<'history' | 'library'>('history');
  const [techniqueQuery, setTechniqueQuery] = useState<string | null>(null);
  const [directTechniqueItem, setDirectTechniqueItem] =
    useState<FreeExerciseDbItem | null>(null);

  const unrecognizedExercises = useMemo(
    () => findUnrecognizedExercises(workouts, customExerciseMappings),
    [workouts, customExerciseMappings],
  );

  const exerciseOptions = useMemo(
    () => extractUniqueHevyExercises(workouts),
    [workouts],
  );

  const hiddenPrIndex = useMemo(
    () => buildAllWorkoutsHiddenPrIndex(workouts, bodyWeightKg),
    [workouts, bodyWeightKg],
  );

  const filteredWorkouts = useMemo(() => {
    const base = filterHevyWorkouts(workouts, selectedExercise, searchQuery);
    if (environmentFilter === 'all') return base;
    return base.filter(
      (w) => classifyWorkoutEnvironment(w) === environmentFilter,
    );
  }, [workouts, selectedExercise, searchQuery, environmentFilter]);

  const stats = useMemo(
    () => computeHevyStats(filteredWorkouts),
    [filteredWorkouts],
  );

  const hasActiveFilter =
    selectedExercise !== '' ||
    searchQuery.trim() !== '' ||
    environmentFilter !== 'all';

  function triggerFileDialog() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setFeedback(null);

    try {
      const text = await file.text();
      const parsed = parseHevyCsv(text);
      if (!parsed.ok) {
        setFeedback({ type: 'error', message: parsed.error });
        return;
      }

      const mergeResult = mergeHevyWorkoutsWithoutDuplicates(
        workouts,
        parsed.workouts,
      );

      if (mergeResult.addedWorkouts.length === 0) {
        setFeedback({
          type: 'info',
          message: `Всички ${mergeResult.skippedDuplicatesCount} тренировки от „${file.name}“ вече присъстват в базата данни (пропуснати дубликати по start_time и title).`,
        });
        return;
      }

      await onSaveWorkouts(mergeResult.mergedWorkouts);

      const skippedNote =
        mergeResult.skippedDuplicatesCount > 0
          ? ` · Пропуснати дубликати: ${mergeResult.skippedDuplicatesCount}`
          : '';
      setFeedback({
        type: 'success',
        message: `Запазени ${mergeResult.addedWorkouts.length} нови тренировки от „${file.name}“ (${parsed.rowCount} серии)${skippedNote}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Възникна грешка при импортирането или записа в базата данни.',
      });
    } finally {
      setImporting(false);
    }
  }

  async function handleDeleteWorkout(workoutId: string) {
    const nextWorkouts = workouts.filter((w) => w.id !== workoutId);
    setFeedback(null);
    try {
      await onSaveWorkouts(nextWorkouts);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Неуспешно изтриване на тренировката.',
      });
    }
  }

  async function handleCycleWorkoutEnvironment(workoutId: string) {
    const nextWorkouts = workouts.map((w) => {
      if (w.id !== workoutId) return w;
      const currentEnv = classifyWorkoutEnvironment(w);
      return {
        ...w,
        environment: getNextWorkoutEnvironment(currentEnv),
      };
    });
    try {
      await onSaveWorkouts(nextWorkouts);
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Неуспешна промяна на средата на тренировката.',
      });
    }
  }

  function toggleWorkoutCollapse(workoutId: string) {
    setCollapsedIds((prev) => ({
      ...prev,
      [workoutId]: !prev[workoutId],
    }));
  }

  return (
    <section
      id="hevy"
      data-testid="hevy-workouts-page"
      aria-label="Тренировки (Hevy)"
      className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        data-testid="hevy-csv-file-input"
        onChange={handleFileSelected}
        className="sr-only"
      />

      {/* Заглавие и бутон за импорт */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
            Тренировки (Hevy)
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Импортирай CSV файл директно от Hevy. Всички серии се групират по тренировка и упражнение, а старите тренировки се предпазват автоматично от дублиране.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Изглед на раздела Тренировки"
            className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'history'}
              data-testid="hevy-tab-history"
              onClick={() => setActiveTab('history')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'history'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Dumbbell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>История и прогрес</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'library'}
              data-testid="hevy-tab-library"
              onClick={() => setActiveTab('library')}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'library'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Библиотека с упражнения</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="hevy-import-csv-btn"
            disabled={importing}
            onClick={triggerFileDialog}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {importing ? 'Импортиране…' : 'Импортирай от Hevy (.csv)'}
            </span>
          </button>
        </div>
      </div>

      {activeTab === 'library' ? (
        <ExerciseLibraryPanel
          onSelectExercise={(item) => {
            setTechniqueQuery(null);
            setDirectTechniqueItem(item);
          }}
        />
      ) : (
        <>

      {/* Съобщение за статус от импорт */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          data-testid="hevy-import-feedback"
          className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'error'
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : feedback.type === 'success'
                ? 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
                : 'border-white/15 bg-[#121826] text-slate-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label="Затвори съобщението"
            className="rounded-md p-1 text-slate-400 hover:text-white shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Обобщени статистики */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
          <div className="text-xs font-medium text-slate-400">
            Брой тренировки
          </div>
          <div
            data-testid="hevy-stat-workouts"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-white"
          >
            {stats.workoutCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {hasActiveFilter
              ? `От общо ${workouts.length} импортирани`
              : 'Общо в базата данни'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
          <div className="text-xs font-medium text-slate-400">Общ обем</div>
          <div
            data-testid="hevy-stat-volume"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--accent-text)]"
          >
            {formatNumberBg(stats.totalVolumeKg)} кг
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {selectedExercise
              ? `За „${selectedExercise}“`
              : 'Сума от тежест × повторения'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
          <div className="text-xs font-medium text-slate-400">
            Максимална тежест
          </div>
          <div
            data-testid="hevy-stat-max-weight"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-white"
          >
            {formatNumberBg(stats.maxWeightKg)} кг
          </div>
          <div className="mt-1 truncate text-xs text-slate-500">
            {stats.maxWeightExercise ?? 'Няма отчетена тежест'}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
          <div className="text-xs font-medium text-slate-400">
            Серии и упражнения
          </div>
          <div
            data-testid="hevy-stat-sets"
            className="mt-2 font-mono text-2xl font-bold tabular-nums text-white"
          >
            {stats.totalSets}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {stats.uniqueExercisesCount} различни упражнения
          </div>
        </div>
      </div>

      {/* Празна страница при липса на тренировки */}
      {workouts.length === 0 ? (
        <div
          data-testid="hevy-empty-state"
          className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-8 sm:p-10"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-[#141B27] text-[var(--accent-text)]">
            <Dumbbell className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold text-white">
            Все още няма импортирани тренировки от Hevy
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            В мобилното приложение Hevy отвори Profile → Settings → Export &amp; Import Data → Export Workouts (.csv) и избери файла чрез бутона по-долу.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={triggerFileDialog}
              disabled={importing}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-semibold text-[var(--accent-text)] transition-colors hover:text-white whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Избери Hevy CSV файл</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {unrecognizedExercises.length > 0 && (
            <div
              data-testid="hevy-unrecognized-exercises-banner"
              className="mt-6 rounded-xl border border-amber-500/35 bg-amber-950/20 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 text-amber-300 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-amber-200">
                      Неразпознати упражнения от Hevy CSV ({unrecognizedExercises.length})
                    </h3>
                    <p className="mt-0.5 text-xs text-amber-100/80">
                      Избери основни и второстепенни мускулни групи за тези нестандартни упражнения, за да се отчитат точно в Седмичния обем и Картата на възстановяването.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {unrecognizedExercises.map((exName) => (
                  <button
                    key={exName}
                    type="button"
                    onClick={() => setEditingExerciseTitle(exName)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/35 bg-[#141B27] px-3 py-1.5 text-xs font-medium text-amber-100 hover:border-amber-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Pencil className="h-3 w-3 text-amber-300" aria-hidden="true" />
                    <span>{exName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <HevyExerciseProgressModule
            workouts={workouts}
            bodyWeightKg={bodyWeightKg}
            customExerciseMappings={customExerciseMappings}
            onEditExerciseMuscles={setEditingExerciseTitle}
          />

          {/* Филтър по упражнение, среда и търсене */}
          <div className="mt-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0F141F] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                    aria-hidden="true"
                  />
                  <label htmlFor="hevy-search-input" className="sr-only">
                    Търси тренировка или упражнение
                  </label>
                  <input
                    id="hevy-search-input"
                    data-testid="hevy-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Търси тренировка или упражнение…"
                    className="h-9 w-full rounded-lg border border-white/15 bg-[#141B27] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex items-center gap-2 sm:min-w-[260px]">
                  <Filter
                    className="h-4 w-4 shrink-0 text-slate-400"
                    aria-hidden="true"
                  />
                  <label htmlFor="hevy-exercise-filter" className="sr-only">
                    Филтриране по упражнение
                  </label>
                  <select
                    id="hevy-exercise-filter"
                    data-testid="hevy-exercise-filter"
                    value={selectedExercise}
                    onChange={(e) => setSelectedExercise(e.target.value)}
                    className="h-9 w-full rounded-lg border border-white/15 bg-[#141B27] px-3 text-sm text-slate-100 focus:border-[var(--accent)]"
                  >
                    <option value="">
                      Всички упражнения ({exerciseOptions.length})
                    </option>
                    {exerciseOptions.map((opt) => (
                      <option key={opt.title} value={opt.title}>
                        {opt.title} ({opt.workoutCount} тр. · {opt.setCount} сер.)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {hasActiveFilter && (
                <button
                  type="button"
                  data-testid="hevy-clear-filters-btn"
                  onClick={() => {
                    setSelectedExercise('');
                    setSearchQuery('');
                    setEnvironmentFilter('all');
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Изчисти филтъра</span>
                </button>
              )}
            </div>

            {/* Филтър по тренировъчна среда */}
            <div className="flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
              <span className="text-xs text-slate-400">Среда:</span>
              <div
                role="group"
                aria-label="Филтър по тренировъчна среда"
                className="inline-flex flex-wrap items-center gap-1.5"
              >
                <button
                  type="button"
                  data-testid="hevy-env-filter-all"
                  aria-pressed={environmentFilter === 'all'}
                  onClick={() => setEnvironmentFilter('all')}
                  className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    environmentFilter === 'all'
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                      : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  Всички ({workouts.length})
                </button>
                {WORKOUT_ENVIRONMENT_OPTIONS.map((envOpt) => {
                  const count = workouts.filter(
                    (w) => classifyWorkoutEnvironment(w) === envOpt.id,
                  ).length;
                  const active = environmentFilter === envOpt.id;
                  return (
                    <button
                      key={envOpt.id}
                      type="button"
                      data-testid={`hevy-env-filter-${envOpt.id}`}
                      aria-pressed={active}
                      onClick={() => setEnvironmentFilter(envOpt.id)}
                      className={`h-8 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                          : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {envOpt.badgeLabel} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Списък с импортираните тренировки */}
          {filteredWorkouts.length === 0 ? (
            <div
              data-testid="hevy-no-matches"
              className="mt-6 rounded-xl border border-white/10 bg-[#0F141F] p-8 text-center"
            >
              <p className="text-sm text-slate-300">
                Няма тренировки, отговарящи на избрания филтър.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedExercise('');
                  setSearchQuery('');
                  setEnvironmentFilter('all');
                }}
                className="mt-4 inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 hover:border-white/30 hover:text-white cursor-pointer"
              >
                Покажи всички тренировки
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-5" data-testid="hevy-workouts-list">
              {filteredWorkouts.map((workout) => {
                const isCollapsed = Boolean(collapsedIds[workout.id]);
                const workoutEnv = classifyWorkoutEnvironment(workout);
                const envMeta = WORKOUT_ENVIRONMENT_META_MAP[workoutEnv];

                return (
                  <article
                    key={workout.id}
                    data-testid="hevy-workout-card"
                    className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-display text-lg font-bold text-white">
                            {workout.title}
                          </h2>
                          <button
                            type="button"
                            data-testid={`workout-env-toggle-${workout.id}`}
                            onClick={() => handleCycleWorkoutEnvironment(workout.id)}
                            title="Кликни за ръчна смяна на средата (Зала / Лостове / Вкъщи)"
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-white/15 bg-[#141B27] px-2 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <span>{envMeta.badgeLabel}</span>
                          </button>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
                          {workout.date && (
                            <span className="font-mono tabular-nums text-slate-300">
                              {formatBgDate(workout.date)}
                            </span>
                          )}
                          {workout.date && <span aria-hidden="true">·</span>}
                          <span className="font-mono tabular-nums">
                            {workout.startTime}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{workout.exercises.length} упражнения</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {workout.totalSets} серии
                          </span>
                        </div>
                        {workout.description && (
                          <p className="mt-2 text-xs text-slate-400">
                            {workout.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">Обем</div>
                          <div className="font-mono text-sm font-bold tabular-nums text-[var(--accent-text)]">
                            {formatNumberBg(workout.totalVolumeKg)} кг
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[11px] text-slate-400">Макс</div>
                          <div className="font-mono text-sm font-bold tabular-nums text-white">
                            {formatNumberBg(workout.maxWeightKg)} кг
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleWorkoutCollapse(workout.id)}
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isCollapsed
                                ? `Разгъни ${workout.title}`
                                : `Свий ${workout.title}`
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#141B27] text-slate-300 transition-colors hover:border-white/25 hover:text-white"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <ChevronUp className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>

                          <button
                            type="button"
                            data-testid={`delete-hevy-workout-${workout.id}`}
                            onClick={() => handleDeleteWorkout(workout.id)}
                            aria-label={`Изтрий тренировка ${workout.title}`}
                            title="Изтрий тренировката"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#141B27] text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="mt-5 space-y-5 border-t border-white/10 pt-4">
                        {workout.exercises.map((exercise, exIdx) => {
                          const hasDistance = exercise.sets.some(
                            (s) => s.distanceKm !== undefined && s.distanceKm > 0,
                          );
                          const hasDuration = exercise.sets.some(
                            (s) =>
                              s.durationSeconds !== undefined &&
                              s.durationSeconds > 0,
                          );
                          const hasRpe = exercise.sets.some(
                            (s) => s.rpe !== undefined,
                          );

                          const prInfo = hiddenPrIndex.byWorkoutAndExercise.get(
                            `${workout.id}::${exercise.title.trim().toLowerCase()}`,
                          );

                          return (
                            <div
                              key={`${workout.id}-${exercise.title}-${exIdx}`}
                              className={
                                exIdx > 0 ? 'border-t border-white/8 pt-4' : ''
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-white">
                                    {exercise.title}
                                  </h3>
                                  <button
                                    type="button"
                                    data-testid={`hevy-technique-btn-${exIdx}`}
                                    onClick={() => {
                                      setDirectTechniqueItem(null);
                                      setTechniqueQuery(exercise.title);
                                    }}
                                    className="inline-flex h-6 items-center gap-1 rounded-md border border-white/12 bg-[#141B27] px-2 text-[11px] font-medium text-slate-300 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                                  >
                                    <span>👁️ Техника и снимки</span>
                                  </button>
                                  {prInfo?.isRepPR && (
                                    <span
                                      data-testid="badge-rep-pr"
                                      title={
                                        prInfo.repPrHits[0]
                                          ? `${prInfo.repPrHits[0].weightLabel}: ${prInfo.repPrHits[0].prevReps} → ${prInfo.repPrHits[0].newReps} повт.`
                                          : 'Нов личен рекорд за повторения'
                                      }
                                      className="rounded border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-200 whitespace-nowrap"
                                    >
                                      🏅 Rep PR
                                    </span>
                                  )}
                                  {prInfo?.isVolumePR && (
                                    <span
                                      data-testid="badge-volume-pr"
                                      title={`Рекорден обем за сесия: ${prInfo.volumePrNew} ${prInfo.volumeUnit}`}
                                      className="rounded border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-200 whitespace-nowrap"
                                    >
                                      📈 Volume PR
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-slate-400">
                                  <span>{exercise.sets.length} серии</span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Макс: {formatNumberBg(exercise.maxWeightKg)} кг
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-slate-200">
                                    Обем: {formatNumberBg(exercise.totalVolumeKg)} кг
                                  </span>
                                </div>
                              </div>

                              <div className="mt-1.5">
                                <ExerciseMuscleTags
                                  exerciseTitle={exercise.title}
                                  customExerciseMappings={customExerciseMappings}
                                  onEdit={setEditingExerciseTitle}
                                  compact
                                />
                              </div>

                              {exercise.notes && (
                                <p className="mt-1 text-xs text-slate-400">
                                  {exercise.notes}
                                </p>
                              )}

                              <div className="mt-2.5 overflow-x-auto">
                                <table className="w-full border-collapse text-left text-xs">
                                  <thead>
                                    <tr className="border-b border-white/8 text-[11px] font-medium text-slate-400">
                                      <th className="py-1.5 pr-3">Серия</th>
                                      <th className="py-1.5 pr-3">Тип</th>
                                      <th className="py-1.5 pr-3 text-right">
                                        Тежест
                                      </th>
                                      <th className="py-1.5 pr-3 text-right">
                                        Повторения
                                      </th>
                                      <th className="py-1.5 text-right">Обем</th>
                                      {hasDistance && (
                                        <th className="py-1.5 pl-3 text-right">
                                          Дистанция
                                        </th>
                                      )}
                                      {hasDuration && (
                                        <th className="py-1.5 pl-3 text-right">
                                          Време
                                        </th>
                                      )}
                                      {hasRpe && (
                                        <th className="py-1.5 pl-3 text-right">
                                          RPE
                                        </th>
                                      )}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-white/6">
                                    {exercise.sets.map((setItem, sIdx) => {
                                      const setVol =
                                        setItem.weightKg !== undefined &&
                                        setItem.reps !== undefined
                                          ? Math.round(
                                              setItem.weightKg *
                                                setItem.reps *
                                                100,
                                            ) / 100
                                          : undefined;

                                      return (
                                        <tr
                                          key={`${exIdx}-set-${sIdx}`}
                                          className="h-8 text-slate-200 hover:bg-white/[0.02]"
                                        >
                                          <td className="py-1 pr-3 font-mono tabular-nums text-slate-400">
                                            #{sIdx + 1}
                                          </td>
                                          <td className="py-1 pr-3 text-slate-300">
                                            {formatSetType(setItem.setType)}
                                          </td>
                                          <td className="py-1 pr-3 text-right font-mono tabular-nums">
                                            {setItem.weightKg !== undefined
                                              ? `${formatNumberBg(setItem.weightKg)} кг`
                                              : '—'}
                                          </td>
                                          <td className="py-1 pr-3 text-right font-mono tabular-nums">
                                            {setItem.reps !== undefined
                                              ? setItem.reps
                                              : '—'}
                                          </td>
                                          <td className="py-1 text-right font-mono tabular-nums text-slate-300">
                                            {setVol !== undefined
                                              ? `${formatNumberBg(setVol)} кг`
                                              : '—'}
                                          </td>
                                          {hasDistance && (
                                            <td className="py-1 pl-3 text-right font-mono tabular-nums text-slate-300">
                                              {setItem.distanceKm !== undefined
                                                ? `${formatNumberBg(setItem.distanceKm)} км`
                                                : '—'}
                                            </td>
                                          )}
                                          {hasDuration && (
                                            <td className="py-1 pl-3 text-right font-mono tabular-nums text-slate-300">
                                              {formatDuration(
                                                setItem.durationSeconds,
                                              )}
                                            </td>
                                          )}
                                          {hasRpe && (
                                            <td className="py-1 pl-3 text-right font-mono tabular-nums text-slate-300">
                                              {setItem.rpe !== undefined
                                                ? formatNumberBg(setItem.rpe)
                                                : '—'}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
        </>
      )}

      <ExerciseMuscleEditorModal
        exerciseTitle={editingExerciseTitle}
        customExerciseMappings={customExerciseMappings}
        onClose={() => setEditingExerciseTitle(null)}
        onSave={onSaveCustomExerciseMapping}
      />

      <ExerciseTechniqueModal
        exerciseQuery={techniqueQuery}
        directExercise={directTechniqueItem}
        onClose={() => {
          setTechniqueQuery(null);
          setDirectTechniqueItem(null);
        }}
      />
    </section>
  );
}
