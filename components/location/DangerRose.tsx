// BC-01: the standard North American avalanche "danger rose" — 8 aspect
// wedges × 3 elevation rings. Center = above treeline (the summit), outer
// ring = below treeline, matching the roses avalanche centers (UAC, CAIC)
// publish themselves.
//
// Two inputs:
// - `rose`: 24 per-aspect danger levels (UAC publishes these) — each wedge
//   gets its own color.
// - band levels only (most centers via avalanche.org): each ring is one
//   color, an honest subset rather than an invented per-aspect breakdown.
//
// ProblemRose reuses the geometry to show where one avalanche problem
// exists (filled) vs. not (gray).

const ASPECT_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// Standard North American danger scale colors, 1 Low … 5 Extreme.
const DANGER_COLORS = ["#d1d5db", "#50b848", "#fff200", "#f7941e", "#ed1c24", "#231f20"];
const PROBLEM_COLOR = "#3fb3e9";
const ABSENT_COLOR = "#d1d5db";

export const dangerColor = (level: number | null) => (level != null && level >= 1 && level <= 5 ? DANGER_COLORS[level] : DANGER_COLORS[0]);

const C = 100;
// Ring radii, inner → outer: above, near, below treeline.
const RADII: [number, number][] = [
  [0, 28],
  [28, 54],
  [54, 80],
];

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function wedgePath(band: number, aspect: number) {
  const [r0, r1] = RADII[band];
  const a0 = aspect * 45 - 22.5;
  const a1 = aspect * 45 + 22.5;
  const [x1, y1] = polar(r1, a0);
  const [x2, y2] = polar(r1, a1);
  if (r0 === 0) return `M${C},${C} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} Z`;
  const [x3, y3] = polar(r0, a1);
  const [x4, y4] = polar(r0, a0);
  return `M${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x4},${y4} Z`;
}

function RoseSvg({ fill, size, label, showLabels = true }: { fill: (band: number, aspect: number) => string; size: number; label: string; showLabels?: boolean }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className="shrink-0" role="img" aria-label={label}>
      {[0, 1, 2].map((band) =>
        ASPECT_LABELS.map((_, aspect) => (
          <path key={`${band}-${aspect}`} d={wedgePath(band, aspect)} fill={fill(band, aspect)} stroke="var(--card, #fff)" strokeWidth={1.5} />
        ))
      )}
      {showLabels &&
        ASPECT_LABELS.map((l, i) => {
          const [x, y] = polar(92, i * 45);
          return (
            <text key={l} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" fontSize={11} fontWeight={l === "N" ? 700 : 500}>
              {l}
            </text>
          );
        })}
    </svg>
  );
}

export default function DangerRose({
  rose,
  aboveTreeline,
  nearTreeline,
  belowTreeline,
}: {
  rose?: (number | null)[] | null;
  aboveTreeline: number | null;
  nearTreeline: number | null;
  belowTreeline: number | null;
}) {
  const bands = [aboveTreeline, nearTreeline, belowTreeline];
  const perAspect = rose != null && rose.length === 24;
  return (
    <div className="flex items-center gap-4">
      <RoseSvg
        size={150}
        label="Avalanche danger rose"
        fill={(band, aspect) => dangerColor(perAspect ? rose![band * 8 + aspect] : bands[band])}
      />
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Center = above treeline, middle ring = near treeline, outer ring = below treeline.</p>
        <p>
          {perAspect
            ? "Colored by aspect, as published by the avalanche center."
            : "One color per elevation band — this center doesn't publish a per-aspect breakdown through the feed; see the problems below and the full forecast."}
        </p>
      </div>
    </div>
  );
}

/** Where one avalanche problem exists: filled wedges = present. `locations` like "northwest upper". */
export function ProblemRose({ locations, size = 64 }: { locations: string[]; size?: number }) {
  const ASPECTS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];
  const BANDS = ["upper", "middle", "lower"];
  const present = new Set(
    locations.map((l) => {
      const [aspect, band] = l.split(" ");
      return `${BANDS.indexOf(band)}-${ASPECTS.indexOf(aspect)}`;
    })
  );
  return (
    <RoseSvg
      size={size}
      showLabels={false}
      label={`Where: ${locations.join(", ")}`}
      fill={(band, aspect) => (present.has(`${band}-${aspect}`) ? PROBLEM_COLOR : ABSENT_COLOR)}
    />
  );
}
