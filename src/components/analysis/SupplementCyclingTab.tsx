import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  SupplementCycleConfig,
  SupplementMetricComparison,
} from '../../types/fitness';
import { computeSupplementImpactAnalysis } from '../../utils/analysisPrep';
import { formatNumberBg, getLocalDateKey } from '../../utils/fitnessMath';

interface SupplementCyclingTabProps {
  habitItems: string[];
  supplementCycles: Record<string, SupplementCycleConfig>;
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  onSaveCycleConfig: (config: SupplementCycleConfig) => Promise<void>;
  onUpdateHabitItems: (nextHabits: string[]) => Promise<void>;
}

function formatMetricDelta(
  comp: SupplementMetricComparison,
  unit: string,
  invertGoodDirection: boolean = false,
): {
  onText: string;
  offText: string;
  deltaText: string;
  deltaClass: string;
} {
  const onText =
    comp.onAvg !== null ? `${formatNumberBg(comp.onAvg)} ${unit}` : '—';
  const offText =
    comp.offAvg !== null ? `${formatNumberBg(comp.offAvg)} ${unit}` : '—';

  if (comp.diffPercent === null) {
    return {
      onText,
      offText,
      deltaText: 'Нужни са дни С и БЕЗ прием',
      deltaClass: 'text-slate-500',
    };
  }

  const sign = comp.diffPercent > 0 ? '+' : '';
  const deltaText = `${sign}${formatNumberBg(comp.diffPercent)}%`;

  if (comp.diffPercent === 0) {
    return {
      onText,
      offText,
      deltaText: '0%',
      deltaClass: 'text-slate-300',
    };
  }

  const isPositiveOutcome = invertGoodDirection
    ? comp.diffPercent < 0
    : comp.diffPercent > 0;

  return {
    onText,
    offText,
    deltaText,
    deltaClass: isPositiveOutcome ? 'text-emerald-400' : 'text-amber-300',
  };
}

export function SupplementCyclingTab({
  habitItems,
  supplementCycles,
  dailyLogs,
  hevyWorkouts,
  onSaveCycleConfig,
  onUpdateHabitItems,
}: SupplementCyclingTabProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const [newItemName, setNewItemName] = useState('');
  const [busyName, setBusyName] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const analyses = useMemo(
    () =>
      computeSupplementImpactAnalysis({
        habitItems,
        supplementCycles,
        dailyLogs,
        hevyWorkouts,
        todayKey,
      }),
    [habitItems, supplementCycles, dailyLogs, hevyWorkouts, todayKey],
  );

  async function handleUpdateConfig(next: SupplementCycleConfig) {
    setBusyName(next.name);
    setErrorMsg(null);
    try {
      await onSaveCycleConfig(next);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Неуспешно запазване на цикъла за добавката.',
      );
    } finally {
      setBusyName(null);
    }
  }

  async function handleAddSupplement(e: React.FormEvent) {
    e.preventDefault();
    const clean = newItemName.trim().slice(0, 60);
    if (!clean) return;
    if (habitItems.some((h) => h.toLowerCase() === clean.toLowerCase())) {
      setNewItemName('');
      return;
    }
    setErrorMsg(null);
    try {
      await onUpdateHabitItems([...habitItems, clean]);
      setNewItemName('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Неуспешно добавяне на новия елемент.',
      );
    }
  }

  async function handleRemoveSupplement(name: string) {
    setErrorMsg(null);
    try {
      await onUpdateHabitItems(habitItems.filter((h) => h !== name));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Неуспешно премахване.',
      );
    }
  }

  return (
    <div data-testid="tab-supplement-cycling" className="space-y-6">
      {/* Заглавие + Добавяне на нова добавка / навик */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Цикли и корелационен ефект на добавките
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Настрой всяка добавка или навик от „Дневен чек-ин“ като постоянен или цикличен прием (напр. 8 седмици прием / 2 седмици почивка) и проследи реалния ефект в проценти върху сън, пулс и тренировки.
          </p>
        </div>

        <form
          onSubmit={handleAddSupplement}
          className="flex items-center gap-2 shrink-0"
        >
          <label htmlFor="supplement-add-input" className="sr-only">
            Нова добавка или навик
          </label>
          <input
            id="supplement-add-input"
            data-testid="supplement-add-input"
            type="text"
            maxLength={60}
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="Добави добавка (напр. Цинк)…"
            className="h-9 w-52 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            data-testid="supplement-add-btn"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] whitespace-nowrap"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Добави</span>
          </button>
        </form>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/25 px-4 py-3 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      )}

      {analyses.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center text-sm text-slate-400">
          Списъкът с добавки и навици е празен. Добави първия елемент по-горе.
        </div>
      ) : (
        <div className="space-y-4">
          {analyses.map((item) => {
            const { config, cycleStatus } = item;
            const badgeColors =
              cycleStatus.phase === 'on'
                ? 'border-emerald-500/35 bg-emerald-950/25 text-emerald-300'
                : cycleStatus.phase === 'off'
                  ? 'border-amber-500/40 bg-amber-950/25 text-amber-300'
                  : cycleStatus.phase === 'upcoming'
                    ? 'border-sky-500/35 bg-sky-950/20 text-sky-300'
                    : 'border-white/15 bg-[#141B27] text-slate-300';

            const sleepComp = formatMetricDelta(item.sleepQuality, '/5', false);
            const hrComp = formatMetricDelta(item.restingHr, 'bpm', true);
            const volComp = formatMetricDelta(item.workoutVolume, 'kg', false);
            const rmComp = formatMetricDelta(item.peak1RM, 'kg', false);

            return (
              <article
                key={item.name}
                data-testid={`supplement-card-${item.name}`}
                className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
              >
                {/* Заглавен ред и настройки на цикъла */}
                <div className="flex flex-col gap-4 border-b border-white/10 pb-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-display text-base font-bold text-white">
                        {item.name}
                      </h3>
                      <span
                        data-testid={`supplement-cycle-badge-${item.name}`}
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${badgeColors}`}
                      >
                        {cycleStatus.badgeText}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-slate-400">
                      Дни С прием: {item.daysOnCount} · Дни БЕЗ прием:{' '}
                      {item.daysOffCount}
                    </div>
                  </div>

                  {/* Контроли за режим: Постоянен / Цикличен */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div
                      role="group"
                      aria-label={`Режим за ${item.name}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
                    >
                      <button
                        type="button"
                        disabled={busyName === item.name}
                        data-testid={`supplement-mode-continuous-${item.name}`}
                        onClick={() =>
                          handleUpdateConfig({
                            ...config,
                            mode: 'continuous',
                          })
                        }
                        className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          config.mode === 'continuous'
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Постоянен
                      </button>
                      <button
                        type="button"
                        disabled={busyName === item.name}
                        data-testid={`supplement-mode-cyclic-${item.name}`}
                        onClick={() =>
                          handleUpdateConfig({
                            ...config,
                            mode: 'cyclic',
                          })
                        }
                        className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                          config.mode === 'cyclic'
                            ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Цикличен
                      </button>
                    </div>

                    {config.mode === 'cyclic' && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <label className="flex items-center gap-1 text-slate-400">
                          <span>Прием (седм.):</span>
                          <input
                            type="number"
                            min={1}
                            max={52}
                            value={config.onWeeks}
                            onChange={(e) => {
                              const val = Math.max(
                                1,
                                Math.min(52, Number(e.target.value) || 1),
                              );
                              void handleUpdateConfig({ ...config, onWeeks: val });
                            }}
                            className="h-8 w-14 rounded-md border border-white/15 bg-[#141B27] px-2 font-mono text-xs tabular-nums text-white"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-slate-400">
                          <span>Почивка (седм.):</span>
                          <input
                            type="number"
                            min={1}
                            max={26}
                            value={config.offWeeks}
                            onChange={(e) => {
                              const val = Math.max(
                                1,
                                Math.min(26, Number(e.target.value) || 1),
                              );
                              void handleUpdateConfig({ ...config, offWeeks: val });
                            }}
                            className="h-8 w-14 rounded-md border border-white/15 bg-[#141B27] px-2 font-mono text-xs tabular-nums text-white"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-slate-400">
                          <span>Начало:</span>
                          <input
                            type="date"
                            value={config.startDate}
                            onChange={(e) => {
                              if (e.target.value) {
                                void handleUpdateConfig({
                                  ...config,
                                  startDate: e.target.value,
                                });
                              }
                            }}
                            className="h-8 rounded-md border border-white/15 bg-[#141B27] px-2 font-mono text-xs tabular-nums text-white"
                          />
                        </label>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => void handleRemoveSupplement(item.name)}
                      aria-label={`Премахни ${item.name}`}
                      title="Премахни елемента"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/5 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Корелационен анализ: С прием vs БЕЗ прием */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: 'Качество на съня / Свежест',
                      data: sleepComp,
                      counts: `${item.sleepQuality.onCount} с / ${item.sleepQuality.offCount} без`,
                    },
                    {
                      label: 'Пулс в покой',
                      data: hrComp,
                      counts: `${item.restingHr.onCount} с / ${item.restingHr.offCount} без`,
                    },
                    {
                      label: 'Среден тренировъчен обем',
                      data: volComp,
                      counts: `${item.workoutVolume.onCount} с / ${item.workoutVolume.offCount} без`,
                    },
                    {
                      label: 'Пиков 1RM в сесиите',
                      data: rmComp,
                      counts: `${item.peak1RM.onCount} с / ${item.peak1RM.offCount} без`,
                    },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="rounded-xl border border-white/10 bg-[#141B27] p-3.5"
                    >
                      <div className="text-[11px] font-medium text-slate-400">
                        {m.label}
                      </div>
                      <div
                        className={`mt-1 font-mono text-base font-bold tabular-nums ${m.data.deltaClass}`}
                      >
                        {m.data.deltaText}
                      </div>
                      <div className="mt-1.5 font-mono text-[11px] tabular-nums text-slate-300">
                        С: {m.data.onText} · Без: {m.data.offText}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        Извадка: {m.counts} дни
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
