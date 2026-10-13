import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reorderFavoritesForUser } from "@/lib/db/users";
import { badRequest, serverError } from "@/lib/util/api";

const MAX_KEYS = 500;

// PERS-07: saves the drag-to-reorder order of a signed-in user's favorites.
// Body is the full ordered list of favorite keys (lib/util/favorite-key.ts).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }
  const { keys } = body as Record<string, unknown>;
  if (!Array.isArray(keys) || keys.length > MAX_KEYS || !keys.every((k) => typeof k === "string")) {
    return badRequest("keys must be an array of favorite keys");
  }

  try {
    return NextResponse.json({ favorites: await reorderFavoritesForUser(user.id, keys) });
  } catch (err) {
    return serverError(err);
  }
}
