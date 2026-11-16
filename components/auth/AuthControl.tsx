"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";

// PERS-04: sign-in control in the header.
// Signed out, two tabs:
// - Sign in: "Sign in with a passkey" (Face ID / Touch ID, synced across a
//   person's devices), or a 6-digit email code.
// - Create account: step 1 confirms the email with a code (the email is
//   also the recovery method); step 2 creates the passkey right away.
// A passkey can only be created by a signed-in account, so a new person
// always starts with the email step.
// Signed in: an account menu (Account & sign-in page, Sign out), plus a
// one-time prompt to add a passkey right after an email-code sign-in.
//
// The saved-to-home-screen app on iOS has its own cookie jar, separate
// from Safari's — tapping the emailed link opens Safari and signs *Safari*
// in, never the app. The app signs in with the 6-digit code instead. To
// read that code you have to leave the app for Mail, and iOS often reloads
// a backgrounded home-screen app, which used to wipe this form back to
// "Sign in". So a sent-but-unconfirmed sign-in is remembered in
// localStorage, and the code step reopens on its own when you come back.

const PENDING_KEY = "actually-open-snow:pending-sign-in";
// Codes are valid for the current + previous 15-minute bucket
// (lib/auth/magic-link.ts), so a pending sign-in older than that is dead.
const PENDING_TTL_MS = 30 * 60 * 1000;

function readPending(): string | null {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const { email, sentAt } = JSON.parse(raw) as { email: string; sentAt: number };
    return Date.now() - sentAt < PENDING_TTL_MS ? email : null;
  } catch {
    return null;
  }
}

function writePending(email: string | null) {
  try {
    if (email) window.localStorage.setItem(PENDING_KEY, JSON.stringify({ email, sentAt: Date.now() }));
    else window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // Private mode etc. — the code step just won't survive a reload.
  }
}

type View = "email" | "code";

export default function AuthControl() {
  const {
    status,
    email,
    signInError,
    clearSignInError,
    requestMagicLink,
    verifyCode,
    signOut,
    passkeySupported,
    offerPasskey,
    justCreated,
    dismissPasskeyOffer,
    signInWithPasskey,
    addPasskey,
  } = useAuth();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<string | null>(null);
  // Shown after a passkey sign-in is cancelled or finds nothing (WebAuthn reports both the same way).
  const [passkeyHint, setPasskeyHint] = useState(false);
  const [passkeySaved, setPasskeySaved] = useState(false);
  const [mode, setMode] = useState<"signin" | "create">("signin");
  const rootRef = useRef<HTMLDivElement>(null);

  // Close popovers on outside click.
  useEffect(() => {
    if (!open && !menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, menuOpen]);
  const [view, setView] = useState<View>("email");
  const [inputEmail, setInputEmail] = useState("");
  // On the code step: true when the email came from a send/pending sign-in
  // (so it's shown as text), false on "Already have a code?" (typed in).
  const [emailLocked, setEmailLocked] = useState(false);
  const [formStatus, setFormStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeStatus, setCodeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  // A magic link that was invalid, expired, or already used redirects back
  // here with signInError — pop the form open with an explanation instead
  // of silently landing on the home page.
  useEffect(() => {
    if (!signInError) return;
    (async () => {
      setOpen(true);
      setView("email");
      setFormStatus("error");
      setMessage("That sign-in link was invalid or expired — enter your email for a new one.");
      clearSignInError();
    })();
  }, [signInError, clearSignInError]);

  // Back from Mail with a sign-in still pending → reopen on the code step.
  useEffect(() => {
    if (status !== "signed-out") return;
    const pending = readPending();
    if (!pending) return;
    (async () => {
      setInputEmail(pending);
      setEmailLocked(true);
      setView("code");
      setOpen(true);
    })();
  }, [status]);

  if (status === "loading") return null;

  if (status === "signed-in") {
    return (
      <div ref={rootRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="btn-ghost !px-2.5 !py-1.5 text-xs"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={email ?? undefined}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold uppercase text-primary-foreground">
            {email?.[0] ?? "?"}
          </span>
          <span className="hidden max-w-40 truncate sm:inline">{email}</span>
        </button>
        {menuOpen && (
          <div role="menu" className="card absolute right-0 top-full z-30 mt-2 w-64 p-2 text-sm">
            <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{email}</p>
            <Link href="/account" role="menuitem" onClick={() => setMenuOpen(false)} className="block rounded-lg px-2 py-1.5 hover:bg-muted">
              Account &amp; sign-in methods
            </Link>
            <button
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                signOut();
              }}
              className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted"
            >
              Sign out
            </button>
          </div>
        )}
        {offerPasskey && passkeySupported && !menuOpen && (
          <div className="card absolute right-0 top-full z-30 mt-2 w-72 p-4 text-sm">
            {justCreated ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Account created · Step 2 of 2</p>
                <p className="mt-1 font-semibold">Create your passkey</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Next time you&apos;ll sign in with Face ID, Touch ID or your device PIN, with no email or code. It&apos;s saved to iCloud
                  Keychain or Google Password Manager, so your other devices can use it too.
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold">Skip the email next time</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add a passkey and sign in with Face ID, Touch ID or your device PIN. It syncs through iCloud Keychain or Google Password
                  Manager, so your other devices can use it too.
                </p>
              </>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={passkeyBusy}
                onClick={async () => {
                  setPasskeyBusy(true);
                  setPasskeyMessage(null);
                  const r = await addPasskey();
                  setPasskeyBusy(false);
                  if (r.ok) {
                    setPasskeySaved(true);
                    setTimeout(() => setPasskeySaved(false), 6000);
                  } else if (r.message) setPasskeyMessage(r.message);
                }}
              >
                {passkeyBusy ? "Waiting…" : justCreated ? "Create passkey" : "Add a passkey"}
              </button>
              <button className="btn-ghost" onClick={dismissPasskeyOffer}>
                {justCreated ? "Skip" : "Not now"}
              </button>
            </div>
            {passkeyMessage && <p className="mt-2 text-xs text-red-500">{passkeyMessage}</p>}
            {justCreated && <p className="mt-2 text-[11px] text-muted-foreground">Skipping is fine: you can always sign in with an email code, and add a passkey later from Account.</p>}
          </div>
        )}
        {passkeySaved && !offerPasskey && !menuOpen && (
          <div role="status" className="card absolute right-0 top-full z-30 mt-2 w-72 p-4 text-sm">
            <p className="font-semibold">✓ Passkey saved</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You&apos;re all set. On your other devices, tap Sign in → Sign in with a passkey.
            </p>
          </div>
        )}
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus("loading");
    const result = await requestMagicLink(inputEmail);
    if (result.ok) {
      writePending(inputEmail);
      setEmailLocked(true);
      setFormStatus("idle");
      setMessage(result.message);
      setView("code");
    } else {
      setFormStatus("error");
      setMessage(result.message);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeStatus("loading");
    const result = await verifyCode(inputEmail, codeInput);
    if (result.ok) {
      writePending(null);
      // Reset to the first step and the Sign in tab, so a later sign-out starts fresh
      // (button says "Sign in", not "Enter code"; the passkey button is showing).
      setView("email");
      setMode("signin");
      setEmailLocked(false);
      setMessage(null);
      setCodeInput("");
      setCodeStatus("idle");
      setOpen(false); // status flips to signed-in and re-renders this component entirely
      return;
    }
    setCodeStatus("error");
    setCodeMessage(result.message ?? "That code didn't work.");
  };

  const startOver = () => {
    writePending(null);
    setEmailLocked(false);
    setView("email");
    setMessage(null);
    setCodeInput("");
    setCodeStatus("idle");
  };

  return (
    <div ref={rootRef} className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost !px-2.5 !py-1.5 text-xs">
        {view === "code" ? "Enter code" : "Sign in"}
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-2 w-72 p-4">
          {view === "code" ? (
            <div className="flex flex-col gap-2">
              {mode === "create" && <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Create account · Step 1 of 2</p>}
              <p className="text-sm">
                {message ?? (emailLocked ? `Check ${inputEmail} for a 6-digit code.` : "Enter your email and the code we sent it.")}
              </p>
              <p className="text-xs text-muted-foreground">Type the 6-digit code here. (The link in the email signs in whichever browser opens it.)</p>
              <form onSubmit={handleCodeSubmit} className="flex flex-col gap-2">
                {!emailLocked && (
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={inputEmail}
                    onChange={(e) => setInputEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus={emailLocked}
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="input w-28 tracking-widest"
                    aria-label="6-digit sign-in code"
                  />
                  <button type="submit" disabled={codeStatus === "loading"} className="btn-primary flex-1">
                    {codeStatus === "loading" ? "Checking…" : mode === "create" ? "Verify email" : "Sign in"}
                  </button>
                </div>
              </form>
              {codeStatus === "error" && <p className="text-xs text-red-500">{codeMessage}</p>}
              <button onClick={startOver} className="self-start text-xs text-muted-foreground underline">
                Use a different email or send a new code
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div role="tablist" className="mb-1 grid grid-cols-2 rounded-full bg-muted p-1 text-xs font-semibold">
                {(["signin", "create"] as const).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={mode === m}
                    onClick={() => {
                      setMode(m);
                      setPasskeyHint(false);
                      setPasskeyMessage(null);
                      setFormStatus("idle");
                      setMessage(null);
                    }}
                    className={`rounded-full py-1.5 transition ${mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
                  >
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              {mode === "create" ? (
                <>
                  <p className="text-sm font-semibold">Create your free account</p>
                  <p className="text-xs text-muted-foreground">
                    Keep favorites and settings on all your devices. No password: confirm your email, then create a passkey (Face ID / Touch
                    ID).
                  </p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Step 1 of 2 · Confirm your email</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Welcome back. Use your passkey, or get a code by email.</p>
              )}
              {mode === "signin" && passkeySupported && (
                <>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={passkeyBusy}
                    onClick={async () => {
                      setPasskeyBusy(true);
                      setPasskeyMessage(null);
                      setPasskeyHint(false);
                      const r = await signInWithPasskey();
                      setPasskeyBusy(false);
                      if (r.ok) setOpen(false);
                      else if (r.message) setPasskeyMessage(r.message);
                      else setPasskeyHint(true);
                    }}
                  >
                    {passkeyBusy ? "Waiting for passkey…" : "Sign in with a passkey"}
                  </button>
                  {passkeyMessage && <p className="text-xs text-red-500">{passkeyMessage}</p>}
                  {passkeyHint && (
                    <p className="rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                      No passkey on this device yet? New here:{" "}
                      <button className="font-semibold text-primary underline" onClick={() => setMode("create")}>
                        create an account
                      </button>
                      . Have an account: get an email code below, then add a passkey.
                    </p>
                  )}
                  <div className="my-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or get an email code
                    <span className="h-px flex-1 bg-border" />
                  </div>
                </>
              )}
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                />
                <button
                  type="submit"
                  disabled={formStatus === "loading"}
                  className={passkeySupported && mode === "signin" ? "btn-secondary" : "btn-primary"}
                >
                  {formStatus === "loading" ? "Sending…" : mode === "create" ? "Send verification code" : "Email me a sign-in code"}
                </button>
                {formStatus === "error" && <p className="text-xs text-red-500">{message}</p>}
              </form>
              <button
                onClick={() => {
                  setMessage(null);
                  setEmailLocked(false);
                  setView("code");
                }}
                className="self-start text-xs text-muted-foreground underline"
              >
                Already have a code?
              </button>
              {mode === "create" && (
                <p className="text-[11px] text-muted-foreground">
                  Already have an account?{" "}
                  <button className="font-semibold text-primary underline" onClick={() => setMode("signin")}>
                    Sign in
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
