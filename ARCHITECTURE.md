# Architecture

Technical design for building the features tracked in `TRACE_MATRIX.md`. This is a design doc, not yet implemented — see the matrix for per-feature status.

## Stack

- **Framework**: Next.js (App Router) + TypeScript — single deployable app covering both UI and API routes.
- **Styling**: Tailwind CSS.
- **Maps**: MapLibre GL JS (open-source, no vendor lock-in) with free vector/raster tile sources (MapTiler free tier and/or OpenStreetMap raster tiles).
- **Database**: Postgres (for resort seed data, favorites, alert subscriptions) — SQLite is fine for local dev, Postgres for anything deployed.
- **Deployment**: Vercel (pairs naturally with Next.js); cron-based jobs (forecast refresh, alert checks) via Vercel Cron or a small worker if that turns out to be too limited.
- **No subscription/billing infrastructure** — every feature ships ungated, per the decision to drop OpenSnow's tiering.

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
  /app/page.tsx                    # landing / location search
  /app/(location)/[slug]/page.tsx  # per-resort/location dashboard
  /app/api/forecast/[locationId]/route.ts
  /app/api/snow-report/[locationId]/route.ts
  /app/api/alerts/[locationId]/route.ts
  /app/api/avalanche/[zoneId]/route.ts
  /app/api/stations/route.ts
  /app/api/favorites/route.ts
/lib
  /lib/data-sources/
    open-meteo.ts       # forecast, historical, air quality client
    nws.ts               # api.weather.gov client (alerts, gridpoints, stations)
    nohrsc.ts             # NOAA snowfall analysis client
    snotel.ts             # NRCS SNOTEL client
    avalanche-org.ts      # avalanche.org client
    osm.ts                 # Overpass API client for piste/trail data
    firms.ts                # NASA FIRMS wildfire client
  /lib/derive/
    powder-quality.ts    # FC-07 heuristic
    wet-bulb.ts           # FC-08 formula
    conditions-summary.ts # SNOW-03 generator
  /lib/models/            # shared TypeScript types (Location, ForecastDay, SnowReport, ...)
  /lib/db/                # Postgres client + queries
/components
  /components/map/         # MapLibre wrapper + layer components (radar, snowfall, trails, ...)
  /components/forecast/    # forecast table/cards
  /components/location/    # location header, favorites toggle
/data
  /data/resorts.json       # RES-01/RES-02 curated seed data
```

## Data flow

1. **Seed data** (`/data/resorts.json`, RES-01/RES-02) is the anchor: every location page, map pin, and alert subscription keys off a resort/location ID with lat/lon.
2. **API routes** under `/app/api/*` are thin wrappers that call the relevant client in `/lib/data-sources/`, normalize the response into our own types (`/lib/models`), and cache (in-memory or a short-TTL DB cache) to stay within upstream rate limits — none of these free APIs are built for high-frequency polling from many users.
3. **Derived features** (powder quality, wet-bulb, conditions summary) live in `/lib/derive/` as pure functions over normalized forecast data, unit-testable independent of any network call.
4. **Map layers** are added incrementally as MapLibre GL sources/layers — each map feature in the matrix (MAP-02 through MAP-15) is one additional layer + a data-source client, not a new map component.
5. **Alerts (PERS-03)** run as a scheduled job comparing latest forecast snapshots against stored user thresholds, then send via an email provider (start here — simplest) before considering push.

## Build order (maps to matrix priorities)

1. **P0 slice**: `resorts.json` seed data → `/api/forecast/[locationId]` via Open-Meteo → one location page rendering a multi-day + hourly forecast and 24h snow estimate → favorites (local-only first, no auth yet).
2. **P1 core**: snow reports, historical lookback, avalanche forecasts, NWS severe alerts, base MapLibre map with resort pins + piste overlay, conditions summary.
3. **P2 breadth**: remaining map overlays (radar, smoke, temperature/wind/cloud forecast layers), offline map caching, personalization/alerts backend, fall colors, weather-station map.

## Open questions to resolve before/while building (see `Blocked` rows in the matrix)

- Lightning risk (SEV-02): evaluate Blitzortung.org reliability/coverage before committing to it.
- Forecast radar (MAP-02): RainViewer covers current + short nowcast, not OpenSnow's full forecast radar — may need to scope this down to "current radar" only.
- Daily forecaster commentary (EXP-01): decide whether to skip, hand-write periodic posts, or generate templated summaries from our own derived data — this is the one feature category with no data-source substitute, since it's fundamentally OpenSnow's human meteorologists.
