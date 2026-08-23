// BC-01: the classic UAC/avalanche.org "danger rose" — a compass wheel
// with three rings (above/near/below treeline). The real rose also varies
// color by aspect within a ring when a specific avalanche problem is
// aspect-restricted; that detail lives in avalanche.org's
// forecast_avalanche_problems array, which this app doesn't parse. It's
// off-season everywhere in the US as of this build (Aug 2026), so that
// field comes back `[]` on every live check — there's no way to verify
// its real field names against actual data right now (see the same
// caveat on lib/data-sources/avalanche-org.ts's danger[] parsing). Rather
// than guess field names for a safety-relevant diagram, this renders each
// ring as a uniform color from the three elevation-band values this app
// already verifies live — an honest subset of the full rose, not a fake
// full one. "Full forecast ↗" links to the real thing.

const ASPECT_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// Standard North American avalanche danger scale, 1 (Low) through 5
// (Extreme) — matches DangerBadge's colors in LocationDashboard.tsx.
const DANGER_COLORS = ["#9ca3af", "#22c55e", "#facc15", "#f97316", "#dc2626", "#000000"];

function dangerColor(level: number | null): string {
  return level != null && level >= 0 && level <= 5 ? DANGER_COLORS[level] : DANGER_COLORS[0];
}

function labelPoint(index: number, radius: number, center: number) {
  const angle = (index * 45 - 90) * (Math.PI / 180); // 0deg = N = straight up
  return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
}

export default function DangerRose({
  aboveTreeline,
  nearTreeline,
  belowTreeline,
}: {
  aboveTreeline: number | null;
  nearTreeline: number | null;
  belowTreeline: number | null;
}) {
  const center = 100;
  const rings = [
    { level: aboveTreeline, outerR: 80, innerR: 55 },
    { level: nearTreeline, outerR: 55, innerR: 30 },
    { level: belowTreeline, outerR: 30, innerR: 0 },
  ];

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 200 200" width={140} height={140} className="shrink-0" role="img" aria-label="Avalanche danger rose">
        {rings.map((r, i) =>
          r.innerR > 0 ? (
            <circle
              key={i}
              cx={center}
              cy={center}
              r={(r.outerR + r.innerR) / 2}
              fill="none"
              stroke={dangerColor(r.level)}
              strokeWidth={r.outerR - r.innerR}
            />
          ) : (
            <circle key={i} cx={center} cy={center} r={r.outerR} fill={dangerColor(r.level)} />
          )
        )}
        {/* Thin compass-direction dividers, background-colored so they read as gaps between the 8 wedges a full rose would show. */}
        {ASPECT_LABELS.map((_, i) => {
          const p = labelPoint(i, 80, center);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={p.x}
              y2={p.y}
              stroke="var(--color-card, #fff)"
              strokeWidth={1.5}
            />
          );
        })}
        <circle cx={center} cy={center} r={80} fill="none" stroke="var(--color-border, #e5e7eb)" strokeWidth={1} />
        {ASPECT_LABELS.map((label, i) => {
          const p = labelPoint(i, 92, center);
          return (
            <text
              key={label}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
              fontWeight={label === "N" ? 700 : 500}
            >
              {label}
            </text>
          );
        })}
      </svg>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Shown by elevation band (outer ring = above treeline, inner = below).</p>
        <p>UAC&apos;s full rose also varies by aspect within a band — see the full forecast for that detail.</p>
      </div>
    </div>
  );
}
