import { useState } from 'react';
import { Check, Copy, Dumbbell } from 'lucide-react';
import type {
  CoachAnalysisReport,
  CustomExerciseMappings,
  DailyBiometricLog,
  GeneratedWorkoutPlan,
  HevyWorkout,
  WorkoutGeneratorGoal,
} from '../../types/fitness';
import {
  formatGeneratedWorkoutClipboard,
  generateOptimalWorkoutForToday,
} from '../../utils/coachMiniAi';
import {
  formatBgNumericDate,
  formatNumberBg,
  shiftDateKey,
} from '../../utils/fitnessMath';

interface CoachWorkoutGeneratorProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  coachReport: CoachAnalysisReport;
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
  onOpenTechnique?: (exerciseName: string) => void;
}

const GOAL_OPTIONS: Array<{ id: WorkoutGeneratorGoal; label: string }> = [
  { id: 'strength', label: 'Сила' },
  { id: 'hypertrophy', label: 'Хипертрофия' },
  { id: 'quick_40', label: 'Бърза тренировка 40 мин' },
  { id: 'recovery_deload', label: 'Възстановителна / Deload' },
];

async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CoachWorkoutGenerator({
  hevyWorkouts,
  dailyLogs = [],
  coachReport,
  todayKey,
  customExerciseMappings,
  onOpenTechnique,
}: CoachWorkoutGeneratorProps) {
  const [goal, setGoal] = useState<WorkoutGeneratorGoal>('hypertrophy');
  const [plan, setPlan] = useState<GeneratedWorkoutPlan | null>(() =>
    generateOptimalWorkoutForToday({
      goal: 'hypertrophy',
      hevyWorkouts,
      dailyLogs,
      coachReport,
      todayKey,
      customExerciseMappings,
    }),
  );
  const [copied, setCopied] = useState(false);

  function handleGenerate(targetGoal: WorkoutGeneratorGoal = goal) {
    const generated = generateOptimalWorkoutForToday({
      goal: targetGoal,
      hevyWorkouts,
      dailyLogs,
      coachReport,
      todayKey,
      customExerciseMappings,
    });
    setPlan(generated);
    setCopied(false);
  }

  async function handleCopy() {
    if (!plan) return;
    const text = formatGeneratedWorkoutClipboard(plan);
    const ok = await copyTextSafely(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    }
  }

  return (
    <section
      data-testid="coach-workout-generator"
      aria-label="Какво да тренирам днес?"
      className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Dumbbell
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>
              План за ДНЕС ({formatBgNumericDate(todayKey)}) на база записите до ВЧЕРА ({formatBgNumericDate(shiftDateKey(todayKey, -1))}) · възстановени мускули (&gt; 48–72 ч) + реален 1RM
            </span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            Какво да тренирам ДНЕС ({formatBgNumericDate(todayKey)})?
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="coach-generate-workout-btn"
            onClick={() => handleGenerate(goal)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
          >
            Генерирай оптимална тренировка
          </button>

          {plan && (
            <button
              type="button"
              data-testid="coach-copy-workout-btn"
              onClick={handleCopy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-400">Копирано</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Копирай тренировката</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Избор на цел */}
      <div
        role="group"
        aria-label="Избор на цел за днешната тренировка"
        className="mt-4 inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-white/12 bg-[#141B27] p-1"
      >
        {GOAL_OPTIONS.map((opt) => {
          const active = goal === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`coach-goal-${opt.id}`}
              onClick={() => {
                setGoal(opt.id);
                handleGenerate(opt.id);
              }}
              className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {plan && (
        <div className="mt-5" data-testid="coach-generated-plan">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#141B27] px-4 py-3 text-xs">
            <span className="font-medium text-white">
              План: {plan.goalLabel} (~{plan.estimatedMinutes} мин)
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              {plan.focusSummary}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {plan.exercises.map((ex, idx) => (
              <div
                key={`${ex.exerciseTitle}-${idx}`}
                className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#0C111A] p-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-slate-400">
                        {idx + 1}. {ex.targetMuscleLabel}
                        {!ex.isFromUserHistory ? ' · Базово предложение' : ''}
                      </div>
                      <h3 className="mt-0.5 font-display text-sm font-bold text-white">
                        {ex.exerciseTitle}
                      </h3>
                    </div>

                    <div className="text-right font-mono text-xs font-bold tabular-nums text-[var(--accent-text)] whitespace-nowrap">
                      {ex.sets} × {ex.repsText}
                      {ex.recommendedWeightKg !== null
                        ? ` · ${formatNumberBg(ex.recommendedWeightKg)} kg`
                        : ' · BW'}
                    </div>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    <span className="text-slate-500">Защо: </span>
                    {ex.reason}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2">
                  <span className="font-mono text-[11px] tabular-nums text-slate-400">
                    Почивка между сериите: {ex.restSeconds} сек
                  </span>
                  {onOpenTechnique && (
                    <button
                      type="button"
                      onClick={() => onOpenTechnique(ex.exerciseTitle)}
                      className="inline-flex h-6 items-center rounded-md border border-white/12 bg-[#141B27] px-2 text-[11px] font-medium text-slate-300 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      👁️ Техника и снимки
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
