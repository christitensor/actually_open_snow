import { NextRequest, NextResponse } from "next/server";
import { getResortById } from "@/data/resorts";
import { discoverWebcams } from "@/lib/data-sources/webcam-discovery";
import { badRequest } from "@/lib/util/api";
import { withTimeout } from "@/lib/util/with-timeout";

// Auto-discovered webcams for a catalog ski area (data/ski-areas.json) —
// see lib/data-sources/webcam-discovery.ts. Fetched client-side by the
// resort page so a slow resort website never holds up the forecast.
//
// Cached at the CDN for 6h per resort: the camera list on a resort's
// website rarely changes, and the images themselves are fetched live by
// the browser on every refresh anyway.
const DISCOVERY_BUDGET_MS = 15000;

export async function GET(req: NextRequest) {
  const resortId = req.nextUrl.searchParams.get("resortId");
  if (!resortId) return badRequest("resortId query param is required");
  const resort = getResortById(resortId);
  if (!resort) return NextResponse.json({ error: "Unknown resort" }, { status: 404 });

  const result = await withTimeout(discoverWebcams(resort), DISCOVERY_BUDGET_MS).catch(() => null);
  return NextResponse.json(
    { resortId, pageUrl: result?.pageUrl ?? null, website: resort.website ?? null, webcams: result?.webcams ?? [] },
    {
      headers: {
        // A timeout/miss is cached briefly so a transient failure retries soon.
        "Cache-Control": result ? "public, s-maxage=21600, stale-while-revalidate=86400" : "public, s-maxage=600",
      },
    }
  );
}
