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
import type { SnotelReading, SnotelStation } from "@/lib/models/types";

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

/** Phase 1 scope: only need UT/ID SNOTEL networks (see TRACE_MATRIX.md regional scope). */
const PHASE_1_TRIPLETS = "*:UT:SNTL,*:ID:SNTL";

async function fetchPhase1Stations(): Promise<AwdbStation[]> {
  const url = `${BASE}/stations?stationTriplets=${PHASE_1_TRIPLETS}&activeOnly=true`;
  // Not using Next's `next: { revalidate }` data cache here: the AWDB
  // response for ~225 UT/ID stations is ~2.1MB (each station's
  // `associatedHucs` array is large), over Next's 2MB fetch-cache ceiling
  // — caching silently failed with a console warning every request before
  // this was explicit. `no-store` matches what was actually happening
  // already; a real fix would trim the response to the ~4 fields this app
  // uses and cache that instead, not attempted yet.
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`SNOTEL stations request failed (${res.status})`);
  }
  return res.json() as Promise<AwdbStation[]>;
}

/** DATA-01: nearest SNOTEL stations to a point, within Phase 1's UT/ID scope. */
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

/** Latest snow depth (SNWD) + snow-water-equivalent (WTEQ) reading for a station. */
export async function getLatestReading(station: SnotelStation): Promise<SnotelReading> {
  const url =
    `${BASE}/data?stationTriplets=${station.stationTriplet}` +
    `&elements=SNWD,WTEQ&duration=DAILY&beginDate=-3&endDate=0`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`SNOTEL data request failed (${res.status}) for ${station.stationTriplet}`);
  }
  const raw = (await res.json()) as AwdbDataResponse[];
  const stationData = raw[0];

  const snwd = stationData?.data.find((d) => d.stationElement.elementCode === "SNWD");
  const wteq = stationData?.data.find((d) => d.stationElement.elementCode === "WTEQ");
  const latestSnwd = snwd?.values.at(-1);
  const latestWteq = wteq?.values.at(-1);

  return {
    station,
    date: latestSnwd?.date ?? latestWteq?.date ?? new Date().toISOString(),
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

  const triplets = stations.map((s) => s.stationTriplet).join(",");
  const url = `${BASE}/data?stationTriplets=${triplets}&elements=SNWD,WTEQ&duration=DAILY&beginDate=-3&endDate=0`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`SNOTEL batched data request failed (${res.status})`);
  }
  const raw = (await res.json()) as AwdbDataResponse[];
  const byTriplet = new Map(raw.map((r) => [r.stationTriplet, r]));

  return stations.map((station) => {
    const stationData = byTriplet.get(station.stationTriplet);
    const snwd = stationData?.data.find((d) => d.stationElement.elementCode === "SNWD");
    const wteq = stationData?.data.find((d) => d.stationElement.elementCode === "WTEQ");
    const latestSnwd = snwd?.values.at(-1);
    const latestWteq = wteq?.values.at(-1);
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
