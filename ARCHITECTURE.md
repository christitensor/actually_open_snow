# Architecture

Technical design for building the features tracked in `TRACE_MATRIX.md`. This is a design doc, not yet implemented — see the matrix for per-feature status.

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

## Project structure

```
/app
  /app/page.tsx                    # landing / location search + map
  /app/(location)/[slug]/page.tsx  # per-resort/location dashboard (slug = resort ID)
  /app/(location)/pin/page.tsx     # backcountry pin dashboard, reads ?lat=&lon= (same UI as resort dashboard)
  /app/api/forecast/route.ts       # takes ?lat=&lon= — resort pages resolve their slug to coords first
  /app/api/snow-report/route.ts
  /app/api/elevation/route.ts      # FC-11: Open-Meteo elevation lookup for arbitrary points
  /app/api/alerts/route.ts
  /app/api/avalanche-zone/route.ts # BC-02: resolve lat/lon -> avalanche center + zone
  /app/api/avalanche/[zoneId]/route.ts
  /app/api/stations/route.ts
  /app/api/favorites/route.ts
/lib
  /lib/data-sources/
    open-meteo.ts       # forecast, historical, air quality, elevation client
    nws.ts               # api.weather.gov client (alerts, gridpoints, stations)
    nohrsc.ts             # NOAA snowfall analysis client
    snotel.ts             # NRCS SNOTEL client
    avalanche-org.ts      # avalanche.org client (forecasts + zone boundary GeoJSON for BC-02)
    osm.ts                 # Overpass API client for piste/trail data
    firms.ts                # NASA FIRMS wildfire client
    nws-products.ts          # api.weather.gov text products client (Area Forecast Discussion)
    webcams.ts                # UDOT + Idaho 511/ITD camera feeds + curated resort webcam links
  /lib/derive/
    powder-quality.ts    # FC-07 heuristic
    wet-bulb.ts           # FC-08 formula
    snow-level.ts          # FC-10: NWS snowLevel + Open-Meteo freezing_level_height, resolved against elevation
    conditions-summary.ts # SNOW-03 generator — corroborates AFD text, multi-model spread, and SNOTEL/NOHRSC observations
    avalanche-zone-lookup.ts # BC-02: point-in-polygon against cached zone boundaries (turf.js)
  /lib/models/            # shared TypeScript types — Location is `{ lat, lon, source: 'resort' | 'pin', resortId?, elevation? }`
  /lib/db/                # Postgres client + queries
/components
  /components/map/         # MapLibre wrapper + layer components (radar, snowfall, trails, webcams, pin-drop handler, ...)
  /components/forecast/    # forecast table/cards
  /components/location/    # location header, favorites toggle (works for both resort and pin locations)
/data
  /data/resorts.json       # RES-01/RES-02 curated seed data
```

## Data flow

1. **Location model is coordinate-first, not resort-first.** Every data client (`open-meteo.ts`, `nws.ts`, etc.) takes a `{ lat, lon }` and nothing else — `resorts.json` (RES-01/RES-02) is a curated list of named coordinates for convenience (search, map pins, favorites shortcuts), and a backcountry pin dropped via MAP-17 is just an uncurated coordinate flowing through the identical pipeline. This is what lets backcountry skiing work: there's no special-casing between "resort" and "arbitrary point," only a `source: 'resort' | 'pin'` tag on the `Location` type for UI/analytics purposes.
2. **API routes** under `/app/api/*` are thin wrappers that call the relevant client in `/lib/data-sources/`, normalize the response into our own types (`/lib/models`), and cache (in-memory or a short-TTL DB cache) to stay within upstream rate limits — none of these free APIs are built for high-frequency polling from many users.
3. **Derived features** (powder quality, wet-bulb, snow level, conditions summary) live in `/lib/derive/` as pure functions over normalized forecast data, unit-testable independent of any network call.
   - `conditions-summary.ts` is the one derive function that fans out to multiple sources rather than transforming one: it pulls the AFD text, the multi-model spread, and SNOTEL/NOHRSC observations, then applies simple corroboration rules (do the models agree within some tolerance? does the AFD flag uncertainty? does observed SNOTEL data match what was forecast for the prior period?) before composing the summary — this is the one place in the app doing source reconciliation rather than a single-source lookup.
4. **Map layers** are added incrementally as MapLibre GL sources/layers — each map feature in the matrix (MAP-02 through MAP-16) is one additional layer + a data-source client, not a new map component. The webcam layer (MAP-16) is pins + an image/link popup, not a tile layer, so it's simpler than the raster overlays.
5. **Alerts (PERS-03)** run as a scheduled job comparing latest forecast snapshots against stored user thresholds, then send via an email provider (start here — simplest) before considering push.

## Build order (maps to matrix priorities)

1. **P0 slice**: `resorts.json` seed data (Northern Utah/SE Idaho, base/mid/summit elevations) → `/api/forecast` via Open-Meteo → one location page rendering a multi-day + hourly forecast, 24h snow estimate, and snow level vs. resort elevation (FC-10) → favorites (local-only first, no auth yet).
2. **P1 core, backcountry first**: base MapLibre map with resort pins + click-to-drop-pin (MAP-17) reusing the same location pipeline as step 1 → elevation lookup for pins (FC-11) → avalanche zone lookup by coordinate (BC-02) feeding avalanche forecasts (BC-01). This turns the P0 resort slice into a backcountry-capable one with comparatively little new work, since the location model was already coordinate-first.
3. **P1 core, remaining**: snow reports, historical lookback, NWS severe alerts, piste overlay + webcam pins (MAP-16), multi-source corroborated conditions summary (SNOW-03).
4. **P2 breadth**: remaining map overlays (radar, smoke, temperature/wind/cloud forecast layers), slope-angle/aspect shading (MAP-18), offline map caching, personalization/alerts backend, fall colors, weather-station map.

## Open questions to resolve before/while building (see `Blocked` rows in the matrix)

- Lightning risk (SEV-02): evaluate Blitzortung.org reliability/coverage before committing to it.
- Forecast radar (MAP-02): RainViewer covers current + short nowcast, not OpenSnow's full forecast radar — may need to scope this down to "current radar" only.
- Daily forecaster commentary (EXP-01): decide whether to skip, hand-write periodic posts, or generate templated summaries from our own derived data — SNOW-03 is the practical substitute for now.
- AFD text product retrieval (SNOW-03): confirm the exact `api.weather.gov/products` query (product type + WFO location code) for SLC/PIH during implementation — the products API is documented but wasn't independently re-verified beyond the gridpoint API.
- Webcam sourcing (MAP-16): UDOT's camera API needs a free developer-key signup (rate-limited, ~10 calls/60s) — factor that into caching design so we're not calling it per page load. Idaho's equivalent (511/ITD) needs the same evaluation. Resort-hosted webcam images need per-site terms-of-use review before hotlinking.
- Avalanche zone boundaries (BC-02): confirm the exact avalanche.org GeoJSON endpoint/format for zone polygons (it backs their own public map, but wasn't independently re-verified) before building the point-in-polygon lookup.
- Slope-angle shading (MAP-18): this is the one feature requiring an offline raster-processing pipeline rather than a live API client — scope the DEM source (USGS 3DEP vs. NASADEM) and tiling approach before starting; don't let it block MAP-17, which is the actually load-bearing backcountry feature.
