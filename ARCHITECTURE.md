# Architecture

Technical design for building the features tracked in `TRACE_MATRIX.md`. The P0 slice and backcountry-first P1 work described here are now implemented and verified against live APIs (see the matrix's "Implementation notes from the first build pass" section) — this doc still describes the target design, with the "Project structure" section updated to match what's actually in the repo where it drifted from the original plan.

## Stack

- **Framework**: Next.js (App Router) + TypeScript — single deployable app covering both UI and API routes.
- **Styling**: Tailwind CSS.
- **Maps**: MapLibre GL JS (open-source, no vendor lock-in) with free vector/raster tile sources (MapTiler free tier and/or OpenStreetMap raster tiles).
- **Database**: Postgres (for resort seed data, favorites, alert subscriptions) — SQLite is fine for local dev, Postgres for anything deployed.
- **Deployment**: Vercel (pairs naturally with Next.js); cron-based jobs (forecast refresh, alert checks) via Vercel Cron or a small worker if that turns out to be too limited.
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
  # No /app/api/favorites/route.ts — PERS-01 is localStorage-only (lib/favorites.ts), no backend yet.
  # (location) route group from the original plan wasn't used — plain /location/* is simpler and avoids
  # a top-level catch-all colliding with other routes.
/lib
  /lib/data-sources/
    open-meteo.ts        # forecast, elevation, freezing level, multi-model snowfall, recent-snowfall reanalysis
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
    conditions-summary.ts  # SNOW-03: corroborates AFD text + multi-model spread + SNOTEL into one narrative
    avalanche-zone-lookup.ts # BC-02: point-in-polygon (turf.js) against avalanche.org zone boundaries
  /lib/models/types.ts     # shared TypeScript types — Location is coordinate-first: { lat, lon, source, resortId?, name, elevationFt? }
  /lib/util/               # geo.ts (haversine distance), api.ts (route param parsing/error helpers)
  /lib/favorites.ts        # PERS-01: useFavorites() hook, localStorage-backed
  /lib/location-dashboard.ts # orchestrates every source above into one payload for a location page
  # No /lib/db/ yet — no database in this build; everything is either a live API call or localStorage.
/components
  /components/map/SkiMap.tsx           # MapLibre wrapper: resort/webcam pins, pin-drop (MAP-17), piste overlay (MAP-13)
  /components/location/LocationDashboard.tsx # the shared resort/pin dashboard UI
  /components/location/FavoriteButton.tsx, FavoritesList.tsx
/data
  /data/resorts.json, resorts.ts       # RES-01/RES-02: 16 Northern Utah/SE Idaho resorts
  /data/webcams.json, webcams.ts       # MAP-16 seed: resort/UDOT webcam *page* links (not live images yet)
```

## Data flow

1. **Location model is coordinate-first, not resort-first.** Every data client (`open-meteo.ts`, `nws.ts`, etc.) takes a `{ lat, lon }` and nothing else — `resorts.json` (RES-01/RES-02) is a curated list of named coordinates for convenience (search, map pins, favorites shortcuts), and a backcountry pin dropped via MAP-17 is just an uncurated coordinate flowing through the identical pipeline. This is what lets backcountry skiing work: there's no special-casing between "resort" and "arbitrary point," only a `source: 'resort' | 'pin'` tag on the `Location` type for UI/analytics purposes.
2. **API routes** under `/app/api/*` are thin wrappers that call the relevant client in `/lib/data-sources/`, normalize the response into our own types (`/lib/models`), and cache (in-memory or a short-TTL DB cache) to stay within upstream rate limits — none of these free APIs are built for high-frequency polling from many users.
3. **Derived features** (powder quality, wet-bulb, snow level, conditions summary) live in `/lib/derive/` as pure functions over normalized forecast data, unit-testable independent of any network call.
   - `conditions-summary.ts` is the one derive function that fans out to multiple sources rather than transforming one: it pulls the AFD text, the multi-model spread, and SNOTEL/NOHRSC observations, then applies simple corroboration rules (do the models agree within some tolerance? does the AFD flag uncertainty? does observed SNOTEL data match what was forecast for the prior period?) before composing the summary — this is the one place in the app doing source reconciliation rather than a single-source lookup.
4. **Map layers** are added incrementally as MapLibre GL sources/layers — each map feature in the matrix (MAP-02 through MAP-16) is one additional layer + a data-source client, not a new map component. The webcam layer (MAP-16) is pins + an image/link popup, not a tile layer, so it's simpler than the raster overlays.
5. **Alerts (PERS-03)** run as a scheduled job comparing latest forecast snapshots against stored user thresholds, then send via an email provider (start here — simplest) before considering push.

## Build order (maps to matrix priorities)

1. ✅ **P0 slice**: `resorts.json` seed data (Northern Utah/SE Idaho) → `/api/forecast` via Open-Meteo → location dashboard rendering a multi-day + hourly forecast, 24h snow estimate, and snow level vs. elevation (FC-10) → favorites (local-only, no auth).
2. ✅ **P1 core, backcountry first**: base MapLibre map with resort pins + click-to-drop-pin (MAP-17) reusing the same location pipeline → elevation lookup for pins (FC-11) → avalanche zone lookup by coordinate (BC-02) feeding avalanche forecasts (BC-01). Confirmed working end-to-end for a dropped pin, not just curated resorts.
3. ✅ **P1 core, remaining**: snow reports (via substitute source, see notes), piste overlay + webcam pins (MAP-16, page-link-only for now), multi-source corroborated conditions summary (SNOW-03). Historical lookback (SNOW-05) not yet built.
4. **P2 breadth** — not started: remaining map overlays (radar, smoke, temperature/wind/cloud forecast layers), slope-angle/aspect shading (MAP-18), offline map caching, personalization/alerts backend, fall colors, live UDOT/Idaho 511 camera images.

## Resolved during the first build pass

These were open questions in the original design; all three turned out to be real integration bugs, not just theoretical risk (see `TRACE_MATRIX.md`'s "Implementation notes" for the full detail):

- **AFD text product retrieval** (SNOW-03) — confirmed: `api.weather.gov/products/types/AFD/locations/{wfo}` works exactly as documented, no surprises.
- **Avalanche zone boundaries** (BC-02) — confirmed the map-layer GeoJSON endpoint and shape, but the zone id is `Feature.id` (top-level), not `properties.id` as originally assumed.
- **SNOTEL station filtering** — the originally-assumed `networkCds`/`stateCds` params don't work; `stationTriplets=*:UT:SNTL,*:ID:SNTL` wildcard syntax is required, confirmed against the AWDB API's own OpenAPI spec.
- **Overpass API** (MAP-13, not in the original open-questions list but hit live) — needs an explicit `User-Agent`/`Accept` header or it 406s.

## Still open

- Lightning risk (SEV-02): evaluate Blitzortung.org reliability/coverage before committing to it.
- Forecast radar (MAP-02): RainViewer covers current + short nowcast, not OpenSnow's full forecast radar — may need to scope this down to "current radar" only. Not attempted yet.
- NOHRSC integration (SNOW-01): still using an Open-Meteo reanalysis substitute rather than NOHRSC's actual snow-analysis grid — scope a real point-query approach.
- Webcam sourcing (MAP-16): UDOT's camera API needs a free developer-key signup (rate-limited, ~10 calls/60s) — not signed up for yet, so MAP-16 currently links to camera *pages* rather than showing live images. Idaho's 511/ITD equivalent needs the same evaluation. Resort-hosted webcam images need per-site terms-of-use review before hotlinking.
- Slope-angle shading (MAP-18): this is the one feature requiring an offline raster-processing pipeline rather than a live API client — scope the DEM source (USGS 3DEP vs. NASADEM) and tiling approach before starting.
- Resort seed data accuracy (RES-01/02): coordinates/elevations in `data/resorts.json` are from general knowledge, not verified against each resort's own published stats or cross-checked against OSM yet.
