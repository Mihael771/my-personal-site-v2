import { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronDown, ChevronUp, PlusCircle } from 'lucide-react';
import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
  TrainingGoalPhase,
} from '../../types/fitness';
import {
  EXERCISE_CATALOG,
  RECOMMENDER_SUBGROUPS,
  buildExerciseRecommendations,
} from '../../utils/exerciseRecommender';
import { formatBgNumericDate } from '../../utils/fitnessMath';

interface ExerciseRecommenderPanelProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profileWeightKg?: number | '';
  todayKey: string;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal?: TrainingGoalPhase;
  onOpenTechnique?: (exerciseName: string) => void;
}

export function ExerciseRecommenderPanel({
  hevyWorkouts,
  dailyLogs,
  profileWeightKg,
  todayKey,
  customExerciseMappings,
  trainingGoal,
  onOpenTechnique,
}: ExerciseRecommenderPanelProps) {
  const [showCatalog, setShowCatalog] = useState(false);

  const report = useMemo(
    () =>
      buildExerciseRecommendations({
        hevyWorkouts,
        dailyLogs,
        profileWeightKg,
        todayKey,
        customExerciseMappings,
        trainingGoal,
      }),
    [
      hevyWorkouts,
      dailyLogs,
      profileWeightKg,
      todayKey,
      customExerciseMappings,
      trainingGoal,
    ],
  );

  const maxSubgroupSets = useMemo(() => {
    const peak = Math.max(12, ...report.subgroupVolumes.map((s) => s.sets7d));
    return Math.ceil(peak / 2) * 2;
  }, [report.subgroupVolumes]);

  return (
    <section
      data-testid="exercise-recommender-panel"
      aria-label="Препоръки за конкретни упражнения"
      className="mt-8 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      {/* Заглавие */}
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Двигател за упражнения (Hevy каталог · {EXERCISE_CATALOG.length} движения)</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Записи: {formatBgNumericDate(report.windowStartDate)} –{' '}
              {formatBgNumericDate(report.anchorDate)} → препоръки за ДНЕС ({formatBgNumericDate(todayKey)})
            </span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            Препоръки за упражнения за ДНЕС: Добавяне и Смяна при застой
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Открива детайлни зони под 6 серии седмично, дисбаланс Бутане/Дърпане (&gt;30%) и упражнения без ръст в 1RM през 3 поредни сесии.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowCatalog((v) => !v)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs font-medium text-slate-200 transition-colors hover:border-white/30 hover:text-white whitespace-nowrap shrink-0"
        >
          <span>Каталог упражнения ({EXERCISE_CATALOG.length})</span>
          {showCatalog ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      {hevyWorkouts.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-400">
          Импортирай поне 1–3 тренировки от Hevy CSV, за да получиш конкретни предложения за добавяне при дефицит и 4-седмични смени при застой в 1RM.
        </div>
      ) : (
        <>
          {/* Компактна SVG карта на 8-те детайлни мускулни подгрупи */}
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>7-дневен обем по детайлни зони</span>
                <span className="font-mono tabular-nums">
                  Push {report.pushSets7d} / Pull {report.pullSets7d} сер.
                </span>
              </div>
              <svg
                viewBox="0 0 420 230"
                role="img"
                aria-label="Седмични работни серии по 8 детайлни мускулни подгрупи"
                className="mt-2 w-full"
              >
                {(() => {
                  const leftPad = 178;
                  const chartW = 205;
                  const x6 = leftPad + (6 / maxSubgroupSets) * chartW;
                  return (
                    <>
                      <line
                        x1={x6}
                        x2={x6}
                        y1={6}
                        y2={208}
                        stroke="rgba(245, 158, 11, 0.55)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={x6}
                        y={222}
                        textAnchor="middle"
                        fill="#fbbf24"
                        fontSize={10}
                        className="font-mono"
                      >
                        мин. 6 сер.
                      </text>
                      {report.subgroupVolumes.map((sv, idx) => {
                        const y = 10 + idx * 25;
                        const w = Math.min(
                          chartW,
                          (sv.sets7d / maxSubgroupSets) * chartW,
                        );
                        const fill = sv.isLagging ? '#f59e0b' : '#10b981';
                        const shortLabel = sv.label
                          .replace(' (бутане под наклон)', '')
                          .replace(' (вертикално дърпане)', '')
                          .replace(' (хоризонтално дърпане)', '');

                        return (
                          <g key={sv.subgroup}>
                            <text
                              x={0}
                              y={y + 12}
                              fill={sv.isLagging ? '#fde68a' : '#cbd5e1'}
                              fontSize={11}
                            >
                              {shortLabel}
                            </text>
                            <rect
                              x={leftPad}
                              y={y + 2}
                              width={chartW}
                              height={12}
                              rx={3}
                              fill="rgba(255,255,255,0.05)"
                            />
                            {w > 0 && (
                              <rect
                                x={leftPad}
                                y={y + 2}
                                width={w}
                                height={12}
                                rx={3}
                                fill={fill}
                              />
                            )}
                            <text
                              x={leftPad + chartW + 8}
                              y={y + 12}
                              fill="#f8fafc"
                              fontSize={11}
                              className="font-mono tabular-nums"
                            >
                              {sv.sets7d}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* Дясна колона: A) Добавяне + B) Смяна при застой */}
            <div className="space-y-6 lg:col-span-7">
              {/* А) Кое упражнение да ДОБАВИШ */}
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <PlusCircle
                    className="h-4 w-4 text-emerald-400"
                    aria-hidden="true"
                  />
                  <h3>
                    Кое упражнение да ДОБАВИШ ({report.addRecommendations.length})
                  </h3>
                </div>

                {report.addRecommendations.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Всички основни мускулни подгрупи имат поне 6 работни серии за последните 7 дни и балансът Push/Pull е стабилен.
                  </p>
                ) : (
                  <div
                    data-testid="exercise-add-list"
                    className="mt-3 space-y-3"
                  >
                    {report.addRecommendations.map((card) => (
                      <article
                        key={card.id}
                        data-testid={`add-rec-${card.subgroup}`}
                        className="rounded-xl border border-emerald-500/25 bg-[#121927] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="font-medium text-emerald-400">
                            {card.reasonType === 'push_pull_imbalance'
                              ? 'Дисбаланс Бутане / Дърпане (>30%)'
                              : 'Дефицит на седмичен обем (<6 серии)'}
                          </span>
                          <span className="font-mono tabular-nums">
                            Текущо: {card.sets7d} сер. / 7 д.
                          </span>
                        </div>

                        <h4 className="mt-1.5 text-sm font-bold text-white">
                          {card.headline}
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">
                          {card.message}
                        </p>

                        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-white/8 pt-3 sm:grid-cols-2">
                          {card.exercises.map((ex) => (
                            <div
                              key={ex.catalogId}
                              className="flex flex-col gap-1 text-xs"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-semibold text-white">
                                      {ex.hevyName}
                                    </span>
                                    {onOpenTechnique && (
                                      <button
                                        type="button"
                                        onClick={() => onOpenTechnique(ex.hevyName)}
                                        className="inline-flex h-5 items-center rounded border border-white/12 bg-[#141B27] px-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                                      >
                                        👁️ Техника и снимки
                                      </button>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    {ex.bgName}
                                  </div>
                                </div>
                                <span className="font-mono font-semibold tabular-nums text-emerald-400 whitespace-nowrap shrink-0">
                                  {ex.sets}×{ex.reps}
                                </span>
                              </div>
                              {ex.primaryMuscles.length > 0 && (
                                <div className="text-[11px] leading-snug text-slate-400">
                                  <span className="text-emerald-300 font-medium">
                                    Основна:
                                  </span>{' '}
                                  <span className="text-slate-200">
                                    {ex.primaryMuscles.join(', ')}
                                  </span>
                                  {ex.secondaryMuscles.length > 0 && (
                                    <>
                                      {' · '}
                                      <span className="text-amber-300 font-medium">
                                        Втор.:
                                      </span>{' '}
                                      <span>{ex.secondaryMuscles.join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              {/* Б) С кое упражнение да СМЕНИШ при застой */}
              <div className="border-t border-white/10 pt-5">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <ArrowRightLeft
                    className="h-4 w-4 text-amber-300"
                    aria-hidden="true"
                  />
                  <h3>
                    Смяна при застой в 1RM — 4-седмичен блок (
                    {report.swapRecommendations.length})
                  </h3>
                </div>

                {report.swapRecommendations.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-400">
                    Няма упражнение с 3 поредни сесии без ръст в изчисления 1RM. Продължи текущата си прогресия.
                  </p>
                ) : (
                  <div
                    data-testid="exercise-swap-list"
                    className="mt-3 space-y-3"
                  >
                    {report.swapRecommendations.map((swap) => (
                      <article
                        key={swap.id}
                        data-testid={`swap-rec-${swap.id}`}
                        className="rounded-xl border border-amber-500/30 bg-[#141A26] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <span className="font-medium text-amber-300">
                            Плато · {swap.subgroupLabel}
                          </span>
                          <span className="font-mono tabular-nums text-slate-300">
                            1RM: {swap.lastThreeE1RMs.join(' → ')} kg
                          </span>
                        </div>

                        <h4 className="mt-1.5 text-sm font-bold text-white">
                          {swap.headline}
                        </h4>
                        <p className="mt-1 text-xs leading-relaxed text-slate-300">
                          {swap.rationale}
                        </p>

                        <div className="mt-3 space-y-2.5 border-t border-white/8 pt-3">
                          {swap.alternatives.map((alt) => (
                            <div
                              key={alt.catalogId}
                              className="space-y-0.5 text-xs"
                            >
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-white">
                                    → {alt.hevyName}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    ({alt.bgName})
                                  </span>
                                  {onOpenTechnique && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenTechnique(alt.hevyName)}
                                      className="inline-flex h-5 items-center rounded border border-white/12 bg-[#141B27] px-1.5 text-[10px] font-medium text-slate-300 transition-colors hover:border-[var(--accent)] hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      👁️ Техника и снимки
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 font-mono tabular-nums whitespace-nowrap shrink-0">
                                  <span className="text-slate-200">
                                    {alt.sets}×{alt.reps}
                                  </span>
                                  <span className="font-semibold text-amber-300">
                                    Старт: {alt.weightLabel}
                                  </span>
                                </div>
                              </div>
                              {alt.primaryMuscles.length > 0 && (
                                <div className="text-[11px] leading-snug text-slate-400">
                                  <span className="text-emerald-300 font-medium">
                                    Основна:
                                  </span>{' '}
                                  <span className="text-slate-200">
                                    {alt.primaryMuscles.join(', ')}
                                  </span>
                                  {alt.secondaryMuscles.length > 0 && (
                                    <>
                                      {' · '}
                                      <span className="text-amber-300 font-medium">
                                        Второстепенни:
                                      </span>{' '}
                                      <span>{alt.secondaryMuscles.join(', ')}</span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Разгъваем референтен каталог (29 упражнения) */}
      {showCatalog && (
        <div
          data-testid="exercise-catalog-reference"
          className="mt-6 border-t border-white/10 pt-5"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {RECOMMENDER_SUBGROUPS.map((sg) => {
              const items = EXERCISE_CATALOG.filter(
                (ex) => ex.subgroup === sg.id,
              );
              return (
                <div key={sg.id} className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-200">
                    {sg.label}
                  </div>
                  <ul className="space-y-1 text-xs text-slate-400">
                    {items.map((ex) => (
                      <li key={ex.id} className="leading-snug flex flex-wrap items-center gap-1">
                        {onOpenTechnique ? (
                          <button
                            type="button"
                            onClick={() => onOpenTechnique(ex.hevyName)}
                            className="text-left text-slate-200 hover:text-[var(--accent-text)] hover:underline cursor-pointer"
                          >
                            {ex.hevyName}
                          </button>
                        ) : (
                          <span className="text-slate-200">{ex.hevyName}</span>
                        )}{' '}
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                          ({ex.defaultSets}×{ex.defaultReps})
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
