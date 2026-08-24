import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { toggleFavoriteForUser } from "@/lib/db/users";
import { badRequest, serverError } from "@/lib/util/api";
import type { Location } from "@/lib/models/types";

function isValidLocation(v: unknown): v is Location {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.lat === "number" &&
    typeof l.lon === "number" &&
    (l.source === "resort" || l.source === "pin") &&
    typeof l.name === "string"
  );
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }
  const { location } = body as Record<string, unknown>;
  if (!isValidLocation(location)) return badRequest("A valid location is required");

  try {
    return NextResponse.json({ favorites: await toggleFavoriteForUser(user.id, location) });
  } catch (err) {
    return serverError(err);
  }
}
