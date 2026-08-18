import type { Webcam } from "@/lib/models/types";
import rawWebcams from "./webcams.json";

/**
 * MAP-16 seed data.
 *
 * **Snowbird** (2 cams): direct JPEG snapshot URLs from HD Relay, found by
 * reading the resort's own webcam page HTML directly — no key, no API call,
 * the `<img>` tag's `src` was just there in static HTML.
 *
 * **Snowbasin** (7 cams): same HD Relay vendor, but the page renders the
 * player via a small client-side widget (`HDRelay.create({target, id})`)
 * instead of a static `<img>`, so getting a real image needed one more
 * step. The widget's own loader script (`manage.hdrelay.com/js/hdrelay.js`)
 * reveals the mechanism: it calls `manage.hdrelay.com/player/{embedId}`
 * (a public, keyless JSON endpoint) and gets back `server.jpg` (this
 * property's own snapshot CDN host — verified to differ per property, e.g.
 * `b15b.hdrelay.com` here vs. Snowbird's `b15.hdrelay.com`) and a canonical
 * `camera.id` that's a *different* id than the one embedded in the page's
 * HTML. The actual snapshot URL is `https://{server.jpg}/camera/{camera.id}
 * /get_image` (not `/snapshot`, which is Snowbird's older/simpler embed
 * scheme) — confirmed live by decoding the response as a current JPEG with
 * a matching EXIF timestamp. Resolved once per camera and hardcoded here,
 * same tradeoff already accepted for Snowbird: if HD Relay ever rotates a
 * property's canonical camera id this goes stale, but re-resolving at
 * request time would add an extra external round-trip (and failure mode)
 * to every dashboard load for a value that in practice doesn't move.
 *
 * **Solitude** (10 cams): doesn't do still-image snapshots at all — its
 * webcam page embeds YouTube *livestreams* per camera (confirmed real,
 * currently-live feeds via each video's public oEmbed title, e.g. "Moonbeam
 * Lift Line", "Solitude Snow Stake"), so `videoEmbedUrl` (a standard
 * `youtube.com/embed/{id}`) is set instead of `imageUrl` for these — see
 * `Webcam.videoEmbedUrl` in lib/models/types.ts and WebcamGrid's iframe
 * branch.
 *
 * **Alta, Brighton, Powder Mountain, Park City**: still page-link-only.
 * Alta and Powder Mountain use a *different* third-party widget ("PrismCam"
 * / `js.prismcam.com`) whose camera list is populated entirely client-side
 * from custom elements with no server-rendered ids or embedded config to
 * scrape — resolving those would need to actually execute the page's JS
 * (a headless browser), which this deployment's sandbox network policy
 * doesn't allow outbound access for (confirmed: Chromium can't reach any
 * external host here, even a trivial one, while this app's own
 * server-side `fetch()`/curl calls work fine through the same proxy — a
 * browser-specific restriction, not a per-site block). Brighton's current
 * conditions page has no obvious camera embed at all. Park City's stored
 * page URL from the original seed had gone stale (a dead legacy `.aspx`
 * redirect returning an internal error page) and was updated to the
 * resort's current conditions page, itself also without a scrapable
 * embed. UDOT's real camera images require a free developer-key signup at
 * udottraffic.utah.gov/developers/doc (name/email/org registration) —
 * that's a step for whoever owns this deployment to do themselves, not
 * something to fabricate credentials for. Once a key exists, wire it into
 * `lib/data-sources/udot.ts` (not built yet) following the same pattern as
 * the other data-source clients.
 */
export const webcams: Webcam[] = rawWebcams as Webcam[];
