"use client";

import { useEffect, useRef, type ReactNode } from "react";

// The Snow Summary timeline is wider than a phone screen. Open it scrolled
// to the [data-scroll-anchor] group (the most recent history block), so
// the last 5 days and the start of the forecast are what you see first;
// older history is a swipe left, the long-range outlook a swipe right.
export default function SnowTimelineScroller({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    const anchor = container?.querySelector<HTMLElement>("[data-scroll-anchor]");
    if (!container || !anchor) return;
    const anchorLeft = anchor.getBoundingClientRect().left - container.getBoundingClientRect().left;
    container.scrollLeft = Math.max(0, container.scrollLeft + anchorLeft - 16);
  }, []);

  return (
    <div ref={ref} className="-mx-4 overflow-x-auto px-4 pb-1">
      {children}
    </div>
  );
}
