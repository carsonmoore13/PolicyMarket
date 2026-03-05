/**
 * raceDiscovery.js
 *
 * Checks which 2026 races (US Senate, US House, state legislative) are missing
 * from the candidates collection for a given set of voter districts, then
 * triggers Ballotpedia scraping for each missing race.
 *
 * Called async (fire-and-forget) from the candidates route so the first
 * request to a new district returns quickly and the data populates in the
 * background. The api_cache for that address is intentionally NOT set until
 * candidates are present, so a subsequent request will receive the full set.
 */

import { getCandidatesCollection } from "../db.js";
import { discoverRaceCandidates } from "./ballotpediaRaceScraper.js";

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
 * Discover any races missing from the DB for the voter's districts.
 * Runs asynchronously — does not block the caller.
 *
 * @param {object} districts  - { congressional, state_senate, state_house }
 * @param {string} voterState - 2-letter state abbreviation
 * @param {object[]} allCandidates - current snapshot of the candidates collection
 */
export function triggerDiscovery(districts, voterState, allCandidates) {
  if (!voterState) return;

  const tasks = [];

  // US Senate — statewide, always check
  if (!hasRace(allCandidates, "us_senate", voterState, null)) {
    tasks.push({ state: voterState, raceType: "us_senate", districtNum: null });
  }

  // US House
  if (districts.congressional) {
    const parsed = parseDistrict(districts.congressional);
    if (parsed && !hasRace(allCandidates, "us_house", voterState, districts.congressional)) {
      tasks.push({ state: voterState, raceType: "us_house", districtNum: parsed.districtNum });
    }
  }

  // State Senate
  if (districts.state_senate) {
    const parsed = parseDistrict(districts.state_senate);
    if (parsed && !hasRace(allCandidates, "state_senate", voterState, districts.state_senate)) {
      tasks.push({ state: voterState, raceType: "state_senate", districtNum: parsed.districtNum });
    }
  }

  // State House
  if (districts.state_house) {
    const parsed = parseDistrict(districts.state_house);
    if (parsed && !hasRace(allCandidates, "state_house", voterState, districts.state_house)) {
      tasks.push({ state: voterState, raceType: "state_house", districtNum: parsed.districtNum });
    }
  }

  if (!tasks.length) return; // nothing to discover

  // Fire the discovery work asynchronously
  (async () => {
    for (const task of tasks) {
      const key = `${task.state}|${task.raceType}|${task.districtNum}`;
      if (inFlight.has(key)) {
        console.log(`[RaceDiscovery] Already discovering: ${key}`);
        continue;
      }
      inFlight.add(key);
      try {
        console.log(`[RaceDiscovery] Starting discovery: ${key}`);
        const candidates = await discoverRaceCandidates(task);
        await saveCandidates(candidates);
        console.log(`[RaceDiscovery] Done: ${key} — ${candidates.length} candidates saved`);
      } catch (err) {
        console.error(`[RaceDiscovery] Error for ${key}: ${err.message}`);
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
