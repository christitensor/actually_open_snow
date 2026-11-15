import { NextRequest, NextResponse } from "next/server";
import { getAvalancheForecast, getZoneMapLayer } from "@/lib/data-sources/avalanche-org";
import { toZone } from "@/lib/derive/avalanche-zone-lookup";
import { serverError } from "@/lib/util/api";

// BC-01: today's avalanche forecast for a zone. avalanche.org's forecast
// query needs the center code too, so resolve the zone from the (cached)
// map layer first.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  try {
    const layer = await getZoneMapLayer();
    const feature = layer.features.find((f) => String(f.id) === zoneId);
    if (!feature) return NextResponse.json({ error: `Unknown avalanche zone ${zoneId}` }, { status: 404 });
    const forecast = await getAvalancheForecast(toZone(feature));
    return NextResponse.json(forecast);
  } catch (err) {
    return serverError(err);
  }
}
