import React, { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import type {
  CustomExerciseMapping,
  CustomExerciseMappings,
  DetailedMuscleId,
} from '../types/fitness';
import {
  MUSCLE_GROUPS_15,
  findCustomExerciseMapping,
  resolveExerciseMuscles,
} from '../utils/exerciseMuscleEngine';

interface ExerciseMuscleEditorModalProps {
  exerciseTitle: string | null;
  customExerciseMappings?: CustomExerciseMappings;
  onClose: () => void;
  onSave: (
    exerciseTitle: string,
    mapping: CustomExerciseMapping | null,
  ) => Promise<void> | void;
}

export const ExerciseMuscleEditorModal: React.FC<ExerciseMuscleEditorModalProps> = ({
  exerciseTitle,
  customExerciseMappings,
  onClose,
  onSave,
}) => {
  const autoResolution = useMemo(
    () => (exerciseTitle ? resolveExerciseMuscles(exerciseTitle) : null),
    [exerciseTitle],
  );
  const existingCustom = useMemo(
    () =>
      exerciseTitle
        ? findCustomExerciseMapping(exerciseTitle, customExerciseMappings)
        : null,
    [exerciseTitle, customExerciseMappings],
  );

  const [primary, setPrimary] = useState<DetailedMuscleId[]>([]);
  const [secondary, setSecondary] = useState<DetailedMuscleId[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseTitle) return;
    const current = resolveExerciseMuscles(exerciseTitle, customExerciseMappings);
    setPrimary(current.primary);
    setSecondary(current.secondary);
    setErrorText(null);
  }, [exerciseTitle, customExerciseMappings]);

  useEffect(() => {
    if (!exerciseTitle) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exerciseTitle, onClose]);

  if (!exerciseTitle) return null;

  const togglePrimary = (id: DetailedMuscleId) => {
    setErrorText(null);
    setPrimary((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      // Remove from secondary if promoted to primary
      setSecondary((sec) => sec.filter((item) => item !== id));
      return [...prev, id];
    });
  };

  const toggleSecondary = (id: DetailedMuscleId) => {
    setErrorText(null);
    if (primary.includes(id)) return;
    setSecondary((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    if (primary.length === 0) {
      setErrorText('Избери поне 1 основна мускулна група.');
      return;
    }
    setSaving(true);
    try {
      await onSave(exerciseTitle, { primary, secondary });
      onClose();
    } catch {
      setErrorText('Възникна грешка при запазването. Опитай отново.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToAuto = async () => {
    setSaving(true);
    try {
      await onSave(exerciseTitle, null);
      onClose();
    } catch {
      setErrorText('Възникна грешка при връщане на автоматичното разпознаване.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-muscle-editor-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              Ръчно настройване на мускулни групи
            </p>
            <h3
              id="exercise-muscle-editor-title"
              className="text-base font-semibold text-white mt-0.5 truncate"
            >
              {exerciseTitle}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Записва се в <span className="font-mono text-slate-300">customExerciseMappings</span> и се прилага веднага в Седмичния обем, Картата на възстановяването и Интелигентния треньор.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Затвори"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Primary Section */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0" />
                <h4 className="text-sm font-semibold text-emerald-300">
                  Основни мускулни групи (1.0 серия · 48–72 ч възстановяване)
                </h4>
              </div>
              <span className="text-xs text-slate-400 tabular-nums">
                Избрани: {primary.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MUSCLE_GROUPS_15.map((m) => {
                const active = primary.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => togglePrimary(m.id)}
                    className={`px-3 py-2 rounded-lg text-left text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Secondary Section */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <h4 className="text-sm font-semibold text-amber-300">
                  Второстепенни групи (0.5 серия · 24–36 ч възстановяване)
                </h4>
              </div>
              <span className="text-xs text-slate-400 tabular-nums">
                Избрани: {secondary.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MUSCLE_GROUPS_15.map((m) => {
                const isPrimary = primary.includes(m.id);
                const active = secondary.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isPrimary}
                    onClick={() => toggleSecondary(m.id)}
                    className={`px-3 py-2 rounded-lg text-left text-xs font-medium border transition-colors ${
                      isPrimary
                        ? 'bg-slate-950/30 border-slate-800/50 text-slate-600 cursor-not-allowed'
                        : active
                          ? 'bg-amber-500/15 border-amber-500/60 text-amber-200 cursor-pointer'
                          : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white cursor-pointer'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {autoResolution && autoResolution.recognized && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 text-xs text-slate-400">
              Автоматично разпознаване от речника:{' '}
              <span className="text-emerald-300">
                Основна: {autoResolution.primaryLabels.join(', ')}
              </span>
              {' · '}
              <span className="text-amber-300">
                Второстепенни:{' '}
                {autoResolution.secondaryLabels.length > 0
                  ? autoResolution.secondaryLabels.join(', ')
                  : 'няма'}
              </span>
            </div>
          )}

          {errorText && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-300">
              {errorText}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2">
          <div>
            {existingCustom && (
              <button
                type="button"
                disabled={saving}
                onClick={handleResetToAuto}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Върни автоматично</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Отказ
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Запазване...' : 'Запази мускулите'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
