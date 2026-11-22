import assert from 'node:assert/strict';
import test from 'node:test';
import type { DailyBiometricLog, HevyWorkout } from '../types/fitness';
import {
  analyzeDeloadCycle,
  formatDeloadPlanClipboard,
  generateDeloadWeekPlan,
  roundToNearest2Point5,
} from './deloadPlanner';
import {
  TRIBULUS_HABIT_NAME,
  analyzeTribulusUsage,
  buildPersonalizedHabitsPlan,
  buildTestosteroneComparisonRows,
  isTribulusHabit,
} from './testosteroneAndHabits';
import {
  OFFLINE_FALLBACK_SCIENCE_DATA,
  fetchTestosteroneScienceData,
  parsePubMedSummaryResponse,
} from './testosteroneScienceApi';

function shiftDate(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  dt.setDate(dt.getDate() + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function makeWorkout(
  id: string,
  date: string,
  title: string,
  rawExercises: Array<{
    title: string;
    sets: HevyWorkout['exercises'][number]['sets'];
  }>,
): HevyWorkout {
  let totalSets = 0;
  let totalVolumeKg = 0;
  const exercises: HevyWorkout['exercises'] = rawExercises.map((ex) => {
    let exVol = 0;
    let maxW = 0;
    for (const s of ex.sets) {
      totalSets += 1;
      const w = s.weightKg ?? 0;
      const r = s.reps ?? 0;
      exVol += w * r;
      if (w > maxW) maxW = w;
    }
    totalVolumeKg += exVol;
    return {
      title: ex.title,
      sets: ex.sets,
      totalVolumeKg: exVol,
      maxWeightKg: maxW,
    };
  });
  const maxWeightKg = exercises.reduce(
    (acc, ex) => Math.max(acc, ex.maxWeightKg),
    0,
  );
  return {
    id,
    title,
    date,
    startTime: `${date}T10:00:00`,
    exercises,
    totalSets,
    totalVolumeKg,
    maxWeightKg,
    importedAt: `${date}T12:00:00Z`,
  };
}

function makeStandardWorkout(id: string, date: string, title = 'Upper Strength'): HevyWorkout {
  return makeWorkout(id, date, title, [
    {
      title: 'Bench Press (Barbell)',
      sets: [
        { setIndex: 0, weightKg: 100, reps: 5, setType: 'normal' },
        { setIndex: 1, weightKg: 100, reps: 5, setType: 'normal' },
        { setIndex: 2, weightKg: 100, reps: 5, setType: 'normal' },
        { setIndex: 3, weightKg: 100, reps: 5, setType: 'normal' },
        { setIndex: 4, weightKg: 100, reps: 5, setType: 'normal' },
      ],
    },
    {
      title: 'Barbell Row',
      sets: [
        { setIndex: 0, weightKg: 85, reps: 8, setType: 'normal' },
        { setIndex: 1, weightKg: 85, reps: 8, setType: 'normal' },
        { setIndex: 2, weightKg: 85, reps: 8, setType: 'normal' },
        { setIndex: 3, weightKg: 85, reps: 8, setType: 'normal' },
      ],
    },
    {
      title: 'Pull Up',
      sets: [
        { setIndex: 0, weightKg: 0, reps: 10, setType: 'normal' },
        { setIndex: 1, weightKg: 0, reps: 10, setType: 'normal' },
        { setIndex: 2, weightKg: 0, reps: 9, setType: 'normal' },
      ],
    },
  ]);
}

test('Auto-Deload Planner: tracks accumulation week 3/5 and triggers deload at 5 high-load weeks', () => {
  const today = '2026-05-10';

  // 3 consecutive high-load weeks (3 workouts/week, 36 sets/week)
  const threeWeeksWorkouts: HevyWorkout[] = [];
  for (let w = 0; w < 3; w++) {
    const weekEnd = shiftDate(today, -w * 7);
    threeWeeksWorkouts.push(
      makeStandardWorkout(`w${w}-1`, shiftDate(weekEnd, -5)),
      makeStandardWorkout(`w${w}-2`, shiftDate(weekEnd, -3)),
      makeStandardWorkout(`w${w}-3`, shiftDate(weekEnd, -1)),
    );
  }

  const healthyLogs: DailyBiometricLog[] = Array.from({ length: 15 }, (_, idx) => ({
    date: shiftDate(today, -(14 - idx)),
    restingHr: 55,
    sleepHours: 8,
    sleepQuality: 4,
    completedHabits: [],
  }));

  const acc = analyzeDeloadCycle({
    hevyWorkouts: threeWeeksWorkouts,
    dailyLogs: healthyLogs,
    todayKey: today,
  });
  assert.equal(acc.currentCycleWeek, 3);
  assert.equal(acc.status, 'accumulation');
  assert.match(acc.headline, /Седмица 3\/5/);
  assert.equal(acc.fatigueSignals.length, 0);

  // 5 consecutive high-load weeks -> deload_now
  const fiveWeeksWorkouts: HevyWorkout[] = [];
  for (let w = 0; w < 5; w++) {
    const weekEnd = shiftDate(today, -w * 7);
    fiveWeeksWorkouts.push(
      makeStandardWorkout(`f${w}-1`, shiftDate(weekEnd, -5)),
      makeStandardWorkout(`f${w}-2`, shiftDate(weekEnd, -3)),
      makeStandardWorkout(`f${w}-3`, shiftDate(weekEnd, -1)),
    );
  }
  const due = analyzeDeloadCycle({
    hevyWorkouts: fiveWeeksWorkouts,
    dailyLogs: healthyLogs,
    todayKey: today,
  });
  assert.equal(due.currentCycleWeek, 5);
  assert.equal(due.status, 'deload_now');
  assert.match(due.headline, /Време е за Deload/);
});

test('Auto-Deload Planner: triggers deload when RHR > +4 bpm and sleepQuality <= 3', () => {
  const today = '2026-05-10';
  const workouts = [
    makeStandardWorkout('u1', shiftDate(today, -5)),
    makeStandardWorkout('u2', shiftDate(today, -3)),
    makeStandardWorkout('u3', shiftDate(today, -1)),
  ];

  const fatiguedLogs: DailyBiometricLog[] = [
    ...Array.from({ length: 12 }, (_, idx) => ({
      date: shiftDate(today, -(15 - idx)),
      restingHr: 54,
      sleepHours: 7.8,
      sleepQuality: 4,
      completedHabits: [],
    })),
    {
      date: shiftDate(today, -2),
      restingHr: 58,
      sleepHours: 6.1,
      sleepQuality: 3,
      completedHabits: [],
    },
    {
      date: shiftDate(today, -1),
      restingHr: 60,
      sleepHours: 5.8,
      sleepQuality: 2,
      completedHabits: [],
    },
    {
      date: today,
      restingHr: 62, // > +4 bpm vs 30d avg (~55)
      sleepHours: 6.0,
      sleepQuality: 2,
      completedHabits: [],
    },
  ];

  const res = analyzeDeloadCycle({
    hevyWorkouts: workouts,
    dailyLogs: fatiguedLogs,
    todayKey: today,
  });
  assert.equal(res.status, 'deload_now');
  assert.ok(res.fatigueSignals.some((s) => s.id === 'rhr'));
  assert.ok(res.fatigueSignals.some((s) => s.id === 'sleep_quality'));
});

test('Deload Generator: reduces sets by 40% (min 2) and weights by 10% rounded to 2.5 kg', () => {
  assert.equal(roundToNearest2Point5(90), 90);
  assert.equal(roundToNearest2Point5(76.5), 77.5);
  assert.equal(roundToNearest2Point5(73.1), 72.5);
  assert.equal(roundToNearest2Point5(0), 0);

  const workouts: HevyWorkout[] = [
    makeStandardWorkout('w1', '2026-05-06', 'Push Day'),
    makeStandardWorkout('w2', '2026-05-08', 'Pull Day'),
    makeStandardWorkout('w3', '2026-05-10', 'Legs Day'),
  ];

  const plan = generateDeloadWeekPlan(workouts);
  assert.equal(plan.days.length, 3);

  const firstDay = plan.days[0];
  const bench = firstDay.exercises.find((e) => e.title === 'Bench Press (Barbell)');
  const row = firstDay.exercises.find((e) => e.title === 'Barbell Row');
  const pullUp = firstDay.exercises.find((e) => e.title === 'Pull Up');

  assert.ok(bench && row && pullUp);
  // 5 sets * 0.6 = 3; 100 kg * 0.9 = 90 kg
  assert.equal(bench.deloadSets, 3);
  assert.equal(bench.deloadWeightKg, 90);
  // 4 sets * 0.6 = 2.4 -> 2; 85 kg * 0.9 = 76.5 -> 77.5 kg
  assert.equal(row.deloadSets, 2);
  assert.equal(row.deloadWeightKg, 77.5);
  // 3 sets * 0.6 = 1.8 -> min 2; bodyweight stays 0
  assert.equal(pullUp.deloadSets, 2);
  assert.equal(pullUp.isBodyweight, true);
  assert.equal(pullUp.deloadWeightKg, 0);

  const text = formatDeloadPlanClipboard(plan);
  assert.match(text, /7-дневен Deload план/);
  assert.match(text, /90 kg/);
});

test('Tribulus tracker: detects 42+ day cycle break alert, computes sleep/PR correlations and objective note', () => {
  const today = '2026-05-10';
  assert.equal(isTribulusHabit(TRIBULUS_HABIT_NAME), true);
  assert.equal(isTribulusHabit('Бабини зъби'), true);
  assert.equal(isTribulusHabit('Креатин'), false);

  const logs: DailyBiometricLog[] = [];
  // 10 older days without Tribulus (sleep quality 3)
  for (let i = 55; i >= 46; i--) {
    logs.push({
      date: shiftDate(today, -i),
      sleepHours: 7.0,
      sleepQuality: 3,
      completedHabits: ['Креатин'],
    });
  }
  // 44 consecutive days with Tribulus ending yesterday (sleep quality 4.5)
  for (let i = 44; i >= 1; i--) {
    logs.push({
      date: shiftDate(today, -i),
      sleepHours: 7.8,
      sleepQuality: i % 2 === 0 ? 5 : 4,
      completedHabits: [TRIBULUS_HABIT_NAME],
    });
  }

  const workouts: HevyWorkout[] = [
    makeWorkout('w-old', shiftDate(today, -50), 'Push', [
      {
        title: 'Bench Press (Barbell)',
        sets: [{ setIndex: 0, weightKg: 80, reps: 8, setType: 'normal' }],
      },
    ]),
    makeWorkout('w-new', shiftDate(today, -5), 'Push', [
      {
        title: 'Bench Press (Barbell)',
        sets: [{ setIndex: 0, weightKg: 80, reps: 10, setType: 'normal' }], // Rep PR!
      },
    ]),
  ];

  const report = analyzeTribulusUsage({
    dailyLogs: logs,
    hevyWorkouts: workouts,
    todayKey: today,
  });

  assert.equal(report.streakDays, 44);
  assert.equal(report.needsCycleBreak, true);
  assert.match(report.cycleAdvice, /2 седмици почивка/);
  assert.equal(report.sleepQualityWith, 4.5);
  assert.equal(report.sleepQualityWithout, 3);
  assert.equal(report.repPrRateWithPct, 100);
  assert.equal(report.repPrRateWithoutPct, 0);
  assert.match(report.objectiveNote, /дълбокия сън/);
});

test('Personalized habits plan & 6-row testosterone comparison table reflect last 7 days accurately', () => {
  const today = '2026-05-10';
  const badLogs: DailyBiometricLog[] = Array.from({ length: 7 }, (_, i) => ({
    date: shiftDate(today, -i),
    sleepHours: 6.0,
    sleepQuality: 2,
    restingHr: 78,
    steps: 4200,
    completedHabits: ['Алкохол', 'Никотин / цигари', 'Късно лягане', 'Висок стрес', 'Джънк / захар'],
  }));

  const plan = buildPersonalizedHabitsPlan({
    dailyLogs: badLogs,
    hevyWorkouts: [],
    todayKey: today,
  });
  assert.equal(plan.length, 3);
  assert.equal(plan[0].category, 'alcohol');
  assert.ok(plan.some((p) => p.category === 'sleep'));

  const rows = buildTestosteroneComparisonRows({
    dailyLogs: badLogs,
    hevyWorkouts: [],
    todayKey: today,
  });
  assert.equal(rows.length, 6);
  assert.equal(rows.find((r) => r.id === 'sleep_freshness')?.status, 'red');
  assert.equal(rows.find((r) => r.id === 'recovery_rhr')?.status, 'red');
  assert.equal(rows.find((r) => r.id === 'libido_hormones')?.status, 'red');
  assert.equal(rows.find((r) => r.id === 'body_composition')?.status, 'red');
});

test('Testosterone Science API: parses PubMed & Wikipedia responses and falls back offline cleanly', async () => {
  const parsedPubMed = parsePubMedSummaryResponse(
    {
      result: {
        '12345': {
          title: 'Resistance training and testosterone adaptation.',
          pubdate: '2024 Mar',
          source: 'J Strength Cond Res',
        },
      },
    },
    ['12345'],
  );
  assert.equal(parsedPubMed.length, 1);
  assert.equal(parsedPubMed[0].year, '2024');
  assert.equal(parsedPubMed[0].url, 'https://pubmed.ncbi.nlm.nih.gov/12345/');

  // Mocked online fetch
  const mockFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url.includes('bg.wikipedia.org') && url.includes('%D0%A2%D0%B5%D1%81')) {
      return new Response(
        JSON.stringify({
          title: 'Тестостерон',
          extract: 'Тестостеронът е основен стероиден андрогенен хормон при хората.',
          content_urls: { desktop: { page: 'https://bg.wikipedia.org/wiki/Тестостерон' } },
        }),
        { status: 200 },
      );
    }
    if (url.includes('bg.wikipedia.org')) {
      return new Response(
        JSON.stringify({
          title: 'Бабини зъби',
          extract: 'Бабини зъби (Tribulus terrestris) е растение от семейство Zygophyllaceae.',
          content_urls: { desktop: { page: 'https://bg.wikipedia.org/wiki/Бабини_зъби' } },
        }),
        { status: 200 },
      );
    }
    if (url.includes('esearch.fcgi')) {
      return new Response(
        JSON.stringify({ esearchresult: { idlist: ['99901'] } }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        result: {
          '99901': {
            title: 'Sleep duration and male endocrine function',
            pubdate: '2023 Jun',
            source: 'Endocrinol Metab',
          },
        },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;

  const online = await fetchTestosteroneScienceData({
    forceRefresh: true,
    fetchImpl: mockFetch,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(online.data.isOfflineFallback, false);
  assert.equal(online.data.wikipedia.length, 2);
  assert.equal(online.data.wikipedia[0].title, 'Тестостерон');
  assert.equal(online.data.pubmedArticles[0].pmid, '99901');

  // Offline failure -> clean fallback without throwing
  const failingFetch = (async () => {
    throw new Error('Network offline');
  }) as unknown as typeof fetch;

  const offline = await fetchTestosteroneScienceData({
    forceRefresh: true,
    fetchImpl: failingFetch,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(offline.data.isOfflineFallback, true);
  assert.equal(
    offline.data.pubmedArticles.length,
    OFFLINE_FALLBACK_SCIENCE_DATA.pubmedArticles.length,
  );
});
