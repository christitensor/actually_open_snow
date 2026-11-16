import { NextRequest, NextResponse } from "next/server";
import { getPistesInBbox } from "@/lib/data-sources/osm";
import { badRequest } from "@/lib/util/api";
import { PISTE_TILE_ZOOM, tileBbox } from "@/lib/util/tiles";

// MAP-13: OSM piste geometry for one fixed map tile, `?tile=z/x/y`.
//
// Fixed tiles (not arbitrary viewport boxes) mean every visitor asks for
// the same URLs, so Vercel's CDN can serve them. A tile is cached for a day
// and served stale for up to a week while it refreshes, so Overpass sees
// roughly one request per tile per day. Failures are cached for only a
// minute, so a brief Overpass outage clears quickly.
// Worst case walks three Overpass instances at 12 s each.
export const maxDuration = 60;

const OK_CACHE = "public, s-maxage=86400, stale-while-revalidate=604800";
const ERROR_CACHE = "public, s-maxage=60";

export async function GET(req: NextRequest) {
  const tile = req.nextUrl.searchParams.get("tile");
  const m = tile?.match(/^(\d+)\/(\d+)\/(\d+)$/);
  if (!m) return badRequest("tile query param is required: z/x/y");
  const [z, x, y] = m.slice(1).map(Number);
  if (z !== PISTE_TILE_ZOOM || x >= 2 ** z || y >= 2 ** z) {
    return badRequest(`tile must be at zoom ${PISTE_TILE_ZOOM} and within range`);
  }

  try {
    const pistes = await getPistesInBbox(tileBbox({ z, x, y }));
    return NextResponse.json({ pistes }, { headers: { "Cache-Control": OK_CACHE } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 502, headers: { "Cache-Control": ERROR_CACHE } });
  }
}
