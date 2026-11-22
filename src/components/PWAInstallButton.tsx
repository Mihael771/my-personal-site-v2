import { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        data-testid="pwa-install-btn"
        onClick={() => void install()}
        title="Инсталирай приложението на началния екран"
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/35 px-3 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-900/45 hover:text-white whitespace-nowrap shrink-0 md:min-h-[36px]"
      >
        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Инсталирай</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          data-testid="pwa-ios-install-btn"
          onClick={() => setShowIOSGuide(true)}
          title="Инсталирай на iPhone / iPad"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#131924] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 md:min-h-[36px]"
        >
          <Smartphone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">На екран</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-guide-title"
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-xs sm:items-center sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowIOSGuide(false);
            }}
          >
            <div className="w-full rounded-t-2xl border border-white/15 bg-[#0F141F] p-5 shadow-2xl sm:max-w-sm sm:rounded-2xl">
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="ios-install-guide-title"
                  className="font-display text-base font-bold text-white"
                >
                  Инсталирай на iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Затвори инструкциите"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:text-white"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <ol className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                <li>
                  1. Натисни бутона <strong className="text-white">Споделяне (Share)</strong> в долната лента на Safari.
                </li>
                <li>
                  2. Превърти надолу и избери <strong className="text-white">„Добави на начален екран“</strong>.
                </li>
                <li>
                  3. Потвърди с <strong className="text-white">Добави</strong> — приложението ще се отваря на цял екран и ще работи офлайн.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 min-h-[44px] w-full rounded-xl bg-[var(--accent)] text-sm font-semibold text-[var(--accent-contrast)]"
              >
                Разбрах
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}

export function OfflineStatusBanner() {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      data-testid="offline-mode-banner"
      className="border-b border-amber-500/35 bg-amber-950/40 px-4 py-2 text-center text-xs text-amber-200"
    >
      <div className="mx-auto flex max-w-[1280px] items-center justify-center gap-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
        <span>
          Офлайн режим — всички записи се запазват мигновено на устройството и ще се синхронизират при интернет връзка.
        </span>
      </div>
    </div>
  );
}
