import { NextRequest, NextResponse } from "next/server";
import { fetchSnowDepthTile, isValidTile } from "@/lib/data-sources/nohrsc";

// Snowpack map layer: proxies NOAA NOHRSC snow-depth tiles so Vercel's CDN
// can cache them (NOAA sends max-age=0). The analysis updates ~every 6h,
// so an hour of freshness plus long stale-while-revalidate is plenty.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ z: string; x: string; y: string }> }) {
  const p = await params;
  const z = Number(p.z);
  const x = Number(p.x);
  const y = Number(p.y.replace(/\.png$/, ""));
  if (!isValidTile(z, x, y)) return NextResponse.json({ error: "Invalid tile" }, { status: 400 });

  try {
    const png = await fetchSnowDepthTile(z, x, y);
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=1800, s-maxage=3600, stale-while-revalidate=21600",
      },
    });
  } catch {
    // MapLibre just leaves the tile blank on an error.
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
