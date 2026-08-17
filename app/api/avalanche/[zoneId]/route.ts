import { NextRequest, NextResponse } from "next/server";
import { getAvalancheForecast } from "@/lib/data-sources/avalanche-org";
import { serverError } from "@/lib/util/api";

// BC-01: full avalanche forecast (danger by elevation band + discussion) for a zone.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ zoneId: string }> }) {
  const { zoneId } = await params;
  try {
    const forecast = await getAvalancheForecast(zoneId);
    return NextResponse.json(forecast);
  } catch (err) {
    return serverError(err);
  }
}
