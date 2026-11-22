import { Database, Edit3, FastForward, Trash2 } from 'lucide-react';
import type { DayLog, MuscleAllocationConfig } from '../types/fitness';
import {
  MUSCLE_MAP,
  buildChronologicalHistoryRows,
  formatBgDate,
  formatGrams,
} from '../utils/fitnessMath';

interface DatabaseHistoryTableProps {
  logs: Record<string, DayLog>;
  dailyBaseGainGrams?: number;
  accrueOnRestDays?: boolean;
  allocationConfig?: MuscleAllocationConfig;
  onToggleTrained: (dateKey: string) => void;
  onSelectDateForEdit: (dateKey: string) => void;
  onDeleteDayLog: (dateKey: string) => void;
  onSimulateNextDay: () => void;
}

export function DatabaseHistoryTable({
  logs,
  dailyBaseGainGrams,
  accrueOnRestDays,
  allocationConfig,
  onToggleTrained,
  onSelectDateForEdit,
  onDeleteDayLog,
  onSimulateNextDay,
}: DatabaseHistoryTableProps) {
  const rows = buildChronologicalHistoryRows(
    logs,
    dailyBaseGainGrams,
    accrueOnRestDays,
    allocationConfig,
  ).reverse();

  return (
    <section
      id="history"
      aria-label="История на записите в базата данни"
      className="mx-auto max-w-[1280px] border-t border-white/10 px-4 py-10 sm:px-6"
    >
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-[var(--accent-text)]" aria-hidden="true" />
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              История по дни (база данни)
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Пълен регистър на дните в <span className="font-mono text-slate-300">database.json</span> — с дневния прираст, общото натрупване и бързо превключване на тренировка.
          </p>
        </div>

        <button
          type="button"
          data-testid="simulate-next-day-btn"
          onClick={onSimulateNextDay}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3.5 text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent-border)] hover:text-white whitespace-nowrap shrink-0"
        >
          <FastForward className="h-3.5 w-3.5 text-[var(--accent-text)]" aria-hidden="true" />
          <span>+1 Ден (тест)</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0F141F]">
        {rows.length === 0 ? (
          <div
            data-testid="history-empty-state"
            className="px-6 py-10 text-center text-sm text-slate-400"
          >
            Все още няма записани дни в базата данни. Отбележи тренировка днес, добави дата в календара или импортирай архив.
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[740px] border-collapse text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-white/10 bg-[#131926] text-xs font-semibold uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-4 py-3">Ден #</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Тренирал</th>
                  <th className="px-4 py-3">Мускулни групи</th>
                  <th className="px-4 py-3 text-right">За деня</th>
                  <th className="px-4 py-3 text-right">Общо</th>
                  <th className="px-4 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {rows.map((row) => (
                  <tr
                    key={row.date}
                    data-testid={`history-row-${row.date}`}
                    className="transition-colors hover:bg-white/[0.025]"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold tabular-nums text-slate-400">
                      #{row.dayNumber}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectDateForEdit(row.date)}
                        className="font-mono text-xs font-medium text-slate-200 hover:text-[var(--accent-text)] hover:underline"
                      >
                        {formatBgDate(row.date)}
                      </button>
                      <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-500">
                        {row.date} · {row.recoveryPercentage}% възст.
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        data-testid={`history-toggle-trained-${row.date}`}
                        onClick={() => onToggleTrained(row.date)}
                        aria-pressed={row.trained}
                        className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                          row.trained
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                            : 'border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                        }`}
                      >
                        {row.trained ? 'Да' : 'Не'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      {row.muscles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {row.muscles.map((mId) => (
                            <span
                              key={mId}
                              className="inline-flex items-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-text)]"
                            >
                              {MUSCLE_MAP[mId]?.label ?? mId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {row.dailyGainGrams > 0 ? 'Почивка / Базово' : 'Почивка'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums whitespace-nowrap">
                      <span
                        className={
                          row.dailyGainGrams > 0
                            ? 'text-[var(--accent-text)]'
                            : 'text-slate-500'
                        }
                      >
                        +{formatGrams(row.dailyGainGrams)} г
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold tabular-nums text-white whitespace-nowrap">
                      {formatGrams(row.cumulativeGrams)} г
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`history-edit-${row.date}`}
                          onClick={() => onSelectDateForEdit(row.date)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/12 bg-[#151C29] px-2 text-xs text-slate-300 hover:border-[var(--accent-border)] hover:text-white"
                        >
                          <Edit3 className="h-3 w-3" aria-hidden="true" />
                          <span>Редактирай</span>
                        </button>
                        <button
                          type="button"
                          data-testid={`history-delete-${row.date}`}
                          onClick={() => onDeleteDayLog(row.date)}
                          aria-label={`Изтрий записа за ${formatBgDate(row.date)}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/12 bg-[#151C29] text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
