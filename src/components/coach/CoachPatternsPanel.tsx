import { TrendingUp } from 'lucide-react';
import type { DiscoveredPattern } from '../../types/fitness';

interface CoachPatternsPanelProps {
  patterns: DiscoveredPattern[];
}

export function CoachPatternsPanel({ patterns }: CoachPatternsPanelProps) {
  return (
    <section
      data-testid="coach-patterns-section"
      aria-label="Открити лични закономерности и корелации"
      className="mt-8"
    >
      <div className="flex flex-col gap-1 border-b border-white/10 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <TrendingUp
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>Статистически анализ на последните 30–90 дни</span>
          </div>
          <h2 className="mt-1 font-display text-xl font-bold text-white">
            Открити лични закономерности
          </h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {patterns.filter((p) => p.hasEnoughData).length}/{patterns.length} активни модела
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {patterns.map((pattern) => {
          const pct = Math.min(
            100,
            Math.round(
              (pattern.collectedSamples / Math.max(1, pattern.requiredSamples)) *
                100,
            ),
          );

          return (
            <article
              key={pattern.id}
              data-testid={`coach-${pattern.id}`}
              className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#0F141F] p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>{pattern.category}</span>
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      pattern.hasEnoughData
                        ? pattern.impactDirection === 'positive'
                          ? 'text-emerald-400'
                          : 'text-sky-400'
                        : 'text-amber-300'
                    }`}
                  >
                    {pattern.hasEnoughData ? 'Открит модел' : 'Обучение на модела'}
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-base font-bold text-white">
                  {pattern.title}
                </h3>

                <p className="mt-2 text-sm leading-relaxed text-slate-200">
                  {pattern.insightText}
                </p>
              </div>

              <div className="mt-4 border-t border-white/8 pt-3">
                {!pattern.hasEnoughData ? (
                  <div>
                    <div className="flex items-center justify-between gap-2 font-mono text-xs tabular-nums text-slate-300">
                      <span>{pattern.progressLabel}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm bg-white/8">
                      <div
                        className="h-full bg-[var(--accent)] transition-all"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="font-mono text-xs tabular-nums text-slate-400">
                    {pattern.evidenceText}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
