# OpenSnow Feature Trace Matrix

This matrix inventories the real, shipped feature set of OpenSnow (as of Aug 2026, sourced primarily from OpenSnow's own [Support Center feature guides](https://support.opensnow.com/feature-guides), App Store listing, and public reporting) and tracks the build status of an independent, open-data reimplementation in this repo.

This project does **not** replicate OpenSnow's subscription tiering — every feature below is being built as a single, ungated tier. The `Access Tier` column from the original product has been dropped; a `Data Source Plan` column replaces it, mapping each feature to the free/open data source we'll use instead of OpenSnow's proprietary PEAKS/StormNet models.

See `ARCHITECTURE.md` for the technical design these data sources plug into.

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
| FC-01 | Multi-day forecast | Daily temp/precip/wind outlook for a location | Open-Meteo Forecast API (up to 16 days, free, no key) | P0 | Not Started | Replaces PEAKS-driven "11-15 Day Forecasts" |
| FC-02 | Hourly forecast | Hour-by-hour temp/precip/wind | Open-Meteo Forecast API (hourly block) | P0 | Not Started | |
| FC-03 | Snow forecast (inches by day) | Forecasted new snowfall per day | Derived: Open-Meteo `snowfall` hourly variable, summed to daily | P0 | Not Started | Accuracy will trail OpenSnow's mountain-tuned PEAKS model — flag as approximate in UI |
| FC-04 | Forecast Anywhere | Forecast for any lat/lon, not just curated resorts | Open-Meteo (global coverage) + reverse geocoding (Open-Meteo Geocoding API) | P1 | Not Started | |
| FC-05 | Forecast Range (multi-model comparison) | Show spread across multiple weather models for the same point | Open-Meteo "multi-model" endpoint (GFS, ECMWF, ICON, etc. — free tier includes several) | P2 | Not Started | Open-Meteo exposes model selection as a query param |
| FC-06 | Precipitation by model | Compare precip totals across models | Same Open-Meteo multi-model endpoint, precip variable | P2 | Not Started | |
| FC-07 | Powder Quality (snow density/quality estimate) | Qualitative read on whether new snow will be light/dense | Derived heuristic: temp-at-precip-time vs. NWS/Open-Meteo snow ratio guidance (e.g. Cobb's Rule) | P1 | Not Started | No free API gives this directly; needs a formula |
| FC-08 | Snowmaking (wet-bulb temp) forecast | Wet-bulb temp forecast for resort snowmaking ops | Derived: wet-bulb calc from Open-Meteo temp + humidity + pressure | P2 | Not Started | Formula-based, not a raw feed |
| FC-09 | Powder Vision (visual powder-day likelihood) | At-a-glance "how good will it be" indicator | Derived composite score from FC-01/03/07 | P2 | Not Started | Original OpenSnow feature; needs our own scoring design |

## 2. Maps & Visualization

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| MAP-01 | Base map (3D/terrain) | Interactive terrain map | MapLibre GL JS + free vector tiles (MapTiler free tier or OSM raster fallback) | P1 | Not Started | Open-source map renderer, no vendor lock-in |
| MAP-02 | Current & forecast radar | Animated precip radar, now + forecast | RainViewer public API (free, no key) for current radar; forecast radar is a gap — flag Blocked | P1 | Blocked | RainViewer covers "current + nowcast," not full forecast radar like OpenSnow |
| MAP-03 | Global radar | Radar outside the US | RainViewer (has global coverage) | P1 | Not Started | |
| MAP-04 | Forecast precipitation map | Map overlay of forecast precip by area | Open-Meteo gridded forecast, rendered as heatmap tiles we generate | P2 | Not Started | Needs a small tile-generation service; no free hosted tile API for this |
| MAP-05 | Forecast snowfall map | Map overlay of forecast new snow by area | Same approach as MAP-04, `snowfall` variable | P1 | Not Started | |
| MAP-06 | Estimated snowfall map | Recent/estimated snow accumulation by area | NOAA NOHRSC daily snowfall analysis (free, public, US only) | P1 | Not Started | Good authoritative free source |
| MAP-07 | Temperature forecast map | Forecast temp overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-08 | Wind gust forecast map | Forecast wind gust overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-09 | Cloud cover forecast map | Forecast cloud cover overlay | Open-Meteo gridded, rendered as our own tiles | P2 | Not Started | |
| MAP-10 | Powder Finder map | Map highlighting best current powder by region | Derived composite from MAP-05/MAP-06 across resort seed data | P2 | Not Started | |
| MAP-11 | Mini location maps | Small embedded map per location page | MapLibre GL JS, reused component | P1 | Not Started | |
| MAP-12 | Offline satellite & terrain maps | Downloadable map tiles for offline use | MapTiler/MapLibre offline tile caching (browser cache or PWA storage) | P2 | Not Started | Needs PWA/service-worker work |
| MAP-13 | Offline ski resort trail maps | Downloadable piste/trail maps | OpenStreetMap `piste:*` tags via Overpass API (free, open data) | P1 | Not Started | Resort-published trail map PDFs are typically copyrighted — OSM piste data is the legally clean free alternative; coverage varies by resort |
| MAP-14 | Land boundary & ownership maps | Public/private/wilderness boundary overlay | USGS PAD-US (Protected Areas Database) + USFS/BLM open GIS data (free, public domain) | P2 | Not Started | |
| MAP-15 | Recent satellite maps | Recent satellite imagery layer | NASA GIBS (Global Imagery Browse Services) — free WMTS tiles | P2 | Not Started | |

## 3. Severe Weather

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| SEV-01 | Severe weather alerts | Active NWS-style warnings for a location | NWS Alerts API (`api.weather.gov/alerts`) — free, no key, US only | P1 | Not Started | Direct 1:1 replacement, no modeling needed |
| SEV-02 | Lightning risk map | Lightning strike risk overlay | Blitzortung.org community lightning network (free, community-run, coverage not guaranteed) | P2 | Blocked | No robust free authoritative alternative to StormNet; needs evaluation |
| SEV-03 | Hail size map | Hail risk/size overlay | NWS Storm Prediction Center convective outlooks (free, US only) | P2 | Not Started | Categorical risk, not a size map — scope down |
| SEV-04 | Active fires map | Current wildfire locations | NASA FIRMS (Fire Information for Resource Management System) — free | P2 | Not Started | |
| SEV-05 | Wildfire smoke forecast map | Forecast smoke plume/AQI impact | NOAA HRRR-Smoke via AirNow Fire & Smoke Map data feed (free, registration) | P2 | Not Started | |
| SEV-06 | Air quality forecast map | Forecast AQI by area | Open-Meteo Air Quality API (free, no key, includes forecast) | P2 | Not Started | |
| SEV-07 | Air quality (current) map | Current AQI by area | Open-Meteo Air Quality API or AirNow API (free, key required) | P2 | Not Started | |

## 4. Snow Reports & Conditions

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| SNOW-01 | Estimated 24-hour snow reports | New snow in the last 24h per resort | NOAA NOHRSC snowfall analysis, sampled at resort coordinates | P0 | Not Started | Core "did it snow" feature |
| SNOW-02 | Estimated trail conditions | Rough groomed/powder/icy condition estimate | Derived heuristic from recent precip + temp swings (no free direct feed) | P2 | Not Started | Needs our own scoring logic |
| SNOW-03 | Conditions summary | Human-readable daily conditions blurb per resort | Generated summary from FC/SNOW data, template or LLM-assisted copy | P1 | Not Started | |
| SNOW-04 | Live snow (real-time updates during storms) | Fast-refreshing snow total ticker during active storms | Poll NOHRSC/Open-Meteo on a short interval during active precip | P2 | Not Started | |
| SNOW-05 | Historical hourly & daily weather | Look back at past conditions for a location | Open-Meteo Historical Weather API (free, no key, global archive) | P1 | Not Started | |

## 5. Backcountry & Avalanche

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| BC-01 | Avalanche forecasts | Regional avalanche danger rating & discussion | avalanche.org public API (used by many third-party apps; US + parts of Canada, free, unofficial but stable) | P1 | Not Started | Confirm current API terms before relying on it in production |

## 6. Personalization & Alerts

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| PERS-01 | Favorite Lists | Save/star locations for quick access | Local app data (DB table keyed to user), no external source | P0 | Not Started | Needs basic auth/user model first |
| PERS-02 | My Location Screen | Personalized home screen using device/current location | Browser Geolocation API + our forecast pipeline | P0 | Not Started | |
| PERS-03 | Snow forecast & report alerts | Push/email alert when new snow crosses a threshold | Our own scheduled job (cron) comparing forecast deltas + a notification provider (email first, push later) | P1 | Not Started | Needs a notification-sending service decision |
| PERS-04 | iOS widgets | Home-screen widget showing forecast snapshot | Out of scope for web app; revisit only if a native/PWA shell is built | P2 | Not Started | |

## 7. Expert Content

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| EXP-01 | Local "Daily Snow" forecaster posts | Daily human-written regional forecast commentary | No equivalent free data feed — this is OpenSnow's human forecaster team, not a data product | P2 | Blocked | Either skip, write our own periodic summary posts, or generate templated commentary from FC/SNOW data |

## 8. Data & Stations

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| DATA-01 | Weather stations map | Map of nearby observation stations + readings | NWS Observation Stations API + NRCS SNOTEL station network (both free) | P1 | Not Started | |
| DATA-02 | Fall colors map | Seasonal foliage change map | Smoky Mountains/USA National Phenology Network open data (free) | P2 | Not Started | Low priority, seasonal novelty feature |

## 9. Resort & Location Data (foundational, not in OpenSnow's own feature list but required by everything above)

| ID | Feature | Description | Data Source Plan | Priority | Status | Notes |
|---|---|---|---|---|---|---|
| RES-01 | Resort database (name, lat/lon, region) | Seed list of ski resorts/backcountry zones to power location pages | Manually curated JSON seed (no single free authoritative API); cross-check against OpenStreetMap `landuse=winter_sports` nodes | P0 | Not Started | This underlies almost every other feature — build first |
| RES-02 | Resort base/summit elevation | Elevation stats per resort | Manually curated alongside RES-01, or USGS elevation API lookup by coordinate | P0 | Not Started | |

---

## How to use this matrix

- Update `Status` as work lands; add `Owner/PR` notes inline if useful.
- `Blocked` rows need a decision (legal/API-availability/design) before work starts — resolve those first if they sit on the P0/P1 critical path.
- Add new rows if scope grows; keep IDs stable once referenced by commits/PRs.
- Priorities are a starting suggestion (P0 = MVP slice, P1 = core product, P2 = breadth) — reorder freely.
