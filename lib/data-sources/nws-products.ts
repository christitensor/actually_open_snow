// NWS text products client — Area Forecast Discussion (AFD), the
// forecaster-written plain-language product SNOW-03 corroborates against.
// Same api.weather.gov host as nws.ts, different sub-API (text products,
// not gridded data).
//
// NOTE: the exact product-listing shape below matches api.weather.gov's
// documented /products endpoints, but hasn't been hit with a live request
// in this build session — verify the location-id format (3-letter WFO,
// e.g. "SLC"/"PIH") against a real response before shipping.

import type { AfdProduct } from "@/lib/models/types";

const BASE = "https://api.weather.gov";
const USER_AGENT = "actually-open-snow (github.com/christitensor/actually_open_snow)";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/ld+json" },
    next: { revalidate: 3600 }, // AFDs are issued a few times/day, not worth polling often
  });
  if (!res.ok) {
    throw new Error(`NWS products request failed (${res.status}): ${url}`);
  }
  return res.json() as Promise<T>;
}

interface ProductListResponse {
  "@graph": { id: string; issuanceTime: string }[];
}

interface ProductResponse {
  issuingOffice: string;
  issuanceTime: string;
  productText: string;
}

/** SNOW-03 input: the most recent Area Forecast Discussion for a WFO office. */
export async function getLatestAfd(wfo: string): Promise<AfdProduct | null> {
  const listUrl = `${BASE}/products/types/AFD/locations/${wfo}`;
  const list = await fetchJson<ProductListResponse>(listUrl);
  const latest = list["@graph"]?.[0];
  if (!latest) return null;

  const product = await fetchJson<ProductResponse>(`${BASE}/products/${latest.id}`);
  return {
    wfo,
    issuedAt: product.issuanceTime,
    text: product.productText,
  };
}

/** Cheap heuristic for SNOW-03's corroboration flag — looks for forecaster hedge language. */
export function afdMentionsUncertainty(afdText: string): boolean {
  const hedgeWords = [
    "uncertain",
    "uncertainty",
    "low confidence",
    "differ",
    "disagreement",
    "spread",
    "questionable",
    "conflicting",
  ];
  const lower = afdText.toLowerCase();
  return hedgeWords.some((w) => lower.includes(w));
}
