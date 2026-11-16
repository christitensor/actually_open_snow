import { NextRequest, NextResponse } from "next/server";
import { getElevationModelInputs } from "@/lib/elevation-model";
import { computeElevationForecast } from "@/lib/derive/elevation-snow";
import { badRequest, parseLatLon, serverError } from "@/lib/util/api";

// FC-10-adj: elevation-adjusted daily forecast as an API. The dashboard
// slider no longer calls this (it gets the model inputs with the page and
// recomputes in the browser); kept for direct/API use and spot-checks.
export async function GET(req: NextRequest) {
  const coords = parseLatLon(req.nextUrl.searchParams);
  if (!coords) return badRequest("lat and lon query params are required and must be valid coordinates");

  const elevationFt = Number(req.nextUrl.searchParams.get("elevationFt"));
  if (!Number.isFinite(elevationFt)) return badRequest("elevationFt query param is required and must be a number");

  try {
    const inputs = await getElevationModelInputs(coords.lat, coords.lon);
    return NextResponse.json({
      daily: computeElevationForecast(inputs, elevationFt),
      gradient: inputs.gradient,
      nwsGridElevationFt: inputs.nws?.gridElevationFt ?? null,
      openMeteoElevationFt: inputs.openMeteo.refElevationFt,
    });
  } catch (err) {
    return serverError(err);
  }
}
