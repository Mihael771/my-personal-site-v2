import { useEffect, useMemo, useState } from 'react';
import { CloudSun, MapPin, RefreshCw, Wind } from 'lucide-react';
import type {
  CustomExerciseMappings,
  DailyBiometricLog,
  HevyWorkout,
} from '../../types/fitness';
import {
  type WeatherCity,
  type WeatherForecastData,
  buildWeeklyGymVsOutdoorPlan,
  fetchOutdoorWeather,
  loadSavedWeatherCity,
  saveWeatherCity,
  searchWeatherCity,
} from '../../utils/openMeteoWeather';

interface OutdoorWeatherCardProps {
  hevyWorkouts?: HevyWorkout[];
  dailyLogs?: DailyBiometricLog[];
  todayKey?: string;
  customExerciseMappings?: CustomExerciseMappings;
}

export function OutdoorWeatherCard({
  hevyWorkouts = [],
  dailyLogs = [],
  todayKey,
  customExerciseMappings,
}: OutdoorWeatherCardProps = {}) {
  const [city, setCity] = useState<WeatherCity>(() => loadSavedWeatherCity());
  const [forecast, setForecast] = useState<WeatherForecastData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [offline, setOffline] = useState<boolean>(false);

  const [editingCity, setEditingCity] = useState<boolean>(false);
  const [cityQuery, setCityQuery] = useState<string>('');
  const [cityStatus, setCityStatus] = useState<string | null>(null);
  const [searchingCity, setSearchingCity] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setOffline(false);

    fetchOutdoorWeather(city).then((res) => {
      if (!active) return;
      setForecast(res.data);
      setOffline(res.offline);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [city]);

  async function handleManualRefresh() {
    setLoading(true);
    const res = await fetchOutdoorWeather(city, { forceRefresh: true });
    setForecast(res.data);
    setOffline(res.offline);
    setLoading(false);
  }

  async function handleCitySubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = cityQuery.trim();
    if (!trimmed) return;

    setSearchingCity(true);
    setCityStatus(null);
    const res = await searchWeatherCity(trimmed);
    setSearchingCity(false);

    if (res.status === 'found') {
      saveWeatherCity(res.city);
      setCity(res.city);
      setEditingCity(false);
      setCityQuery('');
      setCityStatus(null);
    } else if (res.status === 'not_found') {
      setCityStatus('Градът не беше намерен. Опитай с друго изписване.');
    } else {
      setCityStatus('Няма връзка с интернет — градът не може да бъде сменен сега.');
    }
  }

  const weeklyPlan = useMemo(() => {
    if (!forecast?.daily7d || forecast.daily7d.length === 0) return [];
    return buildWeeklyGymVsOutdoorPlan({
      daily7d: forecast.daily7d,
      hevyWorkouts,
      dailyLogs,
      todayKey,
      customExerciseMappings,
    });
  }, [forecast?.daily7d, hevyWorkouts, dailyLogs, todayKey, customExerciseMappings]);

  const borderAccentClass =
    forecast?.recommendation.status === 'outdoor_great'
      ? 'border-emerald-500/30 bg-[#0F1620]'
      : forecast?.recommendation.status === 'outdoor_caution'
        ? 'border-amber-500/30 bg-[#121722]'
        : forecast?.recommendation.status === 'indoor'
          ? 'border-sky-500/30 bg-[#101624]'
          : 'border-white/10 bg-[#0F141F]';

  return (
    <div
      data-testid="outdoor-weather-card"
      className={`rounded-2xl border p-4 sm:px-5 sm:py-4 ${borderAccentClass}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
              <CloudSun
                className="h-3.5 w-3.5 text-[var(--accent-text)] shrink-0"
                aria-hidden="true"
              />
              <span>Прогноза за тренировка навън</span>
            </span>
            <span className="text-slate-600" aria-hidden="true">
              ·
            </span>
            <span className="inline-flex items-center gap-1 font-medium text-white">
              <MapPin className="h-3 w-3 text-slate-400 shrink-0" aria-hidden="true" />
              <span data-testid="weather-city-name">{city.name}</span>
            </span>
            <button
              type="button"
              data-testid="weather-change-city-btn"
              onClick={() => {
                setEditingCity((v) => !v);
                setCityQuery(city.name);
                setCityStatus(null);
              }}
              className="text-[11px] font-medium text-[var(--accent-text)] hover:underline cursor-pointer"
            >
              {editingCity ? 'Затвори' : 'Смени град'}
            </button>
          </div>

          {loading ? (
            <p className="mt-1.5 text-xs text-slate-400">
              Зареждане на прогнозата за {city.name}…
            </p>
          ) : offline || !forecast ? (
            <p
              data-testid="weather-offline-state"
              className="mt-1.5 text-xs text-slate-400"
            >
              Прогнозата не е достъпна офлайн. Когато има интернет, ще се обнови автоматично (Open-Meteo, 60-мин. кеш).
            </p>
          ) : (
            <>
              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  data-testid="weather-current-temp"
                  className="font-mono text-lg font-extrabold tabular-nums text-white"
                >
                  {forecast.current.conditionEmoji}{' '}
                  {Math.round(forecast.current.temperatureC)}°C
                </span>
                <span className="text-xs text-slate-300">
                  {forecast.current.conditionLabel}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-slate-400">
                  <Wind className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {Math.round(forecast.current.windSpeedKmh)} km/h
                </span>
                {forecast.today.tempMinC !== null && forecast.today.tempMaxC !== null && (
                  <span className="font-mono text-xs tabular-nums text-slate-400">
                    Днес: {Math.round(forecast.today.tempMinC)}° /{' '}
                    {Math.round(forecast.today.tempMaxC)}°
                    {forecast.today.precipProbabilityMax !== null
                      ? ` · Валежи ${forecast.today.precipProbabilityMax}%`
                      : ''}
                  </span>
                )}
              </div>

              <p
                data-testid="weather-recommendation-text"
                className="mt-1 text-xs font-medium leading-relaxed text-slate-200"
              >
                {forecast.recommendation.emoji} {forecast.recommendation.headline}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!loading && forecast?.tomorrow && (
            <div className="border-t border-white/8 pt-2 sm:border-t-0 sm:border-l sm:pl-3 sm:pt-0 text-[11px] text-slate-400">
              <div className="font-medium text-slate-300">Утре</div>
              <div className="mt-0.5 font-mono tabular-nums text-slate-300">
                {forecast.tomorrow.tempMinC !== null
                  ? `${Math.round(forecast.tomorrow.tempMinC)}°`
                  : '—'}{' '}
                /{' '}
                {forecast.tomorrow.tempMaxC !== null
                  ? `${Math.round(forecast.tomorrow.tempMaxC)}°`
                  : '—'}
              </div>
              {forecast.tomorrow.precipProbabilityMax !== null && (
                <div className="font-mono text-[10px] tabular-nums text-slate-500">
                  Валежи: {forecast.tomorrow.precipProbabilityMax}%
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleManualRefresh()}
            disabled={loading}
            aria-label="Обнови прогнозата за времето"
            title="Обнови прогнозата (Open-Meteo)"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-[#141B27] text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50 cursor-pointer shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* 7-дневен план „Зала срещу Навън“ */}
      {!loading && !offline && weeklyPlan.length > 0 && (
        <div
          data-testid="weekly-gym-vs-outdoor-plan"
          className="mt-3.5 border-t border-white/8 pt-3.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold text-white">
              Седмичен план „Зала срещу Навън“ и Планински индекс (7 дни)
            </h3>
            <span className="text-[11px] text-slate-400">
              Температурата на високо в Балкана е изчислена при −6.5°C (~1000 м денивелация)
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {weeklyPlan.map((day) => {
              const dayBorderClass =
                day.mode === 'outdoor'
                  ? 'border-emerald-500/30 bg-emerald-950/15'
                  : day.mode === 'indoor'
                    ? 'border-sky-500/30 bg-sky-950/15'
                    : 'border-amber-500/30 bg-amber-950/15';
              const actionColorClass =
                day.mode === 'outdoor'
                  ? 'text-emerald-300'
                  : day.mode === 'indoor'
                    ? 'text-sky-300'
                    : 'text-amber-300';
              const mountainStatusColorClass =
                day.mountainIndex.status === 'ideal'
                  ? 'text-emerald-300'
                  : day.mountainIndex.status === 'windy_ridge'
                    ? 'text-amber-300'
                    : 'text-rose-300';

              return (
                <div
                  key={day.date}
                  data-testid={`weekly-plan-day-${day.date}`}
                  data-plan-mode={day.mode}
                  data-mountain-status={day.mountainIndex.status}
                  className={`flex flex-col justify-between rounded-xl border p-2.5 ${dayBorderClass}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-mono text-[11px] font-bold tabular-nums text-white">
                        {day.dayShortLabel}{' '}
                        <span className="font-normal text-slate-400">
                          {day.dayNumberLabel}
                        </span>
                      </span>
                      <span className="text-sm leading-none" aria-hidden="true">
                        {day.weatherEmoji}
                      </span>
                    </div>

                    <div className="mt-1 font-mono text-[11px] tabular-nums text-slate-300">
                      {day.tempMinC !== null ? `${Math.round(day.tempMinC)}°` : '—'} /{' '}
                      {day.tempMaxC !== null ? `${Math.round(day.tempMaxC)}°` : '—'}
                      {day.precipProbabilityMax !== null && day.precipProbabilityMax >= 25
                        ? ` · ${day.precipProbabilityMax}%`
                        : ''}
                    </div>

                    <div
                      className={`mt-1.5 text-[11px] font-semibold leading-snug ${actionColorClass}`}
                    >
                      {day.emoji} {day.actionLabel}
                    </div>
                  </div>

                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] leading-tight text-slate-400">
                      {day.reasonText}
                    </div>

                    {/* Планински индекс (~1000м денивелация в Балкана) */}
                    <div className="border-t border-white/10 pt-1.5">
                      <div className="font-mono text-[10px] tabular-nums text-slate-300">
                        🏔️ Високо:{' '}
                        {day.mountainIndex.highAltitudeTempMaxC !== null
                          ? `${Math.round(day.mountainIndex.highAltitudeTempMaxC)}°C`
                          : '—'}
                        {day.mountainIndex.estimatedRidgeWindKmh !== null
                          ? ` · ${day.mountainIndex.estimatedRidgeWindKmh} km/h`
                          : ''}
                      </div>
                      <div
                        className={`mt-0.5 text-[10px] font-semibold leading-tight ${mountainStatusColorClass}`}
                      >
                        {day.mountainIndex.label}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {editingCity && (
        <form
          onSubmit={handleCitySubmit}
          className="mt-3 flex flex-col gap-2 border-t border-white/8 pt-3 sm:flex-row sm:items-center"
        >
          <label htmlFor="weather-city-input" className="sr-only">
            Име на град за прогноза
          </label>
          <input
            id="weather-city-input"
            data-testid="weather-city-input"
            type="text"
            value={cityQuery}
            onChange={(e) => setCityQuery(e.target.value)}
            placeholder="Напр. Пловдив, София, Варна, Карлово…"
            className="h-8 flex-1 rounded-lg border border-white/15 bg-[#141B27] px-3 text-xs text-white placeholder:text-slate-500 focus:border-[var(--accent)]"
          />
          <button
            type="submit"
            data-testid="weather-city-save-btn"
            disabled={searchingCity || !cityQuery.trim()}
            className="inline-flex h-8 items-center justify-center rounded-lg bg-[var(--accent)] px-3.5 text-xs font-semibold text-[var(--accent-contrast)] transition-opacity hover:opacity-90 disabled:opacity-50 whitespace-nowrap cursor-pointer"
          >
            {searchingCity ? 'Търсене…' : 'Запази град'}
          </button>
          {cityStatus && (
            <span className="text-[11px] text-amber-300">{cityStatus}</span>
          )}
        </form>
      )}
    </div>
  );
}
