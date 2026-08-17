# OpenSnow Feature Trace Matrix

This matrix inventories the real, shipped feature set of OpenSnow (as of Aug 2026, sourced primarily from OpenSnow's own [Support Center feature guides](https://support.opensnow.com/feature-guides), App Store listing, and public reporting) and tracks the build status of an independent, open-data reimplementation in this repo.

This project does **not** replicate OpenSnow's subscription tiering — every feature below is being built as a single, ungated tier. The `Access Tier` column from the original product has been dropped; a `Data Source Plan` column replaces it, mapping each feature to the free/open data source we'll use instead of OpenSnow's proprietary PEAKS/StormNet models.

See `ARCHITECTURE.md` for the technical design these data sources plug into.

**Build status (Aug 2026):** the P0 slice and backcountry-first P1 work are implemented and verified against live APIs — see "Implementation notes from the first build pass" at the end of this file for real bugs found and fixed along the way (they weren't hypothetical caveats; every one of them was hit live).

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
| FC-05 | Forecast Range (multi-model comparison) | Show spread across multiple weather models for the same point | Open-Meteo "multi-model" endpoint (GFS, ECMWF, ICON, etc. — free tier includes several) | P2 | In Progress | `getMultiModelDailySnowfall()` in open-meteo.ts works and feeds SNOW-03's corroboration, but there's no dedicated UI for browsing per-model spread yet |
| FC-06 | Precipitation by model | Compare precip totals across models | Same Open-Meteo multi-model endpoint, precip variable | P2 | Not Started | |
| FC-07 | Powder Quality (snow density/quality estimate) | Qualitative read on whether new snow will be light/dense | Derived heuristic: temp-at-precip-time vs. NWS/Open-Meteo snow ratio guidance (e.g. Cobb's Rule) | P1 | Done | `lib/derive/powder-quality.ts`, shown on the location dashboard |
| FC-08 | Snowmaking (wet-bulb temp) forecast | Wet-bulb temp forecast for resort snowmaking ops | Derived: Stull (2011) wet-bulb approximation from Open-Meteo temp + humidity | P2 | In Progress | `lib/derive/wet-bulb.ts` implemented and correct, not yet surfaced in any route/UI |
| FC-09 | Powder Vision (visual powder-day likelihood) | At-a-glance "how good will it be" indicator | Derived composite score from FC-01/03/07 | P2 | Not Started | Original OpenSnow feature; needs our own scoring design |
| FC-10 | Snow level (rain/snow line) by elevation | Elevation at which precip transitions from rain to snow, shown against each resort's base/mid/summit elevation so users can tell "raining at base, snowing up top" | NWS gridpoint `snowLevel` property (`api.weather.gov`, primary, US only, direct field — no derivation needed) + Open-Meteo `freezing_level_height` hourly variable (fallback/corroboration, global) | P0 | Done | `lib/derive/snow-level.ts`, `/api/snow-level` — the direct `snowLevel` field is real and confirmed live; dashboard shows base-elevation vs. snow-line status, full base/mid/summit band display not yet built |
| FC-11 | Elevation lookup for any point | Elevation for a dropped backcountry pin (not just curated resorts), so FC-10's snow-level comparison and forecast context work anywhere, not only at seeded locations | Open-Meteo Elevation API (free, no key, global, SRTM-based, single point query) | P1 | Done | `/api/elevation` — verified live |

## 2. Maps & Visualization

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| MAP-01 | Base map (3D/terrain) | Interactive terrain map | MapLibre GL JS + free vector tiles (MapTiler free tier or OSM raster fallback) | P1 | Done | `components/map/SkiMap.tsx` — shipped with plain OSM raster tiles (no MapTiler key configured yet), no 3D/terrain mode yet |
| MAP-02 | Current & forecast radar | Animated precip radar, now + forecast | RainViewer public API (free, no key) for current radar; forecast radar is a gap — flag Blocked | P1 | Blocked | RainViewer covers "current + nowcast," not full forecast radar like OpenSnow |
| MAP-03 | Global radar | Radar outside the US | RainViewer (has global coverage) | P1 | Not Started | |
| MAP-04 | Forecast precipitation map | Map overlay of forecast precip by area | Open-Meteo gridded forecast, rendered as heatmap tiles we generate | P2 | Not Started | Needs a small tile-generation service; no free hosted tile API for this |
| MAP-05 | Forecast snowfall map | Map overlay of forecast new snow by area | Same approach as MAP-04, `snowfall` variable | P1 | Not Started | |
| MAP-06 | Estimated snowfall map | Recent/estimated snow accumulation by area | NOAA NOHRSC daily snowfall analysis (free, public, US only) | P1 | Not Started | Good authoritative free source |
| MAP-07 | Temperature forecast map | Forecast temp overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-08 | Wind gust forecast map | Forecast wind gust overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-09 | Cloud cover forecast map | Forecast cloud cover overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-10 | Powder Finder map | Map highlighting best current powder by region | Derived composite from MAP-05/MAP-06 across resort seed data | P2 | Not Started | |
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
| SEV-06 | Air quality forecast map | Forecast AQI by area | Open-Meteo Air Quality API (free, no key, includes forecast) | P2 | Not Started | |
| SEV-07 | Air quality (current) map | Current AQI by area | Open-Meteo Air Quality API or AirNow API (free, key required) | P2 | Not Started | |

## 4. Snow Reports & Conditions

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| SNOW-01 | Estimated 24-hour snow reports | New snow in the last 24h per resort | NOAA NOHRSC snowfall analysis, sampled at resort coordinates | P0 | Done (substitute) | `/api/snow-report` uses Open-Meteo's `past_days` reanalysis, **not** NOHRSC — see `getRecent24hSnowfallIn()`'s caveat comment. Real NOHRSC point-query integration still needs scoping |
| SNOW-02 | Estimated trail conditions | Rough groomed/powder/icy condition estimate | Derived heuristic from recent precip + temp swings (no free direct feed) | P2 | Not Started | Needs our own scoring logic |
| SNOW-03 | Conditions summary (multi-source corroborated) | A written, human-readable daily summary per resort that pulls from **NOAA's own forecaster-written text** — the NWS Area Forecast Discussion (AFD) product, which explains model reasoning/uncertainty in plain language — alongside our own derived forecast (FC-01/03/07/10) and SNOTEL/NOHRSC ground-truth observations, then reconciles them into one summary. Where sources agree, state it plainly; where they disagree (e.g. models split on totals, or the AFD flags uncertainty), say so explicitly rather than picking one number silently | Primary: NWS text products API (`api.weather.gov/products`, AFD product type, filtered to WFO SLC / WFO PIH for Phase 1) + Open-Meteo multi-model spread (FC-05) for model agreement/disagreement + SNOTEL actuals (DATA-01) as ground truth + Open-Meteo reanalysis (SNOW-01) for recent observed snow | P1 | Done | `lib/derive/conditions-summary.ts`, `/api/conditions-summary` — verified live, produces a real reconciled narrative (confirmed the AFD product endpoint works as documented). `recentSnotelMatchesForecast` corroboration flag is intentionally left `null` — needs stored forecast history, not built yet |
| SNOW-04 | Live snow (real-time updates during storms) | Fast-refreshing snow total ticker during active storms | Poll NOHRSC/Open-Meteo on a short interval during active precip | P2 | Not Started | |
| SNOW-05 | Historical hourly & daily weather | Look back at past conditions for a location | Open-Meteo Historical Weather API (free, no key, global archive) | P1 | Not Started | Client not built yet — Open-Meteo's forecast client covers `past_days` only (used by SNOW-01), not the separate archive API |

## 5. Backcountry & Avalanche

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| BC-01 | Avalanche forecasts | Regional avalanche danger rating & discussion | avalanche.org public API (used by many third-party apps; US + parts of Canada, free, unofficial but stable) | P1 | Done | `lib/data-sources/avalanche-org.ts`, `/api/avalanche/[zoneId]` — endpoint and fields confirmed live for Aug 2026 (correctly returns empty/off-season data outside winter). Terms of use for production reliance still not reviewed |
| BC-02 | Avalanche zone lookup by coordinate | Resolve a dropped backcountry pin's lat/lon to the correct avalanche center + forecast zone, so BC-01's danger rating shows up for pins, not just curated resorts | avalanche.org publishes zone boundary GeoJSON (same data backing their own map); point-in-polygon test against cached zone boundaries (turf.js) | P1 | Done | `lib/derive/avalanche-zone-lookup.ts`, `/api/avalanche-zone` — correctly resolves Alta's coordinates to Utah Avalanche Center's "Salt Lake" zone. **The zone id lives at the GeoJSON Feature's top level (`feature.id`), not `properties.id`** — that was a real bug caught by live testing, fixed |

## 6. Personalization & Alerts

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| PERS-01 | Favorite Lists | Save/star locations for quick access — including custom backcountry pins (MAP-17), not just curated resorts | Local app data (DB table keyed to user), no external source | P0 | Done | `lib/favorites.ts` — localStorage-backed (no auth/DB yet, as planned), supports both resort IDs and arbitrary pins, shown on the landing page |
| PERS-02 | My Location Screen | Personalized home screen using device/current location | Browser Geolocation API + our forecast pipeline | P0 | Not Started | |
| PERS-03 | Snow forecast & report alerts | Push/email alert when new snow crosses a threshold | Our own scheduled job (cron) comparing forecast deltas + a notification provider (email first, push later) | P1 | Not Started | Needs a notification-sending service decision |
| PERS-04 | iOS widgets | Home-screen widget showing forecast snapshot | Out of scope for web app; revisit only if a native/PWA shell is built | P2 | Not Started | |

## 7. Expert Content

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| EXP-01 | Local "Daily Snow" forecaster posts | Daily human-written regional forecast commentary | No equivalent free data feed — this is OpenSnow's human forecaster team, not a data product | P2 | Blocked | SNOW-03's multi-source corroborated summary is the practical substitute for now; revisit whether a dedicated "posts" feature is still needed once SNOW-03 ships |

## 8. Data & Stations

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Weather stations map | Map of nearby observation stations + readings | NWS Observation Stations API + NRCS SNOTEL station network (both free) | P1 | In Progress | SNOTEL half done (`lib/data-sources/snotel.ts`, `/api/stations`, shown on location dashboard) and live-verified (correctly returns Atwater/Snowbird/Brighton/Mill-D North/Thaynes Canyon near Alta). **`stationTriplets=*:UT:SNTL,*:ID:SNTL` is the correct filter param — the originally-planned `networkCds`/`stateCds` params silently no-op and return all 4,390 US stations unfiltered** — real bug caught live, fixed. NWS observation-stations client (`getNearbyStations` in `nws.ts`) is written but not wired into a route/UI yet; no map view of stations yet either |
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
