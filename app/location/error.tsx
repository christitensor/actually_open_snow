"use client";

// Defense-in-depth for render-time errors in LocationDashboard itself
// (not data-fetching — that's now caught explicitly in each page.tsx's
// try/catch around getLocationDashboardData, wrapping in
// LocationUnavailable instead). This boundary was originally written to
// catch the data-fetch failure too, but live testing against a real
// Open-Meteo 429 showed Next 16.3.1 does NOT route that failure through
// this file — the response was Next's own generic `__next_error__` shell,
// not this component. Kept as a second line of defense for genuinely
// unexpected render errors, but don't rely on it for the known upstream-
// API-failure case; that path is verified via the explicit try/catch.

export default function LocationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <div className="text-4xl">⛅</div>
      <h1 className="text-lg font-bold tracking-tight">Conditions temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">
        One of the upstream weather/avalanche APIs didn&apos;t respond in time — this is usually a rate limit or a brief
        outage, not a bug in this page. Try again in a moment.
      </p>
      <button onClick={reset} className="btn-primary">
        Retry
      </button>
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-4 overflow-x-auto rounded-xl bg-muted p-3 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}
    </div>
  );
}
