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
 * **Alta** (7 cams): the earlier note here claimed this needed a headless
 * browser to resolve — wrong. `alta.com/weather` server-renders a
 * `window.Alta.weather.mountainCams` array directly in a `<script>` tag
 * (plain curl/fetch finds it, no JS execution needed): 5 are direct JPEGs
 * on a DigitalOcean Spaces CDN (`alta-webcams.sfo3.cdn.digitaloceanspaces.com`),
 * 2 are PrismCam preview endpoints (`app.prismcam.com/public/helpers/
 * realtime_preview.php?c={id}&s=720`) that also just return a JPEG
 * directly — confirmed live for all 7.
 *
 * **Powder Mountain** (3 cams): also PrismCam-branded, but a completely
 * different mechanism per-site — its own Next.js page embeds a
 * `nav_webcams` array in the React Server Components payload
 * (`self.__next_f.push(...)`), pointing at plain JPEGs on Google Cloud
 * Storage (`storage.googleapis.com/prism-cam-{id}/360.jpg`). Same lesson
 * as Alta: "client-side widget" doesn't mean the data isn't already
 * sitting in the initial HTML/payload — check there before assuming a
 * headless browser is required.
 *
 * **Park City** (7 cams): a different vendor again (Brown Rice Media) —
 * `parkcitymountain.com/the-mountain/mountain-conditions/mountain-cams.aspx`
 * embeds 7 `<iframe src="//player.brownrice.com/embed/{id}">` players
 * directly in static HTML, each with a plain-text title next to it (e.g.
 * "Lookout Cabin Camera"). No X-Frame-Options/CSP on the player responses,
 * so they embed fine — wired as `videoEmbedUrl` like Solitude's YouTube
 * cams. The stored page URL from the original seed had gone stale (a dead
 * legacy `.aspx` redirect) and is fixed to the real cams page above.
 *
 * **Ski Utah aggregator** (`skiutah.com/resorts/webcams`): one static page
 * with every member resort's cams grouped under per-resort headings — the
 * source for Brighton (its own site has no cam data, but Ski Utah has its
 * snow stake + YouTube lift streams), Deer Valley, Cherry Peak, Sundance,
 * Brian Head, and the snow-stake cams for Alta/Snowbird/Powder Mountain/
 * Park City. Its `?_ts=` value is the frame's capture time, which made it
 * easy to drop cams that had stopped updating (Cherry Peak Vista Valley,
 * Sundance Mandan Summit). Road cams on that page are skipped. Nordic
 * Valley isn't a Ski Utah member — its single YouTube stream comes from
 * its own MCP-template webcam page.
 *
 * **Nov 2026 expansion to every resort in resorts.json** — crawled each
 * resort's site for its webcam page, then verified each feed: images must
 * return a real JPEG (and, where the CDN sends Last-Modified, be < 72h
 * old); YouTube embeds must resolve via oEmbed (two Brighton streams that
 * didn't were dropped); other iframes must load with no X-Frame-Options /
 * restrictive frame-ancestors. Vendors seen, and the stable URL used:
 *  - Brown Rice (`player.brownrice.com/snapshot/{name}` — a live JPEG for
 *    any cam the resort embeds as `…/embed/{name}`): Purgatory, Monarch,
 *    Wolf Creek, Mt. Rose, Red River, Sipapu, Angel Fire, Ski Santa Fe,
 *    Granby Ranch, Pajarito.
 *  - HD Relay (`img.hdrelay.com/frames/…/last.jpg`, or the
 *    `manage.hdrelay.com/player/{id}` → `{server.jpg}/camera/{id}/get_image`
 *    resolution described for Snowbasin above): Sun Valley, Copper,
 *    Diamond Peak, Sierra-at-Tahoe, Powderhorn; Lee Canyon's web player.
 *  - Roundshot panoramas (`backend.roundshot.com/cams/{id}/medium`, which
 *    302s to the latest frame): Aspen Snowmass ×4 mountains, Jackson Hole
 *    (found in the CSS of jacksonhole.com/live-mountain-cams).
 *  - SeeJH (`streams.seejh.ai/{alias}`): a frameable wrapper around a
 *    YouTube live stream whose alias stays stable when the underlying
 *    YouTube video id rotates — preferred over the raw id. Grand Targhee,
 *    Snow King.
 *  - CamStreamer / IPCamLive / Angelcam / Nest / CameraFTP / Ozolio iframe
 *    players (Big Sky, Winter Park, June, Dodge Ridge, Sunrise, Great
 *    Divide; Telluride, Lookout Pass, Terry Peak, Eagle Point, Montana
 *    Snowbowl, Antelope Butte; Red Lodge; Showdown; Snowy Range;
 *    Palisades Tahoe).
 *  - Plain JPEGs on the resort's own host: Loveland, Brundage, Discovery,
 *    Arapahoe Basin, Hogadon, Bluewood, Winter Park's town cam.
 *
 * Link-only (pageUrl, no feed): resorts whose cams are rendered entirely
 * client-side or blocked to non-browser fetches. The 8 Vail Resorts
 * properties use the same `…/mountain-cams.aspx` path that Park City's
 * page uses; Akamai blocked fetches of those pages during the crawl, so
 * those link-outs follow Park City's verified pattern rather than being
 * individually loaded. Resorts with no entry at all had no findable
 * public webcam (or no working website) at crawl time.
 *
 * UDOT's real highway camera images (a separate, non-resort source) still
 * require a free developer-key signup at udottraffic.utah.gov/developers/doc
 * (name/email/org registration) — that's a step for whoever owns this
 * deployment to do themselves, not something to fabricate credentials
 * for. Once a key exists, wire it into `lib/data-sources/udot.ts` (not
 * built yet) following the same pattern as the other data-source clients.
 */
export const webcams: Webcam[] = rawWebcams as Webcam[];
