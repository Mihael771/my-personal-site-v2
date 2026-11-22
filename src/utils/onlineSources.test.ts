import assert from 'node:assert/strict';
import test from 'node:test';
import {
  type FreeExerciseDbItem,
  buildFreeExerciseImageUrl,
  clearFreeExerciseDbMemoryCacheForTests,
  filterExerciseCatalog,
  findBestExerciseMatch,
  findBestExerciseMatches,
  loadFreeExerciseDb,
  normalizeRawFreeExerciseList,
} from './freeExerciseDb';
import {
  DEFAULT_WEATHER_CITY,
  buildForecastUrl,
  buildGeocodingUrl,
  evaluateOutdoorTrainingWeather,
  fetchOutdoorWeather,
  parseOpenMeteoForecastResponse,
  searchWeatherCity,
} from './openMeteoWeather';

test('Open-Meteo default city is Karlovo (42.6333, 24.8000) and builds exact forecast & geocoding URLs', () => {
  assert.equal(DEFAULT_WEATHER_CITY.name, 'Карлово');
  assert.equal(DEFAULT_WEATHER_CITY.latitude, 42.6333);
  assert.equal(DEFAULT_WEATHER_CITY.longitude, 24.8);

  const forecastUrl = buildForecastUrl(DEFAULT_WEATHER_CITY);
  assert.ok(forecastUrl.startsWith('https://api.open-meteo.com/v1/forecast?'));
  assert.ok(forecastUrl.includes('latitude=42.6333'));
  assert.ok(forecastUrl.includes('longitude=24.8'));
  assert.ok(
    forecastUrl.includes(
      'current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code',
    ),
  );
  assert.ok(
    forecastUrl.includes(
      'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max',
    ),
  );
  assert.ok(forecastUrl.includes('forecast_days=7'));

  const geoUrl = buildGeocodingUrl('Пловдив');
  assert.ok(geoUrl.startsWith('https://geocoding-api.open-meteo.com/v1/search?name='));
  assert.ok(geoUrl.includes('count=1&language=bg'));
});

test('Open-Meteo outdoor training evaluator distinguishes great outdoor vs rain/wind indoor recommendations', () => {
  const great = evaluateOutdoorTrainingWeather({
    temperatureC: 16.4,
    precipitationMm: 0,
    windSpeedKmh: 8,
    weatherCode: 0,
    precipProbabilityMax: 10,
  });
  assert.equal(great.status, 'outdoor_great');
  assert.equal(great.suggestedEnvironment, 'street');
  assert.ok(great.headline.includes('16°C'));
  assert.ok(great.headline.includes('лостове'));

  const rainy = evaluateOutdoorTrainingWeather({
    temperatureC: 15,
    precipitationMm: 2.1,
    windSpeedKmh: 12,
    weatherCode: 63,
    precipProbabilityMax: 90,
  });
  assert.equal(rainy.status, 'indoor');
  assert.equal(rainy.suggestedEnvironment, 'gym_or_home');
  assert.ok(rainy.headline.includes('зала или вкъщи'));

  const windy = evaluateOutdoorTrainingWeather({
    temperatureC: 18,
    precipitationMm: 0,
    windSpeedKmh: 36,
    weatherCode: 1,
    precipProbabilityMax: 5,
  });
  assert.equal(windy.status, 'indoor');
  assert.ok(windy.headline.includes('вятър'));
});

test('Open-Meteo fetchOutdoorWeather parses response and falls back silently on network failure', async () => {
  const samplePayload = {
    current: {
      temperature_2m: 17.2,
      apparent_temperature: 16.5,
      precipitation: 0,
      wind_speed_10m: 9.4,
      weather_code: 1,
    },
    daily: {
      time: ['2026-05-12', '2026-05-13'],
      temperature_2m_max: [21, 19],
      temperature_2m_min: [9, 8],
      precipitation_probability_max: [15, 45],
    },
  };

  const parsed = parseOpenMeteoForecastResponse(
    samplePayload,
    DEFAULT_WEATHER_CITY,
    1_700_000_000_000,
  );
  assert.ok(parsed);
  assert.equal(parsed.current.temperatureC, 17.2);
  assert.equal(parsed.tomorrow?.tempMaxC, 19);
  assert.equal(parsed.recommendation.status, 'outdoor_great');

  // Offline / network error returns offline: true without throwing
  const offlineRes = await fetchOutdoorWeather(DEFAULT_WEATHER_CITY, {
    forceRefresh: true,
    fetchImpl: (async () => {
      throw new Error('Network unreachable');
    }) as unknown as typeof fetch,
  });
  assert.equal(offlineRes.offline, true);
  assert.equal(offlineRes.data, null);

  // Geocoding search returns found city cleanly
  const geoRes = await searchWeatherCity('Пловдив', {
    fetchImpl: (async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            name: 'Пловдив',
            country: 'България',
            latitude: 42.1354,
            longitude: 24.7453,
          },
        ],
      }),
    })) as unknown as typeof fetch,
  });
  assert.equal(geoRes.status, 'found');
  if (geoRes.status === 'found') {
    assert.equal(geoRes.city.name, 'Пловдив');
    assert.equal(geoRes.city.latitude, 42.1354);
  }
});

const SAMPLE_CATALOG: FreeExerciseDbItem[] = normalizeRawFreeExerciseList([
  {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press - Medium Grip',
    level: 'beginner',
    equipment: 'barbell',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'triceps'],
    category: 'strength',
    instructions: ['Lie back on a flat bench.', 'Lower the bar to mid-chest and press up.'],
    images: [
      'Barbell_Bench_Press_-_Medium_Grip/0.jpg',
      'Barbell_Bench_Press_-_Medium_Grip/1.jpg',
    ],
  },
  {
    id: 'Dumbbell_Bench_Press',
    name: 'Dumbbell Bench Press',
    level: 'beginner',
    equipment: 'dumbbell',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['shoulders', 'triceps'],
    category: 'strength',
    instructions: ['Lie on a flat bench holding dumbbells.'],
    images: ['Dumbbell_Bench_Press/0.jpg', 'Dumbbell_Bench_Press/1.jpg'],
  },
  {
    id: 'Pullups',
    name: 'Pullups',
    level: 'beginner',
    equipment: 'body only',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'middle back'],
    category: 'strength',
    instructions: ['Grab the pull-up bar with palms facing forward.', 'Pull torso up until chest nears bar.'],
    images: ['Pullups/0.jpg', 'Pullups/1.jpg'],
  },
  {
    id: 'Wide-Grip_Lat_Pulldown',
    name: 'Wide-Grip Lat Pulldown',
    level: 'beginner',
    equipment: 'cable',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'middle back'],
    category: 'strength',
    instructions: ['Sit down on a pull-down machine.'],
    images: ['Wide-Grip_Lat_Pulldown/0.jpg', 'Wide-Grip_Lat_Pulldown/1.jpg'],
  },
  {
    id: 'Barbell_Full_Squat',
    name: 'Barbell Full Squat',
    level: 'intermediate',
    equipment: 'barbell',
    primaryMuscles: ['quadriceps'],
    secondaryMuscles: ['glutes', 'hamstrings'],
    category: 'strength',
    instructions: ['Place barbell on upper back and squat down.'],
    images: ['Barbell_Full_Squat/0.jpg', 'Barbell_Full_Squat/1.jpg'],
  },
]);

test('Free Exercise DB fuzzy matcher resolves Hevy names, equipment hints, and Bulgarian queries', () => {
  const benchMatch = findBestExerciseMatch('Bench Press (Barbell)', SAMPLE_CATALOG);
  assert.equal(benchMatch?.id, 'Barbell_Bench_Press_-_Medium_Grip');

  const dbBenchMatch = findBestExerciseMatch('Bench Press (Dumbbell)', SAMPLE_CATALOG);
  assert.equal(dbBenchMatch?.id, 'Dumbbell_Bench_Press');

  const pullUpMatch = findBestExerciseMatch('Pull Up', SAMPLE_CATALOG);
  assert.equal(pullUpMatch?.id, 'Pullups');

  const bgPullUpMatch = findBestExerciseMatch('Набирания', SAMPLE_CATALOG);
  assert.equal(bgPullUpMatch?.id, 'Pullups');

  const multi = findBestExerciseMatches('Bench Press', SAMPLE_CATALOG, 4);
  assert.equal(multi.length, 2);

  assert.equal(
    buildFreeExerciseImageUrl('Pullups/0.jpg'),
    'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Pullups/0.jpg',
  );
});

test('Free Exercise DB library filter handles muscle groups, equipment buckets, and silent offline load', async () => {
  const bwOnly = filterExerciseCatalog({
    catalog: SAMPLE_CATALOG,
    equipmentFilter: 'bodyweight',
  });
  assert.equal(bwOnly.length, 1);
  assert.equal(bwOnly[0].id, 'Pullups');

  const backMachine = filterExerciseCatalog({
    catalog: SAMPLE_CATALOG,
    muscleFilter: 'back',
    equipmentFilter: 'machine',
  });
  assert.equal(backMachine.length, 1);
  assert.equal(backMachine[0].id, 'Wide-Grip_Lat_Pulldown');

  const bgSearch = filterExerciseCatalog({
    catalog: SAMPLE_CATALOG,
    searchQuery: 'Гърди',
  });
  assert.equal(bgSearch.length, 2);

  clearFreeExerciseDbMemoryCacheForTests();
  const loaded = await loadFreeExerciseDb({
    fetchImpl: (async () => ({
      ok: true,
      json: async () => SAMPLE_CATALOG,
    })) as unknown as typeof fetch,
    nowMs: 1_700_000_000_000,
  });
  assert.equal(loaded.offline, false);
  assert.equal(loaded.exercises.length, 5);

  // Subsequent load within 30 days hits memory/localStorage cache without fetching
  let fetchCalled = false;
  const cached = await loadFreeExerciseDb({
    fetchImpl: (async () => {
      fetchCalled = true;
      throw new Error('Should not fetch when cached');
    }) as unknown as typeof fetch,
    nowMs: 1_700_000_000_000 + 10 * 24 * 60 * 60 * 1000, // +10 days (< 30 days)
  });
  assert.equal(fetchCalled, false);
  assert.equal(cached.fromCache, true);
  assert.equal(cached.exercises.length, 5);

  // Offline without cache fails silently
  clearFreeExerciseDbMemoryCacheForTests();
  const offline = await loadFreeExerciseDb({
    forceRefresh: true,
    fetchImpl: (async () => {
      throw new Error('Offline');
    }) as unknown as typeof fetch,
  });
  assert.equal(offline.offline, true);
  assert.equal(offline.exercises.length, 0);
});
