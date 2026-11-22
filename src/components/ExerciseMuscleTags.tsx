import React, { useMemo } from 'react';
import { AlertTriangle, Pencil } from 'lucide-react';
import type { CustomExerciseMappings } from '../types/fitness';
import { resolveExerciseMuscles } from '../utils/exerciseMuscleEngine';

interface ExerciseMuscleTagsProps {
  exerciseTitle: string;
  customExerciseMappings?: CustomExerciseMappings;
  onEdit?: (exerciseTitle: string) => void;
  compact?: boolean;
}

export const ExerciseMuscleTags: React.FC<ExerciseMuscleTagsProps> = ({
  exerciseTitle,
  customExerciseMappings,
  onEdit,
  compact = false,
}) => {
  const resolution = useMemo(
    () => resolveExerciseMuscles(exerciseTitle, customExerciseMappings),
    [exerciseTitle, customExerciseMappings],
  );

  if (!exerciseTitle.trim()) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${
        compact ? 'text-[11px]' : 'text-xs'
      }`}
    >
      {resolution.recognized ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
              aria-hidden="true"
            />
            <span className="text-emerald-300 font-medium">Основна:</span>
            <span className="text-slate-200">
              {resolution.primaryLabels.join(', ')}
            </span>
          </span>

          <span className="inline-flex items-center gap-1.5 text-slate-400">
            <span
              className="w-2 h-2 rounded-full bg-amber-400 shrink-0"
              aria-hidden="true"
            />
            <span className="text-amber-300 font-medium">Второстепенни:</span>
            <span className="text-slate-300">
              {resolution.secondaryLabels.length > 0
                ? resolution.secondaryLabels.join(', ')
                : 'няма'}
            </span>
          </span>

          {resolution.source === 'custom' && (
            <span className="text-[10px] uppercase tracking-wider text-sky-400 font-medium">
              Персонализирано
            </span>
          )}
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Неразпознато упражнение — избери мускулни групи</span>
        </span>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(exerciseTitle);
          }}
          title="Редактирай основни и второстепенни мускулни групи"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-slate-700/80 bg-slate-900/70 hover:bg-slate-800 hover:border-slate-600 text-[11px] font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Pencil className="w-3 h-3" />
          <span>Редактирай мускули</span>
        </button>
      )}
    </div>
  );
};
