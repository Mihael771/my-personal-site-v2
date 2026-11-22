import { useRef, useState } from 'react';
import { Download, RotateCcw, Sparkles, Upload } from 'lucide-react';
import type { DiaryState } from '../types/fitness';
import {
  exportDiaryPayload,
  getLocalDateKey,
  parseDiaryPayload,
} from '../utils/fitnessMath';

interface DataPortabilityBarProps {
  state: DiaryState;
  onImportState: (next: DiaryState) => void;
  onLoadSampleWeek: () => void;
  onResetAll: () => void;
}

export function DataPortabilityBar({
  state,
  onImportState,
  onLoadSampleWeek,
  onResetAll,
}: DataPortabilityBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  function handleExport() {
    const json = exportDiaryPayload(state);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `fizioprogres-${getLocalDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusMessage({
      type: 'success',
      text: 'Данните са изтеглени като файл. Можеш да го заредиш на всяко устройство.',
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseDiaryPayload(text);
      if (result.ok) {
        onImportState(result.state);
        setStatusMessage({
          type: 'success',
          text: `Данните от „${file.name}“ са заредени успешно!`,
        });
      } else {
        setStatusMessage({
          type: 'error',
          text: result.error,
        });
      }
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Грешка при четене на файла.',
      });
    } finally {
      e.target.value = '';
    }
  }

  return (
    <section
      id="backup"
      aria-label="Преносимост и запазване на данните"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-[#0F141F] p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h2 className="font-display text-xl font-bold text-white">
            Локална файлова база данни и прехвърляне
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Всички тренировки, сън от Huawei GT 6, цели и измервания се записват автоматично във файла database.json на проекта. При нужда можеш да изтеглиш или заредиш резервно копие в JSON формат.
          </p>
          {statusMessage && (
            <p
              role="status"
              data-testid="backup-status-msg"
              className={`mt-2.5 text-xs font-medium ${
                statusMessage.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {statusMessage.text}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            data-testid="export-data-btn"
            onClick={handleExport}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] whitespace-nowrap"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Изтегли данни</span>
          </button>

          <button
            type="button"
            data-testid="import-data-btn"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/15 bg-[#161E2E] px-4 text-sm font-semibold text-white transition-colors hover:border-white/30 whitespace-nowrap"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Зареди данни</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            aria-label="Избери JSON файл за зареждане на данни"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => {
              onLoadSampleWeek();
              setStatusMessage({
                type: 'success',
                text: 'Заредена е примерна история от 7 тренировъчни дни.',
              });
            }}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/12 bg-[#131926] px-3.5 text-xs font-medium text-slate-300 hover:border-white/25 hover:text-white whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Примерни данни</span>
          </button>

          {!confirmingReset ? (
            <button
              type="button"
              onClick={() => setConfirmingReset(true)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/12 bg-[#131926] px-3.5 text-xs font-medium text-slate-400 hover:border-rose-500/40 hover:text-rose-300 whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Изчисти</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onResetAll();
                  setConfirmingReset(false);
                  setStatusMessage({
                    type: 'success',
                    text: 'Дневникът е изчистен.',
                  });
                }}
                className="h-10 rounded-lg bg-rose-600 px-3.5 text-xs font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
              >
                Потвърди изчистване
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="h-10 rounded-lg border border-white/15 px-3 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
              >
                Отказ
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
