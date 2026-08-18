"use client";

import { useState } from "react";
import type { Location } from "@/lib/models/types";

// PERS-03: subscribe-by-email alert form. No account/login — mailing-list
// style, matching TRACE_MATRIX.md's original design for this feature.
export default function AlertSubscribeForm({ location }: { location: Location }) {
  const [email, setEmail] = useState("");
  const [thresholdIn, setThresholdIn] = useState(6);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          locationName: location.name,
          lat: location.lat,
          lon: location.lon,
          thresholdIn,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(body.error ?? "Something went wrong.");
        return;
      }
      setStatus("done");
      setMessage(body.message);
    } catch {
      setStatus("error");
      setMessage("Network error — try again.");
    }
  };

  if (status === "done") {
    return (
      <p className="text-sm text-green-700 dark:text-green-400">
        {message} You can unsubscribe any time from the link in the alert email.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="alert-email">
          Email
        </label>
        <input
          id="alert-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted-foreground" htmlFor="alert-threshold">
          Alert me at
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="alert-threshold"
            type="number"
            min={1}
            max={100}
            step={1}
            value={thresholdIn}
            onChange={(e) => setThresholdIn(Number(e.target.value))}
            className="input w-16"
          />
          <span className="text-sm text-muted-foreground">&quot;+ forecast</span>
        </div>
      </div>
      <button type="submit" disabled={status === "loading"} className="btn-primary">
        {status === "loading" ? "Subscribing…" : "Get snow alerts"}
      </button>
      {status === "error" && <p className="w-full text-xs text-red-500">{message}</p>}
    </form>
  );
}
