// Builds the static ski run + lift tiles in public/ski/ from OpenSkiData
// (https://openskidata.org): a free, worldwide dataset of runs and lifts,
// rebuilt daily from OpenStreetMap. Its terms: "free to use, including
// commercially", ODbL, with the attribution in ATTRIBUTION below.
//
// Why static files: the live alternative (Overpass, app/api/pistes) is a
// shared public service that's often slow or rate-limiting. Runs and
// lifts change a few times a season, so a periodic extract served from our
// own CDN is faster and can't go down with someone else's server.
//
// Coverage: every curated resort in data/resorts.json plus a margin of
// TILE_MARGIN z10 tiles around it. The map falls back to the live
// Overpass route for tiles outside that area.
//
// Usage: node scripts/build-ski-data.mjs   (downloads ~290 MB, streamed;
// takes a minute or two). Commit the output. Re-run every so often, e.g.
// at the start of a season.

import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public", "ski");
const Z = 10; // must match PISTE_TILE_ZOOM in lib/util/tiles.ts
const TILE_MARGIN = 1;
const SOURCES = {
  runs: "https://tiles.openskimap.org/geojson/runs.geojson",
  lifts: "https://tiles.openskimap.org/geojson/lifts.geojson",
};
const ATTRIBUTION =
  "Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn";

const lonToX = (lon) => Math.floor(((lon + 180) / 360) * 2 ** Z);
const latToY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z);
};
const round5 = (n) => Math.round(n * 1e5) / 1e5;

// Tiles to cover.
const resorts = JSON.parse(readFileSync(join(root, "data", "resorts.json"), "utf8"));
const wanted = new Set();
for (const r of resorts) {
  const x = lonToX(r.lon);
  const y = latToY(r.lat);
  for (let dx = -TILE_MARGIN; dx <= TILE_MARGIN; dx++)
    for (let dy = -TILE_MARGIN; dy <= TILE_MARGIN; dy++) wanted.add(`${x + dx}/${y + dy}`);
}

/** @type {Map<string, {runs: object[], lifts: object[]}>} */
const tiles = new Map([...wanted].map((k) => [k, { runs: [], lifts: [] }]));

// [lon, lat, ele?] → [lon, lat] rounded to ~1 m, consecutive duplicates dropped.
function cleanLine(coords) {
  const out = [];
  for (const c of coords) {
    const p = [round5(c[0]), round5(c[1])];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  return out;
}

// Lines only: LineString / MultiLineString as-is, polygons (area runs) as their outer ring.
function toLines(geometry) {
  switch (geometry?.type) {
    case "LineString":
      return [geometry.coordinates];
    case "MultiLineString":
      return geometry.coordinates;
    case "Polygon":
      return [geometry.coordinates[0]];
    case "MultiPolygon":
      return geometry.coordinates.map((p) => p[0]);
    default:
      return [];
  }
}

function tilesTouched(lines) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const line of lines)
    for (const [lon, lat] of line) {
      const x = lonToX(lon);
      const y = latToY(lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  const keys = [];
  for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) if (wanted.has(`${x}/${y}`)) keys.push(`${x}/${y}`);
  return keys;
}

async function stream(kind, url) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} → ${res.status}`);
  const rl = createInterface({ input: Readable.fromWeb(res.body), crlfDelay: Infinity });
  let seen = 0, kept = 0;
  for await (let line of rl) {
    line = line.trim().replace(/,$/, "");
    if (!line.startsWith('{"type":"Feature"')) continue;
    seen++;
    const f = JSON.parse(line);
    const p = f.properties ?? {};
    if (p.status && p.status !== "operating") continue;
    const lines = toLines(f.geometry).map(cleanLine).filter((l) => l.length > 1);
    if (lines.length === 0) continue;
    const keys = tilesTouched(lines);
    if (keys.length === 0) continue;
    const item =
      kind === "runs"
        ? { id: p.id, name: p.name ?? null, difficulty: p.difficulty ?? null, uses: p.uses ?? [], lines }
        : { id: p.id, name: p.name ?? null, liftType: p.liftType ?? null, lines };
    for (const k of keys) tiles.get(k)[kind].push(item);
    kept++;
  }
  console.log(`${kind}: ${seen.toLocaleString()} worldwide, ${kept} in coverage`);
}

await stream("runs", SOURCES.runs);
await stream("lifts", SOURCES.lifts);

rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
const covered = [];
for (const [k, data] of tiles) {
  const [x, y] = k.split("/");
  mkdirSync(join(OUT, String(Z), x), { recursive: true });
  const body = JSON.stringify(data);
  writeFileSync(join(OUT, String(Z), x, `${y}.json`), body);
  bytes += body.length;
  covered.push(`${Z}/${k}`);
}
writeFileSync(
  join(OUT, "index.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), source: "https://openskidata.org", attribution: ATTRIBUTION, zoom: Z, tiles: covered.sort() }, null, 1)
);
console.log(`${covered.length} tiles, ${(bytes / 1024).toFixed(0)} KB → public/ski/`);
