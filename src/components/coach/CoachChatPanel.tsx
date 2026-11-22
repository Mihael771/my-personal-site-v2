import { useState, type FormEvent } from 'react';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import type {
  AiReadinessResult,
  CoachAnalysisReport,
  CoachChatResponse,
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
  TrainingGoalPhase,
  UserProfile,
} from '../../types/fitness';
import {
  answerCoachQuestion,
  COACH_QUICK_QUESTIONS,
} from '../../utils/coachMiniAi';

interface CoachChatPanelProps {
  hevyWorkouts: HevyWorkout[];
  dailyLogs: DailyBiometricLog[];
  profile: UserProfile;
  coachReport: CoachAnalysisReport;
  readiness: AiReadinessResult;
  todayKey: string;
  dailyStepsGoal?: number;
  customExerciseMappings?: CustomExerciseMappings;
  trainingGoal?: TrainingGoalPhase;
}

export function CoachChatPanel({
  hevyWorkouts,
  dailyLogs,
  profile,
  coachReport,
  readiness,
  todayKey,
  dailyStepsGoal,
  customExerciseMappings,
  trainingGoal,
}: CoachChatPanelProps) {
  const [inputText, setInputText] = useState('');
  const [responses, setResponses] = useState<CoachChatResponse[]>(() => [
    answerCoachQuestion({
      question: COACH_QUICK_QUESTIONS[0],
      hevyWorkouts,
      dailyLogs,
      profile,
      coachReport,
      readiness,
      todayKey,
      dailyStepsGoal,
      customExerciseMappings,
      trainingGoal,
    }),
  ]);

  function askQuestion(rawQuestion: string) {
    const trimmed = rawQuestion.trim();
    if (!trimmed) return;
    const reply = answerCoachQuestion({
      question: trimmed,
      hevyWorkouts,
      dailyLogs,
      profile,
      coachReport,
      readiness,
      todayKey,
      dailyStepsGoal,
      customExerciseMappings,
      trainingGoal,
    });
    setResponses((prev) => [reply, ...prev].slice(0, 6));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inputText.trim()) return;
    askQuestion(inputText);
    setInputText('');
  }

  return (
    <section
      data-testid="coach-chat-panel"
      aria-label="Попитай треньора"
      className="mt-6 rounded-2xl border border-white/10 bg-[#0F141F] p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <MessageSquare
              className="h-4 w-4 text-[var(--accent-text)]"
              aria-hidden="true"
            />
            <span>Офлайн диагностичен асистент (цитира твоите реални данни)</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold text-white sm:text-xl">
            Попитай треньора
          </h2>
        </div>
        <div className="font-mono text-xs tabular-nums text-slate-400">
          Локален анализ · 0 ms латентност
        </div>
      </div>

      {/* Бързи въпроси */}
      <div className="mt-4 flex flex-wrap gap-2">
        {COACH_QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={q}
            type="button"
            data-testid={`coach-quick-question-${idx}`}
            onClick={() => askQuestion(q)}
            className="rounded-lg border border-white/12 bg-[#141B27] px-3 py-1.5 text-left text-xs font-medium text-slate-200 transition-colors hover:border-[var(--accent)]/60 hover:bg-[#192334] hover:text-white"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Свободен въпрос */}
      <form
        onSubmit={handleSubmit}
        className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center"
      >
        <label htmlFor="coach-chat-input" className="sr-only">
          Напиши въпрос към треньора на български
        </label>
        <input
          id="coach-chat-input"
          data-testid="coach-chat-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Попитай напр.: „Какъв ми е калорийният баланс тази седмица?“, „Достатъчно ли се движа?“, „Къде имам застой?“"
          className="h-10 flex-1 rounded-lg border border-white/15 bg-[#080B11] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          type="submit"
          data-testid="coach-chat-submit"
          disabled={!inputText.trim()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap shrink-0"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Попитай</span>
        </button>
      </form>

      {/* Отговори */}
      <div className="mt-5 space-y-3" data-testid="coach-chat-responses">
        {responses.map((res, index) => (
          <article
            key={`${res.id}-${index}`}
            data-testid={index === 0 ? 'coach-chat-latest-response' : undefined}
            className={`rounded-xl border p-4 sm:p-5 ${
              index === 0
                ? 'border-[var(--accent)]/35 bg-[#131B29]'
                : 'border-white/8 bg-[#0C111A] opacity-90'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">
                Въпрос: <span className="text-white">„{res.question}“</span>
              </span>
              {index === 0 && (
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--accent-text)]">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Актуален отговор
                </span>
              )}
            </div>

            <h3 className="mt-2 font-display text-base font-bold text-white">
              {res.headline}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              {res.analysis}
            </p>

            {res.metrics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-y border-white/8 py-2 font-mono text-xs tabular-nums text-slate-300">
                {res.metrics.map((m) => (
                  <span key={m} className="whitespace-nowrap">
                    {m}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Следващи стъпки
              </div>
              <ol className="mt-1.5 space-y-1 text-xs leading-relaxed text-slate-200">
                {res.actionSteps.map((step, sIdx) => (
                  <li key={step} className="flex items-start gap-2">
                    <span className="font-mono font-bold text-[var(--accent-text)]">
                      {sIdx + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
