import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_PAGES, getPageHash, parsePageFromHash } from './navigation';

test('parsePageFromHash maps all page hashes and legacy section anchors cleanly', () => {
  assert.equal(parsePageFromHash(''), 'checkin');
  assert.equal(parsePageFromHash('#/'), 'checkin');
  assert.equal(parsePageFromHash('#/overview'), 'overview');
  assert.equal(parsePageFromHash('#comparison'), 'overview');

  assert.equal(parsePageFromHash('#/muscles'), 'muscles');
  assert.equal(parsePageFromHash('#progress-chart'), 'muscles');
  assert.equal(parsePageFromHash('#muscle-allocation'), 'muscles');

  assert.equal(parsePageFromHash('#/goals'), 'goals');
  assert.equal(parsePageFromHash('#recovery-advice'), 'goals');
  assert.equal(parsePageFromHash('#measurements'), 'goals');

  assert.equal(parsePageFromHash('#/calendar'), 'calendar');
  assert.equal(parsePageFromHash('#calendar'), 'calendar');

  assert.equal(parsePageFromHash('#/history'), 'history');
  assert.equal(parsePageFromHash('#backup'), 'history');

  assert.equal(parsePageFromHash('#/hevy'), 'hevy');
  assert.equal(parsePageFromHash('#hevy'), 'hevy');

  assert.equal(parsePageFromHash('#/checkin'), 'checkin');
  assert.equal(parsePageFromHash('#/daily-log'), 'checkin');
  assert.equal(parsePageFromHash('#biometrics'), 'checkin');

  assert.equal(parsePageFromHash('#/coach'), 'coach');
  assert.equal(parsePageFromHash('#intelligent-coach'), 'coach');

  assert.equal(parsePageFromHash('#/weekly'), 'weekly');
  assert.equal(parsePageFromHash('#scorecard'), 'weekly');

  assert.equal(parsePageFromHash('#/analysis'), 'analysis');
  assert.equal(parsePageFromHash('#/analysis/acwr'), 'analysis');
  assert.equal(parsePageFromHash('#/analysis/supplements'), 'analysis');

  assert.equal(parsePageFromHash('#/unknown-route'), 'checkin');
});

test('APP_PAGES includes Дневен запис, Тренировки (Hevy), Интелигентен треньор, Неделен обзор, and Анализ и Подготовка', () => {
  const hevyPage = APP_PAGES.find((p) => p.id === 'hevy');
  assert.ok(hevyPage);
  assert.equal(hevyPage.label, 'Тренировки (Hevy)');
  assert.equal(getPageHash('hevy'), '#/hevy');

  const checkinPage = APP_PAGES.find((p) => p.id === 'checkin');
  assert.ok(checkinPage);
  assert.equal(checkinPage.label, 'Дневен запис');
  assert.equal(getPageHash('checkin'), '#/checkin');
  assert.equal(APP_PAGES[0].id, 'checkin');

  const coachPage = APP_PAGES.find((p) => p.id === 'coach');
  assert.ok(coachPage);
  assert.equal(coachPage.label, 'Интелигентен треньор');
  assert.equal(getPageHash('coach'), '#/coach');

  const weeklyPage = APP_PAGES.find((p) => p.id === 'weekly');
  assert.ok(weeklyPage);
  assert.equal(weeklyPage.label, 'Неделен обзор');
  assert.equal(getPageHash('weekly'), '#/weekly');

  const analysisPage = APP_PAGES.find((p) => p.id === 'analysis');
  assert.ok(analysisPage);
  assert.equal(analysisPage.label, 'Анализ и Подготовка');
  assert.equal(getPageHash('analysis'), '#/analysis');
});
