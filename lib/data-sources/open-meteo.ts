// Open-Meteo client — free, no API key, no rate-limit auth required.
// Backs FC-01/02/03/04/11 and (via freezing_level_height) part of FC-10.
// Docs: https://open-meteo.com/en/docs

import type {
  AirQuality,
  DailyForecastDay,
  ElevationAdjustedDay,
  ElevationResponse,
  ForecastResponse,
  HistoricalDay,
  HourlyForecastPoint,
} from "@/lib/models/types";

const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const ELEVATION_BASE = "https://api.open-meteo.com/v1/elevation";
const AIR_QUALITY_BASE = "https://air-quality-api.open-meteo.com/v1/air-quality";
const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

const HOURLY_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "snowfall",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "weather_code",
  "freezing_level_height",
].join(",");

const DAILY_PARAMS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "snowfall_sum",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "wind_direction_10m_dominant",
  "weather_code",
].join(",");

interface OpenMeteoForecastRaw {
  utc_offset_seconds: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    snowfall: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    weather_code: number[];
    freezing_level_height: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    snowfall_sum: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    wind_direction_10m_dominant: number[];
    weather_code: number[];
  };
}

/**
 * Retries on 429/5xx with backoff. Added after live testing hit a real,
 * *sustained* 429 from Open-Meteo's free tier under this app's own
 * cumulative testing volume — a single retry wasn't enough to ride out a
 * burst, so this backs off twice (750ms, then 1.5s) before giving up.
 * This is what a "free API, no key" tier actually costs: no guaranteed
 * headroom, and a shared-egress-IP environment can hit it faster than a
 * normal deployment would (see ARCHITECTURE.md). `app/location/error.tsx`
 * is the last line of defense if all retries are exhausted — every
 * caller should also `.catch()` non-critical calls on top of this.
 */
async function fetchJson<T>(url: string): Promise<T> {
  const backoffsMs = [750, 1500];
  let lastStatus = 0;

  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, backoffsMs[attempt - 1]));
    const res = await fetch(url, { next: { revalidate: 900 } }); // 15 min cache — stay well under any fair-use ceiling
    if (res.ok) return res.json() as Promise<T>;
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) break; // don't retry genuine client errors (4xx other than 429)
  }

  throw new Error(`Open-Meteo request failed (${lastStatus}) after retries: ${url}`);
}

export async function getForecast(lat: number, lon: number): Promise<ForecastResponse> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=${HOURLY_PARAMS}&daily=${DAILY_PARAMS}` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch` +
    `&timezone=auto&forecast_days=16`;

  const raw = await fetchJson<OpenMeteoForecastRaw>(url);

  const hourly: HourlyForecastPoint[] = raw.hourly.time.map((time, i) => ({
    time,
    temperatureF: raw.hourly.temperature_2m[i],
    relativeHumidityPct: raw.hourly.relative_humidity_2m[i],
    precipitationIn: raw.hourly.precipitation[i],
    snowfallIn: raw.hourly.snowfall[i],
    windSpeedMph: raw.hourly.wind_speed_10m[i],
    windGustMph: raw.hourly.wind_gusts_10m[i],
    windDirectionDeg: raw.hourly.wind_direction_10m[i],
    weatherCode: raw.hourly.weather_code[i],
    // No unit conversion here: Open-Meteo ties freezing_level_height's unit
    // to the imperial/metric params on this request. Live-verified via
    // hourly_units.freezing_level_height in the raw response — with
    // temperature_unit=fahrenheit set (as this request always does), it
    // comes back already in feet, not meters. Multiplying by 3.28084 here
    // (an easy mistake — every *other* height/elevation conversion in this
    // file legitimately needs it, since getElevation() hits a separate,
    // always-metric endpoint) silently ~3.3x'd every freezing-level
    // reading; caught via a wildly implausible 51,990 ft "snow line" in
    // the new per-day forecast table.
    freezingLevelFt: Math.round(raw.hourly.freezing_level_height[i]),
  }));

  const daily: DailyForecastDay[] = raw.daily.time.map((date, i) => ({
    date,
    tempMaxF: raw.daily.temperature_2m_max[i],
    tempMinF: raw.daily.temperature_2m_min[i],
    precipitationSumIn: raw.daily.precipitation_sum[i],
    snowfallSumIn: raw.daily.snowfall_sum[i],
    windSpeedMaxMph: raw.daily.wind_speed_10m_max[i],
    windGustMaxMph: raw.daily.wind_gusts_10m_max[i],
    windDirectionDominantDeg: raw.daily.wind_direction_10m_dominant[i],
    weatherCode: raw.daily.weather_code[i],
  }));

  return {
    location: { lat, lon },
    generatedAt: new Date().toISOString(),
    hourly,
    daily,
    source: "open-meteo",
    utcOffsetSeconds: raw.utc_offset_seconds,
  };
}

/** FC-11: elevation for any point (backcountry pins), SRTM-based, global. */
export async function getElevation(lat: number, lon: number): Promise<ElevationResponse> {
  const url = `${ELEVATION_BASE}?latitude=${lat}&longitude=${lon}`;
  const raw = await fetchJson<{ elevation: number[] }>(url);
  const meters = raw.elevation[0];
  return {
    lat,
    lon,
    elevationFt: Math.round(meters * 3.28084),
    source: "open-meteo-elevation",
  };
}

/**
 * FC-10-adj: re-requests the daily forecast with Open-Meteo's `elevation`
 * override, which downscales temperature (and, live-verified, precipitation
 * too — not just a lapse-rate-on-temperature trick) to a specific elevation
 * rather than the weather model's native grid elevation. Backs the
 * elevation-adjuster slider (components/location/ElevationAdjuster.tsx) —
 * deliberately a narrow daily-only request (no hourly, 7 days) since it's
 * refetched on every slider move.
 */
export async function getElevationAdjustedDaily(
  lat: number,
  lon: number,
  elevationM: number
): Promise<ElevationAdjustedDay[]> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}&elevation=${elevationM}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto&forecast_days=7`;
  const raw = await fetchJson<{
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      snowfall_sum: number[];
    };
  }>(url);

  return raw.daily.time.map((date, i) => ({
    date,
    tempMaxF: raw.daily.temperature_2m_max[i],
    tempMinF: raw.daily.temperature_2m_min[i],
    precipitationSumIn: raw.daily.precipitation_sum[i],
    snowfallSumIn: raw.daily.snowfall_sum[i],
  }));
}

/**
 * SNOW-02 input: recent hourly temp + snowfall, for the trail-conditions
 * heuristic (time since last snow, freeze-thaw cycles). Same reanalysis
 * caveat as getRecent24hSnowfallIn — this is a model estimate of the
 * recent past, not a direct observation.
 */
export async function getRecentHourlyWindow(
  lat: number,
  lon: number,
  pastDays = 2
): Promise<{ time: string; temperatureF: number; snowfallIn: number }[]> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,snowfall&temperature_unit=fahrenheit&precipitation_unit=inch` +
    `&timezone=auto&past_days=${pastDays}&forecast_days=1`;
  const raw = await fetchJson<{
    hourly: { time: string[]; temperature_2m: number[]; snowfall: number[] };
  }>(url);

  const now = Date.now();
  return raw.hourly.time
    .map((time, i) => ({ time, temperatureF: raw.hourly.temperature_2m[i], snowfallIn: raw.hourly.snowfall[i] }))
    .filter((h) => new Date(h.time).getTime() <= now);
}

/**
 * SNOW-01 pragmatic substitute: Open-Meteo's own past-24h hourly snowfall,
 * summed. NOHRSC's snow-analysis grid is the ideal authoritative source
 * for "actual" observed snowfall, but it doesn't expose a simple
 * point-query JSON API — this uses Open-Meteo's `past_days` param instead,
 * which is a model-reanalysis estimate, not a direct observation. Revisit
 * once a real NOHRSC integration is scoped.
 */
export async function getRecent24hSnowfallIn(lat: number, lon: number): Promise<number> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=snowfall&precipitation_unit=inch&timezone=auto&past_days=1&forecast_days=1`;
  const raw = await fetchJson<{ hourly: { time: string[]; snowfall: number[] } }>(url);

  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;
  return raw.hourly.time.reduce((sum, time, i) => {
    const t = new Date(time).getTime();
    return t >= cutoff && t <= now ? sum + raw.hourly.snowfall[i] : sum;
  }, 0);
}

/** SEV-06/07: current + forecast US AQI, PM2.5, PM10. Free, no key, global (US AQI scale used everywhere). */
export async function getAirQuality(lat: number, lon: number): Promise<AirQuality> {
  const url =
    `${AIR_QUALITY_BASE}?latitude=${lat}&longitude=${lon}` +
    `&current=us_aqi,pm2_5,pm10&hourly=us_aqi&forecast_days=3&timezone=auto`;
  const raw = await fetchJson<{
    current: { us_aqi: number | null; pm2_5: number | null; pm10: number | null };
    hourly: { time: string[]; us_aqi: (number | null)[] };
  }>(url);

  return {
    location: { lat, lon },
    currentUsAqi: raw.current.us_aqi,
    currentPm25: raw.current.pm2_5,
    currentPm10: raw.current.pm10,
    forecastUsAqi: raw.hourly.time.map((time, i) => ({ time, usAqi: raw.hourly.us_aqi[i] })),
  };
}

/** SNOW-05: historical daily weather for a lookback window (max ~90 days kept practical here). */
export async function getHistoricalWeather(
  lat: number,
  lon: number,
  startDate: string,
  endDate: string
): Promise<HistoricalDay[]> {
  const url =
    `${ARCHIVE_BASE}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,snowfall_sum` +
    `&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`;
  const raw = await fetchJson<{
    daily: {
      time: string[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
      snowfall_sum: number[];
    };
  }>(url);

  return raw.daily.time.map((date, i) => ({
    date,
    tempMaxF: raw.daily.temperature_2m_max[i],
    tempMinF: raw.daily.temperature_2m_min[i],
    precipitationSumIn: raw.daily.precipitation_sum[i],
    snowfallSumIn: raw.daily.snowfall_sum[i],
  }));
}

/**
 * MAP-04/05: forecast snowfall/precip "map" via a sampled grid of points
 * rather than true raster tiles — Open-Meteo has no gridded-map product,
 * but its forecast endpoint accepts comma-separated multi-location
 * requests in a single call (confirmed live), which makes a coarse point
 * grid cheap. Not NOHRSC-quality resolution, but real forecast data.
 */
export async function getGridDailySnowfallIn(
  points: { lat: number; lon: number }[]
): Promise<{ lat: number; lon: number; valueIn: number }[]> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat).join(",");
  const lons = points.map((p) => p.lon).join(",");
  const url =
    `${FORECAST_BASE}?latitude=${lats}&longitude=${lons}` +
    `&daily=snowfall_sum&precipitation_unit=inch&forecast_days=1&timezone=auto`;

  const raw = await fetchJson<{ latitude: number; longitude: number; daily: { snowfall_sum: number[] } }[]>(url);
  return raw.map((r, i) => ({ lat: points[i].lat, lon: points[i].lon, valueIn: r.daily.snowfall_sum[0] ?? 0 }));
}

const COMPARISON_MODELS = ["gfs_seamless", "ecmwf_ifs04", "icon_seamless"] as const;

/** FC-05/06 + SNOW-03 corroboration input: per-model daily snowfall totals. */
export async function getMultiModelDailySnowfall(
  lat: number,
  lon: number
): Promise<Record<(typeof COMPARISON_MODELS)[number], number[]>> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&daily=snowfall_sum&precipitation_unit=inch&timezone=auto&forecast_days=7` +
    `&models=${COMPARISON_MODELS.join(",")}`;

  const raw = await fetchJson<Record<string, unknown>>(url);
  const daily = raw.daily as Record<string, number[]>;

  const result = {} as Record<(typeof COMPARISON_MODELS)[number], number[]>;
  for (const model of COMPARISON_MODELS) {
    result[model] = daily[`snowfall_sum_${model}`] ?? [];
  }
  return result;
}
