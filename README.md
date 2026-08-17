# Actually Open Snow

An open-data ski/snow forecast app for resorts **and backcountry** in Northern Utah & Southeast Idaho — an independent, ungated reimplementation of OpenSnow's feature set built entirely on free/public APIs. No subscription tiers, no proprietary weather model.

See `TRACE_MATRIX.md` for the full feature inventory and build status, and `ARCHITECTURE.md` for the technical design.

## What's here

- Real forecasts (Open-Meteo), snow level by elevation (NWS `snowLevel` gridpoint field), severe weather alerts (NWS), avalanche forecasts (avalanche.org), nearby SNOTEL snowpack readings, and a multi-source corroborated conditions summary that reconciles NOAA's own forecaster-written discussion against the model spread.
- A map with resort pins, webcam links, an OpenStreetMap piste overlay, and — the backcountry feature — **click anywhere to drop a pin** and get the exact same forecast/avalanche/snow-level pipeline as a curated resort.
- Favorites (resorts or dropped pins), stored locally — no account required yet.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API keys are required for anything currently wired up — every data source in use is free and keyless (Open-Meteo, api.weather.gov, avalanche.org, NRCS AWDB, OpenStreetMap Overpass).

```bash
npm run build && npm run start   # production build
npx tsc --noEmit                  # type-check
npx eslint .                      # lint
```

## Project layout

- `app/` — pages (`/`, `/location/[slug]`, `/location/pin`) and API routes (`app/api/*`)
- `lib/data-sources/` — one client per external API
- `lib/derive/` — pure functions that combine/interpret data (snow level, powder quality, wet bulb, conditions summary, avalanche zone lookup)
- `lib/location-dashboard.ts` — orchestrates every source into one payload for a location page
- `components/` — map (MapLibre) and location dashboard UI
- `data/` — curated seed data (resorts, webcams)

## Status

The resort + backcountry-pin MVP is built and verified against live data. See `TRACE_MATRIX.md` for exactly what's done vs. planned, including a few real integration bugs found and fixed during the first build pass (wrong SNOTEL query params, an undocumented Overpass header requirement, a GeoJSON field-location mistake for avalanche zones) — worth reading before extending those integrations further.
