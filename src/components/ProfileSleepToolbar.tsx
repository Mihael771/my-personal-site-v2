import { useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Dumbbell,
  Moon,
  SlidersHorizontal,
  User,
  Watch,
} from 'lucide-react';
import type {
  DayLog,
  MuscleAllocationConfig,
  MuscleGainMode,
  RecoveryInfo,
  RecoveryMode,
  UserProfile,
} from '../types/fitness';
import { formatGrams, roundGrams, type HuaweiSleepImportEntry } from '../utils/fitnessMath';
import { BulkMuscleBackfillPanel } from './BulkMuscleBackfillPanel';
import { HuaweiSleepSyncPanel } from './HuaweiSleepSyncPanel';

interface ProfileSleepToolbarProps {
  todayKey: string;
  logs: Record<string, DayLog>;
  profile: UserProfile;
  onProfileChange: (next: UserProfile) => void;
  sleepHours: number;
  onSleepChange: (hours: number) => void;
  huaweiSleepScore: number | undefined;
  onHuaweiScoreChange: (score: number | undefined) => void;
  recoveryMode: RecoveryMode;
  manualRecoveryPercent: number | undefined;
  onRecoveryModeChange: (mode: RecoveryMode, manualPercent?: number) => void;
  dailyBaseGainGrams: number | undefined;
  onDailyBaseGainChange: (grams: number | undefined) => void;
  todayGainMode: MuscleGainMode;
  manualTodayGainGrams: number | undefined;
  onTodayGainModeChange: (mode: MuscleGainMode, manualGrams?: number) => void;
  onApplyHuaweiImport: (entries: HuaweiSleepImportEntry[]) => void;
  recovery: RecoveryInfo;
  gainedTodayGrams: number;
  totalCumulativeGrams: number;
  loggedDaysCount: number;
  todayTrained: boolean;
  onToggleTodayTrained: () => void;
  autoAccrueDaily: boolean;
  onAutoAccrueDailyChange: (next: boolean) => void;
  accrueOnRestDays: boolean;
  onAccrueOnRestDaysChange: (next: boolean) => void;
  allocationConfig?: MuscleAllocationConfig;
  onApplyBackfill: (mergedLogs: Record<string, DayLog>) => void;
  onJumpToAllocation?: () => void;
}

const HUAWEI_SCORE_PRESETS = [50, 65, 75, 85, 95];
const DAILY_GAIN_PRESETS = [10, 15.5, 20, 30];

export function ProfileSleepToolbar({
  todayKey,
  logs,
  profile,
  onProfileChange,
  sleepHours,
  onSleepChange,
  huaweiSleepScore,
  onHuaweiScoreChange,
  recoveryMode,
  manualRecoveryPercent,
  onRecoveryModeChange,
  dailyBaseGainGrams,
  onDailyBaseGainChange,
  todayGainMode,
  manualTodayGainGrams,
  onTodayGainModeChange,
  onApplyHuaweiImport,
  recovery,
  gainedTodayGrams,
  totalCumulativeGrams,
  loggedDaysCount,
  todayTrained,
  onToggleTodayTrained,
  autoAccrueDaily,
  onAutoAccrueDailyChange,
  accrueOnRestDays,
  onAccrueOnRestDaysChange,
  allocationConfig,
  onApplyBackfill,
  onJumpToAllocation,
}: ProfileSleepToolbarProps) {
  const [showImport, setShowImport] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);

  const scaledCustomDailyGrams =
    dailyBaseGainGrams !== undefined
      ? roundGrams(dailyBaseGainGrams * recovery.multiplier)
      : undefined;

  return (
    <section
      aria-label="Личен профил, Huawei GT 6 сън и възстановяване"
      className="border-b border-white/10 bg-[#0E131D] px-4 py-3 sm:px-6"
    >
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-6">
        {/* Личен профил */}
        <div className="lg:col-span-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
            <User className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            <span>Личен профил</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label
                htmlFor="profile-name"
                className="mb-1 block text-xs text-slate-400"
              >
                Име
              </label>
              <input
                id="profile-name"
                type="text"
                value={profile.name}
                onChange={(e) =>
                  onProfileChange({ ...profile, name: e.target.value })
                }
                placeholder="Твоето име"
                className="h-9 w-full rounded-lg border border-white/12 bg-[#141B27] px-2.5 text-sm text-white placeholder:text-slate-500 transition-colors focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="profile-height"
                className="mb-1 block text-xs text-slate-400"
              >
                Ръст (см)
              </label>
              <input
                id="profile-height"
                type="number"
                min={100}
                max={250}
                value={profile.heightCm}
                onChange={(e) => {
                  const val = e.target.value;
                  onProfileChange({
                    ...profile,
                    heightCm: val === '' ? '' : Number(val),
                  });
                }}
                placeholder="180"
                className="h-9 w-full rounded-lg border border-white/12 bg-[#141B27] px-2.5 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 transition-colors focus:border-[var(--accent)]"
              />
            </div>

            <div>
              <label
                htmlFor="profile-weight"
                className="mb-1 block text-xs text-slate-400"
              >
                Тегло (кг)
              </label>
              <input
                id="profile-weight"
                type="number"
                min={30}
                max={250}
                step="0.5"
                value={profile.weightKg}
                onChange={(e) => {
                  const val = e.target.value;
                  onProfileChange({
                    ...profile,
                    weightKg: val === '' ? '' : Number(val),
                  });
                }}
                placeholder="78"
                className="h-9 w-full rounded-lg border border-white/12 bg-[#141B27] px-2.5 font-mono text-sm tabular-nums text-white placeholder:text-slate-500 transition-colors focus:border-[var(--accent)]"
              />
            </div>
          </div>
        </div>

        {/* Huawei GT 6 Сън & Автоматично / Ръчно възстановяване */}
        <div className="border-t border-white/10 pt-4 lg:col-span-8 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="flex flex-wrap items-end gap-3">
              {/* Huawei Watch GT 6 точки */}
              <div>
                <label
                  htmlFor="today-huawei-score-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Watch className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                  <span>Huawei GT 6 точки (0–100)</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    id="today-huawei-score-input"
                    data-testid="today-huawei-score-input"
                    type="number"
                    min={0}
                    max={100}
                    value={huaweiSleepScore ?? ''}
                    placeholder="напр. 88"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        onHuaweiScoreChange(undefined);
                      } else {
                        const num = parseInt(val, 10);
                        onHuaweiScoreChange(Number.isNaN(num) ? undefined : num);
                      }
                    }}
                    className="h-9 w-22 rounded-lg border border-white/15 bg-[#141B27] px-2.5 font-mono text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
                  />
                  <div className="flex items-center gap-1" role="group" aria-label="Бърз избор на Huawei GT 6 точки">
                    {HUAWEI_SCORE_PRESETS.map((preset) => {
                      const active = huaweiSleepScore === preset && recoveryMode === 'auto';
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => onHuaweiScoreChange(preset)}
                          className={`h-9 min-w-[36px] rounded-lg border px-2 font-mono text-xs font-medium tabular-nums transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                              : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Сън в часове */}
              <div>
                <label
                  htmlFor="today-sleep-input"
                  className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-300"
                >
                  <Moon className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  <span>Сън (ч)</span>
                </label>
                <input
                  id="today-sleep-input"
                  type="number"
                  min={0}
                  max={16}
                  step="0.5"
                  value={sleepHours}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    onSleepChange(Number.isNaN(num) ? 0 : num);
                  }}
                  className="h-9 w-18 rounded-lg border border-white/15 bg-[#141B27] px-2.5 font-mono text-sm font-semibold tabular-nums text-white focus:border-[var(--accent)]"
                />
              </div>

              {/* Автоматично vs Ръчно */}
              <div>
                <div className="mb-1 text-xs font-medium text-slate-300">
                  Режим
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    role="group"
                    aria-label="Режим на изчисление на възстановяването"
                    className="inline-flex h-9 items-center rounded-lg border border-white/12 bg-[#141B27] p-0.5"
                  >
                    <button
                      type="button"
                      data-testid="recovery-mode-auto"
                      aria-pressed={recoveryMode === 'auto'}
                      onClick={() => onRecoveryModeChange('auto')}
                      className={`h-7.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        recoveryMode === 'auto'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Автоматично
                    </button>
                    <button
                      type="button"
                      data-testid="recovery-mode-manual"
                      aria-pressed={recoveryMode === 'manual'}
                      onClick={() =>
                        onRecoveryModeChange(
                          'manual',
                          manualRecoveryPercent ?? recovery.percentage,
                        )
                      }
                      className={`h-7.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        recoveryMode === 'manual'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Ръчно
                    </button>
                  </div>

                  {recoveryMode === 'manual' && (
                    <div className="flex items-center gap-1">
                      <label htmlFor="manual-recovery-pct" className="sr-only">
                        Ръчно възстановяване (%)
                      </label>
                      <input
                        id="manual-recovery-pct"
                        data-testid="manual-recovery-pct-input"
                        type="number"
                        min={0}
                        max={100}
                        step={5}
                        value={manualRecoveryPercent ?? recovery.percentage}
                        onChange={(e) => {
                          const num = parseInt(e.target.value, 10);
                          onRecoveryModeChange('manual', Number.isNaN(num) ? 0 : num);
                        }}
                        className="h-9 w-16 rounded-lg border border-[var(--accent)] bg-[#141B27] px-2 font-mono text-sm font-semibold tabular-nums text-white"
                      />
                      <span className="font-mono text-xs text-slate-300">%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Обобщени метрики */}
            <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-3 sm:grid-cols-4 xl:border-t-0 xl:pt-0 shrink-0">
              <div>
                <div className="text-xs text-slate-400">Възстановяване</div>
                <div
                  data-testid="today-recovery-status"
                  className={`mt-0.5 flex items-center gap-1.5 font-mono text-base font-bold tabular-nums ${
                    recovery.isFatigued
                      ? 'text-rose-400'
                      : recovery.percentage >= 85
                        ? 'text-emerald-400'
                        : 'text-amber-300'
                  }`}
                >
                  {recovery.isFatigued ? (
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{recovery.percentage}%</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Днес качено</div>
                <div
                  data-testid="today-gained-grams"
                  className={`mt-0.5 font-mono text-base font-bold tabular-nums ${
                    recovery.isFatigued ? 'text-rose-300' : 'text-[var(--accent-text)]'
                  }`}
                >
                  +{formatGrams(gainedTodayGrams)} г
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Общо натрупано</div>
                <div
                  data-testid="total-gained-grams"
                  className="mt-0.5 font-mono text-base font-bold tabular-nums text-white"
                >
                  {formatGrams(totalCumulativeGrams)} г
                </div>
                <div
                  data-testid="total-gained-kg"
                  className="font-mono text-[11px] tabular-nums text-slate-400"
                >
                  {(totalCumulativeGrams / 1000).toFixed(3)} кг
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-400">Дни в режима</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    data-testid="logged-days-count"
                    className="font-mono text-base font-bold tabular-nums text-white"
                  >
                    {loggedDaysCount}
                  </span>
                  <button
                    type="button"
                    data-testid="toggle-today-trained-btn"
                    onClick={onToggleTodayTrained}
                    aria-pressed={todayTrained}
                    title="Превключи дали днес има тренировка"
                    className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      todayTrained
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                        : 'border-white/15 bg-[#141B27] text-slate-300 hover:border-white/30 hover:text-white'
                    }`}
                  >
                    Тренировка: {todayTrained ? 'Да' : 'Не'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Дневен мускулен прираст (Автоматично от сън/възстановяване или Ръчно) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Dumbbell className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                <span>Прираст на ден (г)</span>
              </div>

              <div
                role="group"
                aria-label="Режим на мускулен прираст за деня"
                className="inline-flex h-8.5 items-center rounded-lg border border-white/12 bg-[#141B27] p-0.5"
              >
                <button
                  type="button"
                  data-testid="daily-gain-mode-auto"
                  aria-pressed={todayGainMode === 'auto'}
                  onClick={() => onTodayGainModeChange('auto')}
                  className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    todayGainMode === 'auto'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Автоматично
                </button>
                <button
                  type="button"
                  data-testid="daily-gain-mode-manual"
                  aria-pressed={todayGainMode === 'manual'}
                  onClick={() =>
                    onTodayGainModeChange(
                      'manual',
                      manualTodayGainGrams ??
                        (gainedTodayGrams > 0 ? gainedTodayGrams : scaledCustomDailyGrams ?? 15),
                    )
                  }
                  className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    todayGainMode === 'manual'
                      ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Ръчно
                </button>
              </div>

              {todayGainMode === 'auto' ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <label htmlFor="daily-base-gain-input" className="sr-only">
                    Базов мускулен прираст на ден в грамове (при 100% сън и възстановяване)
                  </label>
                  <input
                    id="daily-base-gain-input"
                    data-testid="daily-base-gain-input"
                    type="number"
                    min={0.5}
                    max={500}
                    step="0.5"
                    value={dailyBaseGainGrams ?? ''}
                    placeholder="Авто (по мускули)"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        onDailyBaseGainChange(undefined);
                      } else {
                        const num = parseFloat(val);
                        onDailyBaseGainChange(Number.isNaN(num) ? undefined : num);
                      }
                    }}
                    className="h-8.5 w-36 rounded-lg border border-white/15 bg-[#141B27] px-2.5 font-mono text-xs font-semibold tabular-nums text-white placeholder:font-sans placeholder:font-normal placeholder:text-slate-500 focus:border-[var(--accent)]"
                  />
                  <div
                    className="flex flex-wrap items-center gap-1"
                    role="group"
                    aria-label="Бърз избор на грамаж на ден"
                  >
                    <button
                      type="button"
                      data-testid="daily-base-gain-auto-muscles"
                      onClick={() => onDailyBaseGainChange(undefined)}
                      className={`h-8.5 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                        dailyBaseGainGrams === undefined
                          ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                          : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                      }`}
                    >
                      По мускули
                    </button>
                    {DAILY_GAIN_PRESETS.map((preset) => {
                      const active = dailyBaseGainGrams === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          data-testid={`daily-base-gain-preset-${preset}`}
                          onClick={() => onDailyBaseGainChange(preset)}
                          className={`h-8.5 min-w-[38px] rounded-lg border px-2 font-mono text-xs font-medium tabular-nums transition-colors ${
                            active
                              ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                              : 'border-white/10 bg-[#141B27] text-slate-300 hover:border-white/25 hover:text-white'
                          }`}
                        >
                          {preset}г
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="manual-today-gain-input" className="sr-only">
                    Ръчен прираст за днес в грамове
                  </label>
                  <input
                    id="manual-today-gain-input"
                    data-testid="manual-today-gain-input"
                    type="number"
                    min={0}
                    max={50000}
                    step="0.5"
                    value={manualTodayGainGrams ?? 0}
                    onChange={(e) => {
                      const num = parseFloat(e.target.value);
                      onTodayGainModeChange('manual', Number.isNaN(num) ? 0 : num);
                    }}
                    className="h-8.5 w-24 rounded-lg border border-[var(--accent)] bg-[#141B27] px-2.5 font-mono text-xs font-semibold tabular-nums text-white"
                  />
                  <span className="font-mono text-xs text-slate-300">г точно за днес</span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  data-testid="accrue-rest-days-checkbox"
                  checked={accrueOnRestDays}
                  onChange={(e) => onAccrueOnRestDaysChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/25 bg-[#141B27] accent-[var(--accent)]"
                />
                <span>Начислявай и в почивни дни</span>
              </label>

              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  data-testid="auto-accrue-daily-checkbox"
                  checked={autoAccrueDaily}
                  onChange={(e) => onAutoAccrueDailyChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-white/25 bg-[#141B27] accent-[var(--accent)]"
                />
                <span>Авто-добавяне на нови дни</span>
              </label>

              <div
                data-testid="daily-gain-formula-note"
                className={`font-mono text-xs tabular-nums ${
                  recovery.isFatigued && todayGainMode === 'auto'
                    ? 'text-rose-300'
                    : 'text-slate-300'
                }`}
              >
                {todayGainMode === 'manual'
                  ? `Ръчно: +${formatGrams(gainedTodayGrams)} г днес`
                  : scaledCustomDailyGrams !== undefined && dailyBaseGainGrams !== undefined
                    ? `${formatGrams(dailyBaseGainGrams)} г × ${recovery.percentage}% сън/възст. = +${formatGrams(scaledCustomDailyGrams)} г`
                    : `По мускули × ${recovery.percentage}% сън/възст.`}
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <p
              data-testid="today-recovery-note"
              className={`text-xs ${
                recovery.isFatigued ? 'text-rose-300' : 'text-slate-400'
              }`}
            >
              {recovery.source === 'manual'
                ? `Ръчен режим: зададено ${recovery.percentage}% възстановяване — мускулният прираст се изчислява спрямо него.`
                : recovery.source === 'huawei_gt6'
                  ? recovery.isFatigued
                    ? `Huawei GT 6 (${recovery.huaweiSleepScore} т. — под 60 т.): мускулите са изморени и прирастът е намален на ${recovery.percentage}%.`
                    : `Автоматично от Huawei GT 6 (${recovery.huaweiSleepScore} т.): ${recovery.label.charAt(0).toLowerCase()}${recovery.label.slice(1)} (${recovery.percentage}% от максимума).`
                  : recovery.isFatigued
                    ? 'Въведи точки от Huawei GT 6 или спи 6+ часа — в момента си под 6 ч сън и прирастът е орязан.'
                    : `По часове сън (${recovery.percentage}%). Въведи точки от Huawei GT 6 за автоматично изчисление по часовника.`}
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid="jump-to-allocation-btn"
                onClick={() => {
                  if (onJumpToAllocation) {
                    onJumpToAllocation();
                    return;
                  }
                  document
                    .getElementById('muscle-allocation')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="inline-flex items-center gap-1.5 text-left text-xs font-medium text-slate-300 hover:text-white hover:underline"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
                <span>
                  Разпределение по мускули
                  {allocationConfig?.mode === 'custom_percent' ? ' (По избор %)' : ''}
                </span>
              </button>

              <button
                type="button"
                data-testid="toggle-bulk-backfill-btn"
                onClick={() => {
                  setShowBackfill((prev) => !prev);
                  setShowImport(false);
                }}
                aria-expanded={showBackfill}
                className="inline-flex items-center gap-1.5 text-left text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                <CalendarRange className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {showBackfill
                    ? 'Скрий бързото попълване'
                    : 'Бързо попълване от стара дата'}
                </span>
              </button>

              <button
                type="button"
                data-testid="toggle-huawei-import-btn"
                onClick={() => {
                  setShowImport((prev) => !prev);
                  setShowBackfill(false);
                }}
                aria-expanded={showImport}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white hover:underline whitespace-nowrap shrink-0"
              >
                <Watch className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
                <span>{showImport ? 'Скрий Huawei импорт' : 'Импорт от Huawei GT 6'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showBackfill && (
        <BulkMuscleBackfillPanel
          todayKey={todayKey}
          logs={logs}
          defaultDailyBaseGainGrams={dailyBaseGainGrams}
          allocationConfig={allocationConfig}
          onApplyBackfill={(mergedLogs) => onApplyBackfill(mergedLogs)}
          onClose={() => setShowBackfill(false)}
        />
      )}

      {showImport && (
        <HuaweiSleepSyncPanel
          todayKey={todayKey}
          onApplyEntries={onApplyHuaweiImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </section>
  );
}
