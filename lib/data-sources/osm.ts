// OpenStreetMap Overpass API client — free, open data, no key. Backs
// MAP-13 (piste/trail geometry), the legally clean alternative to
// scraping resort-published (copyrighted) trail map PDFs.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export interface PisteWay {
  id: number;
  difficulty: string | null; // piste:difficulty — novice/easy/intermediate/advanced/expert
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

/**
 * Fetches ski piste ways within a bounding box.
 * @param bbox [south, west, north, east] — Overpass's (lat/lon-min, lat/lon-max) order
 */
export async function getPistesInBbox(
  bbox: [number, number, number, number]
): Promise<PisteWay[]> {
  const [south, west, north, east] = bbox;
  const query = `
    [out:json][timeout:25];
    (
      way["piste:type"]["piste:difficulty"](${south},${west},${north},${east});
    );
    out geom;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    // Overpass's server 406s requests that don't send an explicit
    // Accept/User-Agent (confirmed live during this build — Node's fetch
    // defaults get rejected where curl's don't).
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "*/*",
      "User-Agent": "actually-open-snow (github.com/christitensor/actually_open_snow)",
    },
    body: `data=${encodeURIComponent(query)}`,
    next: { revalidate: 86400 }, // piste geometry changes rarely — cache a full day
  });

  if (!res.ok) {
    throw new Error(`Overpass request failed (${res.status})`);
  }

  const raw = (await res.json()) as OverpassResponse;

  return raw.elements
    .filter((el) => el.geometry && el.geometry.length > 0)
    .map((el) => ({
      id: el.id,
      difficulty: el.tags?.["piste:difficulty"] ?? null,
      name: el.tags?.name ?? null,
      coordinates: (el.geometry ?? []).map((g) => [g.lon, g.lat] as [number, number]),
    }));
}
