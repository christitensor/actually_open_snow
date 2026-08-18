"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// PERS-04: sign-in control in the header. Signed out: a button that opens
// a small magic-link email form. Signed in: the account's email + sign out.
export default function AuthControl() {
  const { status, email, signInError, clearSignInError, requestMagicLink, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [inputEmail, setInputEmail] = useState("");
  const [formStatus, setFormStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // A magic link that was invalid, expired, or already used redirects back
  // here with signInError — pop the form open with an explanation instead
  // of silently landing on the home page.
  useEffect(() => {
    if (!signInError) return;
    (async () => {
      setOpen(true);
      setFormStatus("error");
      setMessage("That sign-in link was invalid or expired — enter your email for a new one.");
      clearSignInError();
    })();
  }, [signInError, clearSignInError]);

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
    setFormStatus(result.ok ? "done" : "error");
    setMessage(result.message);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-ghost !px-2.5 !py-1.5 text-xs">
        Sign in
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-30 mt-2 w-64 p-4">
          {formStatus === "done" ? (
            <p className="text-sm text-green-700 dark:text-green-400">{message}</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Sign in to sync your favorites across devices — we&apos;ll email you a link, no password needed.
              </p>
              <input
                type="email"
                required
                value={inputEmail}
                onChange={(e) => setInputEmail(e.target.value)}
                placeholder="you@example.com"
                className="input"
                autoFocus
              />
              <button type="submit" disabled={formStatus === "loading"} className="btn-primary">
                {formStatus === "loading" ? "Sending…" : "Send sign-in link"}
              </button>
              {formStatus === "error" && <p className="text-xs text-red-500">{message}</p>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
