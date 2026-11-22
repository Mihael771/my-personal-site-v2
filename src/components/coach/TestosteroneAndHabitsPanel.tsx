import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Globe,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import {
  analyzeTribulusUsage,
  buildPersonalizedHabitsPlan,
  buildTestosteroneComparisonRows,
  type TestosteroneRowStatus,
} from '../../utils/testosteroneAndHabits';
import {
  OFFLINE_FALLBACK_SCIENCE_DATA,
  fetchTestosteroneScienceData,
  type TestosteroneSciencePayload,
} from '../../utils/testosteroneScienceApi';

interface TestosteroneAndHabitsPanelProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  todayKey: string;
  bodyWeightKg?: number | null;
  profileHeightCm?: number | '';
  dailyStepsGoal?: number;
}

const STATUS_DOT_CLASS: Record<TestosteroneRowStatus, string> = {
  green: 'bg-emerald-400',
  yellow: 'bg-amber-400',
  red: 'bg-rose-400',
};

const STATUS_TEXT_CLASS: Record<TestosteroneRowStatus, string> = {
  green: 'text-emerald-300',
  yellow: 'text-amber-300',
  red: 'text-rose-300',
};

export function TestosteroneAndHabitsPanel({
  dailyLogs,
  hevyWorkouts,
  todayKey,
  bodyWeightKg = null,
  profileHeightCm = '',
  dailyStepsGoal = 10000,
}: TestosteroneAndHabitsPanelProps) {
  const tribulusReport = useMemo(
    () =>
      analyzeTribulusUsage({
        dailyLogs,
        hevyWorkouts,
        todayKey,
        bodyWeightKg,
      }),
    [dailyLogs, hevyWorkouts, todayKey, bodyWeightKg],
  );

  const habitPlan = useMemo(
    () =>
      buildPersonalizedHabitsPlan({
        dailyLogs,
        hevyWorkouts,
        todayKey,
        bodyWeightKg,
        dailyStepsGoal,
      }),
    [dailyLogs, hevyWorkouts, todayKey, bodyWeightKg, dailyStepsGoal],
  );

  const comparisonRows = useMemo(
    () =>
      buildTestosteroneComparisonRows({
        dailyLogs,
        hevyWorkouts,
        todayKey,
        bodyWeightKg,
        profileHeightCm,
        dailyStepsGoal,
      }),
    [dailyLogs, hevyWorkouts, todayKey, bodyWeightKg, profileHeightCm, dailyStepsGoal],
  );

  const [scienceData, setScienceData] = useState<TestosteroneSciencePayload>(
    OFFLINE_FALLBACK_SCIENCE_DATA,
  );
  const [scienceFromCache, setScienceFromCache] = useState(false);
  const [loadingScience, setLoadingScience] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingScience(true);
    void fetchTestosteroneScienceData()
      .then((res) => {
        if (!active) return;
        setScienceData(res.data);
        setScienceFromCache(res.fromCache);
      })
      .finally(() => {
        if (active) setLoadingScience(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function handleRefreshScience() {
    setLoadingScience(true);
    try {
      const res = await fetchTestosteroneScienceData({ forceRefresh: true });
      setScienceData(res.data);
      setScienceFromCache(res.fromCache);
    } finally {
      setLoadingScience(false);
    }
  }

  return (
    <section
      data-testid="testosterone-habits-panel"
      aria-label="Естествен тестостерон, Бабини зъби и персонализиран план за навици"
      className="mt-8 space-y-6"
    >
      {/* 1. Проследяване на Бабини зъби (Tribulus terrestris) + Персонализиран план (Топ 3 действия) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Бабини зъби карта */}
        <article
          data-testid="tribulus-tracker-card"
          className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-6"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-3">
              <div className="flex items-center gap-2">
                <Leaf className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                <h2 className="font-display text-base font-bold text-white">
                  🌿 Бабини зъби (Tribulus terrestris)
                </h2>
              </div>
              <span className="font-mono text-xs tabular-nums text-slate-400">
                Посл. 30 д.: {tribulusReport.daysLast30d} д. · Общо:{' '}
                {tribulusReport.totalLoggedDays} д.
              </span>
            </div>

            {/* Цикъл + Предупреждение за 2-седмична пауза след 42 дни */}
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400">Активна поредна серия</div>
                <div
                  data-testid="tribulus-streak-value"
                  className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${
                    tribulusReport.needsCycleBreak
                      ? 'text-amber-300'
                      : tribulusReport.streakDays > 0
                        ? 'text-emerald-400'
                        : 'text-slate-300'
                  }`}
                >
                  {tribulusReport.streakDays}{' '}
                  <span className="font-sans text-sm font-medium text-slate-400">
                    {tribulusReport.streakDays === 1 ? 'ден' : 'дни'} (
                    {tribulusReport.streakWeeks} седм.)
                  </span>
                </div>
              </div>
              <div className="text-right font-mono text-[11px] tabular-nums text-slate-400">
                Препоръчителен цикъл: 42–56 дни
              </div>
            </div>

            {tribulusReport.needsCycleBreak ? (
              <div
                data-testid="tribulus-break-alert"
                className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                <span>{tribulusReport.cycleAdvice}</span>
              </div>
            ) : (
              <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
                {tribulusReport.cycleAdvice}
              </p>
            )}

            {/* Корелации със сън, бодрост и Rep PR-и */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-[#141B27] p-3">
                <div className="text-[11px] text-slate-400">Бодрост / сън</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
                  {tribulusReport.sleepQualityWith !== null
                    ? `${tribulusReport.sleepQualityWith}/5`
                    : '—'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
                  без прием:{' '}
                  {tribulusReport.sleepQualityWithout !== null
                    ? `${tribulusReport.sleepQualityWithout}/5`
                    : '—'}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#141B27] p-3">
                <div className="text-[11px] text-slate-400">Часове сън</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-white">
                  {tribulusReport.sleepHoursWith !== null
                    ? `${tribulusReport.sleepHoursWith} ч`
                    : '—'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
                  без прием:{' '}
                  {tribulusReport.sleepHoursWithout !== null
                    ? `${tribulusReport.sleepHoursWithout} ч`
                    : '—'}
                </div>
              </div>

              <div className="rounded-xl border border-white/8 bg-[#141B27] p-3">
                <div className="text-[11px] text-slate-400">Rep PR тренировки</div>
                <div className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-300">
                  {tribulusReport.repPrRateWithPct !== null
                    ? `${tribulusReport.repPrRateWithPct}%`
                    : '—'}
                </div>
                <div className="mt-0.5 font-mono text-[10px] tabular-nums text-slate-500">
                  без прием:{' '}
                  {tribulusReport.repPrRateWithoutPct !== null
                    ? `${tribulusReport.repPrRateWithoutPct}%`
                    : '—'}
                </div>
              </div>
            </div>

            <p className="mt-3 font-mono text-[11px] text-slate-400">
              {tribulusReport.correlationSummary}
            </p>
          </div>

          {/* Обективна научна бележка */}
          <div
            data-testid="tribulus-objective-note"
            className="mt-4 rounded-xl border border-sky-500/25 bg-sky-950/15 p-3 text-xs leading-relaxed text-slate-300"
          >
            {tribulusReport.objectiveNote}
          </div>
        </article>

        {/* Персонализиран план за навици (Топ 3 действия за последните 7 дни) */}
        <article
          data-testid="personalized-habits-plan-card"
          className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6 lg:col-span-6"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/8 pb-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-[var(--accent-text)]" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-white">
                Персонализиран план за навици (Топ 3 действия)
              </h2>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Базирано на посл. 7 дни
            </span>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Трите най-важни практически стъпки за естествено покачване на тестостерона и изчистване на хормоналните саботьори според твоите реални записи.
          </p>

          <ol className="mt-4 space-y-3">
            {habitPlan.map((action) => (
              <li
                key={action.id}
                data-testid={`habit-plan-item-${action.priority}`}
                className="rounded-xl border border-white/10 bg-[#141B27] p-3.5"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-xs font-bold text-[var(--accent-contrast)]">
                    {action.priority}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white">{action.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {action.rationale}
                    </p>
                    <div className="mt-2 font-mono text-[11px] tabular-nums text-emerald-300">
                      Данни: {action.evidence}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </article>
      </div>

      {/* 2. Сравнителна таблица „Висок тестостерон vs. Нисък тестостерон от лоши навици“ */}
      <article
        data-testid="testosterone-comparison-table-card"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-2 border-b border-white/8 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-white sm:text-lg">
              Висок естествен тестостерон vs. Потиснат тестостерон от лоши навици
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Автоматична 7-дневна оценка от твоите реални записи
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table
            data-testid="testosterone-comparison-table"
            className="w-full min-w-[740px] border-collapse text-left text-xs"
          >
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <th className="py-2.5 pr-4 w-[18%]">Показател</th>
                <th className="py-2.5 pr-4 w-[28%] text-emerald-300">
                  🟢 Висок естествен тестостерон
                </th>
                <th className="py-2.5 pr-4 w-[28%] text-rose-300">
                  🔴 Потиснат тестостерон от лоши навици и стрес
                </th>
                <th className="py-2.5 w-[26%] text-slate-200">
                  Твоят статус (7 дни)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/8">
              {comparisonRows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`testo-row-${row.id}`}
                  className="align-top transition-colors hover:bg-white/[0.02]"
                >
                  <td className="py-3.5 pr-4 font-semibold text-white">
                    {row.metricTitle}
                  </td>
                  <td className="py-3.5 pr-4 leading-relaxed text-slate-200">
                    {row.highTestosteroneText}
                  </td>
                  <td className="py-3.5 pr-4 leading-relaxed text-slate-400">
                    {row.lowTestosteroneText}
                  </td>
                  <td className="py-3.5">
                    <div
                      className={`inline-flex items-center gap-1.5 font-semibold ${STATUS_TEXT_CLASS[row.status]}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[row.status]}`}
                      />
                      <span>{row.statusLabel}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-300">
                      {row.userEvidence}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* 3. 🌐 Научна справка от интернет (PubMed & Уикипедия, без API ключ, 30-дневен кеш) */}
      <article
        data-testid="testosterone-science-section"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-3 border-b border-white/8 pb-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-white">
                🌐 Научна справка от интернет (PubMed &amp; Уикипедия)
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Директно отворени източници без API ключ (30-дневен локален кеш)
              {scienceData.isOfflineFallback
                ? ' · Офлайн режим (вградено научно резюме)'
                : scienceFromCache
                  ? ' · Заредено от локален кеш'
                  : ' · Актуализирано онлайн'}
            </p>
          </div>

          <button
            type="button"
            data-testid="refresh-science-btn"
            onClick={() => void handleRefreshScience()}
            disabled={loadingScience}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50 whitespace-nowrap"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loadingScience ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{loadingScience ? 'Обновяване...' : 'Обнови справката'}</span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Уикипедия на български */}
          <div className="space-y-3 lg:col-span-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <BookOpen className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Уикипедия на български</span>
            </div>

            {scienceData.wikipedia.map((entry) => (
              <div
                key={entry.topic}
                data-testid={`wiki-card-${entry.topic}`}
                className="rounded-xl border border-white/10 bg-[#141B27] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">{entry.title}</h3>
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:underline whitespace-nowrap"
                  >
                    <span>Статия</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </div>
                <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-slate-300">
                  {entry.extract}
                </p>
              </div>
            ))}
          </div>

          {/* Научни публикации от PubMed */}
          <div className="lg:col-span-6">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <Globe className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              <span>PubMed публикации (testosterone · sleep · resistance training)</span>
            </div>

            <ul className="mt-3 space-y-2.5">
              {scienceData.pubmedArticles.map((art) => (
                <li
                  key={art.pmid}
                  data-testid={`pubmed-article-${art.pmid}`}
                  className="rounded-xl border border-white/10 bg-[#141B27] p-3.5 transition-colors hover:border-white/20"
                >
                  <a
                    href={art.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold leading-snug text-white group-hover:text-sky-300">
                        {art.title}
                      </div>
                      <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                        {art.year} · {art.journal} · PMID {art.pmid}
                      </div>
                    </div>
                    <ExternalLink
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-sky-300"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    </section>
  );
}
