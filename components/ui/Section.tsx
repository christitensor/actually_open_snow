"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePreferences } from "@/lib/preferences/context";
import { effectiveSectionOrder, sectionDefaultOpen } from "@/lib/preferences/schema";

// A dashboard card whose body can be collapsed. Built on <details> so it
// works before (and without) JavaScript. The open/closed choice and the
// section's position on the page come from the person's view settings
// (lib/preferences/), which follow their account across devices: close
// webcams once and it stays closed on every location page, everywhere.
// Position uses CSS `order` inside the dashboard's flex column, so the
// server-rendered markup doesn't change.
//
// `summary` is shown in the header only while the section is collapsed, so
// a closed card still answers its headline question in one line.

export default function Section({
  id,
  title,
  meta,
  summary,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: ReactNode;
  /** Small text on the right of the header, always visible (e.g. a source/time stamp). */
  meta?: ReactNode;
  /** One-line takeaway shown only while collapsed. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const { prefs, ready, update } = usePreferences();
  const baseOpen = sectionDefaultOpen(id) ?? defaultOpen;
  const savedOpen = prefs.sectionOpen[id];
  const wantOpen = savedOpen ?? baseOpen;
  const order = effectiveSectionOrder(prefs.sectionOrder).indexOf(id);

  // Apply the saved open/closed state once settings are loaded (and whenever they change on another device's load).
  useEffect(() => {
    if (ready && ref.current && ref.current.open !== wantOpen) ref.current.open = wantOpen;
  }, [ready, wantOpen]);

  return (
    <details
      ref={ref}
      id={id}
      data-section={id}
      open={baseOpen}
      style={order >= 0 ? { order } : undefined}
      onToggle={(e) => {
        const open = e.currentTarget.open;
        // Ignore toggles we caused by applying the saved state.
        if (ready && open !== wantOpen) update({ sectionOpen: { [id]: open } });
      }}
      className="card group scroll-mt-20"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-4 select-none hover:bg-muted/40 group-open:pb-2 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <h2 className="font-bold tracking-tight">{title}</h2>
            {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
          </div>
          {summary && <div className="mt-0.5 truncate text-sm text-muted-foreground group-open:hidden">{summary}</div>}
        </div>
        <svg
          viewBox="0 0 20 20"
          className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        >
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

/** "Expand all / Collapse all" for every Section on the page. Setting
 * `.open` fires each <details>' toggle event, which saves the choice. */
export function SectionControls() {
  const setAll = (open: boolean) => {
    document.querySelectorAll<HTMLDetailsElement>("details[data-section]").forEach((d) => {
      d.open = open;
    });
  };
  return (
    <div className="flex gap-1">
      <button type="button" className="btn-ghost whitespace-nowrap px-2.5 text-xs" onClick={() => setAll(true)}>
        Expand all
      </button>
      <button type="button" className="btn-ghost whitespace-nowrap px-2.5 text-xs" onClick={() => setAll(false)}>
        Collapse all
      </button>
      <a href="/settings" className="btn-ghost whitespace-nowrap px-2.5 text-xs">
        Customize
      </a>
    </div>
  );
}
