import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CloudOff, Eye, RefreshCw, Search, X } from 'lucide-react';
import {
  type ExerciseLibraryEquipmentFilter,
  type ExerciseLibraryMuscleFilter,
  type FreeExerciseDbItem,
  LIBRARY_EQUIPMENT_OPTIONS,
  LIBRARY_MUSCLE_OPTIONS,
  buildFreeExerciseImageUrl,
  filterExerciseCatalog,
  getExerciseEnvironmentBadge,
  loadFreeExerciseDb,
  translateExerciseEquipmentBg,
  translateExerciseLevelBg,
  translateExerciseMuscleBg,
} from '../utils/freeExerciseDb';

interface ExerciseLibraryPanelProps {
  onSelectExercise: (item: FreeExerciseDbItem) => void;
}

const PAGE_SIZE = 24;

export function ExerciseLibraryPanel({
  onSelectExercise,
}: ExerciseLibraryPanelProps) {
  const [catalog, setCatalog] = useState<FreeExerciseDbItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [offline, setOffline] = useState<boolean>(false);
  const [fromCache, setFromCache] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [muscleFilter, setMuscleFilter] =
    useState<ExerciseLibraryMuscleFilter>('all');
  const [equipmentFilter, setEquipmentFilter] =
    useState<ExerciseLibraryEquipmentFilter>('all');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setOffline(false);

    void loadFreeExerciseDb().then((res) => {
      if (!active) return;
      setCatalog(res.exercises);
      setFromCache(res.fromCache);
      setOffline(res.offline);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, muscleFilter, equipmentFilter]);

  const filtered = useMemo(
    () =>
      filterExerciseCatalog({
        catalog,
        searchQuery,
        muscleFilter,
        equipmentFilter,
      }),
    [catalog, searchQuery, muscleFilter, equipmentFilter],
  );

  const visibleItems = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  async function handleReload() {
    setLoading(true);
    setOffline(false);
    const res = await loadFreeExerciseDb({ forceRefresh: true });
    setCatalog(res.exercises);
    setFromCache(res.fromCache);
    setOffline(res.offline);
    setLoading(false);
  }

  const hasFilters =
    searchQuery.trim() !== '' ||
    muscleFilter !== 'all' ||
    equipmentFilter !== 'all';

  return (
    <div
      data-testid="exercise-library-panel"
      className="mt-6 space-y-5"
    >
      {/* Заглавие и статус на кеша */}
      <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
              <BookOpen className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
              <span>Free Exercise DB · 30-дневен локален кеш</span>
              {catalog.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {catalog.length} упражнения{fromCache ? ' (кеширани)' : ''}
                  </span>
                </>
              )}
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-white">
              Библиотека с упражнения, снимки и техника
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Филтрирай по мускулна група и оборудване, за да откриеш нови упражнения за зала, лостове или вкъщи.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleReload()}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Обнови каталога</span>
          </button>
        </div>

        {/* Търсачка и филтри */}
        <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
                aria-hidden="true"
              />
              <label htmlFor="library-search-input" className="sr-only">
                Търси упражнение в библиотеката
              </label>
              <input
                id="library-search-input"
                data-testid="library-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Търси на английски или български (напр. Pullup, Bench, Лежанка, Клек)…"
                className="h-9 w-full rounded-lg border border-white/15 bg-[#141B27] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
              />
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setMuscleFilter('all');
                  setEquipmentFilter('all');
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-300 hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Изчисти</span>
              </button>
            )}

            <span className="font-mono text-xs tabular-nums text-slate-400 sm:ml-auto">
              Показани: {filtered.length}
            </span>
          </div>

          {/* Филтър по мускулна група */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">Мускул:</span>
            {LIBRARY_MUSCLE_OPTIONS.map((opt) => {
              const active = muscleFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`library-muscle-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setMuscleFilter(opt.id)}
                  className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                      : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Филтър по оборудване */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 mr-1">Оборудване:</span>
            {LIBRARY_EQUIPMENT_OPTIONS.map((opt) => {
              const active = equipmentFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`library-equipment-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => setEquipmentFilter(opt.id)}
                  className={`h-8 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                      : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Състояния: Зареждане / Офлайн / Резултати */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 animate-pulse rounded-xl border border-white/8 bg-[#0F141F]"
            />
          ))}
        </div>
      ) : offline && catalog.length === 0 ? (
        <div
          data-testid="library-offline-state"
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center"
        >
          <CloudOff className="mx-auto h-7 w-7 text-slate-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-200">
            Офлайн режим (няма връзка за зареждане на библиотеката)
          </p>
          <p className="mt-1 text-xs text-slate-400">
            При първото зареждане с интернет целият каталог се кешира локално за 30 дни.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center text-sm text-slate-400">
          Няма намерени упражнения с избраните филтри.
        </div>
      ) : (
        <>
          <div
            data-testid="library-results-grid"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {visibleItems.map((item) => {
              const firstImg = item.images[0];
              const showThumb = Boolean(firstImg && !brokenThumbs[firstImg]);
              return (
                <article
                  key={item.id}
                  className="flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-[#0F141F] transition-colors hover:border-white/25"
                >
                  <div>
                    {showThumb && firstImg && (
                      <div className="aspect-[16/10] w-full overflow-hidden border-b border-white/8 bg-[#0A0E17]">
                        <img
                          src={buildFreeExerciseImageUrl(firstImg)}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={() =>
                            setBrokenThumbs((prev) => ({
                              ...prev,
                              [firstImg]: true,
                            }))
                          }
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400">
                        <span>{getExerciseEnvironmentBadge(item)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{translateExerciseEquipmentBg(item.equipment)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{translateExerciseLevelBg(item.level)}</span>
                      </div>

                      <h3 className="mt-1.5 font-display text-sm font-bold text-white">
                        {item.name}
                      </h3>

                      {item.primaryMuscles.length > 0 && (
                        <p className="mt-1.5 text-xs text-slate-300">
                          <span className="text-emerald-400 font-medium">
                            Основни:{' '}
                          </span>
                          {item.primaryMuscles
                            .map(translateExerciseMuscleBg)
                            .join(', ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-white/8 px-4 py-2.5">
                    <button
                      type="button"
                      data-testid={`library-open-technique-${item.id}`}
                      onClick={() => onSelectExercise(item)}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                      <span>Техника и снимки</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleCount < filtered.length && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-5 text-xs font-semibold text-slate-200 transition-colors hover:border-white/30 hover:text-white cursor-pointer"
              >
                Покажи още ({filtered.length - visibleCount} оставащи)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
