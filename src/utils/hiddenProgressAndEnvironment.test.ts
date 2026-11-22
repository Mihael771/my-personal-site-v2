import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DailyBiometricLog,
  HevySet,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import {
  COACH_QUICK_QUESTIONS,
  answerCoachQuestion,
  computeAiReadinessScore,
} from './coachMiniAi';
import { buildExerciseRecommendations } from './exerciseRecommender';
import { parseDiaryPayload } from './fitnessMath';
import { sanitizeHevyWorkoutsArray } from './hevyParser';
import {
  analyzeExerciseHiddenProgress,
  buildAllWorkoutsHiddenPrIndex,
  classifyWorkoutEnvironment,
  evaluateExercisePlateauInEnvironment,
  getEnvironmentProgressionAdvice,
  getNextWorkoutEnvironment,
} from './hiddenProgressAndEnvironment';
import { generateIntelligentCoachReport } from './intelligentCoach';

function makeWorkout(params: {
  id: string;
  date: string;
  title: string;
  environment?: 'gym' | 'street' | 'home';
  exercises: Array<{ title: string; sets: HevySet[] }>;
}): HevyWorkout {
  let totalSets = 0;
  let totalVolumeKg = 0;
  const builtExercises = params.exercises.map((ex) => {
    let exVol = 0;
    let exMaxW = 0;
    for (const s of ex.sets) {
      const w = s.weightKg ?? 0;
      const r = s.reps ?? 0;
      exVol += w * r;
      if (w > exMaxW) exMaxW = w;
    }
    totalSets += ex.sets.length;
    totalVolumeKg += exVol;
    return {
      title: ex.title,
      sets: ex.sets,
      totalVolumeKg: exVol,
      maxWeightKg: exMaxW,
    };
  });
  return {
    id: params.id,
    title: params.title,
    startTime: `${params.date}T10:00:00Z`,
    endTime: `${params.date}T11:00:00Z`,
    date: params.date,
    totalSets,
    totalVolumeKg,
    maxWeightKg: Math.max(0, ...builtExercises.map((e) => e.maxWeightKg)),
    importedAt: `${params.date}T12:00:00Z`,
    ...(params.environment ? { environment: params.environment } : {}),
    exercises: builtExercises,
  };
}

const DEFAULT_PROFILE: UserProfile = {
  name: 'Тест',
  heightCm: 180,
  weightKg: 80,
};

test('analyzeExerciseHiddenProgress tracks Rep PRs per exact weight (including 0 kg bodyweight) and Session Volume PRs', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w1',
      date: '2026-05-01',
      title: 'Лостове Ден 1',
      exercises: [
        {
          title: 'Pull Up',
          sets: [
            { setIndex: 0, weightKg: 0, reps: 10 },
            { setIndex: 1, weightKg: 10, reps: 6 },
            { setIndex: 2, weightKg: 10, reps: 6 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'w2',
      date: '2026-05-04',
      title: 'Лостове Ден 2',
      exercises: [
        {
          title: 'Pull Up',
          sets: [
            { setIndex: 0, weightKg: 0, reps: 13 }, // Rep PR at 0 kg (10 -> 13)
            { setIndex: 1, weightKg: 10, reps: 7 }, // Rep PR at 10 kg (6 -> 7)
            { setIndex: 2, weightKg: 10, reps: 7 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'w3',
      date: '2026-05-08',
      title: 'Лостове Ден 3',
      exercises: [
        {
          title: 'Pull Up',
          sets: [
            { setIndex: 0, weightKg: 0, reps: 12 },
            { setIndex: 1, weightKg: 10, reps: 7 },
            { setIndex: 2, weightKg: 10, reps: 7 },
            { setIndex: 3, weightKg: 10, reps: 7 }, // Volume PR (140 -> 210 kg added)
          ],
        },
      ],
    }),
  ];

  const report = analyzeExerciseHiddenProgress({
    workouts,
    exerciseTitle: 'Pull Up',
    bodyWeightKg: 80,
  });

  assert.equal(report.sessions.length, 3);
  assert.equal(report.sessions[0].isRepPR, false);
  assert.equal(report.sessions[0].isVolumePR, false);

  assert.equal(report.sessions[1].isRepPR, true);
  assert.equal(report.sessions[1].repPrHits.length, 2);
  assert.equal(report.sessions[1].isVolumePR, true);

  assert.equal(report.sessions[2].isRepPR, false);
  assert.equal(report.sessions[2].isVolumePR, true);

  // Rep PR table rows include 0 kg (Собствено тегло) and 10 kg
  const bwRow = report.repPrRows.find((r) => r.weightKg === 0);
  const tenKgRow = report.repPrRows.find((r) => r.weightKg === 10);
  assert.ok(bwRow);
  assert.equal(bwRow.weightLabel, '0 kg (Собствено тегло)');
  assert.equal(bwRow.maxReps, 13);
  assert.ok(tenKgRow);
  assert.equal(tenKgRow.maxReps, 7);
  assert.equal(report.volumePr.bestVolumeKg, 210);
});

test('False plateau elimination: Volume PR on session 3 prevents false plateau signal in evaluator, coach report, and recommender', () => {
  // Same top set (80 kg x 8 = identical 1RM across all 3 sessions),
  // but session 3 adds a 4th set -> Session Volume PR -> NOT a plateau!
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'g1',
      date: '2026-05-01',
      title: 'Push Gym',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8 },
            { setIndex: 1, weightKg: 80, reps: 7 },
            { setIndex: 2, weightKg: 80, reps: 6 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'g2',
      date: '2026-05-05',
      title: 'Push Gym',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8 },
            { setIndex: 1, weightKg: 80, reps: 7 },
            { setIndex: 2, weightKg: 80, reps: 6 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'g3',
      date: '2026-05-09',
      title: 'Push Gym',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8 },
            { setIndex: 1, weightKg: 80, reps: 7 },
            { setIndex: 2, weightKg: 80, reps: 7 },
            { setIndex: 3, weightKg: 80, reps: 6 },
          ],
        },
      ],
    }),
  ];

  const plateauEval = evaluateExercisePlateauInEnvironment({
    workouts,
    exerciseTitle: 'Bench Press (Barbell)',
    environment: 'gym',
    bodyWeightKg: 80,
  });
  assert.equal(plateauEval.hasEnoughSessions, true);
  assert.equal(plateauEval.hasHiddenProgressInLast3, true);
  assert.equal(plateauEval.isTruePlateau, false);

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs: [],
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-10',
    trainingGoal: 'hypertrophy',
  });
  assert.equal(
    coachReport.cards.some((c) => c.id.startsWith('plateau-')),
    false,
  );
  assert.equal(
    coachReport.cards.some((c) => c.id === 'hidden-progress-prs'),
    true,
  );

  const recReport = buildExerciseRecommendations({
    hevyWorkouts: workouts,
    dailyLogs: [],
    profileWeightKg: 80,
    todayKey: '2026-05-10',
    trainingGoal: 'hypertrophy',
  });
  assert.equal(recReport.swapRecommendations.length, 0);
});

test('True plateau in same environment (no 1RM PR, no Rep PR, no Volume PR across 3 sessions) IS detected', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'p1',
      date: '2026-05-01',
      title: 'Gym Push',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8, rpe: 9 },
            { setIndex: 1, weightKg: 80, reps: 7, rpe: 9 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'p2',
      date: '2026-05-04',
      title: 'Gym Push',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8, rpe: 9 },
            { setIndex: 1, weightKg: 80, reps: 7, rpe: 9 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'p3',
      date: '2026-05-08',
      title: 'Gym Push',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { setIndex: 0, weightKg: 80, reps: 8, rpe: 9.5 },
            { setIndex: 1, weightKg: 80, reps: 7, rpe: 9.5 },
          ],
        },
      ],
    }),
  ];

  const plateauEval = evaluateExercisePlateauInEnvironment({
    workouts,
    exerciseTitle: 'Bench Press (Barbell)',
    environment: 'gym',
  });
  assert.equal(plateauEval.isTruePlateau, true);

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs: [],
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-10',
    trainingGoal: 'hypertrophy',
  });
  assert.equal(
    coachReport.cards.some((c) => c.id.startsWith('plateau-')),
    true,
  );
});

test('Environment classification, manual override persistence, and separation across gym/street/home', () => {
  const gymWorkout = makeWorkout({
    id: 'env-g1',
    date: '2026-05-01',
    title: 'Upper Day',
    exercises: [
      { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 8 }] },
      { title: 'Lat Pulldown (Cable)', sets: [{ setIndex: 0, weightKg: 60, reps: 10 }] },
    ],
  });
  const streetWorkout = makeWorkout({
    id: 'env-s1',
    date: '2026-05-03',
    title: 'Парк тренировка',
    exercises: [
      { title: 'Pull Up', sets: [{ setIndex: 0, weightKg: 0, reps: 12 }] },
      { title: 'Dips', sets: [{ setIndex: 0, weightKg: 0, reps: 15 }] },
    ],
  });
  const homeWorkout = makeWorkout({
    id: 'env-h1',
    date: '2026-05-05',
    title: 'Тренировка вкъщи',
    exercises: [
      { title: 'Push Up', sets: [{ setIndex: 0, weightKg: 0, reps: 25 }] },
      { title: 'Plank', sets: [{ setIndex: 0, weightKg: 0, reps: 60 }] },
    ],
  });

  assert.equal(classifyWorkoutEnvironment(gymWorkout), 'gym');
  assert.equal(classifyWorkoutEnvironment(streetWorkout), 'street');
  assert.equal(classifyWorkoutEnvironment(homeWorkout), 'home');

  // Manual override takes precedence & survives sanitizeHevyWorkoutsArray
  const overridden = { ...gymWorkout, environment: 'home' as const };
  assert.equal(classifyWorkoutEnvironment(overridden), 'home');
  const sanitized = sanitizeHevyWorkoutsArray([overridden]);
  assert.equal(sanitized?.[0]?.environment, 'home');
  assert.equal(getNextWorkoutEnvironment('gym'), 'street');
  assert.equal(getNextWorkoutEnvironment('street'), 'home');
  assert.equal(getNextWorkoutEnvironment('home'), 'gym');

  // Mixing 2 gym sessions + 2 home sessions for the same exercise does NOT produce a false 3-session plateau
  const mixedWorkouts: HevyWorkout[] = [
    makeWorkout({
      id: 'm1',
      date: '2026-05-01',
      title: 'Gym',
      environment: 'gym',
      exercises: [{ title: 'Dips', sets: [{ setIndex: 0, weightKg: 15, reps: 8 }] }],
    }),
    makeWorkout({
      id: 'm2',
      date: '2026-05-03',
      title: 'Вкъщи',
      environment: 'home',
      exercises: [{ title: 'Dips', sets: [{ setIndex: 0, weightKg: 0, reps: 14 }] }],
    }),
    makeWorkout({
      id: 'm3',
      date: '2026-05-05',
      title: 'Gym',
      environment: 'gym',
      exercises: [{ title: 'Dips', sets: [{ setIndex: 0, weightKg: 15, reps: 8 }] }],
    }),
    makeWorkout({
      id: 'm4',
      date: '2026-05-07',
      title: 'Вкъщи',
      environment: 'home',
      exercises: [{ title: 'Dips', sets: [{ setIndex: 0, weightKg: 0, reps: 14 }] }],
    }),
  ];
  assert.equal(
    evaluateExercisePlateauInEnvironment({
      workouts: mixedWorkouts,
      exerciseTitle: 'Dips',
      environment: 'gym',
    }).hasEnoughSessions,
    false,
  );
  assert.equal(
    evaluateExercisePlateauInEnvironment({
      workouts: mixedWorkouts,
      exerciseTitle: 'Dips',
      environment: 'home',
    }).hasEnoughSessions,
    false,
  );
});

test('Environment-specific progression advice never suggests +2.5 kg for home workouts', () => {
  const homeAdvice = getEnvironmentProgressionAdvice({
    exerciseTitle: 'Push Up',
    environment: 'home',
    currentWeightKg: 0,
  });
  assert.equal(homeAdvice.message.includes('+2.5 kg'), false);
  assert.equal(homeAdvice.title.includes('Вкъщи'), true);
  assert.equal(
    homeAdvice.message.includes('+1–2 повторения') &&
      homeAdvice.message.includes('3 сек.'),
    true,
  );

  const streetAdvice = getEnvironmentProgressionAdvice({
    exerciseTitle: 'Pull Up',
    environment: 'street',
    currentWeightKg: 0,
  });
  assert.equal(streetAdvice.title.includes('Лостове'), true);

  const gymAdvice = getEnvironmentProgressionAdvice({
    exerciseTitle: 'Bench Press (Barbell)',
    environment: 'gym',
    currentWeightKg: 80,
  });
  assert.equal(gymAdvice.message.includes('+2.5 kg'), true);
});

test('Goal Phase Mode: userSettings.goal persistence and coach rules for hypertrophy, maintenance, and fat_loss', () => {
  // 1) Persistence via parseDiaryPayload
  const parsed = parseDiaryPayload(
    JSON.stringify({
      version: 3,
      profile: DEFAULT_PROFILE,
      logs: {},
      goals: [],
      userSettings: { goal: 'fat_loss' },
    }),
  );
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.userSettings?.goal, 'fat_loss');
  }

  // 2) Hypertrophy: flat weight over 2 weeks -> suggests +200 kcal
  const flatLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', weightKg: 80.0, proteinGrams: 135, completedHabits: [] },
    { date: '2026-05-03', weightKg: 80.0, proteinGrams: 135, completedHabits: [] },
    { date: '2026-05-08', weightKg: 80.0, proteinGrams: 135, completedHabits: [] },
    { date: '2026-05-10', weightKg: 80.0, proteinGrams: 135, completedHabits: [] },
  ];
  const hypReport = generateIntelligentCoachReport({
    hevyWorkouts: [],
    dailyLogs: flatLogs,
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-11',
    trainingGoal: 'hypertrophy',
  });
  const hypCard = hypReport.cards.find((c) => c.id === 'goal-hypertrophy-flat-weight');
  assert.ok(hypCard);
  assert.equal(hypCard.message.includes('+200 kcal'), true);
  // 135g / 80kg = 1.69 g/kg >= 1.6 -> NO protein-deficit warning in hypertrophy
  assert.equal(
    hypReport.cards.some((c) => c.id === 'protein-deficit'),
    false,
  );

  // 3) Maintenance / Recomp: 1.69 g/kg < 1.8 g/kg triggers protein-deficit warning; stable weight + PR triggers recomp celebration
  const prWorkouts: HevyWorkout[] = [
    makeWorkout({
      id: 'rc1',
      date: '2026-05-02',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 8 }] },
      ],
    }),
    makeWorkout({
      id: 'rc2',
      date: '2026-05-09',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 10 }] },
      ],
    }),
  ];
  const maintReport = generateIntelligentCoachReport({
    hevyWorkouts: prWorkouts,
    dailyLogs: flatLogs,
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-11',
    trainingGoal: 'maintenance',
  });
  assert.equal(
    maintReport.cards.some((c) => c.id === 'protein-deficit'),
    true,
  );
  assert.equal(
    maintReport.cards.some((c) => c.id === 'goal-maintenance-recomp'),
    true,
  );

  // 4) Fat Loss: -0.5%/wk weight drop + maintained lifts -> celebrates muscle preservation & suppresses false plateau
  const cuttingLogs: DailyBiometricLog[] = [
    { date: '2026-05-01', weightKg: 80.5, proteinGrams: 160, completedHabits: [] },
    { date: '2026-05-03', weightKg: 80.3, proteinGrams: 160, completedHabits: [] },
    { date: '2026-05-08', weightKg: 80.0, proteinGrams: 160, completedHabits: [] },
    { date: '2026-05-10', weightKg: 79.9, proteinGrams: 160, completedHabits: [] },
  ];
  const steadyLifts: HevyWorkout[] = [
    makeWorkout({
      id: 'fl1',
      date: '2026-05-01',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 8, rpe: 9 }] },
      ],
    }),
    makeWorkout({
      id: 'fl2',
      date: '2026-05-05',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 8, rpe: 9 }] },
      ],
    }),
    makeWorkout({
      id: 'fl3',
      date: '2026-05-09',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 80, reps: 8, rpe: 9 }] },
      ],
    }),
  ];
  const fatLossPreserved = generateIntelligentCoachReport({
    hevyWorkouts: steadyLifts,
    dailyLogs: cuttingLogs,
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-11',
    trainingGoal: 'fat_loss',
  });
  const preservedCard = fatLossPreserved.cards.find(
    (c) => c.id === 'goal-fat-loss-muscle-preserved',
  );
  assert.ok(preservedCard);
  assert.equal(
    preservedCard.title.includes('Успешно запазване на силата и мускулите в дефицит'),
    true,
  );
  assert.equal(
    fatLossPreserved.cards.some((c) => c.id.startsWith('plateau-')),
    false,
  );

  // 5) Fat Loss with >5% strength drop -> critical warning!
  const droppingLifts: HevyWorkout[] = [
    makeWorkout({
      id: 'fd1',
      date: '2026-05-01',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 100, reps: 8 }] },
      ],
    }),
    makeWorkout({
      id: 'fd2',
      date: '2026-05-05',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 95, reps: 7 }] },
      ],
    }),
    makeWorkout({
      id: 'fd3',
      date: '2026-05-09',
      title: 'Gym',
      exercises: [
        { title: 'Bench Press (Barbell)', sets: [{ setIndex: 0, weightKg: 90, reps: 6 }] },
      ],
    }),
  ];
  const fatLossDrop = generateIntelligentCoachReport({
    hevyWorkouts: droppingLifts,
    dailyLogs: cuttingLogs,
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-11',
    trainingGoal: 'fat_loss',
  });
  const dropCard = fatLossDrop.cards.find(
    (c) => c.id === 'goal-fat-loss-strength-drop',
  );
  assert.ok(dropCard);
  assert.equal(dropCard.tier, 'critical');
});

test('Coach quick question "Как върви прогресът ми спрямо целта и средата?" routes to goal_environment_progress with live data', () => {
  const question = 'Как върви прогресът ми спрямо целта и средата?';
  assert.equal(COACH_QUICK_QUESTIONS.includes(question), true);

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'q1',
      date: '2026-05-01',
      title: 'Лостове',
      exercises: [{ title: 'Pull Up', sets: [{ setIndex: 0, weightKg: 0, reps: 10 }] }],
    }),
    makeWorkout({
      id: 'q2',
      date: '2026-05-08',
      title: 'Лостове',
      exercises: [{ title: 'Pull Up', sets: [{ setIndex: 0, weightKg: 0, reps: 12 }] }],
    }),
  ];
  const prIndex = buildAllWorkoutsHiddenPrIndex(workouts, 80);
  assert.equal(prIndex.recentEvents.length >= 1, true);

  const coachReport = generateIntelligentCoachReport({
    hevyWorkouts: workouts,
    dailyLogs: [],
    habitItems: [],
    legacyLogs: {},
    profile: DEFAULT_PROFILE,
    todayKey: '2026-05-10',
    trainingGoal: 'maintenance',
  });
  const readiness = computeAiReadinessScore({
    hevyWorkouts: workouts,
    dailyLogs: [],
    todayKey: '2026-05-10',
  });

  const answer = answerCoachQuestion({
    question,
    hevyWorkouts: workouts,
    dailyLogs: [],
    profile: DEFAULT_PROFILE,
    coachReport,
    readiness,
    todayKey: '2026-05-10',
    trainingGoal: 'maintenance',
  });

  assert.equal(answer.intent, 'goal_environment_progress');
  assert.equal(answer.headline.includes('Поддържане'), true);
  assert.equal(
    answer.actionSteps.some((b) => b.includes('Лостове') || b.includes('Pull Up')) ||
      answer.metrics.some((m) => m.includes('Лостове')),
    true,
  );
});
