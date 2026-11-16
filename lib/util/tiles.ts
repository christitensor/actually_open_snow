// Web-Mercator (slippy map) tile math, used to request map data in fixed
// grid squares instead of arbitrary viewport boxes, so identical squares
// share one CDN cache entry across all users.

/** Ski runs are fetched as z10 tiles (~30 x 20 km in the Rockies): small enough to cache, big enough that a typical view needs only a few. */
export const PISTE_TILE_ZOOM = 10;
/** Don't fetch runs when zoomed out further than this; they're specks anyway. */
export const PISTE_MIN_VIEW_ZOOM = 10;
/** Guard against huge fetches if the map is very wide. */
export const PISTE_MAX_TILES_PER_VIEW = 12;

export interface Tile {
  z: number;
  x: number;
  y: number;
}

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** [south, west, north, east] of a tile. */
export function tileBbox({ z, x, y }: Tile): [number, number, number, number] {
  const n = 2 ** z;
  const lon = (tx: number) => (tx / n) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  return [lat(y + 1), lon(x), lat(y), lon(x + 1)];
}

/** Tiles at zoom z covering a [south, west, north, east] box. */
export function tilesForBbox([south, west, north, east]: [number, number, number, number], z: number): Tile[] {
  const x0 = lonToTileX(west, z);
  const x1 = lonToTileX(east, z);
  const y0 = latToTileY(north, z);
  const y1 = latToTileY(south, z);
  const out: Tile[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  return out;
}
