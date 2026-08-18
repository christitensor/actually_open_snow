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

  const toggleFavorite = useCallback(
    (loc: Location) => {
      if (signedIn) {
        const key = favoriteKey(loc);
        // Optimistic update — reconciled with the server's response below.
        setServerFavorites((current) =>
          current.some((f) => favoriteKey(f) === key)
            ? current.filter((f) => favoriteKey(f) !== key)
            : [...current, { ...loc, savedAt: new Date().toISOString() }]
        );
        (async () => {
          try {
            const res = await fetch("/api/favorites/toggle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ location: loc }),
            });
            if (res.ok) {
              const body = (await res.json()) as { favorites: FavoriteLocation[] };
              setServerFavorites(body.favorites);
            }
          } catch {
            // Leave the optimistic state — next load() reconciles it.
          }
        })();
        return;
      }

      const current: FavoriteLocation[] = JSON.parse(readRaw());
      const key = favoriteKey(loc);
      const exists = current.some((f) => favoriteKey(f) === key);
      const next = exists
        ? current.filter((f) => favoriteKey(f) !== key)
        : [...current, { ...loc, savedAt: new Date().toISOString() }];
      writeLocalFavorites(next);
    },
    [signedIn]
  );

  return { favorites, isFavorite, toggleFavorite };
}
