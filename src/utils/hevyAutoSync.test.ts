import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidHevyDownloadFilename,
  processHevyAutoSync,
} from '../services/hevyAutoSync';
import type { HevyWorkout } from '../types/fitness';

const SAMPLE_HEVY_CSV = [
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
  '"Upper A","10 May 2026, 09:00","10 May 2026, 10:00","","Bench Press (Barbell)","","",0,normal,90,8,,,8',
  '"Upper A","10 May 2026, 09:00","10 May 2026, 10:00","","Bench Press (Barbell)","","",1,normal,90,8,,,8.5',
].join('\n');

test('isValidHevyDownloadFilename accepts workouts*.csv and rejects traversal or unrelated files', () => {
  assert.equal(isValidHevyDownloadFilename('workouts.csv'), true);
  assert.equal(isValidHevyDownloadFilename('workouts (1).csv'), true);
  assert.equal(isValidHevyDownloadFilename('Workouts_2026.CSV'), true);

  assert.equal(isValidHevyDownloadFilename('../workouts.csv'), false);
  assert.equal(isValidHevyDownloadFilename('sub/workouts.csv'), false);
  assert.equal(isValidHevyDownloadFilename('sub\\workouts.csv'), false);
  assert.equal(isValidHevyDownloadFilename('workouts.csv.crdownload'), false);
  assert.equal(isValidHevyDownloadFilename('other.csv'), false);
  assert.equal(isValidHevyDownloadFilename(''), false);
});

test('processHevyAutoSync imports new workouts, saves to DB, and cleans up Downloads file afterwards', async () => {
  const callOrder: string[] = [];
  let savedWorkouts: HevyWorkout[] = [];

  const mockFetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/hevy-downloads-check') {
      callOrder.push('check');
      return new Response(
        JSON.stringify({
          found: true,
          filename: 'workouts (1).csv',
          filenames: ['workouts (1).csv', 'workouts.csv'],
          content: SAMPLE_HEVY_CSV,
        }),
        { status: 200 },
      );
    }
    if (url === '/api/hevy-downloads-cleanup') {
      callOrder.push('cleanup');
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        filename?: string;
        filenames?: string[];
      };
      assert.equal(body.filename, 'workouts (1).csv');
      assert.deepEqual(body.filenames, ['workouts (1).csv', 'workouts.csv']);
      return new Response(
        JSON.stringify({
          ok: true,
          deleted: true,
          filenames: ['workouts (1).csv', 'workouts.csv'],
        }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  const result = await processHevyAutoSync({
    existingWorkouts: [],
    onSaveWorkouts: async (next) => {
      callOrder.push('save');
      savedWorkouts = next;
    },
    fetchImpl: mockFetch,
  });

  assert.equal(result.synced, true);
  assert.equal(result.addedCount, 1);
  assert.equal(result.filename, 'workouts (1).csv');
  assert.deepEqual(result.filenames, ['workouts (1).csv', 'workouts.csv']);
  assert.equal(savedWorkouts.length, 1);
  assert.equal(savedWorkouts[0].title, 'Upper A');
  assert.deepEqual(callOrder, ['check', 'save', 'cleanup']);
});

test('processHevyAutoSync does NOT delete Downloads file if saving workouts fails', async () => {
  let cleanupCalled = false;

  const mockFetch = (async (input: string | URL) => {
    const url = String(input);
    if (url === '/api/hevy-downloads-check') {
      return new Response(
        JSON.stringify({
          found: true,
          filename: 'workouts.csv',
          content: SAMPLE_HEVY_CSV,
        }),
        { status: 200 },
      );
    }
    if (url === '/api/hevy-downloads-cleanup') {
      cleanupCalled = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    () =>
      processHevyAutoSync({
        existingWorkouts: [],
        onSaveWorkouts: async () => {
          throw new Error('Disk write error');
        },
        fetchImpl: mockFetch,
      }),
    /Disk write error/,
  );

  assert.equal(cleanupCalled, false);
});
