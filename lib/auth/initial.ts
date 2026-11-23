// The signed-in person's account state, loaded on the server while a page
// renders, so the first HTML already shows *their* page: starred resorts on
// home, their section layout and map style. Without this the server
// rendered the signed-out defaults (all resorts) and the browser swapped
// in the account's data a moment later, a visible flash on every open.
import { cache } from "react";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { peekSession } from "@/lib/auth/sessions";
import { isPostgresConfigured, getSql } from "@/lib/db/postgres";
import { listFavoritesForUser } from "@/lib/db/users";
import { getPreferences } from "@/lib/db/preferences";
import type { FavoriteLocation } from "@/lib/models/types";
import type { Preferences } from "@/lib/preferences/schema";

export type InitialAccount =
  | { status: "signed-in"; email: string; hasPasskey: boolean; favorites: FavoriteLocation[]; prefs: Preferences | null }
  | { status: "signed-out" }
  | null; // unknown (e.g. database unreachable): the client works it out as before

export const getInitialAccount = cache(async (): Promise<InitialAccount> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return { status: "signed-out" };
  if (!isPostgresConfigured) return null;
  try {
    const user = await peekSession(token);
    if (!user) return { status: "signed-out" };
    const sql = await getSql();
    const [favorites, prefs, passkeys] = await Promise.all([
      listFavoritesForUser(user.id),
      getPreferences(user.id),
      sql`SELECT count(*)::int AS n FROM passkeys WHERE user_id = ${user.id}` as Promise<{ n: number }[]>,
    ]);
    return { status: "signed-in", email: user.email, hasPasskey: (passkeys[0]?.n ?? 0) > 0, favorites, prefs };
  } catch {
    return null;
  }
});
