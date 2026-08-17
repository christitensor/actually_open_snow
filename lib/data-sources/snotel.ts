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
