import type { Webcam } from "@/lib/models/types";
import rawWebcams from "./webcams.json";

/**
 * MAP-16 seed data.
 *
 * Two entries (Snowbird — Peruvian Gulch, Little Cloud) have a real,
 * verified-live `imageUrl`: direct JPEG snapshot endpoints from HD Relay
 * (the camera vendor Snowbird's site embeds), found by reading the
 * resort's own webcam page HTML rather than going through any API — no
 * key required, confirmed by fetching the URL and checking it decodes as
 * a current JPEG. HD Relay's client-side widget script
 * (`manage.hdrelay.com/js/hdrelay.js`) hints at a broader public
 * `player/{id}` metadata endpoint, but the ids it needs aren't exposed in
 * static HTML for the other resorts checked (Snowbasin, Solitude, Deer
 * Valley render their camera grids client-side via JS) — only Snowbird's
 * page happened to server-render the snapshot URLs directly.
 *
 * Every other entry is still a general public webcam *page* URL, not a
 * verified direct-hotlink image — `imageUrl` is omitted for those,
 * and the UI falls back to a link-out. UDOT's real camera images require
 * a free developer-key signup at udottraffic.utah.gov/developers/doc
 * (name/email/org registration) — that's a step for whoever owns this
 * deployment to do themselves, not something to fabricate credentials
 * for. Once a key exists, wire it into `lib/data-sources/udot.ts` (not
 * built yet) following the same pattern as the other data-source clients.
 */
export const webcams: Webcam[] = rawWebcams as Webcam[];
