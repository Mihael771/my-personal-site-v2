import { useEffect, useMemo, useState } from 'react';
import { Check, Scale, Trash2 } from 'lucide-react';
import type { BodyMeasurements, DayLog } from '../types/fitness';
import {
  formatBgDate,
  formatNumberBg,
  getLatestBodyMeasurement,
  hasAnyBodyMeasurement,
  isValidDateKey,
  sanitizeMeasurementValue,
} from '../utils/fitnessMath';

interface DailyMeasurementsPanelProps {
  logs: Record<string, DayLog>;
  todayKey: string;
  profileWeightKg: number | '';
  onSaveMeasurements: (dateKey: string, measurements: BodyMeasurements) => void;
}

interface DraftFields {
  weightKg: string;
  muscleMassKg: string;
  bodyFatPercent: string;
  bodyFatKg: string;
}

function toDraft(log?: DayLog): DraftFields {
  return {
    weightKg: log?.weightKg !== undefined ? String(log.weightKg) : '',
    muscleMassKg: log?.muscleMassKg !== undefined ? String(log.muscleMassKg) : '',
    bodyFatPercent: log?.bodyFatPercent !== undefined ? String(log.bodyFatPercent) : '',
    bodyFatKg: log?.bodyFatKg !== undefined ? String(log.bodyFatKg) : '',
  };
}

export function DailyMeasurementsPanel({
  logs,
  todayKey,
  profileWeightKg,
  onSaveMeasurements,
}: DailyMeasurementsPanelProps) {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [draft, setDraft] = useState<DraftFields>(() => toDraft(logs[todayKey]));
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(toDraft(logs[selectedDate]));
  }, [selectedDate, logs]);

  useEffect(() => {
    setSavedMsg(null);
  }, [selectedDate]);

  const latestWeight = useMemo(
    () => getLatestBodyMeasurement(logs, 'weightKg', todayKey),
    [logs, todayKey],
  );
  const latestMuscle = useMemo(
    () => getLatestBodyMeasurement(logs, 'muscleMassKg', todayKey),
    [logs, todayKey],
  );
  const latestFatPct = useMemo(
    () => getLatestBodyMeasurement(logs, 'bodyFatPercent', todayKey),
    [logs, todayKey],
  );
  const latestFatKg = useMemo(
    () => getLatestBodyMeasurement(logs, 'bodyFatKg', todayKey),
    [logs, todayKey],
  );

  const recentEntries = useMemo(() => {
    return Object.keys(logs)
      .filter((d) => isValidDateKey(d) && hasAnyBodyMeasurement(logs[d]))
      .sort()
      .reverse()
      .slice(0, 6)
      .map((d) => logs[d]);
  }, [logs]);

  function handleFieldChange(field: keyof DraftFields, value: string) {
    setSavedMsg(null);
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cleaned: BodyMeasurements = {
      weightKg: sanitizeMeasurementValue(draft.weightKg, 20, 400),
      muscleMassKg: sanitizeMeasurementValue(draft.muscleMassKg, 5, 250),
      bodyFatPercent: sanitizeMeasurementValue(draft.bodyFatPercent, 2, 80),
      bodyFatKg: sanitizeMeasurementValue(draft.bodyFatKg, 0.5, 250),
    };
    onSaveMeasurements(selectedDate, cleaned);
    setDraft(toDraft({ date: selectedDate, sleepHours: 8, muscles: [], ...cleaned }));
    setSavedMsg(
      hasAnyBodyMeasurement(cleaned)
        ? `Измерванията за ${formatBgDate(selectedDate)} са записани.`
        : `Измерванията за ${formatBgDate(selectedDate)} са изчистени.`,
    );
  }

  function handleClearDate() {
    onSaveMeasurements(selectedDate, {});
    setDraft({ weightKg: '', muscleMassKg: '', bodyFatPercent: '', bodyFatKg: '' });
    setSavedMsg(`Измерванията за ${formatBgDate(selectedDate)} са премахнати.`);
  }

  const parsedWeight = sanitizeMeasurementValue(draft.weightKg, 20, 400);
  const parsedFatPct = sanitizeMeasurementValue(draft.bodyFatPercent, 2, 80);
  const parsedFatKg = sanitizeMeasurementValue(draft.bodyFatKg, 0.5, 250);

  let derivedHint: string | null = null;
  if (parsedWeight !== undefined && parsedFatPct !== undefined && parsedFatKg === undefined) {
    const estFatKg = Math.round(((parsedWeight * parsedFatPct) / 100) * 10) / 10;
    derivedHint = `Ориентир при ${formatNumberBg(parsedWeight)} кг и ${formatNumberBg(parsedFatPct)}% мазнини: ≈ ${formatNumberBg(estFatKg)} кг подкожни мазнини.`;
  } else if (parsedWeight !== undefined && parsedFatKg !== undefined && parsedFatPct === undefined) {
    const estFatPct = Math.round(((parsedFatKg / parsedWeight) * 100) * 10) / 10;
    derivedHint = `Ориентир при ${formatNumberBg(parsedFatKg)} кг мазнини от ${formatNumberBg(parsedWeight)} кг: ≈ ${formatNumberBg(estFatPct)}% подкожни мазнини.`;
  }

  const fallbackWeightPlaceholder =
    latestWeight?.value ?? (typeof profileWeightKg === 'number' ? profileWeightKg : 79);

  return (
    <section
      id="measurements"
      aria-label="Дневни телесни измервания"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Дневни телесни измервания
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Записвай всеки ден килограмите и състава на тялото си. Всички полета са по избор — попълни само това, което знаеш.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 shrink-0">
          <div>
            <div className="text-xs text-slate-400">Последно тегло</div>
            <div
              data-testid="latest-weight-metric"
              className="font-mono text-base font-bold tabular-nums text-white"
            >
              {latestWeight
                ? `${formatNumberBg(latestWeight.value)} кг`
                : typeof profileWeightKg === 'number'
                  ? `${formatNumberBg(profileWeightKg)} кг`
                  : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Мускулна маса</div>
            <div className="font-mono text-base font-bold tabular-nums text-[var(--accent-text)]">
              {latestMuscle ? `${formatNumberBg(latestMuscle.value)} кг` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Подкожни мазнини</div>
            <div className="font-mono text-base font-bold tabular-nums text-white">
              {latestFatPct
                ? `${formatNumberBg(latestFatPct.value)}%`
                : latestFatKg
                  ? `${formatNumberBg(latestFatKg.value)} кг`
                  : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-white">
                {selectedDate === todayKey
                  ? `Днес (${formatBgDate(selectedDate)})`
                  : `Запис за ${formatBgDate(selectedDate)}`}
              </h3>
            </div>

            <div className="flex items-center gap-2">
              {selectedDate !== todayKey && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayKey)}
                  className="text-xs font-medium text-[var(--accent-text)] hover:underline whitespace-nowrap shrink-0"
                >
                  Към днес
                </button>
              )}
              <label htmlFor="measurements-date-input" className="sr-only">
                Дата за измервания
              </label>
              <input
                id="measurements-date-input"
                type="date"
                max={todayKey}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(e.target.value);
                }}
                className="h-9 rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="daily-weight-input"
                className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300"
              >
                <span>Тегло (кг)</span>
                <span className="text-slate-500">по избор</span>
              </label>
              <input
                id="daily-weight-input"
                data-testid="daily-weight-input"
                type="number"
                min={20}
                max={400}
                step="0.1"
                value={draft.weightKg}
                onChange={(e) => handleFieldChange('weightKg', e.target.value)}
                placeholder={`напр. ${fallbackWeightPlaceholder}`}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="daily-muscle-kg-input"
                className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300"
              >
                <span>Мускулна маса (кг)</span>
                <span className="text-slate-500">по избор</span>
              </label>
              <input
                id="daily-muscle-kg-input"
                data-testid="daily-muscle-kg-input"
                type="number"
                min={5}
                max={250}
                step="0.1"
                value={draft.muscleMassKg}
                onChange={(e) => handleFieldChange('muscleMassKg', e.target.value)}
                placeholder="напр. 35.5"
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="daily-fat-pct-input"
                className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300"
              >
                <span>Подкожни мазнини (%)</span>
                <span className="text-slate-500">по избор</span>
              </label>
              <input
                id="daily-fat-pct-input"
                data-testid="daily-fat-pct-input"
                type="number"
                min={2}
                max={80}
                step="0.1"
                value={draft.bodyFatPercent}
                onChange={(e) => handleFieldChange('bodyFatPercent', e.target.value)}
                placeholder="напр. 17.2"
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="daily-fat-kg-input"
                className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300"
              >
                <span>Подкожни мазнини (кг)</span>
                <span className="text-slate-500">по избор</span>
              </label>
              <input
                id="daily-fat-kg-input"
                data-testid="daily-fat-kg-input"
                type="number"
                min={0.5}
                max={250}
                step="0.1"
                value={draft.bodyFatKg}
                onChange={(e) => handleFieldChange('bodyFatKg', e.target.value)}
                placeholder="напр. 13.6"
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
              />
            </div>
          </div>

          {derivedHint && (
            <p className="mt-3 text-xs text-slate-400">{derivedHint}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              data-testid="measurements-save-btn"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-sm font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] whitespace-nowrap shrink-0"
            >
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Запази измерванията</span>
            </button>

            {hasAnyBodyMeasurement(logs[selectedDate]) && (
              <button
                type="button"
                onClick={handleClearDate}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/12 bg-[#151C29] px-3.5 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300 whitespace-nowrap shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Изчисти деня</span>
              </button>
            )}
          </div>

          {savedMsg && (
            <p
              role="status"
              data-testid="measurements-save-feedback"
              className="mt-3 text-xs font-medium text-emerald-400"
            >
              {savedMsg}
            </p>
          )}
        </form>

        {/* Последни записи */}
        <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-6">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <h3 className="font-display text-base font-bold text-white">
              Последни телесни измервания
            </h3>
            <span className="text-xs text-slate-400">
              Кликни ред за редакция
            </span>
          </div>

          {recentEntries.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              Все още нямаш записани телесни измервания. Можеш да добавиш само теглото си за днес или допълнителни данни от кантара.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 pr-3 font-medium">Дата</th>
                    <th className="py-2 px-2 text-right font-medium">Тегло</th>
                    <th className="py-2 px-2 text-right font-medium">Мускули</th>
                    <th className="py-2 px-2 text-right font-medium">Мазнини %</th>
                    <th className="py-2 pl-2 text-right font-medium">Мазнини кг</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/6">
                  {recentEntries.map((entry) => {
                    const isSelected = entry.date === selectedDate;
                    return (
                      <tr
                        key={entry.date}
                        onClick={() => setSelectedDate(entry.date)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[var(--accent-soft)] text-white'
                            : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                          {formatBgDate(entry.date)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {entry.weightKg !== undefined
                            ? `${formatNumberBg(entry.weightKg)} кг`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[var(--accent-text)]">
                          {entry.muscleMassKg !== undefined
                            ? `${formatNumberBg(entry.muscleMassKg)} кг`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {entry.bodyFatPercent !== undefined
                            ? `${formatNumberBg(entry.bodyFatPercent)}%`
                            : '—'}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-mono tabular-nums">
                          {entry.bodyFatKg !== undefined
                            ? `${formatNumberBg(entry.bodyFatKg)} кг`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
