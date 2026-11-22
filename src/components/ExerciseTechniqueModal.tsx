import { useEffect, useState } from 'react';
import { CloudOff, Dumbbell, RefreshCw, X } from 'lucide-react';
import {
  type FreeExerciseDbItem,
  buildFreeExerciseImageUrl,
  findBestExerciseMatches,
  getExerciseEnvironmentBadge,
  loadFreeExerciseDb,
  translateExerciseEquipmentBg,
  translateExerciseLevelBg,
  translateExerciseMuscleBg,
} from '../utils/freeExerciseDb';

interface ExerciseTechniqueModalProps {
  /** Fuzzy-search query from Hevy workout or Coach recommendation */
  exerciseQuery?: string | null;
  /** Direct exercise item selected from the Exercise Library */
  directExercise?: FreeExerciseDbItem | null;
  onClose: () => void;
}

export function ExerciseTechniqueModal({
  exerciseQuery = null,
  directExercise = null,
  onClose,
}: ExerciseTechniqueModalProps) {
  const isOpen = Boolean(directExercise || (exerciseQuery && exerciseQuery.trim()));

  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [matches, setMatches] = useState<FreeExerciseDbItem[]>([]);
  const [activeItem, setActiveItem] = useState<FreeExerciseDbItem | null>(
    directExercise,
  );
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setFailedImages({});
    if (!isOpen) {
      setMatches([]);
      setActiveItem(null);
      setOffline(false);
      setLoading(false);
      return;
    }

    if (directExercise) {
      setActiveItem(directExercise);
      setMatches([directExercise]);
      setOffline(false);
      setLoading(false);
      return;
    }

    if (!exerciseQuery) return;
    let active = true;
    setLoading(true);
    setOffline(false);

    void loadFreeExerciseDb().then((res) => {
      if (!active) return;
      if (res.offline || res.exercises.length === 0) {
        setOffline(true);
        setMatches([]);
        setActiveItem(null);
        setLoading(false);
        return;
      }

      const found = findBestExerciseMatches(exerciseQuery, res.exercises, 4);
      setMatches(found);
      setActiveItem(found[0] ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [isOpen, directExercise, exerciseQuery]);

  async function handleRetry() {
    if (!exerciseQuery) return;
    setLoading(true);
    setOffline(false);
    const res = await loadFreeExerciseDb({ forceRefresh: true });
    if (res.offline || res.exercises.length === 0) {
      setOffline(true);
      setMatches([]);
      setActiveItem(null);
    } else {
      const found = findBestExerciseMatches(exerciseQuery, res.exercises, 4);
      setMatches(found);
      setActiveItem(found[0] ?? null);
    }
    setLoading(false);
  }

  if (!isOpen) return null;

  const visibleImages = (activeItem?.images ?? []).filter(
    (imgPath) => !failedImages[imgPath],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Техника и снимки на упражнението"
      data-testid="exercise-technique-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0F141F] shadow-2xl">
        {/* Заглавна лента */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
              <span>Техника и снимки · Free Exercise DB</span>
              {exerciseQuery && activeItem && exerciseQuery.toLowerCase() !== activeItem.name.toLowerCase() && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">Търсено: {exerciseQuery}</span>
                </>
              )}
            </div>
            <h2 className="mt-1 font-display text-lg font-bold text-white truncate">
              {activeItem?.name ?? exerciseQuery ?? 'Упражнение'}
            </h2>
          </div>

          <button
            type="button"
            data-testid="close-technique-modal-btn"
            onClick={onClose}
            aria-label="Затвори прозореца"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#141B27] text-slate-300 transition-colors hover:border-white/25 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Съдържание */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-10 text-center">
              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
              <p className="mt-3 text-xs text-slate-400">
                Зареждане на каталога с упражнения (кешира се локално за 30 дни)…
              </p>
            </div>
          ) : offline ? (
            <div
              data-testid="technique-offline-state"
              className="py-8 text-center"
            >
              <CloudOff
                className="mx-auto h-7 w-7 text-slate-500"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Офлайн режим (каталогът с техника не е кеширан локално)
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Свържи се веднъж с интернет, за да се изтегли и кешира за 30 дни.
              </p>
              <button
                type="button"
                onClick={() => void handleRetry()}
                className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 hover:border-white/30 hover:text-white cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Опитай отново</span>
              </button>
            </div>
          ) : !activeItem ? (
            <div className="py-8 text-center">
              <Dumbbell
                className="mx-auto h-7 w-7 text-slate-500"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium text-slate-200">
                Не е намерено точно съвпадение за „{exerciseQuery}“
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Използвай търсачката в „Библиотека с упражнения“, за да намериш близък вариант по мускулна група и оборудване.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Алтернативни съвпадения, ако търсенето е от Hevy/Треньор */}
              {matches.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-white/8 pb-3">
                  <span className="text-[11px] text-slate-400 mr-1">
                    Близки варианти:
                  </span>
                  {matches.map((m) => {
                    const selected = m.id === activeItem.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setFailedImages({});
                          setActiveItem(m);
                        }}
                        className={`h-7 rounded-md border px-2.5 text-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selected
                            ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                            : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Снимки на начална и крайна позиция (автоматично скриване при офлайн/грешка) */}
              {visibleImages.length > 0 ? (
                <div
                  data-testid="technique-images-grid"
                  className={`grid gap-3 ${
                    visibleImages.length >= 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {visibleImages.slice(0, 2).map((imgPath, idx) => (
                    <figure
                      key={imgPath}
                      className="overflow-hidden rounded-xl border border-white/10 bg-[#0A0E17]"
                    >
                      <img
                        src={buildFreeExerciseImageUrl(imgPath)}
                        alt={`${activeItem.name} — ${idx === 0 ? 'начална позиция' : 'крайна позиция'}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [imgPath]: true }))
                        }
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <figcaption className="border-t border-white/8 px-3 py-1.5 text-[11px] text-slate-400">
                        {idx === 0 ? '1. Начална позиция' : '2. Крайна позиция'}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : activeItem.images.length > 0 ? (
                <div className="rounded-xl border border-white/8 bg-[#131926] px-4 py-3 text-xs text-slate-400">
                  Снимките не са достъпни в офлайн режим, но описанието и мускулите са заредени от локалния кеш.
                </div>
              ) : null}

              {/* Чисти метаданни без pill-ове */}
              <div className="grid grid-cols-1 gap-3 border-y border-white/10 py-3.5 text-xs sm:grid-cols-2">
                <div>
                  <span className="text-slate-400">Ниво на трудност: </span>
                  <span className="font-semibold text-white">
                    {translateExerciseLevelBg(activeItem.level)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Оборудване: </span>
                  <span className="font-semibold text-white">
                    {translateExerciseEquipmentBg(activeItem.equipment)}
                  </span>
                  <span className="ml-1.5 text-slate-400">
                    · {getExerciseEnvironmentBadge(activeItem)}
                  </span>
                </div>
                <div>
                  <span className="text-emerald-400 font-medium">
                    Основни мускули:{' '}
                  </span>
                  <span className="text-slate-200">
                    {activeItem.primaryMuscles.length > 0
                      ? activeItem.primaryMuscles
                          .map(translateExerciseMuscleBg)
                          .join(', ')
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-amber-300 font-medium">
                    Второстепенни:{' '}
                  </span>
                  <span className="text-slate-300">
                    {activeItem.secondaryMuscles.length > 0
                      ? activeItem.secondaryMuscles
                          .map(translateExerciseMuscleBg)
                          .join(', ')
                      : 'Няма'}
                  </span>
                </div>
              </div>

              {/* Стъпки за правилно изпълнение */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Стъпки за правилно изпълнение
                </h3>
                {activeItem.instructions.length > 0 ? (
                  <ol
                    data-testid="technique-instructions-list"
                    className="mt-2.5 space-y-2 text-xs leading-relaxed text-slate-200"
                  >
                    {activeItem.instructions.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--accent-text)] mt-0.5 shrink-0">
                          {idx + 1}.
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">
                    Няма записани текстови инструкции за това упражнение.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
