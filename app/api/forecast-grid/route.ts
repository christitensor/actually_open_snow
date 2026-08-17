import { NextRequest, NextResponse } from "next/server";
import { getGridDailySnowfallIn } from "@/lib/data-sources/open-meteo";
import { badRequest, serverError } from "@/lib/util/api";

// MAP-04/05: sampled grid of today's forecast snowfall across a bounding
// box — see the caveat in getGridDailySnowfallIn: this is a coarse point
// sample, not a true raster/gridded product.
const GRID_SIZE = 6; // 6x6 = 36 points per request, kept small on purpose

export async function GET(req: NextRequest) {
  const bboxParam = req.nextUrl.searchParams.get("bbox");
  if (!bboxParam) return badRequest("bbox query param is required: south,west,north,east");

  const [south, west, north, east] = bboxParam.split(",").map(Number);
  if ([south, west, north, east].some((n) => !Number.isFinite(n))) {
    return badRequest("bbox must be four comma-separated numbers: south,west,north,east");
  }

  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    for (let j = 0; j < GRID_SIZE; j++) {
      points.push({
        lat: south + ((north - south) * i) / (GRID_SIZE - 1),
        lon: west + ((east - west) * j) / (GRID_SIZE - 1),
      });
    }
  }

  try {
    const grid = await getGridDailySnowfallIn(points);
    return NextResponse.json({ grid });
  } catch (err) {
    return serverError(err);
  }
}
