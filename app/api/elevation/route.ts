import { NextRequest, NextResponse } from "next/server";
import { getElevation } from "@/lib/data-sources/open-meteo";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// FC-11: elevation for any dropped backcountry pin.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  try {
    const elevation = await getElevation(coords.lat, coords.lon);
    return NextResponse.json(elevation);
  } catch (err) {
    return serverError(err);
  }
}
