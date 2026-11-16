"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";

// PERS-04 v2 account page: each person chooses how they sign in.
// - Passkeys (any number, one per password manager or device). Add, rename, remove.
// - Email code: always available as the backup, so losing every passkey
//   never locks anyone out.
// - Signed-in devices: see each browser/app with a session; sign one out,
//   or every one except this.

interface Passkey {
  id: string;
  name: string;
  synced: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
interface SessionInfo {
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}
interface Account {
  email: string;
  passkeys: Passkey[];
  sessions: SessionInfo[];
}

function fmt(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AccountSettings() {
  const { status, passkeySupported, addPasskey, signOut } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/account");
    if (!res.ok) {
      setAccount(null);
      return;
    }
    setAccount((await res.json()) as Account);
  }, []);

  useEffect(() => {
    if (status !== "signed-in") return;
    (async () => load())();
  }, [status, load]);

  if (status === "loading") return <div className="card p-4 text-sm text-muted-foreground">Loading…</div>;
  if (status === "signed-out") {
    return (
      <div className="card p-4 text-sm">
        <p className="font-semibold">You&apos;re not signed in.</p>
        <p className="mt-1 text-muted-foreground">Use &ldquo;Sign in&rdquo; at the top of the page, with a passkey or an email code.</p>
      </div>
    );
  }
  if (!account) return <div className="card p-4 text-sm text-muted-foreground">Loading your account…</div>;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const others = account.sessions.filter((s) => !s.current);

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      <section className="card p-4">
        <h2 className="font-bold tracking-tight">Sign-in methods</h2>
        <p className="mb-3 text-sm text-muted-foreground">Signed in as {account.email}</p>

        <h3 className="text-sm font-semibold">Passkeys</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Sign in with Face ID, Touch ID or your device PIN. Passkeys saved to iCloud Keychain or Google Password Manager sync to your other
          devices, and any phone can also sign in a computer by scanning a QR code.
        </p>
        {account.passkeys.length === 0 ? (
          <p className="mb-2 text-sm text-muted-foreground">No passkeys yet.</p>
        ) : (
          <ul className="mb-2 divide-y divide-border rounded-xl border border-border">
            {account.passkeys.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span aria-hidden>🔑</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.name}
                    {p.synced && <span className="pill ml-2 bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">Synced</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Added {fmt(p.createdAt)} · last used {fmt(p.lastUsedAt)}
                  </div>
                </div>
                <button
                  className="btn-ghost text-xs"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`rename:${p.id}`, async () => {
                      const name = window.prompt("Name this passkey", p.name)?.trim();
                      if (!name) return;
                      await fetch(`/api/auth/passkey/${encodeURIComponent(p.id)}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name }),
                      });
                      await load();
                    })
                  }
                >
                  Rename
                </button>
                <button
                  className="btn-ghost text-xs text-red-600 dark:text-red-400"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`remove:${p.id}`, async () => {
                      if (!window.confirm(`Remove "${p.name}"? You can still sign in with an email code.`)) return;
                      await fetch(`/api/auth/passkey/${encodeURIComponent(p.id)}`, { method: "DELETE" });
                      await load();
                    })
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {passkeySupported ? (
          <button
            className="btn-primary"
            disabled={busy !== null}
            onClick={() =>
              run("add", async () => {
                const r = await addPasskey();
                if (!r.ok && r.message) throw new Error(r.message);
                await load();
              })
            }
          >
            {busy === "add" ? "Waiting for your device…" : "Add a passkey"}
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">This browser doesn&apos;t support passkeys.</p>
        )}

        <h3 className="mt-5 text-sm font-semibold">Email code</h3>
        <p className="text-xs text-muted-foreground">
          Always on as a backup: we email a 6-digit code to {account.email}. It&apos;s how you get back in if you lose every passkey, so it
          can&apos;t be turned off.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="font-bold tracking-tight">Signed-in devices</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          You stay signed in on each device as long as you use it at least every 6 months. Sign out anything you don&apos;t recognize.
        </p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {account.sessions.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {s.device}
                  {s.current && <span className="pill ml-2 bg-primary/10 text-primary">This device</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  Signed in {fmt(s.createdAt)} · active {fmt(s.lastSeenAt)}
                </div>
              </div>
              {s.current ? (
                <button className="btn-ghost text-xs" onClick={() => signOut()}>
                  Sign out
                </button>
              ) : (
                <button
                  className="btn-ghost text-xs"
                  disabled={busy !== null}
                  onClick={() =>
                    run(`revoke:${s.id}`, async () => {
                      await fetch("/api/auth/sessions", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ revoke: s.id }),
                      });
                      await load();
                    })
                  }
                >
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
        {others.length > 0 && (
          <button
            className="btn-secondary mt-3"
            disabled={busy !== null}
            onClick={() =>
              run("others", async () => {
                if (!window.confirm(`Sign out ${others.length} other device${others.length === 1 ? "" : "s"}?`)) return;
                await fetch("/api/auth/sessions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ revoke: "others" }),
                });
                await load();
              })
            }
          >
            Sign out all other devices
          </button>
        )}
      </section>
    </div>
  );
}
