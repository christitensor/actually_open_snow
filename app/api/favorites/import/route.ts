import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { importFavoritesForUser } from "@/lib/db/users";
import { badRequest, serverError } from "@/lib/util/api";
import type { FavoriteLocation } from "@/lib/models/types";

function isValidFavorite(v: unknown): v is FavoriteLocation {
  if (typeof v !== "object" || v === null) return false;
  const l = v as Record<string, unknown>;
  return (
    typeof l.lat === "number" &&
    typeof l.lon === "number" &&
    (l.source === "resort" || l.source === "pin") &&
    typeof l.name === "string" &&
    typeof l.savedAt === "string"
  );
}

// PERS-04: one-time merge of a browser's pre-account localStorage
// favorites into a freshly-signed-in account. Called once by lib/auth.tsx
// right after a sign-in redirect; idempotent on the server side
// (INSERT OR IGNORE keyed by favorite_key), so a duplicate call is harmless.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }
  const { favorites } = body as Record<string, unknown>;
  if (!Array.isArray(favorites) || !favorites.every(isValidFavorite)) {
    return badRequest("favorites must be an array of saved locations");
  }

  try {
    return NextResponse.json({ favorites: importFavoritesForUser(user.id, favorites) });
  } catch (err) {
    return serverError(err);
  }
}
