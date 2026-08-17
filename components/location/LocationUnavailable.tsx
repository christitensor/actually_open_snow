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
      <h1 className="text-lg font-semibold">Conditions temporarily unavailable</h1>
      <p className="text-sm text-gray-500">
        One of the upstream weather/avalanche APIs didn&apos;t respond in time — this is usually a rate limit or a
        brief outage, not a bug in this page. Try again in a moment.
      </p>
      <a
        href={retryHref}
        className="inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-700"
      >
        Retry
      </a>
    </div>
  );
}
