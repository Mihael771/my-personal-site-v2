import { useMemo } from 'react';
import type { DailyBiometricLog, HevyWorkout } from '../../types/fitness';
import { formatBgDate, getLocalDateKey } from '../../utils/fitnessMath';
import { analyzeBoxingSessionsSummary } from '../../utils/smartCoachEngine';

interface BoxingSessionsSummaryCardProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
}

export function BoxingSessionsSummaryCard({
  hevyWorkouts,
  dailyLogs,
}: BoxingSessionsSummaryCardProps) {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const summary = useMemo(
    () =>
      analyzeBoxingSessionsSummary({
        hevyWorkouts,
        dailyLogs,
        todayKey,
      }),
    [hevyWorkouts, dailyLogs, todayKey],
  );

  return (
    <div
      data-testid="boxing-sessions-summary-card"
      className="rounded-xl border border-white/10 bg-[#0F141F] p-5"
    >
      <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-display text-base font-bold text-white">
            🥊 Обобщение на боксовите тренировки (Hevy + Часовник)
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">
            Автоматично засича боксовите сесии от Hevy (времетраене и еквивалентен раменен товар) и ги свързва с активните калории и пулса от часовника.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono text-xs tabular-nums shrink-0">
          <div>
            <span className="text-slate-400">Последни 30 д.: </span>
            <strong className="text-white">{summary.sessionsCount30d} сесии</strong>
            <span className="text-slate-500"> ({summary.totalMinutes30d} мин.)</span>
          </div>
        </div>
      </div>

      {/* Ключови средни стойности */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
          <div className="text-[11px] text-slate-400">Средно времетраене</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-white">
            {summary.avgDurationMinutes !== null
              ? `${summary.avgDurationMinutes} мин.`
              : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
          <div className="text-[11px] text-slate-400">Активни kcal (дни с бокс)</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-amber-300">
            {summary.avgActiveCaloriesOnBoxingDays !== null
              ? `${summary.avgActiveCaloriesOnBoxingDays} kcal`
              : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
          <div className="text-[11px] text-slate-400">Среден сутрешен пулс</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-sky-300">
            {summary.avgRestingHrOnBoxingDays !== null
              ? `${summary.avgRestingHrOnBoxingDays.toFixed(1)} bpm`
              : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-[#141B27] p-3">
          <div className="text-[11px] text-slate-400">Общо време (30 дни)</div>
          <div className="mt-1 font-mono text-base font-bold tabular-nums text-emerald-400">
            {summary.totalMinutes30d > 0
              ? `${(summary.totalMinutes30d / 60).toFixed(1)} ч.`
              : '—'}
          </div>
        </div>
      </div>

      {/* Списък на последните боксови сесии */}
      {summary.recentSessions.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[540px] text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-[11px] font-medium text-slate-400">
                <th className="py-2 pr-3">Дата</th>
                <th className="py-2 px-3">Сесия (Hevy)</th>
                <th className="py-2 px-3 text-right">Време</th>
                <th className="py-2 px-3 text-right">Екв. бутащи</th>
                <th className="py-2 px-3 text-right">Активни kcal</th>
                <th className="py-2 pl-3 text-right">Δ Пулс (D+1)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {summary.recentSessions.map((session) => (
                <tr key={session.id} className="hover:bg-white/[0.02]">
                  <td className="py-2.5 pr-3 font-mono tabular-nums text-slate-300">
                    {formatBgDate(session.date)}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-white">
                    {session.title}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                    {session.durationMinutes} мин.
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                    +{session.equivalentPushSets} сер.
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-amber-300">
                    {session.watchActiveCalories !== null
                      ? `${session.watchActiveCalories} kcal`
                      : '—'}
                  </td>
                  <td
                    className={`py-2.5 pl-3 text-right font-mono font-semibold tabular-nums ${
                      session.nextMorningRhrDelta === null
                        ? 'text-slate-500'
                        : session.nextMorningRhrDelta >= 2
                          ? 'text-rose-400'
                          : 'text-emerald-400'
                    }`}
                  >
                    {session.nextMorningRhrDelta !== null
                      ? `${session.nextMorningRhrDelta >= 0 ? '+' : ''}${session.nextMorningRhrDelta.toFixed(1)} bpm`
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">
          Все още няма разпознати боксови тренировки в Hevy (заглавие или упражнение с „Бокс“, „Boxing“, „Спаринг“, „Чувал“).
        </p>
      )}
    </div>
  );
}
