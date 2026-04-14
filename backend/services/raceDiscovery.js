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
import axios from "axios";
import * as cheerio from "cheerio";
import {
  shouldExposeCountyRuntimeDiscoveredCandidates,
  COUNTY_RUNTIME_SOURCE_NAME,
  isCountyRuntimeDiscoveredCandidate,
} from "./localDiscoveryGate.js";

// In-memory set of races currently being discovered so parallel requests
// don't trigger duplicate scraping work.
const inFlight = new Set();

// Negative cache: remember races that returned 0 results so we don't
// hammer Ballotpedia with repeated 404s on every user request.
// Entries expire after 6 hours.
const NEG_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const negativeCache = new Map();

function isNegCached(key) {
  const entry = negativeCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry > NEG_CACHE_TTL_MS) {
    negativeCache.delete(key);
    return false;
  }
  return true;
}

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

    if (raceType === "governor") {
      return /^governor$/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "lt_governor") {
      return /lieutenant governor/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "attorney_general") {
      return /attorney general/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "comptroller") {
      return /comptroller/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "land_commissioner") {
      return /land commissioner/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "ag_commissioner") {
      return /agriculture commissioner/i.test(c.office) && c.office_level === "state";
    }
    if (raceType === "railroad_commissioner") {
      return /railroad commissioner/i.test(c.office) && c.office_level === "state";
    }
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

  const execRaces = [
    "governor", "lt_governor", "attorney_general", "comptroller",
    "land_commissioner", "ag_commissioner", "railroad_commissioner",
  ];
  for (const rt of execRaces) {
    if (!hasRace(allCandidates, rt, voterState, null)) {
      tasks.push({ state: voterState, raceType: rt, districtNum: null, skipPhotos: true });
    }
  }

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
      if (inFlight.has(key) || isNegCached(key)) continue;
      inFlight.add(key);
      try {
        console.log(`[RaceDiscovery] Starting: ${key}`);
        const candidates = await discoverRaceCandidates(task);
        await saveCandidates(candidates);
        if (candidates.length === 0) {
          negativeCache.set(key, Date.now());
          console.log(`[RaceDiscovery] Done: ${key} — 0 found (neg-cached for 6h)`);
        } else {
          console.log(`[RaceDiscovery] Done: ${key} — ${candidates.length} saved`);
        }
      } catch (err) {
        negativeCache.set(key, Date.now());
        console.error(`[RaceDiscovery] Error ${key}: ${err.message} (neg-cached for 6h)`);
      } finally {
        inFlight.delete(key);
      }
    }
  })();
}

// ── County-level runtime discovery ─────────────────────────────────────────

const BP_BASE = "https://ballotpedia.org";
const countyNegCache = new Map();
const COUNTY_NEG_TTL = 12 * 60 * 60 * 1000;

function isCountyNegCached(key) {
  const entry = countyNegCache.get(key);
  if (!entry) return false;
  if (Date.now() - entry > COUNTY_NEG_TTL) { countyNegCache.delete(key); return false; }
  return true;
}

function isPersonNameSimple(name) {
  if (!name || name.length < 4 || name.length > 60) return false;
  if (/party|election|district|senate|house|congress|board|court|committee|commission/i.test(name)) return false;
  const words = name.trim().split(/\s+/);
  return words.length >= 2 && /^[A-Z]/.test(words[0]);
}

function countyOfficePolicies(office) {
  const lc = (office || "").toLowerCase();
  if (/judge|court|judicial/i.test(lc)) return ["Ensure fair and impartial adjudication", "Improve court efficiency and reduce backlogs", "Manage growing caseloads", "Maintain accessible court services", "Uphold rule of law"];
  if (/clerk/i.test(lc)) return ["Modernize records management", "Ensure transparent public records", "Streamline filing processes", "Maintain election integrity", "Reduce costs through automation"];
  if (/commissioner/i.test(lc)) return ["Manage county growth responsibly", "Maintain fiscal accountability", "Support law enforcement", "Improve infrastructure", "Ensure transparent operations"];
  if (/attorney|da\b/i.test(lc)) return ["Prosecute criminal cases effectively", "Support victims' rights", "Address growing caseloads", "Ensure public safety", "Maintain justice system integrity"];
  return ["Support public safety", "Improve county infrastructure", "Ensure fiscal responsibility", "Promote transparent government", "Manage county growth"];
}

/**
 * Runtime county discovery: scrape Ballotpedia county election page on-demand
 * when no local candidates exist for the voter's county. Runs in background.
 */
export function triggerCountyDiscovery(county, voterState, allCandidates) {
  if (!county || voterState !== "TX") return;
  if (!shouldExposeCountyRuntimeDiscoveredCandidates(voterState)) {
    console.log(
      `[RaceDiscovery] County discovery skipped — before COUNTY_RUNTIME_LOCALS_VISIBLE_ON (${voterState})`,
    );
    return;
  }

  const countyName = county.replace(/\s*County\s*$/i, "").trim();
  const key = `county|${countyName}`;
  if (inFlight.has(key) || isCountyNegCached(key)) return;

  const countyLower = countyName.toLowerCase();
  const hasLocal = allCandidates.some((c) => {
    if (c.office_level !== "local" && c.office_level !== "city") return false;
    // Ignore county-runtime rows that are currently hidden from the API (same as client filter).
    if (isCountyRuntimeDiscoveredCandidate(c) && !shouldExposeCountyRuntimeDiscoveredCandidates(voterState)) {
      return false;
    }
    const j = (c.jurisdiction || "").toLowerCase();
    const o = (c.office || "").toLowerCase();
    return j.includes(countyLower) || o.includes(countyLower);
  });
  if (hasLocal) return;

  inFlight.add(key);
  console.log(`[RaceDiscovery] No local data for ${countyName} County — triggering county discovery`);

  (async () => {
    try {
      const slug = countyName.replace(/ /g, "_");
      const url = `${BP_BASE}/${slug}_County,_Texas,_elections,_2026`;
      const res = await axios.get(url, {
        timeout: 15000,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0)" },
      });

      const $ = cheerio.load(res.data);
      const coll = getCandidatesCollection();
      const now = new Date();
      let inserted = 0;

      const skipOffice = /municipal utility|improvement district|water control|water district|MUD\b|fresh water|levee|emergency service/i;
      const seen = new Set();
      let currentOffice = null;

      $("div.widget-data-list").each((_, container) => {
        $(container).children().each((_, child) => {
          const tag = (child.tagName || "").toLowerCase();
          const $child = $(child);

          if (tag === "p") {
            const bold = $child.find("b").text().trim();
            if (bold && bold.length > 3 && bold.length < 150) currentOffice = bold;
          } else if (tag === "ul" && currentOffice && !skipOffice.test(currentOffice)) {
            $child.find("li").each((_, li) => {
              const $li = $(li);
              const $link = $li.find("a[href]").first();
              if (!$link.length) return;
              const name = $link.text().trim().replace(/\s*\(i\)\s*$/, "").trim();
              if (!isPersonNameSimple(name)) return;

              const liText = $li.text();
              let party = "NP";
              if (/\(R\)/.test(liText)) party = "R";
              else if (/\(D\)/.test(liText)) party = "D";

              const href = $link.attr("href") || "";
              const sourceUrl = href.startsWith("/") ? `${BP_BASE}${href}` : href.includes("ballotpedia.org") ? href : null;

              const ck = `${name}|${currentOffice}`;
              if (seen.has(ck)) return;
              seen.add(ck);

              coll.updateOne(
                { name, office: currentOffice },
                { $setOnInsert: { name, office: currentOffice, office_level: "local", jurisdiction: `${countyName} County`, state: "TX", district: null, party, policies: countyOfficePolicies(currentOffice), policies_source: "office_party_template", source_url: sourceUrl, source_name: COUNTY_RUNTIME_SOURCE_NAME, status_2026: "nominee", photo: { url: null, source: null, verified: false, fallback_initials: (name.split(" ").filter(w => /^[A-Z]/.test(w)).map(w => w[0]).slice(0, 2).join("")) }, geo: { jurisdiction_name: `${countyName} County`, geo_type: "county_center" }, created_at: now, updated_at: now } },
                { upsert: true },
              ).then((r) => { if (r.upsertedCount) inserted++; }).catch(() => {});
            });
          }
        });
      });

      // Wait for all upserts to settle
      await new Promise((r) => setTimeout(r, 2000));
      if (inserted === 0) { countyNegCache.set(key, Date.now()); }
      console.log(`[RaceDiscovery] County discovery done: ${countyName} — ${inserted} new candidates`);
    } catch (err) {
      countyNegCache.set(key, Date.now());
      console.error(`[RaceDiscovery] County discovery error for ${countyName}: ${err.message}`);
    } finally {
      inFlight.delete(key);
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
