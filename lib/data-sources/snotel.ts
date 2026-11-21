// NRCS SNOTEL client, via the public AWDB REST API — free, no key.
// Backs DATA-01 (station map) and SNOW-03's "does observed snowpack match
// what was forecast" corroboration check.
//
// Confirmed live (Aug 2026) against the API's own OpenAPI spec
// (/awdbRestApi/v3/api-docs) and a real request: station filtering uses
// `stationTriplets` with wildcards (e.g. "*:UT:SNTL"), NOT
// `networkCds`/`stateCds` — those silently no-op and return every station
// nationwide, which is where the original version of this file had a bug.
// The /data endpoint requires beginDate/endDate (relative dates like "-3"
// work) — there is no `durationCount`/`periodRef=END` shortcut.

import { haversineMiles } from "@/lib/util/geo";
import type { PrecipGradient, SnotelReading, SnotelStation } from "@/lib/models/types";
import snotelStations from "@/data/snotel-stations.json";
import { defaultPrecipGradient, fitPrecipGradient, type GradientStation } from "@/lib/derive/precip-gradient";

const BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1";

interface AwdbStation {
  stationTriplet: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number; // feet, per NRCS convention
  /** Hours from UTC that this station's timestamps are in — e.g. -8 even for Utah stations (confirmed live). */
  dataTimeZone?: number;
}

/**
 * Every active SNOTEL station in the states with a curated resort (UT, ID,
 * WY, MT, CO, NV, CA, OR, WA, AZ, NM, SD), baked into the repo by
 * scripts/build-snotel-stations.mjs. Fetching it live cost ~3s per cold
 * serverless start (a ~2MB AWDB response Next can't fetch-cache), which on
 * its own pushed the home page's measured-snow line past its 4s timeout —
 * so SNOTEL numbers mostly never showed. Stations change a few times a
 * year; a retired one just returns no data. Rerun the script when adding a
 * resort in a new state.
 */
function fetchPhase1Stations(): Promise<AwdbStation[]> {
  return Promise.resolve(snotelStations as AwdbStation[]);
}

/**
 * The AWDB /data endpoint's response time scales with the number of
 * stations in one request (~0.1s per station for a few days of hourly
 * data), but parallel requests don't slow each other down: 60 stations
 * took ~5.7s as one request vs ~1.8s as six parallel requests of 10.
 */
const HOURLY_CHUNK = 10;
async function fetchDataChunked(
  triplets: string[],
  chunkSize: number,
  query: string,
  init: RequestInit
): Promise<AwdbDataResponse[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < triplets.length; i += chunkSize) chunks.push(triplets.slice(i, i + chunkSize));
  const results = await Promise.allSettled(
    chunks.map(async (chunk) => {
      const res = await fetch(`${BASE}/data?stationTriplets=${chunk.join(",")}&${query}`, init);
      if (!res.ok) throw new Error(`SNOTEL data request failed (${res.status})`);
      return (await res.json()) as AwdbDataResponse[];
    })
  );
  // A failed chunk only blanks its own stations; fail only if all did.
  if (results.length > 0 && results.every((r) => r.status === "rejected")) throw (results[0] as PromiseRejectedResult).reason;
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Newest reading that actually has a value — AWDB pads missing hours/days with nulls. */
function latestNonNull(values: { date: string; value: number | null }[] | undefined) {
  return values?.findLast((v) => v.value != null);
}

/** AWDB timestamps ("YYYY-MM-DD HH:mm") are in the station's fixed offset, not UTC. */
function stationTimeToIso(date: string, offsetH = -8): string {
  return new Date(new Date(`${date.replace(" ", "T")}:00Z`).getTime() - offsetH * 3600 * 1000).toISOString();
}

/** DATA-01: nearest SNOTEL stations to a point, from the baked station list. */
export async function findNearbyStations(
  lat: number,
  lon: number,
  maxResults = 5
): Promise<SnotelStation[]> {
  const allStations = await fetchPhase1Stations();

  return allStations
    .map((s) => ({
      stationTriplet: s.stationTriplet,
      name: s.name,
      lat: s.latitude,
      lon: s.longitude,
      elevationFt: s.elevation,
      distanceMi: haversineMiles(lat, lon, s.latitude, s.longitude),
    }))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, maxResults);
}

interface AwdbDataResponse {
  stationTriplet: string;
  data: {
    stationElement: { elementCode: string };
    values: { date: string; value: number | null }[];
  }[];
}

/**
 * Latest snow depth (SNWD) + snow-water-equivalent (WTEQ) reading for a
 * station. Hourly, not daily: a DAILY value is the midnight reading, so it
 * was always "as of yesterday" and looked stuck all day. Hourly data lags
 * real time by ~1-2h.
 */
export async function getLatestReading(station: SnotelStation, now = new Date()): Promise<SnotelReading> {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const begin = fmt(new Date(now.getTime() - 2 * 24 * 3600 * 1000));
  const end = fmt(new Date(now.getTime() + 24 * 3600 * 1000));
  const url =
    `${BASE}/data?stationTriplets=${station.stationTriplet}` +
    `&elements=SNWD,WTEQ&duration=HOURLY&beginDate=${begin}&endDate=${end}`;
  const res = await fetch(url, { next: { revalidate: 900 } });
  if (!res.ok) {
    throw new Error(`SNOTEL data request failed (${res.status}) for ${station.stationTriplet}`);
  }
  const raw = (await res.json()) as AwdbDataResponse[];
  const stationData = raw[0];
  const offsetH = (snotelStations as AwdbStation[]).find((s) => s.stationTriplet === station.stationTriplet)?.dataTimeZone;

  const latestSnwd = latestNonNull(stationData?.data.find((d) => d.stationElement.elementCode === "SNWD")?.values);
  const latestWteq = latestNonNull(stationData?.data.find((d) => d.stationElement.elementCode === "WTEQ")?.values);
  const latestDate = latestSnwd?.date ?? latestWteq?.date;

  return {
    station,
    date: latestDate ? stationTimeToIso(latestDate, offsetH) : new Date().toISOString(),
    snowDepthIn: latestSnwd?.value ?? null,
    sweIn: latestWteq?.value ?? null,
  };
}

/**
 * DATA-01 map layer: every Phase-1 (UT/ID) SNOTEL station with its latest
 * reading, for plotting region-wide rather than nearest-N to one point.
 * The AWDB /data endpoint accepts a comma-separated stationTriplets list
 * in one call (confirmed live: all ~223 Phase-1 stations in a single
 * ~10s request, well under the URL-length limits that would force
 * chunking) — one request instead of 223 is the only way this is
 * feasible for a map layer. Cached long (1hr) since that request is slow;
 * SNOTEL readings only update daily anyway.
 */
export async function getAllPhase1StationsWithReadings(): Promise<SnotelReading[]> {
  const allStations = await fetchPhase1Stations();
  const stations: SnotelStation[] = allStations.map((s) => ({
    stationTriplet: s.stationTriplet,
    name: s.name,
    lat: s.latitude,
    lon: s.longitude,
    elevationFt: s.elevation,
    distanceMi: 0,
  }));

  // Daily values are cheap per station; 100-station chunks in parallel
  // keep each request a few seconds instead of one ~30s request.
  const raw = await fetchDataChunked(
    stations.map((s) => s.stationTriplet),
    100,
    "elements=SNWD,WTEQ&duration=DAILY&beginDate=-3&endDate=0",
    { next: { revalidate: 3600 } }
  );
  const byTriplet = new Map(raw.map((r) => [r.stationTriplet, r]));

  return stations.map((station) => {
    const stationData = byTriplet.get(station.stationTriplet);
    const snwd = stationData?.data.find((d) => d.stationElement.elementCode === "SNWD");
    const wteq = stationData?.data.find((d) => d.stationElement.elementCode === "WTEQ");
    const latestSnwd = latestNonNull(snwd?.values);
    const latestWteq = latestNonNull(wteq?.values);
    return {
      station,
      date: latestSnwd?.date ?? latestWteq?.date ?? new Date().toISOString(),
      snowDepthIn: latestSnwd?.value ?? null,
      sweIn: latestWteq?.value ?? null,
    };
  });
}

export interface OvernightDepthGain {
  station: SnotelStation;
  /** Measured snow-depth rise (inches) from the window start to the latest hourly reading; never negative. */
  gainIn: number;
  startDepthIn: number;
  latestDepthIn: number;
  /** ISO time of the latest hourly reading used — SNOTEL hourly data typically lags real time by ~1-2h. */
  latestReadingAt: string;
}

/**
 * Measured overnight new snow at nearby SNOTEL stations: the rise in the
 * ultrasonic snow-depth sensor (SNWD, 1" resolution, hourly) since
 * `since`. This is a measurement, not a model — but a depth sensor sees
 * settling too, so it slightly under-reads fluffy snow relative to a
 * patrol's new-snow board. Stations farther than maxMiles are ignored
 * rather than reported as "0 here".
 */
export async function getOvernightDepthGains(
  lat: number,
  lon: number,
  since: Date,
  { maxStations = 2, maxMiles = 15, now = new Date() } = {}
): Promise<OvernightDepthGain[]> {
  const all = await fetchPhase1Stations();
  const nearby = all
    .map((s) => ({ raw: s, distanceMi: haversineMiles(lat, lon, s.latitude, s.longitude) }))
    .filter((s) => s.distanceMi <= maxMiles)
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, maxStations);
  if (nearby.length === 0) return [];

  // Explicit calendar dates (relative "-1" only returned today's values when tested).
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const begin = fmt(new Date(since.getTime() - 24 * 3600 * 1000));
  const end = fmt(new Date(now.getTime() + 24 * 3600 * 1000));
  const triplets = nearby.map((s) => s.raw.stationTriplet).join(",");
  const url = `${BASE}/data?stationTriplets=${triplets}&elements=SNWD&duration=HOURLY&beginDate=${begin}&endDate=${end}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`SNOTEL hourly request failed (${res.status})`);
  const raw = (await res.json()) as AwdbDataResponse[];
  const byTriplet = new Map(raw.map((r) => [r.stationTriplet, r]));

  const gains: OvernightDepthGain[] = [];
  for (const { raw: st, distanceMi } of nearby) {
    const offsetH = st.dataTimeZone ?? -8;
    const values = (byTriplet.get(st.stationTriplet)?.data.find((d) => d.stationElement.elementCode === "SNWD")?.values ?? [])
      .filter((v): v is { date: string; value: number } => v.value != null)
      .map((v) => ({ t: new Date(`${v.date.replace(" ", "T")}:00Z`).getTime() - offsetH * 3600 * 1000, depth: v.value }))
      .filter((v) => v.t <= now.getTime()); // `now` may be in the past when backtesting
    // Window start = the last reading at or before `since`; latest = newest reading.
    const before = values.filter((v) => v.t <= since.getTime());
    const start = before.at(-1);
    const latest = values.at(-1);
    if (!start || !latest || latest.t <= since.getTime()) continue;
    gains.push({
      station: { stationTriplet: st.stationTriplet, name: st.name, lat: st.latitude, lon: st.longitude, elevationFt: st.elevation, distanceMi },
      gainIn: Math.max(0, latest.depth - start.depth),
      startDepthIn: start.depth,
      latestDepthIn: latest.depth,
      latestReadingAt: new Date(latest.t).toISOString(),
    });
  }
  return gains;
}

export interface MeasuredSnowNearby {
  stationName: string;
  distanceMi: number;
  elevationFt: number;
  /** Latest measured snow depth (inches, ultrasonic sensor, 1" resolution). */
  depthIn: number;
  /** Measured depth rise over the last 24h; never negative (melt/settling reads as 0). */
  gain24hIn: number;
  /** ISO time of the latest hourly reading — SNOTEL typically lags real time by ~1-2h. */
  readingAt: string;
}

/**
 * Measured snow on the ground at the nearest SNOTEL station to each point
 * (within maxMiles), for showing next to the model's snowfall numbers. The
 * model can count near-freezing precipitation as snow that never
 * accumulates (rain, or wet snow melting on warm ground); a depth sensor
 * shows what actually stuck. One batched hourly request for all stations.
 * null for a point with no station close enough — "no nearby sensor", not
 * "no snow".
 */
export async function getMeasuredSnowNearPoints(
  points: { lat: number; lon: number }[],
  { maxMiles = 5, now = new Date() } = {}
): Promise<(MeasuredSnowNearby | null)[]> {
  if (points.length === 0) return [];
  const all = await fetchPhase1Stations();

  const nearest = points.map(({ lat, lon }) => {
    let best: { st: AwdbStation; distanceMi: number } | null = null;
    for (const st of all) {
      const distanceMi = haversineMiles(lat, lon, st.latitude, st.longitude);
      if (distanceMi <= maxMiles && (!best || distanceMi < best.distanceMi)) best = { st, distanceMi };
    }
    return best;
  });
  const triplets = [...new Set(nearest.flatMap((n) => (n ? [n.st.stationTriplet] : [])))];
  if (triplets.length === 0) return points.map(() => null);

  // Explicit calendar dates (relative "-1" only returned today's values when tested).
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const begin = fmt(new Date(now.getTime() - 2 * 24 * 3600 * 1000));
  const end = fmt(new Date(now.getTime() + 24 * 3600 * 1000));
  const raw = await fetchDataChunked(triplets, HOURLY_CHUNK, `elements=SNWD&duration=HOURLY&beginDate=${begin}&endDate=${end}`, {
    next: { revalidate: 900 },
  });
  const byTriplet = new Map(raw.map((r) => [r.stationTriplet, r]));

  return nearest.map((n) => {
    if (!n) return null;
    const offsetH = n.st.dataTimeZone ?? -8;
    const values = (byTriplet.get(n.st.stationTriplet)?.data.find((d) => d.stationElement.elementCode === "SNWD")?.values ?? [])
      .filter((v): v is { date: string; value: number } => v.value != null)
      .map((v) => ({ t: new Date(`${v.date.replace(" ", "T")}:00Z`).getTime() - offsetH * 3600 * 1000, depth: v.value }))
      .filter((v) => v.t <= now.getTime());
    const latest = values.at(-1);
    if (!latest) return null;
    const dayAgo = values.filter((v) => v.t <= latest.t - 24 * 3600 * 1000).at(-1);
    return {
      stationName: n.st.name,
      distanceMi: n.distanceMi,
      elevationFt: n.st.elevation,
      depthIn: latest.depth,
      gain24hIn: dayAgo ? Math.max(0, latest.depth - dayAgo.depth) : 0,
      readingAt: new Date(latest.t).toISOString(),
    };
  });
}

const GRADIENT_RADIUS_MI = 20;
const GRADIENT_MAX_STATIONS = 12;
const GRADIENT_YEARS = 10;
/** Newer stations with only a few (possibly unusually wet/dry) years would skew a mean-precip comparison. */
const GRADIENT_MIN_YEARS = 7;
const gradientCache = new Map<string, { at: number; gradient: Promise<PrecipGradient> }>();
const GRADIENT_TTL_MS = 24 * 3600 * 1000;

/**
 * FC-10-adj: SNOTEL-calibrated precip-vs-elevation gradient around a
 * point (see lib/derive/precip-gradient.ts for the method and caveats).
 * Uses the AWDB WATER_YEAR duration for PREC (accumulated water-year
 * precip) — one value per station per year, confirmed live — averaged
 * over the last ~10 complete water years. Falls back to the default
 * gradient outside Phase 1's UT/ID coverage or when too few stations
 * qualify. Cached per ~1km cell for a day: these totals change once a year.
 */
export function getPrecipGradient(lat: number, lon: number, now = new Date()): Promise<PrecipGradient> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = gradientCache.get(key);
  if (hit && Date.now() - hit.at < GRADIENT_TTL_MS) return hit.gradient;
  const gradient = getPrecipGradientUncached(lat, lon, now).catch(() => {
    gradientCache.delete(key);
    return defaultPrecipGradient();
  });
  gradientCache.set(key, { at: Date.now(), gradient });
  return gradient;
}

async function getPrecipGradientUncached(lat: number, lon: number, now: Date): Promise<PrecipGradient> {
  const all = await fetchPhase1Stations();
  const nearby = all
    .map((s) => ({ s, distanceMi: haversineMiles(lat, lon, s.latitude, s.longitude) }))
    .filter((n) => n.distanceMi <= GRADIENT_RADIUS_MI)
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, GRADIENT_MAX_STATIONS);
  if (nearby.length === 0) return defaultPrecipGradient();

  // Water year N runs Oct 1 (N-1) - Sep 30 N; only use complete ones.
  const lastCompleteWy = now.getUTCMonth() >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const firstWy = lastCompleteWy - GRADIENT_YEARS + 1;
  const triplets = nearby.map((n) => n.s.stationTriplet).join(",");
  const url =
    `${BASE}/data?stationTriplets=${triplets}&elements=PREC&duration=WATER_YEAR` +
    `&beginDate=${firstWy - 1}-10-01&endDate=${lastCompleteWy}-09-30`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`SNOTEL water-year request failed (${res.status})`);
  const raw = (await res.json()) as {
    stationTriplet: string;
    data: { values: { year: number; value: number | null }[] }[];
  }[];
  const byTriplet = new Map(raw.map((r) => [r.stationTriplet, r]));

  const stations: GradientStation[] = nearby.flatMap(({ s, distanceMi }) => {
    const years = (byTriplet.get(s.stationTriplet)?.data[0]?.values ?? []).filter(
      (v): v is { year: number; value: number } => v.value != null && v.value > 0 && v.year >= firstWy && v.year <= lastCompleteWy
    );
    if (years.length < GRADIENT_MIN_YEARS) return [];
    return [{ elevationFt: s.elevation, meanPrecipIn: years.reduce((a, v) => a + v.value, 0) / years.length, distanceMi }];
  });
  return fitPrecipGradient(stations);
}

/**
 * "Nov 21, 8 AM" for an hourly reading's ISO time, in the location's
 * local time (utcOffsetSeconds, e.g. Open-Meteo's); a plain daily date
 * ("2026-11-20") passes through unchanged.
 */
export function formatSnotelAsOf(date: string, utcOffsetSeconds: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return date;
  return new Date(t + utcOffsetSeconds * 1000).toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}
