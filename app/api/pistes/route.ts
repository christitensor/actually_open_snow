import { NextRequest, NextResponse } from "next/server";
import { getPistesInBbox } from "@/lib/data-sources/osm";
import { badRequest, serverError } from "@/lib/util/api";

// MAP-13: OSM piste/trail geometry within a map bounding box.
export async function GET(req: NextRequest) {
  const bboxParam = req.nextUrl.searchParams.get("bbox");
  if (!bboxParam) return badRequest("bbox query param is required: south,west,north,east");

  const parts = bboxParam.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return badRequest("bbox must be four comma-separated numbers: south,west,north,east");
  }

  try {
    const pistes = await getPistesInBbox(parts as [number, number, number, number]);
    return NextResponse.json({ pistes });
  } catch (err) {
    return serverError(err);
  }
}
