import { NextResponse } from "next/server";
import { resorts, skiAreas } from "@/data/resorts";

// Slim list of every searchable ski area (curated + catalog) for the map
// search box. Served as a static file rather than bundled into the client
// so the ~750-entry list only downloads when someone actually searches.
export const dynamic = "force-static";

export function GET() {
  const all = [...resorts, ...skiAreas].map((r) => ({
    id: r.id,
    name: r.name,
    region: r.state ?? r.region,
    lat: r.lat,
    lon: r.lon,
    curated: r.curated === true,
  }));
  return NextResponse.json(all, { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}
