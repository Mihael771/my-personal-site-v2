import { useMemo, useState } from 'react';
import type {
  CoachSubPriority,
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
  TodayScenarioId,
  TrainingGoalPhase,
  UserProfile,
} from '../../types/fitness';
import {
  COACH_SUB_PRIORITY_OPTIONS,
} from '../../utils/hiddenProgressAndEnvironment';
import {
  TODAY_SCENARIO_OPTIONS,
  analyzeBoxingStrengthBalance,
  computeMultiFactorReadinessAndPlan,
  detectStrengthPlateaus,
  evaluateMultiFactorGoal,
} from '../../utils/smartCoachEngine';
import { formatBgNumericDate, shiftDateKey } from '../../utils/fitnessMath';
import { TrainingGoalSwitcher } from '../TrainingGoalSwitcher';

interface SmartCoachReadinessHubProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal: TrainingGoalPhase;
  subPriorities: CoachSubPriority[];
  todayKey: string;
  onChangeTrainingGoal: (nextGoal: TrainingGoalPhase) => Promise<void>;
  onChangeSubPriorities: (nextSubPriorities: CoachSubPriority[]) => Promise<void>;
}

export function SmartCoachReadinessHub({
  hevyWorkouts,
  dailyLogs,
  profile,
  customExerciseMappings,
  trainingGoal,
  subPriorities,
  todayKey,
  onChangeTrainingGoal,
  onChangeSubPriorities,
}: SmartCoachReadinessHubProps) {
  const yesterdayKey = useMemo(() => shiftDateKey(todayKey, -1), [todayKey]);
  const [scenarioOverride, setScenarioOverride] = useState<TodayScenarioId | null>(
    null,
  );
  const [savingSubPriorities, setSavingSubPriorities] = useState(false);

  const boxingBalance = useMemo(
    () =>
      analyzeBoxingStrengthBalance({
        hevyWorkouts,
        dailyLogs,
        todayKey,
        customExerciseMappings,
      }),
    [hevyWorkouts, dailyLogs, todayKey, customExerciseMappings],
  );

  const goalEvaluation = useMemo(
    () =>
      evaluateMultiFactorGoal({
        goal: trainingGoal,
        subPriorities,
        hevyWorkouts,
        dailyLogs,
        profile,
        todayKey,
      }),
    [trainingGoal, subPriorities, hevyWorkouts, dailyLogs, profile, todayKey],
  );

  const dailyPlan = useMemo(
    () =>
      computeMultiFactorReadinessAndPlan({
        hevyWorkouts,
        dailyLogs,
        profile,
        goal: trainingGoal,
        subPriorities,
        todayKey,
        scenarioOverride,
        goalEvaluation,
        boxingBalance,
      }),
    [
      hevyWorkouts,
      dailyLogs,
      profile,
      trainingGoal,
      subPriorities,
      todayKey,
      scenarioOverride,
      goalEvaluation,
      boxingBalance,
    ],
  );

  const plateaus = useMemo(
    () =>
      detectStrengthPlateaus({
        hevyWorkouts,
        dailyLogs,
        profile,
        todayKey,
      }),
    [hevyWorkouts, dailyLogs, profile, todayKey],
  );

  async function handleToggleSubPriority(id: CoachSubPriority) {
    const exists = subPriorities.includes(id);
    const next = exists
      ? subPriorities.filter((item) => item !== id)
      : [...subPriorities, id];
    setSavingSubPriorities(true);
    try {
      await onChangeSubPriorities(next);
    } finally {
      setSavingSubPriorities(false);
    }
  }

  const gaugeRadius = 46;
  const gaugeCirc = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCirc - (dailyPlan.readinessScore / 100) * gaugeCirc;
  const gaugeColor =
    dailyPlan.readinessTier === 'progressive'
      ? '#10B981'
      : dailyPlan.readinessTier === 'standard'
        ? '#38BDF8'
        : '#F59E0B';

  const goalToneClass =
    goalEvaluation.statusTone === 'positive'
      ? 'border-emerald-500/30 text-emerald-400'
      : goalEvaluation.statusTone === 'alert'
        ? 'border-amber-500/40 text-amber-300'
        : goalEvaluation.statusTone === 'caution'
          ? 'border-amber-500/30 text-amber-300'
          : 'border-white/10 text-slate-200';

  return (
    <div className="space-y-6">
      {/* 1. Гъвкави цели и множествени под-приоритети + многофакторна оценка */}
      <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5 space-y-4">
        <TrainingGoalSwitcher
          value={trainingGoal}
          onChange={onChangeTrainingGoal}
        />

        {/* Кликаеми под-приоритети (множествен избор, записвани в userSettings.subPriorities) */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold text-slate-300">
              Допълнителни под-приоритети (можеш да избереш няколко едновременно)
            </div>
            {savingSubPriorities && (
              <span className="text-[11px] text-slate-400">Записване...</span>
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {COACH_SUB_PRIORITY_OPTIONS.map((opt) => {
              const active = subPriorities.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`sub-priority-${opt.id}`}
                  aria-pressed={active}
                  onClick={() => handleToggleSubPriority(opt.id)}
                  title={opt.description}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                    active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/20 text-white font-semibold'
                      : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  <span aria-hidden="true">{opt.emoji}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Многофакторна оценка на активната цел */}
        <div
          data-testid="multifactor-goal-evaluation"
          className={`border-t border-white/10 pt-4`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-bold ${goalToneClass.split(' ')[1]}`}>
                {goalEvaluation.statusLabel}
              </div>
              <h3 className="mt-1 font-display text-base font-bold text-white">
                {goalEvaluation.headline}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {goalEvaluation.explanation}
              </p>
              <p className="mt-2 text-xs font-medium text-slate-100">
                Хранителен курс: {goalEvaluation.calorieAction}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:w-[430px] shrink-0">
              {goalEvaluation.metrics.map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-white/8 bg-[#141B27] px-3 py-2"
                >
                  <div className="text-[10px] text-slate-400">{m.label}</div>
                  <div className="mt-0.5 font-mono text-xs font-bold tabular-nums text-white">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2. 5 бързи бутона „Ситуацията днес“ */}
      <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-bold text-white">
              Сценарий за ДНЕС ({formatBgNumericDate(todayKey)}) — мигновено преизчисляване
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Избери реалния си сценарий за ДНЕС — тренировката, целевото RPE, обемът и съветите се адаптират на база завършения вчерашен ден ({formatBgNumericDate(yesterdayKey)}) и последната нощ сън.
            </p>
          </div>
          {dailyPlan.autoPrAttackEligible && (
            <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-400">
              Авто-PR отключен: готовност {dailyPlan.readinessScore}% · {dailyPlan.cleanDaysStreak} чисти дни
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {TODAY_SCENARIO_OPTIONS.map((sc) => {
            const isActive = dailyPlan.activeScenario === sc.id;
            return (
              <button
                key={sc.id}
                type="button"
                data-testid={`today-scenario-${sc.id}`}
                aria-pressed={isActive}
                onClick={() => setScenarioOverride(sc.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'border-white/12 bg-[#141B27] text-slate-200 hover:border-white/25 hover:text-white'
                }`}
              >
                <span aria-hidden="true">{sc.emoji}</span>
                <span>{sc.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Многофакторен Индекс на готовност (0–100%) + Топ 3 насоки + План за днес */}
      <div
        data-testid="multifactor-readiness-panel"
        className="rounded-xl border border-white/10 bg-[#0F141F] p-5 space-y-5"
      >
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-center">
          {/* SVG Индекс на готовност */}
          <div className="flex items-center gap-4 lg:col-span-5">
            <svg
              width={112}
              height={112}
              viewBox="0 0 112 112"
              role="img"
              aria-label={`Индекс на готовност: ${dailyPlan.readinessScore}%`}
              className="shrink-0"
            >
              <circle
                cx={56}
                cy={56}
                r={gaugeRadius}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={9}
              />
              <circle
                cx={56}
                cy={56}
                r={gaugeRadius}
                fill="none"
                stroke={gaugeColor}
                strokeWidth={9}
                strokeLinecap="round"
                strokeDasharray={gaugeCirc}
                strokeDashoffset={gaugeOffset}
                transform="rotate(-90 56 56)"
              />
              <text
                x={56}
                y={55}
                textAnchor="middle"
                fill="#FFFFFF"
                fontSize={24}
                fontWeight={800}
                className="font-mono tabular-nums"
              >
                {dailyPlan.readinessScore}%
              </text>
              <text
                x={56}
                y={72}
                textAnchor="middle"
                fill="#94A3B8"
                fontSize={10}
              >
                готовност
              </text>
            </svg>

            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold tabular-nums text-[var(--accent-text)]">
                Готовност за ДНЕС ({formatBgNumericDate(todayKey)}) · {dailyPlan.targetRpeText}
              </div>
              <h3 className="mt-0.5 font-display text-base font-bold text-white">
                {dailyPlan.readinessTierLabel}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">
                {dailyPlan.prescriptionSummary}
              </p>
            </div>
          </div>

          {/* Биометрични фактори */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:col-span-7">
            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[10px] text-slate-400">Сън (посл. / 3-дн.)</div>
              <div
                className={`mt-1 font-mono text-xs font-bold tabular-nums ${
                  dailyPlan.has3DaySleepDeficit ? 'text-rose-400' : 'text-white'
                }`}
              >
                {dailyPlan.lastNightSleepHours !== null
                  ? `${dailyPlan.lastNightSleepHours.toFixed(1)} ч`
                  : '—'}
                {dailyPlan.avgSleep3d !== null
                  ? ` / ${dailyPlan.avgSleep3d.toFixed(1)} ч`
                  : ''}
              </div>
              {dailyPlan.has3DaySleepDeficit && (
                <div className="mt-0.5 text-[10px] text-rose-400">Дефицит &lt; 6.5 ч.</div>
              )}
            </div>

            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[10px] text-slate-400">RHR / HRV (30-дн.)</div>
              <div className="mt-1 font-mono text-xs font-bold tabular-nums text-white">
                {dailyPlan.rhrDeltaFrom30d !== null
                  ? `${dailyPlan.rhrDeltaFrom30d >= 0 ? '+' : ''}${dailyPlan.rhrDeltaFrom30d.toFixed(1)} bpm`
                  : '—'}
                {dailyPlan.hrvPctFrom30d !== null
                  ? ` · ${dailyPlan.hrvPctFrom30d >= 0 ? '+' : ''}${dailyPlan.hrvPctFrom30d.toFixed(0)}%`
                  : ''}
              </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[10px] text-slate-400">ACWR · Тежки дни</div>
              <div className="mt-1 font-mono text-xs font-bold tabular-nums text-white">
                {dailyPlan.acwr !== null ? dailyPlan.acwr.toFixed(2) : '—'} ·{' '}
                {dailyPlan.consecutiveHeavyDays} поредни
              </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[10px] text-slate-400">
                Вчера ({formatBgNumericDate(yesterdayKey)}) протеин / kcal
              </div>
              <div className="mt-1 font-mono text-xs font-bold tabular-nums text-white">
                {dailyPlan.yesterdayProteinGPerKg !== null
                  ? `${dailyPlan.yesterdayProteinGPerKg.toFixed(1)} g/kg`
                  : '—'}
                {dailyPlan.yesterdayCalories !== null
                  ? ` · ${dailyPlan.yesterdayCalories}`
                  : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Топ 3 насоки за ДНЕС */}
        <div className="border-t border-white/10 pt-4">
          <div className="text-xs font-semibold text-slate-300">
            Топ 3 насоки за ДНЕС ({formatBgNumericDate(todayKey)}) — тренировка, хранене и възстановяване
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {dailyPlan.top3Guidance.map((item) => (
              <div
                key={item.category}
                className="rounded-lg border border-white/10 bg-[#141B27] p-3.5"
              >
                <div className="text-[11px] font-semibold text-[var(--accent-text)]">
                  {item.category}
                </div>
                <div className="mt-1 text-xs font-bold text-white">
                  {item.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Конкретни препоръки за упражнения за ДНЕС */}
        <div className="border-t border-white/10 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-white">
              {dailyPlan.scenarioHeadline} · План за ДНЕС ({formatBgNumericDate(todayKey)})
            </h4>
            {dailyPlan.activeScenario === 'pr_attack' &&
              dailyPlan.prTargetCandidate && (
                <span className="font-mono text-xs font-semibold tabular-nums text-emerald-400">
                  Цел: {dailyPlan.prTargetCandidate.targetText}
                </span>
              )}
          </div>

          <div className="mt-3 divide-y divide-white/[0.06] rounded-lg border border-white/10 bg-[#141B27]">
            {dailyPlan.recommendedExercises.map((ex, idx) => (
              <div
                key={`${ex.title}-${idx}`}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">
                    {idx + 1}. {ex.title}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {ex.note}
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs tabular-nums shrink-0">
                  <span className="font-semibold text-slate-100">{ex.setsReps}</span>
                  <span className="text-slate-400">{ex.rpe}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Детектор на застой (Plateau Buster) + Панел „🥊 Бокс + Сила“ */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Plateau Buster */}
        <div
          data-testid="plateau-buster-panel"
          className="rounded-xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-7"
        >
          <div className="border-b border-white/10 pb-3">
            <h3 className="font-display text-base font-bold text-white">
              Детектор на застой (Plateau Buster)
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Анализира последните 5 сесии за всяко често силово упражнение в Hevy (без бокс) и засича липса на ръст в e1RM и макс. тежест през последните 3 сесии.
            </p>
          </div>

          {plateaus.length === 0 ? (
            <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-950/15 p-4 text-xs text-emerald-300">
              Няма засечен застой в редовните ти силови упражнения — прогресията в e1RM и работните тежести върви чисто.
            </div>
          ) : (
            <div className="mt-3 divide-y divide-white/[0.06]">
              {plateaus.map((item) => (
                <div key={item.exerciseTitle} className="py-3.5 first:pt-2 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm font-bold text-white">
                      {item.exerciseTitle}
                    </div>
                    <div className="font-mono text-xs tabular-nums text-amber-300">
                      Посл. 3 e1RM: {item.last3E1RMs.join(' → ')} kg
                    </div>
                  </div>
                  <div className="mt-1 text-xs font-medium text-rose-300">
                    Вероятна причина: {item.probableCauseLabel}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {item.probableCauseDetail}
                  </p>
                  <p className="mt-1.5 text-xs font-medium text-slate-200">
                    Ход за пробив: {item.breakthroughAction}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Панел „🥊 Бокс + Сила“ и защита на раменете */}
        <div
          data-testid="boxing-strength-balance-panel"
          className={`rounded-xl border bg-[#0F141F] p-5 lg:col-span-5 ${
            boxingBalance.isImbalanced ? 'border-amber-500/40' : 'border-white/10'
          }`}
        >
          <div className="border-b border-white/10 pb-3">
            <h3 className="font-display text-base font-bold text-white">
              🥊 Бокс + Сила · Защита на раменете
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Седмично съотношение бутащи серии (+ автоматични 4–8 серии на боксова сесия по времетраене) спрямо дърпащи серии.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 font-mono tabular-nums">
            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[11px] font-sans text-slate-400">
                Бутащи + Бокс (7 д.)
              </div>
              <div className="mt-1 text-lg font-bold text-white">
                {boxingBalance.totalPushSets} сер.
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Сила {boxingBalance.strengthPushSets} + Бокс{' '}
                {boxingBalance.boxingPushEquivalentSets} ({boxingBalance.boxingSessionsCount} сес.)
              </div>
            </div>

            <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
              <div className="text-[11px] font-sans text-slate-400">
                Дърпащи серии (7 д.)
              </div>
              <div className="mt-1 text-lg font-bold text-emerald-400">
                {boxingBalance.totalPullSets} сер.
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                Гръб · Задни рамене · Бицепс
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div
              className={`text-xs font-bold ${
                boxingBalance.isImbalanced ? 'text-amber-300' : 'text-emerald-400'
              }`}
            >
              {boxingBalance.statusHeadline}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {boxingBalance.recommendation}
            </p>
          </div>

          {boxingBalance.isImbalanced && (
            <div className="mt-3.5 border-t border-white/10 pt-3">
              <div className="text-[11px] font-semibold text-amber-300">
                Приоритетни дърпащи упражнения днес:
              </div>
              <ul className="mt-1.5 space-y-1 text-xs text-slate-200">
                {boxingBalance.priorityPullExercises.map((ex) => (
                  <li key={ex}>• {ex}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
