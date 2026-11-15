import type { AvalancheForecast, AvalancheZone } from "@/lib/models/types";
import DangerRose from "@/components/location/DangerRose";
import Section from "@/components/ui/Section";

// BC-01 card. avalanche.org data comes in three shapes, verified live in
// Nov 2026, and each gets an honest rendering rather than a fake full one:
//  1. Full forecast (e.g. CAIC): danger by elevation band, today + tomorrow,
//     avalanche problems, bottom line → rose, badges, problems, text.
//  2. Overall rating only (e.g. UAC, which publishes the detail on its own
//     site) → one overall badge + a link to the center for the breakdown.
//  3. No rating posted yet (early season, or the center hasn't issued one
//     today) → say so plainly, with the center's general travel advice.

const DANGER_NAMES = ["", "Low", "Moderate", "Considerable", "High", "Extreme"];
const DANGER_BG = ["bg-muted", "bg-green-500", "bg-yellow-400", "bg-orange-500", "bg-red-600", "bg-black"];

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

function DangerBadge({ label, level }: { label: string; level: number | null }) {
  const color = level != null && level >= 1 && level <= 5 ? DANGER_BG[level] : "bg-muted";
  return (
    <div className="text-center">
      <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold shadow-sm ${level === 2 ? "text-black" : "text-white"} ${color}`}>
        {level ?? "–"}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      {level != null && <div className="text-xs font-medium">{dangerName(level)}</div>}
    </div>
  );
}

// "northwest upper" → grouped "Above treeline: NW, N, NE"
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

export default function AvalancheCard({ zone, forecast }: { zone: AvalancheZone | null; forecast: AvalancheForecast | null }) {
  const overall = forecast?.overallDanger ?? zone?.overallDanger ?? null;
  const zoneName = forecast?.zoneName ?? zone?.zoneName ?? "";
  const where = zone ? `${zoneName} · ${zone.centerName}` : undefined;
  const summary = !zone
    ? "No forecast zone here"
    : overall != null
      ? `${dangerName(overall)} (${overall}/5)${forecast?.hasBandRatings ? ` · ${forecast.dangerAboveTreeline ?? "–"} / ${forecast.dangerNearTreeline ?? "–"} / ${forecast.dangerBelowTreeline ?? "–"} above / near / below treeline` : ""}`
      : "No danger rating posted today";
  const centerLink = forecast?.url ?? zone?.link ?? null;

  return (
    <Section id="avalanche" title="Avalanche forecast" meta={where} summary={summary} defaultOpen={false}>
      {!zone ? (
        <p className="text-sm text-muted-foreground">
          No avalanche forecast zone covers this point (outside avalanche.org coverage, or the point/zone-boundary API needs verification — see ARCHITECTURE.md).
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          {forecast?.hasBandRatings ? (
            <>
              <DangerRose
                aboveTreeline={forecast.dangerAboveTreeline}
                nearTreeline={forecast.dangerNearTreeline}
                belowTreeline={forecast.dangerBelowTreeline}
              />
              <div className="flex justify-center gap-6">
                <DangerBadge label="Above treeline" level={forecast.dangerAboveTreeline} />
                <DangerBadge label="Near treeline" level={forecast.dangerNearTreeline} />
                <DangerBadge label="Below treeline" level={forecast.dangerBelowTreeline} />
              </div>
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
                {zone.centerName} shares only its overall rating with avalanche.org. The breakdown by elevation and aspect is in the full forecast on its
                site.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-muted/50 p-3">
              <p className="font-medium">No danger rating posted for {zoneName} today.</p>
              <p className="mt-1 text-muted-foreground">
                {zone.centerName} hasn&apos;t issued a rating — common early in the season before there&apos;s a real snowpack. Avalanches can still
                happen wherever there&apos;s enough snow to slide; check the center&apos;s page for conditions updates.
              </p>
            </div>
          )}

          {forecast && forecast.problems.length > 0 && (
            <div>
              <h3 className="mb-1 font-semibold">Avalanche problems</h3>
              <ul className="space-y-1.5">
                {forecast.problems.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="rounded-lg bg-muted/60 px-3 py-2">
                    <div className="font-medium">
                      {i + 1}. {p.name}
                      {p.likelihood && <span className="font-normal text-muted-foreground"> · {p.likelihood}</span>}
                      {p.size.length > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · size D{p.size[0]}
                          {p.size.length > 1 && p.size[p.size.length - 1] !== p.size[0] ? `–D${p.size[p.size.length - 1]}` : ""}
                        </span>
                      )}
                    </div>
                    {p.locations.length > 0 && <div className="text-xs text-muted-foreground">{describeLocations(p.locations)}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {forecast?.summary && <p className="whitespace-pre-line text-foreground/90">{forecast.summary}</p>}

          <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
            {forecast?.issuedAt ? <span>Issued {fmtIssued(forecast.issuedAt, zone.timezone)}</span> : <span />}
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
