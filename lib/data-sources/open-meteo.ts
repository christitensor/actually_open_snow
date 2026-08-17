// Open-Meteo client — free, no API key, no rate-limit auth required.
// Backs FC-01/02/03/04/11 and (via freezing_level_height) part of FC-10.
// Docs: https://open-meteo.com/en/docs

import type {
  DailyForecastDay,
  ElevationResponse,
  ForecastResponse,
  HourlyForecastPoint,
} from "@/lib/models/types";

const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";
const ELEVATION_BASE = "https://api.open-meteo.com/v1/elevation";

const HOURLY_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
  "snowfall",
  "wind_speed_10m",
  "wind_gusts_10m",
  "weather_code",
  "freezing_level_height",
].join(",");

const DAILY_PARAMS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "snowfall_sum",
  "wind_speed_10m_max",
  "weather_code",
].join(",");

interface OpenMeteoForecastRaw {
  hourly: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    precipitation: number[];
    snowfall: number[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
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
    weather_code: number[];
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { next: { revalidate: 900 } }); // 15 min cache — stay well under any fair-use ceiling
  if (!res.ok) {
    throw new Error(`Open-Meteo request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
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
    weatherCode: raw.hourly.weather_code[i],
  }));

  const daily: DailyForecastDay[] = raw.daily.time.map((date, i) => ({
    date,
    tempMaxF: raw.daily.temperature_2m_max[i],
    tempMinF: raw.daily.temperature_2m_min[i],
    precipitationSumIn: raw.daily.precipitation_sum[i],
    snowfallSumIn: raw.daily.snowfall_sum[i],
    windSpeedMaxMph: raw.daily.wind_speed_10m_max[i],
    weatherCode: raw.daily.weather_code[i],
  }));

  return {
    location: { lat, lon },
    generatedAt: new Date().toISOString(),
    hourly,
    daily,
    source: "open-meteo",
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

/** Freezing level (meters -> feet), hourly, for FC-10's non-US fallback/corroboration. */
export async function getFreezingLevelFt(
  lat: number,
  lon: number
): Promise<{ time: string; freezingLevelFt: number }[]> {
  const url =
    `${FORECAST_BASE}?latitude=${lat}&longitude=${lon}` +
    `&hourly=freezing_level_height&timezone=auto&forecast_days=7`;
  const raw = await fetchJson<{
    hourly: { time: string[]; freezing_level_height: number[] };
  }>(url);
  return raw.hourly.time.map((time, i) => ({
    time,
    freezingLevelFt: Math.round(raw.hourly.freezing_level_height[i] * 3.28084),
  }));
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
