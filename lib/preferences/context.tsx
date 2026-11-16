"use client";

// PERS-08: view settings that follow the account, not the device.
//
// - Signed in: the account's settings (/api/preferences) are the source of
//   truth. Changes save back to it, batched, so "Collapse all" or a burst
//   of toggles is one request. A copy is cached in localStorage only so the
//   next page load can apply your layout immediately instead of after a
//   network round-trip.
// - Signed out: the same settings live in this browser.
// - First sign-in on an account with no saved settings adopts whatever
//   this browser had, the same way favorites are imported.
// - Settings from before this existed (per-device section open/closed and
//   resort sort, in their own localStorage keys) are migrated once.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { DEFAULT_PREFERENCES, merge, sanitize, type Preferences } from "./schema";

const CACHE_KEY = "aos:prefs";
const LEGACY_SECTION_PREFIX = "aos:section:";
const LEGACY_SORT_KEY = "actually-open-snow:resort-sort";
const SAVE_DELAY_MS = 400;

interface PreferencesContextValue {
  prefs: Preferences;
  /** Stored settings have been applied (cache on first paint, then the account once signed in). */
  ready: boolean;
  /** Where settings are being saved. */
  savedTo: "account" | "device";
  /** Signed in and the account's own settings have been loaded (not just the local cache). */
  accountLoaded: boolean;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readLocal(): Preferences {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return sanitize(JSON.parse(raw));
    // One-time migration of the older per-device keys.
    const sectionOpen: Record<string, boolean> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(LEGACY_SECTION_PREFIX)) sectionOpen[k.slice(LEGACY_SECTION_PREFIX.length)] = localStorage.getItem(k) === "1";
    }
    const sort = localStorage.getItem(LEGACY_SORT_KEY);
    return sanitize({ ...DEFAULT_PREFERENCES, sectionOpen, resortSort: sort === "mine" ? "mine" : "snow" });
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function writeLocal(p: Preferences) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    // Private mode etc.: settings still apply for this page view.
  }
}

const isEmpty = (p: Preferences) => JSON.stringify(p) === JSON.stringify(DEFAULT_PREFERENCES);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [accountLoaded, setAccountLoaded] = useState(false);
  const pending = useRef<Partial<Preferences> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef(status);
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // First paint: this browser's copy (cached account settings, or signed-out settings).
  useEffect(() => {
    (async () => {
      setPrefs(readLocal());
      setReady(true);
    })();
  }, []);

  // Signed in: load the account's settings (or seed the account from this browser's).
  useEffect(() => {
    if (status !== "signed-in") {
      (async () => setAccountLoaded(false))();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (!res.ok) return;
        const { prefs: remote } = (await res.json()) as { prefs: Preferences | null };
        let next: Preferences;
        if (remote) {
          next = sanitize(remote);
        } else {
          const local = readLocal();
          next = local;
          if (!isEmpty(local)) {
            await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(local) });
          }
        }
        if (cancelled) return;
        setPrefs(next);
        writeLocal(next);
        setAccountLoaded(true);
      } catch {
        // Offline: keep the cached copy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = null;
    if (!patch || statusRef.current !== "signed-in") return;
    try {
      await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch), keepalive: true });
    } catch {
      // Next change will carry it again via the merged local copy on reload.
    }
  }, []);

  // Don't lose a batched save when the page is closed or hidden.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && pending.current) flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  const update = useCallback(
    (patch: Partial<Preferences>) => {
      setPrefs((prev) => {
        const next = merge(prev, patch);
        writeLocal(next);
        return next;
      });
      const prev = pending.current ?? {};
      pending.current = {
        ...prev,
        ...patch,
        sectionOpen: patch.sectionOpen ? { ...(prev.sectionOpen ?? {}), ...patch.sectionOpen } : prev.sectionOpen,
      };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush]
  );

  const reset = useCallback(() => {
    // Back to defaults, except "has seen the welcome" (a reset shouldn't replay onboarding).
    const next = { ...DEFAULT_PREFERENCES, onboarded: prefsRef.current.onboarded };
    setPrefs(next);
    writeLocal(next);
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    // PUT replaces the whole document (PATCH merges sectionOpen key by key, so it can't clear it).
    if (statusRef.current === "signed-in") {
      fetch("/api/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) }).catch(() => {});
    }
  }, []);

  return (
    <PreferencesContext.Provider value={{ prefs, ready, savedTo: status === "signed-in" ? "account" : "device", accountLoaded, update, reset }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
