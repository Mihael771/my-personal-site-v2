import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHevyCsv } from './hevyParser';
import {
  buildExerciseProgressDataset,
  calculateEpley1RM,
  computeNiceAxisTicks,
  getExercisesSortedByFrequency,
} from './hevyProgress';

const PROGRESS_SAMPLE_CSV = `title,start_time,end_time,exercise_title,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe
"Upper A","10 Sep 2026, 18:00","10 Sep 2026, 19:00","Bench Press (Barbell)",0,normal,70,8,,,8
"Upper A","10 Sep 2026, 18:00","10 Sep 2026, 19:00","Pull Up",0,normal,0,8,,,
"Upper A","10 Sep 2026, 18:00","10 Sep 2026, 19:00","Pull Up",1,normal,0,6,,,
"Upper B","25 Oct 2026, 18:00","25 Oct 2026, 19:00","Bench Press (Barbell)",0,normal,80,8,,,8.5
"Upper B","25 Oct 2026, 18:00","25 Oct 2026, 19:00","Bench Press (Barbell)",1,normal,85,1,,,9.5
"Upper B","25 Oct 2026, 18:00","25 Oct 2026, 19:00","Squat (Barbell)",0,normal,100,5,,,8
"Upper C","15 Nov 2026, 18:00","15 Nov 2026, 19:00","Bench Press (Barbell)",0,normal,82.5,8,,,9
"Upper C","15 Nov 2026, 18:00","15 Nov 2026, 19:00","Pull Up",0,normal,0,12,,,
"Upper C","15 Nov 2026, 18:00","15 Nov 2026, 19:00","Pull Up",1,normal,0,10,,,`;

test('calculateEpley1RM computes Epley formula rounded to 1 decimal and returns weight for 1 rep', () => {
  assert.equal(calculateEpley1RM(90, 1), 90);
  assert.equal(calculateEpley1RM(80, 8), 101.3); // 80 * (1 + 8/30) = 101.333...
  assert.equal(calculateEpley1RM(100, 10), 133.3);
  assert.equal(calculateEpley1RM(0, 12), 0);
});

test('getExercisesSortedByFrequency orders most frequently trained exercises first', () => {
  const parsed = parseHevyCsv(PROGRESS_SAMPLE_CSV);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const options = getExercisesSortedByFrequency(parsed.workouts);
  assert.equal(options[0].title, 'Bench Press (Barbell)');
  assert.equal(options[0].workoutCount, 3);
  assert.equal(options[1].title, 'Pull Up');
  assert.equal(options[1].workoutCount, 2);
  assert.equal(options[1].isBodyweightOnly, true);
  assert.equal(options[2].title, 'Squat (Barbell)');
  assert.equal(options[2].workoutCount, 1);
});

test('buildExerciseProgressDataset computes chronological Epley 1RM, PR, period filter, and progress delta', () => {
  const parsed = parseHevyCsv(PROGRESS_SAMPLE_CSV);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const all = buildExerciseProgressDataset(
    parsed.workouts,
    'Bench Press (Barbell)',
    'all',
    'e1rm',
    '2026-11-18',
  );

  assert.equal(all.isBodyweightOnly, false);
  assert.equal(all.filteredSessions.length, 3);
  assert.equal(all.filteredSessions[0].date, '2026-09-10');
  assert.equal(all.filteredSessions[0].estimated1RM, 88.7);
  assert.equal(all.filteredSessions[1].date, '2026-10-25');
  assert.equal(all.filteredSessions[1].maxWeightKg, 85);
  assert.equal(all.filteredSessions[1].estimated1RM, 101.3);
  assert.equal(all.filteredSessions[1].bestSetText, '80 kg × 8 повт.');
  assert.equal(all.filteredSessions[2].date, '2026-11-15');
  assert.equal(all.filteredSessions[2].estimated1RM, 104.5);

  assert.equal(all.personalRecordWeightKg, 85);
  assert.equal(all.personalRecordWeightDate, '2026-10-25');
  assert.equal(all.peakEstimated1RM, 104.5);
  // 104.5 - 88.7 = 15.8; (15.8 / 88.7)*100 = 17.8%
  assert.equal(all.progressDelta, 15.8);
  assert.equal(all.progressPercent, 17.8);

  const oneMonth = buildExerciseProgressDataset(
    parsed.workouts,
    'Bench Press (Barbell)',
    '1m',
    'e1rm',
    '2026-11-18',
  );
  assert.equal(oneMonth.filteredSessions.length, 2); // Oct 25 + Nov 15
  assert.equal(oneMonth.filteredSessions[0].date, '2026-10-25');
});

test('buildExerciseProgressDataset automatically switches to reps metrics for bodyweight-only exercises', () => {
  const parsed = parseHevyCsv(PROGRESS_SAMPLE_CSV);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const pullUps = buildExerciseProgressDataset(
    parsed.workouts,
    'Pull Up',
    'all',
    'both',
    '2026-11-18',
  );

  assert.equal(pullUps.isBodyweightOnly, true);
  assert.equal(pullUps.filteredSessions.length, 2);
  assert.equal(pullUps.filteredSessions[0].maxReps, 8);
  assert.equal(pullUps.filteredSessions[0].totalReps, 14);
  assert.equal(pullUps.filteredSessions[1].maxReps, 12);
  assert.equal(pullUps.filteredSessions[1].totalReps, 22);
  assert.equal(pullUps.personalRecordMaxReps, 12);
  assert.equal(pullUps.personalRecordMaxRepsDate, '2026-11-15');
  assert.equal(pullUps.peakTotalReps, 22);
  assert.equal(pullUps.progressDelta, 4); // 12 - 8 max reps
  assert.equal(pullUps.progressPercent, 50);
});

test('computeNiceAxisTicks generates clean monotonically increasing ticks', () => {
  const axis = computeNiceAxisTicks(65, 108, 5);
  assert.ok(axis.min <= 65);
  assert.ok(axis.max >= 108);
  assert.ok(axis.ticks.length >= 3);
  for (let i = 1; i < axis.ticks.length; i++) {
    assert.ok(axis.ticks[i] > axis.ticks[i - 1]);
  }
});
