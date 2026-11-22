import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  History,
  RefreshCw,
} from 'lucide-react';
import type { CloudSyncStatus } from '../services/storageService';
import type { ThemeAccent } from '../types/fitness';
import { THEME_ACCENTS } from '../utils/fitnessMath';
import {
  MAIN_MENU_ITEMS,
  MORE_MENU_ITEMS,
  getBreadcrumbsForLocation,
  getLocationHash,
  getLocationKey,
  getLocationLabel,
  normalizeLocation,
  type NavLocation,
} from '../utils/navigation';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderBarProps {
  activeLocation: NavLocation;
  previousLocation: NavLocation | null;
  onNavigateLocation: (location: NavLocation) => void;
  themeAccent: ThemeAccent;
  onThemeChange: (accent: ThemeAccent) => void;
  cloudSyncStatus?: CloudSyncStatus;
  onOpenCloudSync?: () => void;
}

const MORE_GROUP_LABELS: Record<'training' | 'tools' | 'data', string> = {
  training: 'Тренировки и стандарти',
  tools: 'Допълнителни инструменти',
  data: 'Тяло, календар и данни',
};

export function HeaderBar({
  activeLocation,
  previousLocation,
  onNavigateLocation,
  themeAccent,
  onThemeChange,
  cloudSyncStatus = 'unconfigured',
  onOpenCloudSync,
}: HeaderBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const normalizedActive = normalizeLocation(activeLocation);
  const activeKey = getLocationKey(normalizedActive);
  const breadcrumbs = getBreadcrumbsForLocation(normalizedActive);

  const isMoreActive = MORE_MENU_ITEMS.some(
    (item) => getLocationKey(item.location) === activeKey,
  );

  const canShowPrevious =
    previousLocation !== null &&
    getLocationKey(previousLocation) !== activeKey;

  useEffect(() => {
    if (!moreOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMoreOpen(false);
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  function isMainItemActive(id: 'home' | 'coach' | 'analysis'): boolean {
    if (id === 'home') return normalizedActive.page === 'checkin';
    if (id === 'coach') return normalizedActive.page === 'coach';
    return normalizedActive.page === 'analysis' && !isMoreActive;
  }

  const syncBtnLabel =
    cloudSyncStatus === 'synced'
      ? '☁️ Синхронизирано'
      : cloudSyncStatus === 'syncing'
        ? 'Синхронизиране…'
        : cloudSyncStatus === 'offline'
          ? 'Офлайн'
          : cloudSyncStatus === 'error'
            ? 'Грешка облак'
            : '☁️ Синхронизация';

  const syncBtnStyle =
    cloudSyncStatus === 'synced'
      ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200 hover:border-emerald-400 hover:text-white'
      : cloudSyncStatus === 'error'
        ? 'border-rose-500/40 bg-rose-950/30 text-rose-200 hover:border-rose-400 hover:text-white'
        : cloudSyncStatus === 'offline'
          ? 'border-amber-500/40 bg-amber-950/30 text-amber-200 hover:border-amber-400 hover:text-white'
          : 'border-white/15 bg-[#131924] text-slate-200 hover:border-[var(--accent)] hover:text-white';

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0B0F17]/95 backdrop-blur-sm">
      {/* Постоянна горна навигационна лента */}
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2.5 px-3 py-2 sm:px-6 sm:py-2.5">
        {/* Ляво: Лого + 3 Главни менюта + Още ▾ */}
        <div className="flex w-full flex-wrap items-center justify-between gap-2 md:w-auto md:justify-start sm:gap-3">
          <div className="flex items-center justify-between gap-2 w-full md:w-auto">
            <a
              href="#/checkin"
              onClick={(e) => {
                e.preventDefault();
                onNavigateLocation({ page: 'checkin' });
              }}
              className="inline-flex min-h-[44px] items-center font-display text-base font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 mr-1 md:min-h-0 sm:text-lg"
            >
              ФизиоПрогрес
            </a>

            {/* Мобилни бързи бутони горе вдясно (Синхронизация + PWA инстал) */}
            <div className="flex items-center gap-1.5 md:hidden">
              <PWAInstallButton />
              {onOpenCloudSync && (
                <button
                  type="button"
                  data-testid="nav-cloud-sync-btn-mobile"
                  onClick={onOpenCloudSync}
                  aria-label="Синхронизация и бекъп"
                  className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${syncBtnStyle}`}
                >
                  {cloudSyncStatus === 'syncing' ? (
                    <RefreshCw
                      className="h-3.5 w-3.5 animate-spin shrink-0"
                      aria-hidden="true"
                    />
                  ) : cloudSyncStatus === 'offline' ? (
                    <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>
                    {cloudSyncStatus === 'synced'
                      ? 'Синхр.'
                      : cloudSyncStatus === 'offline'
                        ? 'Офлайн'
                        : 'Облак'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <nav
            aria-label="Основна навигация"
            className="flex w-full items-center gap-1.5 overflow-x-auto pb-0.5 md:w-auto md:flex-wrap md:overflow-visible md:pb-0"
          >
            {MAIN_MENU_ITEMS.map((item) => {
              const active = isMainItemActive(item.id);
              return (
                <a
                  key={item.id}
                  href={getLocationHash(item.location)}
                  data-testid={`main-nav-${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setMoreOpen(false);
                    onNavigateLocation(item.location);
                  }}
                  className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 md:min-h-[36px] md:flex-none md:h-9 sm:text-[13px] ${
                    active
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  <span className="hidden md:inline">{item.shortLabel}</span>
                  <span className="md:hidden">
                    {item.id === 'home'
                      ? 'Начало'
                      : item.id === 'coach'
                        ? 'Треньор'
                        : 'Анализи'}
                  </span>
                </a>
              );
            })}

            {/* Компактно падащо меню „Още ▾“ */}
            <div ref={moreRef} className="relative shrink-0">
              <button
                type="button"
                data-testid="nav-more-button"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                onClick={() => setMoreOpen((prev) => !prev)}
                className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9 sm:text-[13px] ${
                  isMoreActive || moreOpen
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-white'
                    : 'border-white/12 bg-[#131924] text-slate-300 hover:border-white/25 hover:text-white'
                }`}
              >
                <span>Още</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    moreOpen ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  data-testid="nav-more-menu"
                  className="fixed left-3 right-3 top-[116px] z-50 rounded-xl border border-white/15 bg-[#0F141F] p-2 shadow-2xl md:absolute md:left-0 md:right-auto md:top-11 md:w-64"
                >
                  {(['training', 'tools', 'data'] as const).map((group, gIdx) => {
                    const groupItems = MORE_MENU_ITEMS.filter(
                      (i) => i.group === group,
                    );
                    return (
                      <div
                        key={group}
                        className={gIdx > 0 ? 'mt-2 border-t border-white/10 pt-2' : ''}
                      >
                        <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                          {MORE_GROUP_LABELS[group]}
                        </div>
                        <div className="space-y-0.5">
                          {groupItems.map((item) => {
                            const itemActive =
                              getLocationKey(item.location) === activeKey;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="menuitem"
                                data-testid={`more-nav-${item.id}`}
                                onClick={() => {
                                  setMoreOpen(false);
                                  onNavigateLocation(item.location);
                                }}
                                className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors md:min-h-[34px] ${
                                  itemActive
                                    ? 'bg-[var(--accent)]/20 text-white font-semibold'
                                    : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                                }`}
                              >
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>
        </div>

        {/* Дясно (Десктоп + таблет): Последно отворено + ☁️ Синхронизация + PWA + Тема */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {canShowPrevious && previousLocation && (
            <button
              type="button"
              data-testid="nav-previous-location-btn"
              onClick={() => onNavigateLocation(previousLocation)}
              title={`Върни се към ${getLocationLabel(previousLocation)}`}
              className="inline-flex h-9 max-w-[260px] items-center gap-1.5 rounded-lg border border-white/15 bg-[#131924] px-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent)] hover:text-white lg:max-w-[300px]"
            >
              <History
                className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0"
                aria-hidden="true"
              />
              <span className="truncate">
                ⏪ Последно отворено: {getLocationLabel(previousLocation)}
              </span>
            </button>
          )}

          <PWAInstallButton />

          {onOpenCloudSync && (
            <button
              type="button"
              data-testid="nav-cloud-sync-btn"
              onClick={onOpenCloudSync}
              title="Настройки за GitHub Gist синхронизация и JSON бекъп"
              className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${syncBtnStyle}`}
            >
              {cloudSyncStatus === 'syncing' ? (
                <RefreshCw
                  className="h-3.5 w-3.5 animate-spin shrink-0"
                  aria-hidden="true"
                />
              ) : cloudSyncStatus === 'offline' ? (
                <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : null}
              <span>{syncBtnLabel}</span>
            </button>
          )}

          <select
            id="theme-accent-select"
            aria-label="Цвят на темата"
            value={themeAccent}
            onChange={(e) => onThemeChange(e.target.value as ThemeAccent)}
            className="h-9 rounded-lg border border-white/15 bg-[#131924] px-2.5 text-xs font-medium text-slate-100 transition-colors hover:border-white/30"
          >
            {THEME_ACCENTS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Кликаема пътека (Breadcrumbs) */}
      <div className="border-t border-white/[0.06] bg-[#0D121C]">
        <nav
          aria-label="Пътека на навигацията"
          data-testid="breadcrumbs-bar"
          className="mx-auto flex max-w-[1320px] items-center justify-between gap-2 overflow-x-auto px-3 py-1.5 text-xs sm:px-6"
        >
          <div className="flex items-center gap-1.5 shrink-0">
            {breadcrumbs.map((crumb, idx) => (
              <div
                key={`${crumb.label}-${idx}`}
                className="flex items-center gap-1.5 shrink-0"
              >
                {idx > 0 && (
                  <ChevronRight
                    className="h-3.5 w-3.5 text-slate-600 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onNavigateLocation(crumb.location)}
                  aria-current={crumb.isCurrent ? 'page' : undefined}
                  className={`min-h-[32px] transition-colors whitespace-nowrap md:min-h-0 ${
                    crumb.isCurrent
                      ? 'font-semibold text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {crumb.label}
                </button>
              </div>
            ))}
          </div>

          {canShowPrevious && previousLocation && (
            <button
              type="button"
              onClick={() => onNavigateLocation(previousLocation)}
              className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-medium text-[var(--accent-text)] whitespace-nowrap shrink-0 md:hidden"
            >
              <History className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>Назад</span>
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
