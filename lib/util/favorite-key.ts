import type { Location } from "@/lib/models/types";

// Shared between the client-side localStorage store (lib/favorites.ts) and
// the server-side favorites table (lib/db/users.ts) so a pin saved while
// signed out and later imported lands on the same key as one saved directly
// while signed in — no duplicate rows for the same spot.
export function favoriteKey(loc: Location): string {
  return loc.source === "resort" ? `resort:${loc.resortId}` : `pin:${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
}
