// Regenerates data/snotel-stations.json — the trimmed SNOTEL station list
// lib/data-sources/snotel.ts reads. The live AWDB /stations response is
// ~2MB+ and ~3s, too slow to fetch on every cold serverless start (it was
// pushing the home page's measured-snow line past its timeout). Stations
// are added/retired only a few times a year; rerun when adding a state:
//   node scripts/build-snotel-stations.mjs
import { writeFileSync } from "node:fs";

const STATES = ["UT", "ID", "WY", "MT", "CO", "NV", "CA", "OR", "WA", "AZ", "NM", "SD"];
const url =
  "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stationTriplets=" +
  STATES.map((s) => `*:${s}:SNTL`).join(",") +
  "&activeOnly=true";

const res = await fetch(url);
if (!res.ok) throw new Error(`AWDB stations request failed (${res.status})`);
const all = await res.json();
const trimmed = all
  .map(({ stationTriplet, name, latitude, longitude, elevation, dataTimeZone }) => ({
    stationTriplet,
    name,
    latitude,
    longitude,
    elevation,
    dataTimeZone,
  }))
  .sort((a, b) => a.stationTriplet.localeCompare(b.stationTriplet));
writeFileSync(new URL("../data/snotel-stations.json", import.meta.url), JSON.stringify(trimmed) + "\n");
console.log(`Wrote ${trimmed.length} stations`);
