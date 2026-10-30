# Actually Open Snow

An open-data ski/snow forecast app for resorts **and backcountry** in Northern Utah & Southeast Idaho — an independent, ungated reimplementation of OpenSnow's feature set built entirely on free/public APIs. No subscription tiers, no proprietary weather model.

See `TRACE_MATRIX.md` for the full feature inventory and build status, and `ARCHITECTURE.md` for the technical design.

## What's here

- Real forecasts (Open-Meteo), snow level by elevation (NWS `snowLevel` gridpoint field), severe weather alerts (NWS), avalanche forecasts (avalanche.org), nearby SNOTEL snowpack readings, air quality, historical lookback, and a multi-source corroborated conditions summary that reconciles NOAA's own forecaster-written discussion against the model spread.
- A map with resort pins (colored by today's forecast snow — Powder Finder), live webcam snapshots, current radar, an OpenStreetMap piste overlay, and — the backcountry feature — **click anywhere to drop a pin** and get the exact same forecast/avalanche/snow-level pipeline as a curated resort. A dedicated `/webcams` page shows live images with auto-refresh.
- Favorites (resorts or dropped pins), stored locally by default — sign in with just an email (magic link, no password) to sync them across devices instead.
- Email snow alerts: subscribe by email + location + threshold, no login — see "Environment variables" below to actually enable delivery.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No API keys are required for anything reading data — every data source in use is free and keyless (Open-Meteo, api.weather.gov, avalanche.org, NRCS AWDB, OpenStreetMap Overpass, RainViewer). Alert emails need one optional key — see below.

```bash
npm run build && npm run start   # production build
npx tsc --noEmit                  # type-check
npx eslint .                      # lint
```

## Environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY`, `ALERTS_FROM_EMAIL` | Account sign-in emails, via `lib/email.ts`. Without these, sign-in links are logged to the server console instead of emailed. Set both to actually deliver email via [Resend](https://resend.com). |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Powder wake-up push notifications (PERS-06). Generate once with `npx web-push generate-vapid-keys`; without them the wake-up card says it isn't set up. |
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres (Neon) for accounts, favorites, sign-in codes and push subscriptions. Tables are created/updated automatically on first use (`lib/db/postgres.ts`). Required for sign-in. |
| `SESSION_SECRET` | **Required in production.** HMAC key for session cookies, sign-in links and stored sign-in code hashes (e.g. `openssl rand -hex 32`). In production, sign-in refuses to work without it; local dev falls back to a random per-process key. |
| `CRON_SECRET` | **Required in production** for `/api/push/check` and the operator-only `/api/diag/*` routes, which all require `Authorization: Bearer <secret>`. With it unset, production rejects every call to them; local dev lets them through. |

`/api/push/check` runs daily via Vercel Cron (`vercel.json`, 11:00 UTC) once deployed there. Vercel automatically sends `CRON_SECRET` as the `Authorization: Bearer` header on its own cron-triggered requests, so nothing else needs to change once the variable is set.

## Project layout

- `app/` — pages (`/`, `/location/[slug]`, `/location/pin`, `/webcams`) and API routes (`app/api/*`)
- `lib/data-sources/` — one client per external API
- `lib/derive/` — pure functions that combine/interpret data (snow level, powder quality, wet bulb, trail conditions, conditions summary, avalanche zone lookup)
- `lib/db/`, `lib/email.ts`, `lib/alerts/` — the alert-subscription backend (SQLite storage, pluggable email, threshold checking)
- `lib/location-dashboard.ts` — orchestrates every source into one payload for a location page
- `components/` — map (MapLibre), location dashboard, and webcam grid UI
- `data/` — curated seed data (resorts, webcams)

## Status

The resort + backcountry-pin MVP, a first pass of breadth features, live webcam images, and an alert-subscription backend are all built and verified against live data. See `TRACE_MATRIX.md` for exactly what's done vs. planned, including several real integration bugs found and fixed along the way — wrong SNOTEL query params, an undocumented Overpass header requirement, a GeoJSON field-location mistake for avalanche zones, an Open-Meteo rate limit hit under this project's own testing, and **a Next.js error-boundary convention (`error.tsx`) that looked correct but didn't actually catch the failure it was built for** — worth reading before extending those integrations further, or before trusting a similar framework convention elsewhere without testing it against a real failure.
