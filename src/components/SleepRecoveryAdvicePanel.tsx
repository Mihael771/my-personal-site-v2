import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Compass,
  Moon,
  TrendingUp,
} from 'lucide-react';
import type {
  DayLog,
  MuscleAllocationConfig,
  SleepAdviceItem,
  SleepAdvicePriority,
} from '../types/fitness';
import {
  formatNumberBg,
  generateSleepRecoveryAdvice,
} from '../utils/fitnessMath';

interface SleepRecoveryAdvicePanelProps {
  logs: Record<string, DayLog>;
  todayKey: string;
  dailyBaseGainGrams?: number;
  accrueOnRestDays?: boolean;
  allocationConfig?: MuscleAllocationConfig;
  onJumpToSleep?: () => void;
}

type AdviceFilter = 'all' | 'actionable' | 'positive';

const PRIORITY_STYLES: Record<
  SleepAdvicePriority,
  {
    textClass: string;
    borderClass: string;
    bgClass: string;
  }
> = {
  critical: {
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500/35',
    bgClass: 'bg-rose-950/15',
  },
  caution: {
    textClass: 'text-amber-300',
    borderClass: 'border-amber-500/30',
    bgClass: 'bg-[#121722]',
  },
  positive: {
    textClass: 'text-emerald-400',
    borderClass: 'border-emerald-500/25',
    bgClass: 'bg-[#0F141F]',
  },
  info: {
    textClass: 'text-[var(--accent-text)]',
    borderClass: 'border-white/10',
    bgClass: 'bg-[#0F141F]',
  },
};

function PriorityIcon({ priority }: { priority: SleepAdvicePriority }) {
  if (priority === 'critical' || priority === 'caution') {
    return <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  if (priority === 'positive') {
    return <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
  return <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />;
}

export function SleepRecoveryAdvicePanel({
  logs,
  todayKey,
  onJumpToSleep,
}: SleepRecoveryAdvicePanelProps) {
  const [filter, setFilter] = useState<AdviceFilter>('all');

  const insights = useMemo(
    () => generateSleepRecoveryAdvice(logs, todayKey),
    [logs, todayKey],
  );

  const actionableCount = useMemo(
    () =>
      insights.tips.filter(
        (t) => t.priority === 'critical' || t.priority === 'caution',
      ).length,
    [insights.tips],
  );

  const positiveCount = useMemo(
    () => insights.tips.filter((t) => t.priority === 'positive').length,
    [insights.tips],
  );

  const visibleTips: SleepAdviceItem[] = useMemo(() => {
    if (filter === 'actionable') {
      return insights.tips.filter(
        (t) => t.priority === 'critical' || t.priority === 'caution',
      );
    }
    if (filter === 'positive') {
      return insights.tips.filter((t) => t.priority === 'positive');
    }
    return insights.tips;
  }, [filter, insights.tips]);

  function handleJumpToSleepInput() {
    if (onJumpToSleep) {
      onJumpToSleep();
      return;
    }
    const scoreInput = document.getElementById('today-huawei-score-input');
    if (scoreInput) {
      scoreInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (scoreInput instanceof HTMLInputElement) {
        scoreInput.focus({ preventScroll: true });
      }
      return;
    }
    document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <section
      id="recovery-advice"
      data-testid="sleep-recovery-advice-panel"
      aria-label="Персонални съвети за възстановяване и сън"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">
            Съвети за по-добро възстановяване
          </h2>
          <p
            data-testid="sleep-advice-headline"
            className="mt-1 text-sm text-slate-300"
          >
            {insights.headline}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-6 shrink-0">
          <div>
            <div className="text-xs text-slate-400">Среден сън (7 д.)</div>
            <div
              data-testid="advice-avg-sleep-7d"
              className="font-mono text-base font-bold tabular-nums text-white"
            >
              {insights.avgSleepHours7d !== null
                ? `${formatNumberBg(insights.avgSleepHours7d)} ч`
                : `${formatNumberBg(insights.todaySleepHours)} ч`}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Huawei GT 6 (7 д.)</div>
            <div
              data-testid="advice-avg-gt6-7d"
              className="font-mono text-base font-bold tabular-nums text-[var(--accent-text)]"
            >
              {insights.avgHuaweiScore7d !== null
                ? `${insights.avgHuaweiScore7d} т.`
                : insights.todayHuaweiScore !== undefined
                  ? `${insights.todayHuaweiScore} т.`
                  : '—'}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Умора (7 д.)</div>
            <div
              data-testid="advice-fatigued-days-7d"
              className={`font-mono text-base font-bold tabular-nums ${
                insights.fatiguedDays7d >= 2
                  ? 'text-rose-400'
                  : insights.fatiguedDays7d === 1
                    ? 'text-amber-300'
                    : 'text-emerald-400'
              }`}
            >
              {insights.fatiguedDays7d} / {Math.max(1, insights.loggedDays7d)} д.
            </div>
          </div>
        </div>
      </div>

      {/* Контекстна лента и филтър */}
      <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5 text-slate-200 font-medium">
            <Moon className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
            <span>Днес: {formatNumberBg(insights.todaySleepHours)} ч</span>
          </span>
          {insights.todayHuaweiScore !== undefined && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-200">
                GT 6: {insights.todayHuaweiScore} т.
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-200">
            Възстановяване: {insights.todayRecovery.percentage}%
          </span>
          {insights.hoursSpread7d !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                <span>Разброс 7 д.: {formatNumberBg(insights.hoursSpread7d)} ч</span>
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div
            role="group"
            aria-label="Филтър на съветите"
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#131924] p-0.5"
          >
            <button
              type="button"
              data-testid="advice-filter-all"
              aria-pressed={filter === 'all'}
              onClick={() => setFilter('all')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === 'all'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Всички ({insights.tips.length})
            </button>
            <button
              type="button"
              data-testid="advice-filter-actionable"
              aria-pressed={filter === 'actionable'}
              onClick={() => setFilter('actionable')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === 'actionable'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              За корекция ({actionableCount})
            </button>
            <button
              type="button"
              data-testid="advice-filter-positive"
              aria-pressed={filter === 'positive'}
              onClick={() => setFilter('positive')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filter === 'positive'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)]'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Силни страни ({positiveCount})
            </button>
          </div>

          <button
            type="button"
            data-testid="advice-jump-sleep-btn"
            onClick={handleJumpToSleepInput}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/12 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap shrink-0"
          >
            <span>Коригирай съня</span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Мрежа с контекстуални съвети */}
      {visibleTips.length === 0 ? (
        <div
          data-testid="sleep-advice-empty-filter"
          className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-[#0F141F] p-5 sm:flex-row sm:items-center"
        >
          <p className="text-sm text-slate-300">
            {filter === 'actionable'
              ? 'Няма критични корекции за днес — текущият ти режим на сън подкрепя добре възстановяването.'
              : 'Днес няма отчетени силни показатели за сън — виж приоритетните препоръки за подобрение довечера.'}
          </p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-strong)] whitespace-nowrap shrink-0"
          >
            Покажи всички ({insights.tips.length})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visibleTips.map((tip) => {
          const style = PRIORITY_STYLES[tip.priority];
          return (
            <article
              key={tip.id}
              data-testid={`sleep-advice-card-${tip.id}`}
              className={`flex flex-col justify-between rounded-xl border p-5 transition-colors ${style.borderClass} ${style.bgClass}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-400">
                    {tip.category}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${style.textClass}`}
                  >
                    <PriorityIcon priority={tip.priority} />
                    <span>{tip.priorityLabel}</span>
                  </span>
                </div>

                <h3 className="mt-2 font-display text-base font-bold text-white">
                  {tip.title}
                </h3>

                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                  {tip.body}
                </p>
              </div>

              <div className="mt-4 border-t border-white/8 pt-3 text-xs leading-relaxed text-slate-200">
                <span className="font-semibold text-[var(--accent-text)]">
                  Препоръка:{' '}
                </span>
                <span>{tip.action}</span>
              </div>
            </article>
          );
        })}
        </div>
      )}
    </section>
  );
}
