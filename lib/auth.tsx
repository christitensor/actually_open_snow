"use client";

// PERS-04: magic-link accounts, so PERS-01 favorites sync across devices
// instead of being stuck in one browser's localStorage. AuthProvider wraps
// the whole app (app/layout.tsx) and is the single source of truth for
// sign-in state — lib/favorites.ts reads it to decide whether to read/write
// localStorage or the server.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FAVORITES_CHANGE_EVENT, FAVORITES_STORAGE_KEY } from "@/lib/favorites-storage";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

type AuthStatus = "loading" | "signed-out" | "signed-in";

interface AuthContextValue {
  status: AuthStatus;
  email: string | null;
  signInError: boolean;
  clearSignInError: () => void;
  requestMagicLink: (email: string) => Promise<{ ok: boolean; message: string }>;
  verifyCode: (email: string, code: string) => Promise<{ ok: boolean; message?: string }>;
  signOut: () => Promise<void>;
  /** This browser can use passkeys at all. */
  passkeySupported: boolean;
  /** The signed-in account has at least one passkey. */
  hasPasskey: boolean;
  /** True right after an email sign-in on an account with no passkey: the moment to suggest adding one. */
  offerPasskey: boolean;
  dismissPasskeyOffer: () => void;
  signInWithPasskey: () => Promise<{ ok: boolean; message?: string }>;
  addPasskey: (name?: string) => Promise<{ ok: boolean; message?: string }>;
}

// WebAuthn rejects with NotAllowedError when the person cancels the sheet; that's not an error to show.
function passkeyErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError")) return undefined;
  if (err instanceof Error && err.name === "InvalidStateError") return "This device already has a passkey for your account.";
  return err instanceof Error ? err.message : "Passkey didn't work. Try again or use an email code.";
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
  const [hasPasskey, setHasPasskey] = useState(false);
  const [offerPasskey, setOfferPasskey] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    (async () => setPasskeySupported(browserSupportsWebAuthn()))();
  }, []);
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
        const body = (await res.json()) as { email: string | null; hasPasskey?: boolean };
        if (cancelled) return;
        setEmail(body.email);
        setHasPasskey(Boolean(body.hasPasskey));
        // Arrived from the emailed link: same moment as a code sign-in to suggest a passkey.
        if (body.email && !body.hasPasskey && new URLSearchParams(window.location.search).get("signedIn") === "1") setOfferPasskey(true);
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
      // Find out whether this account already has a passkey; if not, suggest one.
      const me = (await fetch("/api/auth/me").then((r) => r.json()).catch(() => ({}))) as { hasPasskey?: boolean };
      setHasPasskey(Boolean(me.hasPasskey));
      if (!me.hasPasskey) setOfferPasskey(true);
      return { ok: true };
    } catch {
      return { ok: false, message: "Network error — try again." };
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setEmail(null);
    setHasPasskey(false);
    setOfferPasskey(false);
    setStatus("signed-out");
  }, []);

  const signInWithPasskey = useCallback(async () => {
    try {
      const optionsJSON = await fetch("/api/auth/passkey/login/options", { method: "POST" }).then((r) => r.json());
      const response = await startAuthentication({ optionsJSON });
      const res = await fetch("/api/auth/passkey/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const body = (await res.json()) as { email?: string; error?: string };
      if (!res.ok || !body.email) return { ok: false, message: body.error ?? "Passkey sign-in failed." };
      setEmail(body.email);
      setHasPasskey(true);
      setStatus("signed-in");
      await importLocalFavorites();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: passkeyErrorMessage(err) };
    }
  }, []);

  const addPasskey = useCallback(async (name?: string) => {
    try {
      const optionsRes = await fetch("/api/auth/passkey/register/options", { method: "POST" });
      if (!optionsRes.ok) return { ok: false, message: "Sign in first." };
      const response = await startRegistration({ optionsJSON: await optionsRes.json() });
      const res = await fetch("/api/auth/passkey/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, name }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) return { ok: false, message: body.error ?? "Couldn't add the passkey." };
      setHasPasskey(true);
      setOfferPasskey(false);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: passkeyErrorMessage(err) };
    }
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
        passkeySupported,
        hasPasskey,
        offerPasskey,
        dismissPasskeyOffer: () => setOfferPasskey(false),
        signInWithPasskey,
        addPasskey,
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
