import { NextRequest, NextResponse } from "next/server";
import { getZoneMapLayer } from "@/lib/data-sources/avalanche-org";
import { findZoneForPoint } from "@/lib/derive/avalanche-zone-lookup";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// BC-02: resolve a dropped pin's coordinates to an avalanche.org forecast
// zone, so BC-01's danger rating can be looked up for backcountry pins.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const mapLayer = await getZoneMapLayer();
    const zone = findZoneForPoint(mapLayer, coords.lat, coords.lon);
    if (!zone) {
      return NextResponse.json({ location: coords, zone: null, note: "No avalanche forecast zone covers this point" });
    }
    return NextResponse.json({ location: coords, zone });
  } catch (err) {
    return serverError(err);
  }
}
