import { useEffect, useMemo, useState } from 'react';
import { Activity, Dumbbell, HeartPulse, Moon } from 'lucide-react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import { formatBgDate, formatNumberBg } from '../../utils/fitnessMath';
import {
  STRENGTH_INDEX_OPTION,
  buildHabitBodyImpactDataset,
  getHabitImpactExerciseOptions,
  type HabitImpactDayPoint,
} from '../../utils/habitBodyImpact';

interface HabitBodyImpactChartProps {
  dailyLogs: DailyBiometricLog[];
  hevyWorkouts: HevyWorkout[];
  habitItems: string[];
  todayKey: string;
}

const FRESHNESS_SHORT: Record<number, string> = {
  1: 'Изтощен',
  2: 'Уморен',
  3: 'Средно',
  4: 'Свеж',
  5: 'Отлично',
};

function formatSigned(val: number, suffix: string): string {
  const sign = val > 0 ? '+' : '';
  return `${sign}${formatNumberBg(val)}${suffix}`;
}

export function HabitBodyImpactChart({
  dailyLogs,
  hevyWorkouts,
  habitItems,
  todayKey,
}: HabitBodyImpactChartProps) {
  const exerciseMeta = useMemo(
    () => getHabitImpactExerciseOptions(hevyWorkouts),
    [hevyWorkouts],
  );

  const [selectedExercise, setSelectedExercise] = useState<string>(
    () => exerciseMeta.defaultSelection,
  );
  const [anchorMode, setAnchorMode] = useState<'auto' | 'today'>('auto');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);

  // Sync default selection if workouts load asynchronously after initial mount
  useEffect(() => {
    if (
      selectedExercise === STRENGTH_INDEX_OPTION &&
      exerciseMeta.defaultSelection !== STRENGTH_INDEX_OPTION &&
      hevyWorkouts.length > 0
    ) {
      setSelectedExercise(exerciseMeta.defaultSelection);
      return;
    }
    if (
      selectedExercise !== STRENGTH_INDEX_OPTION &&
      exerciseMeta.options.length > 0 &&
      !exerciseMeta.options.some((o) => o.title === selectedExercise)
    ) {
      setSelectedExercise(exerciseMeta.defaultSelection);
    }
  }, [exerciseMeta, selectedExercise, hevyWorkouts.length]);

  const dataset = useMemo(
    () =>
      buildHabitBodyImpactDataset({
        dailyLogs,
        hevyWorkouts,
        habitItems,
        todayKey,
        selectedExercise,
        anchorDateOverride: anchorMode === 'today' ? todayKey : undefined,
      }),
    [dailyLogs, hevyWorkouts, habitItems, todayKey, selectedExercise, anchorMode],
  );

  const defaultInspectIdx = useMemo(() => {
    for (let i = dataset.days.length - 1; i >= 0; i--) {
      const d = dataset.days[i];
      if (d.hasCheckIn || d.hasWorkout) return i;
    }
    return dataset.days.length - 1;
  }, [dataset.days]);

  const activeIdx = hoveredIdx ?? pinnedIdx ?? defaultInspectIdx;
  const activeDay: HabitImpactDayPoint | null =
    dataset.days[activeIdx] ?? null;

  // Unified SVG coordinates: 3 synchronized tracks sharing exact 30-day X-axis
  const svgW = 920;
  const svgH = 516;
  const padL = 56;
  const padR = 24;
  const plotW = svgW - padL - padR; // 840px -> 28px per day
  const slotW = plotW / dataset.days.length;

  const habitTopY = 14;
  const habitBotY = 52;

  const track1Top = 70;
  const track1Bot = 178; // height 108 (Resting HR)

  const track2Top = 208;
  const track2Bot = 316; // height 108 (Sleep)

  const track3Top = 346;
  const track3Bot = 466; // height 120 (Strength 1RM / %)

  const bgTop = 58;
  const bgBot = 474;

  const xCenter = (idx: number) => padL + idx * slotW + slotW / 2;

  // Dynamic scales computed in useMemo
  const scales = useMemo(() => {
    // Track 1: Resting HR (bpm)
    const hrs = dataset.days
      .map((d) => d.restingHr)
      .filter((v): v is number => v !== null);
    const hrMin =
      hrs.length > 0 ? Math.max(30, Math.floor((Math.min(...hrs) - 4) / 2) * 2) : 46;
    const hrMax =
      hrs.length > 0
        ? Math.max(hrMin + 10, Math.ceil((Math.max(...hrs) + 4) / 2) * 2)
        : 76;

    // Track 2: Sleep hours
    const sleeps = dataset.days
      .map((d) => d.sleepHours)
      .filter((v): v is number => v !== null);
    const sleepMin = 0;
    const sleepMax =
      sleeps.length > 0
        ? Math.max(10, Math.ceil(Math.max(...sleeps) + 0.5))
        : 10;

    // Track 3: Strength (1RM kg or Index %)
    const strengths = dataset.days
      .map((d) => d.strengthTrackValue)
      .filter((v): v is number => v !== null);
    let strMin = dataset.isStrengthIndexMode ? 85 : 40;
    let strMax = dataset.isStrengthIndexMode ? 115 : 120;
    if (strengths.length > 0) {
      const rawMin = Math.min(...strengths);
      const rawMax = Math.max(...strengths);
      const pad = Math.max(
        dataset.isStrengthIndexMode ? 4 : 5,
        (rawMax - rawMin) * 0.25,
      );
      strMin = Math.max(0, Math.floor((rawMin - pad) / 2) * 2);
      strMax = Math.max(strMin + 8, Math.ceil((rawMax + pad) / 2) * 2);
    }

    return { hrMin, hrMax, sleepMin, sleepMax, strMin, strMax };
  }, [dataset.days, dataset.isStrengthIndexMode]);

  const yHr = (val: number) => {
    const span = Math.max(1, scales.hrMax - scales.hrMin);
    const clamped = Math.min(scales.hrMax, Math.max(scales.hrMin, val));
    return track1Bot - ((clamped - scales.hrMin) / span) * (track1Bot - track1Top);
  };

  const ySleep = (val: number) => {
    const span = Math.max(1, scales.sleepMax - scales.sleepMin);
    const clamped = Math.min(scales.sleepMax, Math.max(scales.sleepMin, val));
    return (
      track2Bot - ((clamped - scales.sleepMin) / span) * (track2Bot - track2Top)
    );
  };

  const yStrength = (val: number) => {
    const span = Math.max(1, scales.strMax - scales.strMin);
    const clamped = Math.min(scales.strMax, Math.max(scales.strMin, val));
    return (
      track3Bot - ((clamped - scales.strMin) / span) * (track3Bot - track3Top)
    );
  };

  const hrPath = useMemo(() => {
    const parts: string[] = [];
    dataset.days.forEach((d, idx) => {
      if (d.restingHr === null) return;
      const x = xCenter(idx);
      const y = yHr(d.restingHr);
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return parts.join(' ');
  }, [dataset.days, scales.hrMin, scales.hrMax]);

  const strengthPath = useMemo(() => {
    const parts: string[] = [];
    dataset.days.forEach((d, idx) => {
      if (d.strengthTrackValue === null) return;
      const x = xCenter(idx);
      const y = yStrength(d.strengthTrackValue);
      parts.push(`${parts.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
    });
    return parts.join(' ');
  }, [dataset.days, scales.strMin, scales.strMax]);

  const hasAnyWindowData =
    dataset.days.some((d) => d.hasCheckIn || d.hasWorkout);
  const ab = dataset.abComparison;

  const showAnchorToggle =
    dataset.latestDataDate !== null && dataset.latestDataDate !== todayKey;

  return (
    <section
      data-testid="habit-body-impact-section"
      aria-label="Влияние на навиците върху тялото (последните 30 дни)"
      className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие и контроли */}
      <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <Activity
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>3 синхронизирани писти · обща 30-дневна ос и курсор</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white text-balance">
            Влияние на навиците върху тялото (последните 30 дни)
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-slate-400">
            Проследява как полезните и вредните навици (алкохол, никотин, късно лягане, джънк, висок стрес) се отразяват на сутрешния пулс, съня и силата в залата на следващия ден.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {showAnchorToggle && (
            <div
              role="group"
              aria-label="Период на 30-дневната графика"
              className="inline-flex items-center gap-1 rounded-lg border border-white/12 bg-[#141B27] p-1"
            >
              <button
                type="button"
                data-testid="habit-impact-anchor-auto"
                onClick={() => setAnchorMode('auto')}
                className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  anchorMode === 'auto'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Последни данни
              </button>
              <button
                type="button"
                data-testid="habit-impact-anchor-today"
                onClick={() => setAnchorMode('today')}
                className={`h-8 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  anchorMode === 'today'
                    ? 'bg-[var(--accent)] text-[var(--accent-contrast)] font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Към днес
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <label
              htmlFor="habit-impact-exercise-select"
              className="text-xs font-medium text-slate-400 whitespace-nowrap"
            >
              Писта 3 (Сила):
            </label>
            <select
              id="habit-impact-exercise-select"
              data-testid="habit-impact-exercise-select"
              value={dataset.selectedExercise}
              onChange={(e) => setSelectedExercise(e.target.value)}
              className="h-9 max-w-[260px] rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-white focus:border-[var(--accent)] focus:outline-none"
            >
              <option value={STRENGTH_INDEX_OPTION}>
                Среден индекс на силата (%) — всички упр.
              </option>
              {exerciseMeta.options.map((opt) => (
                <option key={opt.title} value={opt.title}>
                  {opt.title} ({opt.workoutCount} тр.)
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Интерактивна Unified Tooltip лента (актуализира се мигновено при посочване / докосване) */}
      {activeDay && (
        <div
          data-testid="habit-impact-tooltip"
          className="mt-4 rounded-xl border border-white/10 bg-[#131926] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-sm font-bold tabular-nums text-white">
                {formatBgDate(activeDay.date)}
              </span>
              <span className="text-slate-500" aria-hidden="true">
                ·
              </span>
              <span className="text-slate-400">
                {hoveredIdx !== null
                  ? 'Преглед при посочване'
                  : pinnedIdx !== null
                    ? 'Избран ден (кликни друг ден за смяна)'
                    : 'Последен ден с данни (посочи или докосни ден от графиката)'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              {activeDay.hasHarmfulToday && (
                <span className="text-rose-300 font-semibold">
                  Вреден навик в този ден ({activeDay.harmfulCount})
                </span>
              )}
              {activeDay.isAfterHarmfulDay && (
                <span className="text-amber-300 font-semibold">
                  Сутрин след вреден навик
                </span>
              )}
              {!activeDay.hasHarmfulToday &&
                !activeDay.isAfterHarmfulDay &&
                activeDay.isAfterCleanDay && (
                  <span className="text-emerald-400 font-medium">
                    След чист режим
                  </span>
                )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
            {/* 1. Навици */}
            <div>
              <div className="text-[11px] font-medium text-slate-400">
                Навици (ден + предна вечер)
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums text-emerald-400">
                {activeDay.beneficialCount}/{activeDay.totalBeneficialTarget} полезни
              </div>
              {activeDay.harmfulHabits.length > 0 && (
                <div className="mt-0.5 text-[11px] text-rose-300">
                  Вредни в този ден: {activeDay.harmfulHabits.join(', ')}
                </div>
              )}
              {activeDay.prevDayHarmfulHabits.length > 0 && (
                <div className="mt-0.5 text-[11px] text-amber-300">
                  От предната вечер: {activeDay.prevDayHarmfulHabits.join(', ')}
                </div>
              )}
              {activeDay.harmfulHabits.length === 0 &&
                activeDay.prevDayHarmfulHabits.length === 0 && (
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {activeDay.beneficialHabits.length > 0
                      ? activeDay.beneficialHabits.slice(0, 3).join(', ')
                      : 'Без отбелязани навици'}
                  </div>
                )}
            </div>

            {/* 2. Пулс в покой */}
            <div>
              <div className="text-[11px] font-medium text-slate-400">
                Сутрешен пулс в покой
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums text-white">
                {activeDay.restingHr !== null ? `${activeDay.restingHr} bpm` : '—'}
              </div>
              <div
                className={`mt-0.5 font-mono text-[11px] tabular-nums ${
                  activeDay.restingHrDelta === null
                    ? 'text-slate-500'
                    : activeDay.restingHrDelta >= 3
                      ? 'text-rose-300'
                      : activeDay.restingHrDelta <= -2
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                }`}
              >
                {activeDay.restingHrDelta !== null
                  ? `${formatSigned(activeDay.restingHrDelta, ' bpm')} спрямо 30д ср.`
                  : 'Няма измерен пулс'}
              </div>
            </div>

            {/* 3. Сън */}
            <div>
              <div className="text-[11px] font-medium text-slate-400">
                Сън и качество
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums text-indigo-300">
                {activeDay.sleepHours !== null
                  ? `${formatNumberBg(activeDay.sleepHours)} ч.`
                  : '—'}
                {activeDay.sleepQuality !== null
                  ? ` · ${activeDay.sleepQuality}/5`
                  : ''}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {activeDay.sleepQuality !== null
                  ? FRESHNESS_SHORT[activeDay.sleepQuality]
                  : activeDay.sleepHours !== null
                    ? activeDay.sleepHours >= 7.5
                      ? 'Над целта (7.5 ч.)'
                      : 'Под целта (7.5 ч.)'
                    : 'Няма запис за сън'}
              </div>
            </div>

            {/* 4. Сила / Обем в залата */}
            <div>
              <div className="text-[11px] font-medium text-slate-400">
                Зала (1RM / обем)
              </div>
              <div className="mt-1 font-mono font-semibold tabular-nums text-emerald-300">
                {activeDay.strengthTrackValue !== null
                  ? dataset.isStrengthIndexMode
                    ? `Индекс: ${formatNumberBg(activeDay.strengthTrackValue)}%`
                    : `1RM: ${formatNumberBg(activeDay.strengthTrackValue)} kg`
                  : activeDay.best1RMValueKg !== null
                    ? `1RM: ${formatNumberBg(activeDay.best1RMValueKg)} kg`
                    : activeDay.hasWorkout
                      ? 'Тренировка (BW)'
                      : 'Почивен ден'}
              </div>
              <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                {activeDay.hasWorkout
                  ? `Обем: ${formatNumberBg(activeDay.workoutVolumeKg)} kg${
                      activeDay.workoutAvgRpe !== null
                        ? ` · RPE ${formatNumberBg(activeDay.workoutAvgRpe)}`
                        : ''
                    }`
                  : 'Няма тренировка от Hevy'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Основна синхронизирана 3-пистова SVG графика */}
      {!hasAnyWindowData ? (
        <div
          data-testid="habit-impact-empty-state"
          className="mt-5 rounded-xl border border-white/8 bg-[#0C111A] p-8 text-center text-sm text-slate-400"
        >
          Няма записани дневни чек-ини или Hevy тренировки за последните 30 дни. Въведи сън, пулс и навици в „Дневен чек-ин“, за да се визуализират синхронизираните криви.
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <svg
            data-testid="habit-body-impact-svg"
            viewBox={`0 0 ${svgW} ${svgH}`}
            role="img"
            aria-label="Синхронизирана 30-дневна графика на навици, сутрешен пулс, сън и силов прогрес 1RM"
            className="w-full min-w-[680px]"
            onMouseLeave={() => setHoveredIdx(null)}
          >
            {/* Фонови ленти за 3-те писти */}
            <rect
              x={padL}
              y={track1Top - 10}
              width={plotW}
              height={track1Bot - track1Top + 18}
              rx={6}
              fill="rgba(255,255,255,0.018)"
              stroke="rgba(255,255,255,0.06)"
            />
            <rect
              x={padL}
              y={track2Top - 10}
              width={plotW}
              height={track2Bot - track2Top + 18}
              rx={6}
              fill="rgba(255,255,255,0.018)"
              stroke="rgba(255,255,255,0.06)"
            />
            <rect
              x={padL}
              y={track3Top - 10}
              width={plotW}
              height={track3Bot - track3Top + 18}
              rx={6}
              fill="rgba(255,255,255,0.018)"
              stroke="rgba(255,255,255,0.06)"
            />

            {/* ФОНОВ СЛОЙ ЗА НАВИЦИТЕ (през всички 3 писти): червен маркер за ден с вреден навик + пунктирана рамка за следващия ден */}
            {dataset.days.map((day, idx) => {
              const colX = padL + idx * slotW + 2;
              const colW = Math.max(4, slotW - 4);
              return (
                <g key={`bg-${day.date}`}>
                  {day.hasHarmfulToday && (
                    <>
                      <rect
                        data-testid={`harmful-day-bg-${day.date}`}
                        x={colX}
                        y={bgTop}
                        width={colW}
                        height={bgBot - bgTop}
                        rx={3}
                        fill="rgba(244, 63, 94, 0.13)"
                      />
                      <line
                        x1={colX}
                        x2={colX + colW}
                        y1={bgTop}
                        y2={bgTop}
                        stroke="#f43f5e"
                        strokeWidth={2}
                      />
                    </>
                  )}
                  {day.isAfterHarmfulDay && (
                    <rect
                      data-testid={`after-harmful-bg-${day.date}`}
                      x={colX}
                      y={bgTop}
                      width={colW}
                      height={bgBot - bgTop}
                      rx={3}
                      fill={
                        day.hasHarmfulToday
                          ? 'transparent'
                          : 'rgba(244, 63, 94, 0.045)'
                      }
                      stroke="rgba(251, 113, 133, 0.6)"
                      strokeWidth={1.1}
                      strokeDasharray="4 3"
                    />
                  )}
                </g>
              );
            })}

            {/* НАЙ-ОТГОРЕ: Индикатори за навици (зелени стълбчета за полезни, червен триъгълник за вредни) */}
            <text
              x={padL - 8}
              y={36}
              textAnchor="end"
              fill="#94a3b8"
              fontSize={10}
              className="font-mono"
            >
              Навици
            </text>
            {dataset.days.map((day, idx) => {
              const cx = xCenter(idx);
              const ratio = Math.min(
                1,
                day.beneficialCount / Math.max(1, day.totalBeneficialTarget),
              );
              const barH = day.beneficialCount > 0 ? Math.max(4, ratio * 22) : 0;

              return (
                <g key={`habit-top-${day.date}`}>
                  {/* Зелено стълбче за броя изпълнени полезни навици */}
                  {barH > 0 ? (
                    <rect
                      x={cx - 4.5}
                      y={habitBotY - barH}
                      width={9}
                      height={barH}
                      rx={2}
                      fill={day.beneficialCount >= 4 ? '#10b981' : '#34d399'}
                      opacity={day.beneficialCount >= 4 ? 0.95 : 0.6}
                    />
                  ) : (
                    <circle
                      cx={cx}
                      cy={habitBotY - 3}
                      r={1.5}
                      fill="rgba(148, 163, 184, 0.3)"
                    />
                  )}

                  {/* Червен триъгълник при отбелязан вреден навик */}
                  {day.hasHarmfulToday && (
                    <polygon
                      points={`${cx},${habitTopY} ${cx - 5},${habitTopY + 9} ${cx + 5},${habitTopY + 9}`}
                      fill="#f43f5e"
                      stroke="#0F141F"
                      strokeWidth={0.8}
                    />
                  )}
                </g>
              );
            })}

            {/* ПИСТА 1: Сутрешен пулс в покой (Resting HR, bpm) */}
            <text
              x={padL + 8}
              y={track1Top + 2}
              fill="#cbd5e1"
              fontSize={11}
              fontWeight={600}
            >
              1. Пулс в покой (bpm)
            </text>
            {[0, 0.5, 1].map((frac) => {
              const val = Math.round(
                scales.hrMin + (scales.hrMax - scales.hrMin) * frac,
              );
              const y = yHr(val);
              return (
                <g key={`hr-tick-${frac}`}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize={10}
                    className="font-mono"
                  >
                    {val}
                  </text>
                </g>
              );
            })}
            {/* Хоризонтална пунктирана линия за 30-дневната средна стойност на пулса */}
            {dataset.avgRestingHr30d !== null && (
              <g>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={yHr(dataset.avgRestingHr30d)}
                  y2={yHr(dataset.avgRestingHr30d)}
                  stroke="#fb923c"
                  strokeWidth={1.3}
                  strokeDasharray="4 4"
                />
                <text
                  x={padL + plotW - 6}
                  y={Math.max(track1Top + 10, yHr(dataset.avgRestingHr30d) - 4)}
                  textAnchor="end"
                  fill="#fb923c"
                  fontSize={10}
                  className="font-mono"
                >
                  Ср. {formatNumberBg(dataset.avgRestingHr30d)} bpm
                </text>
              </g>
            )}
            {hrPath && (
              <path
                d={hrPath}
                fill="none"
                stroke="#f97316"
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {dataset.days.map((day, idx) => {
              if (day.restingHr === null) return null;
              const cx = xCenter(idx);
              const cy = yHr(day.restingHr);
              const isSpike =
                day.restingHrDelta !== null && day.restingHrDelta >= 3;
              const isSelected = activeIdx === idx;
              return (
                <circle
                  key={`hr-pt-${day.date}`}
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5.2 : isSpike ? 4 : 3.2}
                  fill={isSpike || day.isAfterHarmfulDay ? '#f43f5e' : '#fb923c'}
                  stroke={isSelected ? '#ffffff' : '#0F141F'}
                  strokeWidth={isSelected ? 2 : 1.4}
                />
              );
            })}

            {/* ПИСТА 2: Продължителност и качество на съня (часове) */}
            <text
              x={padL + 8}
              y={track2Top + 2}
              fill="#cbd5e1"
              fontSize={11}
              fontWeight={600}
            >
              2. Сън (часове и качество)
            </text>
            {[0, 5, 7.5, scales.sleepMax].map((tick) => {
              const y = ySleep(tick);
              const isRef = tick === 7.5;
              return (
                <g key={`sleep-tick-${tick}`}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={y}
                    y2={y}
                    stroke={isRef ? '#a78bfa' : 'rgba(255,255,255,0.06)'}
                    strokeWidth={isRef ? 1.4 : 1}
                    strokeDasharray={isRef ? '4 4' : undefined}
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill={isRef ? '#c4b5fd' : '#94a3b8'}
                    fontSize={10}
                    className="font-mono"
                  >
                    {tick}ч
                  </text>
                </g>
              );
            })}
            <text
              x={padL + plotW - 6}
              y={ySleep(7.5) - 4}
              textAnchor="end"
              fill="#c4b5fd"
              fontSize={10}
              className="font-mono"
            >
              Цел 7.5 ч.
            </text>
            {dataset.days.map((day, idx) => {
              if (day.sleepHours === null) return null;
              const cx = xCenter(idx);
              const topY = ySleep(day.sleepHours);
              const barH = Math.max(2, track2Bot - topY);
              const isSelected = activeIdx === idx;
              const barColor =
                day.sleepHours >= 7.5
                  ? '#818cf8'
                  : day.sleepHours >= 6.5
                    ? '#38bdf8'
                    : '#a855f7';
              const opacity =
                day.sleepQuality !== null
                  ? 0.45 + (day.sleepQuality / 5) * 0.5
                  : 0.8;

              return (
                <g key={`sleep-bar-${day.date}`}>
                  <rect
                    x={cx - 7}
                    y={topY}
                    width={14}
                    height={barH}
                    rx={3}
                    fill={barColor}
                    opacity={isSelected ? 1 : opacity}
                    stroke={isSelected ? '#ffffff' : 'none'}
                    strokeWidth={isSelected ? 1.3 : 0}
                  />
                </g>
              );
            })}

            {/* ПИСТА 3: Силов прогрес (1RM в kg от Hevy или Среден индекс %) */}
            <text
              x={padL + 8}
              y={track3Top + 2}
              fill="#cbd5e1"
              fontSize={11}
              fontWeight={600}
            >
              3. Силов прогрес — {dataset.strengthLabel}
            </text>
            {[0, 0.5, 1].map((frac) => {
              const val = Math.round(
                scales.strMin + (scales.strMax - scales.strMin) * frac,
              );
              const y = yStrength(val);
              return (
                <g key={`str-tick-${frac}`}>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                  />
                  <text
                    x={padL - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize={10}
                    className="font-mono"
                  >
                    {val}
                    {dataset.isStrengthIndexMode ? '%' : ''}
                  </text>
                </g>
              );
            })}
            {dataset.isStrengthIndexMode &&
              scales.strMin <= 100 &&
              scales.strMax >= 100 && (
                <g>
                  <line
                    x1={padL}
                    x2={padL + plotW}
                    y1={yStrength(100)}
                    y2={yStrength(100)}
                    stroke="rgba(52, 211, 153, 0.45)"
                    strokeDasharray="3 4"
                    strokeWidth={1.2}
                  />
                  <text
                    x={padL + plotW - 6}
                    y={yStrength(100) - 4}
                    textAnchor="end"
                    fill="#6ee7b7"
                    fontSize={10}
                    className="font-mono"
                  >
                    База 100%
                  </text>
                </g>
              )}
            {/* Пунктирана зелена линия, свързваща тренировъчните дни през почивните дни */}
            {strengthPath && (
              <path
                d={strengthPath}
                fill="none"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="4 4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {dataset.days.map((day, idx) => {
              if (day.strengthTrackValue === null) return null;
              const cx = xCenter(idx);
              const cy = yStrength(day.strengthTrackValue);
              const isSelected = activeIdx === idx;
              return (
                <circle
                  key={`str-pt-${day.date}`}
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 5.6 : 4}
                  fill="#34d399"
                  stroke={isSelected ? '#ffffff' : '#0F141F'}
                  strokeWidth={isSelected ? 2 : 1.5}
                />
              );
            })}

            {/* ОБЩ ВЕРТИКАЛЕН КУРСОР (CROSSHAIR) ПРЕЗ И ТРИТЕ ПИСТИ */}
            {activeDay && (
              <line
                data-testid="habit-impact-crosshair"
                x1={xCenter(activeIdx)}
                x2={xCenter(activeIdx)}
                y1={habitTopY}
                y2={bgBot}
                stroke="rgba(226, 232, 240, 0.65)"
                strokeWidth={1.3}
                strokeDasharray="3 3"
                pointerEvents="none"
              />
            )}

            {/* ОБЩА ОС X (30 дни) + Интерактивни колони за посочване / докосване */}
            {dataset.days.map((day, idx) => {
              const cx = xCenter(idx);
              const showLabel =
                idx === 0 || idx === dataset.days.length - 1 || idx % 3 === 0;
              return (
                <g key={`hit-${day.date}`}>
                  {showLabel && (
                    <text
                      x={cx}
                      y={svgH - 12}
                      textAnchor="middle"
                      fill={activeIdx === idx ? '#ffffff' : '#94a3b8'}
                      fontSize={10}
                      fontWeight={activeIdx === idx ? 700 : 400}
                      className="font-mono"
                    >
                      {day.shortLabel}
                    </text>
                  )}
                  <rect
                    data-testid={`habit-impact-day-col-${day.date}`}
                    x={padL + idx * slotW}
                    y={habitTopY}
                    width={slotW}
                    height={bgBot - habitTopY}
                    fill="transparent"
                    className="cursor-crosshair"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onClick={() => setPinnedIdx(idx)}
                    onTouchStart={() => setPinnedIdx(idx)}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Компактна легенда */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/8 pt-3 text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          <span>Полезни навици</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500/70" />
          <span>Ден с вреден навик</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm border border-dashed border-rose-400 bg-rose-500/10" />
          <span>Следващ ден (утринен ефект)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-orange-400" />
          <span>Пулс в покой</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-indigo-400" />
          <span>Сън (ч.)</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 border-t-2 border-dashed border-emerald-400" />
          <span>1RM / Силов индекс</span>
        </span>
      </div>

      {/* Обобщаващи карти под графиката (A/B сравнение) */}
      <div
        data-testid="habit-impact-ab-summary"
        className="mt-5 border-t border-white/10 pt-5"
      >
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="font-display text-sm font-bold text-white">
            A/B сравнение: Чист режим (0 вредни, 4+ полезни) vs След вреден навик
          </h3>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            Извадка (30 д.): {ab.cleanSampleDays} чисти · {ab.harmfulSampleDays}{' '}
            след вреден навик
          </span>
        </div>

        {ab.summaryHeadline ? (
          <p
            data-testid="habit-impact-ab-headline"
            className="mt-2 font-mono text-sm font-bold tabular-nums text-amber-200"
          >
            {ab.summaryHeadline}
          </p>
        ) : (
          <p
            data-testid="habit-impact-ab-empty"
            className="mt-2 text-xs text-slate-400"
          >
            За автоматично A/B сравнение са нужни поне по 1 ден след чист режим (0 вредни и 4+ полезни навика) и 1 ден след отбелязан вреден навик (напр. „Алкохол“, „Никотин“, „Късно лягане“, „Джънк“, „Висок стрес“) в „Дневен чек-ин“.
          </p>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          {/* Карта A/B: Пулс в покой */}
          <div className="rounded-xl border border-white/10 bg-[#141B27] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <HeartPulse className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
                <span>Пулс в покой</span>
              </span>
              <span
                className={`font-mono text-xs font-bold tabular-nums ${
                  ab.restingHr.diffBpm === null
                    ? 'text-slate-500'
                    : ab.restingHr.diffBpm > 0
                      ? 'text-rose-300'
                      : 'text-emerald-400'
                }`}
              >
                {ab.restingHr.diffBpm !== null
                  ? formatSigned(ab.restingHr.diffBpm, ' bpm')
                  : '—'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">Чист режим:</span>
              <span className="font-semibold text-emerald-300">
                {ab.restingHr.cleanAvg !== null
                  ? `${formatNumberBg(ab.restingHr.cleanAvg)} bpm`
                  : '—'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">След вреден навик:</span>
              <span className="font-semibold text-rose-300">
                {ab.restingHr.harmfulAvg !== null
                  ? `${formatNumberBg(ab.restingHr.harmfulAvg)} bpm`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Карта A/B: Сън */}
          <div className="rounded-xl border border-white/10 bg-[#141B27] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Moon className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
                <span>Продължителност на съня</span>
              </span>
              <span
                className={`font-mono text-xs font-bold tabular-nums ${
                  ab.sleepHours.diffHours === null
                    ? 'text-slate-500'
                    : ab.sleepHours.diffHours < 0
                      ? 'text-rose-300'
                      : 'text-emerald-400'
                }`}
              >
                {ab.sleepHours.diffHours !== null
                  ? formatSigned(ab.sleepHours.diffHours, ' ч.')
                  : '—'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">Чист режим:</span>
              <span className="font-semibold text-emerald-300">
                {ab.sleepHours.cleanAvg !== null
                  ? `${formatNumberBg(ab.sleepHours.cleanAvg)} ч.`
                  : '—'}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">След вреден навик:</span>
              <span className="font-semibold text-rose-300">
                {ab.sleepHours.harmfulAvg !== null
                  ? `${formatNumberBg(ab.sleepHours.harmfulAvg)} ч.`
                  : '—'}
              </span>
            </div>
          </div>

          {/* Карта A/B: Сила (1RM индекс & RPE) */}
          <div className="rounded-xl border border-white/10 bg-[#141B27] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
                <Dumbbell className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>Сила (1RM индекс / RPE)</span>
              </span>
              <span
                className={`font-mono text-xs font-bold tabular-nums ${
                  ab.strength.diffPct === null
                    ? 'text-slate-500'
                    : ab.strength.diffPct < 0
                      ? 'text-rose-300'
                      : 'text-emerald-400'
                }`}
              >
                {ab.strength.diffPct !== null
                  ? formatSigned(ab.strength.diffPct, '%')
                  : '—'}
              </span>
            </div>
            <div className="mt-2.5 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">Чист режим:</span>
              <span className="font-semibold text-emerald-300">
                {ab.strength.cleanAvgIndexPct !== null
                  ? `${formatNumberBg(ab.strength.cleanAvgIndexPct)}%`
                  : '—'}
                {ab.strength.cleanAvgRpe !== null
                  ? ` · RPE ${formatNumberBg(ab.strength.cleanAvgRpe)}`
                  : ''}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between font-mono text-xs tabular-nums">
              <span className="text-slate-400">След вреден навик:</span>
              <span className="font-semibold text-rose-300">
                {ab.strength.harmfulAvgIndexPct !== null
                  ? `${formatNumberBg(ab.strength.harmfulAvgIndexPct)}%`
                  : '—'}
                {ab.strength.harmfulAvgRpe !== null
                  ? ` · RPE ${formatNumberBg(ab.strength.harmfulAvgRpe)}`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
