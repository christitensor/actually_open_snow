"use client";

// PERS-04: magic-link accounts, so PERS-01 favorites sync across devices
// instead of being stuck in one browser's localStorage. AuthProvider wraps
// the whole app (app/layout.tsx) and is the single source of truth for
// sign-in state — lib/favorites.ts reads it to decide whether to read/write
// localStorage or the server.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FAVORITES_CHANGE_EVENT, FAVORITES_STORAGE_KEY } from "@/lib/favorites-storage";

type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  signInError: boolean;
  clearSignInError: () => void;
  requestMagicLink: (email: string) => Promise<{ ok: boolean; message: string }>;
  verifyCode: (email: string, code: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
}

// Shared by both sign-in paths: the link-click redirect (query-param
// triggered) and the in-app code entry (called directly on success).
// Idempotent server-side (INSERT OR IGNORE keyed by favorite_key), so
// there's no harm importing an empty or already-imported list.
async function importLocalFavorites() {
  try {
    const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY) ?? "[]";
    const local: unknown = JSON.parse(raw);
    if (Array.isArray(local) && local.length > 0) {
      await fetch("/api/favorites/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorites: local }),
      });
      window.dispatchEvent(new Event(FAVORITES_CHANGE_EVENT));
    }
  } catch {
    // Best-effort — a missed import just means re-starring on this device.
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [signInError, setSignInError] = useState(false);
  const importedRef = useRef(false);

  // The verify route redirects here with `signInError=1` when a link was
  // invalid, expired, or already used — surfaced by AuthControl.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signInError") !== "1") return;
    (async () => {
      setSignInError(true);
      params.delete("signInError");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const body = (await res.json()) as { email: string | null };
        if (cancelled) return;
        setEmail(body.email);
        setStatus(body.email ? "signed-in" : "signed-out");
      } catch {
        if (!cancelled) setStatus("signed-out");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One-time import of pre-account localStorage favorites, triggered by the
  // `signedIn=1` query param the verify route redirects back with.
  useEffect(() => {
    if (status !== "signed-in" || importedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("signedIn") !== "1") return;
    importedRef.current = true;

    (async () => {
      try {
        await importLocalFavorites();
      } finally {
        params.delete("signedIn");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }
    })();
  }, [status]);

  const requestMagicLink = useCallback(async (emailInput: string) => {
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, next: window.location.pathname }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      return { ok: res.ok, message: body.message ?? body.error ?? "Something went wrong." };
    } catch {
      return { ok: false, message: "Network error — try again." };
    }
  }, []);

  const verifyCode = useCallback(async (emailInput: string, code: string) => {
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, code }),
      });
      const body = (await res.json()) as { email?: string; error?: string };
      if (!res.ok || !body.email) return { ok: false, message: body.error ?? "That code didn't work." };

      setEmail(body.email);
      setStatus("signed-in");
      await importLocalFavorites();
      return { ok: true };
    } catch {
      return { ok: false, message: "Network error — try again." };
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
    setStatus("signed-out");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        status,
        email,
        signInError,
        clearSignInError: () => setSignInError(false),
        requestMagicLink,
        verifyCode,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
