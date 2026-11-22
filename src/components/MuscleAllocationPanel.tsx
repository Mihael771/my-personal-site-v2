import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Scale, SlidersHorizontal } from 'lucide-react';
import type {
  DateSnapshotStats,
  DayLog,
  MuscleAllocationConfig,
  MuscleAllocationScope,
  MuscleId,
} from '../types/fitness';
import {
  DEFAULT_MUSCLE_ALLOCATION_PERCENTS,
  EQUAL_MUSCLE_ALLOCATION_PERCENTS,
  MUSCLE_GROUPS,
  formatGrams,
  normalizeMusclePercentsTo100,
  roundGrams,
  sanitizeManualMuscleGramsMap,
} from '../utils/fitnessMath';

interface MuscleAllocationPanelProps {
  todayStats: DateSnapshotStats;
  todayEntry?: DayLog;
  dailyBaseGainGrams?: number;
  allocationConfig?: MuscleAllocationConfig;
  onAllocationChange: (next: MuscleAllocationConfig) => void;
  onTodayPerMuscleManualChange: (nextMap: Partial<Record<MuscleId, number>>) => void;
  onClearTodayPerMuscleManual: () => void;
}

const UPPER_FOCUS_PERCENTS: Record<MuscleId, number> = {
  chest: 25,
  back: 25,
  shoulders: 18,
  biceps: 10,
  triceps: 10,
  abs: 7,
  legs: 5,
};

const LOWER_BACK_FOCUS_PERCENTS: Record<MuscleId, number> = {
  chest: 15,
  back: 25,
  shoulders: 10,
  biceps: 4,
  triceps: 4,
  abs: 7,
  legs: 35,
};

export function MuscleAllocationPanel({
  todayStats,
  todayEntry,
  dailyBaseGainGrams,
  allocationConfig,
  onAllocationChange,
  onTodayPerMuscleManualChange,
  onClearTodayPerMuscleManual,
}: MuscleAllocationPanelProps) {
  const isCustomPercentMode = allocationConfig?.mode === 'custom_percent';
  const hasPerMuscleManual = Boolean(
    todayEntry?.muscleGainMode === 'manual' &&
      todayEntry?.manualMuscleGrams &&
      Object.keys(todayEntry.manualMuscleGrams).length > 0,
  );

  const activeMode: 'default' | 'custom_percent' | 'per_muscle_manual' =
    hasPerMuscleManual
      ? 'per_muscle_manual'
      : isCustomPercentMode
        ? 'custom_percent'
        : 'default';

  const [expanded, setExpanded] = useState<boolean>(
    () => activeMode !== 'default',
  );

  const currentPercents: Record<MuscleId, number> = useMemo(() => {
    const out = {} as Record<MuscleId, number>;
    for (const def of MUSCLE_GROUPS) {
      out[def.id] =
        allocationConfig?.percents?.[def.id] ??
        DEFAULT_MUSCLE_ALLOCATION_PERCENTS[def.id];
    }
    return out;
  }, [allocationConfig?.percents]);

  const currentScope: MuscleAllocationScope =
    allocationConfig?.scope ?? 'trained_only';

  const totalPercentSum = useMemo(
    () =>
      roundGrams(
        MUSCLE_GROUPS.reduce((sum, m) => sum + (currentPercents[m.id] ?? 0), 0),
      ),
    [currentPercents],
  );

  // Reference daily grams used for live preview next to each slider
  const referenceDailyGrams = useMemo(() => {
    if (todayStats.gainedOnDateTotal > 0) return todayStats.gainedOnDateTotal;
    if (dailyBaseGainGrams !== undefined) {
      return roundGrams(dailyBaseGainGrams * todayStats.recovery.multiplier);
    }
    return roundGrams(31 * todayStats.recovery.multiplier);
  }, [todayStats.gainedOnDateTotal, todayStats.recovery.multiplier, dailyBaseGainGrams]);

  const currentManualGramsMap = useMemo(() => {
    const sanitized = sanitizeManualMuscleGramsMap(todayEntry?.manualMuscleGrams);
    const out = {} as Record<MuscleId, number>;
    for (const def of MUSCLE_GROUPS) {
      out[def.id] = sanitized?.[def.id] ?? 0;
    }
    return out;
  }, [todayEntry?.manualMuscleGrams]);

  const manualSumGrams = useMemo(
    () =>
      roundGrams(
        MUSCLE_GROUPS.reduce(
          (sum, m) => sum + (currentManualGramsMap[m.id] ?? 0),
          0,
        ),
      ),
    [currentManualGramsMap],
  );

  function selectMode(nextMode: 'default' | 'custom_percent' | 'per_muscle_manual') {
    if (nextMode === 'default') {
      if (hasPerMuscleManual) {
        onClearTodayPerMuscleManual();
      }
      onAllocationChange({
        mode: 'default',
        scope: currentScope,
        percents: currentPercents,
      });
      setExpanded(false);
      return;
    }

    if (nextMode === 'custom_percent') {
      if (hasPerMuscleManual) {
        onClearTodayPerMuscleManual();
      }
      onAllocationChange({
        mode: 'custom_percent',
        scope: currentScope,
        percents: currentPercents,
      });
      setExpanded(true);
      return;
    }

    // per_muscle_manual: seed from today's current breakdown so user starts with real values
    const seed: Partial<Record<MuscleId, number>> = {};
    for (const def of MUSCLE_GROUPS) {
      seed[def.id] = hasPerMuscleManual
        ? currentManualGramsMap[def.id]
        : todayStats.byMuscle[def.id]?.gainedOnDate ?? 0;
    }
    onTodayPerMuscleManualChange(seed);
    setExpanded(true);
  }

  function updateSinglePercent(muscleId: MuscleId, rawValue: number) {
    const clamped = Number.isFinite(rawValue)
      ? Math.max(0, Math.min(100, roundGrams(rawValue)))
      : 0;
    onAllocationChange({
      mode: 'custom_percent',
      scope: currentScope,
      percents: {
        ...currentPercents,
        [muscleId]: clamped,
      },
    });
  }

  function applyPercentPreset(preset: Record<MuscleId, number>) {
    onAllocationChange({
      mode: 'custom_percent',
      scope: currentScope,
      percents: { ...preset },
    });
  }

  function handleScopeChange(nextScope: MuscleAllocationScope) {
    onAllocationChange({
      mode: 'custom_percent',
      scope: nextScope,
      percents: currentPercents,
    });
  }

  function updateManualMuscleGrams(muscleId: MuscleId, rawValue: number) {
    const clamped = Number.isFinite(rawValue)
      ? Math.max(0, Math.min(50000, roundGrams(rawValue)))
      : 0;
    onTodayPerMuscleManualChange({
      ...currentManualGramsMap,
      [muscleId]: clamped,
    });
  }

  return (
    <div
      id="muscle-allocation"
      data-testid="muscle-allocation-panel"
      className={`mb-6 rounded-2xl border p-4 sm:p-5 transition-colors ${
        activeMode !== 'default'
          ? 'border-[var(--accent-border)] bg-[#111826]'
          : 'border-white/10 bg-[#0F141F]'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-2.5">
          <SlidersHorizontal
            className="mt-0.5 h-4 w-4 text-[var(--accent-text)] shrink-0"
            aria-hidden="true"
          />
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              Разпределение на дневната мускулна маса по групи
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              {activeMode === 'per_muscle_manual'
                ? `Ръчно за днес: задаваш точни грамове за всяка група (общо +${formatGrams(manualSumGrams)} г).`
                : activeMode === 'custom_percent'
                  ? `Мои проценти (${totalPercentSum}% общо) · ${
                      currentScope === 'all_groups'
                        ? 'разпределя към всички 7 групи'
                        : 'разпределя между тренираните днес'
                    }.`
                  : 'Стандартно (анатомично съотношение според мускулната група).'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Режим на разпределение по мускулни групи"
            className="inline-flex flex-wrap items-center rounded-lg border border-white/12 bg-[#0B0F17] p-0.5"
          >
            <button
              type="button"
              data-testid="allocation-mode-default"
              aria-pressed={activeMode === 'default'}
              onClick={() => selectMode('default')}
              className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeMode === 'default'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Стандартно
            </button>
            <button
              type="button"
              data-testid="allocation-mode-custom-percent"
              aria-pressed={activeMode === 'custom_percent'}
              onClick={() => selectMode('custom_percent')}
              className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeMode === 'custom_percent'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              По избор (%)
            </button>
            <button
              type="button"
              data-testid="allocation-mode-per-muscle-manual"
              aria-pressed={activeMode === 'per_muscle_manual'}
              onClick={() => selectMode('per_muscle_manual')}
              className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeMode === 'per_muscle_manual'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Точни грамове днес (г)
            </button>
          </div>

          <button
            type="button"
            data-testid="allocation-toggle-expand-btn"
            onClick={() => {
              if (!expanded && activeMode === 'default') {
                selectMode('custom_percent');
              } else {
                setExpanded((prev) => !prev);
              }
            }}
            aria-expanded={expanded}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/12 bg-[#161E2E] px-3 text-xs font-medium text-slate-200 hover:border-white/25 hover:text-white whitespace-nowrap"
          >
            <span>{expanded ? 'Скрий' : 'Настрой'}</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {expanded && activeMode === 'custom_percent' && (
        <div
          data-testid="allocation-custom-percent-editor"
          className="mt-4 border-t border-white/10 pt-4 space-y-4"
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-slate-400">Шаблони:</span>
              <button
                type="button"
                data-testid="allocation-preset-anatomical"
                onClick={() => applyPercentPreset(DEFAULT_MUSCLE_ALLOCATION_PERCENTS)}
                className="h-8 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-[var(--accent-border)] hover:text-white"
              >
                Анатомично
              </button>
              <button
                type="button"
                data-testid="allocation-preset-equal"
                onClick={() => applyPercentPreset(EQUAL_MUSCLE_ALLOCATION_PERCENTS)}
                className="h-8 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-[var(--accent-border)] hover:text-white"
              >
                По равно
              </button>
              <button
                type="button"
                data-testid="allocation-preset-upper"
                onClick={() => applyPercentPreset(UPPER_FOCUS_PERCENTS)}
                className="h-8 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-[var(--accent-border)] hover:text-white"
              >
                Фокус Горна част
              </button>
              <button
                type="button"
                data-testid="allocation-preset-lower-back"
                onClick={() => applyPercentPreset(LOWER_BACK_FOCUS_PERCENTS)}
                className="h-8 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-[var(--accent-border)] hover:text-white"
              >
                Фокус Крака & Гръб
              </button>
              <button
                type="button"
                data-testid="allocation-normalize-btn"
                onClick={() =>
                  applyPercentPreset(normalizeMusclePercentsTo100(currentPercents))
                }
                className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                  Math.abs(totalPercentSum - 100) >= 0.1
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)] hover:brightness-110'
                    : 'border-white/12 bg-[#0B0F17] text-slate-400 hover:text-white'
                }`}
              >
                <Scale className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Изравни до 100%</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label="Обхват на процентното разпределение"
                className="inline-flex flex-wrap items-center rounded-lg border border-white/12 bg-[#0B0F17] p-0.5"
              >
                <button
                  type="button"
                  data-testid="allocation-scope-trained"
                  aria-pressed={currentScope === 'trained_only'}
                  onClick={() => handleScopeChange('trained_only')}
                  className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    currentScope === 'trained_only'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Само към тренираните днес
                </button>
                <button
                  type="button"
                  data-testid="allocation-scope-all"
                  aria-pressed={currentScope === 'all_groups'}
                  onClick={() => handleScopeChange('all_groups')}
                  className={`h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap ${
                    currentScope === 'all_groups'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Към всички 7 групи (по %)
                </button>
              </div>

              <div
                data-testid="allocation-percent-sum"
                className={`font-mono text-xs font-bold tabular-nums ${
                  Math.abs(totalPercentSum - 100) < 0.1
                    ? 'text-emerald-400'
                    : 'text-amber-300'
                }`}
              >
                Сбор: {formatGrams(totalPercentSum)}%
                {Math.abs(totalPercentSum - 100) >= 0.1 && ' (нормира се пропорционално)'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MUSCLE_GROUPS.map((def) => {
              const pct = currentPercents[def.id] ?? 0;
              const normalizedShare =
                totalPercentSum > 0 ? pct / totalPercentSum : 0;
              const previewGrams = roundGrams(referenceDailyGrams * normalizedShare);
              const actualTodayGrams = todayStats.byMuscle[def.id]?.gainedOnDate ?? 0;

              return (
                <div
                  key={def.id}
                  data-testid={`allocation-row-${def.id}`}
                  className="rounded-xl border border-white/10 bg-[#0B0F17] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`alloc-pct-${def.id}`}
                      className="text-xs font-semibold text-white"
                    >
                      {def.label}
                    </label>
                    <span className="font-mono text-[11px] tabular-nums text-[var(--accent-text)]">
                      {actualTodayGrams > 0
                        ? `днес +${formatGrams(actualTodayGrams)} г`
                        : `~+${formatGrams(previewGrams)} г`}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      aria-label={`Процент за ${def.label}`}
                      value={Math.min(100, pct)}
                      onChange={(e) =>
                        updateSinglePercent(def.id, parseFloat(e.target.value))
                      }
                      className="h-1.5 flex-1 cursor-pointer accent-[var(--accent)]"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        id={`alloc-pct-${def.id}`}
                        data-testid={`alloc-pct-input-${def.id}`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={pct}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updateSinglePercent(def.id, Number.isNaN(v) ? 0 : v);
                        }}
                        className="h-8 w-16 rounded-lg border border-white/15 bg-[#141B27] px-2 text-right font-mono text-xs font-semibold tabular-nums text-white focus:border-[var(--accent)]"
                      />
                      <span className="font-mono text-xs text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {expanded && activeMode === 'per_muscle_manual' && (
        <div
          data-testid="allocation-per-muscle-manual-editor"
          className="mt-4 border-t border-white/10 pt-4 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-300">
              Въведи точните грамове за всяка мускулна група за днес. Общият дневен прираст се изчислява автоматично като сбор.
            </p>
            <div className="flex items-center gap-3">
              <span
                data-testid="per-muscle-manual-sum"
                className="font-mono text-sm font-bold tabular-nums text-[var(--accent-text)]"
              >
                Общо днес: +{formatGrams(manualSumGrams)} г
              </span>
              <button
                type="button"
                data-testid="per-muscle-manual-clear-btn"
                onClick={() => selectMode('default')}
                className="h-8 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-white/25 hover:text-white"
              >
                Върни автоматично
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MUSCLE_GROUPS.map((def) => {
              const grams = currentManualGramsMap[def.id] ?? 0;
              const sharePct =
                manualSumGrams > 0
                  ? Math.round((grams / manualSumGrams) * 100)
                  : 0;

              return (
                <div
                  key={def.id}
                  className="rounded-xl border border-white/10 bg-[#0B0F17] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={`manual-muscle-grams-${def.id}`}
                      className="text-xs font-semibold text-white"
                    >
                      {def.label}
                    </label>
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      {sharePct}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      id={`manual-muscle-grams-${def.id}`}
                      data-testid={`manual-muscle-grams-input-${def.id}`}
                      type="number"
                      min={0}
                      max={50000}
                      step="0.5"
                      value={grams}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        updateManualMuscleGrams(def.id, Number.isNaN(v) ? 0 : v);
                      }}
                      className="h-9 flex-1 rounded-lg border border-[var(--accent-border)] bg-[#141B27] px-2.5 font-mono text-sm font-semibold tabular-nums text-white focus:border-[var(--accent)]"
                    />
                    <span className="font-mono text-xs text-slate-300">г</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
