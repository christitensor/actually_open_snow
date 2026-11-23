"use client";

import Link from "next/link";
import { usePreferences } from "@/lib/preferences/context";
import { useAuth } from "@/lib/auth";
import { DASHBOARD_SECTIONS, effectiveSectionOrder, type MapStyle } from "@/lib/preferences/schema";
import ResortPicker from "@/components/onboarding/ResortPicker";
import { openWelcome } from "@/components/onboarding/Welcome";
import { useFavorites } from "@/lib/favorites";

// PERS-08 settings page: My resorts, location-page layout, map style.
// Every change saves immediately, to the account when signed in (so it
// follows you to every device) or to this browser when not.

const MAP_STYLES: { id: MapStyle; label: string; hint: string }[] = [
  { id: "osm", label: "Street", hint: "Roads and towns, with terrain shading" },
  { id: "topo", label: "Topo", hint: "Contour lines and peaks" },
  { id: "satellite", label: "Satellite", hint: "Aerial imagery" },
];

export default function ViewSettings() {
  const { prefs, update, reset, savedTo, ready } = usePreferences();
  const { status } = useAuth();
  const { favorites } = useFavorites();
  const starred = favorites.filter((f) => f.source === "resort").length;

  const order = effectiveSectionOrder(prefs.sectionOrder);
  const move = (index: number, delta: number) => {
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    update({ sectionOrder: next });
  };
  const label = (id: string) => DASHBOARD_SECTIONS.find((s) => s.id === id)!;

  if (!ready) return <div className="card p-4 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-4">
      <p
        className={`rounded-xl px-3 py-2 text-sm ${savedTo === "account" ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300" : "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"}`}
      >
        {savedTo === "account"
          ? "✓ Saved to your account. These settings follow you to every device you sign in on."
          : status === "loading"
            ? "Checking sign-in…"
            : "Saved in this browser only. Sign in (or create an account) to keep them on all your devices."}
      </p>

      <section id="resorts" className="card scroll-mt-20 p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-bold tracking-tight">My resorts</h2>
          <span className="text-xs text-muted-foreground">{starred === 0 ? "None starred" : `${starred} starred`}</span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Your home page shows the resorts you star. With none starred it shows every resort. You can also star ☆ a resort from
          its card or page.
        </p>
        <ResortPicker />
      </section>

      <section className="card p-4">
        <h2 className="font-bold tracking-tight">Location page layout</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          The order of sections on every resort and backcountry page, and which ones start open. Opening or closing a section on a page
          is remembered too.
        </p>
        <ol className="divide-y divide-border rounded-xl border border-border">
          {order.map((id, i) => {
            const s = label(id);
            const open = prefs.sectionOpen[id] ?? s.defaultOpen;
            return (
              <li key={id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-5 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={() => update({ sectionOpen: { [id]: !open } })}
                    className="h-4 w-4 accent-primary"
                  />
                  Opens
                </label>
                <div className="flex">
                  <button
                    className="btn-ghost !px-2 !py-1 text-xs"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move ${s.label} up`}
                  >
                    ↑
                  </button>
                  <button
                    className="btn-ghost !px-2 !py-1 text-xs"
                    disabled={i === order.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move ${s.label} down`}
                  >
                    ↓
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card p-4">
        <h2 className="font-bold tracking-tight">Map style</h2>
        <p className="mb-3 text-xs text-muted-foreground">Which map you see first. Switching on a map also changes this.</p>
        <div className="grid grid-cols-3 gap-2">
          {MAP_STYLES.map((m) => (
            <button
              key={m.id}
              onClick={() => update({ mapStyle: m.id })}
              aria-pressed={prefs.mapStyle === m.id}
              className={`rounded-xl border p-3 text-left text-sm transition ${prefs.mapStyle === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            >
              <div className="font-semibold">{m.label}</div>
              <div className="text-[11px] text-muted-foreground">{m.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-medium text-primary hover:underline">
            ← Back to resorts
          </Link>
          <button className="text-sm font-medium text-primary hover:underline" onClick={() => openWelcome("resorts")}>
            Show the quick tour
          </button>
        </div>
        <button
          className="btn-ghost text-xs"
          onClick={() => {
            if (window.confirm("Reset the page layout and map style to the defaults? (Your starred resorts and saved spots stay.)")) reset();
          }}
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
