/**
 * raceDiscovery.js
 *
 * Checks which 2026 races (US Senate, US House, state legislative) are missing
 * from the candidates collection for a given set of voter districts, then
 * triggers Ballotpedia scraping.
 *
 * Strategy:
 *   - If we have ZERO candidates for the voter's state → trigger the full
 *     state seeder (scrapes overview pages for every race in the state).
 *   - If we have some state data but the specific district is missing → fall
 *     back to per-district scraping via discoverRaceCandidates.
 *
 * Runs async (fire-and-forget) so the HTTP response returns immediately.
 * The api_cache is intentionally NOT set until candidates exist, so the
 * next request from the same address picks up the freshly-seeded data.
 */

import { getCandidatesCollection } from "../db.js";
import { discoverRaceCandidates } from "./ballotpediaRaceScraper.js";
import { seedStateRaces, isSeedingInProgress } from "./stateFullSeeder.js";

// In-memory set of races currently being discovered so parallel requests
// don't trigger duplicate scraping work.
const inFlight = new Set();

/**
 * Parse a district string into { raceType, districtNum }.
 *   "TX-37"  → { raceType: "us_house",    districtNum: 37 }
 *   "SD-14"  → { raceType: "state_senate", districtNum: 14 }
 *   "HD-49"  → { raceType: "state_house",  districtNum: 49 }
 */
function parseDistrict(d) {
  if (!d) return null;
  const cd = d.match(/^[A-Z]{2}-(\d+)$/);
  if (cd) return { raceType: "us_house", districtNum: parseInt(cd[1], 10) };
  const sd = d.match(/^SD-(\d+)$/i);
  if (sd) return { raceType: "state_senate", districtNum: parseInt(sd[1], 10) };
  const hd = d.match(/^HD-(\d+)$/i);
  if (hd) return { raceType: "state_house", districtNum: parseInt(hd[1], 10) };
  return null;
}

/**
 * Return true if the candidate collection already contains any record for
 * the given race type in the given state.
 */
function hasRace(allCandidates, raceType, state, district) {
  return allCandidates.some((c) => {
    const cState = c.state || c.district_zip_map?.state;
    if (cState !== state) return false;

    if (raceType === "us_senate") {
      return /u\.?s\.?\s+senate/i.test(c.office) && c.office_level === "federal";
    }
    if (raceType === "us_house") {
      return c.office_level === "federal" && c.district === district;
    }
    if (raceType === "state_senate" || raceType === "state_house") {
      return c.office_level === "state" && c.district === district;
    }
    return false;
  });
}

/**
 * Insert discovered candidates using the same unique key as the pipeline
 * { name, office, district } so we don't conflict with the unique index
 * and pipeline-loaded records take precedence over auto-discovered ones.
 */
async function saveCandidates(candidates) {
  if (!candidates.length) return;
  const coll = getCandidatesCollection();
  const now = new Date();
  for (const c of candidates) {
    try {
      await coll.updateOne(
        { name: c.name, office: c.office, district: c.district },
        { $setOnInsert: { ...c, created_at: now, updated_at: now } },
        { upsert: true }
      );
    } catch (err) {
      console.warn(`[RaceDiscovery] Failed to save ${c.name}: ${err.message}`);
    }
  }
}

/**
 * Count how many candidates we have stored for a given state.
 */
function countStateData(allCandidates, voterState) {
  return allCandidates.filter((c) => {
    const cState = c.state || c.district_zip_map?.state;
    return cState === voterState;
  }).length;
}

/**
 * Discover any races missing from the DB for the voter's districts.
 * Runs asynchronously — does not block the caller.
 *
 * If the state has NO candidates at all → fire the full state seeder which
 * scrapes overview pages for every race in the state at once.
 *
 * If the state has some data but a specific district is missing → fall back
 * to per-district scraping.
 *
 * @param {object} districts  - { congressional, state_senate, state_house }
 * @param {string} voterState - 2-letter state abbreviation
 * @param {object[]} allCandidates - current snapshot of the candidates collection
 */
export function triggerDiscovery(districts, voterState, allCandidates) {
  if (!voterState) return;

  const stateCount = countStateData(allCandidates, voterState);

  // ── Full-state seeding: no candidates at all for this state ──────────────
  if (stateCount === 0 && !isSeedingInProgress(voterState)) {
    console.log(`[RaceDiscovery] No data for ${voterState} — triggering full state seed`);
    seedStateRaces(voterState).catch((err) =>
      console.error(`[RaceDiscovery] Full seed failed for ${voterState}: ${err.message}`)
    );
    return;
  }

  // ── Per-district fallback: state has data but specific districts missing ──
  const tasks = [];

  if (!hasRace(allCandidates, "us_senate", voterState, null)) {
    tasks.push({ state: voterState, raceType: "us_senate", districtNum: null, skipPhotos: true });
  }

  if (districts.congressional) {
    const parsed = parseDistrict(districts.congressional);
    if (parsed && !hasRace(allCandidates, "us_house", voterState, districts.congressional)) {
      tasks.push({ state: voterState, raceType: "us_house", districtNum: parsed.districtNum, skipPhotos: true });
    }
  }

  if (districts.state_senate) {
    const parsed = parseDistrict(districts.state_senate);
    if (parsed && !hasRace(allCandidates, "state_senate", voterState, districts.state_senate)) {
      tasks.push({ state: voterState, raceType: "state_senate", districtNum: parsed.districtNum, skipPhotos: true });
    }
  }

  if (districts.state_house) {
    const parsed = parseDistrict(districts.state_house);
    if (parsed && !hasRace(allCandidates, "state_house", voterState, districts.state_house)) {
      tasks.push({ state: voterState, raceType: "state_house", districtNum: parsed.districtNum, skipPhotos: true });
    }
  }

  if (!tasks.length) return;

  (async () => {
    for (const task of tasks) {
      const key = `${task.state}|${task.raceType}|${task.districtNum}`;
      if (inFlight.has(key)) continue;
      inFlight.add(key);
      try {
        console.log(`[RaceDiscovery] Starting: ${key}`);
        const candidates = await discoverRaceCandidates(task);
        await saveCandidates(candidates);
        console.log(`[RaceDiscovery] Done: ${key} — ${candidates.length} saved`);
      } catch (err) {
        console.error(`[RaceDiscovery] Error ${key}: ${err.message}`);
      } finally {
        inFlight.delete(key);
      }
    }
  })();
}

/**
 * Check if any discovery is currently in-flight for the given state.
 * Used by the route to include a `discovering` flag in the response payload.
 */
export function isDiscovering(voterState, districts) {
  if (!voterState) return false;
  const keys = [
    `${voterState}|us_senate|null`,
    districts.congressional ? `${voterState}|us_house|${parseDistrict(districts.congressional)?.districtNum}` : null,
    districts.state_senate ? `${voterState}|state_senate|${parseDistrict(districts.state_senate)?.districtNum}` : null,
    districts.state_house ? `${voterState}|state_house|${parseDistrict(districts.state_house)?.districtNum}` : null,
  ].filter(Boolean);
  return keys.some((k) => inFlight.has(k));
}
