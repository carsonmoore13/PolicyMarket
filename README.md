# PolicyMarket

PolicyMarket is an address-driven civic intelligence app for exploring 2026 election candidates in your exact federal, state, and local districts.

The current project is a full-stack monorepo:

- `frontend/`: React 18 + Vite + Leaflet client
- `backend/`: Express + MongoDB API, district resolution, and candidate discovery/seeding
- `elections_pipeline/` and `elections_pipeline_js/`: supporting data pipeline workspaces from earlier ingestion efforts

The core user experience is:

1. Enter a street address.
2. Resolve the address to coordinates and districts.
3. Fetch candidates for that voter across federal, state, and local levels.
4. Visualize those races on an interactive map with district overlays.
5. Backfill missing races on demand by scraping Ballotpedia.

## What The App Does

PolicyMarket is not just a static directory of candidates. It combines geocoding, district matching, Mongo-backed candidate records, and on-demand race discovery to answer:

- Which candidates are running where I live?
- Which district am I in for U.S. House, state senate, and state house?
- Which races are federal, statewide, district-specific, or local?
- If my area is missing from the database, can the app discover that race automatically?

The app currently focuses on a voter-centric flow rather than a generic map or market browser.

## Repository Layout

```text
PolicyMarket/
  backend/
    routes/              Express routes
    services/            address resolution, filtering, scraping, seeding
    scripts/             one-off maintenance and enrichment scripts
    geo/                 boundary and geography assets
  frontend/
    src/components/      layout, map, address modal, candidate detail panel
    src/hooks/           address lookup, candidates, totals
    src/api/             Axios API client
    src/utils/           party colors, district centroids
  elections_pipeline/    legacy / supporting ingestion pipeline workspace
  elections_pipeline_js/ legacy / supporting JS pipeline workspace
```

## Tech Stack

### Frontend

- React 18
- Vite 5
- Axios
- Leaflet
- Tailwind utilities plus custom CSS

### Backend

- Node.js 20+
- Express
- MongoDB
- Axios
- Cheerio
- AWS S3 SDK
- Sharp

### External Services

- MongoDB Atlas or local MongoDB
- US Census Geocoder
- Google Civic Information API
- US Census TIGER Web
- Ballotpedia
- AWS S3 for candidate images

## Current Architecture

### Frontend Architecture

The frontend bootstraps from `frontend/src/main.jsx` into `frontend/src/App.jsx`.

Key responsibilities:

- `frontend/src/hooks/useAddressLookup.js`
  Stores the last submitted address in `localStorage`, calls `/api/address-lookup`, and rehydrates the app on refresh.
- `frontend/src/hooks/useCandidates.js`
  Fetches candidates for the active address and selected level (`federal`, `state`, `local`).
- `frontend/src/hooks/useCandidateTotals.js`
  Loads total counts from `/api/candidates/all` so the UI can show overall level counts.
- `frontend/src/components/AppLayout.jsx`
  Owns the main two-pane UI: sidebar filters, search, level chips, candidate cards, and map area.
- `frontend/src/components/MapView.jsx`
  Renders the Leaflet map, candidate markers, district boundary overlays, and zoom-level behavior.
- `frontend/src/components/CandidateDetailPanel.jsx`
  Shows the selected candidate's details, image, policies, and attribution.
- `frontend/src/components/AddressModal.jsx`
  Captures the voter's street address.

Important frontend behavior:

- The address is the primary app state.
- The sidebar level changes trigger fresh backend requests.
- Sublevel chips are derived from office patterns and district context.
- The map and sidebar stay synchronized.
- District boundaries are fetched lazily and cached client-side in memory.

### Backend Architecture

The Express app starts in `backend/server.js`.

Main route modules:

- `backend/routes/address.js`
  Resolves a street address to city, county, lat/lng, and districts.
- `backend/routes/candidates.js`
  Returns either:
  - a rich address payload with candidates, or
  - a level-filtered candidate list for the active tab
- `backend/routes/boundaries.js`
  Proxies TIGER Web district/state boundaries and caches them in MongoDB.
- `backend/routes/debug.js`
  Exposes a district lookup endpoint for manual verification.
- `backend/routes/admin.js`
  Starts background full-state seeding and reports status.

Core backend services:

- `backend/services/addressResolver.js`
  Uses the US Census Geocoder for address matching and coordinates, then prefers Google Civic for election-accurate district IDs when a key is configured.
- `backend/services/candidateFilter.js`
  Filters the full candidate pool into federal, state, and local races relevant to the voter.
- `backend/services/raceDiscovery.js`
  Detects gaps in the database and kicks off targeted race discovery or full-state seeding.
- `backend/services/ballotpediaRaceScraper.js`
  Scrapes individual Ballotpedia election pages and candidate pages.
- `backend/services/stateFullSeeder.js`
  Bulk-seeds Senate, House, and state legislative races for a state.
- `backend/db.js`
  Connects to MongoDB and ensures the app's indexes exist.

## End-To-End Data Flow

### 1. Address Lookup

The frontend submits `street`, `city`, `state`, and optional `zip` to `/api/address-lookup`.

`backend/services/addressResolver.js` does two things:

- Geocodes the address through the US Census Geocoder.
- Resolves districts using Google Civic when available, otherwise falls back to Census-derived district layers.

Resolved results are cached in the `zip_district_cache` collection under an `address_key`.

### 2. Candidate Fetch

The frontend requests `/api/candidates` with the current address and selected level.

`backend/routes/candidates.js`:

- resolves the address again if needed
- fetches candidates from MongoDB
- filters them through `backend/services/candidateFilter.js`
- serializes candidate objects for frontend use
- caches rich address responses in `api_cache`

### 3. Missing Data Discovery

If a district has no stored races yet:

- the API returns `discovering: true`
- the frontend shows a loading/discovery state
- the backend asynchronously triggers:
  - a full-state seed if the state has no candidate records yet, or
  - a targeted district scrape if only a specific race is missing

This behavior is implemented in `backend/services/raceDiscovery.js`.

### 4. Map Rendering

The frontend uses Leaflet in `frontend/src/components/MapView.jsx` to:

- render candidate markers
- cluster same-location markers with pixel offsets
- fetch district boundaries from `/api/district-boundary`
- draw the Texas outline for statewide views
- zoom differently for federal, state, and local exploration

### 5. Boundary Caching

District and state outline GeoJSON responses are fetched from the US Census TIGER Web API and cached in MongoDB by `backend/routes/boundaries.js`.

## Candidate Data Model

The frontend expects candidate documents to serialize into this approximate shape:

```js
{
  _id: "...",
  name: "Jane Doe",
  office: "U.S. House TX-37",
  office_level: "federal" | "state" | "local" | "city",
  jurisdiction: "Texas",
  state: "TX",
  district: "TX-37" | "SD-14" | "HD-49" | null,
  party: "D" | "R" | "NP",
  home_city: "Austin, TX",
  status_2026: "nominee" | "runoff" | null,
  source_url: "https://...",
  source_name: "Ballotpedia (...)",
  image: "https://..." | null,
  photo: {
    url: "https://..." | null,
    source: "ballotpedia" | "wikipedia" | null,
    verified: true | false,
    fallback_initials: "JD"
  },
  geo: {
    lat: 30.26,
    lng: -97.74,
    geojson_point: { type: "Point", coordinates: [-97.74, 30.26] }
  },
  policies: ["..."]
}
```

Filtering assumptions in the current code:

- federal and state races are limited to major parties (`D`, `R`)
- local races may also include `NP`
- candidates are matched by district, state, county, or locality depending on office level

## Running The Project

### Prerequisites

- Node.js 20+
- npm
- MongoDB Atlas or a local MongoDB instance

### Environment Variables

There are two env surfaces in practice:

- `backend/.env`
- `frontend/.env`

The repo root also includes `.env.example` as a starting point.

### Backend `.env`

Required or commonly used:

```bash
MONGO_URI=mongodb://localhost:27017/elections_2026
MONGO_DB_NAME=elections_2026
PORT=3001
GOOGLE_CIVIC_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=
IMAGE_BASE_URL=
ANTHROPIC_API_KEY=
```

Notes:

- `GOOGLE_CIVIC_API_KEY` improves congressional district accuracy for post-redistricting election cycles.
- Without that key, the app falls back to Census-derived districts.
- S3-related variables are used by the image pipeline and photo storage helpers.

### Frontend `.env`

```bash
VITE_API_BASE_URL=http://localhost:3001
VITE_MAPBOX_TOKEN=
```

Notes:

- The current frontend uses Leaflet, not Mapbox, so `VITE_MAPBOX_TOKEN` is currently legacy/stale configuration.
- `VITE_API_BASE_URL` should point at the backend.

### Install

From the repository root:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Or use the convenience script:

```bash
npm run install:all
```

### Start In Development

From the repository root:

```bash
npm run dev
```

That is intended to start:

- backend on `http://localhost:3001`
- frontend on `http://localhost:5173`

You can also run each side independently:

```bash
npm run dev --prefix backend
npm run dev --prefix frontend
```

Then open [http://localhost:5173](http://localhost:5173).

## API Reference

### `GET /api/health`

Simple health check.

### `GET /api/address-lookup`

Query params:

- `street` required
- `city` required
- `state` required
- `zip` optional

Returns resolved address, county, coordinates, and districts.

### `GET /api/candidates`

Query params:

- `street` required
- `city` required
- `state` required
- `zip` optional
- `level` optional, one of `federal`, `state`, `local`

Behavior:

- without `level`, returns a richer payload including address, location, districts, and candidates
- with `level`, returns `{ candidates, discovering }`

### `GET /api/candidates/all`

Returns the unfiltered candidate pool after basic candidate allow-list filtering.

### `GET /api/district-boundary`

Query params:

- `type` required: `congressional`, `state_senate`, `state_house`, `state_outline`
- `district` required for district-specific types

### `GET /api/debug/districts`

Manual verification endpoint for checking how an address resolves.

### `POST /api/admin/seed-state`

Starts full-state background seeding.

Request body:

```json
{ "state": "TX" }
```

### `GET /api/admin/seed-state/:state/status`

Returns seeding progress metadata for a state.

## Seeding And Data Enrichment

The app has both runtime discovery and explicit seeding/maintenance scripts.

### Runtime discovery

- `backend/services/raceDiscovery.js`
- `backend/services/ballotpediaRaceScraper.js`
- `backend/services/stateFullSeeder.js`

These are used automatically by the API when users search uncovered districts, and manually through admin routes.

### One-off scripts

Examples in `backend/scripts`:

- photo fetching and repair
- geo updates
- policy cleanup
- cache clearing
- candidate image migration
- home city scraping

There are also state-specific or historical seeders at the backend root, including:

- `backend/seedTX.mjs`
- `backend/seedLocalTX.mjs`
- `backend/seedMayors2026.mjs`
- `backend/reseedHouse.mjs`

## Important Project Notes

- The README previously mixed two project generations:
  - an older static "policy markets" prototype rooted around `index.html`
  - the current full-stack candidate explorer
- The current application is the full-stack address-based candidate explorer.
- The root `index.html` is a leftover artifact and is not the primary app entrypoint when running the monorepo.
- The frontend currently uses Leaflet despite some older Mapbox naming in docs and env files.
- Local race coverage is more selective than federal/state coverage and depends on seeded data.

## Suggested Next Cleanup Tasks

- Remove or archive outdated static prototype files if they are no longer needed.
- Rename legacy env variables and comments that still reference Mapbox.
- Add dedicated docs for the ingestion workspaces in `elections_pipeline/` and `elections_pipeline_js/`.
- Add a small architecture diagram and sample API payloads.
- Add tests around candidate filtering and address resolution fallback behavior.
