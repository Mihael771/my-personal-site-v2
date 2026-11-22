import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import type {
  DayLog,
  MuscleAllocationConfig,
  MuscleGainMode,
  MuscleId,
  RecoveryMode,
} from '../types/fitness';
import {
  DEFAULT_SLEEP_HOURS,
  MUSCLE_GROUPS,
  calculateDayGainsBreakdown,
  clampDailyMuscleGainGrams,
  clampHuaweiSleepScore,
  clampManualDayGainGrams,
  clampManualRecoveryPercent,
  formatBgDate,
  formatBgMonthYear,
  formatGrams,
  getMonthGrid,
  getRecoveryOptionsFromLog,
  getSleepRecoveryInfo,
  hasAnyBodyMeasurement,
  roundGrams,
  sanitizeManualMuscleGramsMap,
  sanitizeMeasurementValue,
  shiftDateKey,
} from '../utils/fitnessMath';

interface PastDayCalendarPanelProps {
  logs: Record<string, DayLog>;
  todayKey: string;
  defaultDailyBaseGainGrams?: number;
  accrueOnRestDays?: boolean;
  allocationConfig?: MuscleAllocationConfig;
  selectedDateOverride?: string | null;
  onSelectedDateOverrideConsumed?: () => void;
  onSaveDayLog: (log: DayLog, fillEmptyToToday?: boolean) => void;
  onDeleteDayLog: (dateKey: string) => void;
  onInspectInComparison: (dateKey: string) => void;
}

const WEEKDAYS_BG = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

export function PastDayCalendarPanel({
  logs,
  todayKey,
  defaultDailyBaseGainGrams,
  accrueOnRestDays,
  allocationConfig,
  selectedDateOverride,
  onSelectedDateOverrideConsumed,
  onSaveDayLog,
  onDeleteDayLog,
  onInspectInComparison,
}: PastDayCalendarPanelProps) {
  const yesterdayKey = shiftDateKey(todayKey, -1);
  const [selectedDate, setSelectedDate] = useState<string>(yesterdayKey);
  const [fillEmptyToToday, setFillEmptyToToday] = useState<boolean>(false);

  const [initialYear, initialMonth] = selectedDate.split('-').map(Number);
  const [viewYear, setViewYear] = useState<number>(initialYear);
  const [viewMonth, setViewMonth] = useState<number>(initialMonth - 1);

  const existingLog = logs[selectedDate];
  const [draftSleep, setDraftSleep] = useState<number>(
    existingLog ? existingLog.sleepHours : DEFAULT_SLEEP_HOURS,
  );
  const [draftHuaweiScore, setDraftHuaweiScore] = useState<string>(
    existingLog?.huaweiSleepScore !== undefined ? String(existingLog.huaweiSleepScore) : '',
  );
  const [draftRecoveryMode, setDraftRecoveryMode] = useState<RecoveryMode>(
    existingLog?.recoveryMode === 'manual' ? 'manual' : 'auto',
  );
  const [draftManualRecovery, setDraftManualRecovery] = useState<string>(
    existingLog?.manualRecoveryPercent !== undefined
      ? String(existingLog.manualRecoveryPercent)
      : '',
  );
  const [draftGainMode, setDraftGainMode] = useState<MuscleGainMode>(
    existingLog?.muscleGainMode === 'manual' ? 'manual' : 'auto',
  );
  const [draftBaseGainGrams, setDraftBaseGainGrams] = useState<string>(
    existingLog?.baseDailyGainGrams !== undefined
      ? String(existingLog.baseDailyGainGrams)
      : '',
  );
  const [draftManualGainGrams, setDraftManualGainGrams] = useState<string>(
    existingLog?.manualGainGrams !== undefined ? String(existingLog.manualGainGrams) : '',
  );
  const [draftUsePerMuscleGrams, setDraftUsePerMuscleGrams] = useState<boolean>(
    Boolean(
      existingLog?.muscleGainMode === 'manual' &&
        existingLog?.manualMuscleGrams &&
        Object.keys(existingLog.manualMuscleGrams).length > 0,
    ),
  );
  const [draftManualMuscleGrams, setDraftManualMuscleGrams] = useState<
    Partial<Record<MuscleId, string>>
  >(() => {
    const out: Partial<Record<MuscleId, string>> = {};
    if (existingLog?.manualMuscleGrams) {
      for (const m of MUSCLE_GROUPS) {
        const v = existingLog.manualMuscleGrams[m.id];
        if (v !== undefined) out[m.id] = String(v);
      }
    }
    return out;
  });
  const [draftMuscles, setDraftMuscles] = useState<MuscleId[]>(
    existingLog ? existingLog.muscles : [],
  );
  const [draftWeight, setDraftWeight] = useState<string>(
    existingLog?.weightKg !== undefined ? String(existingLog.weightKg) : '',
  );
  const [draftMuscleKg, setDraftMuscleKg] = useState<string>(
    existingLog?.muscleMassKg !== undefined ? String(existingLog.muscleMassKg) : '',
  );
  const [draftFatPct, setDraftFatPct] = useState<string>(
    existingLog?.bodyFatPercent !== undefined ? String(existingLog.bodyFatPercent) : '',
  );
  const [draftFatKg, setDraftFatKg] = useState<string>(
    existingLog?.bodyFatKg !== undefined ? String(existingLog.bodyFatKg) : '',
  );
  const [savedFeedback, setSavedFeedback] = useState<string | null>(null);

  useEffect(() => {
    const log = logs[selectedDate];
    setDraftSleep(log ? log.sleepHours : DEFAULT_SLEEP_HOURS);
    setDraftHuaweiScore(
      log?.huaweiSleepScore !== undefined ? String(log.huaweiSleepScore) : '',
    );
    setDraftRecoveryMode(log?.recoveryMode === 'manual' ? 'manual' : 'auto');
    setDraftManualRecovery(
      log?.manualRecoveryPercent !== undefined ? String(log.manualRecoveryPercent) : '',
    );
    setDraftGainMode(log?.muscleGainMode === 'manual' ? 'manual' : 'auto');
    setDraftBaseGainGrams(
      log?.baseDailyGainGrams !== undefined ? String(log.baseDailyGainGrams) : '',
    );
    setDraftManualGainGrams(
      log?.manualGainGrams !== undefined ? String(log.manualGainGrams) : '',
    );
    const hasPerMuscle = Boolean(
      log?.muscleGainMode === 'manual' &&
        log?.manualMuscleGrams &&
        Object.keys(log.manualMuscleGrams).length > 0,
    );
    setDraftUsePerMuscleGrams(hasPerMuscle);
    const perMuscleStrings: Partial<Record<MuscleId, string>> = {};
    if (log?.manualMuscleGrams) {
      for (const m of MUSCLE_GROUPS) {
        const v = log.manualMuscleGrams[m.id];
        if (v !== undefined) perMuscleStrings[m.id] = String(v);
      }
    }
    setDraftManualMuscleGrams(perMuscleStrings);
    setDraftMuscles(log ? log.muscles : []);
    setDraftWeight(log?.weightKg !== undefined ? String(log.weightKg) : '');
    setDraftMuscleKg(log?.muscleMassKg !== undefined ? String(log.muscleMassKg) : '');
    setDraftFatPct(log?.bodyFatPercent !== undefined ? String(log.bodyFatPercent) : '');
    setDraftFatKg(log?.bodyFatKg !== undefined ? String(log.bodyFatKg) : '');
  }, [selectedDate, logs]);

  useEffect(() => {
    setSavedFeedback(null);
    setFillEmptyToToday(false);
  }, [selectedDate]);

  useEffect(() => {
    if (selectedDateOverride && selectedDateOverride <= todayKey) {
      setSelectedDate(selectedDateOverride);
      const [y, m] = selectedDateOverride.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
      onSelectedDateOverrideConsumed?.();
    }
  }, [selectedDateOverride, todayKey, onSelectedDateOverrideConsumed]);

  function handleSelectDate(dateKey: string) {
    setSelectedDate(dateKey);
    const [y, m] = dateKey.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m - 1);
  }

  function stepMonth(delta: number) {
    const dt = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(dt.getFullYear());
    setViewMonth(dt.getMonth());
  }

  function toggleDraftMuscle(muscleId: MuscleId) {
    setSavedFeedback(null);
    setDraftMuscles((prev) =>
      prev.includes(muscleId)
        ? prev.filter((id) => id !== muscleId)
        : [...prev, muscleId],
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = sanitizeMeasurementValue(draftWeight, 20, 400);
    const muscleMassKg = sanitizeMeasurementValue(draftMuscleKg, 5, 250);
    const bodyFatPercent = sanitizeMeasurementValue(draftFatPct, 2, 80);
    const bodyFatKg = sanitizeMeasurementValue(draftFatKg, 0.5, 250);
    const huaweiSleepScore = clampHuaweiSleepScore(draftHuaweiScore);
    const manualRecoveryPercent = clampManualRecoveryPercent(draftManualRecovery);
    const baseDailyGainGrams = clampDailyMuscleGainGrams(draftBaseGainGrams);
    const manualGainGrams = clampManualDayGainGrams(draftManualGainGrams);
    const cleanPerMuscle =
      draftGainMode === 'manual' && draftUsePerMuscleGrams
        ? sanitizeManualMuscleGramsMap(draftManualMuscleGrams)
        : undefined;
    const perMuscleSum = cleanPerMuscle
      ? roundGrams(
          Object.values(cleanPerMuscle).reduce((sum, v) => sum + (v ?? 0), 0),
        )
      : undefined;
    const effectiveManualMuscles = cleanPerMuscle
      ? Array.from(
          new Set([
            ...draftMuscles,
            ...MUSCLE_GROUPS.filter((m) => (cleanPerMuscle[m.id] ?? 0) > 0).map(
              (m) => m.id,
            ),
          ]),
        )
      : draftMuscles;

    onSaveDayLog(
      {
        date: selectedDate,
        sleepHours: draftSleep,
        recoveryMode: draftRecoveryMode,
        ...(huaweiSleepScore !== undefined ? { huaweiSleepScore } : {}),
        ...(draftRecoveryMode === 'manual' && manualRecoveryPercent !== undefined
          ? { manualRecoveryPercent }
          : {}),
        muscleGainMode: draftGainMode,
        ...(draftGainMode === 'auto' && baseDailyGainGrams !== undefined
          ? { baseDailyGainGrams }
          : {}),
        ...(draftGainMode === 'manual' && cleanPerMuscle
          ? { manualGainGrams: perMuscleSum, manualMuscleGrams: cleanPerMuscle }
          : draftGainMode === 'manual' && manualGainGrams !== undefined
            ? { manualGainGrams }
            : {}),
        trained: effectiveManualMuscles.length > 0 || (perMuscleSum ?? 0) > 0,
        muscles: effectiveManualMuscles,
        ...(weightKg !== undefined ? { weightKg } : {}),
        ...(muscleMassKg !== undefined ? { muscleMassKg } : {}),
        ...(bodyFatPercent !== undefined ? { bodyFatPercent } : {}),
        ...(bodyFatKg !== undefined ? { bodyFatKg } : {}),
      },
      selectedDate < todayKey ? fillEmptyToToday : false,
    );
    setSavedFeedback(
      fillEmptyToToday && selectedDate < todayKey
        ? `Записано за ${formatBgDate(selectedDate)} и попълнени празните дни до днес!`
        : `Записано за ${formatBgDate(selectedDate)}! Всички статистики са преизчислени.`,
    );
    setFillEmptyToToday(false);
  }

  const cells = getMonthGrid(viewYear, viewMonth);
  const draftPerMuscleClean =
    draftGainMode === 'manual' && draftUsePerMuscleGrams
      ? sanitizeManualMuscleGramsMap(draftManualMuscleGrams)
      : undefined;
  const draftEntry: DayLog = {
    date: selectedDate,
    sleepHours: draftSleep,
    recoveryMode: draftRecoveryMode,
    huaweiSleepScore: clampHuaweiSleepScore(draftHuaweiScore),
    manualRecoveryPercent: clampManualRecoveryPercent(draftManualRecovery),
    muscleGainMode: draftGainMode,
    baseDailyGainGrams: clampDailyMuscleGainGrams(draftBaseGainGrams),
    manualGainGrams: clampManualDayGainGrams(draftManualGainGrams),
    ...(draftPerMuscleClean ? { manualMuscleGrams: draftPerMuscleClean } : {}),
    muscles: draftMuscles,
  };
  const draftBreakdown = calculateDayGainsBreakdown(
    draftEntry,
    defaultDailyBaseGainGrams,
    accrueOnRestDays,
    allocationConfig,
  );
  const draftRecovery = draftBreakdown.recovery;
  const draftGain = draftBreakdown.totalGrams;

  return (
    <section
      id="calendar"
      aria-label="Добавяне на забравени дни и календар"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">
          Календар и забравени дни
        </h2>
        <p className="mt-1 text-sm text-slate-400">
          Избери минала дата от календара, въведи часовете сън и отбележи тренираните мускули. Сайтът преизчислява целия прогрес автоматично.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Месечен календар */}
        <div className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-white">
              {formatBgMonthYear(viewYear, viewMonth)}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepMonth(-1)}
                aria-label="Предишен месец"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#161D2B] text-slate-300 hover:border-white/25 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => stepMonth(1)}
                aria-label="Следващ месец"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#161D2B] text-slate-300 hover:border-white/25 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-medium text-slate-400 mb-2">
            {WEEKDAYS_BG.map((day) => (
              <div key={day} className="py-1">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => {
              const log = logs[cell.dateKey];
              const hasWorkout = Boolean(
                log &&
                  (log.muscles.length > 0 ||
                    (log.muscleGainMode === 'manual' && (log.manualGainGrams ?? 0) > 0)),
              );
              const hasMetrics = Boolean(log && hasAnyBodyMeasurement(log));
              const isFatiguedDay = Boolean(
                log &&
                  log.muscles.length > 0 &&
                  getSleepRecoveryInfo(log.sleepHours, getRecoveryOptionsFromLog(log)).isFatigued,
              );
              const isSelected = cell.dateKey === selectedDate;
              const isToday = cell.dateKey === todayKey;
              const isFuture = cell.dateKey > todayKey;

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  disabled={isFuture}
                  onClick={() => handleSelectDate(cell.dateKey)}
                  aria-label={`${formatBgDate(cell.dateKey)}${hasWorkout ? `, ${log.muscles.length} тренирани мускула` : ''}`}
                  aria-pressed={isSelected}
                  className={`relative flex h-11 flex-col items-center justify-center rounded-lg border font-mono text-xs tabular-nums transition-colors ${
                    isSelected
                      ? 'border-[var(--accent)] bg-[var(--accent)] font-bold text-[var(--accent-contrast)]'
                      : hasWorkout
                        ? isFatiguedDay
                          ? 'border-rose-500/45 bg-rose-950/35 text-rose-200 hover:border-rose-400'
                          : 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-white hover:border-[var(--accent)]'
                        : isToday
                          ? 'border-white/30 bg-[#171F2E] text-white'
                          : cell.inCurrentMonth
                            ? 'border-white/8 bg-[#131926] text-slate-300 hover:border-white/25 hover:text-white'
                            : 'border-transparent bg-transparent text-slate-600 hover:text-slate-400'
                  } disabled:cursor-not-allowed disabled:opacity-30`}
                >
                  <span>{cell.dayNumber}</span>
                  {(hasWorkout || hasMetrics) && !isSelected && (
                    <span
                      className={`mt-0.5 text-[9px] leading-none ${
                        isFatiguedDay ? 'text-rose-300' : 'text-[var(--accent-text)]'
                      }`}
                    >
                      {log?.muscles.length
                        ? `${log.muscles.length}м`
                        : hasWorkout
                          ? `+${formatGrams(log?.manualGainGrams ?? 0)}г`
                          : 'кг'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--accent-soft)] border border-[var(--accent-border)]" aria-hidden="true" />
              <span>Записана тренировка</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-rose-950/60 border border-rose-500/50" aria-hidden="true" />
              <span>Нисък сън (&lt; 6 ч)</span>
            </span>
          </div>
        </div>

        {/* Редактор за избраната дата */}
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
              <h3 className="font-display text-base font-bold text-white">
                Запис за {formatBgDate(selectedDate)}
              </h3>
            </div>
            {selectedDate < todayKey && (
              <button
                type="button"
                onClick={() => onInspectInComparison(selectedDate)}
                className="text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                Виж в лявото човече
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="calendar-date-input"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Дата
              </label>
              <input
                id="calendar-date-input"
                type="date"
                max={todayKey}
                value={selectedDate}
                onChange={(e) => {
                  if (e.target.value) handleSelectDate(e.target.value);
                }}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white"
              />
            </div>

            <div>
              <label
                htmlFor="calendar-sleep-input"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Сън през този ден (часове)
              </label>
              <input
                id="calendar-sleep-input"
                type="number"
                min={0}
                max={16}
                step="0.5"
                value={draftSleep}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  setDraftSleep(Number.isNaN(n) ? 0 : n);
                  setSavedFeedback(null);
                }}
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white"
              />
            </div>

            <div>
              <label
                htmlFor="calendar-huawei-score-input"
                className="mb-1.5 block text-xs font-medium text-slate-300"
              >
                Huawei GT 6 точки (0–100)
              </label>
              <input
                id="calendar-huawei-score-input"
                type="number"
                min={0}
                max={100}
                value={draftHuaweiScore}
                onChange={(e) => {
                  setDraftHuaweiScore(e.target.value);
                  setSavedFeedback(null);
                }}
                placeholder="напр. 88 (по избор)"
                className="h-10 w-full rounded-lg border border-white/15 bg-[#151C29] px-3 font-mono text-sm tabular-nums text-white placeholder:text-slate-500"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Възстановяване за деня
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Режим на възстановяване за деня"
                  value={draftRecoveryMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as RecoveryMode;
                    setDraftRecoveryMode(nextMode);
                    if (nextMode === 'manual' && !draftManualRecovery) {
                      setDraftManualRecovery(String(draftRecovery.percentage));
                    }
                    setSavedFeedback(null);
                  }}
                  className="h-10 flex-1 rounded-lg border border-white/15 bg-[#151C29] px-2.5 text-xs text-white"
                >
                  <option value="auto">Автоматично (GT 6 / ч)</option>
                  <option value="manual">Ръчно (%)</option>
                </select>
                {draftRecoveryMode === 'manual' && (
                  <input
                    aria-label="Ръчно възстановяване в проценти"
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    value={draftManualRecovery}
                    onChange={(e) => {
                      setDraftManualRecovery(e.target.value);
                      setSavedFeedback(null);
                    }}
                    className="h-10 w-20 rounded-lg border border-[var(--accent)] bg-[#151C29] px-2.5 font-mono text-sm tabular-nums text-white"
                  />
                )}
              </div>
            </div>

            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Мускулен прираст за деня (г)
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Режим на мускулен прираст за деня"
                  value={draftGainMode}
                  onChange={(e) => {
                    const nextMode = e.target.value as MuscleGainMode;
                    setDraftGainMode(nextMode);
                    if (nextMode === 'manual' && !draftManualGainGrams) {
                      setDraftManualGainGrams(String(draftGain > 0 ? draftGain : defaultDailyBaseGainGrams ?? 15));
                    }
                    setSavedFeedback(null);
                  }}
                  className="h-10 min-w-[200px] flex-1 rounded-lg border border-white/15 bg-[#151C29] px-2.5 text-xs text-white"
                >
                  <option value="auto">Автоматично (влияе се от сън/възст.)</option>
                  <option value="manual">Ръчно (точни грамове за деня)</option>
                </select>

                {draftGainMode === 'auto' ? (
                  <input
                    aria-label="Базови грамове на ден при 100% възстановяване"
                    type="number"
                    min={0.5}
                    max={500}
                    step="0.5"
                    value={draftBaseGainGrams}
                    onChange={(e) => {
                      setDraftBaseGainGrams(e.target.value);
                      setSavedFeedback(null);
                    }}
                    placeholder={
                      defaultDailyBaseGainGrams !== undefined
                        ? `По норма (${formatGrams(defaultDailyBaseGainGrams)} г)`
                        : 'Авто по мускули'
                    }
                    className="h-10 w-44 rounded-lg border border-white/15 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white placeholder:font-sans placeholder:text-slate-500"
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {!draftUsePerMuscleGrams && (
                      <div className="flex items-center gap-1.5">
                        <input
                          aria-label="Ръчно въведени грамове за деня"
                          type="number"
                          min={0}
                          max={50000}
                          step="0.5"
                          value={draftManualGainGrams}
                          onChange={(e) => {
                            setDraftManualGainGrams(e.target.value);
                            setSavedFeedback(null);
                          }}
                          placeholder="напр. 15"
                          className="h-10 w-24 rounded-lg border border-[var(--accent)] bg-[#151C29] px-2.5 font-mono text-sm tabular-nums text-white placeholder:text-slate-500"
                        />
                        <span className="font-mono text-xs text-slate-300">г</span>
                      </div>
                    )}
                    <button
                      type="button"
                      data-testid="calendar-toggle-per-muscle-grams"
                      onClick={() => {
                        const next = !draftUsePerMuscleGrams;
                        setDraftUsePerMuscleGrams(next);
                        if (next) {
                          const seeded: Partial<Record<MuscleId, string>> = {};
                          for (const m of MUSCLE_GROUPS) {
                            seeded[m.id] =
                              draftManualMuscleGrams[m.id] ??
                              String(draftBreakdown.byMuscle[m.id] ?? 0);
                          }
                          setDraftManualMuscleGrams(seeded);
                        }
                        setSavedFeedback(null);
                      }}
                      className={`h-10 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                        draftUsePerMuscleGrams
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'border-white/15 bg-[#151C29] text-slate-300 hover:border-white/30 hover:text-white'
                      }`}
                    >
                      {draftUsePerMuscleGrams ? 'Общ грамаж за деня' : 'Точно по мускули (г)'}
                    </button>
                  </div>
                )}
              </div>

              {draftGainMode === 'manual' && draftUsePerMuscleGrams && (
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-[#131926] p-3 sm:grid-cols-4">
                  {MUSCLE_GROUPS.map((m) => (
                    <div key={m.id}>
                      <label
                        htmlFor={`calendar-per-muscle-${m.id}`}
                        className="mb-1 block text-[11px] text-slate-400"
                      >
                        {m.label} (г)
                      </label>
                      <input
                        id={`calendar-per-muscle-${m.id}`}
                        type="number"
                        min={0}
                        max={50000}
                        step="0.5"
                        value={draftManualMuscleGrams[m.id] ?? '0'}
                        onChange={(e) => {
                          setDraftManualMuscleGrams((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }));
                          setSavedFeedback(null);
                        }}
                        className="h-8 w-full rounded-lg border border-white/15 bg-[#151C29] px-2 font-mono text-xs tabular-nums text-white"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Кои мускули натовари?
              </span>
              <span
                className={`font-mono tabular-nums ${
                  draftRecovery.isFatigued ? 'text-rose-300' : 'text-slate-400'
                }`}
              >
                Възстановяване: {draftRecovery.percentage}% · +{formatGrams(draftGain)} г
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MUSCLE_GROUPS.map((m) => {
                const active = draftMuscles.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    data-testid={`calendar-muscle-${m.id}`}
                    onClick={() => toggleDraftMuscle(m.id)}
                    aria-pressed={active}
                    className={`flex h-10 items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors ${
                      active
                        ? draftRecovery.isFatigued
                          ? 'border-rose-400/50 bg-rose-600/80 text-white'
                          : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-white/12 bg-[#151C29] text-slate-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    <span>{m.label}</span>
                    {active && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">
                Телесни измервания за деня (по избор)
              </span>
              <span className="text-slate-500">попълни само каквото знаеш</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="calendar-weight-input"
                  className="mb-1 block text-[11px] text-slate-400"
                >
                  Тегло (кг)
                </label>
                <input
                  id="calendar-weight-input"
                  type="number"
                  min={20}
                  max={400}
                  step="0.1"
                  value={draftWeight}
                  onChange={(e) => {
                    setDraftWeight(e.target.value);
                    setSavedFeedback(null);
                  }}
                  placeholder="—"
                  className="h-9 w-full rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white placeholder:text-slate-600"
                />
              </div>

              <div>
                <label
                  htmlFor="calendar-muscle-kg-input"
                  className="mb-1 block text-[11px] text-slate-400"
                >
                  Мускулна маса (кг)
                </label>
                <input
                  id="calendar-muscle-kg-input"
                  type="number"
                  min={5}
                  max={250}
                  step="0.1"
                  value={draftMuscleKg}
                  onChange={(e) => {
                    setDraftMuscleKg(e.target.value);
                    setSavedFeedback(null);
                  }}
                  placeholder="—"
                  className="h-9 w-full rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white placeholder:text-slate-600"
                />
              </div>

              <div>
                <label
                  htmlFor="calendar-fat-pct-input"
                  className="mb-1 block text-[11px] text-slate-400"
                >
                  Подкожни мазнини (%)
                </label>
                <input
                  id="calendar-fat-pct-input"
                  type="number"
                  min={2}
                  max={80}
                  step="0.1"
                  value={draftFatPct}
                  onChange={(e) => {
                    setDraftFatPct(e.target.value);
                    setSavedFeedback(null);
                  }}
                  placeholder="—"
                  className="h-9 w-full rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white placeholder:text-slate-600"
                />
              </div>

              <div>
                <label
                  htmlFor="calendar-fat-kg-input"
                  className="mb-1 block text-[11px] text-slate-400"
                >
                  Подкожни мазнини (кг)
                </label>
                <input
                  id="calendar-fat-kg-input"
                  type="number"
                  min={0.5}
                  max={250}
                  step="0.1"
                  value={draftFatKg}
                  onChange={(e) => {
                    setDraftFatKg(e.target.value);
                    setSavedFeedback(null);
                  }}
                  placeholder="—"
                  className="h-9 w-full rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs tabular-nums text-white placeholder:text-slate-600"
                />
              </div>
            </div>
          </div>

          {selectedDate < todayKey && (
            <label className="mt-5 flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-[#131926] px-3 py-2 text-xs text-slate-300 hover:border-white/20 hover:text-white">
              <input
                type="checkbox"
                data-testid="calendar-fill-to-today-checkbox"
                checked={fillEmptyToToday}
                onChange={(e) => setFillEmptyToToday(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-white/25 bg-[#151C29] accent-[var(--accent)]"
              />
              <span>
                Попълни автоматично и всички празни дни от тази дата до днес
                {draftGain > 0 ? ` (+${formatGrams(draftGain)} г/ден)` : ''}
              </span>
            </label>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="submit"
              data-testid="calendar-save-btn"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-6 text-sm font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)]"
            >
              Запази
            </button>

            {existingLog && (
              <button
                type="button"
                onClick={() => {
                  onDeleteDayLog(selectedDate);
                  setSavedFeedback(`Записът за ${formatBgDate(selectedDate)} беше премахнат.`);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/12 bg-[#151C29] px-3.5 text-xs font-medium text-slate-300 hover:border-rose-500/40 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Изчисти деня</span>
              </button>
            )}
          </div>

          {savedFeedback && (
            <p
              role="status"
              data-testid="calendar-save-feedback"
              className="mt-3 text-xs font-medium text-emerald-400"
            >
              {savedFeedback}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
