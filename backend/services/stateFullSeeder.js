/**
 * stateFullSeeder.js
 *
 * Bulk-seeds all 2026 federal and state legislative candidates for a given
 * US state by scraping Ballotpedia.
 *
 * Strategy:
 *  US Senate  → individual statewide race page, parse with parseElectionPageHtml
 *  US House   → individual district race pages (exist for TX 2026), fetched in parallel
 *  State Sen  → overview page: parse the `wikitable sortable collapsible` table;
 *  State House  each row = [District N | D candidate | R candidate | Other].
 *               District + party are read directly from the table — no individual
 *               candidate page fetches needed for metadata.
 *               Bio text fetched in parallel for policy bullet generation.
 *
 * Photos skipped (added separately later).
 * Idempotent: $setOnInsert, so pipeline data is never overwritten.
 */

import * as cheerio from "cheerio";
import axios from "axios";
import { getCandidatesCollection } from "../db.js";
import {
  parseElectionPageHtml,
  fetchCandidateInfo,
  bioToBullets,
  isPersonName,
  STATE_NAMES,
  STATE_FULL,
  STATE_CAPITALS,
  makeGeo,
  initials,
  hashCandidate,
  toOrdinal,
  statePossessive,
} from "./ballotpediaRaceScraper.js";

// ─── Tunable constants ────────────────────────────────────────────────────────
const BP_BASE = "https://ballotpedia.org";
const CONCURRENCY = 5;
const FETCH_DELAY_MS = 300;
const FETCH_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchFast(url) {
  await sleep(FETCH_DELAY_MS);
  try {
    const res = await axios.get(url, {
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      responseType: "text",
    });
    return res.data;
  } catch {
    return null;
  }
}

async function pMap(items, fn, concurrency = CONCURRENCY) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ─── In-memory guard ─────────────────────────────────────────────────────────
const seedingInProgress = new Set();
export function isSeedingInProgress(state) {
  return seedingInProgress.has(state);
}

// ─── House seat counts (2026 apportionment) ───────────────────────────────────
const HOUSE_SEATS = {
  AL: 7,  AK: 1,  AZ: 9,  AR: 4,  CA: 52, CO: 8,  CT: 5,  DE: 1,
  FL: 28, GA: 14, HI: 2,  ID: 2,  IL: 17, IN: 9,  IA: 4,  KS: 4,
  KY: 6,  LA: 6,  ME: 2,  MD: 8,  MA: 9,  MI: 13, MN: 8,  MS: 4,
  MO: 8,  MT: 2,  NE: 3,  NV: 4,  NH: 2,  NJ: 12, NM: 3,  NY: 26,
  NC: 14, ND: 1,  OH: 15, OK: 5,  OR: 6,  PA: 17, RI: 2,  SC: 7,
  SD: 1,  TN: 9,  TX: 38, UT: 4,  VT: 1,  VA: 11, WA: 10, WV: 2,
  WI: 8,  WY: 1,
};

// ─── Candidate doc builder ────────────────────────────────────────────────────

function buildDoc({ name, slug, party, districtLabel, raceType, state, bio, ballotpedia_url, now }) {
  const stateFull = STATE_FULL[state] || state;
  const OFFICE = { us_senate: "U.S. Senate", us_house: "U.S. House", state_senate: "State Senate", state_house: "State House" };
  const LEVEL  = { us_senate: "federal", us_house: "federal", state_senate: "state", state_house: "state" };
  const officeLabel = OFFICE[raceType] + (districtLabel ? ` ${districtLabel}` : "");
  const policies = bioToBullets(bio, party);

  const doc = {
    name,
    office: officeLabel,
    office_level: LEVEL[raceType],
    jurisdiction: stateFull,
    state,
    district: districtLabel || null,
    party,
    incumbent: null,
    filing_date: null,
    geo: makeGeo(state),
    home_city: STATE_CAPITALS[state]?.city || state,
    policies,
    photo: { url: null, source: null, verified: false, last_fetched: null, fallback_initials: initials(name) },
    zip_codes: [],
    district_zip_map: { state, district: districtLabel || null, zip_codes: [] },
    source_url: ballotpedia_url || `${BP_BASE}/${slug}`,
    source_name: "Ballotpedia (bulk-seeded)",
    last_verified: now,
    status_2026: "nominee",
    data_hash: "",
  };
  doc.data_hash = hashCandidate(doc);
  return doc;
}

async function upsertDoc(doc) {
  const coll = getCandidatesCollection();
  try {
    const r = await coll.updateOne(
      { name: doc.name, office: doc.office, district: doc.district },
      { $setOnInsert: { ...doc, created_at: new Date(), updated_at: new Date() } },
      { upsert: true }
    );
    return r.upsertedCount > 0;
  } catch (err) {
    console.warn(`  [Seeder] DB error for ${doc.name}: ${err.message}`);
    return false;
  }
}

// ─── US Senate ────────────────────────────────────────────────────────────────

async function seedUsSenate(state, stats, now) {
  const sn = STATE_NAMES[state];
  if (!sn) return;
  const url = `${BP_BASE}/United_States_Senate_election_in_${sn},_2026`;
  console.log(`[Seeder] Senate: ${url}`);
  const html = await fetchFast(url);
  if (!html) return;

  // Parse candidates from the general election table only
  const $ = cheerio.load(html);
  const nominees = [];

  // Find the general election section
  let $genEl = null;
  $("h4,h3,h2").each((_, el) => {
    if (/^general election$/i.test($(el).text().trim())) { $genEl = $(el); return false; }
  });

  if ($genEl) {
    // Scan only the FIRST table after the general election heading
    const $firstTable = $genEl.nextAll("table").first();
    if ($firstTable.length) {
      $firstTable.find("tr").each((_, row) => {
        const $row = $(row);
        $row.find("a[href]").each((_, link) => {
          const name = $(link).text().trim().replace(/\(i\)|^\s*|\s*$/g, "").trim();
          const href = $(link).attr("href") || "";
          const rowText = $row.text();
          if (!name || /\d/.test(name) || /\band\b/.test(name)) return;
          if (!isPersonName(name)) return;
          let slug = href.includes("ballotpedia.org/") ? href.split("ballotpedia.org/")[1].split("#")[0]
                   : href.startsWith("/") ? href.slice(1).split("#")[0] : null;
          if (!slug) return;
          const party = /\(D\)/.test(rowText) || /Democrat/i.test(rowText) ? "D"
                      : /\(R\)/.test(rowText) || /Republican/i.test(rowText) ? "R" : null;
          if (!party) return;
          if (!nominees.find(n => n.slug === slug)) nominees.push({ name, slug, party });
        });
      });
    }
  }

  if (!nominees.length) {
    console.log(`  [Seeder] Senate: no general election candidates found yet`);
    return;
  }

  stats.races++;
  console.log(`  [Seeder] Senate nominees: ${nominees.map(n => `${n.name}(${n.party})`).join(", ")}`);

  for (const n of nominees.slice(0, 4)) {
    const info = await fetchCandidateInfo(n.slug, { skipPhoto: true });
    const doc = buildDoc({ name: n.name, slug: n.slug, party: n.party, districtLabel: null,
                           raceType: "us_senate", state, bio: info?.bio, ballotpedia_url: info?.ballotpedia_url, now });
    const saved = await upsertDoc(doc);
    stats.total++; if (saved) stats.saved++;
  }
}

// ─── US House ────────────────────────────────────────────────────────────────

/**
 * Parse the US House incumbents overview table from Ballotpedia.
 * Table class: "data-table dt-collapsible", structure:
 *   Row 0: header [District | Incumbent | PVI]
 *   Row 1+: [Texas' Nth | Incumbent Name | R+X or D+X]
 *
 * Returns [{ districtNum, name, slug, party }]
 */
function parseUsHouseIncumbents(html, state) {
  const $ = cheerio.load(html);
  const results = [];

  // Find the table with headers District | Incumbent | PVI
  let $incumbentTable = null;
  $("table.data-table, table[class*='dt-collapsible']").each((_, t) => {
    const headerText = $(t).find("tr").first().text();
    if (/District.*Incumbent.*PVI/i.test(headerText)) { $incumbentTable = $(t); return false; }
  });
  if (!$incumbentTable) return results;

  const seats = HOUSE_SEATS[state] || 1;

  $incumbentTable.find("tr").each((rowIdx, row) => {
    if (rowIdx === 0) return; // skip header
    const $cells = $(row).find("td,th");
    if ($cells.length < 3) return;

    // Column 0: "Texas' Nth" — extract district number
    const $distCell = $cells.eq(0);
    const distText = $distCell.text().trim();
    // "Texas' 21st" → ordinal extraction
    const distNum = distText.match(/\b(\d+)(st|nd|rd|th)\b/i);
    if (!distNum) return;
    const d = parseInt(distNum[1]);
    if (d > seats) return;

    // Column 1: Incumbent name
    const $incumbLink = $cells.eq(1).find("a[href]").first();
    if (!$incumbLink.length) return;
    const name = $incumbLink.text().trim().replace(/\s*\(i\)\s*$/, "").trim();
    const href = $incumbLink.attr("href") || "";
    let slug = href.includes("ballotpedia.org/") ? href.split("ballotpedia.org/")[1].split("#")[0]
             : href.startsWith("/") ? href.slice(1).split("#")[0] : null;
    if (!slug || !isPersonName(name)) return;
    slug = decodeURIComponent(slug);

    // Column 2: PVI (R+25, D+12, etc.) → infer party
    const pviText = $cells.eq(2).text().trim();
    const party = pviText.startsWith("D") ? "D" : pviText.startsWith("R") ? "R" : null;
    if (!party) return;

    results.push({ districtNum: d, name, slug, party });
  });

  return results;
}

function extractCandidateFromLink($, link, party, seen, results) {
  const href = $(link).attr("href") || "";
  const nameText = $(link).text().trim();

  let slug = "";
  let name = nameText;

  if (href.startsWith("/")) {
    slug = decodeURIComponent(href.slice(1).split("#")[0]);
  } else if (href.includes("ballotpedia.org/")) {
    const raw = href.split("ballotpedia.org/")[1];
    if (!raw) return;
    slug = decodeURIComponent(raw.split("#")[0]);
    // For "click here" links, derive name from slug
    if (!isPersonName(name)) {
      name = slug.replace(/_/g, " ").replace(/\s*\([^)]+\)\s*$/, "").trim();
    }
  } else {
    return; // external link, skip
  }

  if (!slug || slug.length < 5 || slug.length > 80) return;
  // Skip organization/non-person slugs
  if (/^Ballotpedia|^Wikipedia|^File:|^Special:|^Talk:/i.test(slug)) return;
  // Person slugs must not contain commas, spaces, or election keywords
  if (/[,\s]|election|primary|primary_runoff/i.test(slug)) return;
  if (!isPersonName(name)) return;
  if (/\d/.test(name)) return;
  if (seen.has(slug)) return;
  seen.add(slug);
  results.push({ name, slug, party });
}

/**
 * Extract 2026 primary candidates from an individual district page.
 *
 * Ballotpedia structure (post-primary, March 2026):
 *   h2: "March 3 Republican Primary"
 *     h3: "Candidate profiles"   ← actual candidates listed here
 *       <p><a href="/Chip_Roy">Chip Roy</a>, ...</p>
 *     h3: "See more"             ← election news/endorsers — skip
 *
 * We scope candidate collection strictly to the "Candidate profiles" h3.
 * Returns [{ name, slug, party }]
 */
function parseDistrictPrimaryCandidates(html) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  const $content = $("#mw-content-text").length ? $("#mw-content-text") : $("body");
  const allNodes = $content.find("h2,h3,p,li").toArray();

  let currentParty = null;
  let inCandidateProfiles = false;

  for (const el of allNodes) {
    const tag = el.tagName?.toLowerCase();
    const text = $(el).text().trim();

    if (tag === "h2") {
      if (/\brepublican\b/i.test(text) && /\bprimary\b/i.test(text)) {
        currentParty = "R"; inCandidateProfiles = false;
      } else if (/\bdemocrat(ic)?\b/i.test(text) && /\bprimary\b/i.test(text)) {
        currentParty = "D"; inCandidateProfiles = false;
      } else {
        currentParty = null; inCandidateProfiles = false;
      }
      continue;
    }

    if (tag === "h3") {
      inCandidateProfiles = !!(currentParty && /candidate profiles/i.test(text));
      continue;
    }

    if (!inCandidateProfiles || !currentParty) continue;

    $(el).find("a[href]").each((_, link) => {
      extractCandidateFromLink($, link, currentParty, seen, results);
    });
  }

  return results;
}

async function fetchHouseDistrictCandidates(state, d, possName) {
  const ord = toOrdinal(d);
  const url = `${BP_BASE}/${possName}_${ord}_Congressional_District_election,_2026`;
  const html = await fetchFast(url);
  if (!html) return [];

  // parseElectionPageHtml now exclusively reads from div.votebox containers,
  // returning only general election nominees and active runoff candidates.
  // It never returns completed-primary losers.
  const nominees = parseElectionPageHtml(html);
  if (nominees.length > 0) return nominees.slice(0, 4);

  // Fallback: parse primary candidate profiles (pre-primary-results state)
  return parseDistrictPrimaryCandidates(html);
}

async function seedUsHouse(state, stats, now) {
  const sn = STATE_NAMES[state];
  if (!sn) return;
  const seats = HOUSE_SEATS[state] || 1;
  const possName = statePossessive(sn);

  // Step 1: Fetch overview page for incumbents (one request)
  const overviewUrl = `${BP_BASE}/United_States_House_of_Representatives_elections_in_${sn},_2026`;
  console.log(`[Seeder] US House overview: ${overviewUrl}`);
  const overviewHtml = await fetchFast(overviewUrl);
  const incumbents = overviewHtml ? parseUsHouseIncumbents(overviewHtml, state) : [];
  console.log(`[Seeder] US House ${state}: ${seats} districts, ${incumbents.length} incumbents found`);

  // Build incumbent map keyed by district number
  const incumbentMap = new Map(incumbents.map(i => [i.districtNum, i]));

  // Step 2: For each district, try to fetch primary candidates from district page
  const districtNums = Array.from({ length: seats }, (_, i) => i + 1);
  console.log(`[Seeder] Fetching ${seats} district pages (${CONCURRENCY} parallel)...`);
  const primaryCandidatesByDistrict = await pMap(
    districtNums,
    (d) => fetchHouseDistrictCandidates(state, d, possName).then(cs => ({ d, cs }))
  );

  // Collect all unique candidates to fetch bio for
  const allCandidates = []; // { districtNum, name, slug, party }
  for (const { d, cs } of primaryCandidatesByDistrict) {
    const inc = incumbentMap.get(d);
    if (cs.length > 0) {
      // Add primary candidates (up to 5 per party)
      for (const c of cs.slice(0, 5)) allCandidates.push({ ...c, districtNum: d });
      // Also ensure incumbent is included (they may not be in survey list)
      if (inc && !cs.some(c => c.slug === inc.slug)) {
        allCandidates.push({ ...inc });
      }
    } else {
      // Fallback: use incumbent only
      if (inc) allCandidates.push({ ...inc });
    }
  }

  console.log(`[Seeder] US House ${state}: ${allCandidates.length} total candidates to process`);

  // Step 3: Fetch bio in parallel, then upsert
  const racesSeen = new Set();
  const processed = await pMap(allCandidates, async (c) => {
    const info = await fetchCandidateInfo(c.slug, { skipPhoto: true });
    return { ...c, bio: info?.bio || null, ballotpedia_url: info?.ballotpedia_url || `${BP_BASE}/${c.slug}` };
  });

  for (const c of processed) {
    const districtLabel = `${state}-${c.districtNum}`;
    const doc = buildDoc({ name: c.name, slug: c.slug, party: c.party, districtLabel,
                           raceType: "us_house", state, bio: c.bio, ballotpedia_url: c.ballotpedia_url, now });
    const saved = await upsertDoc(doc);
    stats.total++; if (saved) stats.saved++;
    if (!racesSeen.has(districtLabel)) { racesSeen.add(districtLabel); stats.races++; }
    if (saved) console.log(`  [Seeder] ✓ ${c.name} (${c.party}) ${districtLabel}`);
  }
}

// ─── State Senate / House via overview table ──────────────────────────────────

/**
 * Parse the Ballotpedia election overview table for state senate/house.
 *
 * Table structure (wikitable sortable collapsible):
 *   Row 0: merged title
 *   Row 1: notes/footnotes
 *   Row 2: header — [Office | Democratic | Republican | Other]
 *   Row 3+: data  — [District N | D candidate | R candidate | Other]
 *
 * Returns [{ districtNum, party, name, slug }]
 */
function parseOverviewTable(html) {
  const $ = cheerio.load(html);
  const results = [];

  const $table = $("table.wikitable.sortable").first();
  if (!$table.length) return results;

  $table.find("tr").each((rowIdx, row) => {
    if (rowIdx < 3) return; // skip title, notes, header

    const $cells = $(row).find("td");
    if ($cells.length < 2) return;

    // Column 0: district number
    const districtText = $cells.eq(0).text().replace(/\s+/g, " ").trim();
    const dm = districtText.match(/District\s+(\d+)/i);
    if (!dm) return;
    const districtNum = parseInt(dm[1], 10);

    function extractCandidate($cell, party) {
      const $link = $cell.find("a[href]").first();
      if (!$link.length) return;
      const rawName = $link.text().trim().replace(/\s*\(i\)\s*$/, "").trim();
      if (!rawName || /pending|Primary|runoff/i.test(rawName)) return;
      if (/\band\b/i.test(rawName) || /\d/.test(rawName)) return;
      if (!isPersonName(rawName)) return;
      const href = $link.attr("href") || "";
      let slug = "";
      if (href.includes("ballotpedia.org/")) {
        slug = decodeURIComponent(href.split("ballotpedia.org/")[1].split("#")[0]);
      } else if (href.startsWith("/")) {
        slug = decodeURIComponent(href.slice(1).split("#")[0]);
      }
      if (!slug || slug.length < 3) return;
      results.push({ districtNum, party, name: rawName, slug });
    }

    extractCandidate($cells.eq(1), "D");
    extractCandidate($cells.eq(2), "R");
  });

  return results;
}

async function seedStateLegislative(state, raceType, stats, now) {
  const sn = STATE_NAMES[state];
  if (!sn) return;

  const overviewSlug =
    raceType === "state_senate" ? `${sn}_State_Senate_elections,_2026`
    : raceType === "state_house"  ? `${sn}_House_of_Representatives_elections,_2026`
    : null;
  if (!overviewSlug) return;

  const overviewUrl = `${BP_BASE}/${overviewSlug}`;
  console.log(`[Seeder] Overview: ${overviewUrl}`);
  const html = await fetchFast(overviewUrl);
  if (!html) { console.log(`  [Seeder] Not found`); return; }

  const candidates = parseOverviewTable(html);
  console.log(`[Seeder] ${raceType}: parsed ${candidates.length} candidates from table`);
  if (!candidates.length) return;

  const racesSeen = new Set();

  // Fetch bio in parallel for policy bullets
  const processed = await pMap(candidates, async (c) => {
    const info = await fetchCandidateInfo(c.slug, { skipPhoto: true });
    return { ...c, bio: info?.bio || null, ballotpedia_url: info?.ballotpedia_url || `${BP_BASE}/${c.slug}` };
  });

  for (const c of processed) {
    const districtLabel = raceType === "state_senate" ? `SD-${c.districtNum}` : `HD-${c.districtNum}`;
    const doc = buildDoc({ name: c.name, slug: c.slug, party: c.party, districtLabel,
                           raceType, state, bio: c.bio, ballotpedia_url: c.ballotpedia_url, now });
    const saved = await upsertDoc(doc);
    stats.total++; if (saved) stats.saved++;
    if (!racesSeen.has(districtLabel)) { racesSeen.add(districtLabel); stats.races++; }
    if (saved) console.log(`  [Seeder] ✓ ${c.name} (${c.party}) ${districtLabel}`);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function seedStateRaces(state) {
  if (seedingInProgress.has(state)) {
    console.log(`[Seeder] ${state} already seeding`);
    return { saved: 0, total: 0, races: 0 };
  }
  seedingInProgress.add(state);
  console.log(`\n[Seeder] ═══ Starting full seed for ${state} ═══`);

  const stats = { saved: 0, total: 0, races: 0 };
  const now = new Date();

  try {
    await seedUsSenate(state, stats, now);
    await seedUsHouse(state, stats, now);
    await seedStateLegislative(state, "state_senate", stats, now);
    await seedStateLegislative(state, "state_house", stats, now);
  } finally {
    seedingInProgress.delete(state);
  }

  console.log(`[Seeder] ═══ ${state} complete — races: ${stats.races}, saved: ${stats.saved}/${stats.total} ═══\n`);
  return stats;
}
