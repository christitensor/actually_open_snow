import WebcamGrid from "@/components/webcams/WebcamGrid";
import { resorts } from "@/data/resorts";
import { webcams } from "@/data/webcams";
import type { Webcam } from "@/lib/models/types";

// With 200+ cams across ~90 resorts, one flat grid is unusable (and would
// try to load every snapshot/iframe at once). Group by state, then resort,
// each resort in a collapsed <details>: a closed <details> doesn't render
// its content, so the lazy images/iframes inside don't load until opened.
export default function WebcamsPage() {
  const byResort = new Map<string, Webcam[]>();
  const other: Webcam[] = [];
  for (const cam of webcams) {
    if (!cam.resortId) {
      other.push(cam);
      continue;
    }
    const list = byResort.get(cam.resortId) ?? [];
    list.push(cam);
    byResort.set(cam.resortId, list);
  }

  const byState = new Map<string, { id: string; name: string; cams: Webcam[] }[]>();
  for (const r of resorts) {
    const cams = byResort.get(r.id);
    if (!cams) continue;
    const list = byState.get(r.state) ?? [];
    list.push({ id: r.id, name: r.name, cams });
    byState.set(r.state, list);
  }
  for (const list of byState.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const states = [...byState.keys()].sort();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Webcams</h1>
        <p className="text-sm text-muted-foreground">
          See what&apos;s actually happening, not just the forecast. {webcams.length} cams across {byResort.size} resorts — open a resort to load its cams. Live images refresh every minute.
        </p>
      </header>

      {states.map((state) => (
        <section key={state} className="space-y-2">
          <h2 className="font-bold tracking-tight">{state}</h2>
          {byState.get(state)!.map(({ id, name, cams }) => {
            const live = cams.filter((c) => c.imageUrl || c.videoEmbedUrl).length;
            return (
              <details key={id} id={id} className="card group">
                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium">
                  <span>{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {live > 0 ? `${live} live` : "link to resort cams"}
                  </span>
                </summary>
                <div className="p-3 pt-0">
                  <WebcamGrid webcams={cams} />
                </div>
              </details>
            );
          })}
        </section>
      ))}

      {other.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-bold tracking-tight">Roads</h2>
          <WebcamGrid webcams={other} />
        </section>
      )}
    </div>
  );
}
