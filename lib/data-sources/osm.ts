// OpenStreetMap Overpass API client — free, open data, no key. Backs
// MAP-13 (piste/trail geometry), the legally clean alternative to
// scraping resort-published (copyrighted) trail map PDFs.
//
// Overpass is a shared, donated service with rate limits, so this is
// built to ask it as little as possible:
// - Callers request fixed z10 map tiles (see app/api/pistes/route.ts), so
//   every visitor shares the same few queries and the CDN caches the
//   result for a day.
// - Coordinates are rounded to ~1 m and consecutive duplicates dropped,
//   which keeps a tile's response small enough to cache. The old
//   viewport-sized queries returned up to 6.8 MB, above Vercel's 2 MB
//   data-cache limit, so nothing was ever cached.
// - If the main instance is down or rate-limiting, it falls back to other
//   public instances listed on the OSM wiki.

const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const PER_INSTANCE_TIMEOUT_MS = 12_000;

export interface PisteWay {
  id: number;
  difficulty: string | null; // piste:difficulty — novice/easy/intermediate/advanced/expert/freeride
  name: string | null;
  coordinates: [number, number][]; // [lon, lat] pairs
}

interface OverpassElement {
  type: "way";
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1.1 m

async function queryOverpass(query: string): Promise<OverpassResponse> {
  const errors: string[] = [];
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        // Overpass's server 406s requests that don't send an explicit
        // Accept/User-Agent (Node's fetch defaults get rejected where curl's don't).
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "*/*",
          "User-Agent": "actually-open-snow (github.com/christitensor/actually_open_snow)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(PER_INSTANCE_TIMEOUT_MS),
        next: { revalidate: 86400 }, // piste geometry changes rarely
      });
      if (!res.ok) {
        errors.push(`${new URL(url).host} ${res.status}`);
        continue;
      }
      return (await res.json()) as OverpassResponse;
    } catch (err) {
      errors.push(`${new URL(url).host} ${err instanceof Error ? err.name : "error"}`);
    }
  }
  throw new Error(`All Overpass instances failed: ${errors.join(", ")}`);
}

/**
 * Fetches ski piste ways within a bounding box.
 * @param bbox [south, west, north, east] — Overpass's (lat/lon-min, lat/lon-max) order
 */
export async function getPistesInBbox(bbox: [number, number, number, number]): Promise<PisteWay[]> {
  const [south, west, north, east] = bbox.map(round5);
  const query = `
    [out:json][timeout:25];
    (
      way["piste:type"]["piste:difficulty"](${south},${west},${north},${east});
    );
    out geom;
  `;
  const raw = await queryOverpass(query);

  return raw.elements
    .filter((el) => el.geometry && el.geometry.length > 1)
    .map((el) => {
      const coords: [number, number][] = [];
      for (const g of el.geometry!) {
        const pt: [number, number] = [round5(g.lon), round5(g.lat)];
        const prev = coords[coords.length - 1];
        if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) coords.push(pt);
      }
      return {
        id: el.id,
        difficulty: el.tags?.["piste:difficulty"] ?? null,
        name: el.tags?.name ?? null,
        coordinates: coords,
      };
    })
    .filter((p) => p.coordinates.length > 1);
}
