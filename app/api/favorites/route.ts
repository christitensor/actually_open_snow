import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listFavoritesForUser } from "@/lib/db/users";

// PERS-04: server-side favorites for a signed-in user. 401 (not an empty
// list) when signed out — lib/favorites.ts uses that to know it should
// fall back to localStorage instead of treating "no account" as "no favorites".
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ favorites: listFavoritesForUser(user.id) });
}
