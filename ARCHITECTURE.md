# Architecture

Technical design for building the features tracked in `TRACE_MATRIX.md`. The P0/P1 work and a first pass of P2 breadth are now implemented and verified against live APIs (see the matrix's "Implementation notes" sections) — this doc still describes the target design, with the "Project structure" section updated to match what's actually in the repo where it drifted from the original plan.

## Stack

- **Framework**: Next.js (App Router) + TypeScript — single deployable app covering both UI and API routes.
- **Styling**: Tailwind CSS.
- **Maps**: MapLibre GL JS (open-source, no vendor lock-in) with free vector/raster tile sources (MapTiler free tier and/or OpenStreetMap raster tiles).
- **Database**: SQLite (Node's built-in `node:sqlite`, no dependency) for the one stateful feature so far — PERS-03 alert subscriptions. Swap for Postgres before a real multi-instance production deploy; SQLite here is a single local file that doesn't survive/share state across serverless instances. Resort seed data and favorites don't use a database at all (static JSON, localStorage).
- **Email**: Resend's HTTP API (`lib/email.ts`) if `RESEND_API_KEY`/`ALERTS_FROM_EMAIL` are set; otherwise logs what would be sent and returns `sent: false` rather than faking success. This repo has no email credentials of its own.
- **Deployment**: Vercel (pairs naturally with Next.js); `/api/alerts/check` runs daily via Vercel Cron (`vercel.json`).
- **No subscription/billing infrastructure** — every feature ships ungated, per the decision to drop OpenSnow's tiering.

## Phase 1 regional scope

All P0/P1 build-out targets **Northern Utah & Southeast Idaho** first (see `TRACE_MATRIX.md` for the full rationale and initial resort list) — one or two NWS forecast offices (SLC, PIH), a dense SNOTEL network, and a documented UDOT camera API make this region unusually good ground for validating the data pipeline before generalizing nationally. `resorts.json` starts as this regional subset; the schema itself is not region-specific.

## Why no proprietary weather model

OpenSnow's edge is PEAKS (in-house, ML-tuned to mountain terrain) and StormNet (severe weather). We can't reproduce those. Instead we lean on:

- **Open-Meteo** (`open-meteo.com`) as the primary forecast backbone — free, no API key, global coverage, hourly + up to 16-day forecasts, multi-model comparison, historical archive, and a separate air quality API. This single provider covers a large fraction of the matrix's "Core Weather & Snow Forecasting" and "Snow Reports" sections.
- **NWS/NOAA** (`api.weather.gov`, NOHRSC) for US-specific alerts, severe weather, and snowfall analysis where it's more authoritative than a generic global model.
- **NRCS SNOTEL** and **avalanche.org** for snowpack and avalanche danger — domain-specific US mountain-west data no generic weather API provides.
- **OpenStreetMap** (via Overpass API) for ski piste/trail geometry — the legally clean alternative to scraping resort-published (copyrighted) trail map PDFs.

Anywhere OpenSnow's real feature has no free-data equivalent (forecaster-written commentary, proprietary powder-quality modeling, StormNet lightning), the matrix marks it `Blocked` or defines a derived heuristic instead — flagged inline so the UI can be honest about being an estimate.

## Project structure (as built)

```
/app
  /app/page.tsx                        # landing: region map + resort list + favorites
  /app/location/[slug]/page.tsx        # per-resort dashboard (slug = resort id, e.g. "alta")
  /app/location/pin/page.tsx           # backcountry pin dashboard, reads ?lat=&lon= — same component as above
  /app/api/forecast/route.ts           # ?lat=&lon= — FC-01/02/03
  /app/api/snow-level/route.ts         # ?lat=&lon= — FC-10
  /app/api/elevation/route.ts          # ?lat=&lon= — FC-11
  /app/api/snow-report/route.ts        # ?lat=&lon= — SNOW-01 (Open-Meteo reanalysis substitute, not NOHRSC)
  /app/api/alerts/route.ts             # ?lat=&lon= — SEV-01
  /app/api/avalanche-zone/route.ts     # ?lat=&lon= — BC-02
  /app/api/avalanche/[zoneId]/route.ts # BC-01
  /app/api/stations/route.ts           # ?lat=&lon= — DATA-01 (SNOTEL half)
  /app/api/conditions-summary/route.ts # ?lat=&lon=&name= — SNOW-03
  /app/api/pistes/route.ts             # ?bbox=south,west,north,east — MAP-13
  /app/api/air-quality/route.ts        # ?lat=&lon= — SEV-06/07
  /app/api/historical/route.ts         # ?lat=&lon=&start=&end= — SNOW-05
  /app/api/forecast-grid/route.ts      # ?bbox=south,west,north,east — MAP-05/MAP-10 (sampled point grid, not raster)
  /app/api/alerts/subscribe/route.ts   # POST {email,locationName,lat,lon,thresholdIn} — PERS-03
  /app/api/alerts/unsubscribe/route.ts # ?token= — PERS-03, returns an HTML confirmation (clicked from email)
  /app/api/alerts/check/route.ts       # PERS-03 "cron" entrypoint — nothing schedules calls to this automatically
  /app/location/error.tsx              # defense-in-depth only — does NOT catch the data-fetch failure case,
                                        # see "resolved" (third pass) below; each page.tsx handles that explicitly
  /app/webcams/page.tsx                # MAP-16: dedicated live-webcam grid
  # No /app/api/favorites/route.ts — PERS-01 is localStorage-only (lib/favorites.ts), no backend yet.
  # (location) route group from the original plan wasn't used — plain /location/* is simpler and avoids
  # a top-level catch-all colliding with other routes.
/lib
  /lib/data-sources/
    open-meteo.ts        # forecast (incl. freezing level), elevation, multi-model snowfall, recent-snowfall
                          # reanalysis, recent hourly window, air quality, historical archive, grid sampling
    nws.ts                # api.weather.gov: point metadata, snowLevel gridpoint field, alerts, observation stations
    nws-products.ts        # api.weather.gov text products (Area Forecast Discussion)
    avalanche-org.ts        # avalanche.org: zone map-layer GeoJSON + per-zone forecast product
    snotel.ts                 # NRCS AWDB REST API: station list + latest SNWD/WTEQ reading
    osm.ts                     # Overpass API: piste/trail geometry by bbox
    # nohrsc.ts and firms.ts from the original plan were not built — SNOW-01 uses an Open-Meteo
    # substitute instead, and wildfire/smoke (SEV-04/05) are still Not Started.
  /lib/derive/
    powder-quality.ts     # FC-07 heuristic
    wet-bulb.ts            # FC-08 formula (Stull 2011 approximation)
    snow-level.ts           # FC-10: merges NWS snowLevel + Open-Meteo freezing level, resolves vs. elevation
    trail-conditions.ts      # SNOW-02: hours-since-snow + freeze-thaw-cycle heuristic
    conditions-summary.ts  # SNOW-03: corroborates AFD text + multi-model spread + SNOTEL into one narrative
    avalanche-zone-lookup.ts # BC-02: point-in-polygon (turf.js) against avalanche.org zone boundaries
  /lib/models/types.ts     # shared TypeScript types — Location is coordinate-first: { lat, lon, source, resortId?, name, elevationFt? }
  /lib/util/               # geo.ts (haversine distance), api.ts (route param parsing/error helpers)
  /lib/favorites.ts        # PERS-01: useFavorites() hook, localStorage-backed (useSyncExternalStore)
  /lib/email.ts             # PERS-03: pluggable email sender (Resend or console-log fallback)
  /lib/db/sqlite.ts          # PERS-03: alert_subscriptions table (node:sqlite), CRUD helpers
  /lib/alerts/check-and-notify.ts # PERS-03: threshold comparison + once-per-day dedup + send
  /lib/location-dashboard.ts # orchestrates every source above into one payload for a location page
/components
  /components/map/SkiMap.tsx           # MapLibre wrapper: resort/webcam pins (colored by MAP-10 Powder Finder,
                                        # live snapshot in webcam popups where available), pin-drop (MAP-17),
                                        # piste overlay (MAP-13), radar toggle (MAP-02/03, RainViewer),
                                        # snow-forecast-grid toggle (MAP-05)
  /components/location/LocationDashboard.tsx # the shared resort/pin dashboard UI
  /components/location/LocationUnavailable.tsx # explicit failure state, rendered by page.tsx on data-fetch error
  /components/location/FavoriteButton.tsx, FavoritesList.tsx, MyLocationButton.tsx (PERS-02)
  /components/location/AlertSubscribeForm.tsx # PERS-03 signup form, on every location dashboard
  /components/webcams/WebcamGrid.tsx    # MAP-16: live-image grid with auto-refresh, used by /app/webcams
/data
  /data/resorts.json, resorts.ts       # RES-01/RES-02: 16 Northern Utah/SE Idaho resorts
  /data/webcams.json, webcams.ts       # MAP-16 seed: 2 verified-live Snowbird camera images, rest are page links
.data/app.db                           # PERS-03 SQLite file, gitignored, created on first write
```

## Data flow

1. **Location model is coordinate-first, not resort-first.** Every data client (`open-meteo.ts`, `nws.ts`, etc.) takes a `{ lat, lon }` and nothing else — `resorts.json` (RES-01/RES-02) is a curated list of named coordinates for convenience (search, map pins, favorites shortcuts), and a backcountry pin dropped via MAP-17 is just an uncurated coordinate flowing through the identical pipeline. This is what lets backcountry skiing work: there's no special-casing between "resort" and "arbitrary point," only a `source: 'resort' | 'pin'` tag on the `Location` type for UI/analytics purposes.
2. **API routes** under `/app/api/*` are thin wrappers that call the relevant client in `/lib/data-sources/`, normalize the response into our own types (`/lib/models`), and cache via Next's fetch data cache (`next: { revalidate }`) to stay within upstream rate limits. This isn't just theoretical: live testing produced a genuine sustained 429 from Open-Meteo under this app's own call volume (a single location dashboard fanned out to several Open-Meteo requests) — see "Resolved" below for the fix. **Every server-side data fetch must avoid redundant calls to the same upstream data** — `getForecast()`'s hourly response already carries `freezing_level_height`, for example, so `snow-level.ts` reuses it instead of issuing a second request; new features should check for this before adding a new fetch.
3. **Derived features** (powder quality, wet-bulb, snow level, trail conditions, conditions summary) live in `/lib/derive/` as pure functions over normalized forecast data, unit-testable independent of any network call.
   - `conditions-summary.ts` is the one derive function that fans out to multiple sources rather than transforming one: it pulls the AFD text, the multi-model spread, and SNOTEL observations, then applies simple corroboration rules (do the models agree within some tolerance? does the AFD flag uncertainty?) before composing the summary — this is the one place in the app doing source reconciliation rather than a single-source lookup.
4. **Map layers** are added incrementally as MapLibre GL sources/layers — each map feature in the matrix is one additional layer + a data-source client, not a new map component. Three layer patterns exist so far: real raster tiles (RainViewer radar, MAP-02/03), a sampled point grid rendered as blurred circles where no true gridded product exists for free (MAP-05/MAP-10 Powder Finder — see the caveat in `forecast-grid/route.ts`), and plain pins with a link/popup (webcams, MAP-16; resort pins colored by forecast snowfall for Powder Finder).
5. **Alerts (PERS-03)**: `/api/alerts/subscribe` stores an email + location + threshold in SQLite; `/api/alerts/check` (meant to be hit on a schedule — nothing calls it automatically yet) compares each subscription's today's forecast snowfall against its threshold and sends via `lib/email.ts`, capped at once per calendar day per subscription (`last_notified_date`). No accounts/login — subscribe-by-email, like a mailing list, not a stored-credential system.
6. **Accounts (PERS-04)**: magic-link sign-in (`lib/db/users.ts`, `/api/auth/*`) reusing the same `lib/email.ts` sender as alerts and the same ephemeral SQLite as PERS-03 — a signed-in session is just an httpOnly cookie holding an opaque session token, no passwords. `lib/favorites.ts` (PERS-01) is the one thing that reads this: `useFavorites()` always calls both the localStorage store and a server-fetch hook and picks which result to return based on `lib/auth.tsx`'s sign-in state, so every existing favorites UI component works unmodified in both modes. On first sign-in, `AuthProvider` imports whatever was already starred locally into the new account once (`/api/favorites/import`, idempotent, deduped by the same `favoriteKey()` both modes share via `lib/util/favorite-key.ts`).
7. **Failure handling is explicit per-page, not framework-boundary-based.** `app/location/[slug]/page.tsx` and `app/location/pin/page.tsx` wrap `getLocationDashboardData()` in a try/catch and render `LocationUnavailable` directly on failure — **not** `app/location/error.tsx`, which was live-tested against a real Open-Meteo 429 and confirmed not to catch it on Next.js 16.3.1 (see "Resolved," third pass, below). Any new page doing a data fetch that can plausibly fail should follow the same explicit try/catch pattern rather than assuming `error.tsx` will catch it.

## Build order (maps to matrix priorities)

1. ✅ **P0 slice**: `resorts.json` seed data (Northern Utah/SE Idaho) → `/api/forecast` via Open-Meteo → location dashboard rendering a multi-day + hourly forecast, 24h snow estimate, and snow level vs. elevation (FC-10) → favorites (local-only, no auth).
2. ✅ **P1 core, backcountry first**: base MapLibre map with resort pins + click-to-drop-pin (MAP-17) reusing the same location pipeline → elevation lookup for pins (FC-11) → avalanche zone lookup by coordinate (BC-02) feeding avalanche forecasts (BC-01). Confirmed working end-to-end for a dropped pin, not just curated resorts.
3. ✅ **P1 core, remaining**: snow reports (via substitute source, see notes), piste overlay + webcam pins (MAP-16, page-link-only for now), multi-source corroborated conditions summary (SNOW-03), historical lookback (SNOW-05).
4. ✅ **P2 breadth — first pass done**: air quality (SEV-06/07), current radar (MAP-02/03), sampled snowfall map + Powder Finder (MAP-05/MAP-10), estimated trail conditions (SNOW-02), wet-bulb + multi-model UI (FC-05/08), NWS observation stations (finishing DATA-01), My Location (PERS-02).
5. ✅ **P2 breadth — second pass done**: live webcam images for 2 Snowbird cameras + a dedicated `/webcams` page (MAP-16), full alert-subscription backend (PERS-03 — subscribe/unsubscribe/check, SQLite storage, pluggable email, dashboard signup form; email sending itself needs a `RESEND_API_KEY` to actually deliver).
6. ✅ **P1 accounts**: magic-link sign-in + cross-device favorite sync (PERS-04 — `/api/auth/*`, `/api/favorites/*`, `lib/auth.tsx`, `components/auth/AuthControl.tsx`), on top of the same ephemeral-SQLite/unconfigured-email caveats as PERS-03.
7. ✅ **P1 backcountry mode**: an opt-in "avalanche observations" map layer (BC-03 — `lib/data-sources/uac-observations.ts`, `/api/avalanche-observations`) with client-side type/aspect/elevation filters, sourced from an undocumented but unauthenticated UAC JSON endpoint found live (their main site is otherwise Cloudflare-gated).
8. **P2 breadth — not started**: remaining map overlays (smoke, temperature/wind/cloud forecast layers, true raster snowfall/precip rather than a sampled grid), slope-angle/aspect shading (MAP-18), offline map caching, home-screen widgets (PERS-05), fall colors (DATA-02), UDOT/Idaho 511 camera images for resorts beyond Snowbird (needs a developer-key signup someone has to do themselves), precip-by-model (FC-06), NOHRSC's real snow-analysis grid (SNOW-01/MAP-06), a real persistent DB for accounts/alerts (currently ephemeral SQLite, fine for current scale), real push notifications (see PERS-03's "Still open" note on why a literal native alarm isn't possible from a web app).

## Resolved during the first build pass

These were open questions in the original design; all three turned out to be real integration bugs, not just theoretical risk (see `TRACE_MATRIX.md`'s "Implementation notes" for the full detail):

- **AFD text product retrieval** (SNOW-03) — confirmed: `api.weather.gov/products/types/AFD/locations/{wfo}` works exactly as documented, no surprises.
- **Avalanche zone boundaries** (BC-02) — confirmed the map-layer GeoJSON endpoint and shape, but the zone id is `Feature.id` (top-level), not `properties.id` as originally assumed.
- **SNOTEL station filtering** — the originally-assumed `networkCds`/`stateCds` params don't work; `stationTriplets=*:UT:SNTL,*:ID:SNTL` wildcard syntax is required, confirmed against the AWDB API's own OpenAPI spec.
- **Overpass API** (MAP-13, not in the original open-questions list but hit live) — needs an explicit `User-Agent`/`Accept` header or it 406s.
- **RainViewer** (MAP-02/03) — CORS-open, no key, tile URL format confirmed by fetching a real tile and checking it decodes as a valid PNG.
- **Open-Meteo's multi-location batching** (used by MAP-05/MAP-10's grid sampling and Powder Finder) — confirmed live that comma-separated `latitude`/`longitude` lists return an array of per-point results in input order.

## Resolved during the second build pass (P2 breadth)

- **Open-Meteo rate limiting** — a single location dashboard originally issued 4 separate calls to the same `api.open-meteo.com/v1/forecast` endpoint (main forecast, a duplicate freezing-level fetch, multi-model comparison, trail-conditions window). Under this session's own repeated live testing that produced a sustained 429 which survived one retry and crashed the page. Fixed by (1) eliminating the duplicate freezing-level fetch — `snow-level.ts` now reuses `getForecast()`'s already-fetched hourly data instead of re-requesting it, (2) upgrading `fetchJson()`'s retry to two attempts with backoff (750ms, 1.5s), and (3) adding `app/location/error.tsx` as a last-resort graceful degradation. Any new Open-Meteo-backed feature should default to reusing already-fetched forecast data before adding a new call.
- **Next.js fetch data cache has a 2MB response-size ceiling** — the SNOTEL station-list response (~2.1MB for ~225 stations) silently failed to cache on every request. Switched to `cache: "no-store"` to stop the silent failure; a real fix (trim the response server-side to the handful of fields this app uses) is still open.

## Resolved during the third build pass (live webcams + alerts backend)

- **`app/location/error.tsx` doesn't catch the failure it was built for.** Live-tested against a reproducible Open-Meteo 429: the HTTP response was Next's own generic `__next_error__` shell (confirmed by inspecting the raw payload — no trace of the custom component anywhere in it), not this app's error boundary, despite the file being present, correctly named, marked `"use client"`, and compiled into the build without any warning. **Fixed by handling the failure explicitly in each page** (try/catch around `getLocationDashboardData()`, rendering `LocationUnavailable` on failure) rather than relying on the framework convention — verified live afterward, now returns HTTP 200 with the friendly message instead of a 500. `error.tsx` is kept only as defense-in-depth for other, genuinely unexpected render errors; its comment now says so instead of overclaiming. **Don't trust a framework error-boundary convention without hitting it with a real failure and inspecting the actual response** — code review and a clean build both looked correct here.
- **Live webcam images**: resort-hosted pages can expose real, keyless, direct image URLs even when the vendor's own API requires a key — Snowbird's page server-renders two HD Relay snapshot URLs (`b15.hdrelay.com/camera/{id}/snapshot`) directly in its static HTML, found by fetching the page and grepping for the vendor's asset domain, confirmed live by fetching each and checking it decodes as a current JPEG.
- **UDOT's developer-key requirement is real**: confirmed live (`Invalid Key` with no key against `udottraffic.utah.gov/api/v2/get/cameras`), and the signup is a human-registration web form (name/email/org) — correctly left for the deployment owner to do themselves.
- **`node:sqlite` needs `@types/node` ^22**, not the `^20` the original `create-next-app` scaffold shipped with — TypeScript won't recognize the module otherwise. Bumped in `package.json`.

## Still open

- Lightning risk (SEV-02): evaluate Blitzortung.org reliability/coverage before committing to it.
- NOHRSC integration (SNOW-01/MAP-06): still using an Open-Meteo reanalysis substitute rather than NOHRSC's actual snow-analysis grid — scope a real point-query approach.
- Full webcam coverage (MAP-16): Snowbird, Snowbasin, Solitude, Alta, Powder Mountain, and Park City all have verified live images/video (39 cameras total). Only Brighton remains link-only — confirmed there's genuinely no camera data on their current site, not a scraping gap. UDOT's/Idaho 511's key-gated APIs (signup not done) would add non-resort highway cams if wanted.
- Slope-angle shading (MAP-18): this is the one feature requiring an offline raster-processing pipeline rather than a live API client — scope the DEM source (USGS 3DEP vs. NASADEM) and tiling approach before starting.
- Resort seed data accuracy (RES-01/02): coordinates/elevations in `data/resorts.json` are from general knowledge, not verified against each resort's own published stats or cross-checked against OSM yet.
- True raster map overlays (MAP-04/07/08/09 and upgrading MAP-05): the sampled-point-grid approach is a real-data stopgap, not a resolution-matched raster product — would need either a self-hosted tile-generation step over Open-Meteo's gridded output or a different provider.
- SNOTEL response trimming: cache a small `{name, lat, lon, elevation, triplet}` projection of the station list instead of fetching/discarding the full ~2MB payload on every request.
- Alert delivery: `/api/alerts/check` is scheduled (`vercel.json`, daily), but actual sending still needs a `RESEND_API_KEY` + verified sending domain — deployment-time configuration, not something to fabricate here.
- Alert subscriptions have no way to list/manage a given email's subscriptions or re-fetch a lost unsubscribe token — fine for a first pass, worth adding if this sees real use.
- **A literal native iOS alarm is not buildable from a web app, full stop** — there is no API, public or private, that lets a third-party web or native app create/trigger an entry in Apple's own Clock/Alarm app; this isn't a permissions gap or missing signup, Apple simply doesn't expose that capability to anyone but the Clock app itself. The closest real equivalent is a notification: either the existing PERS-03 email alert (works today, arrives as a push notification via Mail if the user has that enabled) or a proper Web Push implementation (buildable — Safari has supported standard VAPID-based Web Push for home-screen-installed PWAs since iOS 16.4, no Apple Developer account needed — but it's a real feature: a service worker, a push-subscription table, a permission-request UI flow, and a send step triggered from the same daily cron). Neither can bypass Do Not Disturb/silent mode the way a true system alarm can; that's an Apple platform restriction on all notifications, not specific to this app.
