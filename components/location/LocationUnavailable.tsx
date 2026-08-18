// Rendered directly by the location pages when getLocationDashboardData
// throws, instead of relying on Next's app/location/error.tsx convention
// — that boundary did NOT catch this failure mode live-tested against a
// real Open-Meteo 429 (the response was Next's own generic
// `__next_error__` shell, not our error.tsx content), on Next.js 16.3.1.
// Handling it explicitly in the page is predictable and was verified to
// actually work, rather than trusting an unverified framework convention.
export default function LocationUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <div className="text-4xl">⛅</div>
      <h1 className="text-lg font-bold tracking-tight">Conditions temporarily unavailable</h1>
      <p className="text-sm text-muted-foreground">
        One of the upstream weather/avalanche APIs didn&apos;t respond in time — this is usually a rate limit or a
        brief outage, not a bug in this page. Try again in a moment.
      </p>
      <a href={retryHref} className="btn-primary inline-flex">
        Retry
      </a>
    </div>
  );
}
