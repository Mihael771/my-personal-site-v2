import { useRef, useState } from 'react';
import { AlertTriangle, Download, Upload } from 'lucide-react';
import type { DiaryState } from '../types/fitness';
import {
  buildBackupFilename,
  fetchDatabaseBackupJson,
  validateBackupJsonFile,
  type BackupSummary,
} from '../utils/backupRestore';
import {
  exportDiaryStateToJsonText,
  isLocalServerHost,
  restoreValidatedPayloadHybrid,
} from '../services/storageService';

interface ManualBackupBarProps {
  state?: DiaryState;
  onAfterRestore: () => Promise<void> | void;
}

interface PendingRestoreState {
  fileName: string;
  payload: Record<string, unknown>;
  summary: BackupSummary;
}

export function ManualBackupBar({ state, onAfterRestore }: ManualBackupBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<PendingRestoreState | null>(null);
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  async function handleDownloadBackup() {
    setDownloading(true);
    setStatus(null);
    try {
      let jsonText: string;
      if (isLocalServerHost()) {
        try {
          const res = await fetchDatabaseBackupJson();
          jsonText = res.jsonText;
        } catch {
          if (!state) throw new Error('Неуспешно изтегляне на резервното копие.');
          jsonText = exportDiaryStateToJsonText(state);
        }
      } else if (state) {
        jsonText = exportDiaryStateToJsonText(state);
      } else {
        const res = await fetchDatabaseBackupJson();
        jsonText = res.jsonText;
      }

      const filename = buildBackupFilename();
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatus({
        type: 'success',
        text: `Резервното копие е изтеглено като ${filename}.`,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Неуспешно изтегляне на резервното копие.',
      });
    } finally {
      setDownloading(false);
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus(null);
    try {
      const rawText = await file.text();
      const validated = validateBackupJsonFile(rawText);
      if (!validated.ok) {
        setPendingRestore(null);
        setStatus({
          type: 'error',
          text: validated.error,
        });
        return;
      }

      setPendingRestore({
        fileName: file.name,
        payload: validated.payload,
        summary: validated.summary,
      });
    } catch {
      setPendingRestore(null);
      setStatus({
        type: 'error',
        text: 'Грешка при прочитането на избрания файл.',
      });
    } finally {
      e.target.value = '';
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return;
    setRestoring(true);
    setStatus(null);
    try {
      await restoreValidatedPayloadHybrid(pendingRestore.payload);
      setPendingRestore(null);
      await onAfterRestore();
      setRestoring(false);
      setStatus({
        type: 'success',
        text: 'Базата данни е възстановена успешно.',
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Неуспешно възстановяване на базата данни.',
      });
      setRestoring(false);
    }
  }

  return (
    <div
      data-testid="manual-backup-section"
      className="mx-auto mb-6 max-w-[1280px] px-4 sm:px-6"
    >
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0F141F] p-5 text-left sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <div className="font-display text-sm font-bold text-white">
            Ръчно архивиране и възстановяване
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Изтегли текущата база данни като JSON файл (работи и офлайн на телефон) или възстанови предишен архив с презаписване.
          </p>
          {status && (
            <p
              role={status.type === 'error' ? 'alert' : 'status'}
              data-testid="manual-backup-status"
              className={`mt-2 text-xs font-medium ${
                status.type === 'error' ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {status.text}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center shrink-0">
          <button
            type="button"
            data-testid="download-backup-json-btn"
            disabled={downloading || restoring}
            onClick={handleDownloadBackup}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap md:min-h-[40px]"
          >
            <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              {downloading ? 'Изтегляне…' : 'Изтегли резервно копие (.json)'}
            </span>
          </button>

          <button
            type="button"
            data-testid="restore-backup-json-btn"
            disabled={downloading || restoring}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#141B27] px-4 text-xs font-semibold text-white transition-colors hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap md:min-h-[40px]"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Възстанови от файл (.json)</span>
          </button>

          <input
            ref={fileInputRef}
            data-testid="restore-backup-file-input"
            type="file"
            accept=".json,application/json,*/*"
            onChange={handleFileSelected}
            aria-label="Избери резервно копие (.json)"
            className="hidden"
          />
        </div>
      </div>

      {/* Диалог за потвърждение преди презаписване на базата данни */}
      {pendingRestore && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-confirm-title"
          data-testid="restore-confirm-dialog"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0F141F] p-6 text-left shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <div>
                <h3
                  id="restore-confirm-title"
                  className="font-display text-base font-bold text-white"
                >
                  Потвърди възстановяването на данните
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300">
                  Файлът <span className="font-semibold text-white">„{pendingRestore.fileName}“</span> е валиден JSON архив. Това действие ще презапише текущата база данни и ще презареди интерфейса.
                </p>

                <div className="mt-3 rounded-lg border border-white/10 bg-[#141B27] px-3 py-2 font-mono text-[11px] tabular-nums text-slate-300">
                  Дни в дневника: {pendingRestore.summary.daysCount} · Hevy тренировки:{' '}
                  {pendingRestore.summary.workoutsCount} · Чек-ин записи:{' '}
                  {pendingRestore.summary.checkinsCount}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                data-testid="restore-cancel-btn"
                disabled={restoring}
                onClick={() => setPendingRestore(null)}
                className="h-9 rounded-lg border border-white/15 bg-[#141B27] px-4 text-xs font-medium text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                Отказ
              </button>
              <button
                type="button"
                data-testid="restore-confirm-btn"
                disabled={restoring}
                onClick={handleConfirmRestore}
                className="h-9 rounded-lg bg-amber-500 px-4 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                {restoring ? 'Възстановяване…' : 'Потвърди и презапиши'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
