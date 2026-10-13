import type { MeasuredSnowNearby } from "@/lib/data-sources/snotel";

// The Today/12h/7d pills are a weather model's snowfall, which can count
// near-freezing precipitation as snow that never sticks (Tony Grove, Oct
// 2026: model 5"+, SNOTEL depth 0→1"). This line shows what the nearest
// SNOTEL depth sensor actually measured, so the two can be read side by side.
export default function MeasuredSnow({ m, className = "" }: { m?: MeasuredSnowNearby | null; className?: string }) {
  if (!m) return null;
  const distance = m.distanceMi < 0.1 ? "on site" : `${m.distanceMi.toFixed(1)} mi`;
  return (
    <p
      className={`mt-1.5 text-xs text-muted-foreground ${className}`}
      title={`${m.stationName} SNOTEL, ${m.elevationFt.toLocaleString()} ft — ultrasonic depth sensor (1" resolution), reading at ${new Date(m.readingAt).toLocaleString()}. The pills above are a model estimate.`}
    >
      <span className="font-semibold text-foreground/80">Measured</span> · {m.stationName} SNOTEL ({distance}):{" "}
      <span className="font-semibold text-foreground/80">{m.depthIn}&quot;</span> on ground,{" "}
      <span className="font-semibold text-foreground/80">+{m.gain24hIn}&quot;</span> 24h
    </p>
  );
}
