// Builds data/ski-areas.json — every operating downhill ski area in the US
// and Canada — from OpenSkiMap's open ski_areas.geojson (derived from
// OpenStreetMap; ODbL, © OpenStreetMap contributors / OpenSkiMap.org).
//
// This is what lets a search for any ski resort open a full resort page,
// not just the hand-curated ones in data/resorts.json. Re-run when you want
// fresher data (the source updates daily; ski areas rarely change):
//
//   curl -o /tmp/ski_areas.geojson https://tiles.openskimap.org/geojson/ski_areas.geojson
//   node scripts/build-ski-areas.mjs /tmp/ski_areas.geojson
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/build-ski-areas.mjs <ski_areas.geojson>");
  process.exit(1);
}

const M_TO_FT = 3.28084;
const curated = JSON.parse(readFileSync(fileURLToPath(new URL("../data/resorts.json", import.meta.url)), "utf8"));

function slugify(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function centroid(geom) {
  // Polygon/MultiPolygon/Point — a plain vertex average is plenty for a
  // forecast point inside a ski area's boundary.
  const pts = [];
  const walk = (c) => (typeof c[0] === "number" ? pts.push(c) : c.forEach(walk));
  walk(geom.coordinates);
  const lon = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const lat = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return [lon, lat];
}

function distKm(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const x = (bLon - aLon) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}

const STATE_ABBR = {
  "US-AK": "AK", "US-AZ": "AZ", "US-CA": "CA", "US-CO": "CO", "US-CT": "CT", "US-ID": "ID", "US-IL": "IL", "US-IN": "IN",
  "US-IA": "IA", "US-ME": "ME", "US-MD": "MD", "US-MA": "MA", "US-MI": "MI", "US-MN": "MN", "US-MO": "MO", "US-MT": "MT",
  "US-NV": "NV", "US-NH": "NH", "US-NJ": "NJ", "US-NM": "NM", "US-NY": "NY", "US-NC": "NC", "US-ND": "ND", "US-OH": "OH",
  "US-OR": "OR", "US-PA": "PA", "US-SD": "SD", "US-TN": "TN", "US-UT": "UT", "US-VT": "VT", "US-VA": "VA", "US-WA": "WA",
  "US-WV": "WV", "US-WI": "WI", "US-WY": "WY",
};

const geo = JSON.parse(readFileSync(src, "utf8"));
const out = [];
for (const f of geo.features) {
  const p = f.properties;
  const place = (p.places ?? []).find((pl) => pl.iso3166_1Alpha2 === "US" || pl.iso3166_1Alpha2 === "CA");
  if (!place || !p.name || p.status !== "operating" || !(p.activities ?? []).includes("downhill")) continue;
  const stats = p.statistics ?? {};
  if (stats.minElevation == null || stats.maxElevation == null) continue; // no lifts/runs mapped — not useful as a resort page
  const [lon, lat] = p.viewportHint?.center ?? centroid(f.geometry);
  const en = place.localized?.en ?? {};
  const region = [en.region, place.iso3166_1Alpha2 === "CA" ? "Canada" : null].filter(Boolean).join(", ") || "United States";
  const base = Math.round(stats.minElevation * M_TO_FT);
  const summit = Math.round(stats.maxElevation * M_TO_FT);
  if (summit - base < 100) continue;
  // Skip ski areas already hand-curated (they have verified webcams/reports).
  if (curated.some((c) => distKm(c.lat, c.lon, lat, lon) < 4)) continue;
  out.push({
    id: slugify(p.name),
    name: p.name,
    region,
    state: STATE_ABBR[place.iso3166_2] ?? (place.iso3166_2 ?? "").replace(/^CA-/, "") ?? undefined,
    lat: Math.round(lat * 10000) / 10000,
    lon: Math.round(lon * 10000) / 10000,
    baseElevationFt: base,
    midElevationFt: Math.round((base + summit) / 2 / 10) * 10,
    summitElevationFt: summit,
    website: (p.websites ?? [])[0],
  });
}

// Unique, stable slugs: duplicate names ("Snow King", "Mount ...") get the
// state appended, then a counter as a last resort.
const seen = new Map();
for (const r of out) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
const used = new Set(curated.map((c) => c.id));
for (const r of out) {
  let id = r.id;
  if (seen.get(id) > 1 || used.has(id)) id = `${id}-${slugify(r.state || r.region)}`;
  let n = 2;
  const stem = id;
  while (used.has(id)) id = `${stem}-${n++}`;
  used.add(id);
  r.id = id;
}

out.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(fileURLToPath(new URL("../data/ski-areas.json", import.meta.url)), JSON.stringify(out) + "\n");
console.log(`wrote ${out.length} ski areas`);
