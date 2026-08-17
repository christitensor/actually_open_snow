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
        <label className="block text-xs text-gray-500" htmlFor="alert-email">
          Email
        </label>
        <input
          id="alert-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-500" htmlFor="alert-threshold">
          Alert me at
        </label>
        <div className="flex items-center gap-1">
          <input
            id="alert-threshold"
            type="number"
            min={1}
            max={100}
            step={1}
            value={thresholdIn}
            onChange={(e) => setThresholdIn(Number(e.target.value))}
            className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <span className="text-sm text-gray-500">&quot;+ forecast</span>
        </div>
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 dark:border-gray-700"
      >
        {status === "loading" ? "Subscribing…" : "Get snow alerts"}
      </button>
      {status === "error" && <p className="w-full text-xs text-red-500">{message}</p>}
    </form>
  );
}
