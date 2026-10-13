"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// PERS-04: sign-in control in the header. Signed out: a button that opens
// a small magic-link email form. Signed in: the account's email + sign out.
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
  const { status, email, signInError, clearSignInError, requestMagicLink, verifyCode, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-muted-foreground sm:inline" title={email ?? undefined}>
          {email}
        </span>
        <button onClick={() => signOut()} className="btn-ghost !px-2.5 !py-1.5 text-xs">
          Sign out
        </button>
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
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost !px-2.5 !py-1.5 text-xs">
        {view === "code" ? "Enter code" : "Sign in"}
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-2 w-72 p-4">
          {view === "code" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {message ?? (emailLocked ? `Check ${inputEmail} for a sign-in link and code.` : "Enter your email and the code we sent it.")}
              </p>
              <p className="text-xs text-muted-foreground">
                In the home-screen app, use the 6-digit code from the email. The link opens Safari, which signs in Safari, not
                this app.
              </p>
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
                    {codeStatus === "loading" ? "Checking…" : "Sign in"}
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
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Sign in to sync your favorites across devices — we&apos;ll email you a link and a code, no password needed.
                </p>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={inputEmail}
                  onChange={(e) => setInputEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input"
                  autoFocus
                />
                <button type="submit" disabled={formStatus === "loading"} className="btn-primary">
                  {formStatus === "loading" ? "Sending…" : "Email me a sign-in code"}
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
