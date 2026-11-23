// How to save your own backcountry spot, in four steps. Shown as the second
// step of the first-sign-in welcome, and reopenable from the home page
// ("How it works") and Settings.

const STEPS: { icon: string; title: string; body: string }[] = [
  {
    icon: "🗺️",
    title: "Tap the map",
    body: "Tap anywhere on the map, or search for a peak, trailhead or coordinates (e.g. 40.59, -111.64).",
  },
  {
    icon: "🌨️",
    title: "Check that exact spot",
    body: "You get the forecast, snow and avalanche danger for that point, not just the nearest resort.",
  },
  {
    icon: "📍",
    title: "Name it and save",
    body: "Give it a name like “Cardiff Bowl” and tap Save spot.",
  },
  {
    icon: "📱",
    title: "Find it anywhere",
    body: "It’s listed under Your backcountry spots on the home page, on every device you sign in on.",
  },
];

export default function SpotTutorial() {
  return (
    <ol className="space-y-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl" aria-hidden>
            {s.icon}
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {i + 1}
            </span>
          </span>
          <div>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="text-xs text-muted-foreground">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
