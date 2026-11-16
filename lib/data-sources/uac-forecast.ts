// BC-01 for Utah: the Utah Avalanche Center's full forecast, from UAC's
// own site. UAC only sends avalanche.org a stub (no elevation bands, no
// problems, no text), so without this a Utah location shows just one
// overall number.
//
// Source: https://utahavalanchecenter.org/api/forecasts — public, no key,
// the same unauthenticated JSON family as /api/observations (see
// lib/data-sources/uac-observations.ts). It's a pager with one forecast per
// page, newest first across all regions, and ignores filter params (tried
// region, limit), so we walk the first pages until the wanted region shows
// up. UAC also offers an official token-gated API
// (/forecast/<zone>/json → "request a token at /api-access"); switch to it
// if/when a token is obtained.
//
// Encodings, decoded against UAC's own rose/slider images (Nov 2026):
// - Roses are 24 comma-separated values: above treeline N,NE,E,SE,S,SW,W,NW,
//   then near treeline, then below treeline.
// - "Overall rose" values: 0 none, 2 Low, 4 Moderate, 6 Considerable,
//   8 High, 10 Extreme (only even values seen across ~40 sampled winter
//   forecasts; an odd value is rounded *up* to be conservative).
// - Problem roses ("Rose 1..3"): 16 = problem present on that aspect/band,
//   14 or 0 = not.
// - Likelihood/size are only given as slider image names, numbered top-down:
//   likelihood_01 = Certain … _05 = Unlikely; size_01 = Historic … _05 = Small.

import type { AvalancheForecast, AvalancheProblem } from "@/lib/models/types";
import { htmlToText } from "@/lib/util/html";

const FORECASTS_URL = "https://utahavalanchecenter.org/api/forecasts";
// In season UAC issues ~9 forecasts a day, so 2 days ≈ 18 pages.
const MAX_PAGES = 20;
const BATCH = 5;
const REVALIDATE_S = 1800;

const LIKELIHOOD = ["", "Certain", "Very likely", "Likely", "Possible", "Unlikely"];
const SIZE = ["", "Historic", "Very large", "Large", "Medium", "Small"];
const ASPECTS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
const BANDS = ["upper", "middle", "lower"];
const DANGER_BY_NAME: Record<string, number> = { low: 1, moderate: 2, considerable: 3, high: 4, extreme: 5 };

type RawUacForecast = Record<string, string | undefined>;

export interface UacForecast {
  region: string;
  date: string; // YYYY-MM-DD
  overall: number | null;
  rose: (number | null)[] | null;
  problems: AvalancheProblem[];
  bottomLine: string;
  warning: string | null;
  discussion: { heading: string; text: string }[];
  author: string | null;
  url: string;
}

async function fetchPage(page: number): Promise<RawUacForecast | null> {
  const res = await fetch(`${FORECASTS_URL}?page=${page}`, { next: { revalidate: REVALIDATE_S } });
  if (!res.ok) throw new Error(`UAC forecasts request failed (${res.status}) page ${page}`);
  const json = (await res.json()) as { forecasts?: { forecast: RawUacForecast }[] };
  return json.forecasts?.[0]?.forecast ?? null;
}

function parseRose(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const v = raw.split(",").map((x) => Number(x.trim()));
  return v.length === 24 && v.every(Number.isFinite) ? v : null;
}

function sliderLevel(url: string | undefined, kind: "likelihood" | "size"): number | null {
  const m = url?.match(new RegExp(`${kind}_0?(\\d)`));
  return m ? Number(m[1]) : null;
}

export function parseUacForecast(raw: RawUacForecast): UacForecast {
  const overallRose = parseRose(raw["Overall rose"]);
  const rose = overallRose
    ? overallRose.map((v) => (v >= 2 ? Math.min(5, Math.ceil(v / 2)) : null))
    : null;
  const hasRose = rose?.some((v) => v != null) ?? false;

  const problems: AvalancheProblem[] = [];
  for (let i = 1; i <= 3; i++) {
    const name = raw[`Type ${i}`]?.trim();
    if (!name) continue;
    const present = parseRose(raw[`Rose ${i}`]);
    const lk = sliderLevel(raw[`Likelihood ${i} Slider`], "likelihood");
    const sz = sliderLevel(raw[`Size ${i} Slider`], "size");
    problems.push({
      name,
      likelihood: lk ? LIKELIHOOD[lk] : null,
      size: sz ? [SIZE[sz]] : [],
      locations: present ? present.flatMap((v, idx) => (v === 16 ? [`${ASPECTS[idx % 8]} ${BANDS[Math.floor(idx / 8)]}`] : [])) : [],
      description: htmlToText(raw[`Description ${i}`]) || undefined,
    });
  }

  const discussion = (["Recent Activity", "Snow and Weather", "Additional Info", "Special Announcement", "General Announcements"] as const)
    .map((heading) => ({ heading, text: htmlToText(raw[heading]) }))
    .filter((d) => d.text);

  return {
    region: raw.Region ?? "",
    date: (raw.Date ?? "").replaceAll("/", "-"),
    overall: DANGER_BY_NAME[(raw["Overall Danger Rating"] ?? "").trim().toLowerCase()] ?? (hasRose ? Math.max(...rose!.map((v) => v ?? 0)) : null),
    rose: hasRose ? rose : null,
    problems,
    bottomLine: htmlToText(raw.Summary),
    warning: htmlToText(raw["Avalanche Warning"]) || null,
    discussion,
    author: raw["Author name"]?.trim() || null,
    url: raw.details?.trim() || "https://utahavalanchecenter.org/",
  };
}

/** Latest UAC forecast for a region ("Salt Lake", "Moab", ... — the same names avalanche.org uses for UAC zones). */
export async function getUacForecast(region: string): Promise<UacForecast | null> {
  const want = region.trim().toLowerCase();
  for (let start = 0; start < MAX_PAGES; start += BATCH) {
    const pages = await Promise.all(
      Array.from({ length: BATCH }, (_, i) => fetchPage(start + i).catch(() => null))
    );
    const hit = pages.find((f) => f?.Region?.trim().toLowerCase() === want);
    if (hit) return parseUacForecast(hit);
    if (pages.every((p) => p == null)) return null;
  }
  return null;
}

function denverDate(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Denver" }); // YYYY-MM-DD
}

/** Layer UAC's full forecast over the avalanche.org stub for a Utah zone. */
export function mergeUacForecast(base: AvalancheForecast, uac: UacForecast): AvalancheForecast {
  const bandMax = (band: number) => {
    if (!uac.rose) return null;
    const vals = uac.rose.slice(band * 8, band * 8 + 8).filter((v): v is number => v != null);
    return vals.length ? Math.max(...vals) : null;
  };
  const above = bandMax(0);
  const near = bandMax(1);
  const below = bandMax(2);
  const hasBandRatings = above != null || near != null || below != null;

  return {
    ...base,
    dangerAboveTreeline: above,
    dangerNearTreeline: near,
    dangerBelowTreeline: below,
    hasBandRatings,
    overallDanger: uac.overall ?? base.overallDanger,
    rose: uac.rose,
    problems: uac.problems,
    summary: uac.bottomLine || base.summary,
    warning: uac.warning,
    discussion: uac.discussion,
    author: uac.author,
    // Keep avalanche.org's exact publish time only when it's for the same
    // day as UAC's forecast; otherwise the card falls back to the date.
    issuedAt:
      base.issuedAt && new Date(base.issuedAt).toLocaleDateString("en-CA", { timeZone: "America/Denver" }) === uac.date ? base.issuedAt : "",
    forecastDate: uac.date || null,
    isStale: !!uac.date && uac.date < denverDate(-1),
    url: uac.url,
    source: "uac",
  };
}
