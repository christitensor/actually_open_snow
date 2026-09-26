"use client";

import { useEffect, useState } from "react";
import type { Location } from "@/lib/models/types";

// PERS-06: "wake me up" push alert. iOS doesn't let a web app set a real
// Clock alarm, so the closest substitute is a high-urgency push sent at
// ~4-5am when enough snow fell overnight. iOS only allows web push for an
// app added to the Home Screen, so that's detected and explained up front.

type Support = "checking" | "ok" | "needs-install" | "unsupported" | "server-off";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

async function getRegistration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

async function postJson(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
  return json;
}

export default function WakeAlarmForm({ location }: { location: Location }) {
  const [support, setSupport] = useState<Support>("checking");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [thresholdIn, setThresholdIn] = useState(6);
  const [activeThreshold, setActiveThreshold] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasApis = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!hasApis) {
        setSupport(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      try {
        const config = await fetch("/api/push/config").then((r) => r.json());
        if (cancelled) return;
        if (!config.enabled) {
          setSupport("server-off");
          return;
        }
        setVapidKey(config.vapidPublicKey);
        setSupport("ok");

        // Reflect an existing alert for this device + location.
        const reg = await getRegistration();
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;
        const state = await postJson("/api/push/subscribe", "PATCH", { subscription: sub.toJSON(), locationName: location.name });
        if (!cancelled && state.subscribed) {
          setActiveThreshold(state.thresholdIn);
          setThresholdIn(state.thresholdIn);
        }
      } catch {
        if (!cancelled) setSupport("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.name]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  };

  const currentSubscription = async () => {
    const reg = await getRegistration();
    return reg.pushManager.getSubscription();
  };

  const enable = () =>
    run(async () => {
      // Must be called directly from the tap for iOS to show the prompt.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Notifications are blocked — allow them for this app in Settings, then try again.");
      }
      const reg = await getRegistration();
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) }));
      await postJson("/api/push/subscribe", "POST", {
        subscription: sub.toJSON(),
        locationName: location.name,
        lat: location.lat,
        lon: location.lon,
        thresholdIn,
      });
      setActiveThreshold(thresholdIn);
      setMessage({ tone: "ok", text: `On — you'll get a push around 4-5am if ${thresholdIn}"+ falls overnight.` });
    });

  const disable = () =>
    run(async () => {
      const sub = await currentSubscription();
      if (sub) await postJson("/api/push/subscribe", "DELETE", { subscription: sub.toJSON(), locationName: location.name });
      setActiveThreshold(null);
      setMessage({ tone: "ok", text: "Wake-up alert turned off for this location." });
    });

  const sendTest = () =>
    run(async () => {
      const sub = await currentSubscription();
      if (!sub) throw new Error("Turn the alert on first.");
      await postJson("/api/push/test", "POST", { subscription: sub.toJSON() });
      setMessage({ tone: "ok", text: "Test sent — it should arrive within a few seconds." });
    });

  if (support === "checking") return <p className="text-sm text-muted-foreground">Checking notification support…</p>;
  if (support === "needs-install") {
    return (
      <p className="text-sm text-muted-foreground">
        On iPhone, wake-up alerts only work from the Home Screen app: tap <strong>Share → Add to Home Screen</strong>, open Open
        Snow from there, and turn this on.
      </p>
    );
  }
  if (support === "unsupported") return <p className="text-sm text-muted-foreground">This browser doesn&apos;t support push notifications.</p>;
  if (support === "server-off") return <p className="text-sm text-muted-foreground">Wake-up alerts aren&apos;t set up on the server yet.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A push notification around 4-5am when {location.name} gets enough snow overnight (since 5pm). iOS can&apos;t set a real
        alarm from a web app — keep notification sounds on and this app allowed through Sleep Focus so it can wake you.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground" htmlFor="wake-threshold">
            Wake me at
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="wake-threshold"
              type="number"
              min={1}
              max={100}
              step={1}
              value={thresholdIn}
              onChange={(e) => setThresholdIn(Number(e.target.value))}
              className="input w-16"
            />
            <span className="text-sm text-muted-foreground">&quot;+ overnight</span>
          </div>
        </div>
        <button type="button" onClick={enable} disabled={busy} className="btn-primary">
          {activeThreshold == null ? "Turn on" : activeThreshold === thresholdIn ? "On ✓" : "Update"}
        </button>
        {activeThreshold != null && (
          <>
            <button type="button" onClick={sendTest} disabled={busy} className="text-sm underline">
              Send test
            </button>
            <button type="button" onClick={disable} disabled={busy} className="text-sm text-muted-foreground underline">
              Turn off
            </button>
          </>
        )}
      </div>
      {message && (
        <p className={`text-xs ${message.tone === "ok" ? "text-green-700 dark:text-green-400" : "text-red-500"}`}>{message.text}</p>
      )}
    </div>
  );
}
