import type { KeyboardEvent, PointerEvent } from "react";

// The ⋮⋮ handle for lib/use-drag-reorder.ts. touch-none is what lets a
// finger drag it without scrolling the page; the rest of the row still
// scrolls and taps normally.
export default function DragGrip({
  label,
  className = "",
  onPointerDown,
  onKeyDown,
}: {
  label: string;
  className?: string;
  onPointerDown: (e: PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Reorder ${label} (drag, or use arrow keys)`}
      title="Drag to reorder"
      className={`flex h-8 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing ${className}`}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onClick={(e) => e.preventDefault()}
    >
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
        <circle cx="2" cy="3" r="1.5" />
        <circle cx="8" cy="3" r="1.5" />
        <circle cx="2" cy="8" r="1.5" />
        <circle cx="8" cy="8" r="1.5" />
        <circle cx="2" cy="13" r="1.5" />
        <circle cx="8" cy="13" r="1.5" />
      </svg>
    </button>
  );
}
