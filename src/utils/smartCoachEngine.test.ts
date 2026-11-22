import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  DailyBiometricLog,
  HevyWorkout,
  UserProfile,
} from '../types/fitness';
import { parseDiaryPayload } from './fitnessMath';
import {
  getBreadcrumbsForLocation,
  getLocationHash,
  getLocationLabel,
  parseLocationFromHash,
} from './navigation';
import {
  analyzeBoxingStrengthBalance,
  computeBoxingEquivalentPushSets,
  computeMultiFactorReadinessAndPlan,
  detectStrengthPlateaus,
  evaluateMultiFactorGoal,
} from './smartCoachEngine';

const PROFILE: UserProfile = {
  name: 'Тест Атлет',
  heightCm: 180,
  weightKg: 78,
};

function makeWorkout(params: {
  id: string;
  date: string;
  title: string;
  startHour?: number;
  durationMinutes?: number;
  exercises: Array<{
    title: string;
    sets: Array<{ weightKg: number; reps: number; rpe?: number }>;
  }>;
}): HevyWorkout {
  const startHour = params.startHour ?? 18;
  const durationMinutes = params.durationMinutes ?? 60;
  const startMs = Date.parse(
    `${params.date}T${String(startHour).padStart(2, '0')}:00:00Z`,
  );
  const endMs = startMs + durationMinutes * 60_000;
  const exercises = params.exercises.map((ex) => {
    const sets = ex.sets.map((s, idx) => ({
      setIndex: idx + 1,
      weightKg: s.weightKg,
      reps: s.reps,
      rpe: s.rpe,
      setType: 'normal',
    }));
    const totalVolumeKg = sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0);
    const maxWeightKg = sets.reduce((max, s) => Math.max(max, s.weightKg), 0);
    return {
      title: ex.title,
      sets,
      totalVolumeKg,
      maxWeightKg,
    };
  });
  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const totalVolumeKg = exercises.reduce(
    (acc, e) => acc + e.totalVolumeKg,
    0,
  );
  const maxWeightKg = exercises.reduce(
    (max, e) => Math.max(max, e.maxWeightKg),
    0,
  );
  return {
    id: params.id,
    title: params.title,
    date: params.date,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    exercises,
    totalSets,
    totalVolumeKg,
    maxWeightKg,
    importedAt: new Date(endMs).toISOString(),
  };
}

test('userSettings.subPriorities persists cleanly via parseDiaryPayload without breaking legacy payloads', () => {
  const parsed = parseDiaryPayload(
    JSON.stringify({
      profile: PROFILE,
      logs: {},
      goals: [],
      userSettings: {
        goal: 'maintenance',
        targetWeight: 75,
        subPriorities: [
          'boxing_explosiveness',
          'calisthenics_relative',
          'invalid_entry',
          'boxing_explosiveness',
        ],
      },
    }),
  );

  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.state.userSettings?.goal, 'maintenance');
    assert.equal(parsed.state.userSettings?.targetWeight, 75);
    assert.deepEqual(parsed.state.userSettings?.subPriorities, [
      'boxing_explosiveness',
      'calisthenics_relative',
    ]);
  }
});

test('navigation helpers resolve 3 main menus, breadcrumbs, and backwards-compatible hashes', () => {
  assert.deepEqual(parseLocationFromHash('#/coach/weekly-plan'), {
    page: 'coach',
    coachSubTab: 'weekly-plan',
  });
  assert.deepEqual(parseLocationFromHash('#/analysis/relative-strength'), {
    page: 'analysis',
    analysisSubTab: 'strength-boxing',
  });
  assert.deepEqual(parseLocationFromHash('#/analysis/biorhythm'), {
    page: 'analysis',
    analysisSubTab: 'biorhythm-body',
  });
  assert.deepEqual(parseLocationFromHash('#/weekly'), {
    page: 'analysis',
    analysisSubTab: 'weekly-review',
  });

  assert.equal(
    getLocationHash({ page: 'coach', coachSubTab: 'habit-detective' }),
    '#/coach/habit-detective',
  );
  assert.equal(
    getLocationLabel({ page: 'analysis', analysisSubTab: 'weekly-review' }),
    'Анализи > Неделен обзор',
  );

  const crumbs = getBreadcrumbsForLocation({
    page: 'coach',
    coachSubTab: 'readiness',
  });
  assert.equal(crumbs.length, 3);
  assert.equal(crumbs[0].label, '🏠 Начало');
  assert.equal(crumbs[1].label, '🧠 Интелигентен треньор');
  assert.equal(crumbs[2].isCurrent, true);
});

test('computeBoxingEquivalentPushSets maps duration smoothly between 4 and 8 sets', () => {
  assert.equal(computeBoxingEquivalentPushSets(30), 4);
  assert.equal(computeBoxingEquivalentPushSets(45), 5);
  assert.equal(computeBoxingEquivalentPushSets(60), 6);
  assert.equal(computeBoxingEquivalentPushSets(75), 7);
  assert.equal(computeBoxingEquivalentPushSets(95), 8);
});

test('analyzeBoxingStrengthBalance flags shoulder imbalance when push + boxing sets exceed pull by >30%', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'w-push',
      date: '2026-05-10',
      title: 'Push Day',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 90, reps: 8 },
            { weightKg: 90, reps: 8 },
            { weightKg: 90, reps: 8 },
            { weightKg: 90, reps: 8 },
          ],
        },
        {
          title: 'Overhead Press (Barbell)',
          sets: [
            { weightKg: 55, reps: 8 },
            { weightKg: 55, reps: 8 },
            { weightKg: 55, reps: 8 },
            { weightKg: 55, reps: 8 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'w-box-1',
      date: '2026-05-11',
      title: 'Бокс тренировка',
      durationMinutes: 60,
      exercises: [{ title: 'Boxing Bag Work', sets: [{ weightKg: 0, reps: 10 }] }],
    }),
    makeWorkout({
      id: 'w-box-2',
      date: '2026-05-12',
      title: 'Boxing Sparring',
      durationMinutes: 75,
      exercises: [{ title: 'Boxing Sparring', sets: [{ weightKg: 0, reps: 8 }] }],
    }),
    makeWorkout({
      id: 'w-pull',
      date: '2026-05-13',
      title: 'Pull Light',
      exercises: [
        {
          title: 'Pull Up',
          sets: [
            { weightKg: 0, reps: 10 },
            { weightKg: 0, reps: 10 },
            { weightKg: 0, reps: 10 },
            { weightKg: 0, reps: 10 },
          ],
        },
      ],
    }),
  ];

  const report = analyzeBoxingStrengthBalance({
    hevyWorkouts: workouts,
    dailyLogs: [],
    todayKey: '2026-05-14',
  });

  assert.equal(report.boxingSessionsCount, 2);
  assert.equal(report.boxingPushEquivalentSets, 6 + 7);
  assert.equal(report.isImbalanced, true);
  assert.ok((report.pushOverPullPct ?? 0) > 30);
  assert.ok(report.priorityPullExercises.length >= 2);
});

test('detectStrengthPlateaus flags lift stalled over last 3 of 5 sessions and ignores boxing', () => {
  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'p1',
      date: '2026-04-01',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [{ weightKg: 85, reps: 8 }],
        },
      ],
    }),
    makeWorkout({
      id: 'p2',
      date: '2026-04-08',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [{ weightKg: 90, reps: 8 }],
        },
      ],
    }),
    makeWorkout({
      id: 'p3',
      date: '2026-04-15',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [{ weightKg: 90, reps: 8 }],
        },
      ],
    }),
    makeWorkout({
      id: 'p4',
      date: '2026-04-22',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [{ weightKg: 90, reps: 8 }],
        },
      ],
    }),
    makeWorkout({
      id: 'p5',
      date: '2026-04-29',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [{ weightKg: 90, reps: 7 }],
        },
      ],
    }),
  ];

  const logs: DailyBiometricLog[] = [
    { date: '2026-04-22', sleepHours: 5.8, proteinGrams: 110, completedHabits: [] },
    { date: '2026-04-29', sleepHours: 5.5, proteinGrams: 115, completedHabits: [] },
  ];

  const plateaus = detectStrengthPlateaus({
    hevyWorkouts: workouts,
    dailyLogs: logs,
    profile: PROFILE,
    todayKey: '2026-05-01',
  });

  assert.equal(plateaus.length, 1);
  assert.equal(plateaus[0].exerciseTitle, 'Bench Press (Barbell)');
  assert.ok(plateaus[0].probableCauseLabel.length > 5);
  assert.ok(plateaus[0].probableCauseDetail.length > 10);
  assert.ok(plateaus[0].breakthroughAction.length > 10);
});

test('evaluateMultiFactorGoal detects Hypertrophy Recomposition when weight is stable and strength rises', () => {
  const dailyLogs: DailyBiometricLog[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const day = 14 - i;
    dailyLogs.push({
      date: `2026-05-${String(day).padStart(2, '0')}`,
      weightKg: 78.0 + (i % 2 === 0 ? 0.1 : -0.1),
      sleepHours: 7.8,
      proteinGrams: 165,
      restingHr: 54,
      hrv: 74,
      completedHabits: [],
    });
  }

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'h1',
      date: '2026-05-02',
      title: 'Strength',
      exercises: [
        {
          title: 'Squat (Barbell)',
          sets: [
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'h2',
      date: '2026-05-05',
      title: 'Strength',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 80, reps: 6 },
            { weightKg: 80, reps: 6 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'h3',
      date: '2026-05-10',
      title: 'Strength',
      exercises: [
        {
          title: 'Squat (Barbell)',
          sets: [
            { weightKg: 112.5, reps: 5 },
            { weightKg: 112.5, reps: 5 },
            { weightKg: 112.5, reps: 5 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'h4',
      date: '2026-05-13',
      title: 'Strength',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 90, reps: 6 },
            { weightKg: 90, reps: 6 },
            { weightKg: 90, reps: 6 },
          ],
        },
      ],
    }),
  ];

  const evalResult = evaluateMultiFactorGoal({
    goal: 'hypertrophy',
    subPriorities: ['max_strength_1rm'],
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    todayKey: '2026-05-14',
  });

  assert.match(evalResult.statusLabel, /рекомпозиция/i);
  assert.equal(evalResult.statusTone, 'positive');
});

test('evaluateMultiFactorGoal recommends Smart Refeed on fat loss when HRV and strength drop sharply', () => {
  const dailyLogs: DailyBiometricLog[] = [];
  for (let d = 1; d <= 20; d += 1) {
    dailyLogs.push({
      date: `2026-04-${String(d).padStart(2, '0')}`,
      weightKg: 81 - d * 0.05,
      sleepHours: 7.5,
      restingHr: 54,
      hrv: 80,
      proteinGrams: 165,
      completedHabits: [],
    });
  }
  for (let d = 21; d <= 24; d += 1) {
    dailyLogs.push({
      date: `2026-04-${String(d).padStart(2, '0')}`,
      weightKg: 79.4,
      sleepHours: 6.5,
      restingHr: 63,
      hrv: 56,
      proteinGrams: 160,
      completedHabits: [],
    });
  }

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'fl1',
      date: '2026-04-12',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 100, reps: 5 },
            { weightKg: 100, reps: 5 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'fl2',
      date: '2026-04-22',
      title: 'Upper',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 85, reps: 5 },
            { weightKg: 85, reps: 5 },
          ],
        },
      ],
    }),
  ];

  const evalResult = evaluateMultiFactorGoal({
    goal: 'fat_loss',
    subPriorities: [],
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    todayKey: '2026-04-24',
  });

  assert.equal(evalResult.recommendSmartRefeed, true);
  assert.match(evalResult.statusLabel, /Refeed/i);
});

test('computeMultiFactorReadinessAndPlan auto-activates PR attack at high readiness + >=3 clean days and adapts for scenarios', () => {
  const dailyLogs: DailyBiometricLog[] = [];
  for (let d = 1; d <= 14; d += 1) {
    dailyLogs.push({
      date: `2026-05-${String(d).padStart(2, '0')}`,
      weightKg: 78,
      sleepHours: 8.3,
      restingHr: 52,
      hrv: 82,
      proteinGrams: 170,
      caloriesKcal: 2700,
      completedHabits: ['Без алкохол'],
    });
  }

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'r1',
      date: '2026-05-09',
      title: 'Strength',
      exercises: [
        {
          title: 'Bench Press (Barbell)',
          sets: [
            { weightKg: 90, reps: 5 },
            { weightKg: 90, reps: 5 },
          ],
        },
      ],
    }),
    makeWorkout({
      id: 'r2',
      date: '2026-05-12',
      title: 'Back',
      exercises: [
        {
          title: 'Pull Up',
          sets: [
            { weightKg: 10, reps: 8 },
            { weightKg: 10, reps: 8 },
          ],
        },
      ],
    }),
  ];

  const boxingBalance = analyzeBoxingStrengthBalance({
    hevyWorkouts: workouts,
    dailyLogs,
    todayKey: '2026-05-14',
  });
  const goalEvaluation = evaluateMultiFactorGoal({
    goal: 'hypertrophy',
    subPriorities: ['max_strength_1rm'],
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    todayKey: '2026-05-14',
  });

  const autoPlan = computeMultiFactorReadinessAndPlan({
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    goal: 'hypertrophy',
    subPriorities: ['max_strength_1rm'],
    todayKey: '2026-05-14',
    scenarioOverride: null,
    goalEvaluation,
    boxingBalance,
  });

  assert.ok(autoPlan.readinessScore >= 82);
  assert.equal(autoPlan.autoPrAttackEligible, true);
  assert.equal(autoPlan.activeScenario, 'pr_attack');
  assert.equal(autoPlan.top3Guidance.length, 3);

  const expressPlan = computeMultiFactorReadinessAndPlan({
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    goal: 'hypertrophy',
    subPriorities: ['max_strength_1rm'],
    todayKey: '2026-05-14',
    scenarioOverride: 'express_35',
    goalEvaluation,
    boxingBalance,
  });
  assert.equal(expressPlan.activeScenario, 'express_35');
  assert.ok(expressPlan.recommendedExercises.length <= 4);

  const eveningBoxingPlan = computeMultiFactorReadinessAndPlan({
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    goal: 'hypertrophy',
    subPriorities: ['boxing_explosiveness'],
    todayKey: '2026-05-14',
    scenarioOverride: 'evening_boxing',
    goalEvaluation,
    boxingBalance,
  });
  assert.equal(eveningBoxingPlan.activeScenario, 'evening_boxing');
  assert.match(eveningBoxingPlan.scenarioHeadline, /бокс|отказ|експлозив|рамен/i);
});

test('computeMultiFactorReadinessAndPlan enforces Minimum Effective Dose on 3 consecutive heavy days', () => {
  const dailyLogs: DailyBiometricLog[] = [
    { date: '2026-05-11', sleepHours: 5.8, restingHr: 63, hrv: 52, proteinGrams: 130, completedHabits: [] },
    { date: '2026-05-12', sleepHours: 5.9, restingHr: 64, hrv: 50, proteinGrams: 120, completedHabits: [] },
    { date: '2026-05-13', sleepHours: 5.7, restingHr: 65, hrv: 48, proteinGrams: 115, completedHabits: [] },
  ];

  const heavySets = Array.from({ length: 14 }, () => ({
    weightKg: 95,
    reps: 8,
    rpe: 9,
  }));

  const workouts: HevyWorkout[] = [
    makeWorkout({
      id: 'd1',
      date: '2026-05-11',
      title: 'Heavy 1',
      exercises: [{ title: 'Squat (Barbell)', sets: heavySets }],
    }),
    makeWorkout({
      id: 'd2',
      date: '2026-05-12',
      title: 'Heavy 2',
      exercises: [{ title: 'Bench Press (Barbell)', sets: heavySets }],
    }),
    makeWorkout({
      id: 'd3',
      date: '2026-05-13',
      title: 'Heavy 3',
      exercises: [{ title: 'Deadlift (Barbell)', sets: heavySets }],
    }),
  ];

  const boxingBalance = analyzeBoxingStrengthBalance({
    hevyWorkouts: workouts,
    dailyLogs,
    todayKey: '2026-05-14',
  });
  const goalEvaluation = evaluateMultiFactorGoal({
    goal: 'hypertrophy',
    subPriorities: [],
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    todayKey: '2026-05-14',
  });

  const plan = computeMultiFactorReadinessAndPlan({
    hevyWorkouts: workouts,
    dailyLogs,
    profile: PROFILE,
    goal: 'hypertrophy',
    subPriorities: [],
    todayKey: '2026-05-14',
    scenarioOverride: null,
    goalEvaluation,
    boxingBalance,
  });

  assert.equal(plan.consecutiveHeavyDays, 3);
  assert.equal(plan.readinessTier, 'med');
  assert.match(plan.readinessTierLabel, /Минимална ефективна доза/i);
});
