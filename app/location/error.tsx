"use client";

// Catches failures from getLocationDashboardData (most commonly an
// upstream API being rate-limited or briefly down) so a location page
// shows a retriable message instead of Next's generic crash page. Found
// necessary live: Open-Meteo's free tier genuinely 429s under sustained
// call volume, even after this app's one built-in retry.
export default function LocationError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Conditions temporarily unavailable</h1>
      <p className="text-sm text-gray-500">
        One of the upstream weather/avalanche APIs didn&apos;t respond in time — this is usually a rate limit or a brief
        outage, not a bug in this page. Try again in a moment.
      </p>
      <button
        onClick={reset}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:border-blue-400 hover:text-blue-600 dark:border-gray-700"
      >
        Retry
      </button>
      {process.env.NODE_ENV === "development" && (
        <pre className="mt-4 overflow-x-auto rounded bg-gray-100 p-3 text-left text-xs text-gray-600 dark:bg-gray-900">
          {error.message}
        </pre>
      )}
    </div>
  );
}
