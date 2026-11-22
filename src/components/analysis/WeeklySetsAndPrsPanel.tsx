import { useMemo } from 'react';
import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../../types/fitness';
import { computeDetailedWeeklyEffectiveVolume } from '../../utils/exerciseMuscleEngine';
import {
  diffCalendarDays,
  formatBgDate,
  isValidDateKey,
  shiftDateKey,
} from '../../utils/fitnessMath';
import { buildAllWorkoutsHiddenPrIndex } from '../../utils/hiddenProgressAndEnvironment';

interface WeeklySetsAndPrsPanelProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
}

export function WeeklySetsAndPrsPanel({
  hevyWorkouts,
  dailyLogs,
  profile,
  todayKey,
  customExerciseMappings,
}: WeeklySetsAndPrsPanelProps) {
  const { startDate, endDate } = useMemo(() => {
    const yesterday = shiftDateKey(todayKey, -1);
    const validDates = hevyWorkouts
      .map((w) => w.date)
      .filter((d) => isValidDateKey(d))
      .sort();
    let end = yesterday;
    if (validDates.length > 0) {
      const latest = validDates[validDates.length - 1];
      if (Math.abs(diffCalendarDays(latest, todayKey)) > 14) {
        end = latest;
      }
    }
    return { startDate: shiftDateKey(end, -6), endDate: end };
  }, [hevyWorkouts, todayKey]);

  const weeklyMuscleVolume = useMemo(
    () =>
      computeDetailedWeeklyEffectiveVolume({
        hevyWorkouts,
        startDate,
        endDate,
        customExerciseMappings,
      }),
    [hevyWorkouts, startDate, endDate, customExerciseMappings],
  );

  const bodyWeightKg = useMemo(() => {
    const sorted = [...dailyLogs]
      .filter((d) => typeof d.weightKg === 'number' && d.weightKg >= 30)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (sorted.length > 0) return sorted[0].weightKg as number;
    return typeof profile.weightKg === 'number' ? profile.weightKg : null;
  }, [dailyLogs, profile.weightKg]);

  const weeklyPrEvents = useMemo(() => {
    const index = buildAllWorkoutsHiddenPrIndex(hevyWorkouts, bodyWeightKg);
    return index.recentEvents.filter(
      (ev) => ev.date >= startDate && ev.date <= endDate,
    );
  }, [hevyWorkouts, bodyWeightKg, startDate, endDate]);

  const maxSets = useMemo(
    () => Math.max(16, ...weeklyMuscleVolume.map((m) => m.effectiveSets)),
    [weeklyMuscleVolume],
  );

  return (
    <div
      data-testid="weekly-sets-and-prs-panel"
      className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      {/* Седмични ефективни серии по мускулни групи */}
      <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-white">
              Седмични серии по мускулни групи
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Ефективни серии (1.0 основни + 0.5 вторични) за {formatBgDate(startDate)} – {formatBgDate(endDate)}
            </p>
          </div>
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            Оптимум: 10–18 сер.
          </span>
        </div>

        <div className="mt-4 space-y-2.5">
          {weeklyMuscleVolume.map((item) => {
            const pct = Math.min(100, Math.round((item.effectiveSets / maxSets) * 100));
            const barColor =
              item.effectiveSets >= 18
                ? 'bg-amber-400'
                : item.effectiveSets >= 8
                  ? 'bg-emerald-400'
                  : item.effectiveSets > 0
                    ? 'bg-sky-400'
                    : 'bg-white/15';

            return (
              <div key={item.id} className="flex items-center gap-3 text-xs">
                <span className="w-36 shrink-0 truncate text-slate-300">
                  {item.label}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-20 shrink-0 text-right font-mono font-semibold tabular-nums text-white">
                  {item.effectiveSets.toFixed(1)} сер.
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Постигнати лични рекорди (PR) за седмицата */}
      <div className="rounded-xl border border-white/10 bg-[#0F141F] p-5 lg:col-span-5">
        <div className="flex items-baseline justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-white">
              🏆 Постигнати лични рекорди (PR)
            </h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Rep PRs и Volume PRs през седмицата
            </p>
          </div>
          <span className="font-mono text-sm font-bold tabular-nums text-emerald-400">
            {weeklyPrEvents.length}
          </span>
        </div>

        {weeklyPrEvents.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-slate-400">
            Няма записани нови Rep или Volume PR-и за тази седмица. Провери „⚡ Днешна готовност“ за следващата най-близка PR мишена.
          </p>
        ) : (
          <div className="mt-3 divide-y divide-white/[0.06]">
            {weeklyPrEvents.slice(0, 10).map((ev, idx) => (
              <div
                key={`${ev.workoutId}-${ev.exerciseTitle}-${idx}`}
                className="py-2.5 first:pt-1 last:pb-0"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-white">
                    {ev.exerciseTitle}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-slate-400 shrink-0">
                    {formatBgDate(ev.date)}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-emerald-400">
                  {ev.summaryText}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
