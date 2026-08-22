// BC-03: Utah Avalanche Center's public field-observations feed. This is
// a different host and a different (undocumented) endpoint than the
// avalanche.org zone/forecast API already used elsewhere in this app
// (lib/data-sources/avalanche-org.ts) — utahavalanchecenter.org's main
// site sits behind Cloudflare bot-challenge (confirmed live: every normal
// page, even /sitemap.xml, returns Cloudflare's "Attention Required"
// interstitial to a plain server-side fetch), but this specific
// `/api/observations` path is excluded from that and returns real JSON
// with no key, no auth, no special headers — found by guessing at the
// URL the site's own embeddable observations widget must be calling,
// confirmed live against real recent data. No documented pagination or
// filter query params were found (guessed `?page=`, `?region=`, `?limit=`,
// `?count=` — none changed the result); it appears to always return the
// ~20 most recent reports region-wide, so type/aspect/elevation filtering
// happens client-side instead (see components/map/SkiMap.tsx).
import type { AvalancheObservation } from "@/lib/models/types";

const OBSERVATIONS_URL = "https://utahavalanchecenter.org/api/observations";

interface RawObservation {
  title?: string;
  Date?: string;
  Region?: string;
  location_name?: string;
  observer_name?: string;
  Aspect?: string;
  Elevation?: string;
  "Slope Angle"?: string;
  Coordinates?: string;
  details?: string;
  red_flags?: string;
  "Red Flags Comments"?: string;
  "Problem Comments 1"?: string;
  "Snow Characteristics Comments"?: string;
  "Comments 1"?: string;
}

interface RawObservationsResponse {
  observations: { observation: RawObservation }[];
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

// Coordinates arrive as a GML-ish string, e.g.
// "<Point><coordinates>-111.68,40.63</coordinates></Point>" — lon,lat order.
function parseCoordinates(raw: string | undefined): { lat: number; lon: number } | null {
  if (!raw) return null;
  const m = raw.match(/<coordinates>\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*<\/coordinates>/i);
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s+/g, " ")
    .replace(/^avalanche:\s*/i, "")
    .replace(/^observation:\s*/i, "")
    .trim();
}

export async function getRecentUacObservations(): Promise<AvalancheObservation[]> {
  const res = await fetch(OBSERVATIONS_URL, { next: { revalidate: 1800 } });
  if (!res.ok) {
    throw new Error(`UAC observations request failed (${res.status})`);
  }
  const body = (await res.json()) as RawObservationsResponse;

  return body.observations.map((entry, i) => {
    const o = entry.observation;
    const coords = parseCoordinates(o.Coordinates);
    const rawTitle = (o.title ?? "").replace(/\s+/g, " ").trim();
    const type: AvalancheObservation["type"] = rawTitle.toLowerCase().startsWith("avalanche") ? "avalanche" : "observation";
    const details = [o["Comments 1"], o["Problem Comments 1"], o["Snow Characteristics Comments"], o["Red Flags Comments"]]
      .filter((s): s is string => Boolean(s))
      .map(stripHtml)
      .join(" ");

    return {
      id: o.details?.split("/").pop() || `uac-obs-${i}`,
      type,
      title: cleanTitle(rawTitle) || rawTitle || "Untitled report",
      date: o.Date ? stripHtml(o.Date) : "",
      region: o.Region ?? "",
      locationName: o.location_name ?? "",
      observerName: o.observer_name ?? null,
      aspect: o.Aspect ?? null,
      elevationFt: o.Elevation ? Number(o.Elevation) : null,
      slopeAngle: o["Slope Angle"] && o["Slope Angle"] !== "Unknown" ? o["Slope Angle"] : null,
      redFlags: o.red_flags ?? null,
      details,
      lat: coords?.lat ?? null,
      lon: coords?.lon ?? null,
      detailsUrl: o.details ?? "https://utahavalanchecenter.org/observations",
    } satisfies AvalancheObservation;
  });
}
