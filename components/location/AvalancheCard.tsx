import type { AvalancheForecast, AvalancheZone } from "@/lib/models/types";
import DangerRose, { ProblemRose, dangerColor } from "@/components/location/DangerRose";
import Section from "@/components/ui/Section";
import { safeHttpUrl } from "@/lib/util/url";

// BC-01 card. Forecast data arrives in a few shapes (all verified live,
// Nov 2026), and each gets an honest rendering rather than a fake full one:
//  1. UAC (Utah), from UAC's own feed: per-aspect rose, problems with
//     where/likelihood/size/discussion, bottom line, warning, recent
//     activity + weather discussion.
//  2. Full avalanche.org forecast (e.g. CAIC): band ratings today and
//     tomorrow, problems, bottom line.
//  3. Overall rating only → one badge + link to the center.
//  4. No rating posted yet (early season) → say so plainly, with whatever
//     text the forecaster did publish.

const DANGER_NAMES = ["", "Low", "Moderate", "Considerable", "High", "Extreme"];
const dangerName = (l: number | null) => (l != null ? DANGER_NAMES[l] ?? "" : "");

function fmtIssued(iso: string, timeZone: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timeZone ?? undefined,
      timeZoneName: "short",
    });
  } catch {
    return "";
  }
}

function fmtDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

function DangerBadge({ label, level }: { label: string; level: number | null }) {
  return (
    <div className="text-center">
      <div
        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-sm ${level === 2 || level == null ? "text-black" : "text-white"}`}
        style={{ background: dangerColor(level) }}
      >
        {level ?? "–"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {level != null && <div className="text-xs font-medium">{dangerName(level)}</div>}
    </div>
  );
}

// "northwest upper" → "Above treeline: NW, N, NE"
const BAND_LABEL: Record<string, string> = { upper: "Above treeline", middle: "Near treeline", lower: "Below treeline" };
const ASPECT_ABBR: Record<string, string> = {
  north: "N", northeast: "NE", east: "E", southeast: "SE", south: "S", southwest: "SW", west: "W", northwest: "NW",
};
function describeLocations(locations: string[]): string {
  const byBand = new Map<string, string[]>();
  for (const loc of locations) {
    const [aspect, band] = loc.split(" ");
    if (!band) continue;
    byBand.set(band, [...(byBand.get(band) ?? []), ASPECT_ABBR[aspect] ?? aspect]);
  }
  return ["upper", "middle", "lower"]
    .filter((b) => byBand.has(b))
    .map((b) => `${BAND_LABEL[b]}: ${byBand.get(b)!.length === 8 ? "all aspects" : byBand.get(b)!.join(", ")}`)
    .join(" · ");
}

// avalanche.org sizes are D-scale numbers ("1.5"); UAC's are words ("Large").
function describeSize(size: string[]): string {
  if (size.length === 0) return "";
  if (!/^\d/.test(size[0])) return size.join("–").toLowerCase();
  const lo = size[0];
  const hi = size[size.length - 1];
  return `D${lo}${hi !== lo ? `–D${hi}` : ""}`;
}

export default function AvalancheCard({ zone, forecast }: { zone: AvalancheZone | null; forecast: AvalancheForecast | null }) {
  const overall = forecast?.overallDanger ?? zone?.overallDanger ?? null;
  const zoneName = forecast?.zoneName ?? zone?.zoneName ?? "";
  const where = zone ? `${zoneName} · ${zone.centerName}` : undefined;
  const summary = !zone
    ? "No forecast zone here"
    : forecast?.warning
      ? `⚠️ Avalanche warning · ${dangerName(overall)}`
      : overall != null
        ? `${dangerName(overall)} (${overall}/5)${forecast?.hasBandRatings ? ` · ${forecast.dangerAboveTreeline ?? "–"} / ${forecast.dangerNearTreeline ?? "–"} / ${forecast.dangerBelowTreeline ?? "–"} above / near / below treeline` : ""}${forecast?.problems.length ? ` · ${forecast.problems.map((p) => p.name).join(", ")}` : ""}`
        : "No danger rating posted today";
  // URL comes from the UAC / avalanche.org feeds; only render http(s) links.
  const rawLink = forecast?.url ?? zone?.link ?? null;
  const centerLink = rawLink ? safeHttpUrl(rawLink, "https://avalanche.org/") : null;

  return (
    <Section id="avalanche" title="Avalanche forecast" meta={where} summary={summary} defaultOpen={false}>
      {!zone ? (
        <p className="text-sm text-muted-foreground">
          No avalanche forecast zone covers this point (outside avalanche.org coverage, or the point/zone-boundary API needs verification — see ARCHITECTURE.md).
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {forecast?.warning && (
            <div className="rounded-xl bg-red-600 px-3 py-2 text-white">
              <div className="font-bold">Avalanche warning</div>
              <p className="whitespace-pre-line">{forecast.warning}</p>
            </div>
          )}

          {forecast?.isStale && forecast.forecastDate && (
            <p className="rounded-xl bg-amber-100 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              No current forecast — the latest from {zone.centerName} for this zone is from {fmtDate(forecast.forecastDate)}.
            </p>
          )}

          {forecast?.hasBandRatings ? (
            <>
              <DangerRose
                rose={forecast.rose}
                aboveTreeline={forecast.dangerAboveTreeline}
                nearTreeline={forecast.dangerNearTreeline}
                belowTreeline={forecast.dangerBelowTreeline}
              />
              <div className="flex justify-center gap-6">
                <DangerBadge label="Above treeline" level={forecast.dangerAboveTreeline} />
                <DangerBadge label="Near treeline" level={forecast.dangerNearTreeline} />
                <DangerBadge label="Below treeline" level={forecast.dangerBelowTreeline} />
              </div>
              {forecast.rose && <p className="text-center text-xs text-muted-foreground">Badges show the highest rating on any aspect in that band.</p>}
              {forecast.tomorrow && (
                <p className="text-center text-xs text-muted-foreground">
                  Tomorrow: {forecast.tomorrow.above ?? "–"} / {forecast.tomorrow.near ?? "–"} / {forecast.tomorrow.below ?? "–"} (above / near / below treeline)
                </p>
              )}
            </>
          ) : overall != null ? (
            <div className="flex items-center gap-3 rounded-xl border border-border p-3">
              <DangerBadge label="Overall" level={overall} />
              <p className="text-muted-foreground">
                {zone.centerName} shares only its overall rating through the feed. The breakdown by elevation and aspect is in the full forecast on its site.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <p className="font-medium">No danger rating posted for {zoneName} today.</p>
              <p className="mt-1 text-muted-foreground">
                Common early in the season before there&apos;s a real snowpack. Avalanches can still happen wherever there&apos;s enough snow to slide.
              </p>
            </div>
          )}

          {forecast?.summary && (
            <div>
              <h3 className="mb-1 font-semibold">Bottom line</h3>
              <p className="whitespace-pre-line text-foreground/90">{forecast.summary}</p>
            </div>
          )}

          {forecast && forecast.problems.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Avalanche problems</h3>
              <ul className="space-y-2">
                {forecast.problems.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="rounded-lg bg-muted/60 p-3">
                    <div className="flex gap-3">
                      {p.locations.length > 0 && <ProblemRose locations={p.locations} />}
                      <div className="min-w-0">
                        <div className="font-medium">
                          {i + 1}. {p.name}
                        </div>
                        {(p.likelihood || p.size.length > 0) && (
                          <div className="text-xs text-muted-foreground">
                            {p.likelihood && <>Likelihood: <span className="font-medium text-foreground">{p.likelihood.toLowerCase()}</span></>}
                            {p.likelihood && p.size.length > 0 && " · "}
                            {p.size.length > 0 && <>Size: <span className="font-medium text-foreground">{describeSize(p.size)}</span></>}
                          </div>
                        )}
                        {p.locations.length > 0 && <div className="mt-0.5 text-xs text-muted-foreground">{describeLocations(p.locations)}</div>}
                      </div>
                    </div>
                    {p.description && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-medium text-primary">Forecaster discussion</summary>
                        <p className="mt-1 whitespace-pre-line text-foreground/90">{p.description}</p>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {forecast && forecast.discussion.length > 0 && (
            <details className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer font-medium">
                {forecast.discussion.map((d) => d.heading).join(" · ")}
              </summary>
              <div className="mt-2 space-y-3">
                {forecast.discussion.map((d) => (
                  <div key={d.heading}>
                    <h4 className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{d.heading}</h4>
                    <p className="whitespace-pre-line text-foreground/90">{d.text}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {forecast?.issuedAt ? `Issued ${fmtIssued(forecast.issuedAt, zone.timezone)}` : forecast?.forecastDate ? `Forecast for ${fmtDate(forecast.forecastDate)}` : ""}
              {forecast?.author ? ` · ${forecast.author}` : ""}
            </span>
            {centerLink && (
              <a href={centerLink} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary hover:underline">
                Full forecast at {zone.centerName} ↗
              </a>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
