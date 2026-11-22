import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Dna,
  Flame,
  Info,
  Leaf,
  Moon,
  Scale,
  ShieldAlert,
  Sparkles,
  Target,
  Utensils,
  Zap,
} from 'lucide-react';
import type {
  DailyBiometricLog,
  HevyWorkout,
  TrainingGoalPhase,
  UserProfile,
} from '../../types/fitness';
import {
  computeAnabolicEnvironmentReport,
  type AnabolicFactorId,
  type AnabolicZone,
} from '../../utils/anabolicEnvironmentEngine';
import { formatBgNumericDate } from '../../utils/fitnessMath';
import { CardioVascularHealthCard } from './CardioVascularHealthCard';
import { ProteinLeanMassGuardCard } from './ProteinLeanMassGuardCard';
import { SamsungEnergyDipCard } from './SamsungEnergyDipCard';
import { SleepArchitectureCard } from './SleepArchitectureCard';

interface AnabolicEnvironmentPanelProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  profile: UserProfile;
  trainingGoal: TrainingGoalPhase;
  todayKey: string;
  onChangeTrainingGoal?: (nextGoal: TrainingGoalPhase) => Promise<void>;
  onOpenReadinessGoal?: () => void;
}

const GOAL_SWITCH_OPTIONS: Array<{
  id: TrainingGoalPhase;
  emoji: string;
  label: string;
}> = [
  { id: 'hypertrophy', emoji: '💪', label: 'Хипертрофия' },
  { id: 'maintenance', emoji: '⚖️', label: 'Поддържане / Бокс' },
  { id: 'fat_loss', emoji: '🔥', label: 'Сваляне / Релеф' },
];

type ComparisonViewMode = 'parallel' | 'low' | 'high';

const ZONE_VISUALS: Record<
  AnabolicZone,
  {
    strokeHex: string;
    trackHex: string;
    scoreTextClass: string;
    titleTextClass: string;
    borderClass: string;
    surfaceClass: string;
  }
> = {
  high: {
    strokeHex: '#34d399',
    trackHex: 'rgba(52, 211, 153, 0.14)',
    scoreTextClass: 'text-emerald-300',
    titleTextClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/35',
    surfaceClass: 'bg-emerald-950/15',
  },
  moderate: {
    strokeHex: '#fbbf24',
    trackHex: 'rgba(251, 191, 36, 0.14)',
    scoreTextClass: 'text-amber-300',
    titleTextClass: 'text-amber-300',
    borderClass: 'border-amber-500/35',
    surfaceClass: 'bg-amber-950/10',
  },
  low: {
    strokeHex: '#fb7185',
    trackHex: 'rgba(251, 113, 133, 0.14)',
    scoreTextClass: 'text-rose-300',
    titleTextClass: 'text-rose-300',
    borderClass: 'border-rose-500/35',
    surfaceClass: 'bg-rose-950/15',
  },
};

const FACTOR_ICONS: Record<AnabolicFactorId, typeof Moon> = {
  sleep: Moon,
  training: Activity,
  nutrition: Utensils,
  habits: Leaf,
};

function AnabolicScoreGauge({
  score,
  zone,
}: {
  score: number;
  zone: AnabolicZone;
}) {
  const visual = ZONE_VISUALS[zone];
  const radius = 70;
  const strokeWidth = 12;
  const cx = 92;
  const cy = 92;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  // 270-degree arc gauge (starts at 135 deg, sweeps clockwise 270 deg)
  const arcFraction = 0.75;
  const arcLength = circumference * arcFraction;
  const filledLength = arcLength * (clamped / 100);
  const dashOffset = arcLength - filledLength;

  // Threshold tick coordinates at 50% (270 deg = top) and 75% (337.5 deg = top-right)
  const tickPoint = (pct: number, r: number) => {
    const deg = 135 + (pct / 100) * 270;
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const tick50Inner = tickPoint(50, radius - 8);
  const tick50Outer = tickPoint(50, radius + 8);
  const tick75Inner = tickPoint(75, radius - 8);
  const tick75Outer = tickPoint(75, radius + 8);

  return (
    <div
      data-testid="anabolic-score-gauge"
      className="relative flex h-[184px] w-[184px] shrink-0 items-center justify-center"
      aria-label={`Индекс на тестостероновата среда: ${clamped}%`}
    >
      <svg
        viewBox="0 0 184 184"
        className="h-full w-full"
        role="img"
        aria-hidden="true"
      >
        {/* Background 270° track */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={visual.trackHex}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
        />
        {/* Active 270° value arc */}
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={visual.strokeHex}
          strokeWidth={strokeWidth}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
        {/* 50% and 75% zone boundary ticks */}
        <line
          x1={tick50Inner.x}
          y1={tick50Inner.y}
          x2={tick50Outer.x}
          y2={tick50Outer.y}
          stroke="rgba(251, 191, 36, 0.55)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1={tick75Inner.x}
          y1={tick75Inner.y}
          x2={tick75Outer.x}
          y2={tick75Outer.y}
          stroke="rgba(52, 211, 153, 0.65)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Scale tick labels: 0 and 100 */}
        <text
          x="36"
          y="162"
          fill="#64748b"
          fontSize="10"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          textAnchor="middle"
        >
          0%
        </text>
        <text
          x="148"
          y="162"
          fill="#64748b"
          fontSize="10"
          fontFamily="ui-monospace, SFMono-Regular, monospace"
          textAnchor="middle"
        >
          100%
        </text>
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-1">
        <span className="text-[11px] font-medium text-slate-400">
          7 зав. дни
        </span>
        <span
          data-testid="anabolic-total-score"
          className={`mt-0.5 font-mono text-4xl font-extrabold leading-none tabular-nums ${visual.scoreTextClass}`}
        >
          {clamped}%
        </span>
        <span className="mt-1.5 font-mono text-[10px] tabular-nums text-slate-400">
          Ефект за днес
        </span>
      </div>
    </div>
  );
}

export function AnabolicEnvironmentPanel({
  dailyLogs,
  hevyWorkouts,
  profile,
  trainingGoal,
  todayKey,
  onChangeTrainingGoal,
  onOpenReadinessGoal,
}: AnabolicEnvironmentPanelProps) {
  const report = useMemo(
    () =>
      computeAnabolicEnvironmentReport({
        dailyLogs,
        hevyWorkouts,
        profile,
        trainingGoal,
        todayKey,
      }),
    [dailyLogs, hevyWorkouts, profile, trainingGoal, todayKey],
  );

  const [comparisonView, setComparisonView] =
    useState<ComparisonViewMode>('parallel');
  const [savingGoal, setSavingGoal] = useState(false);

  async function handleGoalSelect(nextGoal: TrainingGoalPhase) {
    if (!onChangeTrainingGoal || nextGoal === trainingGoal) return;
    setSavingGoal(true);
    try {
      await onChangeTrainingGoal(nextGoal);
    } finally {
      setSavingGoal(false);
    }
  }

  const zoneVisual = ZONE_VISUALS[report.zone];
  const isLowActiveToday = report.zone === 'low';
  const isHighActiveToday = report.zone === 'high';
  const isModerateToday = report.zone === 'moderate';

  return (
    <div
      data-testid="anabolic-environment-panel"
      className="mt-6 space-y-6"
    >
      {/* ================================================================= */}
      {/* 1. ГОРЕН ПАНЕЛ: ИНДЕКС 0–100% + СТАТУС + ФИЗИОЛОГИЧНА БЕЛЕЖКА     */}
      {/* ================================================================= */}
      <section
        aria-label="Индекс на тестостероновата среда"
        className={`rounded-2xl border p-5 sm:p-6 ${zoneVisual.borderClass} ${zoneVisual.surfaceClass}`}
      >
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <AnabolicScoreGauge score={report.totalScore} zone={report.zone} />

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <div
                data-testid="anabolic-date-scope-subtitle"
                className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-300 sm:justify-start"
              >
                <Dna
                  className="h-3.5 w-3.5 text-[var(--accent-text)]"
                  aria-hidden="true"
                />
                <span>
                  Оценява <strong className="font-semibold text-white">последните 7 завършени дни (до вчера, {formatBgNumericDate(report.windowStartDate)} – {formatBgNumericDate(report.windowEndDate)})</strong> → показва как това ти влияе <strong className="font-semibold text-white">днес ({formatBgNumericDate(report.todayDate)})</strong>
                </span>
              </div>

              <h2
                data-testid="anabolic-zone-title"
                className={`mt-2 font-display text-xl font-extrabold leading-snug sm:text-2xl text-balance ${zoneVisual.titleTextClass}`}
              >
                {report.zoneEmoji} {report.zoneTitle}
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200">
                {report.zoneSubtitle}
              </p>

              {/* Бързи опорни сигнали: какво качва и какво дърпа надолу */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-white/10 pt-3 text-xs sm:justify-start">
                <div className="flex items-center gap-1.5 text-emerald-300">
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="text-slate-400">Най-силен фактор:</span>
                  <span className="font-semibold text-white">
                    {report.strongestFactor.shortTitle}
                  </span>
                  <span className="font-mono tabular-nums text-emerald-300">
                    ({report.strongestFactor.score}%)
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-rose-300">
                  <ArrowDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="text-slate-400">Най-голям резерв:</span>
                  <span className="font-semibold text-white">
                    {report.weakestFactor.shortTitle}
                  </span>
                  <span className="font-mono tabular-nums text-amber-300">
                    ({report.weakestFactor.score}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Дясна колона: Скала на зоните + активен цикъл Бабини зъби */}
          <div className="w-full shrink-0 rounded-xl border border-white/10 bg-[#0F141F]/90 p-4 lg:w-[290px]">
            <div className="text-xs font-semibold text-slate-300">
              Скала на анаболната среда
            </div>
            <div className="mt-2.5 space-y-2 text-xs">
              <div
                className={`flex items-center justify-between gap-2 ${
                  report.zone === 'high' ? 'font-semibold text-emerald-300' : 'text-slate-400'
                }`}
              >
                <span>🔥 Висока анаболна</span>
                <span className="font-mono tabular-nums">75–100%</span>
              </div>
              <div
                className={`flex items-center justify-between gap-2 ${
                  report.zone === 'moderate' ? 'font-semibold text-amber-300' : 'text-slate-400'
                }`}
              >
                <span>⚖️ Умерена среда</span>
                <span className="font-mono tabular-nums">50–74%</span>
              </div>
              <div
                className={`flex items-center justify-between gap-2 ${
                  report.zone === 'low' ? 'font-semibold text-rose-300' : 'text-slate-400'
                }`}
              >
                <span>⚠️ Потисната среда</span>
                <span className="font-mono tabular-nums">&lt; 50%</span>
              </div>
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">🌿 Бабини зъби</span>
                <span
                  data-testid="anabolic-tribulus-streak"
                  className="font-mono font-semibold tabular-nums text-emerald-300"
                >
                  {report.tribulus.streakDays > 0
                    ? `${report.tribulus.streakDays} ${
                        report.tribulus.streakDays === 1 ? 'ден' : 'поредни дни'
                      }`
                    : 'Няма цикъл'}
                </span>
              </div>
              {report.tribulus.energyDelta !== null && (
                <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-400">
                  Енергия с прием:{' '}
                  <span
                    className={
                      report.tribulus.energyDelta >= 0
                        ? 'text-emerald-300'
                        : 'text-amber-300'
                    }
                  >
                    {report.tribulus.energyDelta >= 0 ? '+' : ''}
                    {report.tribulus.energyDelta}/5
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Обективна бележка за физиологични фактори vs кръвни изследвания */}
        <div
          data-testid="anabolic-lab-disclaimer"
          className="mt-5 flex items-start gap-2.5 border-t border-white/10 pt-3.5 text-xs leading-relaxed text-slate-300"
        >
          <Info
            className="mt-0.5 h-4 w-4 shrink-0 text-sky-400"
            aria-hidden="true"
          />
          <p>{report.disclaimerNote}</p>
        </div>
      </section>

      {/* ================================================================= */}
      {/* 2. РАЗБИВКА ПО 4 ФАКТОРА (МИНИ-КАРТИ)                             */}
      {/* ================================================================= */}
      <section aria-label="Разбивка по четирите физиологични фактора">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-bold text-white sm:text-lg">
            Разбивка по фактори (какво качва и какво сваля индекса)
          </h3>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Тежести: Сън 30% · Тренировки 25% · Храна 20% · Навици 25%
          </span>
        </div>

        <div
          data-testid="anabolic-factors-grid"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          {report.factors.map((factor) => {
            const Icon = FACTOR_ICONS[factor.id];
            const barColor =
              factor.direction === 'lifting'
                ? 'bg-emerald-400'
                : factor.direction === 'neutral'
                  ? 'bg-amber-400'
                  : 'bg-rose-400';
            const dirTextClass =
              factor.direction === 'lifting'
                ? 'text-emerald-300'
                : factor.direction === 'neutral'
                  ? 'text-amber-300'
                  : 'text-rose-300';
            const cardBorderClass =
              factor.direction === 'lifting'
                ? 'border-emerald-500/25'
                : factor.direction === 'dragging'
                  ? 'border-rose-500/30'
                  : 'border-white/10';

            return (
              <article
                key={factor.id}
                data-testid={`anabolic-factor-${factor.id}`}
                className={`flex flex-col justify-between rounded-2xl border bg-[#0F141F] p-5 ${cardBorderClass}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Icon className="h-4 w-4 text-slate-300" aria-hidden="true" />
                      <span className="font-mono tabular-nums">
                        Тежест {factor.weightPct}%
                      </span>
                    </div>
                    <span className={`text-xs font-semibold ${dirTextClass}`}>
                      {factor.directionLabel}
                    </span>
                  </div>

                  <h4 className="mt-2.5 font-display text-sm font-bold text-white">
                    {factor.title}
                  </h4>

                  <div className="mt-3 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-2xl font-extrabold tabular-nums text-white">
                      {factor.score}%
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                      +{factor.weightedPoints} т. принос
                    </span>
                  </div>

                  {/* Clean horizontal bar */}
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                    role="progressbar"
                    aria-valuenow={factor.score}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${factor.title}: ${factor.score}%`}
                  >
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${factor.score}%` }}
                    />
                  </div>

                  <div className="mt-3 text-xs font-semibold text-slate-200">
                    {factor.headline}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {factor.detail}
                  </p>
                </div>

                <div className="mt-4 border-t border-white/8 pt-2.5 font-mono text-[11px] tabular-nums text-slate-300">
                  {factor.metricsLine}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ================================================================= */}
      {/* 3. ТОП 3 КОНКРЕТНИ ДЕЙСТВИЯ ЗА СЛЕДВАЩИТЕ 48 ЧАСА                  */}
      {/* ================================================================= */}
      <section
        data-testid="anabolic-actions-48h"
        aria-label="Топ 3 конкретни действия за вдигане на тестостерона в следващите 48 часа"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Sparkles
                className="h-3.5 w-3.5 text-[var(--accent-text)]"
                aria-hidden="true"
              />
              <span>
                Персонализирано за ДНЕС ({formatBgNumericDate(report.todayDate)}) по последните 7 завършени дни (до вчера)
              </span>
            </div>
            <h3 className="mt-1 font-display text-base font-bold text-white sm:text-lg">
              Топ 3 конкретни действия за вдигане на тестостерона в следващите 48 ч.
            </h3>
          </div>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Приоритет по най-слабия фактор
          </span>
        </div>

        <ol className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {report.actions48h.map((action) => (
            <li
              key={action.id}
              data-testid={`anabolic-action-${action.rank}`}
              className="flex flex-col justify-between rounded-xl border border-white/10 bg-[#141B27] p-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-[var(--accent)] font-mono text-xs font-bold text-[var(--accent-contrast)]">
                    {action.rank}
                  </span>
                  <span className="font-mono text-[11px] font-medium tabular-nums text-emerald-300">
                    {action.impactLabel}
                  </span>
                </div>

                <h4 className="mt-3 font-display text-sm font-bold leading-snug text-white">
                  {action.title}
                </h4>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                  {action.rationale}
                </p>
              </div>

              <div className="mt-3.5 border-t border-white/8 pt-2.5 font-mono text-[11px] tabular-nums text-slate-400">
                <span className="text-slate-500">Твоите данни: </span>
                <span className="text-slate-200">{action.evidence}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ================================================================= */}
      {/* 4. ИНТЕРАКТИВЕН СРАВНИТЕЛЕН ПАНЕЛ: НИСЪК СРЕЩУ ВИСОК ТЕСТОСТЕРОН  */}
      {/* ================================================================= */}
      <section
        data-testid="anabolic-comparison-panel"
        aria-label="Как ти влияе ниският срещу високия тестостерон"
        className="rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
      >
        <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Scale className="h-3.5 w-3.5 text-slate-300" aria-hidden="true" />
              <span>Интерактивно сравнение</span>
              <span aria-hidden="true">·</span>
              <span className={zoneVisual.titleTextClass}>
                {isHighActiveToday
                  ? 'Днес си в зона: Висок / оптимален тестостерон'
                  : isLowActiveToday
                    ? 'Днес си в зона: Нисък / потиснат тестостерон'
                    : `Днес си в междинна зона (${report.totalScore}%) — стреми се към дясната колона`}
              </span>
            </div>
            <h3 className="mt-1 font-display text-base font-bold text-white sm:text-lg">
              Как ти влияе ниският срещу високия тестостерон
            </h3>
          </div>

          {/* Сегментиран превключвател (Паралелно / Нисък / Висок) */}
          <div
            role="group"
            aria-label="Режим на сравнение"
            className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1 self-start lg:self-auto"
          >
            <button
              type="button"
              data-testid="comparison-mode-parallel"
              onClick={() => setComparisonView('parallel')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                comparisonView === 'parallel'
                  ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Паралелно (2 колони)
            </button>
            <button
              type="button"
              data-testid="comparison-mode-low"
              onClick={() => setComparisonView('low')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                comparisonView === 'low'
                  ? 'bg-rose-500/25 text-rose-200 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ⚠️ Нисък / потиснат
            </button>
            <button
              type="button"
              data-testid="comparison-mode-high"
              onClick={() => setComparisonView('high')}
              className={`h-8 rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                comparisonView === 'high'
                  ? 'bg-emerald-500/25 text-emerald-200 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ⚡ Висок / оптимален
            </button>
          </div>
        </div>

        {/* Сравнителни колони */}
        <div
          className={`mt-5 grid grid-cols-1 gap-5 ${
            comparisonView === 'parallel' ? 'lg:grid-cols-2' : ''
          }`}
        >
          {/* КОЛОНА 1: При нисък / потиснат тестостерон */}
          {(comparisonView === 'parallel' || comparisonView === 'low') && (
            <article
              data-testid="comparison-col-low"
              data-active-zone={isLowActiveToday ? 'true' : 'false'}
              className={`rounded-2xl border p-5 transition-colors ${
                isLowActiveToday
                  ? 'border-rose-400/70 bg-rose-950/25 ring-1 ring-rose-400/35'
                  : 'border-white/10 bg-[#141B27]/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert
                    className="h-4 w-4 text-rose-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-sm font-bold text-rose-200 sm:text-base">
                    ⚠️ При нисък / потиснат тестостерон
                  </h4>
                </div>
                {isLowActiveToday && (
                  <span
                    data-testid="comparison-today-marker-low"
                    className="font-mono text-xs font-semibold text-rose-300"
                  >
                    ● Твоята зона днес ({report.totalScore}%)
                  </span>
                )}
              </div>

              <div className="mt-4 divide-y divide-white/8">
                {report.comparisonCategories.map((cat) => (
                  <div key={cat.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <span aria-hidden="true">{cat.emoji}</span>
                      <span>{cat.title}</span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
                      {cat.lowPoints.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/80"
                            aria-hidden="true"
                          />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          )}

          {/* КОЛОНА 2: При висок / оптимален тестостерон */}
          {(comparisonView === 'parallel' || comparisonView === 'high') && (
            <article
              data-testid="comparison-col-high"
              data-active-zone={isHighActiveToday ? 'true' : 'false'}
              className={`rounded-2xl border p-5 transition-colors ${
                isHighActiveToday
                  ? 'border-emerald-400/70 bg-emerald-950/25 ring-1 ring-emerald-400/35'
                  : isModerateToday
                    ? 'border-amber-400/35 bg-[#141B27]'
                    : 'border-white/10 bg-[#141B27]/80'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Zap
                    className="h-4 w-4 text-emerald-400 shrink-0"
                    aria-hidden="true"
                  />
                  <h4 className="font-display text-sm font-bold text-emerald-200 sm:text-base">
                    ⚡ При висок / оптимален тестостерон
                  </h4>
                </div>
                {isHighActiveToday ? (
                  <span
                    data-testid="comparison-today-marker-high"
                    className="font-mono text-xs font-semibold text-emerald-300"
                  >
                    ● Твоята зона днес ({report.totalScore}%)
                  </span>
                ) : isModerateToday ? (
                  <span
                    data-testid="comparison-today-marker-moderate"
                    className="font-mono text-xs font-medium text-amber-300"
                  >
                    Целева зона (+{Math.max(1, 75 - report.totalScore)}% до 75%)
                  </span>
                ) : null}
              </div>

              <div className="mt-4 divide-y divide-white/8">
                {report.comparisonCategories.map((cat) => (
                  <div key={cat.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-2 text-xs font-bold text-white">
                      <span aria-hidden="true">{cat.emoji}</span>
                      <span>{cat.title}</span>
                    </div>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-200">
                      {cat.highPoints.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                            aria-hidden="true"
                          />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </article>
          )}
        </div>

        {/* Директен превключвател на фитнес целта (динамично обновява сравнението) */}
        <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Target className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0" aria-hidden="true" />
            <span>
              Активна цел:{' '}
              <strong className="font-semibold text-white">
                {report.goalImpact.goalLabel}
              </strong>
            </span>
          </div>

          {onChangeTrainingGoal ? (
            <div
              role="group"
              aria-label="Смяна на фитнес цел"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
            >
              {GOAL_SWITCH_OPTIONS.map((opt) => {
                const isSelected = trainingGoal === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={savingGoal}
                    data-testid={`anabolic-goal-switch-${opt.id}`}
                    aria-pressed={isSelected}
                    onClick={() => void handleGoalSelect(opt.id)}
                    className={`inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                      isSelected
                        ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <span aria-hidden="true">{opt.emoji}</span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          ) : onOpenReadinessGoal ? (
            <button
              type="button"
              onClick={onOpenReadinessGoal}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] transition-opacity hover:opacity-85 whitespace-nowrap"
            >
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Смени целта в „Днешна готовност“ →</span>
            </button>
          ) : null}
        </div>
      </section>

      {/* ================================================================= */}
      {/* 5. МОДУЛ: 🔋 Samsung Energy Score (0–100) + Sleeping HR Dip       */}
      {/* ================================================================= */}
      <SamsungEnergyDipCard
        dailyLogs={dailyLogs}
        hevyWorkouts={hevyWorkouts}
        todayKey={todayKey}
      />

      {/* ================================================================= */}
      {/* 6. МОДУЛ 3: 🌙 Архитектура на съня и нощен анаболен пик           */}
      {/* ================================================================= */}
      <SleepArchitectureCard dailyLogs={dailyLogs} todayKey={todayKey} />

      {/* ================================================================= */}
      {/* 6. МОДУЛ 4: ❤️ Съдово здраве и кръвоснабдяване (GT 6)             */}
      {/* ================================================================= */}
      <CardioVascularHealthCard dailyLogs={dailyLogs} todayKey={todayKey} />

      {/* ================================================================= */}
      {/* 7. МОДУЛ 5: 🥩 Анаболен праг на протеина и защита от омазняване   */}
      {/* ================================================================= */}
      <ProteinLeanMassGuardCard
        dailyLogs={dailyLogs}
        hevyWorkouts={hevyWorkouts}
        profile={profile}
        todayKey={todayKey}
      />
    </div>
  );
}
