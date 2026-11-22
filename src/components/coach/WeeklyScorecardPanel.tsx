import { useMemo } from 'react';
import { CalendarCheck2, Target } from 'lucide-react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../../types/fitness';
import { formatBgDate } from '../../utils/fitnessMath';
import type { AppPage } from '../../utils/navigation';
import {
  computeWeeklyScorecardReport,
  type WeeklyComparisonItem,
} from '../../utils/weeklyScorecard';

interface WeeklyScorecardPanelProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  habitItems: string[];
  profile: UserProfile;
  todayKey: string;
  dailyStepsGoal?: number;
  onNavigate?: (page: AppPage) => void;
  embedded?: boolean;
}

function getScoreStrokeColor(score: number, hasAnyData: boolean): string {
  if (!hasAnyData) return '#475569';
  if (score >= 82) return '#10b981';
  if (score >= 68) return '#38bdf8';
  if (score >= 50) return '#f59e0b';
  return '#f43f5e';
}

function getScoreTextColor(score: number, hasAnyData: boolean): string {
  if (!hasAnyData) return 'text-slate-400';
  if (score >= 82) return 'text-emerald-400';
  if (score >= 68) return 'text-sky-400';
  if (score >= 50) return 'text-amber-300';
  return 'text-rose-400';
}

function getDeltaToneClass(item: WeeklyComparisonItem): string {
  if (item.direction === 'flat') return 'text-slate-400';
  if (item.sentiment === 'positive') return 'text-emerald-400';
  if (item.sentiment === 'negative') return 'text-rose-400';
  return 'text-amber-300';
}

function getDirectionArrow(direction: WeeklyComparisonItem['direction']): string {
  if (direction === 'up') return '▲';
  if (direction === 'down') return '▼';
  return '—';
}

export function WeeklyScorecardPanel({
  dailyLogs,
  hevyWorkouts,
  habitItems,
  profile,
  todayKey,
  dailyStepsGoal = 10000,
  onNavigate,
  embedded = false,
}: WeeklyScorecardPanelProps) {
  const report = useMemo(
    () =>
      computeWeeklyScorecardReport({
        dailyLogs,
        hevyWorkouts,
        habitItems,
        profile,
        todayKey,
        dailyStepsGoal,
      }),
    [dailyLogs, hevyWorkouts, habitItems, profile, todayKey, dailyStepsGoal],
  );

  const gaugeRadius = 54;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset =
    gaugeCircumference - (report.overallScore / 100) * gaugeCircumference;
  const strokeColor = getScoreStrokeColor(report.overallScore, report.hasAnyData);

  const breakdownRows = [
    { label: 'Сън и свежест', value: report.scoreBreakdown.sleep },
    { label: 'Силови тренировки', value: report.scoreBreakdown.training },
    { label: 'Дисциплина и навици', value: report.scoreBreakdown.discipline },
    { label: 'Крачки и енергия', value: report.scoreBreakdown.activityEnergy },
    {
      label: 'Готовност и тестостерон',
      value: report.scoreBreakdown.readinessHormonal,
    },
  ];

  return (
    <section
      id="weekly"
      data-testid="weekly-scorecard-page"
      aria-label="Неделен обзор"
      className={embedded ? '' : 'mx-auto max-w-[1280px] px-4 py-8 sm:px-6'}
    >
      {/* Заглавна лента */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
            <CalendarCheck2
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>Завършена седмица: {formatBgDate(report.currentWeek.startDate)} – {formatBgDate(report.currentWeek.endDate)}</span>
            <span aria-hidden="true">·</span>
            <span>Спрямо: {formatBgDate(report.previousWeek.startDate)} – {formatBgDate(report.previousWeek.endDate)}</span>
          </div>
          {embedded ? (
            <h2 className="mt-1.5 font-display text-xl font-bold tracking-tight text-white">
              🏆 Неделен обзор (Weekly Scorecard)
            </h2>
          ) : (
            <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl text-balance">
              Неделен обзор (Weekly Scorecard)
            </h1>
          )}
          <p className="mt-1 max-w-2xl text-xs sm:text-sm text-slate-400">
            Сравнение на последните 7 приключени дни (от вчера назад, без днешния незавършен ден) спрямо предходната седмица по 6 ключови показателя.
          </p>
        </div>

        {onNavigate && !embedded && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('checkin')}
              className="inline-flex h-9 items-center rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
            >
              Отвори Дневен запис
            </button>
            <button
              type="button"
              onClick={() => onNavigate('coach')}
              className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
            >
              Към Интелигентен треньор
            </button>
          </div>
        )}
      </div>

      {/* Фокусен блок: Обща оценка (0–100) + Един главен фокус за новата седмица */}
      <div className="mt-6 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        {/* Лява колона: SVG радиална оценка + разбивка */}
        <div
          data-testid="weekly-overall-score-card"
          className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-6 lg:col-span-5"
        >
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <svg
                width={132}
                height={132}
                viewBox="0 0 132 132"
                role="img"
                aria-label={`Обща оценка на седмицата: ${report.overallScore} от 100`}
              >
                <circle
                  cx={66}
                  cy={66}
                  r={gaugeRadius}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={10}
                />
                <circle
                  cx={66}
                  cy={66}
                  r={gaugeRadius}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={10}
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeOffset}
                  transform="rotate(-90 66 66)"
                />
                <text
                  x={66}
                  y={64}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={28}
                  fontWeight={800}
                  className="font-mono tabular-nums"
                >
                  {report.overallScore}
                </text>
                <text
                  x={66}
                  y={84}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={11}
                  className="font-mono"
                >
                  от 100
                </text>
              </svg>
            </div>

            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-400">
                Обща оценка на седмицата
              </div>
              <div
                className={`mt-1 font-display text-xl font-bold ${getScoreTextColor(
                  report.overallScore,
                  report.hasAnyData,
                )}`}
              >
                {report.scoreTierLabel}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {report.currentWeek.loggedDaysCount}/7 записани дни ·{' '}
                {report.currentWeek.workoutSessions} тренировки ·{' '}
                {report.currentWeek.cleanDaysCount} чисти дни
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2.5 border-t border-white/8 pt-4">
            {breakdownRows.map((row) => (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                <span className="w-40 shrink-0 text-slate-400">{row.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${report.hasAnyData ? row.value : 0}%`,
                      backgroundColor: getScoreStrokeColor(row.value, report.hasAnyData),
                    }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-mono font-semibold tabular-nums text-slate-200">
                  {report.hasAnyData ? row.value : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Дясна колона: Един главен фокус за новата седмица */}
        <div
          data-testid="weekly-main-focus-card"
          className="flex flex-col justify-between rounded-2xl border border-white/15 bg-[#121826] p-6 lg:col-span-7"
        >
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <Target
                className="h-4 w-4 text-[var(--accent-text)]"
                aria-hidden="true"
              />
              <span>Един главен фокус за новата седмица</span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">{report.mainFocus.category}</span>
            </div>

            <h2 className="mt-3 font-display text-xl font-bold leading-snug text-white sm:text-2xl text-balance">
              {report.mainFocus.headline}
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {report.mainFocus.rationale}
            </p>
          </div>

          <div className="mt-6 border-t border-white/10 pt-4">
            <div className="text-xs font-medium text-slate-400">
              Конкретна стъпка за следващите 7 дни
            </div>
            <p className="mt-1.5 text-sm font-medium text-slate-100">
              {report.mainFocus.actionLine}
            </p>
          </div>
        </div>
      </div>

      {/* 6 сравнителни ключови показателя */}
      <div className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-white">
            Сравнение на 6-те ключови показателя
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Последна седмица vs. Предходна седмица
          </span>
        </div>

        <div
          data-testid="weekly-comparisons-grid"
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
        >
          {report.comparisons.map((item) => {
            const arrow = getDirectionArrow(item.direction);
            const deltaTone = getDeltaToneClass(item);
            return (
              <article
                key={item.id}
                data-testid={`weekly-metric-${item.id}`}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5"
              >
                <div>
                  <div className="text-xs font-medium text-slate-400">
                    {item.title}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-white">
                    {item.primaryValue}
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    {item.secondaryValue}
                  </div>
                </div>

                <div className="mt-4 border-t border-white/8 pt-3">
                  <div
                    className={`flex items-center gap-1.5 font-mono text-xs font-semibold tabular-nums ${deltaTone}`}
                  >
                    <span aria-hidden="true">{arrow}</span>
                    <span>{item.deltaText}</span>
                  </div>
                  <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-500">
                    {item.previousText}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
