import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw, Sparkles } from 'lucide-react';
import type {
  BodyView,
  DateSnapshotStats,
  MuscleId,
} from '../types/fitness';
import { MUSCLE_MAP, formatBgDate, formatGrams } from '../utils/fitnessMath';
import { HumanAnatomySvg } from './HumanAnatomySvg';

interface BodyComparisonStageProps {
  bodyView: BodyView;
  onViewChange: (view: BodyView) => void;
  pastDate: string;
  onPastDateChange: (dateKey: string) => void;
  availablePastDates: string[];
  pastStats: DateSnapshotStats;
  todayStats: DateSnapshotStats;
  todayKey: string;
  onToggleTodayMuscle: (muscleId: MuscleId) => void;
  onLoadSampleWeek: () => void;
}

export function BodyComparisonStage({
  bodyView,
  onViewChange,
  pastDate,
  onPastDateChange,
  availablePastDates,
  pastStats,
  todayStats,
  todayKey,
  onToggleTodayMuscle,
  onLoadSampleWeek,
}: BodyComparisonStageProps) {
  const currentPastIndex = availablePastDates.indexOf(pastDate);

  function stepPastDate(direction: -1 | 1) {
    if (availablePastDates.length === 0) return;
    if (currentPastIndex === -1) {
      onPastDateChange(availablePastDates[availablePastDates.length - 1]);
      return;
    }
    const nextIdx = currentPastIndex + direction;
    if (nextIdx >= 0 && nextIdx < availablePastDates.length) {
      onPastDateChange(availablePastDates[nextIdx]);
    }
  }

  const massDelta = Math.round((todayStats.totalCumulativeGrams - pastStats.totalCumulativeGrams) * 10) / 10;

  return (
    <section
      id="comparison"
      aria-label="Сравнение на тялото: Минал ден срещу Днес"
      className="mx-auto max-w-[1280px] px-4 py-5 sm:px-6"
    >
      {/* Заглавие и бутони за обръщане Отпред / Отзад */}
      <div className="mb-4 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
            Сравнение на мускулния прогрес
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Лявото тяло показва минал ден от историята ти, а дясното е за днес. Задръж курсора върху мускул за статистика или кликни върху днешното тяло.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            role="group"
            aria-label="Изглед на човешкото тяло"
            className="inline-flex items-center gap-1 rounded-xl border border-white/12 bg-[#111622] p-1"
          >
            <button
              type="button"
              onClick={() => onViewChange('front')}
              aria-pressed={bodyView === 'front'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                bodyView === 'front'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Отпред</span>
            </button>
            <button
              type="button"
              onClick={() => onViewChange('back')}
              aria-pressed={bodyView === 'back'}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                bodyView === 'back'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Отзад</span>
            </button>
          </div>
        </div>
      </div>

      {/* Легенда за цветовите състояния */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-slate-500/50 bg-[#1e293b]" aria-hidden="true" />
            <span>Почивка</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-[var(--accent-text)] bg-[var(--accent)]" aria-hidden="true" />
            <span>Тренирано (възстановен)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm border border-rose-300 bg-rose-600" aria-hidden="true" />
            <span>Изморени мускули (под 6 ч сън)</span>
          </span>
        </div>

        <span className="font-mono text-xs tabular-nums text-slate-300">
          {bodyView === 'front'
            ? 'Предни зони: Гърди · Корем · Бицепс · Рамо · Крака'
            : 'Задни зони: Гръб · Трицепс · Рамо · Крака'}
        </span>
      </div>

      {/* Двете човечета едно до друго */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        {/* ЛЯВО ЧОВЕЧЕ: Минал ден (История) */}
        <article className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Минал ден (История)
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatBgDate(pastDate)}
                  {pastStats.huaweiSleepScore !== undefined
                    ? ` · GT 6: ${pastStats.huaweiSleepScore} т.`
                    : ` · Сън: ${pastStats.sleepHours} ч`}{' '}
                  ({pastStats.recovery.percentage}%)
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => stepPastDate(-1)}
                  disabled={availablePastDates.length === 0 || currentPastIndex <= 0}
                  aria-label="Предишен записан ден"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#161D2B] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <label htmlFor="past-comparison-date" className="sr-only">
                  Избери минала дата за сравнение
                </label>
                <input
                  id="past-comparison-date"
                  type="date"
                  max={todayKey}
                  value={pastDate}
                  onChange={(e) => {
                    if (e.target.value) onPastDateChange(e.target.value);
                  }}
                  className="h-9 rounded-lg border border-white/12 bg-[#161D2B] px-2.5 font-mono text-xs tabular-nums text-white"
                />
                <button
                  type="button"
                  onClick={() => stepPastDate(1)}
                  disabled={
                    availablePastDates.length === 0 ||
                    currentPastIndex === -1 ||
                    currentPastIndex >= availablePastDates.length - 1
                  }
                  aria-label="Следващ записан ден"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#161D2B] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-2.5 flex min-h-[34px] flex-wrap items-center gap-2 text-xs text-slate-400">
              {availablePastDates.length > 0 ? (
                <>
                  <label htmlFor="past-quick-select">Бърз избор:</label>
                  <select
                    id="past-quick-select"
                    value={availablePastDates.includes(pastDate) ? pastDate : ''}
                    onChange={(e) => {
                      if (e.target.value) onPastDateChange(e.target.value);
                    }}
                    className="h-8 rounded-lg border border-white/12 bg-[#151C29] px-2.5 font-mono text-xs text-slate-200"
                  >
                    {!availablePastDates.includes(pastDate) && (
                      <option value="">{formatBgDate(pastDate)}</option>
                    )}
                    {availablePastDates
                      .slice()
                      .reverse()
                      .map((d) => (
                        <option key={d} value={d}>
                          {formatBgDate(d)}
                        </option>
                      ))}
                  </select>
                </>
              ) : (
                <span>Избери дата от календара или стрелките горе.</span>
              )}
            </div>
          </div>

          <div className="my-2">
            <HumanAnatomySvg
              view={bodyView}
              stats={pastStats}
              interactive={false}
              figureLabel={`Минало състояние на тялото за ${formatBgDate(pastDate)}`}
              testIdPrefix="past"
            />
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-400">Натрупано дотогава:</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {formatGrams(pastStats.totalCumulativeGrams)} г ({pastStats.totalWorkouts} тр.)
              </span>
            </div>

            {pastStats.trainedMuscles.length > 0 ? (
              <p className="mt-2 text-xs text-slate-300">
                Тренирано на този ден:{' '}
                <span className="font-medium text-white">
                  {pastStats.trainedMuscles.map((id) => MUSCLE_MAP[id].label).join(', ')}
                </span>{' '}
                <span className="font-mono text-[var(--accent-text)]">
                  (+{formatGrams(pastStats.gainedOnDateTotal)} г)
                </span>
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                <span>Няма записана тренировка за {formatBgDate(pastDate)}.</span>
                {availablePastDates.length === 0 && (
                  <button
                    type="button"
                    onClick={onLoadSampleWeek}
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Зареди примерна седмица</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </article>

        {/* ДЯСНО ЧОВЕЧЕ: Днес (Интерактивно) */}
        <article className="flex flex-col justify-between rounded-2xl border border-[var(--accent-border)] bg-[#101724] p-5 sm:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-white">
                  Днес (Активна тренировка)
                </h2>
                <p className="mt-0.5 text-xs text-slate-300">
                  {formatBgDate(todayKey)}
                  {todayStats.huaweiSleepScore !== undefined
                    ? ` · GT 6: ${todayStats.huaweiSleepScore} т.`
                    : ` · Сън: ${todayStats.sleepHours} ч`}{' '}
                  ({todayStats.recovery.percentage}%)
                </p>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-400">Разлика от миналия ден</div>
                <div className="font-mono text-sm font-bold tabular-nums text-[var(--accent-text)]">
                  {massDelta >= 0 ? `+${formatGrams(massDelta)}` : formatGrams(massDelta)} г
                </div>
              </div>
            </div>

            <div className="mt-2.5 flex min-h-[34px] items-center">
              {todayStats.recovery.isFatigued ? (
                <div
                  role="status"
                  className="flex w-full items-center gap-2 rounded-lg border border-rose-500/35 bg-rose-950/40 px-3 py-1.5 text-xs text-rose-200"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                  <span className="truncate">
                    {todayStats.recovery.source === 'huawei_gt6'
                      ? `Изморени мускули (GT 6: ${todayStats.recovery.huaweiSleepScore} т.) · прираст ${todayStats.recovery.percentage}%`
                      : `Изморени мускули · прирастът е намален на ${todayStats.recovery.percentage}%`}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Кликни директно върху мускулна зона на тялото, за да отбележиш „Днес тренирах това“.
                </p>
              )}
            </div>
          </div>

          <div className="my-2">
            <HumanAnatomySvg
              view={bodyView}
              stats={todayStats}
              interactive={true}
              onToggleMuscle={onToggleTodayMuscle}
              figureLabel="Интерактивно тяло за днешната тренировка"
              testIdPrefix="today"
            />
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-400">Общо натрупано до днес:</span>
              <span className="font-mono font-bold tabular-nums text-white">
                {formatGrams(todayStats.totalCumulativeGrams)} г ({todayStats.totalWorkouts} тр.)
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-300">
              {todayStats.trainedMuscles.length > 0 ? (
                <>
                  Днес тренира:{' '}
                  <span className="font-medium text-white">
                    {todayStats.trainedMuscles.map((id) => MUSCLE_MAP[id].label).join(', ')}
                  </span>{' '}
                  <span
                    className={`font-mono font-semibold ${
                      todayStats.recovery.isFatigued
                        ? 'text-rose-300'
                        : 'text-[var(--accent-text)]'
                    }`}
                  >
                    (+{formatGrams(todayStats.gainedOnDateTotal)} г)
                  </span>
                </>
              ) : todayStats.gainMode === 'manual' && todayStats.gainedOnDateTotal > 0 ? (
                <span>
                  Днес е зададен ръчен прираст:{' '}
                  <span className="font-mono font-semibold text-[var(--accent-text)]">
                    +{formatGrams(todayStats.gainedOnDateTotal)} г
                  </span>{' '}
                  (избери мускулни зони при желание).
                </span>
              ) : (
                <span className="text-slate-400">
                  Все още няма отбелязан мускул за днес. Избери зона от тялото или от картите отдолу.
                </span>
              )}
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
