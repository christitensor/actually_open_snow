import { NextRequest, NextResponse } from "next/server";
import { getGridDailySnowfallIn, getGridPastDailySnowfallIn, getGridRecentSnowfallIn } from "@/lib/data-sources/open-meteo";
import { badRequest, serverError } from "@/lib/util/api";

const LAST_N_HOURS = 12;
const LAST_N_DAYS = 7;

// PERS-01/quick-visual: batched today/12h/7d snowfall for an arbitrary set
// of points, in one call — same shape as MAP-10's Powder Finder grid call,
// but for FavoritesList's client-side pins (backcountry spots aren't known
// server-side the way the curated resort list is, since favorites live in
// localStorage or a signed-in user's account, not this app's own data).
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("points");
  if (!raw) return badRequest("points is required, e.g. ?points=41.2,-111.8|40.5,-111.6");

  const points = raw.split("|").map((pair) => {
    const [lat, lon] = pair.split(",").map(Number);
    return { lat, lon };
  });
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon))) {
    return badRequest("Each point must be lat,lon");
  }
  if (points.length === 0 || points.length > 50) return badRequest("points must have between 1 and 50 entries");

  try {
    const [today, last12h, last7d] = await Promise.all([
      getGridDailySnowfallIn(points),
      getGridRecentSnowfallIn(points, LAST_N_HOURS),
      getGridPastDailySnowfallIn(points, LAST_N_DAYS),
    ]);

    const results = points.map((p, i) => ({
      lat: p.lat,
      lon: p.lon,
      todayIn: today[i]?.valueIn ?? 0,
      last12hIn: last12h[i]?.valueIn ?? 0,
      last7dIn: last7d[i]?.valueIn ?? 0,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return serverError(err);
  }
}
