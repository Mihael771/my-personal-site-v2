import { useState } from 'react';
import { Target } from 'lucide-react';
import type { TrainingGoalPhase } from '../types/fitness';
import {
  TRAINING_GOAL_META_MAP,
  TRAINING_GOAL_OPTIONS,
} from '../utils/hiddenProgressAndEnvironment';

interface TrainingGoalSwitcherProps {
  value: TrainingGoalPhase;
  onChange: (nextGoal: TrainingGoalPhase) => Promise<void> | void;
  compact?: boolean;
}

export function TrainingGoalSwitcher({
  value,
  onChange,
  compact = false,
}: TrainingGoalSwitcherProps) {
  const [saving, setSaving] = useState(false);
  const activeMeta = TRAINING_GOAL_META_MAP[value];

  async function handleSelect(nextGoal: TrainingGoalPhase) {
    if (nextGoal === value || saving) return;
    setSaving(true);
    try {
      await onChange(nextGoal);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="training-goal-switcher"
      className={`rounded-2xl border border-white/10 bg-[#0F141F] ${
        compact ? 'p-4' : 'p-4 sm:p-5'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
            <Target
              className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0"
              aria-hidden="true"
            />
            <span>Режим на целта (адаптира треньора и калориите)</span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--accent-text)]">
              {activeMeta.calorieTargetText}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            {activeMeta.summaryText}
          </p>
        </div>

        <div
          role="group"
          aria-label="Избор на тренировъчна цел"
          className="inline-flex flex-wrap items-center gap-1.5 rounded-xl border border-white/12 bg-[#141B27] p-1 self-start lg:self-auto"
        >
          {TRAINING_GOAL_OPTIONS.map((opt) => {
            const isActive = opt.id === value;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`goal-phase-btn-${opt.id}`}
                aria-pressed={isActive}
                disabled={saving}
                onClick={() => handleSelect(opt.id)}
                className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                  isActive
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {opt.buttonLabel}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
