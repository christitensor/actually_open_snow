// NOAA NOHRSC National Snow Analysis — modeled snowpack (depth + SWE) on a
// 1 km grid for the lower 48, with ground/airborne/satellite observations
// (SNOTEL included) assimilated daily. Free, keyless ArcGIS MapServer;
// updates ~4x/day (01/05/11/17Z). Unlike SNOTEL's point readings, this
// covers every slope and elevation, which is what the map layer is for.
//
// Confirmed live (Nov 2026): layer 0 = Snow Depth (raster sublayer 3,
// pixel value in METERS), layer 4 = SWE (raster sublayer 7, MILLIMETERS),
// footprint sublayers 2/6 carry `idp_validtime`. Export responses are sent
// with max-age=0, so tiles go through /api/snowpack/tile for CDN caching.

const BASE = "https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer";

/** Lower-48 extent of the analysis; tiles outside it are skipped client-side. */
export const NOHRSC_BOUNDS: [number, number, number, number] = [-125, 24, -66, 50];

/** NOAA's own depth classes (inches) and colors, for the map legend. */
export const SNOW_DEPTH_LEGEND: { label: string; color: string }[] = [
  { label: '<2"', color: "#abc1bf" },
  { label: '2–4"', color: "#66c1c4" },
  { label: '4–10"', color: "#63a9cb" },
  { label: '10–20"', color: "#5079c8" },
  { label: '20–39"', color: "#3c3fc2" },
  { label: '39–59"', color: "#5720c3" },
  { label: '59–98"', color: "#7d01bb" },
  { label: '98–197"', color: "#b404b1" },
  { label: '197"+', color: "#a91377" },
];

/** Web-Mercator (EPSG:3857) bounding box of an XYZ tile. */
function tileBbox3857(z: number, x: number, y: number): [number, number, number, number] {
  const size = (2 * Math.PI * 6378137) / 2 ** z;
  const origin = Math.PI * 6378137;
  return [x * size - origin, origin - (y + 1) * size, (x + 1) * size - origin, origin - y * size];
}

export function isValidTile(z: number, x: number, y: number): boolean {
  return [z, x, y].every(Number.isInteger) && z >= 0 && z <= 14 && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;
}

/** One 256px transparent PNG tile of snow depth, rendered by NOAA in its own color scheme. */
export async function fetchSnowDepthTile(z: number, x: number, y: number): Promise<ArrayBuffer> {
  const bbox = tileBbox3857(z, x, y).join(",");
  const url =
    `${BASE}/export?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=256,256` +
    `&format=png32&transparent=true&layers=show:0&f=image`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
    throw new Error(`NOHRSC tile request failed (${res.status})`);
  }
  return res.arrayBuffer();
}

export interface SnowpackAtPoint {
  /** Modeled snow depth in inches; 0 where the analysis has no snow. null outside coverage. */
  depthIn: number | null;
  /** Modeled snow water equivalent in inches. */
  sweIn: number | null;
  /** ISO time the analysis is valid for. */
  validTime: string | null;
}

/** Snow depth + SWE for the 1 km cell containing a point. */
export async function getSnowpackAtPoint(lat: number, lon: number): Promise<SnowpackAtPoint> {
  const d = 0.05;
  const url =
    `${BASE}/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326` +
    `&layers=all:2,3,7&tolerance=0&mapExtent=${lon - d},${lat - d},${lon + d},${lat + d}` +
    `&imageDisplay=100,100,96&returnGeometry=false&f=json`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) throw new Error(`NOHRSC identify request failed (${res.status})`);
  const raw = (await res.json()) as { results?: { layerId: number; attributes: Record<string, string> }[] };
  const byLayer = new Map((raw.results ?? []).map((r) => [r.layerId, r.attributes]));

  // "NoData" (or a missing result) means outside the grid; a 0 pixel is real bare ground.
  const pixel = (layerId: number) => {
    const v = Number(byLayer.get(layerId)?.["Service Pixel Value"]);
    return Number.isFinite(v) && v >= 0 ? v : null;
  };
  const depthM = pixel(3);
  const sweMm = pixel(7);
  // "11/22/2026 12:00:00 PM", in UTC.
  const vt = byLayer.get(2)?.idp_validtime;
  const parsed = vt ? new Date(`${vt} UTC`) : null;
  return {
    depthIn: depthM == null ? null : Math.round(depthM * 39.3701),
    sweIn: sweMm == null ? null : Math.round((sweMm / 25.4) * 10) / 10,
    validTime: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
  };
}
