// PERS-08: per-account view settings. Shared by the client provider
// (lib/preferences/context.tsx), the API (/api/preferences) and the
// settings page. Everything here is plain data with safe defaults, and
// sanitize() is the only way anything gets in, from the network or from
// localStorage alike.

export type MapStyle = "osm" | "topo" | "satellite";
export type ResortSort = "near" | "snow" | "mine";

export interface Preferences {
  /**
   * Deprecated (PERS-08 v1's separate checklist). "My resorts" is now just
   * your starred resorts. Any ids here are converted to favorites once and
   * this is cleared (see components/location/HomeExplorer.tsx).
   */
  myResorts: string[] | null;
  /** Location-page section ids, in display order. Unknown/missing ids fall back to the default order. */
  sectionOrder: string[];
  /** Open (true) / closed (false) per section id. Missing = the section's default. */
  sectionOpen: Record<string, boolean>;
  /**
   * Home list order: nearest first (default), most snow, or your starred
   * order. Replaces the older `resortSort` key, which held "snow" for
   * nearly everyone just as the then-default, so only its "mine" is
   * carried over (see sanitize).
   */
  resortOrder: ResortSort;
  /** Home list's state dropdown: a two-letter code, "ALL", or null = pick from the viewer's location. */
  resortState: string | null;
  mapStyle: MapStyle;
  /** Has finished (or skipped) the first-sign-in welcome: pick resorts + how to save spots. */
  onboarded: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  myResorts: null,
  sectionOrder: [],
  sectionOpen: {},
  resortOrder: "near",
  resortState: null,
  mapStyle: "osm",
  onboarded: false,
};

/** Every location-page section, in default order, with its label and default open state. */
export const DASHBOARD_SECTIONS: { id: string; label: string; defaultOpen: boolean }[] = [
  { id: "conditions-summary", label: "Conditions summary", defaultOpen: true },
  { id: "snow-summary", label: "Snow Summary", defaultOpen: true },
  { id: "current-conditions", label: "Current conditions", defaultOpen: true },
  { id: "daily-forecast", label: "14-day forecast", defaultOpen: true },
  { id: "hourly", label: "Next 24 hours", defaultOpen: true },
  { id: "webcams", label: "Live webcams", defaultOpen: false },
  { id: "models", label: "Today's new snow by model", defaultOpen: false },
  { id: "avalanche", label: "Avalanche forecast", defaultOpen: false },
  { id: "past-7-days", label: "Past 7 days", defaultOpen: false },
  { id: "key-stations", label: "Weather stations", defaultOpen: false },
  { id: "nearby-stations", label: "Nearby stations", defaultOpen: false },
  { id: "forecast-discussion", label: "Forecast discussion", defaultOpen: false },
  { id: "wake-alarm", label: "Powder wake-up", defaultOpen: false },
];

const SECTION_IDS = new Set(DASHBOARD_SECTIONS.map((s) => s.id));
const MAX_RESORTS = 500;

/** The full section order: saved order first (known ids only), then any sections not in it, in default order. */
export function effectiveSectionOrder(saved: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...saved, ...DASHBOARD_SECTIONS.map((s) => s.id)]) {
    if (SECTION_IDS.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function sectionDefaultOpen(id: string): boolean | undefined {
  return DASHBOARD_SECTIONS.find((s) => s.id === id)?.defaultOpen;
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 80;

/** Coerces untrusted input into valid Preferences. Unknown keys and bad values are dropped. */
export function sanitize(input: unknown): Preferences {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Preferences = { ...DEFAULT_PREFERENCES };
  if (v.myResorts === null) out.myResorts = null;
  else if (Array.isArray(v.myResorts)) out.myResorts = [...new Set(v.myResorts.filter(isStr))].slice(0, MAX_RESORTS);
  if (Array.isArray(v.sectionOrder)) out.sectionOrder = v.sectionOrder.filter((id): id is string => isStr(id) && SECTION_IDS.has(id));
  if (v.sectionOpen && typeof v.sectionOpen === "object") {
    out.sectionOpen = Object.fromEntries(
      Object.entries(v.sectionOpen as Record<string, unknown>).filter(([k, b]) => SECTION_IDS.has(k) && typeof b === "boolean")
    ) as Record<string, boolean>;
  }
  if (v.resortOrder === "near" || v.resortOrder === "snow" || v.resortOrder === "mine") out.resortOrder = v.resortOrder;
  else if (v.resortSort === "mine") out.resortOrder = "mine";
  if (typeof v.resortState === "string" && /^([A-Z]{2}|ALL)$/.test(v.resortState)) out.resortState = v.resortState;
  if (v.mapStyle === "osm" || v.mapStyle === "topo" || v.mapStyle === "satellite") out.mapStyle = v.mapStyle;
  if (typeof v.onboarded === "boolean") out.onboarded = v.onboarded;
  return out;
}

/** Applies a partial update; sectionOpen merges key by key so two devices toggling different sections don't clobber each other. */
export function merge(base: Preferences, patch: Partial<Preferences>): Preferences {
  return sanitize({
    ...base,
    ...patch,
    sectionOpen: patch.sectionOpen ? { ...base.sectionOpen, ...patch.sectionOpen } : base.sectionOpen,
  });
}
