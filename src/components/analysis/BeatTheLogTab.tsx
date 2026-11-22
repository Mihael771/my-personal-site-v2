import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Search } from 'lucide-react';
import type { HevyWorkout } from '../../types/fitness';
import {
  buildBeatTheLogTargets,
  formatTargetsForClipboard,
  getUniqueHevyRoutines,
} from '../../utils/analysisPrep';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';
import { getExercisesSortedByFrequency } from '../../utils/hevyProgress';

interface BeatTheLogTabProps {
  hevyWorkouts: HevyWorkout[];
  onNavigateToHevy: () => void;
}

const CUSTOM_MODE_VALUE = '__custom_exercises__';

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function BeatTheLogTab({
  hevyWorkouts,
  onNavigateToHevy,
}: BeatTheLogTabProps) {
  const routines = useMemo(
    () => getUniqueHevyRoutines(hevyWorkouts),
    [hevyWorkouts],
  );
  const allExercises = useMemo(
    () => getExercisesSortedByFrequency(hevyWorkouts),
    [hevyWorkouts],
  );

  const [selectedRoutine, setSelectedRoutine] = useState<string>(() =>
    routines[0]?.title ?? CUSTOM_MODE_VALUE,
  );
  const [customSelected, setCustomSelected] = useState<string[]>(() =>
    allExercises.slice(0, 4).map((e) => e.title),
  );
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [copiedState, setCopiedState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );

  useEffect(() => {
    if (
      selectedRoutine !== CUSTOM_MODE_VALUE &&
      !routines.some((r) => r.title === selectedRoutine)
    ) {
      setSelectedRoutine(routines[0]?.title ?? CUSTOM_MODE_VALUE);
    }
  }, [routines, selectedRoutine]);

  useEffect(() => {
    if (customSelected.length === 0 && allExercises.length > 0) {
      setCustomSelected(allExercises.slice(0, 4).map((e) => e.title));
    }
  }, [allExercises, customSelected.length]);

  const activeExerciseTitles = useMemo(() => {
    if (selectedRoutine === CUSTOM_MODE_VALUE) {
      return customSelected;
    }
    const found = routines.find((r) => r.title === selectedRoutine);
    return found?.exerciseTitles ?? [];
  }, [selectedRoutine, routines, customSelected]);

  const targets = useMemo(
    () => buildBeatTheLogTargets(hevyWorkouts, activeExerciseTitles),
    [hevyWorkouts, activeExerciseTitles],
  );

  const filteredCustomExercises = useMemo(() => {
    const q = exerciseSearch.trim().toLowerCase();
    if (!q) return allExercises;
    return allExercises.filter((e) => e.title.toLowerCase().includes(q));
  }, [allExercises, exerciseSearch]);

  function toggleCustomExercise(title: string) {
    setCustomSelected((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );
  }

  async function handleCopy() {
    if (targets.length === 0) return;
    const label =
      selectedRoutine === CUSTOM_MODE_VALUE
        ? 'Избрани упражнения'
        : selectedRoutine;
    const text = formatTargetsForClipboard(label, targets);
    const ok = await copyTextSafe(text);
    setCopiedState(ok ? 'copied' : 'error');
    window.setTimeout(() => setCopiedState('idle'), 2500);
  }

  if (hevyWorkouts.length === 0) {
    return (
      <div
        data-testid="tab-beat-the-log"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center"
      >
        <h2 className="font-display text-lg font-bold text-white">
          Няма импортирани тренировки от Hevy
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Импортирай CSV файл от Hevy, за да генерираме конкретни цели (+2.5 kg или +1 повторение) за следващата ти тренировка.
        </p>
        <button
          type="button"
          onClick={onNavigateToHevy}
          className="mt-4 h-9 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)]"
        >
          Към Тренировки (Hevy)
        </button>
      </div>
    );
  }

  return (
    <div data-testid="tab-beat-the-log" className="space-y-6">
      {/* Контроли: Избор на програма или отделни упражнения + Копиране */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1 max-w-xl">
            <label
              htmlFor="beat-log-routine-select"
              className="mb-1.5 block text-xs font-medium text-slate-300"
            >
              Избери тренировъчна програма / рутина или отделни упражнения
            </label>
            <select
              id="beat-log-routine-select"
              data-testid="beat-log-routine-select"
              value={selectedRoutine}
              onChange={(e) => setSelectedRoutine(e.target.value)}
              className="h-10 w-full rounded-lg border border-white/15 bg-[#141B27] px-3 text-sm text-white focus:border-[var(--accent)]"
            >
              {routines.map((r) => (
                <option key={r.title} value={r.title}>
                  {r.title} ({r.exerciseTitles.length} упр. · посл.{' '}
                  {r.lastDate ? formatBgDate(r.lastDate) : ''})
                </option>
              ))}
              <option value={CUSTOM_MODE_VALUE}>
                Избери отделни упражнения ({customSelected.length})
              </option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              data-testid="beat-log-copy-btn"
              disabled={targets.length === 0}
              onClick={handleCopy}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
            >
              {copiedState === 'copied' ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  <span>Копирано в клипборда!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  <span>Копирай целите за днес</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Режим за избор на отделни упражнения */}
        {selectedRoutine === CUSTOM_MODE_VALUE && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={exerciseSearch}
                  onChange={(e) => setExerciseSearch(e.target.value)}
                  placeholder="Търси упражнение…"
                  className="h-9 w-full rounded-lg border border-white/15 bg-[#141B27] pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                />
              </div>
              <div className="text-xs text-slate-400 font-mono tabular-nums">
                Избрани: {customSelected.length} упражнения
              </div>
            </div>

            <div className="mt-3 grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {filteredCustomExercises.map((ex) => {
                const checked = customSelected.includes(ex.title);
                return (
                  <label
                    key={ex.title}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                      checked
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-white'
                        : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCustomExercise(ex.title)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="truncate">{ex.title}</span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {ex.workoutCount} тр.
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Списък с цели за всяко упражнение */}
      {targets.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-6 text-center text-sm text-slate-400">
          Избери рутина или поне едно упражнение със записани серии, за да видиш целите за днес.
        </div>
      ) : (
        <div
          data-testid="beat-log-targets-list"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          {targets.map((target) => {
            const isWeightUp = target.strategy === 'increase_weight';
            return (
              <article
                key={target.exerciseTitle}
                data-testid={`beat-target-${target.exerciseTitle}`}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5"
              >
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-white">
                      {target.exerciseTitle}
                    </h3>
                    <span
                      className={`text-xs font-semibold ${
                        isWeightUp ? 'text-emerald-400' : 'text-sky-300'
                      }`}
                    >
                      {isWeightUp ? '+2.5 kg прогресия' : '+1 повторение'}
                    </span>
                  </div>

                  <div className="mt-1 text-xs text-slate-500">
                    Последно: {formatBgDate(target.lastDate)} · {target.lastWorkoutTitle}
                  </div>

                  <div className="mt-4 space-y-2 rounded-xl border border-white/8 bg-[#141B27] p-3.5">
                    <div className="font-mono text-xs tabular-nums text-slate-400">
                      {target.lastLine}
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums text-white">
                      → {target.targetLine}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs">
                  <span className="text-slate-400">{target.rpeNote}</span>
                  {target.targetEstimated1RM > 0 && (
                    <span className="font-mono font-semibold tabular-nums text-[var(--accent-text)]">
                      Целеви 1RM: {formatNumberBg(target.targetEstimated1RM)} kg (от{' '}
                      {formatNumberBg(target.lastSummary.bestEstimated1RM)} kg)
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
