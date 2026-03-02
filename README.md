# PolicyMarket – Candidates in Your District

PolicyMarket is a civic intelligence dashboard that shows which political candidates are running in your districts on top of an interactive map.

This monorepo contains:

- **backend/** – Node.js + Express API powered by MongoDB Atlas
- **frontend/** – React 18 + Vite + Mapbox GL client

From the project root you can run **`npm run dev`** to start both concurrently.

---

## Prerequisites

- Node.js 20+
- MongoDB Atlas cluster (host `policymarket.r1fric0.mongodb.net`)
- Mapbox account (for a public access token)

---

## Setup

1. **Install dependencies for all packages**

   ```bash
   cd /path/to/PolicyMarket
   npm run install:all
   ```

2. **Configure environment variables**

   Copy the example env from the repo root into the backend and frontend:

   ```bash
   cp .env.example backend/.env
   cp .env.example frontend/.env
   ```

   Then edit:

   - `backend/.env` – fill `MONGO_URI`, `MONGO_DB_NAME`, `PORT`
   - `frontend/.env` – fill `VITE_MAPBOX_TOKEN` (Mapbox public token), leave `VITE_API_BASE_URL` as `http://localhost:3001`

3. **Start dev servers**

   ```bash
   npm run dev
   ```

   This runs:

   - Backend on `http://localhost:3001`
   - Frontend (Vite) on `http://localhost:5173`

   Visit `http://localhost:5173` in your browser.

---

## Architecture Overview

- **Backend**
  - `backend/server.js` – Express app, CORS, JSON, routes
  - `backend/config.js` – loads `MONGO_URI`, `MONGO_DB_NAME`, `PORT`
  - `backend/db.js` – MongoDB Atlas connection helpers
  - `backend/routes/zip.js` – `GET /api/zip-lookup?zip=78701` – resolves ZIP to lat/lng + districts
  - `backend/routes/candidates.js` – `GET /api/candidates?zip=78701&level=federal` and `GET /api/candidates/all`
  - `backend/services/zipResolver.js` – hard‑coded ZIP → district map for Austin/Travis County and TX fallbacks
  - `backend/services/candidateFilter.js` – filters candidate records by level + districts

- **Frontend**
  - `frontend/src/App.jsx` – root state container (ZIP, level, selection)
  - `frontend/src/components/AppLayout.jsx` – header, level tabs, candidate list, map layout
  - `frontend/src/components/ZipCodeModal.jsx` – first‑run / change ZIP modal
  - `frontend/src/components/MapView.jsx` – Mapbox GL JS map with custom markers
  - `frontend/src/components/CandidateDetailPanel.jsx` – slide‑in candidate details
  - `frontend/src/hooks/useZipLookup.js` – ZIP lookup and persistence
  - `frontend/src/hooks/useCandidates.js` – candidate fetching per ZIP + level
  - `frontend/src/hooks/useMapbox.js` – encapsulates Mapbox initialization and cleanup
  - `frontend/src/api/client.js` – Axios client for the backend
  - `frontend/src/utils/partyColors.js` – party → color mapping

---

## ZIP → District Matching

ZIP matching is implemented entirely in **`backend/services/zipResolver.js`**.

For Travis County / Austin ZIP codes, there is a refined hard‑coded map such as:

```js
78701: {
  congressional: "TX-21",
  state_senate: "SD-14",
  state_house: "HD-047",
  city_council: "Austin District 9",
},
```

For other Texas ZIPs you can extend this map or add prefix‑based logic.
For ZIPs outside Texas, the API returns `"Unknown — outside TX"` for congressional and `null` for state/local districts.

**To extend with new districts**, add entries to `TEXAS_ZIP_DISTRICT_MAP` in `zipResolver.js`. The frontend never hard‑codes district logic; it always uses the backend response.

---

## Candidate Document Shape

The frontend expects each candidate to include at least:

- `_id` – MongoDB ObjectId
- `name` – string
- `office` – string (e.g., `"U.S. House"` or `"Austin City Council"`)
- `office_level` – `"federal" | "state" | "city"`
- `jurisdiction` – `"Texas"` or `"Austin, TX"`
- `district` – string (e.g., `"TX-21"`, `"SD-14"`, `"HD-047"`, `"Austin District 9"`)
- `party` – string
- `filing_status` – string or `null`
- `last_verified` – ISO date string
- `source_url` / `source_name` – for attribution
- `geo` – with at least `{ lat, lng }` or a GeoJSON point at `geo.geojson_point.coordinates [lng, lat]`

The existing `elections_2026.candidates` collection populated by your scrapers is compatible as long as it contains these fields.

# PolicyMarket

A modern web interface for exploring and tracking policy prediction markets. Browse federal, state, and local policy markets, filter by topic, and view live odds in a clean, civic-style layout.

## Features

- **Region & jurisdiction** — Toggle between Federal, State, and Local views
- **Search** — Find policies and topics quickly
- **Category filters** — Climate, Health, Economy, Tech
- **Policy cards** — Pass probability (odds), tags, and watch list
- **Market trend chart** — Simple bar visualization; click a policy to focus
- **Live status** — UI indicates live data

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
# Python
python -m http.server 8000

# Node (npx)
npx serve .
```

Then visit `http://localhost:8000`.

## Repository

**GitHub:** [carsonmoore13/PolicyMarket](https://github.com/carsonmoore13/PolicyMarket)

### Work from WSL on `main`

This repo is **standalone** (not inside another project). Clone it where you want to work:

```bash
cd ~
# or: mkdir -p ~/Hackathon && cd ~/Hackathon
git clone https://github.com/carsonmoore13/PolicyMarket.git
cd PolicyMarket
git branch   # should show main
```

**Daily workflow:**

```bash
cd ~/PolicyMarket   # or wherever you cloned it
git pull origin main
# ... edit files ...
git add .
git commit -m "Your message"
git push origin main
```
