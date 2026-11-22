import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleDashed,
  Copy,
  Dumbbell,
  ExternalLink,
  Flame,
  Footprints,
  HeartPulse,
  Moon,
  Plus,
  Scale,
  StickyNote,
  Sun,
  Trash2,
  Upload,
  Utensils,
  Watch,
} from 'lucide-react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  TrainingGoalPhase,
} from '../types/fitness';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  DEFAULT_HABIT_ITEMS,
  DEFAULT_HARMFUL_HABIT_ITEMS,
  buildLast7CompletedDaysOverview,
  computeDailyEnergySummary,
  computeHabitStreak,
  computeProteinPerKg,
  extractPreviousDayNutritionAndHabits,
  getLatestDailyWeight,
  mergeUnifiedDailyLog,
  sanitizeDailyStepsGoal,
} from '../utils/dailyLogs';
import {
  formatBgNumericDate,
  formatNumberBg,
  formatSelectedDateBadge,
  getLocalDateKey,
  shiftDateKey,
} from '../utils/fitnessMath';
import { classifyHabitPolarity } from '../utils/habitBodyImpact';
import {
  mergeHevyWorkoutsWithoutDuplicates,
  parseHevyCsv,
} from '../utils/hevyParser';
import {
  TRAINING_GOAL_META_MAP,
  WORKOUT_ENVIRONMENT_META_MAP,
  classifyWorkoutEnvironment,
  getNextWorkoutEnvironment,
} from '../utils/hiddenProgressAndEnvironment';
import {
  fetchIntervalsWatchDayData,
  mergeWatchDataIntoDailyLog,
} from '../services/intervalsWatchSync';
import { isLocalServerHost } from '../services/storageService';
import {
  TRIBULUS_HABIT_NAME,
  hasTribulusInLog,
  isTribulusHabit,
} from '../utils/testosteroneAndHabits';
import { DailyActivityEnergyCharts } from './DailyActivityEnergyCharts';
import { TrainingGoalSwitcher } from './TrainingGoalSwitcher';

interface DailyCheckInPageProps {
  dailyLogs: DailyBiometricLog[];
  habitItems: string[];
  hevyWorkouts: HevyWorkout[];
  profileWeightKg: number | '';
  profileHeightCm: number | '';
  dailyStepsGoal: number;
  trainingGoal: TrainingGoalPhase;
  intervalsApiKey?: string;
  onChangeTrainingGoal: (nextGoal: TrainingGoalPhase) => Promise<void>;
  onSaveIntervalsApiKey?: (nextKey: string) => Promise<void>;
  onSaveDailyLog: (entry: DailyBiometricLog) => Promise<void>;
  onDeleteDailyLog: (dateKey: string) => Promise<void>;
  onUpdateHabitItems: (nextHabits: string[]) => Promise<void>;
  onUpdateStepsGoal: (nextGoal: number) => Promise<void>;
  onSaveHevyWorkouts: (nextWorkouts: HevyWorkout[]) => Promise<void>;
}

const FRESHNESS_LABELS: Record<number, string> = {
  1: 'Изтощен',
  2: 'Уморен',
  3: 'Средно',
  4: 'Свеж',
  5: 'Отлично',
};

function toInputStr(val: number | undefined): string {
  return val !== undefined ? String(val) : '';
}

function parseNumInput(raw: string): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

function formatShortDayMonth(ymd: string): string {
  const parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return `${parts[2]}.${parts[1]}`;
}

export function DailyCheckInPage({
  dailyLogs,
  habitItems,
  hevyWorkouts,
  profileWeightKg,
  profileHeightCm,
  dailyStepsGoal,
  trainingGoal,
  intervalsApiKey = '',
  onChangeTrainingGoal,
  onSaveIntervalsApiKey,
  onSaveDailyLog,
  onDeleteDailyLog,
  onUpdateHabitItems,
  onUpdateStepsGoal,
  onSaveHevyWorkouts,
}: DailyCheckInPageProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const yesterdayKey = useMemo(() => shiftDateKey(todayKey, -1), [todayKey]);

  const formRef = useRef<HTMLFormElement | null>(null);
  const hevyFileInputRef = useRef<HTMLInputElement | null>(null);

  const activeHabits = habitItems.length > 0 ? habitItems : DEFAULT_HABIT_ITEMS;
  const effectiveStepsGoal =
    Number.isFinite(dailyStepsGoal) && dailyStepsGoal >= 1000
      ? Math.round(dailyStepsGoal)
      : DEFAULT_DAILY_STEPS_GOAL;
  const proteinThresholdGPerKg =
    TRAINING_GOAL_META_MAP[trainingGoal].proteinThresholdGPerKg;

  // Split configured habits into beneficial checkboxes vs harmful toggle buttons
  const beneficialHabitList = useMemo(() => {
    const list = activeHabits.filter(
      (h) => classifyHabitPolarity(h) === 'beneficial' && !isTribulusHabit(h),
    );
    return list.length > 0 ? list : DEFAULT_HABIT_ITEMS;
  }, [activeHabits]);

  const harmfulHabitList = useMemo(() => {
    const merged: string[] = [];
    const seen = new Set<string>();
    const addUnique = (name: string) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      merged.push(name.trim());
    };
    for (const h of DEFAULT_HARMFUL_HABIT_ITEMS) addUnique(h);
    for (const h of activeHabits) {
      if (classifyHabitPolarity(h) === 'harmful') addUnique(h);
    }
    return merged;
  }, [activeHabits]);

  // Default date on every open is ALWAYS YESTERDAY
  const [selectedDate, setSelectedDate] = useState<string>(yesterdayKey);

  // Unified form fields (all optional)
  const [weightStr, setWeightStr] = useState('');
  const [sleepHoursStr, setSleepHoursStr] = useState('');
  const [sleepQuality, setSleepQuality] = useState<number | undefined>(undefined);
  const [restingHrStr, setRestingHrStr] = useState('');
  const [hrvStr, setHrvStr] = useState('');
  const [caloriesStr, setCaloriesStr] = useState('');
  const [proteinStr, setProteinStr] = useState('');
  const [cardioKmStr, setCardioKmStr] = useState('');
  const [cardioMinStr, setCardioMinStr] = useState('');
  const [cardioElevationStr, setCardioElevationStr] = useState('');
  const [stepsStr, setStepsStr] = useState('');
  const [activeCaloriesStr, setActiveCaloriesStr] = useState('');
  const [restingCaloriesStr, setRestingCaloriesStr] = useState('');
  const [completedHabits, setCompletedHabits] = useState<string[]>([]);
  const [notesStr, setNotesStr] = useState('');
  const [clearedFields, setClearedFields] = useState<Set<string>>(() => new Set());

  const [backupStatus, setBackupStatus] = useState<{
    count: number;
    limit: number;
    latestDate: string | null;
  } | null>(null);

  const [showWatchSettings, setShowWatchSettings] = useState(false);
  const [watchKeyDraft, setWatchKeyDraft] = useState(intervalsApiKey);
  const [savingWatchKey, setSavingWatchKey] = useState(false);
  const [watchSyncing, setWatchSyncing] = useState(false);
  const [watchNotice, setWatchNotice] = useState<string | null>(null);
  const attemptedWatchSyncDatesRef = useRef<Set<string>>(new Set());

  const [editingStepsGoal, setEditingStepsGoal] = useState(false);
  const [stepsGoalDraft, setStepsGoalDraft] = useState(String(effectiveStepsGoal));

  const [newHabitInput, setNewHabitInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [importingHevy, setImportingHevy] = useState(false);
  const [hevyFeedback, setHevyFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setStepsGoalDraft(String(effectiveStepsGoal));
  }, [effectiveStepsGoal]);

  useEffect(() => {
    setWatchKeyDraft(intervalsApiKey);
  }, [intervalsApiKey]);

  const existingEntry = useMemo(
    () => dailyLogs.find((d) => d.date === selectedDate) ?? null,
    [dailyLogs, selectedDate],
  );
  const existingEntryRef = useRef<DailyBiometricLog | null>(existingEntry);
  existingEntryRef.current = existingEntry;

  useEffect(() => {
    if (!isLocalServerHost()) return;
    let active = true;
    fetch('/api/backup-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            count?: number;
            limit?: number;
            latestDate?: string | null;
          } | null,
        ) => {
          if (!active || !data || typeof data.count !== 'number') return;
          setBackupStatus({
            count: data.count,
            limit: typeof data.limit === 'number' ? data.limit : 10,
            latestDate:
              typeof data.latestDate === 'string' ? data.latestDate : null,
          });
        },
      )
      .catch(() => {
        // Ignore if running in static preview without local API
      });
    return () => {
      active = false;
    };
  }, [dailyLogs.length, hevyWorkouts.length]);

  // Sync form fields whenever selectedDate or saved entry changes
  useEffect(() => {
    if (existingEntry) {
      setWeightStr(toInputStr(existingEntry.weightKg));
      setSleepHoursStr(toInputStr(existingEntry.sleepHours));
      setSleepQuality(existingEntry.sleepQuality);
      setRestingHrStr(toInputStr(existingEntry.restingHr));
      setHrvStr(toInputStr(existingEntry.hrv));
      setCaloriesStr(toInputStr(existingEntry.caloriesKcal));
      setProteinStr(toInputStr(existingEntry.proteinGrams));
      setCardioKmStr(toInputStr(existingEntry.cardioDistanceKm));
      setCardioMinStr(toInputStr(existingEntry.cardioDurationMinutes));
      setCardioElevationStr(toInputStr(existingEntry.cardioElevationGainM));
      setStepsStr(toInputStr(existingEntry.steps));
      setActiveCaloriesStr(toInputStr(existingEntry.activeCalories));
      setRestingCaloriesStr(toInputStr(existingEntry.restingCalories));
      setCompletedHabits(existingEntry.completedHabits);
      setNotesStr(existingEntry.notes ?? '');
    } else {
      setWeightStr('');
      setSleepHoursStr('');
      setSleepQuality(undefined);
      setRestingHrStr('');
      setHrvStr('');
      setCaloriesStr('');
      setProteinStr('');
      setCardioKmStr('');
      setCardioMinStr('');
      setCardioElevationStr('');
      setStepsStr('');
      setActiveCaloriesStr('');
      setRestingCaloriesStr('');
      setCompletedHabits([]);
      setNotesStr('');
    }
    setClearedFields(new Set());
  }, [selectedDate, existingEntry]);

  // 0 ms неблокираща фонова синхронизация от Huawei Watch (Intervals.icu) за избраната дата
  useEffect(() => {
    const cleanKey = intervalsApiKey.trim();
    if (!cleanKey) return;
    // Ако датата вече е синхронизирана и записана в database.json, не тегли повторно
    if (existingEntryRef.current?.watchSyncedAt) return;
    const sessionKey = `${selectedDate}::${cleanKey}`;
    if (attemptedWatchSyncDatesRef.current.has(sessionKey)) return;
    attemptedWatchSyncDatesRef.current.add(sessionKey);

    let active = true;
    const targetDate = selectedDate;

    void fetchIntervalsWatchDayData({
      apiKey: cleanKey,
      dateKey: targetDate,
    }).then(async (res) => {
      if (!active || !res.ok || !res.data?.hasAnyMetric) return;

      const currentExisting =
        existingEntryRef.current?.date === targetDate
          ? existingEntryRef.current
          : null;
      const { nextEntry, changedFieldsCount } = mergeWatchDataIntoDailyLog({
        existing: currentExisting,
        dateKey: targetDate,
        watchData: res.data,
        overwriteExisting: false,
      });

      if (changedFieldsCount > 0 || !currentExisting?.watchSyncedAt) {
        try {
          await onSaveDailyLog(nextEntry);
          if (active && changedFieldsCount > 0) {
            const targetBadge = formatSelectedDateBadge(targetDate, todayKey);
            setWatchNotice(
              `⌚ Синхронизирано от часовника за ${targetBadge.shortContext} (${targetBadge.numericDate})`,
            );
          }
        } catch {
          // Тихо запазваме офлайн състоянието без грешки
        }
      }
    });

    return () => {
      active = false;
    };
  }, [selectedDate, intervalsApiKey, onSaveDailyLog, todayKey]);

  function markFieldTouched(field: string, isNowEmpty: boolean) {
    setClearedFields((prev) => {
      const next = new Set(prev);
      if (isNowEmpty) {
        next.add(field);
      } else {
        next.delete(field);
      }
      return next;
    });
  }

  const dayWorkouts = useMemo(
    () => hevyWorkouts.filter((w) => w.date === selectedDate),
    [hevyWorkouts, selectedDate],
  );

  const referenceWeightForProtein = useMemo(() => {
    const typedWeight = parseNumInput(weightStr);
    if (typedWeight !== undefined && typedWeight > 0) {
      return { value: typedWeight, source: 'от записа' };
    }
    const latest = getLatestDailyWeight(dailyLogs, profileWeightKg);
    if (latest !== null) {
      return { value: latest, source: 'последно тегло' };
    }
    return null;
  }, [weightStr, dailyLogs, profileWeightKg]);

  const liveProteinPerKg = useMemo(
    () =>
      computeProteinPerKg(
        parseNumInput(proteinStr),
        referenceWeightForProtein?.value,
      ),
    [proteinStr, referenceWeightForProtein],
  );

  const liveSteps = useMemo(() => {
    const val = parseNumInput(stepsStr);
    return val !== undefined && val >= 0 ? Math.round(val) : null;
  }, [stepsStr]);

  const stepsProgressPct = useMemo(() => {
    if (liveSteps === null) return 0;
    return Math.min(100, Math.round((liveSteps / effectiveStepsGoal) * 100));
  }, [liveSteps, effectiveStepsGoal]);

  const liveEnergy = useMemo(
    () =>
      computeDailyEnergySummary({
        caloriesIntake: parseNumInput(caloriesStr),
        activeCalories: parseNumInput(activeCaloriesStr),
        restingCalories: parseNumInput(restingCaloriesStr),
        weightKg: referenceWeightForProtein?.value,
        heightCm: profileHeightCm,
      }),
    [
      caloriesStr,
      activeCaloriesStr,
      restingCaloriesStr,
      referenceWeightForProtein,
      profileHeightCm,
    ],
  );

  const last7DaysOverview = useMemo(
    () =>
      buildLast7CompletedDaysOverview({
        dailyLogs,
        todayKey,
        totalHabitsCount: beneficialHabitList.length,
        fallbackWeightKg: referenceWeightForProtein?.value ?? null,
        heightCm: profileHeightCm,
      }),
    [
      dailyLogs,
      todayKey,
      beneficialHabitList.length,
      referenceWeightForProtein,
      profileHeightCm,
    ],
  );

  const selectedDateBadge = useMemo(
    () => formatSelectedDateBadge(selectedDate, todayKey),
    [selectedDate, todayKey],
  );

  const dateHeadline = selectedDateBadge.fullBadge;

  function handleCopyPreviousDay() {
    const copied = extractPreviousDayNutritionAndHabits(
      dailyLogs,
      selectedDate,
      (h) => classifyHabitPolarity(h) === 'beneficial',
    );

    if (!copied.found || !copied.hasAnyData) {
      setFeedback({
        type: 'info',
        message: `За предния ден (${formatBgNumericDate(copied.sourceDate)}) няма записани полезни навици, калории или протеин за копиране.`,
      });
      return;
    }

    const copiedParts: string[] = [];

    if (copied.beneficialHabits.length > 0) {
      setCompletedHabits((prev) => {
        // Keep any currently toggled harmful habits for the selected day, replace/merge beneficial habits
        const existingHarmful = prev.filter(
          (h) => classifyHabitPolarity(h) === 'harmful',
        );
        return Array.from(new Set([...copied.beneficialHabits, ...existingHarmful]));
      });
      markFieldTouched('completedHabits', false);
      copiedParts.push(`${copied.beneficialHabits.length} полезни навика`);
    }

    if (copied.caloriesKcal !== undefined) {
      setCaloriesStr(String(copied.caloriesKcal));
      markFieldTouched('caloriesKcal', false);
      copiedParts.push(`${formatNumberBg(copied.caloriesKcal)} kcal`);
    }

    if (copied.proteinGrams !== undefined) {
      setProteinStr(String(copied.proteinGrams));
      markFieldTouched('proteinGrams', false);
      copiedParts.push(`${formatNumberBg(copied.proteinGrams)} g протеин`);
    }

    setFeedback({
      type: 'success',
      message: `Копирани от ${formatBgNumericDate(copied.sourceDate)} към ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate}): ${copiedParts.join(', ')}. Натисни „Запази“, за да запишеш.`,
    });
  }

  async function handleSaveStepsGoal() {
    const parsed = sanitizeDailyStepsGoal(parseNumInput(stepsGoalDraft));
    if (parsed === undefined) {
      setFeedback({
        type: 'error',
        message: 'Дневната цел за крачки трябва да е между 1 000 и 100 000.',
      });
      return;
    }
    try {
      await onUpdateStepsGoal(parsed);
      setEditingStepsGoal(false);
      setFeedback({
        type: 'success',
        message: `Дневната цел за крачки е обновена на ${formatNumberBg(parsed)}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при запазване на целта за крачки.',
      });
    }
  }

  function toggleHabit(habit: string) {
    setCompletedHabits((prev) => {
      const next = prev.includes(habit)
        ? prev.filter((h) => h !== habit)
        : [...prev, habit];
      return next;
    });
    setClearedFields((prev) => {
      const next = new Set(prev);
      next.add('completedHabits');
      return next;
    });
  }

  const isTribulusChecked = useMemo(
    () => completedHabits.some(isTribulusHabit),
    [completedHabits],
  );

  const tribulusStreak = useMemo(() => {
    const logMap = new Map(dailyLogs.map((d) => [d.date, d]));
    let streak = 0;
    let cursor = selectedDate;
    for (let i = 0; i < 365; i++) {
      const log = logMap.get(cursor);
      const took =
        cursor === selectedDate
          ? isTribulusChecked
          : Boolean(log && hasTribulusInLog(log));
      if (!took) break;
      streak += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return streak;
  }, [dailyLogs, selectedDate, isTribulusChecked]);

  function toggleTribulusHabit() {
    setCompletedHabits((prev) => {
      if (prev.some(isTribulusHabit)) {
        return prev.filter((h) => !isTribulusHabit(h));
      }
      return [...prev, TRIBULUS_HABIT_NAME];
    });
    setClearedFields((prev) => {
      const next = new Set(prev);
      next.add('completedHabits');
      return next;
    });
  }

  async function handleAddHabit() {
    const clean = newHabitInput.trim();
    if (!clean) return;
    if (activeHabits.some((h) => h.toLowerCase() === clean.toLowerCase())) {
      setNewHabitInput('');
      return;
    }
    const nextHabits = [...activeHabits, clean];
    try {
      await onUpdateHabitItems(nextHabits);
      setCompletedHabits((prev) => Array.from(new Set([...prev, clean])));
      setClearedFields((prev) => {
        const next = new Set(prev);
        next.add('completedHabits');
        return next;
      });
      setNewHabitInput('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при запазване на новия навик.',
      });
    }
  }

  async function handleRemoveHabit(habit: string) {
    const nextHabits = activeHabits.filter((h) => h !== habit);
    try {
      await onUpdateHabitItems(nextHabits);
      setCompletedHabits((prev) => prev.filter((h) => h !== habit));
      setClearedFields((prev) => {
        const next = new Set(prev);
        next.add('completedHabits');
        return next;
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при премахване на навика.',
      });
    }
  }

  async function handleHevyFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const targetDate = selectedDate;
    const targetBadge = formatSelectedDateBadge(targetDate, todayKey);

    setImportingHevy(true);
    setHevyFeedback(null);

    try {
      const text = await file.text();
      const parsed = parseHevyCsv(text);
      if (!parsed.ok) {
        setHevyFeedback({ type: 'error', message: parsed.error });
        return;
      }

      const mergeResult = mergeHevyWorkoutsWithoutDuplicates(
        hevyWorkouts,
        parsed.workouts,
      );

      if (mergeResult.addedWorkouts.length === 0) {
        const existingForSelected = hevyWorkouts.filter(
          (w) => w.date === targetDate,
        ).length;
        const selectedSummary =
          existingForSelected > 0
            ? ` · За ${targetBadge.shortContext} (${targetBadge.numericDate}) има ${existingForSelected} ${existingForSelected === 1 ? 'записана тренировка' : 'записани тренировки'}.`
            : ` · За ${targetBadge.shortContext} (${targetBadge.numericDate}) няма тренировка във файла.`;
        setHevyFeedback({
          type: 'info',
          message: `Всички ${mergeResult.skippedDuplicatesCount} тренировки от „${file.name}“ вече са в базата данни${selectedSummary}`,
        });
        return;
      }

      await onSaveHevyWorkouts(mergeResult.mergedWorkouts);
      const matchedSelectedCount = mergeResult.mergedWorkouts.filter(
        (w) => w.date === targetDate,
      ).length;
      const skippedNote =
        mergeResult.skippedDuplicatesCount > 0
          ? ` (пропуснати ${mergeResult.skippedDuplicatesCount} дубликата)`
          : '';
      const selectedDateNote =
        matchedSelectedCount > 0
          ? ` · За ${targetBadge.shortContext} (${targetBadge.numericDate}): ${matchedSelectedCount} ${matchedSelectedCount === 1 ? 'тренировка' : 'тренировки'}`
          : ` · За ${targetBadge.shortContext} (${targetBadge.numericDate}) няма тренировка във файла`;
      setHevyFeedback({
        type: 'success',
        message: `Импортирани ${mergeResult.addedWorkouts.length} нови тренировки от „${file.name}“${skippedNote}${selectedDateNote}.`,
      });
    } catch (err) {
      setHevyFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при импорт на Hevy CSV файла.',
      });
    } finally {
      setImportingHevy(false);
    }
  }

  async function handleSaveWatchApiKey() {
    if (!onSaveIntervalsApiKey) return;
    setSavingWatchKey(true);
    try {
      const cleaned = watchKeyDraft.trim();
      await onSaveIntervalsApiKey(cleaned);
      attemptedWatchSyncDatesRef.current.clear();
      setShowWatchSettings(false);
      setFeedback({
        type: 'success',
        message: cleaned
          ? 'Intervals.icu API ключът е запазен в database.json. Автоматичната синхронизация е активна.'
          : 'Intervals.icu API ключът е премахнат.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при запазване на Intervals.icu API ключа.',
      });
    } finally {
      setSavingWatchKey(false);
    }
  }

  async function handleManualWatchSync() {
    const cleanKey = intervalsApiKey.trim();
    if (!cleanKey) {
      setShowWatchSettings(true);
      return;
    }

    const targetDate = selectedDate;
    const targetBadge = formatSelectedDateBadge(targetDate, todayKey);
    const targetExisting = existingEntry;

    setWatchSyncing(true);
    setWatchNotice(null);
    try {
      const res = await fetchIntervalsWatchDayData({
        apiKey: cleanKey,
        dateKey: targetDate,
      });

      if (res.authError) {
        setShowWatchSettings(true);
        setFeedback({
          type: 'error',
          message:
            'Intervals.icu отхвърли API ключа (401/403). Провери ключа в Settings → Developer Settings → API Key.',
        });
        return;
      }

      if (!res.ok || !res.data) {
        // Тихо преминаване в офлайн режим без грешки
        return;
      }

      if (!res.data.hasAnyMetric) {
        setWatchNotice(
          `⌚ Няма нови данни от часовника за ${targetBadge.shortContext} (${targetBadge.numericDate}) в Intervals.icu`,
        );
        return;
      }

      const { nextEntry } = mergeWatchDataIntoDailyLog({
        existing: targetExisting,
        dateKey: targetDate,
        watchData: res.data,
        overwriteExisting: true,
      });

      await onSaveDailyLog(nextEntry);
      setWatchNotice(
        `⌚ Синхронизирано от часовника за ${targetBadge.shortContext} (${targetBadge.numericDate})`,
      );
    } catch {
      // Тихо преминаване в офлайн режим
    } finally {
      setWatchSyncing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const trimmedNotes = notesStr.trim();
    const draftEntry: DailyBiometricLog = {
      date: selectedDate,
      weightKg: parseNumInput(weightStr),
      sleepHours: parseNumInput(sleepHoursStr),
      sleepQuality,
      restingHr: parseNumInput(restingHrStr),
      hrv: parseNumInput(hrvStr),
      caloriesKcal: parseNumInput(caloriesStr),
      proteinGrams: parseNumInput(proteinStr),
      cardioDistanceKm: parseNumInput(cardioKmStr),
      cardioDurationMinutes: parseNumInput(cardioMinStr),
      cardioElevationGainM: parseNumInput(cardioElevationStr),
      steps: parseNumInput(stepsStr),
      activeCalories: parseNumInput(activeCaloriesStr),
      restingCalories: parseNumInput(restingCaloriesStr),
      completedHabits,
      notes: trimmedNotes ? trimmedNotes : undefined,
    };

    const mergedEntry = mergeUnifiedDailyLog(
      existingEntry,
      draftEntry,
      clearedFields,
    );

    try {
      const wasExisting = Boolean(existingEntry);
      await onSaveDailyLog(mergedEntry);
      setClearedFields(new Set());
      if (isLocalServerHost()) {
        fetch('/api/backup-status', { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then(
            (
              data: {
                count?: number;
                limit?: number;
                latestDate?: string | null;
              } | null,
            ) => {
              if (data && typeof data.count === 'number') {
                setBackupStatus({
                  count: data.count,
                  limit: typeof data.limit === 'number' ? data.limit : 10,
                  latestDate:
                    typeof data.latestDate === 'string' ? data.latestDate : null,
                });
              }
            },
          )
          .catch(() => {});
      }
      const targetLabel = isLocalServerHost() ? 'в database.json' : 'на устройството';
      setFeedback({
        type: 'success',
        message: wasExisting
          ? `Данните за ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate}) са обновени успешно ${targetLabel}.`
          : `Данните за ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate}) са запазени успешно ${targetLabel}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Неуспешен запис на дневните данни.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCurrent() {
    if (!existingEntry) return;
    const targetDate = selectedDate;
    const targetBadge = formatSelectedDateBadge(targetDate, todayKey);
    setSaving(true);
    setFeedback(null);
    try {
      await onDeleteDailyLog(targetDate);
      setFeedback({
        type: 'success',
        message: `Записът за ${targetBadge.shortContext} (${targetBadge.numericDate}) е изтрит.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Неуспешно изтриване на записа.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCycleDayWorkoutEnvironment(workout: HevyWorkout) {
    const currentEnv = classifyWorkoutEnvironment(workout);
    const nextEnv = getNextWorkoutEnvironment(currentEnv);
    const nextWorkouts = hevyWorkouts.map((w) =>
      w.id === workout.id ? { ...w, environment: nextEnv } : w,
    );
    try {
      await onSaveHevyWorkouts(nextWorkouts);
      const nextMeta = WORKOUT_ENVIRONMENT_META_MAP[nextEnv];
      setHevyFeedback({
        type: 'info',
        message: `Средата за „${workout.title}“ е променена на ${nextMeta.badgeLabel}.`,
      });
    } catch (err) {
      setHevyFeedback({
        type: 'error',
        message:
          err instanceof Error
            ? err.message
            : 'Грешка при промяна на средата на тренировката.',
      });
    }
  }

  return (
    <section
      id="checkin"
      data-testid="daily-checkin-page"
      aria-label="Дневен запис"
      className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6"
    >
      {/* Заглавие, индикатор за датата (по подразбиране ВЧЕРА) и 3 семпли бутона */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
            Дневен запис
          </h1>
          <div
            data-testid="checkin-date-headline"
            className={`mt-1.5 inline-flex flex-wrap items-center gap-2 text-sm font-semibold ${
              selectedDate === yesterdayKey
                ? 'text-sky-300'
                : selectedDate === todayKey
                  ? 'text-amber-300'
                  : 'text-slate-200'
            }`}
          >
            <span>{dateHeadline}</span>
            <span className="text-xs font-normal text-slate-400">
              {selectedDate === todayKey
                ? '· Попълваш текущата дата — непопълнените вечерни полета не изкривяват 7-дневните средни.'
                : '· Всички полета, часовникът и Hevy четат и записват само за избраната дата.'}
            </span>
          </div>
        </div>

        {/* Само 3 семпли бутона + избор на дата (44px височина на мобилни екрани) */}
        <div
          data-testid="checkin-date-nav"
          className="flex flex-wrap items-center gap-2 shrink-0"
        >
          <button
            type="button"
            data-testid="checkin-date-prev-btn"
            onClick={() => {
              setSelectedDate((prev) => shiftDateKey(prev, -1));
              setFeedback(null);
            }}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9"
          >
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Предишен ден</span>
          </button>

          <button
            type="button"
            data-testid="checkin-date-yesterday-btn"
            onClick={() => {
              setSelectedDate(yesterdayKey);
              setFeedback(null);
            }}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9 ${
              selectedDate === yesterdayKey
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
            }`}
          >
            <span>Вчера</span>
          </button>

          <button
            type="button"
            data-testid="checkin-date-today-btn"
            onClick={() => {
              setSelectedDate(todayKey);
              setFeedback(null);
            }}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9 ${
              selectedDate === todayKey
                ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)] font-semibold'
                : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
            }`}
          >
            <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Днес</span>
          </button>

          <label htmlFor="checkin-date-picker" className="sr-only">
            Дата на записа
          </label>
          <input
            id="checkin-date-picker"
            data-testid="checkin-date-picker"
            type="date"
            max={todayKey}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value && e.target.value <= todayKey) {
                setSelectedDate(e.target.value);
                setFeedback(null);
              }
            }}
            className="min-h-[44px] rounded-lg border border-white/15 bg-[#141B27] px-2.5 font-mono text-base tabular-nums text-white focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-xs"
          />

          <button
            type="button"
            data-testid="checkin-watch-sync-btn"
            disabled={watchSyncing}
            onClick={() => void handleManualWatchSync()}
            title={`Синхронизирай Huawei Watch за ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate}) чрез Intervals.icu`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-900/40 hover:text-white disabled:opacity-60 whitespace-nowrap shrink-0 md:min-h-[36px] md:h-9"
          >
            <span>
              {watchSyncing
                ? '⌚ Синхронизиране…'
                : `⌚ Синхронизирай часовник (${selectedDateBadge.shortContext})`}
            </span>
          </button>

          <button
            type="button"
            data-testid="checkin-watch-settings-btn"
            onClick={() => setShowWatchSettings((prev) => !prev)}
            aria-expanded={showWatchSettings}
            aria-label="Настройки за Intervals.icu API Key"
            title="Настройка на Intervals.icu API Key за Huawei Watch"
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border text-sm transition-colors shrink-0 md:min-h-[36px] md:min-w-[36px] md:h-9 md:w-9 ${
              showWatchSettings || intervalsApiKey.trim()
                ? 'border-emerald-500/45 bg-[#141B27] text-white'
                : 'border-white/15 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
            }`}
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* Настройка на безплатния Intervals.icu API Key (еднократно) */}
      {showWatchSettings && (
        <div
          data-testid="checkin-watch-settings-panel"
          className="mt-4 rounded-xl border border-emerald-500/30 bg-[#111826] p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1 min-w-0">
              <label
                htmlFor="intervals-api-key-input"
                className="block text-xs font-semibold text-white"
              >
                Intervals.icu API Key (Huawei Watch автоматична синхронизация)
              </label>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Intervals.icu → Settings → Connections → HUAWEI Health, след това Settings → Developer Settings → API Key
              </p>
              <input
                id="intervals-api-key-input"
                data-testid="intervals-api-key-input"
                type="password"
                autoComplete="off"
                placeholder="Постави своя Intervals.icu API Key тук…"
                value={watchKeyDraft}
                onChange={(e) => setWatchKeyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSaveWatchApiKey();
                  }
                }}
                className="mt-2 h-9 w-full rounded-lg border border-white/15 bg-[#0B101A] px-3 font-mono text-xs text-white placeholder:text-slate-500 focus:border-emerald-400"
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="intervals-api-key-save-btn"
                disabled={savingWatchKey}
                onClick={() => void handleSaveWatchApiKey()}
                className="inline-flex h-9 items-center rounded-lg bg-emerald-500 px-3.5 text-xs font-semibold text-slate-950 transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
              >
                {savingWatchKey ? 'Записване…' : 'Запази ключа'}
              </button>
              <button
                type="button"
                onClick={() => setShowWatchSettings(false)}
                className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-300 hover:text-white whitespace-nowrap"
              >
                Затвори
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Кратко зелено известие след синхронизация от часовника */}
      {watchNotice && (
        <div
          role="status"
          data-testid="checkin-watch-sync-notice"
          className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/35 px-3.5 py-2 text-xs text-emerald-200"
        >
          <span className="font-semibold">{watchNotice}</span>
          <button
            type="button"
            onClick={() => setWatchNotice(null)}
            className="rounded px-2 py-0.5 text-[11px] text-emerald-200/80 hover:bg-emerald-500/20 hover:text-white whitespace-nowrap shrink-0"
          >
            Затвори
          </button>
        </div>
      )}

      {/* Бърз превключвател за режим на целта */}
      <div className="mt-4">
        <TrainingGoalSwitcher
          value={trainingGoal}
          onChange={onChangeTrainingGoal}
          compact
        />
      </div>

      {/* Бързо действие: Копиране на навиците и храната от предния ден + статус */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-testid="checkin-copy-prev-day-btn"
          onClick={handleCopyPreviousDay}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-100 transition-colors hover:border-[var(--accent-border)] hover:bg-[#182132] hover:text-white whitespace-nowrap shrink-0"
        >
          <Copy className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
          <span>
            Копирай навиците и храната от предния ден ({formatBgNumericDate(shiftDateKey(selectedDate, -1))})
          </span>
        </button>

        <span className="text-xs text-slate-400">
          {existingEntry
            ? `Редакция на запис: ${selectedDateBadge.fullBadge}`
            : `Нов запис: ${selectedDateBadge.fullBadge}`}
        </span>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          data-testid="checkin-feedback"
          className={`mt-4 rounded-xl border px-4 py-2.5 text-sm ${
            feedback.type === 'error'
              ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
              : feedback.type === 'info'
                ? 'border-sky-500/35 bg-sky-950/20 text-sky-200'
                : 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* ЕДИННА ФОРМА: 2-колонна мрежа от 4 компактни карти на един екран */}
      <form ref={formRef} onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* =============================================================== */}
          {/* КАРТА 1: Тяло и Сън                                             */}
          {/* =============================================================== */}
          <div
            data-testid="card-body-sleep"
            className="rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-5"
          >
            <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-white">
                  Тяло и Сън ({selectedDateBadge.shortContext})
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {selectedDateBadge.numericDate}
              </span>
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label
                  htmlFor="checkin-weight-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Scale className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Тегло (kg)</span>
                </label>
                <input
                  id="checkin-weight-input"
                  data-testid="checkin-weight-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={20}
                  max={400}
                  placeholder="напр. 80.5"
                  value={weightStr}
                  onChange={(e) => {
                    setWeightStr(e.target.value);
                    markFieldTouched('weightKg', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-sleep-hours-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Moon className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Сън (часове)</span>
                </label>
                <input
                  id="checkin-sleep-hours-input"
                  data-testid="checkin-sleep-hours-input"
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min={0}
                  max={24}
                  placeholder="напр. 7.5"
                  value={sleepHoursStr}
                  onChange={(e) => {
                    setSleepHoursStr(e.target.value);
                    markFieldTouched('sleepHours', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-resting-hr-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <HeartPulse className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                  <span>Пулс (bpm)</span>
                </label>
                <input
                  id="checkin-resting-hr-input"
                  data-testid="checkin-resting-hr-input"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={25}
                  max={220}
                  placeholder="напр. 58"
                  value={restingHrStr}
                  onChange={(e) => {
                    setRestingHrStr(e.target.value);
                    markFieldTouched('restingHr', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-hrv-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Activity className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>HRV (ms)</span>
                </label>
                <input
                  id="checkin-hrv-input"
                  data-testid="checkin-hrv-input"
                  type="number"
                  inputMode="decimal"
                  step="0.5"
                  min={5}
                  max={300}
                  placeholder="напр. 64"
                  value={hrvStr}
                  onChange={(e) => {
                    setHrvStr(e.target.value);
                    markFieldTouched('hrv', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>
            </div>

            {/* Качество на съня (1-5) */}
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Качество на съня / свежест (1–5)</span>
                {sleepQuality !== undefined && (
                  <span className="font-mono text-[var(--accent-text)]">
                    {sleepQuality}/5 · {FRESHNESS_LABELS[sleepQuality]}
                  </span>
                )}
              </div>
              <div
                role="group"
                aria-label="Качество на съня от 1 до 5"
                className="grid grid-cols-5 gap-1.5"
              >
                {[1, 2, 3, 4, 5].map((score) => {
                  const active = sleepQuality === score;
                  return (
                    <button
                      key={score}
                      type="button"
                      data-testid={`checkin-freshness-${score}`}
                      aria-pressed={active}
                      onClick={() => {
                        const next = sleepQuality === score ? undefined : score;
                        setSleepQuality(next);
                        markFieldTouched('sleepQuality', next === undefined);
                      }}
                      className={`flex h-10 flex-col items-center justify-center rounded-lg border text-xs transition-colors ${
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-white font-semibold'
                          : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      <span className="font-mono text-xs font-bold tabular-nums leading-none">
                        {score}
                      </span>
                      <span className="mt-0.5 hidden sm:inline text-[10px] text-slate-400 leading-none">
                        {FRESHNESS_LABELS[score]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* КАРТА 2: Часовник, Храна и Движение                             */}
          {/* =============================================================== */}
          <div
            data-testid="card-watch-food-movement"
            className="rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2.5">
              <div className="flex items-center gap-2">
                <Watch className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-white">
                  Хранене и калории ({selectedDateBadge.shortContext})
                </h2>
              </div>

              {editingStepsGoal ? (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="checkin-steps-goal-input" className="sr-only">
                    Дневна цел крачки
                  </label>
                  <input
                    id="checkin-steps-goal-input"
                    data-testid="checkin-steps-goal-input"
                    type="number"
                    step={500}
                    min={1000}
                    max={100000}
                    value={stepsGoalDraft}
                    onChange={(e) => setStepsGoalDraft(e.target.value)}
                    className="h-7 w-20 rounded-md border border-white/20 bg-[#141B27] px-2 font-mono text-xs tabular-nums text-white"
                  />
                  <button
                    type="button"
                    data-testid="checkin-steps-goal-save-btn"
                    onClick={() => void handleSaveStepsGoal()}
                    className="h-7 rounded-md bg-[var(--accent)] px-2 text-[11px] font-semibold text-[var(--accent-contrast)] whitespace-nowrap"
                  >
                    ОК
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingStepsGoal(false);
                      setStepsGoalDraft(String(effectiveStepsGoal));
                    }}
                    className="h-7 rounded-md border border-white/15 px-2 text-[11px] text-slate-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="checkin-steps-goal-edit-btn"
                  onClick={() => setEditingStepsGoal(true)}
                  className="font-mono text-[11px] tabular-nums text-slate-400 transition-colors hover:text-[var(--accent-text)]"
                >
                  Цел: {formatNumberBg(effectiveStepsGoal)} крачки
                </button>
              )}
            </div>

            {/* Ред 1: Крачки + Активни kcal + В покой kcal (1 колона под 768px) */}
            <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label
                  htmlFor="checkin-steps-input"
                  className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-300"
                >
                  <Footprints className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Крачки</span>
                </label>
                <input
                  id="checkin-steps-input"
                  data-testid="checkin-steps-input"
                  type="number"
                  inputMode="numeric"
                  step="100"
                  min={0}
                  max={200000}
                  placeholder="напр. 10500"
                  value={stepsStr}
                  onChange={(e) => {
                    setStepsStr(e.target.value);
                    markFieldTouched('steps', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    data-testid="checkin-steps-progress-bar"
                    className={`h-full rounded-full transition-all ${
                      liveSteps === null
                        ? 'bg-slate-600'
                        : liveSteps >= effectiveStepsGoal
                          ? 'bg-emerald-500'
                          : liveSteps >= 6000
                            ? 'bg-sky-400'
                            : 'bg-amber-400'
                    }`}
                    style={{ width: `${stepsProgressPct}%` }}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="checkin-active-calories-input"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Активни изгорени (kcal)
                </label>
                <input
                  id="checkin-active-calories-input"
                  data-testid="checkin-active-calories-input"
                  type="number"
                  inputMode="numeric"
                  step="10"
                  min={0}
                  max={15000}
                  placeholder="напр. 650"
                  value={activeCaloriesStr}
                  onChange={(e) => {
                    setActiveCaloriesStr(e.target.value);
                    markFieldTouched('activeCalories', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-resting-calories-input"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  В покой / BMR (по избор)
                </label>
                <input
                  id="checkin-resting-calories-input"
                  data-testid="checkin-resting-calories-input"
                  type="number"
                  inputMode="numeric"
                  step="10"
                  min={0}
                  max={10000}
                  placeholder={
                    liveEnergy.effectiveRestingCalories !== null &&
                    liveEnergy.restingSource !== 'manual'
                      ? `авто ~${liveEnergy.effectiveRestingCalories}`
                      : 'авто BMR'
                  }
                  value={restingCaloriesStr}
                  onChange={(e) => {
                    setRestingCaloriesStr(e.target.value);
                    markFieldTouched('restingCalories', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:text-sm"
                />
              </div>
            </div>

            {/* Ред 2: Приети калории, Протеин, Кардио (1 колона под 768px) */}
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label
                  htmlFor="checkin-calories-input"
                  className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-300"
                >
                  <Utensils className="h-3 w-3 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Приети (kcal)</span>
                </label>
                <input
                  id="checkin-calories-input"
                  data-testid="checkin-calories-input"
                  type="number"
                  inputMode="numeric"
                  step="10"
                  min={0}
                  max={20000}
                  placeholder="2400"
                  value={caloriesStr}
                  onChange={(e) => {
                    setCaloriesStr(e.target.value);
                    markFieldTouched('caloriesKcal', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:px-2.5 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-protein-input"
                  className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300"
                >
                  <span>Протеин (g)</span>
                  {liveProteinPerKg !== null && (
                    <span
                      data-testid="checkin-protein-per-kg"
                      className={`font-mono text-[10px] tabular-nums ${
                        liveProteinPerKg >= proteinThresholdGPerKg
                          ? 'text-emerald-400'
                          : 'text-amber-300'
                      }`}
                    >
                      {formatNumberBg(liveProteinPerKg)} g/kg
                    </span>
                  )}
                </label>
                <input
                  id="checkin-protein-input"
                  data-testid="checkin-protein-input"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={0}
                  max={1000}
                  placeholder="160"
                  value={proteinStr}
                  onChange={(e) => {
                    setProteinStr(e.target.value);
                    markFieldTouched('proteinGrams', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:px-2.5 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-cardio-km-input"
                  className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-300"
                >
                  <Activity className="h-3 w-3 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Кардио (km)</span>
                </label>
                <input
                  id="checkin-cardio-km-input"
                  data-testid="checkin-cardio-km-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min={0}
                  max={500}
                  placeholder="напр. 5.5"
                  value={cardioKmStr}
                  onChange={(e) => {
                    setCardioKmStr(e.target.value);
                    markFieldTouched('cardioDistanceKm', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:px-2.5 md:text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="checkin-cardio-min-input"
                  className="mb-1 block text-xs font-medium text-slate-300"
                >
                  Кардио (мин)
                </label>
                <input
                  id="checkin-cardio-min-input"
                  data-testid="checkin-cardio-min-input"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min={0}
                  max={1440}
                  placeholder="напр. 35"
                  value={cardioMinStr}
                  onChange={(e) => {
                    setCardioMinStr(e.target.value);
                    markFieldTouched('cardioDurationMinutes', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:px-2.5 md:text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label
                  htmlFor="checkin-cardio-elevation-input"
                  className="mb-1 flex items-center justify-between text-xs font-medium text-slate-300"
                >
                  <span>Денивелация / Изкачване (m)</span>
                  {(parseNumInput(cardioElevationStr) ?? 0) > 300 && (
                    <span className="font-mono text-[10px] tabular-nums text-amber-300">
                      &gt; 300 m · отчита умора на краката
                    </span>
                  )}
                </label>
                <input
                  id="checkin-cardio-elevation-input"
                  data-testid="checkin-cardio-elevation-input"
                  type="number"
                  inputMode="numeric"
                  step="10"
                  min={0}
                  max={20000}
                  placeholder="напр. 420 (бягане / преход)"
                  value={cardioElevationStr}
                  onChange={(e) => {
                    setCardioElevationStr(e.target.value);
                    markFieldTouched('cardioElevationGainM', e.target.value.trim() === '');
                  }}
                  className="min-h-[44px] w-full rounded-lg border border-white/15 bg-[#141B27] px-3 font-mono text-base tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)] md:min-h-[36px] md:h-9 md:px-2.5 md:text-sm"
                />
              </div>
            </div>

            {/* Компактен изчислен ред: TDEE и дневен енергиен баланс */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#131926] px-3 py-2 font-mono text-xs tabular-nums">
              <span className="text-slate-300">
                TDEE:{' '}
                <strong data-testid="checkin-tdee-value" className="text-orange-300">
                  {liveEnergy.tdee !== null ? `${formatNumberBg(liveEnergy.tdee)} kcal` : '—'}
                </strong>
              </span>
              {liveEnergy.netBalance !== null && liveEnergy.label ? (
                <span
                  data-testid="checkin-energy-balance-indicator"
                  className={`font-semibold ${
                    liveEnergy.status === 'deficit'
                      ? 'text-emerald-400'
                      : liveEnergy.status === 'surplus'
                        ? 'text-amber-300'
                        : 'text-sky-300'
                  }`}
                >
                  {liveEnergy.label}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Въведи приети и активни kcal за баланс
                </span>
              )}
            </div>
          </div>

          {/* =============================================================== */}
          {/* КАРТА 3: Полезни и Вредни навици                                */}
          {/* =============================================================== */}
          <div
            data-testid="card-habits"
            className="rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-5"
          >
            <div className="flex items-center justify-between border-b border-white/8 pb-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-white">
                  Навици и добавки ({selectedDateBadge.shortContext})
                </h2>
              </div>
              <span className="font-mono text-[11px] tabular-nums text-slate-400">
                {
                  completedHabits.filter(
                    (h) => classifyHabitPolarity(h) === 'beneficial',
                  ).length
                }
                /{beneficialHabitList.length + 1} полезни
              </span>
            </div>

            {/* Полезни навици (чекбоксове) */}
            <div className="mt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Полезни навици ({selectedDateBadge.shortContext})</span>
              </div>

              {/* Бърз отделен чекбокс за Бабини зъби (Tribulus terrestris) */}
              <div
                data-testid="checkin-tribulus-row"
                className={`mb-2.5 flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 transition-colors ${
                  isTribulusChecked
                    ? 'border-emerald-500/50 bg-emerald-950/25'
                    : 'border-white/12 bg-[#141B27]'
                }`}
              >
                <label className="flex flex-1 cursor-pointer items-center gap-2.5 min-w-0">
                  <input
                    type="checkbox"
                    data-testid="checkin-tribulus-checkbox"
                    checked={isTribulusChecked}
                    onChange={toggleTribulusHabit}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isTribulusChecked
                        ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                        : 'border-white/25 bg-[#0D121B]'
                    }`}
                  >
                    {isTribulusChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-white">
                      🌿 Бабини зъби (Tribulus terrestris)
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Проследява цикъла в „Интелигентен треньор“ (пауза след 42–56 дни)
                    </div>
                  </div>
                </label>

                <span
                  data-testid="habit-streak-tribulus"
                  className={`inline-flex shrink-0 items-center gap-0.5 font-mono text-[11px] tabular-nums ${
                    tribulusStreak >= 42
                      ? 'text-amber-300 font-semibold'
                      : tribulusStreak > 0
                        ? 'text-emerald-300'
                        : 'text-slate-500'
                  }`}
                  title="Поредни дни прием на Бабини зъби"
                >
                  <Flame className="h-3 w-3" aria-hidden="true" />
                  <span>{tribulusStreak} д.</span>
                </span>
              </div>

              <div
                data-testid="checkin-habits-list"
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
              >
                {beneficialHabitList.map((habit) => {
                  const checked = completedHabits.includes(habit);
                  const streak = computeHabitStreak(dailyLogs, habit, selectedDate);
                  return (
                    <div
                      key={habit}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                        checked
                          ? 'border-emerald-500/40 bg-emerald-950/20'
                          : 'border-white/10 bg-[#141B27]'
                      }`}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleHabit(habit)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                              : 'border-white/25 bg-[#0D121B]'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3 stroke-[3]" />}
                        </span>
                        <span className="truncate text-xs font-medium text-slate-100">
                          {habit}
                        </span>
                      </label>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          data-testid={`habit-streak-${habit}`}
                          className={`inline-flex items-center gap-0.5 font-mono text-[11px] tabular-nums ${
                            streak > 0 ? 'text-amber-300' : 'text-slate-500'
                          }`}
                          title="Поредни дни"
                        >
                          <Flame className="h-3 w-3" aria-hidden="true" />
                          <span>{streak}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleRemoveHabit(habit)}
                          aria-label={`Премахни навик ${habit}`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-white/5 hover:text-rose-300"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Бутон + за добавяне на нов навик */}
              <div className="mt-2.5 flex items-center gap-2">
                <label htmlFor="checkin-new-habit-input" className="sr-only">
                  Добави нов полезен навик
                </label>
                <input
                  id="checkin-new-habit-input"
                  data-testid="checkin-new-habit-input"
                  type="text"
                  maxLength={60}
                  value={newHabitInput}
                  onChange={(e) => setNewHabitInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAddHabit();
                    }
                  }}
                  placeholder="Добави нов навик (напр. Омега-3, Магнезий)…"
                  className="h-8 flex-1 rounded-lg border border-white/15 bg-[#141B27] px-2.5 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                />
                <button
                  type="button"
                  data-testid="checkin-add-habit-btn"
                  onClick={() => void handleAddHabit()}
                  aria-label="Добави навик"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 bg-[#141B27] px-2.5 text-xs font-semibold text-slate-100 transition-colors hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Добави</span>
                </button>
              </div>
            </div>

            {/* Вредни навици (бутони-превключватели) */}
            <div className="mt-4 border-t border-white/8 pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-400">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Вредни навици ({selectedDateBadge.shortContext})</span>
              </div>
              <div
                data-testid="checkin-harmful-habits-list"
                className="flex flex-wrap gap-1.5"
              >
                {harmfulHabitList.map((habit) => {
                  const active = completedHabits.includes(habit);
                  return (
                    <button
                      key={habit}
                      type="button"
                      aria-pressed={active}
                      data-testid={`harmful-habit-toggle-${habit}`}
                      onClick={() => toggleHabit(habit)}
                      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? 'border-rose-400/60 bg-rose-950/50 text-rose-100 font-semibold'
                          : 'border-white/12 bg-[#141B27] text-slate-300 hover:border-rose-400/35 hover:text-white'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`h-2 w-2 rounded-full ${
                          active ? 'bg-rose-400' : 'bg-slate-600'
                        }`}
                      />
                      <span>{habit}</span>
                      {active && <Check className="h-3 w-3 text-rose-300" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* КАРТА 4: Тренировка за деня (Hevy или бърз запис)               */}
          {/* =============================================================== */}
          <div
            data-testid="card-workout-notes"
            className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-5"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2.5">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
                  <h2 className="font-display text-base font-bold text-white">
                    Тренировка за избрания ден ({selectedDateBadge.shortContext})
                  </h2>
                </div>

                <input
                  ref={hevyFileInputRef}
                  type="file"
                  accept=".csv,text/csv,*/*"
                  data-testid="checkin-hevy-file-input"
                  onChange={(e) => void handleHevyFileSelected(e)}
                  className="sr-only"
                />
                <a
                  href="https://hevy.com/settings?export"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="checkin-open-hevy-export-btn"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-3 text-xs font-semibold text-emerald-200 transition-colors hover:border-emerald-400 hover:bg-emerald-900/40 hover:text-white whitespace-nowrap shrink-0 md:min-h-[34px]"
                >
                  <span>⚡ Отвори Hevy Export</span>
                  <ExternalLink className="h-3 w-3 shrink-0 opacity-75" aria-hidden="true" />
                </a>
              </div>

              {/* Голям бутон за директен избор на Hevy CSV файл от телефона (Downloads) */}
              <div className="mt-3">
                <button
                  type="button"
                  data-testid="checkin-import-hevy-btn"
                  disabled={importingHevy}
                  onClick={() => hevyFileInputRef.current?.click()}
                  title={`Избери Hevy CSV файл (workouts.csv) и покажи тренировката за ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate})`}
                  className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent-border)] bg-[var(--accent-soft)] px-4 text-sm font-bold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-contrast)] disabled:opacity-60"
                >
                  <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    {importingHevy
                      ? 'Импортиране на Hevy CSV…'
                      : '📂 Избери Hevy CSV файл'}
                  </span>
                </button>
              </div>

              <p
                data-testid="checkin-hevy-export-hint"
                className="mt-2 text-[11px] leading-relaxed text-slate-400"
              >
                {isLocalServerHost() ? (
                  <>
                    На лаптоп: натисни <strong className="font-medium text-slate-200">Export Workouts</strong> — сайтът ще дръпне файла сам, или избери CSV директно от бутона горе.
                  </>
                ) : (
                  <>
                    На телефон: изтегли <strong className="font-medium text-slate-200">workouts.csv</strong> от Hevy Export, след това натисни <strong className="font-medium text-slate-200">„📂 Избери Hevy CSV файл“</strong> от папка Downloads (дубликатите се премахват автоматично).
                  </>
                )}
              </p>

              {hevyFeedback && (
                <div
                  role={hevyFeedback.type === 'error' ? 'alert' : 'status'}
                  data-testid="checkin-hevy-feedback"
                  className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                    hevyFeedback.type === 'error'
                      ? 'border-rose-500/40 bg-rose-950/25 text-rose-200'
                      : hevyFeedback.type === 'info'
                        ? 'border-sky-500/35 bg-sky-950/20 text-sky-200'
                        : 'border-emerald-500/35 bg-emerald-950/20 text-emerald-200'
                  }`}
                >
                  {hevyFeedback.message}
                </div>
              )}

              {/* Записани Hevy тренировки за избраната дата */}
              <div className="mt-3">
                {dayWorkouts.length > 0 ? (
                  <div className="space-y-2">
                    {dayWorkouts.map((w) => {
                      const envId = classifyWorkoutEnvironment(w);
                      const envMeta = WORKOUT_ENVIRONMENT_META_MAP[envId];
                      const nextEnvMeta =
                        WORKOUT_ENVIRONMENT_META_MAP[
                          getNextWorkoutEnvironment(envId)
                        ];
                      return (
                        <div
                          key={w.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/15 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">
                              {w.title}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {w.exercises.length} упражнения · {w.totalSets} серии
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              data-testid={`checkin-workout-env-btn-${w.id}`}
                              onClick={() => void handleCycleDayWorkoutEnvironment(w)}
                              title={`Кликни за смяна на средата към ${nextEnvMeta.badgeLabel}`}
                              className="inline-flex h-6 items-center rounded-md border border-white/15 bg-[#141B27] px-2 text-[11px] font-medium text-slate-200 transition-colors hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap cursor-pointer"
                            >
                              {envMeta.badgeLabel}
                            </button>
                            <span className="font-mono font-semibold tabular-nums text-emerald-300 shrink-0">
                              {formatNumberBg(Math.round(w.totalVolumeKg))} kg обем
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/12 bg-[#131926] px-3.5 py-2.5 text-xs text-slate-400">
                    Няма импортирана Hevy тренировка за {selectedDateBadge.shortContext} ({selectedDateBadge.numericDate}). Качи експорта директно от бутона горе или запиши кратка бележка по-долу.
                  </div>
                )}
              </div>

              {/* Кратка бележка за избрания ден */}
              <div className="mt-3.5">
                <label
                  htmlFor="checkin-notes-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <StickyNote className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Бележка за тренировката / деня ({selectedDateBadge.shortContext})</span>
                </label>
                <textarea
                  id="checkin-notes-input"
                  data-testid="checkin-notes-input"
                  rows={3}
                  maxLength={500}
                  value={notesStr}
                  onChange={(e) => {
                    setNotesStr(e.target.value);
                    markFieldTouched('notes', e.target.value.trim() === '');
                  }}
                  placeholder="Напр. Силна тренировка за гръб, леко напрежение в рамото, късна вечеря…"
                  className="w-full resize-none rounded-lg border border-white/15 bg-[#141B27] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>Общо Hevy тренировки в базата: {hevyWorkouts.length}</span>
              <span className="font-mono tabular-nums">{notesStr.length}/500</span>
            </div>
          </div>
        </div>

        {/* Един голям бутон за запазване най-долу */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            data-testid="checkin-save-btn"
            disabled={saving}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-sm font-bold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
          >
            <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
            <span>
              {saving
                ? 'Записване…'
                : `Запази данните за ${selectedDateBadge.shortContext} (${selectedDateBadge.numericDate})`}
            </span>
          </button>

          {existingEntry && (
            <button
              type="button"
              data-testid="checkin-delete-btn"
              disabled={saving}
              onClick={handleDeleteCurrent}
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-white/15 bg-[#141B27] px-4 text-xs font-medium text-slate-300 transition-colors hover:border-rose-500/40 hover:text-rose-300 whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              <span>Изтрий записа</span>
            </button>
          )}
        </div>
      </form>

      {/* Компактна лента с последните 7 дни (от вчера назад) за редакция с 1 клик */}
      <div
        data-testid="checkin-last7-strip"
        className="mt-6 rounded-2xl border border-white/10 bg-[#0F141F] p-4 sm:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-sm font-bold text-white">
              Последните 7 дни (от вчера назад)
            </h2>
            <p className="text-xs text-slate-400">
              Кликни върху ден, за да го заредиш и редактираш с 1 клик.
            </p>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            {last7DaysOverview.filter((r) => r.hasAnyData).length}/7 дни с данни
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {last7DaysOverview.map((row) => {
            const isSelected = row.date === selectedDate;
            return (
              <button
                key={row.date}
                type="button"
                data-testid={`checkin-last7-row-${row.date}`}
                onClick={() => {
                  setSelectedDate(row.date);
                  setFeedback(null);
                  formRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  });
                }}
                className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition-colors ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : row.isComplete
                      ? 'border-emerald-500/25 bg-[#131A26] hover:border-emerald-400/50'
                      : row.hasAnyData
                        ? 'border-amber-400/25 bg-[#131A26] hover:border-amber-400/50'
                        : 'border-white/10 bg-[#121824] hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold tabular-nums text-white">
                    {formatShortDayMonth(row.date)}
                  </span>
                  {row.isComplete ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 text-emerald-400 shrink-0"
                      aria-label="Попълнен"
                    />
                  ) : row.hasAnyData ? (
                    <Check
                      className="h-3.5 w-3.5 text-amber-300 shrink-0"
                      aria-label="Частично попълнен"
                    />
                  ) : (
                    <CircleDashed
                      className="h-3.5 w-3.5 text-slate-600 shrink-0"
                      aria-label="Празен"
                    />
                  )}
                </div>

                <div className="mt-1 text-[10px] font-medium">
                  {row.isYesterday ? (
                    <span className="text-sky-300">Вчера</span>
                  ) : row.isComplete ? (
                    <span className="text-emerald-300">Попълнен</span>
                  ) : row.hasAnyData ? (
                    <span className="text-amber-300">Частичен</span>
                  ) : (
                    <span className="text-slate-500">Празен</span>
                  )}
                </div>

                <div className="mt-1.5 space-y-0.5 font-mono text-[10px] tabular-nums text-slate-300">
                  <div className="truncate">
                    {row.weightKg !== null ? `${formatNumberBg(row.weightKg)} kg` : '— kg'}
                    {row.sleepHours !== null ? ` · ${formatNumberBg(row.sleepHours)}ч` : ''}
                  </div>
                  <div className="truncate text-slate-400">
                    {row.steps !== null ? `${formatNumberBg(row.steps)} кр.` : '— кр.'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* SVG Графики: Дневни крачки и Приети vs Изгорени калории (TDEE) */}
      <DailyActivityEnergyCharts
        dailyLogs={dailyLogs}
        dailyStepsGoal={effectiveStepsGoal}
        latestWeightKg={referenceWeightForProtein?.value ?? null}
        profileHeightCm={profileHeightCm}
        todayKey={todayKey}
      />

      {/* История на записаните дневни записи */}
      <div className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
          <h2 className="font-display text-lg font-bold text-white">
            История на дневните записи
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Общо {dailyLogs.length} записа
          </span>
        </div>

        {dailyLogs.length === 0 ? (
          <p
            data-testid="checkin-empty-history"
            className="py-8 text-center text-sm text-slate-400"
          >
            Все още нямаш записани дни. Попълни формата по-горе, за да започнеш проследяването.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table
              data-testid="checkin-history-table"
              className="w-full border-collapse text-left text-xs"
            >
              <thead>
                <tr className="border-b border-white/10 text-[11px] font-medium text-slate-400">
                  <th className="py-2 pr-4">Дата</th>
                  <th className="py-2 pr-4 text-right">Тегло</th>
                  <th className="py-2 pr-4 text-right">Сън</th>
                  <th className="py-2 pr-4 text-right">Пулс</th>
                  <th className="py-2 pr-4 text-right">Крачки</th>
                  <th className="py-2 pr-4 text-right">Приети / TDEE</th>
                  <th className="py-2 pr-4 text-right">Баланс</th>
                  <th className="py-2 pr-4 text-right">Протеин</th>
                  <th className="py-2 pr-4 text-right">Навици</th>
                  <th className="py-2 pr-4">Бележка</th>
                  <th className="py-2 text-right">Действие</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {dailyLogs.map((log) => {
                  const rowEnergy = computeDailyEnergySummary({
                    caloriesIntake: log.caloriesKcal,
                    activeCalories: log.activeCalories,
                    restingCalories: log.restingCalories,
                    weightKg: log.weightKg ?? referenceWeightForProtein?.value,
                    heightCm: profileHeightCm,
                  });
                  const isEditing = log.date === selectedDate;
                  return (
                    <tr
                      key={log.date}
                      className={`h-10 transition-colors hover:bg-white/[0.03] ${
                        isEditing ? 'bg-[var(--accent-soft)]/30' : ''
                      }`}
                    >
                      <td className="py-2 pr-4 font-mono tabular-nums font-medium text-white whitespace-nowrap">
                        {formatBgNumericDate(log.date)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {log.weightKg !== undefined
                          ? `${formatNumberBg(log.weightKg)} kg`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {log.sleepHours !== undefined
                          ? `${formatNumberBg(log.sleepHours)} ч`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {log.restingHr !== undefined ? `${log.restingHr} bpm` : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap ${
                          log.steps === undefined
                            ? 'text-slate-500'
                            : log.steps >= effectiveStepsGoal
                              ? 'text-emerald-400'
                              : log.steps < 6000
                                ? 'text-amber-300'
                                : 'text-slate-200'
                        }`}
                      >
                        {log.steps !== undefined ? formatNumberBg(log.steps) : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {log.caloriesKcal !== undefined || rowEnergy.tdee !== null
                          ? `${
                              log.caloriesKcal !== undefined
                                ? formatNumberBg(log.caloriesKcal)
                                : '—'
                            } / ${
                              rowEnergy.tdee !== null
                                ? formatNumberBg(rowEnergy.tdee)
                                : '—'
                            }`
                          : '—'}
                      </td>
                      <td
                        className={`py-2 pr-4 text-right font-mono tabular-nums whitespace-nowrap ${
                          rowEnergy.status === 'deficit'
                            ? 'text-emerald-400'
                            : rowEnergy.status === 'surplus'
                              ? 'text-amber-300'
                              : 'text-slate-400'
                        }`}
                      >
                        {rowEnergy.netBalance !== null
                          ? `${rowEnergy.netBalance > 0 ? '+' : ''}${rowEnergy.netBalance}`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                        {log.proteinGrams !== undefined
                          ? `${formatNumberBg(log.proteinGrams)} g`
                          : '—'}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {log.completedHabits.length}
                      </td>
                      <td className="max-w-[180px] truncate py-2 pr-4 text-slate-400">
                        {log.notes || '—'}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDate(log.date);
                            setFeedback(null);
                            formRef.current?.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            });
                          }}
                          className="text-xs font-medium text-[var(--accent-text)] hover:underline whitespace-nowrap"
                        >
                          Редактирай
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Компактен статус за автоматичния сейф на базата данни */}
      {backupStatus && (
        <div
          data-testid="checkin-backup-status-badge"
          className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-3 text-xs text-slate-400"
        >
          <span className="font-medium text-emerald-300">
            🛡️ Авто-сейф: {backupStatus.count}/{backupStatus.limit} копия (активен)
          </span>
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {backupStatus.latestDate
              ? `Последно копие: ${formatBgNumericDate(backupStatus.latestDate)} · По-старите от 10 отиват в Кошчето`
              : 'Автоматична защита на database.json'}
          </span>
        </div>
      )}
    </section>
  );
}
