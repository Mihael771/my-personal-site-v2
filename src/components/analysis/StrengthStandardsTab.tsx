import { useEffect, useMemo, useState } from 'react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  StandardTier,
} from '../../types/fitness';
import {
  computeRunningStandards,
  computeStrengthStandards,
} from '../../utils/analysisPrep';
import { getLatestDailyWeight } from '../../utils/dailyLogs';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';

interface StrengthStandardsTabProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profileWeightKg: number | '';
  analysisManualWeightKg?: number;
  onSaveManualWeight: (weightKg: number | undefined) => Promise<void>;
}

const TIER_TEXT_CLASS: Record<StandardTier, string> = {
  beginner: 'text-slate-300',
  intermediate: 'text-sky-300',
  advanced: 'text-emerald-300',
  elite: 'text-amber-300',
};

const TIER_BAR_COLOR: Record<StandardTier, string> = {
  beginner: 'bg-slate-400',
  intermediate: 'bg-sky-400',
  advanced: 'bg-emerald-400',
  elite: 'bg-amber-400',
};

export function StrengthStandardsTab({
  hevyWorkouts,
  dailyLogs,
  profileWeightKg,
  analysisManualWeightKg,
  onSaveManualWeight,
}: StrengthStandardsTabProps) {
  const autoWeight = useMemo(
    () => getLatestDailyWeight(dailyLogs, profileWeightKg),
    [dailyLogs, profileWeightKg],
  );

  const initialWeight = autoWeight ?? analysisManualWeightKg ?? null;
  const [weightInput, setWeightInput] = useState<string>(() =>
    initialWeight !== null ? String(initialWeight) : '',
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (weightInput === '' && initialWeight !== null) {
      setWeightInput(String(initialWeight));
    }
  }, [initialWeight, weightInput]);

  const effectiveWeight = useMemo(() => {
    const parsed = Number(weightInput.trim().replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= 20 && parsed <= 400) {
      return Math.round(parsed * 10) / 10;
    }
    return autoWeight ?? analysisManualWeightKg ?? null;
  }, [weightInput, autoWeight, analysisManualWeightKg]);

  const strengthEntries = useMemo(
    () => computeStrengthStandards(hevyWorkouts, effectiveWeight),
    [hevyWorkouts, effectiveWeight],
  );

  const runningEntries = useMemo(
    () => computeRunningStandards(dailyLogs),
    [dailyLogs],
  );

  async function handleSaveWeight(e: React.FormEvent) {
    e.preventDefault();
    const parsed = Number(weightInput.trim().replace(',', '.'));
    const valid =
      Number.isFinite(parsed) && parsed >= 20 && parsed <= 400
        ? Math.round(parsed * 10) / 10
        : undefined;

    setSaving(true);
    setSaveMessage(null);
    try {
      await onSaveManualWeight(valid);
      setSaveMessage(
        valid !== undefined
          ? `Телесното тегло (${formatNumberBg(valid)} kg) е запазено.`
          : 'Ръчното тегло е изчистено.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="tab-strength-standards" className="space-y-6">
      {/* Панел за телесно тегло */}
      <form
        onSubmit={handleSaveWeight}
        className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <h2 className="font-display text-lg font-bold text-white">
            Нива на сила и хибридни стандарти
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Изчислява относителната сила (1RM / телесно тегло) за ключовите движения — при набирания и кофички автоматично събира телесното тегло + добавените килограми от Hevy.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2.5 shrink-0">
          <div>
            <label
              htmlFor="standards-bodyweight-input"
              className="mb-1 block text-[11px] font-medium text-slate-400"
            >
              Телесно тегло (kg) {autoWeight ? '· от Дневен чек-ин' : '· ръчно'}
            </label>
            <input
              id="standards-bodyweight-input"
              data-testid="standards-bodyweight-input"
              type="number"
              step="0.1"
              min={20}
              max={400}
              placeholder="напр. 80"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              className="h-9 w-36 rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="h-9 rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap"
          >
            {saving ? 'Запис…' : 'Запази тегло'}
          </button>
        </div>
      </form>

      {saveMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/35 bg-emerald-950/20 px-4 py-2.5 text-xs text-emerald-200"
        >
          {saveMessage}
        </div>
      )}

      {/* Секция Силови стандарти */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
          <h3 className="font-display text-base font-bold text-white">
            Силови стандарти (Относителна сила: 1RM / Тегло)
          </h3>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {effectiveWeight !== null
              ? `Референтно тегло: ${formatNumberBg(effectiveWeight)} kg`
              : 'Въведи тегло за изчисление'}
          </span>
        </div>

        {effectiveWeight === null ? (
          <p className="py-8 text-center text-sm text-slate-400">
            За да оценим относителната сила по 4-степенната скала (Начинаещ → Елит), въведи телесно тегло по-горе или в „Дневен чек-ин“.
          </p>
        ) : strengthEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Няма открити ключови силови упражнения (Squat/Клек, Bench Press/Лег, Deadlift/Тяга, Overhead Press, Pull Up/Набирания, Dips/Кофички, Barbell Row) в импортираните Hevy тренировки.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {strengthEntries.map((entry) => (
              <article
                key={entry.id}
                data-testid={`strength-standard-${entry.id}`}
                className="rounded-xl border border-white/10 bg-[#141B27] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-bold text-white">
                      {entry.label}
                    </h4>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {entry.matchedExerciseTitle} · {formatBgDate(entry.date)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-bold ${TIER_TEXT_CLASS[entry.tier]}`}
                    >
                      {entry.tierLabel}
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums text-white">
                      {entry.ratioToBodyWeight.toFixed(2)}× BW
                    </div>
                  </div>
                </div>

                {/* 4-степенна скала за прогрес */}
                <div className="mt-3">
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${TIER_BAR_COLOR[entry.tier]}`}
                      style={{ width: `${entry.progressPercent}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/4 w-px bg-[#080B11]/70" />
                    <div className="absolute inset-y-0 left-2/4 w-px bg-[#080B11]/70" />
                    <div className="absolute inset-y-0 left-3/4 w-px bg-[#080B11]/70" />
                  </div>
                  <div className="mt-1 grid grid-cols-4 text-[10px] text-slate-500">
                    <span>Начинаещ</span>
                    <span className="text-center">Среден</span>
                    <span className="text-center">Напреднал</span>
                    <span className="text-right">Елит</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-xs">
                  <span className="font-mono tabular-nums text-slate-300">
                    {entry.isBodyweightLift
                      ? `Товар: ${formatNumberBg(entry.bodyWeightKg)} + ${formatNumberBg(entry.bestAddedWeightKg)} kg × ${entry.bestReps} → 1RM: ${formatNumberBg(entry.estimated1RM)} kg`
                      : `Най-добро: ${formatNumberBg(entry.bestWeightKg)} kg × ${entry.bestReps} → 1RM: ${formatNumberBg(entry.estimated1RM)} kg`}
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--accent-text)]">
                    {entry.nextTierLabel && entry.kgRemainingToNext !== null
                      ? `Остават +${formatNumberBg(entry.kgRemainingToNext)} kg до „${entry.nextTierLabel}“`
                      : 'Постигнато ниво „Елит“!'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Секция Хибридни стандарти за бягане (5 km и 10 km) */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
          <h3 className="font-display text-base font-bold text-white">
            Хибридни стандарти за бягане (5 km и 10 km)
          </h3>
          <span className="text-xs text-slate-400">
            На база дистанция и времетраене от Дневния чек-ин
          </span>
        </div>

        {runningEntries.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Все още няма кардио записи с дистанция (km) и времетраене (минути) в „Дневен чек-ин“.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {runningEntries.map((run) => (
              <article
                key={run.distanceTargetKm}
                data-testid={`running-standard-${run.distanceTargetKm}k`}
                className="rounded-xl border border-white/10 bg-[#141B27] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-display text-sm font-bold text-white">
                      {run.label}
                    </h4>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      Най-добър опит: {formatNumberBg(run.bestDistanceKm)} km за{' '}
                      {run.bestDurationMin} мин ({formatBgDate(run.date)})
                      {run.isProjected ? ' · прогноза от темпо' : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-bold ${TIER_TEXT_CLASS[run.tier]}`}
                    >
                      {run.tierLabel}
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums text-white">
                      {run.estimatedTimeText} ({run.paceText})
                    </div>
                  </div>
                </div>

                {/* 4-степенна скала */}
                <div className="mt-3">
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all ${TIER_BAR_COLOR[run.tier]}`}
                      style={{ width: `${run.progressPercent}%` }}
                    />
                    <div className="absolute inset-y-0 left-1/4 w-px bg-[#080B11]/70" />
                    <div className="absolute inset-y-0 left-2/4 w-px bg-[#080B11]/70" />
                    <div className="absolute inset-y-0 left-3/4 w-px bg-[#080B11]/70" />
                  </div>
                  <div className="mt-1 grid grid-cols-4 text-[10px] text-slate-500">
                    <span>Начинаещ</span>
                    <span className="text-center">Среден</span>
                    <span className="text-center">Напреднал</span>
                    <span className="text-right">Елит</span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2.5 text-xs">
                  <span className="font-mono tabular-nums text-slate-300">
                    Темпо: {run.paceText}
                  </span>
                  <span className="font-mono font-semibold tabular-nums text-[var(--accent-text)]">
                    {run.nextTierLabel && run.secondsRemainingToNext !== null
                      ? `Остават -${run.secondsRemainingToNext} сек до „${run.nextTierLabel}“`
                      : 'Постигнато ниво „Елит“!'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
