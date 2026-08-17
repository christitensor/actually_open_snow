// avalanche.org public API client — unofficial but widely used by
// third-party apps (US + parts of Canada). Backs BC-01/BC-02.
//
// Field names below were confirmed against a live request during this
// build session (Aug 2026) — see the zone lookup's use of the *top-level*
// GeoJSON Feature `id` (not `properties.id`, which doesn't exist) and
// `properties.center` (full name; `center_id` is the short code, e.g.
// "UAC"). Terms of use for production reliance still haven't been
// re-checked, per the existing caveat on BC-01 in TRACE_MATRIX.md.

import type { AvalancheForecast } from "@/lib/models/types";

const MAP_LAYER_URL = "https://api.avalanche.org/v2/public/products/map-layer";
const PRODUCT_URL = "https://api.avalanche.org/v2/public/product";

export interface AvalancheZoneFeature {
  type: "Feature";
  id: number; // the zone id used by /product/{id} — lives at the Feature's top level, not in properties
  properties: {
    name: string;
    center: string;
    center_id: string;
    danger_level: number;
    warning?: { product: unknown } | null;
  };
  geometry: GeoJSON.Geometry;
}

export interface AvalancheZoneMapLayer {
  type: "FeatureCollection";
  features: AvalancheZoneFeature[];
}

/** BC-02 input: all forecast zone polygons + current danger level, one call. */
export async function getZoneMapLayer(): Promise<AvalancheZoneMapLayer> {
  const res = await fetch(MAP_LAYER_URL, { next: { revalidate: 1800 } });
  if (!res.ok) {
    throw new Error(`avalanche.org map-layer request failed (${res.status})`);
  }
  return res.json() as Promise<AvalancheZoneMapLayer>;
}

// Confirmed live (Aug 2026): avalanche_center, forecast_zone, danger,
// published_time, expires_time, bottom_line/hazard_discussion all exist
// as top-level keys. Every US center is off-season in August, so
// `danger`/`avalanche_center`/`forecast_zone` all came back empty in
// every live check made during this build — the *populated*, in-season
// shape of `danger[]` (upper/middle/lower band field names below) is
// still an educated guess from public write-ups, not a verified live
// response. Re-check once the season starts and a zone actually has an
// active forecast.
interface AvalancheProductResponse {
  danger?: {
    upper?: number;
    middle?: number;
    lower?: number;
  }[];
  bottom_line?: string;
  hazard_discussion?: string;
  published_time?: string;
  expires_time?: string;
}

/** BC-01: full forecast (danger by elevation band + discussion) for a zone. */
export async function getAvalancheForecast(zoneId: string | number): Promise<AvalancheForecast> {
  const res = await fetch(`${PRODUCT_URL}/${zoneId}`, { next: { revalidate: 1800 } });
  if (!res.ok) {
    throw new Error(`avalanche.org product request failed (${res.status}) for zone ${zoneId}`);
  }
  const raw = (await res.json()) as AvalancheProductResponse;
  const latestDanger = raw.danger?.[0];

  return {
    zoneId: String(zoneId),
    dangerAboveTreeline: latestDanger?.upper ?? null,
    dangerNearTreeline: latestDanger?.middle ?? null,
    dangerBelowTreeline: latestDanger?.lower ?? null,
    summary: raw.bottom_line ?? raw.hazard_discussion ?? "",
    issuedAt: raw.published_time ?? "",
    expiresAt: raw.expires_time ?? "",
    url: `https://avalanche.org/forecasts/${zoneId}`,
  };
}
