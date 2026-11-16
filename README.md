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

## Environment variables (all optional)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres for accounts, sessions, passkeys and favorites. Neon URLs use Neon's HTTP driver; any other Postgres (self-hosted, Supabase, RDS, local) uses a normal TCP connection. Without it, sign-in is unavailable and favorites stay in the browser. |
| `SESSION_SECRET` | Signs session cookies and email codes. **Required in production**: a long random string, the same on every instance (`openssl rand -base64 32`). Without it each server instance makes up its own, and sign-ins don't stick. |
| `RESEND_API_KEY`, `ALERTS_FROM_EMAIL` | Sign-in code emails, via `lib/email.ts`. Without these, the code is logged to the server console instead of emailed (handy for local dev). Set both to actually deliver email via [Resend](https://resend.com). |
| `AUTH_ORIGIN` | Optional. The public origin(s) passkeys are bound to, comma-separated (e.g. `https://snow.example.com`). Defaults to the request's host, which is right on Vercel; set it when running behind a proxy that rewrites the host. Passkeys only work on the origin they were created on. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Powder wake-up push notifications (PERS-06). Generate once with `npx web-push generate-vapid-keys`; without them the wake-up card says it isn't set up. |
| `CRON_SECRET` | If set, `/api/push/check` requires `Authorization: Bearer <secret>`. Unset by default for local dev; set it before deploying somewhere public, since nothing else protects that endpoint from being triggered repeatedly. |

`/api/push/check` runs daily via Vercel Cron (`vercel.json`, 11:00 UTC) once deployed there. Set `CRON_SECRET` to lock the endpoint down — Vercel automatically sends it as the `Authorization: Bearer` header on its own cron-triggered requests, so nothing else needs to change.

## Accounts and sign-in

New people use **Create account** in the sign-in panel: step 1 confirms their email with a 6-digit code (this also creates the account, and the email is the recovery method); step 2 creates a passkey right away (skippable). After that, people sign in with a **passkey** (Face ID / Touch ID / device PIN; synced across their devices by iCloud Keychain or Google Password Manager) or a **6-digit email code**, which is always available as the backup. Both happen inside the page, so they work in an iOS home-screen app too. The account page (`/account`) lets each person add, rename and remove passkeys, and see and sign out their signed-in devices.

Sessions are rows in Postgres (`lib/auth/sessions.ts`) behind an HMAC-signed cookie. They last 180 days from last use, so you stay signed in on any device you keep using. Email codes are single-use and rate-limited (sends and guesses) per address.

## Personal settings

A first visit shows every resort. **My resorts** are the ones you star (☆): once you star any, the home list and map show just those, with "Browse all" for the rest. The first time someone signs in, a short welcome asks them to pick resorts and shows how to save a backcountry spot. `/settings` lets each person manage their resorts, arrange the **location page** (section order and which sections start open), and choose the **map style**. Signed in, settings are saved to the account (`user_preferences` table, `/api/preferences`) and follow you to every device; signed out, they're kept in the browser and carried into the account on first sign-in.

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
