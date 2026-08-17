"use client";

import { useEffect, useState } from "react";
import type { Webcam } from "@/lib/models/types";

// MAP-16: dedicated webcam page. Live snapshots (imageUrl set) refresh on
// an interval via a cache-busting query param; page-link-only entries
// just link out.
const REFRESH_MS = 60_000;

export default function WebcamGrid({ webcams }: { webcams: Webcam[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const live = webcams.filter((c) => c.imageUrl);
  const linkOnly = webcams.filter((c) => !c.imageUrl);

  return (
    <div className="space-y-8">
      {live.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Live</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((cam) => (
              <div key={cam.id} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element -- external live snapshot, not an optimizable static asset */}
                <img
                  src={`${cam.imageUrl}?t=${tick}`}
                  alt={cam.name}
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{cam.name}</span>
                  <a href={cam.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                    Full page ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {linkOnly.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">More webcams (link out)</h2>
          <p className="mb-2 text-xs text-gray-500">
            These sources don&apos;t have a verified direct image URL yet — click through to the resort/DOT&apos;s own page.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {linkOnly.map((cam) => (
              <li key={cam.id}>
                <a
                  href={cam.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-800"
                >
                  {cam.name} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
