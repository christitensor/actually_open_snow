// avalanche.org public API client — unofficial but widely used by
// third-party apps (US + parts of Canada). Backs BC-01/BC-02.
//
// Verified live against in-season data (Nov 2026):
// - Zone id is the map-layer GeoJSON Feature's top-level `id`;
//   `properties.center_id` is the short code ("UAC", "CAIC").
// - The forecast lives at /product?type=forecast&center_id=X&zone_id=Y.
//   The old /product/{zoneId} path takes a *product* id, so passing a zone
//   id returned an all-empty shell even for zones with a live forecast.
// - `danger[]` is [{upper, middle, lower, valid_day: "current"|"tomorrow"}].
// - Some centers (UAC is the big one) publish only a stub to avalanche.org
//   — status "published" but no danger bands and no text — and expose
//   their rating solely through the map layer's `danger_level`. For those
//   we fall back to that overall rating and link to the center's own page.
// Terms of use for production reliance still haven't been re-checked, per
// the existing caveat on BC-01 in TRACE_MATRIX.md.

import type { AvalancheForecast, AvalancheProblem, AvalancheZone } from "@/lib/models/types";
import { htmlToText } from "@/lib/util/html";
import { getUacForecast, mergeUacForecast } from "@/lib/data-sources/uac-forecast";

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
    link?: string;
    off_season?: boolean;
    travel_advice?: string;
    timezone?: string;
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

interface AvalancheProductResponse {
  danger?: {
    upper?: number | null;
    middle?: number | null;
    lower?: number | null;
    valid_day?: string;
  }[];
  forecast_avalanche_problems?: {
    name?: string;
    rank?: number;
    likelihood?: string | null;
    size?: string[] | null;
    location?: string[] | null;
  }[];
  forecast_zone?: { id?: number; name?: string }[];
  bottom_line?: string | null;
  hazard_discussion?: string | null;
  published_time?: string | null;
  expires_time?: string | null;
}

const level = (x: number | null | undefined) => (x != null && x >= 1 && x <= 5 ? x : null);

/** BC-01: today's forecast for a zone — danger by elevation band where the center publishes it, the map layer's overall rating otherwise. */
export async function getAvalancheForecast(zone: AvalancheZone): Promise<AvalancheForecast> {
  const url = `${PRODUCT_URL}?type=forecast&center_id=${encodeURIComponent(zone.centerId)}&zone_id=${encodeURIComponent(zone.zoneId)}`;
  const res = await fetch(url, { next: { revalidate: 1800 } });
  if (!res.ok) {
    throw new Error(`avalanche.org product request failed (${res.status}) for ${zone.centerId} zone ${zone.zoneId}`);
  }
  const raw = (await res.json()) as AvalancheProductResponse;
  const current = raw.danger?.find((d) => d.valid_day === "current") ?? raw.danger?.[0];
  const tomorrow = raw.danger?.find((d) => d.valid_day === "tomorrow");

  const above = level(current?.upper);
  const near = level(current?.middle);
  const below = level(current?.lower);
  const hasBandRatings = above != null || near != null || below != null;
  const bandMax = hasBandRatings ? Math.max(above ?? 0, near ?? 0, below ?? 0) : null;

  const problems: AvalancheProblem[] = (raw.forecast_avalanche_problems ?? [])
    .slice()
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .filter((p) => p.name)
    .map((p) => ({ name: p.name!, likelihood: p.likelihood ?? null, size: p.size ?? [], locations: p.location ?? [] }));

  const base: AvalancheForecast = {
    zoneId: zone.zoneId,
    zoneName: raw.forecast_zone?.find((z) => String(z.id) === zone.zoneId)?.name ?? null,
    dangerAboveTreeline: above,
    dangerNearTreeline: near,
    dangerBelowTreeline: below,
    overallDanger: bandMax ?? zone.overallDanger,
    hasBandRatings,
    tomorrow: tomorrow ? { above: level(tomorrow.upper), near: level(tomorrow.middle), below: level(tomorrow.lower) } : null,
    problems,
    summary: htmlToText(raw.bottom_line) || htmlToText(raw.hazard_discussion) || zone.travelAdvice || "",
    issuedAt: raw.published_time ?? "",
    expiresAt: raw.expires_time ?? "",
    url: zone.link ?? `https://avalanche.org/forecasts/${zone.zoneId}`,
    rose: null,
    warning: null,
    discussion: [],
    author: null,
    forecastDate: null,
    isStale: false,
    source: "avalanche.org",
  };

  // UAC only sends avalanche.org a stub — pull the full forecast from UAC
  // itself. A UAC failure just leaves the avalanche.org version in place.
  if (zone.centerId === "UAC") {
    const uac = await getUacForecast(zone.zoneName).catch(() => null);
    if (uac) return mergeUacForecast(base, uac);
  }
  return base;
}
