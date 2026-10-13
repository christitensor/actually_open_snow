"use client";

// PERS-01: favorites. Signed-out browsers keep using localStorage exactly
// as before (uses useSyncExternalStore — the recommended pattern for
// subscribing to external mutable state like localStorage — rather than
// useState+useEffect, which avoids both a hydration-mismatch flash and
// same-tab update bugs). PERS-04 added an account-backed mode on top: when
// lib/auth.tsx reports a signed-in session, this hook reads/writes
// app/api/favorites/* instead, so the same starred resorts and pins show
// up on every device. Both hooks below are always called (rules of hooks)
// — only the *output* switches on sign-in state, and the localStorage
// consequently keeps working as an anonymous fallback and as the source
// for the one-time post-sign-in import in lib/auth.tsx.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FavoriteLocation, Location } from "@/lib/models/types";
import { favoriteKey } from "@/lib/util/favorite-key";
import { FAVORITES_CHANGE_EVENT, FAVORITES_STORAGE_KEY } from "@/lib/favorites-storage";
import { useAuth } from "@/lib/auth";
import { showUndoToast } from "@/components/UndoToast";

function readRaw(): string {
  if (typeof window === "undefined") return "[]";
  return window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]";
}

function writeLocalFavorites(list: FavoriteLocation[]) {
  window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(FAVORITES_CHANGE_EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(FAVORITES_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback); // cross-tab updates
  return () => {
    window.removeEventListener(FAVORITES_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getServerSnapshot() {
  return "[]";
}

// Stable sort of `list` into the order of `keys`; anything not in `keys`
// keeps its relative order at the end.
function sortByKeys(list: FavoriteLocation[], keys: string[]): FavoriteLocation[] {
  const rank = (f: FavoriteLocation) => {
    const i = keys.indexOf(favoriteKey(f));
    return i === -1 ? keys.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** POSTs to a favorites endpoint; resolves to the server's updated list, or null on any failure (the next load() reconciles). */
async function postFavorites(url: string, body: unknown): Promise<FavoriteLocation[] | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    return ((await res.json()) as { favorites: FavoriteLocation[] }).favorites;
  } catch {
    return null;
  }
}

async function fetchServerFavorites(): Promise<FavoriteLocation[] | null> {
  try {
    const res = await fetch("/api/favorites");
    if (!res.ok) return null;
    const body = (await res.json()) as { favorites: FavoriteLocation[] };
    return body.favorites;
  } catch {
    return null;
  }
}

export function useFavorites() {
  const { status } = useAuth();
  const signedIn = status === "signed-in";

  const rawLocal = useSyncExternalStore(subscribe, readRaw, getServerSnapshot);
  const localFavorites: FavoriteLocation[] = useMemo(() => {
    try {
      return JSON.parse(rawLocal) as FavoriteLocation[];
    } catch {
      return [];
    }
  }, [rawLocal]);

  const [serverFavorites, setServerFavorites] = useState<FavoriteLocation[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    const load = async () => {
      const favorites = await fetchServerFavorites();
      if (!cancelled && favorites) setServerFavorites(favorites);
    };
    load();
    // Also reload after the post-sign-in localStorage import (lib/auth.tsx)
    // merges in favorites saved before the user had an account.
    window.addEventListener(FAVORITES_CHANGE_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(FAVORITES_CHANGE_EVENT, load);
    };
  }, [signedIn]);

  const favorites = signedIn ? serverFavorites : localFavorites;

  const isFavorite = useCallback(
    (loc: Location) => favorites.some((f) => favoriteKey(f) === favoriteKey(loc)),
    [favorites]
  );

  const restoreFavorite = useCallback(
    (fav: FavoriteLocation, prevKeys: string[]) => {
      const key = favoriteKey(fav);
      if (signedIn) {
        setServerFavorites((current) => (current.some((f) => favoriteKey(f) === key) ? current : sortByKeys([...current, fav], prevKeys)));
        (async () => {
          const added = await postFavorites("/api/favorites/toggle", { location: fav });
          if (!added) return;
          const next = await postFavorites("/api/favorites/reorder", { keys: sortByKeys(added, prevKeys).map(favoriteKey) });
          setServerFavorites(next ?? added);
        })();
        return;
      }
      const current: FavoriteLocation[] = JSON.parse(readRaw());
      if (current.some((f) => favoriteKey(f) === key)) return;
      writeLocalFavorites(sortByKeys([...current, fav], prevKeys));
    },
    [signedIn]
  );

  const toggleFavorite = useCallback(
    (loc: Location) => {
      const key = favoriteKey(loc);
      const removed = favorites.find((f) => favoriteKey(f) === key);
      const prevKeys = favorites.map(favoriteKey);

      if (signedIn) {
        // Optimistic update — reconciled with the server's response below.
        setServerFavorites((current) =>
          current.some((f) => favoriteKey(f) === key)
            ? current.filter((f) => favoriteKey(f) !== key)
            : [...current, { ...loc, savedAt: new Date().toISOString() }]
        );
        postFavorites("/api/favorites/toggle", { location: loc }).then((next) => next && setServerFavorites(next));
      } else {
        const current: FavoriteLocation[] = JSON.parse(readRaw());
        const exists = current.some((f) => favoriteKey(f) === key);
        writeLocalFavorites(
          exists ? current.filter((f) => favoriteKey(f) !== key) : [...current, { ...loc, savedAt: new Date().toISOString() }]
        );
      }

      // PERS-08: removing is one tap, so make it undoable — and restore the
      // bookmark to the slot it had in a custom (drag-to-reorder) order.
      if (removed) showUndoToast(`Removed ${removed.name}`, () => restoreFavorite(removed, prevKeys));
    },
    [signedIn, favorites, restoreFavorite]
  );

  // PERS-07: drag-to-reorder. `ordered` can be a subset (e.g. just the
  // backcountry pins, or just starred resorts) — it's spliced back into
  // the slots those items held, so the other favorites keep their places.
  const reorderFavorites = useCallback(
    (ordered: Location[]) => {
      const merge = (current: FavoriteLocation[]): FavoriteLocation[] => {
        const subset = new Set(ordered.map(favoriteKey));
        const queue = ordered
          .map((o) => current.find((c) => favoriteKey(c) === favoriteKey(o)))
          .filter((c): c is FavoriteLocation => c !== undefined);
        return current.map((c) => (subset.has(favoriteKey(c)) ? (queue.shift() ?? c) : c));
      };

      if (signedIn) {
        const next = merge(serverFavorites);
        setServerFavorites(next);
        postFavorites("/api/favorites/reorder", { keys: next.map(favoriteKey) }).then((saved) => saved && setServerFavorites(saved));
        return;
      }

      writeLocalFavorites(merge(JSON.parse(readRaw()) as FavoriteLocation[]));
    },
    [signedIn, serverFavorites]
  );

  return { favorites, isFavorite, toggleFavorite, reorderFavorites };
}
