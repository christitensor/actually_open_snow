# OpenSnow Feature Trace Matrix

This matrix inventories the real, shipped feature set of OpenSnow (as of Aug 2026, sourced primarily from OpenSnow's own [Support Center feature guides](https://support.opensnow.com/feature-guides), App Store listing, and public reporting) and tracks the build status of an independent, open-data reimplementation in this repo.

This project does **not** replicate OpenSnow's subscription tiering — every feature below is being built as a single, ungated tier. The `Access Tier` column from the original product has been dropped; a `Data Source Plan` column replaces it, mapping each feature to the free/open data source we'll use instead of OpenSnow's proprietary PEAKS/StormNet models.

See `ARCHITECTURE.md` for the technical design these data sources plug into.

**Build status (Aug 2026):** the P0/P1 work and a first pass of P2 breadth features are implemented and verified against live APIs — see "Implementation notes" at the end of this file for real bugs found and fixed along the way (they weren't hypothetical caveats; every one of them was hit live), including a genuine Open-Meteo rate-limit encountered from this session's own testing volume.

## Phase 1 regional scope: Northern Utah & Southeast Idaho

To maximize data quality while the app is being built, all P0/P1 work targets **Northern Utah and Southeast Idaho** only — everything in this matrix is designed to generalize nationally later, but the seed data (RES-01/RES-02) and any manual curation (webcams, trail maps) starts scoped to this region. Reasons this region specifically maximizes free-data quality:

- **Single/dual NWS forecast office coverage** — Salt Lake City (WFO SLC) covers northern Utah; Pocatello (WFO PIH) covers southeast Idaho. Fewer offices to reconcile than a nationwide launch.
- **Dense SNOTEL network** — the Intermountain West (Utah/Idaho) has one of the densest NRCS SNOTEL station networks in the country, so snowpack ground-truth data (DATA-01, SNOW-03 corroboration) is unusually good here.
- **Utah Avalanche Center** covers the Salt Lake, Ogden, Logan, and Provo zones (northern Utah); backcountry near the Utah/Idaho border and the Tetons is covered by neighboring centers — exact zone-to-resort mapping needs confirming per location during BC-01 build-out.
- **UDOT** publishes a free (developer-key-required, no cost) camera API covering the Cottonwood Canyons and other Wasatch corridors — a strong seed for MAP-16. **Idaho 511 / ITD** is the parallel source for southeast Idaho corridors.

Initial resort/location seed list (editable, not exhaustive) for RES-01:

- **Northern Utah**: Alta, Snowbird, Brighton, Solitude, Park City, Deer Valley, Snowbasin, Powder Mountain, Nordic Valley, Beaver Mountain, Cherry Peak, Sundance
- **Southeast Idaho**: Pebble Creek, Kelly Canyon, Pomerelle Mountain Resort, Grand Targhee (borderline — technically Wyoming, but the primary access/gateway community is Driggs, ID, so worth including)

## Status legend

| Status | Meaning |
|---|---|
| Not Started | No code written yet |
| Planned | Data source identified, design decided, not yet built |
| In Progress | Actively being implemented |
| Done | Implemented and verified working |
| Blocked | Needs a decision or external dependency before work can start |

## Suggested build priority

- **P0** — MVP vertical slice: pick a location, see a real forecast and current conditions
- **P1** — Core ski/snow product: what makes this OpenSnow-shaped rather than a generic weather app
- **P2** — Breadth features: maps, severe weather, backcountry, personalization, polish

---

## 1. Core Weather & Snow Forecasting

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| FC-01 | Multi-day forecast | Daily temp/precip/wind outlook for a location | Open-Meteo Forecast API (up to 16 days, free, no key) | P0 | Done | `lib/data-sources/open-meteo.ts`, `/api/forecast` — verified live |
| FC-02 | Hourly forecast | Hour-by-hour temp/precip/wind | Open-Meteo Forecast API (hourly block) | P0 | Done | Same client/route as FC-01 |
| FC-03 | Snow forecast (inches by day) | Forecasted new snowfall per day | Derived: Open-Meteo `snowfall` hourly variable, summed to daily | P0 | Done | Accuracy will trail OpenSnow's mountain-tuned PEAKS model — flagged as approximate in the UI |
| FC-04 | Forecast Anywhere | Forecast for any lat/lon, not just curated resorts | Open-Meteo (global coverage) + reverse geocoding (Open-Meteo Geocoding API) | P1 | Done | Delivered via MAP-17's coordinate-first location model rather than a separate search-by-address flow; reverse geocoding not built |
| FC-05 | Forecast Range (multi-model comparison) | Show spread across multiple weather models for the same point | Open-Meteo "multi-model" endpoint (GFS, ECMWF, ICON, etc. — free tier includes several) | P2 | Done | `getMultiModelDailySnowfall()` in open-meteo.ts, shown as a "today's new snow — by model" section on the location dashboard, and feeds SNOW-03's corroboration |
| FC-06 | Precipitation by model | Compare precip totals across models | Same Open-Meteo multi-model endpoint, precip variable | P2 | Not Started | Snowfall-by-model (FC-05) is built; the precip-variable version isn't |
| FC-07 | Powder Quality (snow density/quality estimate) | Qualitative read on whether new snow will be light/dense | Derived heuristic: temp-at-precip-time vs. NWS/Open-Meteo snow ratio guidance (e.g. Cobb's Rule) | P1 | Done | `lib/derive/powder-quality.ts`, shown on the location dashboard |
| FC-08 | Snowmaking (wet-bulb temp) forecast | Wet-bulb temp forecast for resort snowmaking ops | Derived: Stull (2011) wet-bulb approximation from Open-Meteo temp + humidity | P2 | Done | `lib/derive/wet-bulb.ts`, shown as a stat tile on the location dashboard |
| FC-09 | Powder Vision (visual powder-day likelihood) | At-a-glance "how good will it be" indicator | Derived composite score from FC-01/03/07 | P2 | Not Started | Original OpenSnow feature; needs our own scoring design |
| FC-10 | Snow level (rain/snow line) by elevation | Elevation at which precip transitions from rain to snow, shown against each resort's base/mid/summit elevation so users can tell "raining at base, snowing up top" | NWS gridpoint `snowLevel` property (`api.weather.gov`, primary, US only, direct field — no derivation needed) + Open-Meteo `freezing_level_height` hourly variable (fallback/corroboration, global) | P0 | Done | `lib/derive/snow-level.ts`, `/api/snow-level` — the direct `snowLevel` field is real and confirmed live; dashboard shows base-elevation vs. snow-line status, full base/mid/summit band display not yet built |
| FC-11 | Elevation lookup for any point | Elevation for a dropped backcountry pin (not just curated resorts), so FC-10's snow-level comparison and forecast context work anywhere, not only at seeded locations | Open-Meteo Elevation API (free, no key, global, SRTM-based, single point query) | P1 | Done | `/api/elevation` — verified live |

## 2. Maps & Visualization

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| MAP-01 | Base map (3D/terrain) | Interactive terrain map | MapLibre GL JS + free vector tiles (MapTiler free tier or OSM raster fallback) | P1 | Done | `components/map/SkiMap.tsx` — shipped with plain OSM raster tiles (no MapTiler key configured yet), no 3D/terrain mode yet |
| MAP-02 | Current & forecast radar | Animated precip radar, now + forecast | RainViewer public API (free, no key) for current radar; forecast radar is a gap — flag Blocked | P1 | Done (current only) | `components/map/SkiMap.tsx` — toggleable radar layer, live-verified (fetched a real tile, confirmed valid PNG). Forecast radar remains out of scope, as originally flagged — RainViewer only covers current/nowcast |
| MAP-03 | Global radar | Radar outside the US | RainViewer (has global coverage) | P1 | Done | Same RainViewer layer as MAP-02 — it's inherently global, no extra work needed |
| MAP-04 | Forecast precipitation map | Map overlay of forecast precip by area | Open-Meteo gridded forecast, rendered as heatmap tiles we generate | P2 | Not Started | MAP-05's approach (below) generalizes to precip; not built yet |
| MAP-05 | Forecast snowfall map | Map overlay of forecast new snow by area | Same approach as MAP-04, `snowfall` variable | P1 | Done (substitute) | `/api/forecast-grid` + `SkiMap`'s snow-overlay toggle — **not** true raster tiles (Open-Meteo has no gridded-map product); this samples a 6×6 point grid via Open-Meteo's batched multi-location endpoint (confirmed live) and renders colored circles. Coarse resolution, real data |
| MAP-06 | Estimated snowfall map | Recent/estimated snow accumulation by area | NOAA NOHRSC daily snowfall analysis (free, public, US only) | P1 | Not Started | Good authoritative free source |
| MAP-07 | Temperature forecast map | Forecast temp overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | Same grid-sampling approach as MAP-05 would generalize here |
| MAP-08 | Wind gust forecast map | Forecast wind gust overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-09 | Cloud cover forecast map | Forecast cloud cover overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-10 | Powder Finder map | Map highlighting best current powder by region | Derived composite from MAP-05/MAP-06 across resort seed data | P2 | Done | Landing page: resort pins colored by today's forecast snowfall + a ranked "Powder Finder" list, batched via the same multi-location Open-Meteo call as MAP-05 |
| MAP-11 | Mini location maps | Small embedded map per location page | MapLibre GL JS, reused component | P1 | Done | Same `SkiMap` component, reused with pin drop disabled |
| MAP-12 | Offline satellite & terrain maps | Downloadable map tiles for offline use | MapTiler/MapLibre offline tile caching (browser cache or PWA storage) | P2 | Not Started | Needs PWA/service-worker work |
| MAP-13 | Offline ski resort trail maps | Downloadable piste/trail maps | OpenStreetMap `piste:*` tags via Overpass API (free, open data) | P1 | Done | `lib/data-sources/osm.ts`, `/api/pistes` — live-verified; **Overpass 406s any request without an explicit `User-Agent`/`Accept` header** (Node's fetch defaults get rejected where curl's don't) — fixed. "Offline" caching itself not built, only the live overlay |
| MAP-14 | Land boundary & ownership maps | Public/private/wilderness boundary overlay | USGS PAD-US (Protected Areas Database) + USFS/BLM open GIS data (free, public domain) | P2 | Not Started | |
| MAP-15 | Recent satellite maps | Recent satellite imagery layer | NASA GIBS (Global Imagery Browse Services) — free WMTS tiles | P2 | Not Started | |
| MAP-16 | Webcam map | Map showing every available webcam so users can visually confirm current snow/road conditions, not just trust a forecast number | Curated pins combining: **UDOT** camera API (`udottraffic.utah.gov/api/v2/get/cameras`, free but requires a no-cost developer key — covers Cottonwood Canyons/Wasatch corridors) + **Idaho 511/ITD** camera feed (parallel source for SE Idaho corridors) + manually curated resort-hosted webcam links (Alta, Snowbird, Brighton, Solitude, Snowbasin, Powder Mountain, Park City, Deer Valley each publish public webcams on their own sites) | P1 | In Progress | `data/webcams.ts`, pins rendered on `SkiMap` with a link-out popup. Real UDOT/Idaho 511 API calls and verified hotlinkable images are **not** built yet — current entries link to each source's general camera page, not a live image (see caveat in `data/webcams.ts`) |
| MAP-17 | Custom pin / backcountry location picker | Click or tap anywhere on the map to drop a pin and get the same forecast, snow level, and conditions pipeline as a curated resort — essential for backcountry ski touring, where "location" is a specific slope/basin, not a resort | Pure UI/map interaction (MapLibre GL click handler capturing lat/lon); feeds the existing forecast pipeline (FC-01/02/03/10) the same way FC-04's "Forecast Anywhere" does. No new external data source, but requires generalizing the location model from resort-ID-keyed to arbitrary-coordinate-keyed | P1 | Done | `/location/pin?lat=&lon=`, verified end-to-end (forecast, snow level, avalanche zone, conditions summary all resolve correctly for a dropped pin) |
| MAP-18 | Slope angle / aspect shading | Color-coded slope-angle overlay (e.g. 30-45° avalanche-relevant shading) so backcountry users can read terrain risk on the map while picking a pin | Not an OpenSnow feature, but standard in dedicated backcountry tools (CalTopo, avalanche.org terrain layers) and directly relevant now that arbitrary-point selection is in scope. Requires computing slope from a DEM — USGS 3DEP or NASADEM elevation tiles (free), processed offline into a slope-angle raster/vector tile set | P2 | Not Started | Bigger lift than other map layers: a one-time raster-processing pipeline, not a live API client. Stretch goal — don't block MAP-17 on this |

## 3. Severe Weather

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| SEV-01 | Severe weather alerts | Active NWS-style warnings for a location | NWS Alerts API (`api.weather.gov/alerts`) — free, no key, US only | P1 | Done | `lib/data-sources/nws.ts`, `/api/alerts` — verified live (returned empty for Phase 1 test points, correctly — no active alerts at test time) |
| SEV-02 | Lightning risk map | Lightning strike risk overlay | Blitzortung.org community lightning network (free, community-run, coverage not guaranteed) | P2 | Blocked | No robust free authoritative alternative to StormNet; needs evaluation |
| SEV-03 | Hail size map | Hail risk/size overlay | NWS Storm Prediction Center convective outlooks (free, US only) | P2 | Not Started | Categorical risk, not a size map — scope down |
| SEV-04 | Active fires map | Current wildfire locations | NASA FIRMS (Fire Information for Resource Management System) — free | P2 | Not Started | |
| SEV-05 | Wildfire smoke forecast map | Forecast smoke plume/AQI impact | NOAA HRRR-Smoke via AirNow Fire & Smoke Map data feed (free, registration) | P2 | Not Started | |
| SEV-06 | Air quality forecast map | Forecast AQI by area | Open-Meteo Air Quality API (free, no key, includes forecast) | P2 | Done (point, not map) | `/api/air-quality`, shown as a stat tile with US AQI/PM2.5/PM10 — live-verified. Point data per location, not yet rendered as a map overlay |
| SEV-07 | Air quality (current) map | Current AQI by area | Open-Meteo Air Quality API or AirNow API (free, key required) | P2 | Done (point, not map) | Same route/response as SEV-06 (`current` block) — same map-overlay caveat applies |

## 4. Snow Reports & Conditions

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| SNOW-01 | Estimated 24-hour snow reports | New snow in the last 24h per resort | NOAA NOHRSC snowfall analysis, sampled at resort coordinates | P0 | Done (substitute) | `/api/snow-report` uses Open-Meteo's `past_days` reanalysis, **not** NOHRSC — see `getRecent24hSnowfallIn()`'s caveat comment. Real NOHRSC point-query integration still needs scoping |
| SNOW-02 | Estimated trail conditions | Rough groomed/powder/icy condition estimate | Derived heuristic from recent precip + temp swings (no free direct feed) | P2 | Done | `lib/derive/trail-conditions.ts` — hours-since-last-snow + freeze-thaw-cycle counting from a recent Open-Meteo reanalysis window, shown as a stat tile |
| SNOW-03 | Conditions summary (multi-source corroborated) | A written, human-readable daily summary per resort that pulls from **NOAA's own forecaster-written text** — the NWS Area Forecast Discussion (AFD) product, which explains model reasoning/uncertainty in plain language — alongside our own derived forecast (FC-01/03/07/10) and SNOTEL/NOHRSC ground-truth observations, then reconciles them into one summary. Where sources agree, state it plainly; where they disagree (e.g. models split on totals, or the AFD flags uncertainty), say so explicitly rather than picking one number silently | Primary: NWS text products API (`api.weather.gov/products`, AFD product type, filtered to WFO SLC / WFO PIH for Phase 1) + Open-Meteo multi-model spread (FC-05) for model agreement/disagreement + SNOTEL actuals (DATA-01) as ground truth + Open-Meteo reanalysis (SNOW-01) for recent observed snow | P1 | Done | `lib/derive/conditions-summary.ts`, `/api/conditions-summary` — verified live, produces a real reconciled narrative (confirmed the AFD product endpoint works as documented). `recentSnotelMatchesForecast` corroboration flag is intentionally left `null` — needs stored forecast history, not built yet |
| SNOW-04 | Live snow (real-time updates during storms) | Fast-refreshing snow total ticker during active storms | Poll NOHRSC/Open-Meteo on a short interval during active precip | P2 | Not Started | |
| SNOW-05 | Historical hourly & daily weather | Look back at past conditions for a location | Open-Meteo Historical Weather API (free, no key, global archive) | P1 | Done | `getHistoricalWeather()` in open-meteo.ts (archive-api.open-meteo.com, confirmed live), `/api/historical`, shown as a "Past 7 days" table on the location dashboard. Daily granularity only so far, hourly not wired to UI |

## 5. Backcountry & Avalanche

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| BC-01 | Avalanche forecasts | Regional avalanche danger rating & discussion | avalanche.org public API (used by many third-party apps; US + parts of Canada, free, unofficial but stable) | P1 | Done | `lib/data-sources/avalanche-org.ts`, `/api/avalanche/[zoneId]` — endpoint and fields confirmed live for Aug 2026 (correctly returns empty/off-season data outside winter). Terms of use for production reliance still not reviewed |
| BC-02 | Avalanche zone lookup by coordinate | Resolve a dropped backcountry pin's lat/lon to the correct avalanche center + forecast zone, so BC-01's danger rating shows up for pins, not just curated resorts | avalanche.org publishes zone boundary GeoJSON (same data backing their own map); point-in-polygon test against cached zone boundaries (turf.js) | P1 | Done | `lib/derive/avalanche-zone-lookup.ts`, `/api/avalanche-zone` — correctly resolves Alta's coordinates to Utah Avalanche Center's "Salt Lake" zone. **The zone id lives at the GeoJSON Feature's top level (`feature.id`), not `properties.id`** — that was a real bug caught by live testing, fixed |

## 6. Personalization & Alerts

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| PERS-01 | Favorite Lists | Save/star locations for quick access — including custom backcountry pins (MAP-17), not just curated resorts | Local app data (DB table keyed to user), no external source | P0 | Done | `lib/favorites.ts` — localStorage-backed (no auth/DB yet, as planned), supports both resort IDs and arbitrary pins, shown on the landing page |
| PERS-02 | My Location Screen | Personalized home screen using device/current location | Browser Geolocation API + our forecast pipeline | P0 | Done | `components/location/MyLocationButton.tsx` — geolocates and routes into the same MAP-17 pin pipeline, no separate "screen" needed since a device location is just another coordinate |
| PERS-03 | Snow forecast & report alerts | Push/email alert when new snow crosses a threshold | Our own scheduled job (cron) comparing forecast deltas + a notification provider (email first, push later) | P1 | Not Started | Needs a notification-sending service decision |
| PERS-04 | iOS widgets | Home-screen widget showing forecast snapshot | Out of scope for web app; revisit only if a native/PWA shell is built | P2 | Not Started | |

## 7. Expert Content

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| EXP-01 | Local "Daily Snow" forecaster posts | Daily human-written regional forecast commentary | No equivalent free data feed — this is OpenSnow's human forecaster team, not a data product | P2 | Blocked | SNOW-03's multi-source corroborated summary is the practical substitute for now; revisit whether a dedicated "posts" feature is still needed once SNOW-03 ships |

## 8. Data & Stations

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Weather stations map | Map of nearby observation stations + readings | NWS Observation Stations API + NRCS SNOTEL station network (both free) | P1 | Done (list, not map) | Both SNOTEL (`lib/data-sources/snotel.ts`) and NWS observation stations (`getNearbyStations` in `nws.ts`) are wired into `/api/stations` and the dashboard's "Nearby stations" section, live-verified. **`stationTriplets=*:UT:SNTL,*:ID:SNTL` is the correct SNOTEL filter param — the originally-planned `networkCds`/`stateCds` params silently no-op and return all 4,390 US stations unfiltered** — real bug caught live, fixed. Shown as a text list, not yet plotted as map pins |
| DATA-02 | Fall colors map | Seasonal foliage change map | Smoky Mountains/USA National Phenology Network open data (free) | P2 | Not Started | Low priority, seasonal novelty feature |

## 9. Resort & Location Data (foundational, not in OpenSnow's own feature list but required by everything above)

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| RES-01 | Resort database (name, lat/lon, region) | Seed list of ski resorts/backcountry zones to power location pages | Manually curated JSON seed (no single free authoritative API); cross-check against OpenStreetMap `landuse=winter_sports` nodes | P0 | Done | `data/resorts.json` — 16 resorts across Northern Utah/SE Idaho. Coordinates/elevations are from general public knowledge, not cross-checked against OSM yet — see caveat in `data/resorts.ts` |
| RES-02 | Resort base/mid/summit elevation | Elevation stats per resort, at base/mid-mountain/summit granularity | Manually curated alongside RES-01, or USGS elevation API lookup by coordinate | P0 | Done | Included in `data/resorts.json`; not yet used for a full base/mid/summit snow-line band display (FC-10 currently shows base only) |

---

## How to use this matrix

- Update `Status` as work lands; add `Owner/PR` notes inline if useful.
- `Blocked` rows need a decision (legal/API-availability/design) before work starts — resolve those first if they sit on the P0/P1 critical path.
- Add new rows if scope grows; keep IDs stable once referenced by commits/PRs.
- Priorities are a starting suggestion (P0 = MVP slice, P1 = core product, P2 = breadth) — reorder freely.

## Implementation notes from the first build pass (Aug 2026)

The P0 slice and backcountry-first P1 work (FC-01/02/03/04/07/10/11, MAP-01/11/13/17, SEV-01, SNOW-01/03, BC-01/02, PERS-01, RES-01/02) were built and verified against **live** external APIs, not just planned. Several of the matrix's "unverified, confirm during build" caveats turned out to be real bugs, not hypothetical risk — worth recording so they aren't rediscovered:

- **avalanche.org**: the forecast zone id is the GeoJSON `Feature.id` (top-level), not `properties.id` — the latter doesn't exist on the feature at all. `properties.center` holds the full center name; there is no `properties.center_name`.
- **NRCS SNOTEL (AWDB REST API)**: station filtering requires `stationTriplets=*:UT:SNTL,*:ID:SNTL` (wildcard syntax). The originally-planned `networkCds`/`stateCds` query params are silently ignored — the request still returns HTTP 200 with all ~4,390 US stations nationwide, which reads as "it worked" until you check the count. The `/data` endpoint requires `beginDate`/`endDate` (relative values like `-3`/`0` work); there is no `durationCount`/`periodRef=END` shortcut.
- **Overpass API** (OSM piste data): returns HTTP 406 for any request that doesn't send an explicit `User-Agent` and `Accept` header — confirmed by reproducing with Node's native `fetch` (406) vs. `curl` (200) for an otherwise-identical request. Once headers are added it works, though the public instance is occasionally slow (seconds, sometimes a 504) — handled as a soft failure so a slow piste layer doesn't break the rest of the page.
- **NWS AFD text products** (`api.weather.gov/products`) and the **NWS gridpoint `snowLevel` field** both worked exactly as documented on the first live call — no surprises there.

Not yet built even where a row above says "Done": NOHRSC's actual snow-analysis grid (SNOW-01 uses an Open-Meteo reanalysis substitute instead), UDOT/Idaho 511 live camera images (MAP-16 currently links to camera *pages*, not live images), full base/mid/summit snow-line band display (FC-10 shows base elevation only), and forecast-vs-actual history for SNOW-03's `recentSnotelMatchesForecast` flag (always `null` today, honestly, rather than faked).

## Implementation notes from the second build pass — P2 breadth (Aug 2026)

Added air quality (SEV-06/07), historical lookback (SNOW-05), current radar (MAP-02/03, RainViewer), a grid-sampled snowfall/precip map overlay (MAP-05, MAP-10 Powder Finder), NWS observation stations (completing DATA-01), wet-bulb and multi-model UI (finishing FC-05/08), estimated trail conditions (SNOW-02), and My Location (PERS-02). Two real operational issues surfaced under load, not just integration-shape bugs:

- **Open-Meteo rate limiting is real, not hypothetical.** Loading a single location dashboard originally fanned out to 4 separate calls to `api.open-meteo.com/v1/forecast` (main forecast, a duplicate freezing-level fetch, multi-model comparison, and the trail-conditions window) plus 2 more to its air-quality/archive subdomains. Under this session's own repeated testing, that volume produced a **sustained 429** that survived a single retry and crashed the page with an uncaught error. Fixed three ways: (1) eliminated the duplicate freezing-level call — `getForecast()` already requests `freezing_level_height` in its hourly params, so `snow-level.ts` now reuses that instead of re-fetching it; (2) `fetchJson()` in `open-meteo.ts` now retries up to twice with backoff (750ms, 1.5s) instead of once; (3) added `app/location/error.tsx` so an upstream failure that survives retries shows a "temporarily unavailable, retry" message instead of Next's generic crash page. A **shared-egress-IP sandbox can hit free-tier rate limits faster than a real deployment would**, since other concurrent traffic may share the apparent source IP — worth keeping in mind before reading a rate-limit encounter as proof the app itself is over-calling in production.
- **Next.js's fetch data cache has a 2MB response-size ceiling.** The SNOTEL station-list request (~225 UT/ID stations, ~2.1MB — each station's `associatedHucs` array is large) silently failed to cache every time, logging a console warning but otherwise working. Switched that fetch to `cache: "no-store"` to match what was actually happening and drop the noise; a real fix (cache just the ~4 fields this app uses, not the full station payload) is still open.

Map overlays added this pass (MAP-02/03/05/10) are **not** true raster/tile products — RainViewer's radar is real tiles, but the snowfall/Powder Finder overlays are a coarse sampled point grid (6×6, batched via Open-Meteo's multi-location query) rendered as blurred circles. Real data, approximate resolution.
