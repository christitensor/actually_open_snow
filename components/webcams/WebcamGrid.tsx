"use client";

import { useEffect, useState } from "react";
import type { Webcam } from "@/lib/models/types";

// MAP-16: dedicated webcam page. Live snapshots (imageUrl set) refresh on
// an interval via a cache-busting query param; live video (videoEmbedUrl
// set, e.g. a YouTube livestream embed) plays continuously and is never
// reloaded, since forcing an iframe reload would interrupt playback for no
// benefit; page-link-only entries just link out.
const REFRESH_MS = 60_000;

// Some imageUrls already carry a query string (e.g. Alta's PrismCam
// preview endpoint, ?c=65&s=720) — naively appending "?t=" produced a
// second "?", which the endpoint doesn't parse as an extra param and
// instead treats the whole thing as a single malformed query, returning a
// tiny broken-image placeholder instead of the real snapshot (confirmed
// live: 184 bytes vs. 416KB for the same URL with "&t=" instead).
//
// Some CDNs go further and 404 on any param name they don't recognize
// instead of just ignoring it (confirmed live: skiutah.com's blob endpoint
// returns 200 for "?_ts=…" but 404 for "?t=…") — cacheBustParam lets a
// webcam entry specify the name that CDN actually accepts.
function withCacheBust(url: string, tick: number, paramName = "t"): string {
  return `${url}${url.includes("?") ? "&" : "?"}${paramName}=${tick}`;
}

export default function WebcamGrid({ webcams }: { webcams: Webcam[] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const liveImages = webcams.filter((c) => c.imageUrl);
  const liveVideos = webcams.filter((c) => c.videoEmbedUrl);
  const linkOnly = webcams.filter((c) => !c.imageUrl && !c.videoEmbedUrl);

  return (
    <div className="space-y-8">
      {(liveImages.length > 0 || liveVideos.length > 0) && (
        <section>
          <h2 className="mb-3 font-bold tracking-tight">Live</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveVideos.map((cam) => (
              <div key={cam.id} className="card overflow-hidden">
                <iframe
                  src={cam.videoEmbedUrl}
                  title={cam.name}
                  className="aspect-video w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  loading="lazy"
                />
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{cam.name}</span>
                  <a href={cam.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
                    Full page ↗
                  </a>
                </div>
              </div>
            ))}
            {liveImages.map((cam) => (
              <div key={cam.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- external live snapshot, not an optimizable static asset */}
                <img
                  src={withCacheBust(cam.imageUrl!, tick, cam.cacheBustParam)}
                  alt={cam.name}
                  className="aspect-video w-full object-cover"
                  loading="lazy"
                />
                <div className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-medium">{cam.name}</span>
                  <a href={cam.pageUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
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
          <h2 className="mb-3 font-bold tracking-tight">More webcams (link out)</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            These sources don&apos;t have a verified direct image URL yet — click through to the resort/DOT&apos;s own page.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {linkOnly.map((cam) => (
              <li key={cam.id}>
                <a href={cam.pageUrl} target="_blank" rel="noopener noreferrer" className="card block px-3 py-2 text-sm font-medium transition hover:border-primary hover:text-primary">
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
