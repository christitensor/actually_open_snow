import Spinner from "@/components/ui/Spinner";

// Covers both [slug] and pin routes below it: getLocationDashboardData
// fans out to several upstream weather/avalanche APIs before the page can
// render, which without this file left a click on a resort card (or "My
// location") looking unresponsive for a second or more — App Router shows
// this automatically as a Suspense fallback the instant navigation starts.
export default function LocationLoading() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-16 text-center text-muted-foreground">
      <Spinner className="h-6 w-6 text-primary" />
      <p className="text-sm">Loading conditions…</p>
    </div>
  );
}
