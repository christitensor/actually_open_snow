import Spinner from "@/components/ui/Spinner";

// Home fetches a batch of Open-Meteo snowfall calls before it can render;
// ISR (15 min revalidate) keeps this fast most of the time, but a cache
// miss or a navigation back from another page otherwise looked frozen.
export default function HomeLoading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
      <Spinner className="h-6 w-6 text-primary" />
      <p className="text-sm">Loading…</p>
    </div>
  );
}
