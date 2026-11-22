import { useRef, useState } from 'react';
import { Check, Upload, Watch, X } from 'lucide-react';
import {
  formatBgDate,
  getSleepRecoveryInfo,
  parseHuaweiSleepImport,
  shiftDateKey,
  type HuaweiSleepImportEntry,
} from '../utils/fitnessMath';

interface HuaweiSleepSyncPanelProps {
  todayKey: string;
  onApplyEntries: (entries: HuaweiSleepImportEntry[]) => void;
  onClose: () => void;
}

export function HuaweiSleepSyncPanel({
  todayKey,
  onApplyEntries,
  onClose,
}: HuaweiSleepSyncPanelProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [appliedMsg, setAppliedMsg] = useState<string | null>(null);

  const previewResult = rawText.trim() ? parseHuaweiSleepImport(rawText) : null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRawText(text);
      setError(null);
      setAppliedMsg(null);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleFillTemplate() {
    const d2 = shiftDateKey(todayKey, -2);
    const d1 = shiftDateKey(todayKey, -1);
    setRawText(
      `Дата,Точки GT 6,Часове сън\n${d2}, 84, 7.6\n${d1}, 55, 5.4\n${todayKey}, 91, 8.2`,
    );
    setError(null);
    setAppliedMsg(null);
  }

  function handleApply() {
    const parsed = parseHuaweiSleepImport(rawText);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    onApplyEntries(parsed.entries);
    setError(null);
    setAppliedMsg(
      `Автоматично заредени ${parsed.entries.length} дни от Huawei GT 6! Възстановяването и мускулната маса са преизчислени.`,
    );
  }

  return (
    <div
      data-testid="huawei-sync-panel"
      className="mx-auto mt-3 max-w-[1280px] rounded-xl border border-[var(--accent-border)] bg-[#101623] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-start gap-2.5">
          <Watch className="mt-0.5 h-4 w-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              Автоматичен импорт от Huawei Health / Watch GT 6
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Качи експорт (.json / .csv) от Huawei Health или постави редове във формат „дата, точки за сън, часове“ — сайтът ще обнови всички дни автоматично.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Затвори панела за Huawei импорт"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#161E2E] text-slate-400 hover:text-white shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv,text/plain"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-[#161E2E] px-3 text-xs font-medium text-slate-200 hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Избери файл (.json / .csv)</span>
            </button>
            <button
              type="button"
              data-testid="huawei-sample-btn"
              onClick={handleFillTemplate}
              className="inline-flex h-8 items-center rounded-lg border border-white/12 bg-[#161E2E] px-3 text-xs font-medium text-[var(--accent-text)] hover:border-[var(--accent-border)] whitespace-nowrap shrink-0"
            >
              Постави примерен формат
            </button>
          </div>

          <label htmlFor="huawei-import-textarea" className="sr-only">
            Данни за сън от Huawei GT 6
          </label>
          <textarea
            id="huawei-import-textarea"
            data-testid="huawei-import-textarea"
            rows={4}
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setError(null);
              setAppliedMsg(null);
            }}
            placeholder={`2026-11-16, 86, 7.8\n2026-11-17, 91, 8.2\nили JSON експорт от Huawei Health...`}
            className="w-full rounded-lg border border-white/12 bg-[#0B0F17] p-3 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-[var(--accent)]"
          />

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="huawei-apply-btn"
              onClick={handleApply}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)] whitespace-nowrap shrink-0"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Приложи автоматично</span>
            </button>
            {error && (
              <span role="alert" className="text-xs text-rose-400">
                {error}
              </span>
            )}
            {appliedMsg && (
              <span
                role="status"
                data-testid="huawei-import-feedback"
                className="text-xs font-medium text-emerald-400"
              >
                {appliedMsg}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-[#0B0F17] p-3 lg:col-span-5">
          <div className="mb-2 text-xs font-medium text-slate-300">
            Преглед на разпознатите дни
          </div>
          {!previewResult ? (
            <p className="text-xs text-slate-500">
              Въведи или качи файл, за да видиш колко точки от Huawei GT 6 и какъв % възстановяване ще се приложат.
            </p>
          ) : !previewResult.ok ? (
            <p className="text-xs text-rose-400">{previewResult.error}</p>
          ) : (
            <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs">
              {previewResult.entries.map((item) => {
                const rec = getSleepRecoveryInfo(item.sleepHours ?? 8, {
                  huaweiSleepScore: item.huaweiSleepScore,
                  recoveryMode: 'auto',
                });
                return (
                  <div
                    key={item.date}
                    className="flex items-center justify-between border-b border-white/6 pb-1 font-mono tabular-nums"
                  >
                    <span className="font-sans text-slate-300">
                      {formatBgDate(item.date)}
                    </span>
                    <span className="text-slate-200">
                      {item.huaweiSleepScore !== undefined ? `${item.huaweiSleepScore} т.` : '—'}
                      {' · '}
                      <span className={rec.isFatigued ? 'text-rose-400' : 'text-[var(--accent-text)]'}>
                        {rec.percentage}%
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
