# Elections Pipeline (Node.js) — 2026 U.S. Midterm Candidates

Node.js pipeline that discovers and stores 2026 U.S. midterm election candidates (City of Austin, Texas statewide/legislative, and Federal/Texas) into **MongoDB Atlas**. Credentials load from `.env` only.

---

## Setup

1. **Install dependencies**
   ```bash
   cd elections_pipeline_js
   npm install
   ```

2. **Configure credentials**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set:
   - `MONGODB_URI` — your Atlas connection string (username and password).
   - `MONGODB_DB_NAME` — e.g. `elections_2026`.

3. **MongoDB Atlas**
   - Create a database user and whitelist your IP (or `0.0.0.0/0` for dev).
   - Use that URI in `MONGODB_URI`.

---

## Run

- **Once** (single pipeline run, then exit):
  ```bash
  node main.js --once
  ```
  or:
  ```bash
  npm run once
  ```

- **Scheduled** (run immediately, then every 24 hours at midnight):
  ```bash
  node main.js
  ```
  or:
  ```bash
  npm start
  ```

- **Re-geocode** candidates with null/missing `geo`:
  ```bash
  node scripts/verifyGeo.js
  ```
  or:
  ```bash
  npm run verify-geo
  ```

---

## Collections and indexes

- **`candidates`** — One document per candidate: `name`, `office`, `office_level`, `jurisdiction`, `district`, `party`, `geo` (with `geojson_point`), `source_url`, `source_name`, `last_verified`, `data_hash`, `created_at`, `updated_at`, etc.  
  Indexes: `name`, `office_level`, `jurisdiction`, `district`; unique compound `(name, office, district)`; 2dsphere on `geo.geojson_point`.

- **`geo_cache`** — Cached geocoding by `jurisdiction_key`. Unique index on `jurisdiction_key`.

---

## Example: geospatial query

Candidates whose district centroid is within 80 km of a point (e.g. Austin):

```javascript
db.collection("candidates").find({
  "geo.geojson_point": {
    $nearSphere: {
      $geometry: { type: "Point", coordinates: [-97.7431, 30.2672] },
      $maxDistance: 80000,
    },
  },
});
```

---

## Layout

- `config.js` — Loads `.env`; exports `MONGODB_URI`, `MONGODB_DB_NAME`, `getAxiosDefaults()`, etc.
- `db.js` — `connect()`, `getDb()`, `createIndexes()`, `insertOrUpdateCandidate()`, `getOrCreateGeoCache()`.
- `models.js` — `createCandidate()` with `computeHash()` and `toDict()`.
- `geo/` — `getJurisdictionCentroid()`, district centroids (TX congressional/senate/house, Austin council), `createGeoPoint()`.
- `scrapers/` — `fetchAustinCandidates`, `fetchTexasStateCandidates`, `fetchFederalTexasCandidates`.
- `pipeline.js` — `runPipeline()`: runs all scrapers, upserts candidates, returns stats.
- `scheduler.js` — Runs pipeline every 24h and once on start (node-cron).
- `main.js` — `--once` or scheduled; connects, creates indexes, prints host only.
- `scripts/verifyGeo.js` — Re-geocode candidates with null/missing `geo`.

All timestamps are stored as JavaScript `Date` (UTC). The 2dsphere index is created before any geo inserts.
