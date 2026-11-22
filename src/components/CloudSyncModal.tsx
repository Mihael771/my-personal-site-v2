import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  X,
} from 'lucide-react';
import type { DiaryState } from '../types/fitness';
import {
  buildBackupFilename,
  validateBackupJsonFile,
  type BackupSummary,
} from '../utils/backupRestore';
import {
  clearGistConfig,
  connectAndSyncWithGist,
  detectStorageMode,
  exportDiaryStateToJsonText,
  loadGistConfig,
  loadGistSyncMeta,
  restoreValidatedPayloadHybrid,
  type CloudSyncStatus,
} from '../services/storageService';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  state: DiaryState;
  syncStatus: CloudSyncStatus;
  syncMessage: string | null;
  onSyncStatusChange: (status: CloudSyncStatus, message?: string) => void;
  onApplySyncedState: (nextState: DiaryState) => void;
}

interface PendingRestore {
  fileName: string;
  payload: Record<string, unknown>;
  summary: BackupSummary;
}

function formatSyncTimestamp(iso?: string): string | null {
  if (!iso) return null;
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const min = String(dt.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} в ${hh}:${min}`;
}

export function CloudSyncModal({
  open,
  onClose,
  state,
  syncStatus,
  syncMessage,
  onSyncStatusChange,
  onApplySyncedState,
}: CloudSyncModalProps) {
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const storageMode = detectStorageMode();

  const [token, setToken] = useState('');
  const [gistId, setGistId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [lastSyncedLabel, setLastSyncedLabel] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(
    null,
  );
  const [restoring, setRestoring] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const cfg = loadGistConfig();
    const meta = loadGistSyncMeta();
    setToken(cfg.token);
    setGistId(cfg.gistId);
    setLastSyncedLabel(formatSyncTimestamp(meta.lastSyncedAt));
    setLocalFeedback(null);
    setPendingRestore(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function handleConnectAndSync(forceDirection: 'auto' | 'pull' = 'auto') {
    if (!token.trim()) {
      setLocalFeedback({
        type: 'error',
        text: 'Въведи своя GitHub Token (ghp_… или github_pat_…) с право „gist“.',
      });
      return;
    }

    if (!isOnline) {
      setLocalFeedback({
        type: 'error',
        text: 'В момента нямаш интернет връзка. Данните ти са защитени локално и ще се синхронизират при връзка.',
      });
      return;
    }

    setBusy(true);
    setLocalFeedback(null);
    onSyncStatusChange('syncing');

    try {
      const result = await connectAndSyncWithGist({
        token,
        gistId,
        currentLocalState: state,
        forceDirection,
      });

      setGistId(result.gistId);
      setLastSyncedLabel(formatSyncTimestamp(new Date().toISOString()));

      if (result.action === 'pulled') {
        onApplySyncedState(result.state);
      }

      onSyncStatusChange('synced');
      setLocalFeedback({
        type: 'success',
        text: result.message,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Неуспешна синхронизация с GitHub Gist.';
      onSyncStatusChange('error', msg);
      setLocalFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyGistId() {
    const clean = gistId.trim();
    if (!clean) return;
    try {
      await navigator.clipboard.writeText(clean);
      setCopiedId(true);
      window.setTimeout(() => setCopiedId(false), 2000);
    } catch {
      setLocalFeedback({
        type: 'info',
        text: `Gist ID: ${clean}`,
      });
    }
  }

  function handleDisconnectCloud() {
    clearGistConfig();
    setToken('');
    setGistId('');
    setLastSyncedLabel(null);
    onSyncStatusChange('unconfigured');
    setLocalFeedback({
      type: 'info',
      text: 'Облачната синхронизация е изключена. Локалните данни на устройството остават запазени.',
    });
  }

  function handleDownloadJsonBackup() {
    try {
      const jsonText = exportDiaryStateToJsonText(state);
      const filename = buildBackupFilename();
      const blob = new Blob([jsonText], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setLocalFeedback({
        type: 'success',
        text: `Резервното копие е изтеглено като ${filename}.`,
      });
    } catch (err) {
      setLocalFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Неуспешно изтегляне на бекъп файла.',
      });
    }
  }

  async function handleRestoreFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setLocalFeedback(null);

    try {
      const rawText = await file.text();
      const validated = validateBackupJsonFile(rawText);
      if (!validated.ok) {
        setPendingRestore(null);
        setLocalFeedback({ type: 'error', text: validated.error });
        return;
      }
      setPendingRestore({
        fileName: file.name,
        payload: validated.payload,
        summary: validated.summary,
      });
    } catch {
      setLocalFeedback({
        type: 'error',
        text: 'Грешка при прочитането на избрания .json файл.',
      });
    }
  }

  async function handleConfirmRestore() {
    if (!pendingRestore) return;
    setRestoring(true);
    setLocalFeedback(null);
    try {
      const restored = await restoreValidatedPayloadHybrid(
        pendingRestore.payload,
        {
          onSyncStatusChange,
        },
      );
      onApplySyncedState(restored);
      setPendingRestore(null);
      setLastSyncedLabel(formatSyncTimestamp(loadGistSyncMeta().lastSyncedAt));
      setLocalFeedback({
        type: 'success',
        text: 'Базата данни е възстановена успешно и записана на устройството.',
      });
    } catch (err) {
      setLocalFeedback({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Неуспешно възстановяване на файла.',
      });
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-sync-modal-title"
      data-testid="cloud-sync-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/15 bg-[#0F141F] p-5 text-left shadow-2xl sm:max-w-lg sm:rounded-2xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            {isOnline ? (
              <Cloud
                className="h-5 w-5 text-[var(--accent-text)] shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CloudOff
                className="h-5 w-5 text-amber-400 shrink-0"
                aria-hidden="true"
              />
            )}
            <div>
              <h2
                id="cloud-sync-modal-title"
                className="font-display text-base font-bold text-white sm:text-lg"
              >
                ☁️ Синхронизация и Бекъп
              </h2>
              <p className="mt-0.5 text-xs text-slate-400">
                {storageMode === 'local-api'
                  ? 'Режим: Локален сървър (database.json) + LocalStorage'
                  : 'Режим: Самостоятелен (LocalStorage — работи офлайн)'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори панела за синхронизация"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-[#141B27] text-slate-300 transition-colors hover:border-white/25 hover:text-white sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Status summary bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#141B27] px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck
              className={`h-4 w-4 shrink-0 ${
                syncStatus === 'synced'
                  ? 'text-emerald-400'
                  : syncStatus === 'error'
                    ? 'text-rose-400'
                    : syncStatus === 'offline'
                      ? 'text-amber-400'
                      : 'text-slate-400'
              }`}
              aria-hidden="true"
            />
            <span className="font-medium text-slate-200">
              {!isOnline
                ? 'Офлайн — записите се пазят локално'
                : syncStatus === 'synced'
                  ? '☁️ Синхронизирано с частен GitHub Gist'
                  : syncStatus === 'syncing'
                    ? 'Синхронизиране с GitHub Gist…'
                    : syncStatus === 'error'
                      ? 'Грешка при последната синхронизация'
                      : 'Локално съхранение (облакът не е свързан)'}
            </span>
          </div>
          {lastSyncedLabel && (
            <span className="font-mono text-[11px] tabular-nums text-slate-400">
              Последно: {lastSyncedLabel}
            </span>
          )}
        </div>

        {/* GitHub Gist Form */}
        <div className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="gist-token-input"
              className="mb-1.5 block text-xs font-semibold text-slate-200"
            >
              GitHub Token (Personal Access Token · право „gist“)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="gist-token-input"
                data-testid="gist-token-input"
                type={showToken ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="ghp_… или github_pat_…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0B101A] px-3 font-mono text-base text-white placeholder:text-slate-500 focus:border-[var(--accent)] sm:min-h-[40px] sm:text-xs"
              />
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                aria-label={showToken ? 'Скрий токена' : 'Покажи токена'}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/15 bg-[#141B27] text-slate-300 transition-colors hover:border-white/30 hover:text-white sm:min-h-[40px] sm:min-w-[40px]"
              >
                {showToken ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Пази се само локално в <span className="font-mono">localStorage</span> на това устройство. Създай токен в GitHub → Settings → Developer settings → Personal access tokens (scope: <span className="font-mono text-slate-300">gist</span>).
            </p>
          </div>

          <div>
            <label
              htmlFor="gist-id-input"
              className="mb-1.5 block text-xs font-semibold text-slate-200"
            >
              Gist ID (остави празно за автоматично създаване на частен Gist)
            </label>
            <div className="flex items-center gap-2">
              <input
                id="gist-id-input"
                data-testid="gist-id-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Празно = нов частен fitness_database.json"
                value={gistId}
                onChange={(e) => setGistId(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#0B101A] px-3 font-mono text-base text-white placeholder:text-slate-500 focus:border-[var(--accent)] sm:min-h-[40px] sm:text-xs"
              />
              <button
                type="button"
                data-testid="gist-copy-id-btn"
                disabled={!gistId.trim()}
                onClick={() => void handleCopyGistId()}
                title="Копирай Gist ID"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40 whitespace-nowrap sm:min-h-[40px]"
              >
                {copiedId ? (
                  <>
                    <Check
                      className="h-3.5 w-3.5 text-emerald-400"
                      aria-hidden="true"
                    />
                    <span>Копирано</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Копирай</span>
                  </>
                )}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              Защита на ново устройство: при въведено съществуващо Gist ID и празна локална база приложението първо изтегля данните от облака и никога не ги презаписва.
            </p>
          </div>

          {/* Primary Sync Buttons */}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              data-testid="gist-connect-sync-btn"
              disabled={busy || !isOnline}
              onClick={() => void handleConnectAndSync('auto')}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap sm:text-xs"
            >
              <Cloud className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {busy ? 'Синхронизиране…' : 'Свържи и синхронизирай'}
              </span>
            </button>

            {gistId.trim() && token.trim() && (
              <button
                type="button"
                data-testid="gist-pull-now-btn"
                disabled={busy || !isOnline}
                onClick={() => void handleConnectAndSync('pull')}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#141B27] px-3.5 text-xs font-semibold text-slate-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 shrink-0 ${busy ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>Издърпай от облака</span>
              </button>
            )}

            {(token.trim() || gistId.trim()) && (
              <button
                type="button"
                data-testid="gist-disconnect-btn"
                disabled={busy}
                onClick={handleDisconnectCloud}
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/12 bg-transparent px-3 text-xs font-medium text-slate-400 transition-colors hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50 whitespace-nowrap"
              >
                Изключи
              </button>
            )}
          </div>

          {(localFeedback || (syncStatus === 'error' && syncMessage)) && (
            <div
              role={
                localFeedback?.type === 'error' || syncStatus === 'error'
                  ? 'alert'
                  : 'status'
              }
              data-testid="gist-sync-feedback"
              className={`rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed ${
                localFeedback?.type === 'error' ||
                (!localFeedback && syncStatus === 'error')
                  ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                  : localFeedback?.type === 'info'
                    ? 'border-sky-500/35 bg-sky-950/20 text-sky-200'
                    : 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
              }`}
            >
              {localFeedback?.text ?? syncMessage}
            </div>
          )}
        </div>

        {/* Manual JSON Backup & Restore (Works 100% Offline & Mobile) */}
        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-white">
            Локален файл бекъп (.json)
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Работи изцяло офлайн на телефон и компютър — пълен експорт и възстановяване на цялата база.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              data-testid="sync-modal-download-backup-btn"
              onClick={handleDownloadJsonBackup}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#141B27] px-3.5 text-xs font-semibold text-white transition-colors hover:border-[var(--accent-border)] hover:bg-[#192334] whitespace-nowrap"
            >
              <Download className="h-4 w-4 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
              <span>⬇️ Изтегли бекъп (.json)</span>
            </button>

            <button
              type="button"
              data-testid="sync-modal-restore-backup-btn"
              disabled={restoring}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#141B27] px-3.5 text-xs font-semibold text-white transition-colors hover:border-[var(--accent-border)] hover:bg-[#192334] disabled:opacity-50 whitespace-nowrap"
            >
              <Upload className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <span>⬆️ Възстанови от файл (.json)</span>
            </button>

            <input
              ref={fileInputRef}
              data-testid="sync-modal-restore-file-input"
              type="file"
              accept=".json,application/json,*/*"
              onChange={(e) => void handleRestoreFileChange(e)}
              className="hidden"
            />
          </div>

          {pendingRestore && (
            <div
              data-testid="sync-modal-restore-confirm"
              className="mt-3 rounded-xl border border-amber-500/35 bg-amber-950/20 p-3.5"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white">
                    Потвърди възстановяване от „{pendingRestore.fileName}“
                  </div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-300">
                    Чек-ин дни: {pendingRestore.summary.checkinsCount} · Hevy тренировки:{' '}
                    {pendingRestore.summary.workoutsCount} · Дневник:{' '}
                    {pendingRestore.summary.daysCount}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={restoring}
                      onClick={() => void handleConfirmRestore()}
                      className="inline-flex min-h-[40px] items-center rounded-lg bg-amber-500 px-3.5 text-xs font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
                    >
                      {restoring ? 'Възстановяване…' : 'Потвърди и зареди'}
                    </button>
                    <button
                      type="button"
                      disabled={restoring}
                      onClick={() => setPendingRestore(null)}
                      className="inline-flex min-h-[40px] items-center rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-300 hover:text-white"
                    >
                      Отказ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PWA Mobile Home Screen Installation */}
        {!isInstalled && (isInstallable || isIOS) && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Smartphone
                className="h-4 w-4 text-[var(--accent-text)] shrink-0"
                aria-hidden="true"
              />
              <span>Инсталиране на началния екран (PWA)</span>
            </div>
            {isInstallable ? (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-slate-400">
                  Инсталирай ФизиоПрогрес като самостоятелно мобилно приложение (работи офлайн в залата).
                </p>
                <button
                  type="button"
                  onClick={() => void install()}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-slate-950 transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Инсталирай приложението</span>
                </button>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                За iPhone / iPad (Safari): натисни бутона <strong className="text-slate-200">Споделяне (Share)</strong> долу и избери <strong className="text-slate-200">„Добави на начален екран“ (Add to Home Screen)</strong>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
