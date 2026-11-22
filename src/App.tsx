import { useEffect, useMemo, useRef, useState } from 'react';
import { AnalysisPreparationPage } from './components/AnalysisPreparationPage';
import { BodyComparisonStage } from './components/BodyComparisonStage';
import { DailyCheckInPage } from './components/DailyCheckInPage';
import { DataPortabilityBar } from './components/DataPortabilityBar';
import { DatabaseHistoryTable } from './components/DatabaseHistoryTable';
import { GoalsSection } from './components/GoalsSection';
import { HeaderBar } from './components/HeaderBar';
import { HevyWorkoutsPage } from './components/HevyWorkoutsPage';
import { IntelligentCoachPage } from './components/IntelligentCoachPage';
import { ManualBackupBar } from './components/ManualBackupBar';
import { MuscleGroupCards } from './components/MuscleGroupCards';
import { MuscleGrowthChart } from './components/MuscleGrowthChart';
import { PastDayCalendarPanel } from './components/PastDayCalendarPanel';
import { ProfileSleepToolbar } from './components/ProfileSleepToolbar';
import { SleepRecoveryAdvicePanel } from './components/SleepRecoveryAdvicePanel';
import { WeeklyScorecardBanner } from './components/WeeklyScorecardBanner';
import { WeeklyScorecardPanel } from './components/coach/WeeklyScorecardPanel';
import { CloudSyncModal } from './components/CloudSyncModal';
import { OfflineStatusBanner } from './components/PWAInstallButton';
import { processHevyAutoSync } from './services/hevyAutoSync';
import {
  checkForNewerGistVersionOnStartup,
  isBrowserOnline,
  isLocalServerHost,
  loadDiaryStateHybrid,
  loadGistConfig,
  saveDiaryStateHybrid,
  type CloudSyncStatus,
} from './services/storageService';
import { isWeeklyReviewBannerDay } from './utils/weeklyScorecard';
import {
  DEFAULT_DAILY_STEPS_GOAL,
  DEFAULT_HABIT_ITEMS,
  deleteDailyBiometricLog,
  getLatestDailyWeight,
  sanitizeDailyStepsGoal,
  sanitizeHabitItemsArray,
  upsertDailyBiometricLog,
} from './utils/dailyLogs';
import {
  getLocationHash,
  getLocationKey,
  loadPreviousLocation,
  normalizeLocation,
  parseLocationFromHash,
  savePreviousLocation,
  type AppPage,
  type NavLocation,
} from './utils/navigation';
import {
  normalizeExerciseKey,
  sanitizeCustomExerciseMappings,
} from './utils/exerciseMuscleEngine';
import {
  DEFAULT_TRAINING_GOAL,
  sanitizeSubPriorities,
  sanitizeTargetWeight,
  sanitizeTrainingGoal,
} from './utils/hiddenProgressAndEnvironment';
import type {
  BodyView,
  CoachSubPriority,
  CustomExerciseMapping,
  CustomExerciseMappings,
  DailyBiometricLog,
  DayLog,
  DiaryState,
  FitnessGoal,
  HevyWorkout,
  MuscleAllocationConfig,
  MuscleGainMode,
  MuscleId,
  RecoveryMode,
  SupplementCycleConfig,
  ThemeAccent,
  TrainingGoalPhase,
  UserProfile,
} from './types/fitness';
import {
  DEFAULT_SLEEP_HOURS,
  MUSCLE_GROUPS,
  applyAutoDailyRollover,
  clampDailyMuscleGainGrams,
  clampHuaweiSleepScore,
  clampManualDayGainGrams,
  clampManualRecoveryPercent,
  clampSleepHours,
  computeStatsUpToDate,
  createInitialDiaryState,
  createSampleDiaryLogs,
  createSampleGoals,
  getAllocationConfigFromState,
  getLatestPastLoggedDate,
  getLocalDateKey,
  roundGrams,
  sanitizeBodyMeasurements,
  sanitizeManualMuscleGramsMap,
  sanitizeMusclePercentMap,
  shiftDateKey,
  type HuaweiSleepImportEntry,
} from './utils/fitnessMath';

export default function App() {
  const todayKey = useMemo(() => getLocalDateKey(), []);

  const [state, setState] = useState<DiaryState>(() => createInitialDiaryState());
  const stateRef = useRef<DiaryState>(state);
  stateRef.current = state;

  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [bodyView, setBodyView] = useState<BodyView>('front');
  const [pastDate, setPastDate] = useState<string>(() => shiftDateKey(todayKey, -1));
  const [calendarTargetDate, setCalendarTargetDate] = useState<string | null>(null);
  const [activeLocation, setActiveLocation] = useState<NavLocation>(() =>
    typeof window !== 'undefined'
      ? parseLocationFromHash(window.location.hash)
      : { page: 'checkin' },
  );
  const activeLocationRef = useRef<NavLocation>(activeLocation);
  activeLocationRef.current = activeLocation;

  const [previousLocation, setPreviousLocation] = useState<NavLocation | null>(
    () => loadPreviousLocation(),
  );

  const activePage: AppPage = activeLocation.page;

  const [weeklyBannerDismissed, setWeeklyBannerDismissed] = useState(false);
  const showWeeklyBanner = useMemo(
    () =>
      !weeklyBannerDismissed &&
      !(
        activeLocation.page === 'analysis' &&
        activeLocation.analysisSubTab === 'weekly-review'
      ) &&
      activeLocation.page !== 'weekly' &&
      isWeeklyReviewBannerDay(todayKey),
    [weeklyBannerDismissed, activeLocation, todayKey],
  );

  const [hevyAutoSyncNotice, setHevyAutoSyncNotice] = useState<{
    message: string;
    isNew: boolean;
  } | null>(null);

  const [cloudSyncModalOpen, setCloudSyncModalOpen] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>(() => {
    const cfg = loadGistConfig();
    if (!cfg.token || !cfg.gistId) return 'unconfigured';
    return isBrowserOnline() ? 'idle' : 'offline';
  });
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);

  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const profileSaveTimerRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const hevyAutoSyncInFlightRef = useRef(false);
  const hevyAutoSyncToastTimerRef = useRef<number | null>(null);

  function handleSyncStatusUpdate(status: CloudSyncStatus, message?: string) {
    setCloudSyncStatus(status);
    setCloudSyncMessage(message ?? null);
  }

  function persistHybrid(nextState: DiaryState): Promise<void> {
    return saveDiaryStateHybrid(nextState, {
      onSyncStatusChange: handleSyncStatusUpdate,
    }).then(() => undefined);
  }

  function enqueuePersist(nextState: DiaryState) {
    saveQueueRef.current = saveQueueRef.current
      .then(() => persistHybrid(nextState))
      .catch((err) => {
        console.error('Failed to persist diary state:', err);
      });
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const { state: fetched } = await loadDiaryStateHybrid();
        if (!active) return;

        let resolvedState = fetched;
        const isDemoRequested =
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('demo') === '1';

        if (isDemoRequested && Object.keys(fetched.logs).length === 0) {
          resolvedState = {
            ...fetched,
            profile: fetched.profile.name
              ? fetched.profile
              : { name: 'Александър', heightCm: 181, weightKg: 79 },
            logs: createSampleDiaryLogs(todayKey),
            goals: fetched.goals.some((g) => g.enabled)
              ? fetched.goals
              : createSampleGoals(todayKey),
          };
          enqueuePersist(resolvedState);
        }

        const rolledOver = applyAutoDailyRollover(resolvedState, todayKey);
        if (rolledOver.changed) {
          resolvedState = rolledOver.state;
          enqueuePersist(resolvedState);
        }

        stateRef.current = resolvedState;
        setState(resolvedState);
        const latestPast = getLatestPastLoggedDate(resolvedState.logs, todayKey);
        if (latestPast) {
          setPastDate(latestPast);
        }
        setLoaded(true);

        // Background non-blocking check for a newer GitHub Gist version on startup
        const gistCfg = loadGistConfig();
        if (gistCfg.token && gistCfg.gistId) {
          if (!isBrowserOnline()) {
            handleSyncStatusUpdate('offline');
          } else {
            handleSyncStatusUpdate('syncing');
            const cloudCheck = await checkForNewerGistVersionOnStartup({
              currentLocalState: resolvedState,
            });
            if (!active) return;
            if (cloudCheck.offline) {
              handleSyncStatusUpdate('offline');
            } else if (cloudCheck.error) {
              handleSyncStatusUpdate('error', cloudCheck.error);
            } else {
              if (cloudCheck.updatedFromCloud && cloudCheck.state) {
                stateRef.current = cloudCheck.state;
                setState(cloudCheck.state);
                const cloudPast = getLatestPastLoggedDate(
                  cloudCheck.state.logs,
                  todayKey,
                );
                if (cloudPast) setPastDate(cloudPast);
              }
              handleSyncStatusUpdate('synced');
            }
          }
        }
      } catch (err) {
        if (!active) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : 'Неуспешно зареждане на локалната база данни.',
        );
        setLoaded(true);
      }
    }

    void bootstrap();

    return () => {
      active = false;
      if (profileSaveTimerRef.current !== null) {
        window.clearTimeout(profileSaveTimerRef.current);
      }
    };
  }, [todayKey]);

  // Автоматично обновяване на статуса при загуба/възстановяване на интернет връзка на телефона
  useEffect(() => {
    if (!loaded || typeof window === 'undefined') return;
    let active = true;

    function handleOffline() {
      const cfg = loadGistConfig();
      if (cfg.token && cfg.gistId) {
        handleSyncStatusUpdate('offline', 'Офлайн — промените се пазят локално');
      }
    }

    async function handleOnline() {
      const cfg = loadGistConfig();
      if (!cfg.token || !cfg.gistId || !active) return;
      handleSyncStatusUpdate('syncing');
      try {
        const cloudCheck = await checkForNewerGistVersionOnStartup({
          currentLocalState: stateRef.current,
        });
        if (!active) return;
        if (cloudCheck.error) {
          handleSyncStatusUpdate('error', cloudCheck.error);
          return;
        }
        if (cloudCheck.updatedFromCloud && cloudCheck.state) {
          stateRef.current = cloudCheck.state;
          setState(cloudCheck.state);
          const cloudPast = getLatestPastLoggedDate(cloudCheck.state.logs, todayKey);
          if (cloudPast) setPastDate(cloudPast);
          handleSyncStatusUpdate('synced');
        } else {
          // Push any offline local edits made while disconnected
          await saveDiaryStateHybrid(stateRef.current, {
            onSyncStatusChange: handleSyncStatusUpdate,
          });
        }
      } catch {
        if (active) {
          handleSyncStatusUpdate('error', 'Неуспешна автоматична синхронизация след връщане онлайн.');
        }
      }
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      active = false;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [loaded, todayKey]);

  useEffect(() => {
    if (!loaded || !state.autoAccrueDaily) return;
    const timerId = window.setInterval(() => {
      const currentKey = getLocalDateKey();
      const rolled = applyAutoDailyRollover(stateRef.current, currentKey);
      if (rolled.changed) {
        stateRef.current = rolled.state;
        setState(rolled.state);
        enqueuePersist(rolled.state);
      }
    }, 60000);
    return () => window.clearInterval(timerId);
  }, [loaded, state.autoAccrueDaily]);

  // Автоматично засичане и импорт на workouts*.csv от Downloads САМО на локалния сървър (localhost/127.0.0.1)
  useEffect(() => {
    if (!loaded || typeof window === 'undefined' || !isLocalServerHost()) return;
    let active = true;

    async function runHevyDownloadsCheck() {
      if (!active || hevyAutoSyncInFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      hevyAutoSyncInFlightRef.current = true;
      try {
        const result = await processHevyAutoSync({
          existingWorkouts: stateRef.current.hevyWorkouts ?? [],
          onSaveWorkouts: handleSaveHevyWorkouts,
        });
        if (!active || !result.synced) return;

        const message =
          result.addedCount > 0
            ? `⚡ Автоматично синхронизирани ${result.addedCount} нови тренировки от Hevy!`
            : `⚡ Hevy файлът (${result.filename}) е проверен — всички ${result.totalParsed} тренировки вече са синхронизирани.`;

        setHevyAutoSyncNotice({
          message,
          isNew: result.addedCount > 0,
        });

        if (hevyAutoSyncToastTimerRef.current !== null) {
          window.clearTimeout(hevyAutoSyncToastTimerRef.current);
        }
        hevyAutoSyncToastTimerRef.current = window.setTimeout(() => {
          setHevyAutoSyncNotice(null);
        }, 12000);
      } catch (err) {
        console.error('Hevy auto-sync error:', err);
      } finally {
        hevyAutoSyncInFlightRef.current = false;
      }
    }

    // Проверка веднага при зареждане
    void runHevyDownloadsCheck();

    // Проверка на всеки 5 секунди докато табът е активен
    const intervalId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void runHevyDownloadsCheck();
    }, 5000);

    // Незабавна проверка при връщане в таба (след клик на Export Workouts в Hevy)
    function handleWindowFocusOrVisible() {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      void runHevyDownloadsCheck();
    }

    window.addEventListener('focus', handleWindowFocusOrVisible);
    document.addEventListener('visibilitychange', handleWindowFocusOrVisible);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleWindowFocusOrVisible);
      document.removeEventListener('visibilitychange', handleWindowFocusOrVisible);
      if (hevyAutoSyncToastTimerRef.current !== null) {
        window.clearTimeout(hevyAutoSyncToastTimerRef.current);
      }
    };
  }, [loaded]);

  useEffect(() => {
    document.documentElement.setAttribute('data-accent', state.themeAccent);
  }, [state.themeAccent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function syncLocationFromHash() {
      const next = parseLocationFromHash(window.location.hash);
      const current = activeLocationRef.current;
      if (getLocationKey(next) !== getLocationKey(current)) {
        setPreviousLocation(current);
        savePreviousLocation(current);
      }
      setActiveLocation(next);
    }

    if (!window.location.hash) {
      window.history.replaceState(
        null,
        '',
        getLocationHash(activeLocationRef.current),
      );
    }

    window.addEventListener('hashchange', syncLocationFromHash);
    window.addEventListener('popstate', syncLocationFromHash);
    return () => {
      window.removeEventListener('hashchange', syncLocationFromHash);
      window.removeEventListener('popstate', syncLocationFromHash);
      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }
    };
  }, []);

  function navigateToLocation(
    rawLocation: NavLocation,
    scrollTargetId?: string,
    focusIfInput: boolean = false,
  ) {
    const next = normalizeLocation(rawLocation);
    const current = activeLocationRef.current;
    if (getLocationKey(next) !== getLocationKey(current)) {
      setPreviousLocation(current);
      savePreviousLocation(current);
    }
    activeLocationRef.current = next;
    setActiveLocation(next);

    if (typeof window !== 'undefined') {
      const nextHash = getLocationHash(next);
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }

      if (scrollTimerRef.current !== null) {
        window.clearTimeout(scrollTimerRef.current);
      }

      if (scrollTargetId) {
        scrollTimerRef.current = window.setTimeout(() => {
          const el = document.getElementById(scrollTargetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (focusIfInput && el instanceof HTMLInputElement) {
              el.focus({ preventScroll: true });
            }
          }
        }, 40);
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }

  function navigateToPage(
    page: AppPage,
    scrollTargetId?: string,
    focusIfInput: boolean = false,
  ) {
    navigateToLocation({ page }, scrollTargetId, focusIfInput);
  }

  const allocationConfig = useMemo(
    () => getAllocationConfigFromState(state),
    [state.muscleAllocationMode, state.muscleAllocationScope, state.muscleAllocations],
  );

  const availablePastDates = useMemo(() => {
    return Object.keys(state.logs)
      .filter((d) => {
        if (d >= todayKey) return false;
        const entry = state.logs[d];
        return (
          entry.muscles.length > 0 ||
          Boolean(entry.trained) ||
          (entry.muscleGainMode === 'manual' && (entry.manualGainGrams ?? 0) > 0) ||
          Boolean(state.accrueOnRestDays && state.dailyMuscleGainGrams)
        );
      })
      .sort();
  }, [state.logs, todayKey, state.accrueOnRestDays, state.dailyMuscleGainGrams]);

  const todayStats = useMemo(
    () =>
      computeStatsUpToDate(
        state.logs,
        todayKey,
        state.dailyMuscleGainGrams,
        state.accrueOnRestDays,
        allocationConfig,
      ),
    [
      state.logs,
      todayKey,
      state.dailyMuscleGainGrams,
      state.accrueOnRestDays,
      allocationConfig,
    ],
  );

  const pastStats = useMemo(
    () =>
      computeStatsUpToDate(
        state.logs,
        pastDate,
        state.dailyMuscleGainGrams,
        state.accrueOnRestDays,
        allocationConfig,
      ),
    [
      state.logs,
      pastDate,
      state.dailyMuscleGainGrams,
      state.accrueOnRestDays,
      allocationConfig,
    ],
  );

  const todayEntry = state.logs[todayKey];
  const loggedDaysCount = useMemo(() => Object.keys(state.logs).length, [state.logs]);
  const todayTrained = Boolean(
    todayEntry && (todayEntry.trained || todayEntry.muscles.length > 0),
  );
  const activeTrainingGoal: TrainingGoalPhase =
    state.userSettings?.goal ?? DEFAULT_TRAINING_GOAL;
  const latestBodyWeightKg = useMemo(
    () => getLatestDailyWeight(state.dailyLogs ?? [], state.profile.weightKg),
    [state.dailyLogs, state.profile.weightKg],
  );

  function commitState(updater: (prev: DiaryState) => DiaryState) {
    const nextState = updater(stateRef.current);
    stateRef.current = nextState;
    setState(nextState);
    enqueuePersist(nextState);
  }

  function handleThemeChange(accent: ThemeAccent) {
    commitState((prev) => ({ ...prev, themeAccent: accent }));
  }

  function handleProfileChange(profile: UserProfile) {
    const nextState: DiaryState = { ...stateRef.current, profile };
    stateRef.current = nextState;
    setState(nextState);

    if (profileSaveTimerRef.current !== null) {
      window.clearTimeout(profileSaveTimerRef.current);
    }
    profileSaveTimerRef.current = window.setTimeout(() => {
      enqueuePersist(stateRef.current);
    }, 300);
  }

  function handleTodaySleepChange(hours: number) {
    const cleanHours = clampSleepHours(hours);
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: {
            ...existing,
            sleepHours: cleanHours,
          },
        },
      };
    });
  }

  function handleTodayHuaweiScoreChange(rawScore: number | undefined) {
    const cleanScore = clampHuaweiSleepScore(rawScore);
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const nextEntry: DayLog = {
        ...existing,
        recoveryMode: 'auto',
      };
      if (cleanScore !== undefined) {
        nextEntry.huaweiSleepScore = cleanScore;
      } else {
        delete nextEntry.huaweiSleepScore;
      }
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: nextEntry,
        },
      };
    });
  }

  function handleTodayRecoveryModeChange(
    mode: RecoveryMode,
    manualPercent?: number,
  ) {
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const cleanManual = clampManualRecoveryPercent(manualPercent);
      const nextEntry: DayLog = {
        ...existing,
        recoveryMode: mode,
      };
      if (mode === 'manual' && cleanManual !== undefined) {
        nextEntry.manualRecoveryPercent = cleanManual;
      }
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: nextEntry,
        },
      };
    });
  }

  function handleDailyBaseGainChange(rawGrams: number | undefined) {
    const cleanGrams = clampDailyMuscleGainGrams(rawGrams);
    commitState((prev) => {
      const nextState: DiaryState = { ...prev };
      if (cleanGrams !== undefined) {
        nextState.dailyMuscleGainGrams = cleanGrams;
      } else {
        delete nextState.dailyMuscleGainGrams;
      }

      const existing = prev.logs[todayKey];
      if (existing) {
        const updatedToday: DayLog = {
          ...existing,
          muscleGainMode: 'auto',
        };
        delete updatedToday.baseDailyGainGrams;
        nextState.logs = {
          ...prev.logs,
          [todayKey]: updatedToday,
        };
      }
      return nextState;
    });
  }

  function handleTodayMuscleGainModeChange(
    mode: MuscleGainMode,
    manualGrams?: number,
  ) {
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const cleanManual = clampManualDayGainGrams(manualGrams);
      const nextEntry: DayLog = {
        ...existing,
        muscleGainMode: mode,
      };
      delete nextEntry.manualMuscleGrams;
      if (mode === 'manual') {
        nextEntry.manualGainGrams = cleanManual ?? 0;
      }
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: nextEntry,
        },
      };
    });
  }

  function handleAllocationChange(next: MuscleAllocationConfig) {
    const cleanPercents = sanitizeMusclePercentMap(next.percents);
    commitState((prev) => {
      const nextState: DiaryState = {
        ...prev,
      };
      if (next.mode === 'custom_percent') {
        nextState.muscleAllocationMode = 'custom_percent';
      } else {
        delete nextState.muscleAllocationMode;
      }
      if (next.scope) {
        nextState.muscleAllocationScope = next.scope;
      } else {
        delete nextState.muscleAllocationScope;
      }
      if (cleanPercents) {
        nextState.muscleAllocations = cleanPercents;
      } else {
        delete nextState.muscleAllocations;
      }
      return nextState;
    });
  }

  function handleTodayPerMuscleManualChange(nextMap: Partial<Record<MuscleId, number>>) {
    const sanitized = sanitizeManualMuscleGramsMap(nextMap) ?? {};
    const total = roundGrams(
      MUSCLE_GROUPS.reduce((sum, m) => sum + (sanitized[m.id] ?? 0), 0),
    );
    const activeMuscles = MUSCLE_GROUPS.filter((m) => (sanitized[m.id] ?? 0) > 0).map(
      (m) => m.id,
    );

    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const nextEntry: DayLog = {
        ...existing,
        muscleGainMode: 'manual',
        manualGainGrams: total,
        manualMuscleGrams: sanitized,
        trained: total > 0,
        muscles: activeMuscles,
      };
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: nextEntry,
        },
      };
    });
  }

  function handleClearTodayPerMuscleManual() {
    commitState((prev) => {
      const existing = prev.logs[todayKey];
      if (!existing) return prev;
      const nextEntry: DayLog = {
        ...existing,
        muscleGainMode: 'auto',
      };
      delete nextEntry.manualMuscleGrams;
      delete nextEntry.manualGainGrams;
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: nextEntry,
        },
      };
    });
  }

  function handleApplyHuaweiImport(entries: HuaweiSleepImportEntry[]) {
    commitState((prev) => {
      const nextLogs = { ...prev.logs };
      for (const item of entries) {
        const existing = nextLogs[item.date] ?? {
          date: item.date,
          sleepHours: DEFAULT_SLEEP_HOURS,
          muscles: [],
        };
        nextLogs[item.date] = {
          ...existing,
          recoveryMode: 'auto',
          ...(item.sleepHours !== undefined ? { sleepHours: item.sleepHours } : {}),
          ...(item.huaweiSleepScore !== undefined
            ? { huaweiSleepScore: item.huaweiSleepScore }
            : {}),
        };
      }
      return {
        ...prev,
        logs: nextLogs,
      };
    });
  }

  function handleToggleTodayMuscle(muscleId: MuscleId) {
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const hasMuscle = existing.muscles.includes(muscleId);
      const nextMuscles = hasMuscle
        ? existing.muscles.filter((id) => id !== muscleId)
        : [...existing.muscles, muscleId];
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: {
            ...existing,
            trained: nextMuscles.length > 0,
            muscles: nextMuscles,
          },
        },
      };
    });
  }

  function handleToggleTodayTrained() {
    commitState((prev) => {
      const existing = prev.logs[todayKey] ?? {
        date: todayKey,
        sleepHours: DEFAULT_SLEEP_HOURS,
        muscles: [],
      };
      const currentlyTrained = Boolean(existing.trained || existing.muscles.length > 0);
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [todayKey]: {
            ...existing,
            trained: !currentlyTrained,
            ...(currentlyTrained ? { muscles: [] } : {}),
          },
        },
      };
    });
  }

  function handleToggleDateTrained(dateKey: string) {
    commitState((prev) => {
      const existing = prev.logs[dateKey];
      if (!existing) return prev;
      const currentlyTrained = Boolean(existing.trained || existing.muscles.length > 0);
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [dateKey]: {
            ...existing,
            trained: !currentlyTrained,
            ...(currentlyTrained ? { muscles: [] } : {}),
          },
        },
      };
    });
  }

  function handleAutoAccrueDailyChange(next: boolean) {
    commitState((prev) => {
      const baseState: DiaryState = {
        ...prev,
        ...(next ? { autoAccrueDaily: true } : {}),
      };
      if (!next) {
        delete baseState.autoAccrueDaily;
        return baseState;
      }
      return applyAutoDailyRollover(baseState, todayKey).state;
    });
  }

  function handleAccrueOnRestDaysChange(next: boolean) {
    commitState((prev) => {
      const nextState: DiaryState = { ...prev };
      if (next) {
        nextState.accrueOnRestDays = true;
      } else {
        delete nextState.accrueOnRestDays;
      }
      return nextState;
    });
  }

  function handleSimulateNextDay() {
    commitState((prev) => {
      const sorted = Object.keys(prev.logs).sort();
      const baseDate = sorted.length > 0 ? sorted[sorted.length - 1] : shiftDateKey(todayKey, -1);
      const nextDate = shiftDateKey(baseDate, 1);
      return {
        ...prev,
        logs: {
          ...prev.logs,
          [nextDate]: {
            date: nextDate,
            sleepHours: DEFAULT_SLEEP_HOURS,
            trained: false,
            muscles: [],
          },
        },
      };
    });
  }

  function handleApplyBulkBackfill(mergedLogs: Record<string, DayLog>) {
    commitState((prev) => ({
      ...prev,
      logs: mergedLogs,
    }));
    const latest = getLatestPastLoggedDate(mergedLogs, todayKey);
    if (latest) {
      setPastDate(latest);
    }
  }

  function handleUpdateGoal(slotIndex: 1 | 2 | 3, nextGoal: FitnessGoal) {
    commitState((prev) => ({
      ...prev,
      goals: prev.goals.map((g) => (g.slotIndex === slotIndex ? nextGoal : g)),
    }));
  }

  function handleSaveDayLog(log: DayLog, fillEmptyToToday: boolean = false) {
    const cleanedMeasurements = sanitizeBodyMeasurements(log);
    const cleanScore = clampHuaweiSleepScore(log.huaweiSleepScore);
    const cleanManualPct = clampManualRecoveryPercent(log.manualRecoveryPercent);
    const cleanBaseGrams = clampDailyMuscleGainGrams(log.baseDailyGainGrams);
    const cleanManualGrams = clampManualDayGainGrams(log.manualGainGrams);
    const cleanManualMuscleGrams = sanitizeManualMuscleGramsMap(log.manualMuscleGrams);

    commitState((prev) => {
      const nextLogs: Record<string, DayLog> = {
        ...prev.logs,
        [log.date]: {
          date: log.date,
          sleepHours: clampSleepHours(log.sleepHours),
          ...(cleanScore !== undefined ? { huaweiSleepScore: cleanScore } : {}),
          ...(log.recoveryMode !== undefined ? { recoveryMode: log.recoveryMode } : {}),
          ...(cleanManualPct !== undefined
            ? { manualRecoveryPercent: cleanManualPct }
            : {}),
          ...(log.muscleGainMode !== undefined ? { muscleGainMode: log.muscleGainMode } : {}),
          ...(cleanBaseGrams !== undefined ? { baseDailyGainGrams: cleanBaseGrams } : {}),
          ...(cleanManualGrams !== undefined ? { manualGainGrams: cleanManualGrams } : {}),
          ...(cleanManualMuscleGrams !== undefined
            ? { manualMuscleGrams: cleanManualMuscleGrams }
            : {}),
          trained: Boolean(log.trained || log.muscles.length > 0),
          muscles: Array.from(new Set(log.muscles)),
          ...cleanedMeasurements,
        },
      };

      if (fillEmptyToToday && log.date < todayKey) {
        const cleanMuscles = Array.from(new Set(log.muscles));
        const cleanSleep = clampSleepHours(log.sleepHours);
        let cursor = shiftDateKey(log.date, 1);
        let guard = 0;
        while (cursor <= todayKey && guard < 3660) {
          guard += 1;
          if (!nextLogs[cursor]) {
            nextLogs[cursor] = {
              date: cursor,
              sleepHours: cleanSleep,
              ...(log.muscleGainMode !== undefined ? { muscleGainMode: log.muscleGainMode } : {}),
              ...(cleanBaseGrams !== undefined ? { baseDailyGainGrams: cleanBaseGrams } : {}),
              ...(cleanManualGrams !== undefined ? { manualGainGrams: cleanManualGrams } : {}),
              trained: Boolean(log.trained || cleanMuscles.length > 0 || (cleanManualGrams ?? 0) > 0),
              muscles: cleanMuscles,
            };
          }
          cursor = shiftDateKey(cursor, 1);
        }
      }

      return {
        ...prev,
        profile:
          log.date === todayKey && cleanedMeasurements.weightKg !== undefined
            ? { ...prev.profile, weightKg: cleanedMeasurements.weightKg }
            : prev.profile,
        logs: nextLogs,
      };
    });

    if (log.date < todayKey && log.muscles.length > 0) {
      setPastDate(log.date);
    }
  }

  function handleDeleteDayLog(dateKey: string) {
    commitState((prev) => {
      const nextLogs = { ...prev.logs };
      delete nextLogs[dateKey];
      return { ...prev, logs: nextLogs };
    });
  }

  function handleLoadSampleWeek() {
    const sampleLogs = createSampleDiaryLogs(todayKey);
    commitState((prev) => ({
      ...prev,
      logs: {
        ...sampleLogs,
        ...prev.logs,
      },
      goals: prev.goals.some((g) => g.enabled)
        ? prev.goals
        : createSampleGoals(todayKey),
    }));
    const latest = getLatestPastLoggedDate(sampleLogs, todayKey);
    if (latest) setPastDate(latest);
  }

  function handleImportState(next: DiaryState) {
    commitState(() => next);
    const latest = getLatestPastLoggedDate(next.logs, todayKey);
    if (latest) {
      setPastDate(latest);
    }
  }

  async function handleSaveHevyWorkouts(nextWorkouts: HevyWorkout[]) {
    const prevState = stateRef.current;
    const nextState: DiaryState = {
      ...prevState,
      ...(nextWorkouts.length > 0 ? { hevyWorkouts: nextWorkouts } : {}),
    };
    if (nextWorkouts.length === 0) {
      delete nextState.hevyWorkouts;
    }

    stateRef.current = nextState;
    setState(nextState);

    const persistPromise = saveQueueRef.current.then(() =>
      persistHybrid(nextState),
    );
    saveQueueRef.current = persistPromise.catch((err) => {
      console.error('Failed to persist workouts:', err);
    });

    try {
      await persistPromise;
    } catch (err) {
      stateRef.current = prevState;
      setState(prevState);
      throw err;
    }
  }

  async function persistFullStateWithRollback(nextState: DiaryState) {
    const prevState = stateRef.current;
    stateRef.current = nextState;
    setState(nextState);

    const persistPromise = saveQueueRef.current.then(() =>
      persistHybrid(nextState),
    );
    saveQueueRef.current = persistPromise.catch((err) => {
      console.error('Failed to persist diary state:', err);
    });

    try {
      await persistPromise;
    } catch (err) {
      stateRef.current = prevState;
      setState(prevState);
      throw err;
    }
  }

  async function handleSaveDailyBiometricLog(entry: DailyBiometricLog) {
    const prevState = stateRef.current;
    const nextDailyLogs = upsertDailyBiometricLog(
      prevState.dailyLogs ?? [],
      entry,
    );
    const nextState: DiaryState = {
      ...prevState,
      dailyLogs: nextDailyLogs,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleDeleteDailyBiometricLog(dateKey: string) {
    const prevState = stateRef.current;
    const nextDailyLogs = deleteDailyBiometricLog(
      prevState.dailyLogs ?? [],
      dateKey,
    );
    const nextState: DiaryState = {
      ...prevState,
      ...(nextDailyLogs.length > 0 ? { dailyLogs: nextDailyLogs } : {}),
    };
    if (nextDailyLogs.length === 0) {
      delete nextState.dailyLogs;
    }
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateHabitItems(nextHabits: string[]) {
    const prevState = stateRef.current;
    const cleaned = sanitizeHabitItemsArray(nextHabits) ?? [];
    const nextState: DiaryState = {
      ...prevState,
      habitItems: cleaned,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateDailyStepsGoal(nextGoal: number) {
    const prevState = stateRef.current;
    const cleaned = sanitizeDailyStepsGoal(nextGoal) ?? DEFAULT_DAILY_STEPS_GOAL;
    const nextState: DiaryState = {
      ...prevState,
      dailyStepsGoal: cleaned,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateTrainingGoal(nextGoal: TrainingGoalPhase) {
    const prevState = stateRef.current;
    const cleaned = sanitizeTrainingGoal(nextGoal) ?? DEFAULT_TRAINING_GOAL;
    const nextState: DiaryState = {
      ...prevState,
      userSettings: {
        ...(prevState.userSettings ?? { goal: DEFAULT_TRAINING_GOAL }),
        goal: cleaned,
      },
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateSubPriorities(
    nextSubPriorities: CoachSubPriority[],
  ) {
    const prevState = stateRef.current;
    const cleaned = sanitizeSubPriorities(nextSubPriorities);
    const prevSettings = prevState.userSettings ?? { goal: DEFAULT_TRAINING_GOAL };
    const nextSettings = {
      goal: prevSettings.goal ?? DEFAULT_TRAINING_GOAL,
      ...(prevSettings.intervalsApiKey
        ? { intervalsApiKey: prevSettings.intervalsApiKey }
        : {}),
      ...(prevSettings.targetWeight !== undefined
        ? { targetWeight: prevSettings.targetWeight }
        : {}),
      ...(cleaned && cleaned.length > 0 ? { subPriorities: cleaned } : {}),
    };
    const nextState: DiaryState = {
      ...prevState,
      userSettings: nextSettings,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateIntervalsApiKey(nextKey: string) {
    const prevState = stateRef.current;
    const cleanedKey = nextKey.trim().slice(0, 200);
    const prevSettings = prevState.userSettings ?? { goal: DEFAULT_TRAINING_GOAL };
    const nextSettings = {
      goal: prevSettings.goal ?? DEFAULT_TRAINING_GOAL,
      ...(cleanedKey ? { intervalsApiKey: cleanedKey } : {}),
      ...(prevSettings.targetWeight !== undefined
        ? { targetWeight: prevSettings.targetWeight }
        : {}),
      ...(prevSettings.subPriorities && prevSettings.subPriorities.length > 0
        ? { subPriorities: prevSettings.subPriorities }
        : {}),
    };
    const nextState: DiaryState = {
      ...prevState,
      userSettings: nextSettings,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleUpdateTargetWeight(nextWeight: number | undefined) {
    const prevState = stateRef.current;
    const cleaned = sanitizeTargetWeight(nextWeight);
    const prevSettings = prevState.userSettings ?? { goal: DEFAULT_TRAINING_GOAL };
    const nextSettings = {
      goal: prevSettings.goal ?? DEFAULT_TRAINING_GOAL,
      ...(prevSettings.intervalsApiKey
        ? { intervalsApiKey: prevSettings.intervalsApiKey }
        : {}),
      ...(cleaned !== undefined ? { targetWeight: cleaned } : {}),
      ...(prevSettings.subPriorities && prevSettings.subPriorities.length > 0
        ? { subPriorities: prevSettings.subPriorities }
        : {}),
    };
    const nextState: DiaryState = {
      ...prevState,
      userSettings: nextSettings,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleSaveSupplementCycle(config: SupplementCycleConfig) {
    const prevState = stateRef.current;
    const nextCycles: Record<string, SupplementCycleConfig> = {
      ...(prevState.supplementCycles ?? {}),
      [config.name]: config,
    };
    const nextState: DiaryState = {
      ...prevState,
      supplementCycles: nextCycles,
    };
    await persistFullStateWithRollback(nextState);
  }

  async function handleSaveAnalysisManualWeight(weightKg: number | undefined) {
    const prevState = stateRef.current;
    const nextState: DiaryState = {
      ...prevState,
      ...(weightKg !== undefined ? { analysisManualWeightKg: weightKg } : {}),
    };
    if (weightKg === undefined) {
      delete nextState.analysisManualWeightKg;
    }
    await persistFullStateWithRollback(nextState);
  }

  async function handleSaveCustomExerciseMapping(
    exerciseTitle: string,
    mapping: CustomExerciseMapping | null,
  ) {
    const cleanTitle = exerciseTitle.trim();
    if (!cleanTitle) return;
    const prevState = stateRef.current;
    const targetNorm = normalizeExerciseKey(cleanTitle);

    const nextMappings: CustomExerciseMappings = {};
    for (const [k, v] of Object.entries(prevState.customExerciseMappings ?? {})) {
      if (normalizeExerciseKey(k) !== targetNorm) {
        nextMappings[k] = v;
      }
    }

    if (mapping && mapping.primary.length > 0) {
      nextMappings[cleanTitle] = mapping;
    }

    const sanitized = sanitizeCustomExerciseMappings(nextMappings);
    const nextState: DiaryState = {
      ...prevState,
      ...(sanitized ? { customExerciseMappings: sanitized } : {}),
    };
    if (!sanitized) {
      delete nextState.customExerciseMappings;
    }
    await persistFullStateWithRollback(nextState);
  }

  function handleResetAll() {
    const fresh = createInitialDiaryState();
    commitState(() => fresh);
    setPastDate(shiftDateKey(todayKey, -1));
  }

  async function handleReloadAfterRestore() {
    const { state: refreshed } = await loadDiaryStateHybrid();
    stateRef.current = refreshed;
    setState(refreshed);
    const latestPast = getLatestPastLoggedDate(refreshed.logs, todayKey);
    if (latestPast) {
      setPastDate(latestPast);
    }
  }

  function handleApplyCloudSyncedState(nextState: DiaryState) {
    stateRef.current = nextState;
    setState(nextState);
    const latestPast = getLatestPastLoggedDate(nextState.logs, todayKey);
    if (latestPast) {
      setPastDate(latestPast);
    }
  }

  if (!loaded) {
    return (
      <div
        data-testid="database-loading-screen"
        className="flex min-h-screen items-center justify-center bg-[#080B11] px-4 text-slate-100"
      >
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F141F] p-8 text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[#3B82F6]" />
          <p className="mt-4 text-sm text-slate-300">
            Зареждане на личната фитнес база данни…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="top" className="flex min-h-screen flex-col bg-[#080B11] text-slate-100">
      <HeaderBar
        activeLocation={activeLocation}
        previousLocation={previousLocation}
        onNavigateLocation={(loc) => navigateToLocation(loc)}
        themeAccent={state.themeAccent}
        onThemeChange={handleThemeChange}
        cloudSyncStatus={cloudSyncStatus}
        onOpenCloudSync={() => setCloudSyncModalOpen(true)}
      />

      <OfflineStatusBanner />

      {loadError && (
        <div
          role="alert"
          className="border-b border-rose-500/35 bg-rose-950/30 px-4 py-2.5 text-center text-xs text-rose-300"
        >
          {loadError}
        </div>
      )}

      {hevyAutoSyncNotice && (
        <div
          role="status"
          data-testid="hevy-auto-sync-banner"
          className="border-b border-emerald-500/45 bg-emerald-950/55 px-4 py-2.5 text-xs text-emerald-100"
        >
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 sm:px-2">
            <span className="font-semibold text-emerald-200">
              {hevyAutoSyncNotice.message}
            </span>
            <button
              type="button"
              onClick={() => setHevyAutoSyncNotice(null)}
              aria-label="Затвори известието за Hevy синхронизация"
              className="rounded-md px-2 py-0.5 text-[11px] font-medium text-emerald-200/80 transition-colors hover:bg-emerald-500/20 hover:text-white whitespace-nowrap shrink-0"
            >
              Затвори
            </button>
          </div>
        </div>
      )}

      {showWeeklyBanner && (
        <WeeklyScorecardBanner
          dailyLogs={state.dailyLogs ?? []}
          hevyWorkouts={state.hevyWorkouts ?? []}
          habitItems={state.habitItems ?? DEFAULT_HABIT_ITEMS}
          profile={state.profile}
          todayKey={todayKey}
          dailyStepsGoal={state.dailyStepsGoal ?? DEFAULT_DAILY_STEPS_GOAL}
          onOpenWeeklyScorecard={() =>
            navigateToLocation({
              page: 'analysis',
              analysisSubTab: 'weekly-review',
            })
          }
          onDismiss={() => setWeeklyBannerDismissed(true)}
        />
      )}

      <main className="flex-1 [&>section:first-child]:border-t-0">
        {activePage === 'overview' && (
          <>
            <ProfileSleepToolbar
              todayKey={todayKey}
              logs={state.logs}
              profile={state.profile}
              onProfileChange={handleProfileChange}
              sleepHours={todayStats.sleepHours}
              onSleepChange={handleTodaySleepChange}
              huaweiSleepScore={todayEntry?.huaweiSleepScore}
              onHuaweiScoreChange={handleTodayHuaweiScoreChange}
              recoveryMode={todayStats.recovery.mode}
              manualRecoveryPercent={todayEntry?.manualRecoveryPercent}
              onRecoveryModeChange={handleTodayRecoveryModeChange}
              dailyBaseGainGrams={state.dailyMuscleGainGrams}
              onDailyBaseGainChange={handleDailyBaseGainChange}
              todayGainMode={todayStats.gainMode}
              manualTodayGainGrams={todayEntry?.manualGainGrams}
              onTodayGainModeChange={handleTodayMuscleGainModeChange}
              onApplyHuaweiImport={handleApplyHuaweiImport}
              recovery={todayStats.recovery}
              gainedTodayGrams={todayStats.gainedOnDateTotal}
              totalCumulativeGrams={todayStats.totalCumulativeGrams}
              loggedDaysCount={loggedDaysCount}
              todayTrained={todayTrained}
              onToggleTodayTrained={handleToggleTodayTrained}
              autoAccrueDaily={Boolean(state.autoAccrueDaily)}
              onAutoAccrueDailyChange={handleAutoAccrueDailyChange}
              accrueOnRestDays={Boolean(state.accrueOnRestDays)}
              onAccrueOnRestDaysChange={handleAccrueOnRestDaysChange}
              allocationConfig={allocationConfig}
              onApplyBackfill={handleApplyBulkBackfill}
              onJumpToAllocation={() => navigateToPage('muscles', 'muscle-allocation')}
            />

            <BodyComparisonStage
              bodyView={bodyView}
              onViewChange={setBodyView}
              pastDate={pastDate}
              onPastDateChange={setPastDate}
              availablePastDates={availablePastDates}
              pastStats={pastStats}
              todayStats={todayStats}
              todayKey={todayKey}
              onToggleTodayMuscle={handleToggleTodayMuscle}
              onLoadSampleWeek={handleLoadSampleWeek}
            />
          </>
        )}

        {activePage === 'muscles' && (
          <>
            <MuscleGroupCards
              todayStats={todayStats}
              todayEntry={todayEntry}
              dailyBaseGainGrams={state.dailyMuscleGainGrams}
              accrueOnRestDays={Boolean(state.accrueOnRestDays)}
              allocationConfig={allocationConfig}
              onToggleMuscle={handleToggleTodayMuscle}
              onAllocationChange={handleAllocationChange}
              onTodayPerMuscleManualChange={handleTodayPerMuscleManualChange}
              onClearTodayPerMuscleManual={handleClearTodayPerMuscleManual}
            />

            <MuscleGrowthChart
              logs={state.logs}
              todayKey={todayKey}
              dailyBaseGainGrams={state.dailyMuscleGainGrams}
              accrueOnRestDays={Boolean(state.accrueOnRestDays)}
              allocationConfig={allocationConfig}
            />
          </>
        )}

        {activePage === 'goals' && (
          <>
            <GoalsSection
              state={state}
              todayKey={todayKey}
              onUpdateGoal={handleUpdateGoal}
            />

            <section className="mx-auto max-w-[1280px] px-4 py-4 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0F141F] px-5 py-4">
                <p className="text-sm text-slate-300">
                  Всички ръчни данни за тегло, сън, хранене, крачки и навици се въвеждат централизирано в <strong className="text-white">„Дневен запис“</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => navigateToPage('checkin')}
                  className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  Отвори Дневен запис
                </button>
              </div>
            </section>

            <SleepRecoveryAdvicePanel
              logs={state.logs}
              todayKey={todayKey}
              dailyBaseGainGrams={state.dailyMuscleGainGrams}
              accrueOnRestDays={Boolean(state.accrueOnRestDays)}
              allocationConfig={allocationConfig}
              onJumpToSleep={() => navigateToPage('checkin')}
            />
          </>
        )}

        {activePage === 'calendar' && (
          <PastDayCalendarPanel
            logs={state.logs}
            todayKey={todayKey}
            defaultDailyBaseGainGrams={state.dailyMuscleGainGrams}
            accrueOnRestDays={Boolean(state.accrueOnRestDays)}
            allocationConfig={allocationConfig}
            selectedDateOverride={calendarTargetDate}
            onSelectedDateOverrideConsumed={() => setCalendarTargetDate(null)}
            onSaveDayLog={handleSaveDayLog}
            onDeleteDayLog={handleDeleteDayLog}
            onInspectInComparison={(dateKey) => {
              setPastDate(dateKey);
              navigateToPage('overview', 'comparison');
            }}
          />
        )}

        {activePage === 'history' && (
          <>
            <DatabaseHistoryTable
              logs={state.logs}
              dailyBaseGainGrams={state.dailyMuscleGainGrams}
              accrueOnRestDays={Boolean(state.accrueOnRestDays)}
              allocationConfig={allocationConfig}
              onToggleTrained={handleToggleDateTrained}
              onSelectDateForEdit={(dateKey) => {
                setCalendarTargetDate(dateKey);
                navigateToPage('calendar', 'calendar');
              }}
              onDeleteDayLog={handleDeleteDayLog}
              onSimulateNextDay={handleSimulateNextDay}
            />

            <DataPortabilityBar
              state={state}
              onImportState={handleImportState}
              onLoadSampleWeek={handleLoadSampleWeek}
              onResetAll={handleResetAll}
            />
          </>
        )}

        {activePage === 'hevy' && (
          <HevyWorkoutsPage
            workouts={state.hevyWorkouts ?? []}
            bodyWeightKg={latestBodyWeightKg}
            customExerciseMappings={state.customExerciseMappings}
            onSaveWorkouts={handleSaveHevyWorkouts}
            onSaveCustomExerciseMapping={handleSaveCustomExerciseMapping}
          />
        )}

        {activePage === 'checkin' && (
          <DailyCheckInPage
            dailyLogs={state.dailyLogs ?? []}
            habitItems={state.habitItems ?? DEFAULT_HABIT_ITEMS}
            hevyWorkouts={state.hevyWorkouts ?? []}
            profileWeightKg={state.profile.weightKg}
            profileHeightCm={state.profile.heightCm}
            dailyStepsGoal={state.dailyStepsGoal ?? DEFAULT_DAILY_STEPS_GOAL}
            trainingGoal={activeTrainingGoal}
            intervalsApiKey={state.userSettings?.intervalsApiKey ?? ''}
            onChangeTrainingGoal={handleUpdateTrainingGoal}
            onSaveIntervalsApiKey={handleUpdateIntervalsApiKey}
            onSaveDailyLog={handleSaveDailyBiometricLog}
            onDeleteDailyLog={handleDeleteDailyBiometricLog}
            onUpdateHabitItems={handleUpdateHabitItems}
            onUpdateStepsGoal={handleUpdateDailyStepsGoal}
            onSaveHevyWorkouts={handleSaveHevyWorkouts}
          />
        )}

        {activePage === 'coach' && (
          <IntelligentCoachPage
            activeSubTab={activeLocation.coachSubTab ?? 'readiness'}
            onSelectSubTab={(subTab) =>
              navigateToLocation({ page: 'coach', coachSubTab: subTab })
            }
            hevyWorkouts={state.hevyWorkouts ?? []}
            dailyLogs={state.dailyLogs ?? []}
            habitItems={state.habitItems ?? DEFAULT_HABIT_ITEMS}
            legacyLogs={state.logs}
            profile={state.profile}
            dailyStepsGoal={state.dailyStepsGoal ?? DEFAULT_DAILY_STEPS_GOAL}
            customExerciseMappings={state.customExerciseMappings}
            trainingGoal={activeTrainingGoal}
            subPriorities={state.userSettings?.subPriorities ?? []}
            targetWeight={state.userSettings?.targetWeight}
            onChangeTrainingGoal={handleUpdateTrainingGoal}
            onChangeSubPriorities={handleUpdateSubPriorities}
            onNavigateLocation={(loc) => navigateToLocation(loc)}
            onNavigate={(page) => navigateToPage(page)}
          />
        )}

        {activePage === 'weekly' && (
          <WeeklyScorecardPanel
            dailyLogs={state.dailyLogs ?? []}
            hevyWorkouts={state.hevyWorkouts ?? []}
            habitItems={state.habitItems ?? DEFAULT_HABIT_ITEMS}
            profile={state.profile}
            todayKey={todayKey}
            dailyStepsGoal={state.dailyStepsGoal ?? DEFAULT_DAILY_STEPS_GOAL}
            onNavigate={(page) => navigateToPage(page)}
          />
        )}

        {activePage === 'analysis' && (
          <AnalysisPreparationPage
            activeSubTab={activeLocation.analysisSubTab ?? 'strength-boxing'}
            onSelectSubTab={(subTab) =>
              navigateToLocation({ page: 'analysis', analysisSubTab: subTab })
            }
            hevyWorkouts={state.hevyWorkouts ?? []}
            dailyLogs={state.dailyLogs ?? []}
            habitItems={state.habitItems ?? DEFAULT_HABIT_ITEMS}
            supplementCycles={state.supplementCycles ?? {}}
            profile={state.profile}
            dailyStepsGoal={state.dailyStepsGoal ?? DEFAULT_DAILY_STEPS_GOAL}
            analysisManualWeightKg={state.analysisManualWeightKg}
            targetWeight={state.userSettings?.targetWeight}
            customExerciseMappings={state.customExerciseMappings}
            onSaveCycleConfig={handleSaveSupplementCycle}
            onUpdateHabitItems={handleUpdateHabitItems}
            onSaveManualWeight={handleSaveAnalysisManualWeight}
            onSaveTargetWeight={handleUpdateTargetWeight}
            onNavigateLocation={(loc) => navigateToLocation(loc)}
            onNavigate={(page) => navigateToPage(page)}
          />
        )}
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        <ManualBackupBar
          state={state}
          onAfterRestore={handleReloadAfterRestore}
        />
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          ФизиоПрогрес · Умен личен дневник за мускулна хипертрофия и възстановяване
        </div>
      </footer>

      <CloudSyncModal
        open={cloudSyncModalOpen}
        onClose={() => setCloudSyncModalOpen(false)}
        state={state}
        syncStatus={cloudSyncStatus}
        syncMessage={cloudSyncMessage}
        onSyncStatusChange={handleSyncStatusUpdate}
        onApplySyncedState={handleApplyCloudSyncedState}
      />
    </div>
  );
}
