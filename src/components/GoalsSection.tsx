import { useState } from 'react';
import { Calendar, CheckCircle2, Clock, Pencil, Plus, Target, Trash2, TrendingUp } from 'lucide-react';
import type {
  DiaryState,
  DurationUnit,
  FitnessGoal,
  GoalTimeMode,
  GoalType,
  MuscleGoalUnit,
} from '../types/fitness';
import {
  GOAL_TIME_MODE_LABELS,
  GOAL_TYPE_LABELS,
  createEmptyGoal,
  evaluateGoal,
  formatBgDate,
  getCurrentWeightKg,
  shiftDateKey,
} from '../utils/fitnessMath';

interface GoalsSectionProps {
  state: DiaryState;
  todayKey: string;
  onUpdateGoal: (slotIndex: 1 | 2 | 3, nextGoal: FitnessGoal) => void;
}

export function GoalsSection({ state, todayKey, onUpdateGoal }: GoalsSectionProps) {
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [draftGoal, setDraftGoal] = useState<FitnessGoal | null>(null);

  const currentWeight = getCurrentWeightKg(state, todayKey);
  const activeCount = state.goals.filter((g) => g.enabled).length;

  function startEdit(goal: FitnessGoal, presetType?: GoalType, presetMode?: GoalTimeMode) {
    const type = presetType ?? goal.type;
    const defaultTarget =
      presetType && presetType !== goal.type
        ? presetType === 'target_weight'
          ? Math.max(45, (currentWeight ?? 79) - 3)
          : presetType === 'weight_loss'
            ? 4
            : 500
        : goal.targetValue;

    const resolvedStartWeight =
      goal.startWeightKg ??
      currentWeight ??
      (typeof state.profile.weightKg === 'number' ? state.profile.weightKg : undefined);

    setEditingSlot(goal.slotIndex);
    setDraftGoal({
      ...goal,
      enabled: true,
      type,
      timeMode: presetMode ?? (presetType === 'muscle_mass_gain' && !goal.enabled ? 'estimate_time' : goal.timeMode),
      targetValue: defaultTarget,
      startDate: goal.enabled ? goal.startDate : todayKey,
      ...(resolvedStartWeight !== undefined ? { startWeightKg: resolvedStartWeight } : {}),
      targetDate: goal.targetDate || shiftDateKey(todayKey, 60),
    });
  }

  function handleSaveDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!draftGoal) return;
    const cleanTarget =
      Number.isFinite(draftGoal.targetValue) && draftGoal.targetValue > 0
        ? Math.round(draftGoal.targetValue * 10) / 10
        : 1;
    const cleanDuration =
      Number.isFinite(draftGoal.durationValue) && draftGoal.durationValue >= 1
        ? Math.round(draftGoal.durationValue)
        : 1;

    onUpdateGoal(draftGoal.slotIndex, {
      ...draftGoal,
      enabled: true,
      targetValue: cleanTarget,
      durationValue: cleanDuration,
    });
    setEditingSlot(null);
    setDraftGoal(null);
  }

  function handleClearGoal(slotIndex: 1 | 2 | 3) {
    onUpdateGoal(slotIndex, createEmptyGoal(slotIndex, todayKey, currentWeight));
    if (editingSlot === slotIndex) {
      setEditingSlot(null);
      setDraftGoal(null);
    }
  }

  return (
    <section
      id="goals"
      aria-label="Лични фитнес цели"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Лични цели (до 3 цели)
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            Настрой до 3 цели — целево тегло, натрупана мускулна маса или свалено тегло — за календарно време, до конкретна дата или с прогноза колко време ще отнеме.
          </p>
        </div>

        <div className="font-mono text-xs tabular-nums text-slate-400 shrink-0">
          Активни цели: <span className="font-semibold text-white">{activeCount} / 3</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 items-stretch">
        {state.goals.map((goal) => {
          const isEditing = editingSlot === goal.slotIndex && draftGoal !== null;

          if (isEditing && draftGoal) {
            const livePreview = evaluateGoal({ ...draftGoal, enabled: true }, state, todayKey);
            return (
              <form
                key={goal.id}
                onSubmit={handleSaveDraft}
                data-testid={`goal-form-${goal.slotIndex}`}
                className="flex flex-col justify-between rounded-2xl border border-[var(--accent-border)] bg-[#111827] p-5"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <span className="font-display text-sm font-bold text-white">
                      Настройка на Цел {goal.slotIndex}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSlot(null);
                        setDraftGoal(null);
                      }}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Отказ
                    </button>
                  </div>

                  <div className="mt-4 space-y-3.5">
                    <div>
                      <label
                        htmlFor={`goal-type-${goal.slotIndex}`}
                        className="mb-1 block text-xs font-medium text-slate-300"
                      >
                        Вид на целта
                      </label>
                      <select
                        id={`goal-type-${goal.slotIndex}`}
                        data-testid={`goal-type-select-${goal.slotIndex}`}
                        value={draftGoal.type}
                        onChange={(e) => {
                          const nextType = e.target.value as GoalType;
                          const nextTarget =
                            nextType === 'target_weight'
                              ? Math.max(45, (currentWeight ?? 79) - 3)
                              : nextType === 'weight_loss'
                                ? 4
                                : 500;
                          setDraftGoal({
                            ...draftGoal,
                            type: nextType,
                            targetValue: nextTarget,
                          });
                        }}
                        className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 text-sm text-white"
                      >
                        <option value="target_weight">{GOAL_TYPE_LABELS.target_weight} (кг)</option>
                        <option value="muscle_mass_gain">{GOAL_TYPE_LABELS.muscle_mass_gain} (натрупване)</option>
                        <option value="weight_loss">{GOAL_TYPE_LABELS.weight_loss} (кг)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`goal-target-${goal.slotIndex}`}
                          className="mb-1 block text-xs font-medium text-slate-300"
                        >
                          {draftGoal.type === 'target_weight'
                            ? 'Целево тегло (кг)'
                            : draftGoal.type === 'weight_loss'
                              ? 'Килограми за сваляне'
                              : `Количество (${draftGoal.muscleUnit === 'kg' ? 'кг' : 'г'})`}
                        </label>
                        <input
                          id={`goal-target-${goal.slotIndex}`}
                          data-testid={`goal-target-input-${goal.slotIndex}`}
                          type="number"
                          min={0.5}
                          max={draftGoal.type === 'muscle_mass_gain' && draftGoal.muscleUnit === 'g' ? 20000 : 350}
                          step="0.5"
                          required
                          value={draftGoal.targetValue}
                          onChange={(e) =>
                            setDraftGoal({
                              ...draftGoal,
                              targetValue: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-3 font-mono text-sm tabular-nums text-white"
                        />
                      </div>

                      {draftGoal.type === 'muscle_mass_gain' ? (
                        <div>
                          <label
                            htmlFor={`goal-muscle-unit-${goal.slotIndex}`}
                            className="mb-1 block text-xs font-medium text-slate-300"
                          >
                            Мерна единица
                          </label>
                          <select
                            id={`goal-muscle-unit-${goal.slotIndex}`}
                            value={draftGoal.muscleUnit}
                            onChange={(e) => {
                              const nextUnit = e.target.value as MuscleGoalUnit;
                              const converted =
                                nextUnit === 'kg' && draftGoal.muscleUnit === 'g'
                                  ? Math.max(0.5, Math.round((draftGoal.targetValue / 1000) * 10) / 10)
                                  : nextUnit === 'g' && draftGoal.muscleUnit === 'kg'
                                    ? Math.round(draftGoal.targetValue * 1000)
                                    : draftGoal.targetValue;
                              setDraftGoal({
                                ...draftGoal,
                                muscleUnit: nextUnit,
                                targetValue: converted,
                              });
                            }}
                            className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 text-sm text-white"
                          >
                            <option value="g">Грамове (г)</option>
                            <option value="kg">Килограми (кг)</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor={`goal-start-weight-${goal.slotIndex}`}
                            className="mb-1 block text-xs font-medium text-slate-300"
                          >
                            Начално тегло (кг)
                          </label>
                          <input
                            id={`goal-start-weight-${goal.slotIndex}`}
                            type="number"
                            min={20}
                            max={400}
                            step="0.1"
                            value={draftGoal.startWeightKg ?? ''}
                            onChange={(e) =>
                              setDraftGoal({
                                ...draftGoal,
                                startWeightKg:
                                  e.target.value === '' ? undefined : parseFloat(e.target.value),
                              })
                            }
                            placeholder={currentWeight ? String(currentWeight) : '79'}
                            className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-3 font-mono text-sm tabular-nums text-white"
                          />
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`goal-time-mode-${goal.slotIndex}`}
                        className="mb-1 block text-xs font-medium text-slate-300"
                      >
                        Времеви режим
                      </label>
                      <select
                        id={`goal-time-mode-${goal.slotIndex}`}
                        data-testid={`goal-timemode-select-${goal.slotIndex}`}
                        value={draftGoal.timeMode}
                        onChange={(e) =>
                          setDraftGoal({
                            ...draftGoal,
                            timeMode: e.target.value as GoalTimeMode,
                          })
                        }
                        className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 text-sm text-white"
                      >
                        <option value="calendar_duration">{GOAL_TIME_MODE_LABELS.calendar_duration}</option>
                        <option value="until_date">{GOAL_TIME_MODE_LABELS.until_date}</option>
                        <option value="estimate_time">{GOAL_TIME_MODE_LABELS.estimate_time}</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`goal-start-date-${goal.slotIndex}`}
                          className="mb-1 block text-xs font-medium text-slate-300"
                        >
                          Начална дата
                        </label>
                        <input
                          id={`goal-start-date-${goal.slotIndex}`}
                          type="date"
                          max={todayKey}
                          value={draftGoal.startDate}
                          onChange={(e) => {
                            if (e.target.value) {
                              setDraftGoal({ ...draftGoal, startDate: e.target.value });
                            }
                          }}
                          className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 font-mono text-xs tabular-nums text-white"
                        />
                      </div>

                      {draftGoal.timeMode === 'until_date' && (
                        <div>
                          <label
                            htmlFor={`goal-target-date-${goal.slotIndex}`}
                            className="mb-1 block text-xs font-medium text-slate-300"
                          >
                            Крайна дата
                          </label>
                          <input
                            id={`goal-target-date-${goal.slotIndex}`}
                            type="date"
                            min={draftGoal.startDate}
                            value={draftGoal.targetDate}
                            onChange={(e) => {
                              if (e.target.value) {
                                setDraftGoal({ ...draftGoal, targetDate: e.target.value });
                              }
                            }}
                            className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 font-mono text-xs tabular-nums text-white"
                          />
                        </div>
                      )}

                      {draftGoal.timeMode === 'calendar_duration' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label
                              htmlFor={`goal-dur-val-${goal.slotIndex}`}
                              className="mb-1 block text-xs font-medium text-slate-300"
                            >
                              Срок
                            </label>
                            <input
                              id={`goal-dur-val-${goal.slotIndex}`}
                              type="number"
                              min={1}
                              max={365}
                              value={draftGoal.durationValue}
                              onChange={(e) =>
                                setDraftGoal({
                                  ...draftGoal,
                                  durationValue: parseInt(e.target.value, 10) || 1,
                                })
                              }
                              className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2.5 font-mono text-sm tabular-nums text-white"
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`goal-dur-unit-${goal.slotIndex}`}
                              className="mb-1 block text-xs font-medium text-slate-300"
                            >
                              Период
                            </label>
                            <select
                              id={`goal-dur-unit-${goal.slotIndex}`}
                              value={draftGoal.durationUnit}
                              onChange={(e) =>
                                setDraftGoal({
                                  ...draftGoal,
                                  durationUnit: e.target.value as DurationUnit,
                                })
                              }
                              className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-2 text-xs text-white"
                            >
                              <option value="days">дни</option>
                              <option value="weeks">седмици</option>
                              <option value="months">месеци</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`goal-title-${goal.slotIndex}`}
                        className="mb-1 block text-xs font-medium text-slate-300"
                      >
                        Име на целта (по избор)
                      </label>
                      <input
                        id={`goal-title-${goal.slotIndex}`}
                        type="text"
                        value={draftGoal.title}
                        onChange={(e) =>
                          setDraftGoal({ ...draftGoal, title: e.target.value })
                        }
                        placeholder="напр. Лятна форма"
                        className="h-9 w-full rounded-lg border border-white/15 bg-[#161E2E] px-3 text-sm text-white placeholder:text-slate-500"
                      />
                    </div>

                    {draftGoal.timeMode === 'estimate_time' && livePreview.estimatedDurationText && (
                      <p className="text-xs text-[var(--accent-text)]">
                        Прогноза: {livePreview.estimatedDurationText}
                        {livePreview.estimatedCompletionDate
                          ? ` (${formatBgDate(livePreview.estimatedCompletionDate)})`
                          : ''}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4">
                  <button
                    type="submit"
                    data-testid={`goal-save-btn-${goal.slotIndex}`}
                    className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--accent-contrast)] hover:bg-[var(--accent-strong)] whitespace-nowrap"
                  >
                    Запази целта
                  </button>
                </div>
              </form>
            );
          }

          if (!goal.enabled) {
            return (
              <article
                key={goal.id}
                data-testid={`goal-card-empty-${goal.slotIndex}`}
                className="flex flex-col justify-between rounded-2xl border border-dashed border-white/15 bg-[#0F141F]/70 p-5"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Цел {goal.slotIndex}</span>
                    <span>Свободен слот</span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-bold text-white">
                    Добави цел #{goal.slotIndex}
                  </h3>
                  <p className="mt-1 text-xs text-slate-400">
                    Избери вид на целта, за да я настроиш за календарно време, до дата или с изчисление на нужното време:
                  </p>
                </div>

                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    data-testid={`goal-add-weight-${goal.slotIndex}`}
                    onClick={() => startEdit(goal, 'target_weight', 'until_date')}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-white/12 bg-[#151C29] px-3 text-xs font-medium text-slate-200 hover:border-[var(--accent-border)] hover:text-white"
                  >
                    <span>Целево тегло (кг)</span>
                    <Plus className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid={`goal-add-muscle-${goal.slotIndex}`}
                    onClick={() => startEdit(goal, 'muscle_mass_gain', 'estimate_time')}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-white/12 bg-[#151C29] px-3 text-xs font-medium text-slate-200 hover:border-[var(--accent-border)] hover:text-white"
                  >
                    <span>Натрупана мускулна маса</span>
                    <Plus className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid={`goal-add-loss-${goal.slotIndex}`}
                    onClick={() => startEdit(goal, 'weight_loss', 'calendar_duration')}
                    className="flex h-9 w-full items-center justify-between rounded-lg border border-white/12 bg-[#151C29] px-3 text-xs font-medium text-slate-200 hover:border-[var(--accent-border)] hover:text-white"
                  >
                    <span>Свалено тегло (кг)</span>
                    <Plus className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          }

          const ev = evaluateGoal(goal, state, todayKey);

          return (
            <article
              key={goal.id}
              data-testid={`goal-card-${goal.slotIndex}`}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span>Цел {goal.slotIndex}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ev.typeLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ev.timeModeLabel}</span>
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-white">
                      {ev.displayTitle}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid={`goal-edit-btn-${goal.slotIndex}`}
                      onClick={() => startEdit(goal)}
                      aria-label={`Редактирай цел ${goal.slotIndex}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#151C29] text-slate-300 hover:border-white/25 hover:text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      data-testid={`goal-delete-btn-${goal.slotIndex}`}
                      onClick={() => handleClearGoal(goal.slotIndex)}
                      aria-label={`Премахни цел ${goal.slotIndex}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#151C29] text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {ev.hasRequiredData ? (
                  <>
                    <div className="mt-4 flex items-baseline justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-400">Текущо</div>
                        <div className="font-mono text-base font-bold tabular-nums text-white">
                          {ev.currentText}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Цел</div>
                        <div className="font-mono text-base font-bold tabular-nums text-[var(--accent-text)]">
                          {ev.targetText}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="text-slate-400">Напредък</span>
                        <span className="font-mono font-semibold tabular-nums text-white">
                          {ev.progressPercent}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`Напредък по цел ${goal.slotIndex}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={ev.progressPercent}
                        className="h-2.5 w-full overflow-hidden rounded-full bg-white/8"
                      >
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${
                            ev.isCompleted ? 'bg-emerald-500' : 'bg-[var(--accent)]'
                          }`}
                          style={{
                            width: `${Math.max(ev.progressPercent > 0 ? 4 : 0, ev.progressPercent)}%`,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-xs">
                        {ev.isCompleted ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                        ) : (
                          <Target className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                        )}
                        <span className={ev.isCompleted ? 'font-medium text-emerald-300' : 'text-slate-300'}>
                          {ev.remainingText}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 rounded-lg border border-white/10 bg-[#141B29] p-3 text-xs text-slate-300">
                    {ev.missingDataMessage}
                  </p>
                )}
              </div>

              <div className="mt-4 space-y-1.5 border-t border-white/10 pt-3.5 text-xs">
                {goal.timeMode === 'estimate_time' ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <Clock className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                        <span>Очаквано време:</span>
                      </span>
                      <span
                        data-testid={`goal-eta-${goal.slotIndex}`}
                        className="font-mono font-bold tabular-nums text-[var(--accent-text)]"
                      >
                        {ev.estimatedDurationText ?? '—'}
                      </span>
                    </div>
                    {ev.estimatedCompletionDate && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Прогнозна дата:</span>
                        <span className="font-mono tabular-nums text-white">
                          {formatBgDate(ev.estimatedCompletionDate)}
                        </span>
                      </div>
                    )}
                    {ev.actualPaceText && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 text-slate-400">
                          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Темпо:</span>
                        </span>
                        <span className="font-mono tabular-nums text-slate-200">
                          {ev.actualPaceText}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-slate-400">
                        <Calendar className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                        <span>Оставащо време:</span>
                      </span>
                      <span className="font-mono font-bold tabular-nums text-white">
                        {ev.daysRemaining !== undefined
                          ? ev.daysRemaining > 0
                            ? `${ev.daysRemaining} дни`
                            : ev.daysRemaining === 0
                              ? 'Днес'
                              : 'Срокът изтече'
                          : '—'}
                      </span>
                    </div>
                    {ev.requiredPaceText && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400">Нужно темпо:</span>
                        <span className="font-mono tabular-nums text-[var(--accent-text)]">
                          {ev.requiredPaceText}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {ev.estimationNote && (
                  <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                    {ev.estimationNote}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
