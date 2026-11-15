import { parseAfdSections } from "@/lib/util/afd-format";
import type { AfdProduct } from "@/lib/models/types";
import Section from "@/components/ui/Section";

// EXP-01 (blocked, per TRACE_MATRIX.md — no free feed replaces OpenSnow's
// human forecaster posts) was already substituted by SNOW-03's one-line
// derived summary above this section, but that line only ever *mentions*
// whether the AFD flags uncertainty — it discards the actual forecaster
// text. This renders that text directly instead: NOAA's own meteorologist
// writes real prose about what's driving the forecast, which is closer to
// what "commentary" means than a single reconciliation sentence.
const IRRELEVANT_HEADING_RE = /aviation|marine|hydrology|watches|advisories/i;

export default function ForecastDiscussion({ afd }: { afd: AfdProduct | null }) {
  if (!afd) return null;
  const sections = parseAfdSections(afd.text).filter((s) => !IRRELEVANT_HEADING_RE.test(s.heading));
  if (sections.length === 0) return null;

  const issued = new Date(afd.issuedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <Section
      id="forecast-discussion"
      title="Forecast discussion"
      meta={`NWS ${afd.wfo} · ${issued}`}
      summary="The NWS meteorologist's reasoning behind the forecast"
      defaultOpen={false}
    >
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.heading}>
            <h3 className="mb-1 text-sm font-semibold text-foreground">{s.heading}</h3>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mb-2 text-sm leading-relaxed text-muted-foreground last:mb-0">
                {p}
              </p>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        The National Weather Service&apos;s own forecast discussion, unedited — the meteorologist reasoning behind
        the numbers above.
      </p>
    </Section>
  );
}
