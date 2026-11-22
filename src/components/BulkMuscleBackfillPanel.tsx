import { useMemo, useState } from 'react';
import { CalendarRange, Check, Layers, X } from 'lucide-react';
import type { DayLog, MuscleAllocationConfig, MuscleId } from '../types/fitness';
import {
  MUSCLE_GROUPS,
  calculateDayGainsBreakdown,
  formatBgDate,
  formatGrams,
  generateBulkBackfillLogs,
  shiftDateKey,
  type BulkBackfillMode,
} from '../utils/fitnessMath';

interface BulkMuscleBackfillPanelProps {
  todayKey: string;
  logs: Record<string, DayLog>;
  defaultDailyBaseGainGrams?: number;
  allocationConfig?: MuscleAllocationConfig;
  onApplyBackfill: (
    mergedLogs: Record<string, DayLog>,
    summary: { daysCount: number; totalGrams: number; startDate: string; endDate: string },
  ) => void;
  onClose: () => void;
}

const DAILY_RATE_PRESETS = [10, 15.5, 20, 30];

export function BulkMuscleBackfillPanel({
  todayKey,
  logs,
  defaultDailyBaseGainGrams,
  allocationConfig,
  onApplyBackfill,
  onClose,
}: BulkMuscleBackfillPanelProps) {
  const [startDate, setStartDate] = useState<string>(() => shiftDateKey(todayKey, -14));
  const [endDate, setEndDate] = useState<string>(todayKey);
  const [mode, setMode] = useState<BulkBackfillMode>('total_grams');
  const [unit, setUnit] = useState<'g' | 'kg'>('g');
  const [amountInput, setAmountInput] = useState<string>(
    defaultDailyBaseGainGrams ? String(Math.round(defaultDailyBaseGainGrams * 15)) : '200',
  );
  const [selectedMuscles, setSelectedMuscles] = useState<MuscleId[]>(() =>
    MUSCLE_GROUPS.map((m) => m.id),
  );
  const [overwriteExisting, setOverwriteExisting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountGrams = useMemo(() => {
    const parsed = parseFloat(amountInput.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    if (mode === 'total_grams' && unit === 'kg') {
      return parsed * 1000;
    }
    return parsed;
  }, [amountInput, mode, unit]);

  const preview = useMemo(
    () =>
      generateBulkBackfillLogs({
        startDate,
        endDate,
        mode,
        amountGrams,
        muscles: selectedMuscles,
        overwriteExisting,
        existingLogs: logs,
      }),
    [startDate, endDate, mode, amountGrams, selectedMuscles, overwriteExisting, logs],
  );

  function applyQuickSpan(daysBack: number) {
    setStartDate(shiftDateKey(todayKey, -daysBack));
    setEndDate(todayKey);
    setFeedback(null);
    setError(null);
  }

  function toggleMuscle(id: MuscleId) {
    setFeedback(null);
    setSelectedMuscles((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleModeSwitch(nextMode: BulkBackfillMode) {
    setMode(nextMode);
    setFeedback(null);
    setError(null);
    if (nextMode === 'daily_grams') {
      setUnit('g');
      setAmountInput(String(defaultDailyBaseGainGrams ?? 15.5));
    } else {
      const days = Math.max(1, preview.targetDates.length || 15);
      const suggested = Math.round((defaultDailyBaseGainGrams ?? 15.5) * days);
      setAmountInput(String(suggested));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !endDate || startDate > endDate) {
      setError('Началната дата трябва да е преди или равна на крайната дата.');
      return;
    }
    if (preview.targetDates.length === 0) {
      setError(
        'Всички дни в избрания период вече имат данни. Маркирай „Презапиши и вече въведените дни“, ако искаш да ги обновиш.',
      );
      return;
    }
    if (amountGrams <= 0) {
      setError('Въведи положително количество мускулна маса (в грамове или килограми).');
      return;
    }

    onApplyBackfill(preview.mergedLogs, {
      daysCount: preview.targetDates.length,
      totalGrams: preview.totalAddedGrams,
      startDate,
      endDate,
    });
    setError(null);
    setFeedback(
      `Автоматично попълнени ${preview.targetDates.length} дни (${formatBgDate(startDate)} — ${formatBgDate(endDate)}) с общо +${formatGrams(preview.totalAddedGrams)} г!`,
    );
  }

  const allSelected = selectedMuscles.length === MUSCLE_GROUPS.length;

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="bulk-backfill-panel"
      className="mx-auto mt-3 max-w-[1280px] rounded-xl border border-[var(--accent-border)] bg-[#101623] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-start gap-2.5">
          <CalendarRange
            className="mt-0.5 h-4 w-4 text-[var(--accent-text)] shrink-0"
            aria-hidden="true"
          />
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              Бързо ръчно вкарване и автоматично попълване от стара дата до днес
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Въведи общо натрупаната досега мускулна маса или дневния грамаж и избери начална стара дата — системата ще попълни автоматично всички дни до днес.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори панела за бързо попълване"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#161E2E] text-slate-400 hover:text-white shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          {/* Режим + Стойност */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Начин на въвеждане
              </span>
              <div
                role="group"
                aria-label="Начин на въвеждане на мускулната маса"
                className="inline-flex h-9 w-full items-center rounded-lg border border-white/12 bg-[#0B0F17] p-0.5"
              >
                <button
                  type="button"
                  data-testid="backfill-mode-total"
                  aria-pressed={mode === 'total_grams'}
                  onClick={() => handleModeSwitch('total_grams')}
                  className={`h-7.5 flex-1 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'total_grams'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Общо за периода
                </button>
                <button
                  type="button"
                  data-testid="backfill-mode-daily"
                  aria-pressed={mode === 'daily_grams'}
                  onClick={() => handleModeSwitch('daily_grams')}
                  className={`h-7.5 flex-1 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    mode === 'daily_grams'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Грамове на ден
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="backfill-amount-input"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                {mode === 'total_grams'
                  ? 'Натрупана мускулна маса'
                  : 'Дневен прираст (г / ден)'}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="backfill-amount-input"
                  data-testid="backfill-amount-input"
                  type="number"
                  min={0}
                  max={mode === 'total_grams' && unit === 'kg' ? 50 : 50000}
                  step={mode === 'total_grams' && unit === 'kg' ? '0.01' : '0.5'}
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setFeedback(null);
                    setError(null);
                  }}
                  className="h-9 min-w-[110px] flex-1 rounded-lg border border-white/15 bg-[#0B0F17] px-3 font-mono text-sm font-semibold tabular-nums text-white focus:border-[var(--accent)]"
                />
                {mode === 'total_grams' ? (
                  <div className="inline-flex h-9 items-center rounded-lg border border-white/12 bg-[#0B0F17] p-0.5 shrink-0">
                    <button
                      type="button"
                      data-testid="backfill-unit-g"
                      onClick={() => {
                        if (unit === 'kg') {
                          setUnit('g');
                          const num = parseFloat(amountInput);
                          if (Number.isFinite(num)) setAmountInput(String(Math.round(num * 1000)));
                        }
                      }}
                      className={`h-7.5 rounded-md px-2.5 text-xs font-semibold ${
                        unit === 'g'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      г
                    </button>
                    <button
                      type="button"
                      data-testid="backfill-unit-kg"
                      onClick={() => {
                        if (unit === 'g') {
                          setUnit('kg');
                          const num = parseFloat(amountInput);
                          if (Number.isFinite(num)) setAmountInput((num / 1000).toFixed(3));
                        }
                      }}
                      className={`h-7.5 rounded-md px-2.5 text-xs font-semibold ${
                        unit === 'kg'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      кг
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    {DAILY_RATE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setAmountInput(String(preset));
                          setFeedback(null);
                          setError(null);
                        }}
                        className={`h-9 rounded-lg border px-2 font-mono text-xs tabular-nums ${
                          parseFloat(amountInput) === preset
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                            : 'border-white/10 bg-[#0B0F17] text-slate-300 hover:border-white/25'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* От стара дата -> До дата + Бързи периоди */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-3">
              <label
                htmlFor="backfill-start-date"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                От стара дата
              </label>
              <input
                id="backfill-start-date"
                data-testid="backfill-start-date"
                type="date"
                max={todayKey}
                value={startDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setStartDate(e.target.value);
                    setFeedback(null);
                    setError(null);
                  }
                }}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0B0F17] px-2.5 font-mono text-xs tabular-nums text-white focus:border-[var(--accent)]"
              />
            </div>

            <div className="sm:col-span-3">
              <label
                htmlFor="backfill-end-date"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                До дата (днес)
              </label>
              <input
                id="backfill-end-date"
                data-testid="backfill-end-date"
                type="date"
                max={todayKey}
                value={endDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setEndDate(e.target.value);
                    setFeedback(null);
                    setError(null);
                  }
                }}
                className="h-9 w-full rounded-lg border border-white/15 bg-[#0B0F17] px-2.5 font-mono text-xs tabular-nums text-white focus:border-[var(--accent)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:col-span-6">
              {[
                { label: '7 дни', days: 6 },
                { label: '14 дни', days: 13 },
                { label: '1 месец', days: 29 },
                { label: '3 месеца', days: 89 },
              ].map((span) => (
                <button
                  key={span.label}
                  type="button"
                  onClick={() => applyQuickSpan(span.days)}
                  className="h-9 rounded-lg border border-white/12 bg-[#0B0F17] px-2.5 text-xs font-medium text-slate-300 hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap"
                >
                  {span.label}
                </button>
              ))}
            </div>
          </div>

          {/* Разпределение по мускулни групи */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Layers className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                <span>Разпредели към мускулни групи</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedMuscles(
                      allSelected ? [] : MUSCLE_GROUPS.map((m) => m.id),
                    )
                  }
                  className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  {allSelected ? 'Само общо (без групи)' : 'Избери всички 7 групи'}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLE_GROUPS.map((m) => {
                const active = selectedMuscles.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMuscle(m.id)}
                    aria-pressed={active}
                    className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-white/12 bg-[#0B0F17] text-slate-400 hover:border-white/25 hover:text-slate-200'
                    }`}
                  >
                    {active && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300 hover:text-white">
            <input
              type="checkbox"
              data-testid="backfill-overwrite-checkbox"
              checked={overwriteExisting}
              onChange={(e) => {
                setOverwriteExisting(e.target.checked);
                setFeedback(null);
              }}
              className="h-3.5 w-3.5 rounded border-white/25 bg-[#0B0F17] accent-[var(--accent)]"
            />
            <span>Презапиши и вече въведените дни в периода (иначе се попълват само празните дни)</span>
          </label>
        </div>

        {/* Жив преглед + Потвърждение */}
        <div className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0B0F17] p-4 lg:col-span-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Автоматичен разчет
            </div>
            <div className="mt-3 space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <span className="text-slate-400">Дни за попълване:</span>
                <span
                  data-testid="backfill-preview-days"
                  className="font-mono text-sm font-bold tabular-nums text-white"
                >
                  {preview.targetDates.length}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/8 pb-2">
                <span className="text-slate-400">Средно на ден:</span>
                <span
                  data-testid="backfill-preview-daily"
                  className="font-mono text-sm font-semibold tabular-nums text-[var(--accent-text)]"
                >
                  +{formatGrams(preview.avgPerDayGrams)} г/ден
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Общо ще се добави:</span>
                <div className="text-right">
                  <div
                    data-testid="backfill-preview-total"
                    className="font-mono text-base font-bold tabular-nums text-white"
                  >
                    +{formatGrams(preview.totalAddedGrams)} г
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-slate-400">
                    ({(preview.totalAddedGrams / 1000).toFixed(3)} кг)
                  </div>
                </div>
              </div>
              {allocationConfig?.mode === 'custom_percent' && preview.avgPerDayGrams > 0 && (
                <div className="border-t border-white/8 pt-2 text-[11px] text-slate-400">
                  <span className="text-slate-300 font-medium">Твои % на ден:</span>{' '}
                  {(() => {
                    const sample = calculateDayGainsBreakdown(
                      {
                        date: todayKey,
                        sleepHours: 8,
                        muscleGainMode: 'manual',
                        manualGainGrams: preview.avgPerDayGrams,
                        muscles: selectedMuscles,
                      },
                      defaultDailyBaseGainGrams,
                      false,
                      allocationConfig,
                    );
                    const parts = MUSCLE_GROUPS.filter((m) => (sample.byMuscle[m.id] ?? 0) > 0).map(
                      (m) => `${m.label} ${formatGrams(sample.byMuscle[m.id] ?? 0)}г`,
                    );
                    return parts.length > 0 ? parts.join(' · ') : 'Само общо';
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <button
              type="submit"
              data-testid="backfill-apply-btn"
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)]"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Попълни автоматично до днес</span>
            </button>

            {error && (
              <p role="alert" className="mt-2.5 text-xs text-rose-400">
                {error}
              </p>
            )}
            {feedback && (
              <p
                role="status"
                data-testid="backfill-feedback"
                className="mt-2.5 text-xs font-medium text-emerald-400"
              >
                {feedback}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
