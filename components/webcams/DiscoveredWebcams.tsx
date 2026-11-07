"use client";

import { useEffect, useState } from "react";
import WebcamGrid from "@/components/webcams/WebcamGrid";
import Spinner from "@/components/ui/Spinner";
import type { Webcam } from "@/lib/models/types";

interface DiscoveryResult {
  pageUrl: string | null;
  website: string | null;
  webcams: Webcam[];
}

// Webcams for a catalog ski area (no hand-verified list in
// data/webcams.json): read live from the resort's own website by
// /api/webcams/discover. Loaded after the page so a slow resort site never
// delays the forecast; renders a link-out when nothing embeddable is found.
export default function DiscoveredWebcams({ resortId, resortName }: { resortId: string; resortName: string }) {
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/webcams/discover?resortId=${encodeURIComponent(resortId)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: DiscoveryResult) => setResult(body))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [resortId]);

  const linkUrl = result?.pageUrl ?? result?.website ?? null;

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold tracking-tight">Live webcams</h2>
        {linkUrl && (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
            {result?.pageUrl ? "Resort webcam page ↗" : "Resort website ↗"}
          </a>
        )}
      </div>
      {!result && !failed && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" /> Finding {resortName}&apos;s webcams…
        </p>
      )}
      {result && result.webcams.length > 0 && (
        <>
          <WebcamGrid webcams={result.webcams} />
          <p className="mt-3 text-xs text-muted-foreground">Found automatically on {resortName}&apos;s website — names and cameras come straight from their page.</p>
        </>
      )}
      {(failed || (result && result.webcams.length === 0)) && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t pull embeddable cams from {resortName}&apos;s site
          {linkUrl ? (
            <>
              {" "}—{" "}
              <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
                view them there ↗
              </a>
            </>
          ) : (
            "."
          )}
        </p>
      )}
    </section>
  );
}
