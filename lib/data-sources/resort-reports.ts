// Resorts' own published snow reports — the ski patrol's measured
// overnight/24h new snow, the number skiers actually trust. There's no
// free shared feed (SnoCountry etc. need a commercial key), so each
// resort is a small per-site parser. Only resorts whose report page is
// server-rendered and fetchable are listed; confirmed live (Oct 2026):
//
// - Snowbasin: snowbasin.com's mountain report renders "0” | Overnight |
//   0” | 24 hours | … | Last Updated: Apr 27 10:00 AM MT" as plain HTML.
// - Beaver Mountain: NOT parseable — skithebeav.com answers every
//   non-browser request with a SiteGround captcha redirect (HTTP 202),
//   so it falls back to SNOTEL in lib/derive/measured-overnight.ts.

export interface ResortSnowReport {
  overnightIn: number;
  twentyFourHourIn: number | null;
  /** When the resort last updated the report, as an ISO string (Mountain Time interpreted). */
  updatedAt: string;
  /** "YYYY-MM-DD" in America/Denver of updatedAt — compare to today's to judge freshness. */
  updatedLocalDate: string;
  sourceUrl: string;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function toText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " | ")
    .replace(/&#8221;|&rdquo;|”|&quot;|"/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(\|\s*)+/g, "| ");
}

/** "Apr 27 10:00 AM" (Mountain Time, no year) → local date + approximate ISO timestamp. */
function parseMountainTimestamp(month: string, day: string, hour: string, minute: string, ampm: string, now: Date) {
  const m = MONTHS[month.slice(0, 3).toLowerCase()];
  if (!m) return null;
  let h = Number(hour) % 12;
  if (ampm.toUpperCase() === "PM") h += 12;
  const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(now); // YYYY-MM-DD
  let year = Number(todayLocal.slice(0, 4));
  // No year on the page: a December stamp read in January is last year's.
  if (m > Number(todayLocal.slice(5, 7)) + 1) year -= 1;
  const localDate = `${year}-${String(m).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  // Mountain Time offset is -7 (MST) or -6 (MDT); -7 is close enough for a
  // display timestamp — freshness is judged by localDate, not this.
  const iso = new Date(`${localDate}T${String(h).padStart(2, "0")}:${minute}:00-07:00`).toISOString();
  return { localDate, iso };
}

async function fetchSnowbasin(now: Date): Promise<ResortSnowReport> {
  const sourceUrl = "https://www.snowbasin.com/the-mountain/mountain-report/";
  const res = await fetch(sourceUrl, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (compatible; ActuallyOpenSnow/1.0)" } });
  if (!res.ok) throw new Error(`Snowbasin report request failed (${res.status})`);
  const text = toText(await res.text());

  // Values come BEFORE their labels on this page: `6" | Overnight`.
  const overnight = text.match(/(\d+(?:\.\d+)?)\s*"\s*\|\s*Overnight\b/i);
  const day = text.match(/(\d+(?:\.\d+)?)\s*"\s*\|\s*24 hours\b/i);
  const updated = text.match(/Last Updated:?\s*([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!overnight || !updated) throw new Error("Snowbasin report page format changed — couldn't find Overnight / Last Updated");

  const stamp = parseMountainTimestamp(updated[1], updated[2], updated[3], updated[4], updated[5], now);
  if (!stamp) throw new Error("Couldn't parse Snowbasin's Last Updated time");
  return {
    overnightIn: Number(overnight[1]),
    twentyFourHourIn: day ? Number(day[1]) : null,
    updatedAt: stamp.iso,
    updatedLocalDate: stamp.localDate,
    sourceUrl,
  };
}

const PARSERS: Record<string, (now: Date) => Promise<ResortSnowReport>> = {
  snowbasin: fetchSnowbasin,
};

export function hasResortReport(resortId: string): boolean {
  return resortId in PARSERS;
}

export async function getResortSnowReport(resortId: string, now = new Date()): Promise<ResortSnowReport | null> {
  const parser = PARSERS[resortId];
  return parser ? parser(now) : null;
}
