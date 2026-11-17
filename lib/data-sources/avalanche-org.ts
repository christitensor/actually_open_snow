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
// - Early/late season most centers publish a "summary" product (general
//   conditions, no danger ratings) and the forecast query returns that.
//   Its substance is in `hazard_discussion` (often 2-4k chars), with field
//   photos/videos in `media` — both were being dropped (Nov 2026 survey of
//   every zone our resorts sit in: BTAC, CAIC, ESAC, GNFAC, IPAC, KPAC,
//   PAC, SAC, SNFAC, TAC, UAC, WAC, WCMAC).
// - A product can be months old (WAC's Elkhorns: last April; UAC
//   Southwest: last February) and still be what the query returns, so
//   staleness comes from `expires_time`.
// Terms of use for production reliance still haven't been re-checked, per
// the existing caveat on BC-01 in TRACE_MATRIX.md.

import type { AvalancheForecast, AvalancheMedia, AvalancheProblem, AvalancheZone } from "@/lib/models/types";
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
    discussion?: string | null;
    problem_description?: string | null;
  }[];
  forecast_zone?: { id?: number; name?: string }[];
  bottom_line?: string | null;
  hazard_discussion?: string | null;
  weather_discussion?: string | null;
  announcement?: string | null;
  author?: string | null;
  product_type?: string | null;
  status?: string | null;
  media?: {
    type?: string;
    title?: string | null;
    caption?: string | null;
    url?: { thumbnail?: string; medium?: string; large?: string; original?: string; video_id?: string };
  }[] | null;
  published_time?: string | null;
  expires_time?: string | null;
}

/** Hours past `expires_time` before a product counts as stale — centers often post the next one a little late. */
const STALE_GRACE_H = 12;

function toMedia(raw: AvalancheProductResponse["media"]): AvalancheMedia[] {
  return (raw ?? []).flatMap((m): AvalancheMedia[] => {
    const thumb = m.url?.medium ?? m.url?.thumbnail ?? m.url?.large;
    if (!thumb) return [];
    if (m.type === "video") {
      if (!m.url?.video_id) return [];
      const caption = htmlToText(m.caption) || htmlToText(m.title);
      return [{ type: "video", thumbnailUrl: thumb, href: `https://www.youtube.com/watch?v=${encodeURIComponent(m.url.video_id)}`, caption }];
    }
    if (m.type !== "image") return [];
    return [{ type: "image", thumbnailUrl: thumb, href: m.url?.large ?? m.url?.original ?? thumb, caption: htmlToText(m.caption) || htmlToText(m.title) }];
  });
}

/**
 * Name for the area a forecast covers. Most centers: one zone, its name.
 * CAIC merges every zone that shares today's forecast into one map-layer
 * polygon ("CAIC zone") and lists them all in `forecast_zone` — the
 * feature id is just one of them, so naming the forecast after it put
 * Telluride in "La Plata Mountains". Name the ranges instead, most-listed
 * first. Only for such generic map names (see the caller).
 */
function forecastAreaName(zones: { name?: string }[]): string | null {
  const counts = new Map<string, number>();
  for (const z of zones) if (z.name) counts.set(z.name, (counts.get(z.name) ?? 0) + 1);
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (names.length === 0) return null;
  if (names.length <= 3) return names.join(" · ");
  return `${names.slice(0, 3).join(" · ")} +${names.length - 3} more`;
}

/** Map-layer warning → text, when the layer embeds the warning product (no live warning was available to verify the shape — Nov 2026). */
function warningText(zone: AvalancheZone): string | null {
  if (!zone.warning) return null;
  const p = zone.warning as { bottom_line?: string | null; hazard_discussion?: string | null };
  return htmlToText(p.bottom_line) || htmlToText(p.hazard_discussion) || `${zone.centerName} has an avalanche warning in effect for this zone.`;
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
    .map((p) => ({
      name: p.name!,
      likelihood: p.likelihood ?? null,
      size: p.size ?? [],
      locations: p.location ?? [],
      description: htmlToText(p.discussion) || undefined,
      about: htmlToText(p.problem_description) || undefined,
    }));

  const bottomLine = htmlToText(raw.bottom_line);
  const hazard = htmlToText(raw.hazard_discussion);
  // The bottom line is the headline; the hazard discussion is the detail
  // (when there's no bottom line, the discussion becomes the headline).
  const discussion = [
    { heading: "Announcement", text: htmlToText(raw.announcement) },
    { heading: raw.product_type === "summary" ? "Conditions" : "Avalanche discussion", text: bottomLine ? hazard : "" },
    { heading: "Weather", text: htmlToText(raw.weather_discussion) },
  ].filter((d) => d.text);

  const expires = raw.expires_time ? new Date(raw.expires_time).getTime() : NaN;
  const isStale = Number.isFinite(expires) && Date.now() - expires > STALE_GRACE_H * 3600_000;
  const forecastDate = raw.published_time
    ? new Date(raw.published_time).toLocaleDateString("en-CA", { timeZone: zone.timezone ?? "America/Denver" })
    : null;

  const base: AvalancheForecast = {
    zoneId: zone.zoneId,
    // Other centers also list several zones on one shared product, but their
    // map polygons are real single zones — keep that zone's own name.
    zoneName: /\bzone$/i.test(zone.zoneName)
      ? forecastAreaName(raw.forecast_zone ?? [])
      : (raw.forecast_zone?.find((z) => String(z.id) === zone.zoneId)?.name ?? zone.zoneName),
    dangerAboveTreeline: above,
    dangerNearTreeline: near,
    dangerBelowTreeline: below,
    overallDanger: bandMax ?? zone.overallDanger,
    hasBandRatings,
    tomorrow: tomorrow ? { above: level(tomorrow.upper), near: level(tomorrow.middle), below: level(tomorrow.lower) } : null,
    problems,
    summary: bottomLine || hazard || zone.travelAdvice || "",
    issuedAt: raw.published_time ?? "",
    expiresAt: raw.expires_time ?? "",
    url: zone.link ?? `https://avalanche.org/forecasts/${zone.zoneId}`,
    rose: null,
    warning: warningText(zone),
    discussion,
    author: raw.author?.trim() || null,
    productType: raw.product_type === "forecast" || raw.product_type === "summary" ? raw.product_type : null,
    media: toMedia(raw.media),
    forecastDate,
    isStale,
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
