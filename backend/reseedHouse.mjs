/**
 * Drop all existing TX US House candidates and re-seed from Ballotpedia,
 * using the general election votebox (post-primary results).
 */
import dotenv from "dotenv";
dotenv.config();
import * as cheerio from "cheerio";
import axios from "axios";
import { connectDB, getCandidatesCollection } from "./db.js";
import {
  fetchCandidateInfo, bioToBullets, isPersonName, parseElectionPageHtml,
  STATE_NAMES, STATE_FULL, STATE_CAPITALS, makeGeo, initials, hashCandidate,
  toOrdinal, statePossessive,
} from "./services/ballotpediaRaceScraper.js";

const BP_BASE = "https://ballotpedia.org";
const CONCURRENCY = 5;
const DELAY = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url) {
  await sleep(DELAY);
  try {
    const r = await axios.get(url, {
      timeout: 14000,
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      responseType: "text",
    });
    return r.data;
  } catch { return null; }
}

async function pMap(items, fn, concurrency = CONCURRENCY) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    results.push(...await Promise.all(items.slice(i, i + concurrency).map(fn)));
  }
  return results;
}

// parseElectionPageHtml (imported) handles votebox parsing with the correct strategy:
// includes general election and runoff voteboxes, excludes completed primary voteboxes.

/**
 * Fallback: parse primary candidate profiles when general table isn't available yet.
 */
function parseDistrictPrimaryCandidates(html) {
  const $ = cheerio.load(html);
  const results = [], seen = new Set();
  const allNodes = $("#mw-content-text, body").first().find("h2,h3,p,li").toArray();
  let currentParty = null, inCandidateProfiles = false;
  for (const el of allNodes) {
    const tag = el.tagName?.toLowerCase();
    const text = $(el).text().trim();
    if (tag === "h2") {
      if (/\brepublican\b/i.test(text) && /\bprimary\b/i.test(text)) { currentParty = "R"; inCandidateProfiles = false; }
      else if (/\bdemocrat(ic)?\b/i.test(text) && /\bprimary\b/i.test(text)) { currentParty = "D"; inCandidateProfiles = false; }
      else { currentParty = null; inCandidateProfiles = false; }
      continue;
    }
    if (tag === "h3") { inCandidateProfiles = !!(currentParty && /candidate profiles/i.test(text)); continue; }
    if (!inCandidateProfiles || !currentParty) continue;
    $(el).find("a[href]").each((_, link) => {
      const href = $(link).attr("href") || "";
      const name = $(link).text().trim();
      if (!href.startsWith("/") && !href.includes("ballotpedia.org/")) return;
      let slug = href.startsWith("/")
        ? decodeURIComponent(href.slice(1).split("#")[0])
        : decodeURIComponent(href.split("ballotpedia.org/")[1]?.split("#")[0] || "");
      if (!slug || slug.length < 5 || slug.length > 80) return;
      if (/^Ballotpedia|^Wikipedia|election|primary|district/i.test(slug)) return;
      if (!isPersonName(name) || /\d/.test(name)) return;
      if (seen.has(slug)) return;
      seen.add(slug);
      results.push({ name, slug, party: currentParty });
    });
  }
  return results;
}

function buildDoc({ name, slug, party, districtLabel, state, bio, ballotpedia_url }) {
  const now = new Date();
  const policies = bioToBullets(bio, party);
  const doc = {
    name, office: `U.S. House ${districtLabel}`, office_level: "federal",
    jurisdiction: STATE_FULL[state] || state, state, district: districtLabel, party,
    incumbent: null, filing_date: null, geo: makeGeo(state),
    home_city: STATE_CAPITALS[state]?.city || state, policies,
    photo: { url: null, source: null, verified: false, last_fetched: null, fallback_initials: initials(name) },
    zip_codes: [], district_zip_map: { state, district: districtLabel, zip_codes: [] },
    source_url: ballotpedia_url || `${BP_BASE}/${slug}`,
    source_name: "Ballotpedia (bulk-seeded)", last_verified: now, status_2026: "nominee", data_hash: "",
  };
  doc.data_hash = hashCandidate(doc);
  return doc;
}

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  // Drop all existing TX US House candidates
  const deleted = await coll.deleteMany({ office_level: "federal", office: /U\.S\. House TX-/ });
  console.log(`Deleted ${deleted.deletedCount} existing TX House candidates`);

  const state = "TX";
  const sn = STATE_NAMES[state];
  const possName = statePossessive(sn);
  const seats = 38;

  console.log(`\nFetching ${seats} district pages (${CONCURRENCY} parallel)...`);

  const districtData = await pMap(
    Array.from({ length: seats }, (_, i) => i + 1),
    async (d) => {
      const ord = toOrdinal(d);
      const url = `${BP_BASE}/${possName}_${ord}_Congressional_District_election,_2026`;
      const html = await fetchPage(url);
      if (!html) return { d, candidates: [], source: "404" };

      // Try votebox first (general election or runoff — never primary losers)
      const general = parseElectionPageHtml(html);
      if (general.length > 0) return { d, candidates: general, source: "general" };

      // Fallback: primary candidate profiles
      const primary = parseDistrictPrimaryCandidates(html).slice(0, 5);
      return { d, candidates: primary, source: "primary" };
    }
  );

  const allCandidates = [];
  for (const { d, candidates, source } of districtData) {
    if (candidates.length) {
      console.log(`  TX-${d} (${source}): ${candidates.map(c => `${c.name}(${c.party})`).join(", ")}`);
      for (const c of candidates) allCandidates.push({ ...c, districtNum: d });
    } else {
      console.log(`  TX-${d}: no candidates found`);
    }
  }

  console.log(`\nFetching bios for ${allCandidates.length} candidates...`);
  const processed = await pMap(allCandidates, async (c) => {
    const info = await fetchCandidateInfo(c.slug, { skipPhoto: true });
    return { ...c, bio: info?.bio || null, ballotpedia_url: info?.ballotpedia_url || `${BP_BASE}/${c.slug}` };
  });

  let saved = 0;
  for (const c of processed) {
    const districtLabel = `TX-${c.districtNum}`;
    const doc = buildDoc({ name: c.name, slug: c.slug, party: c.party, districtLabel, state, bio: c.bio, ballotpedia_url: c.ballotpedia_url });
    await coll.insertOne({ ...doc, created_at: new Date(), updated_at: new Date() });
    saved++;
  }

  console.log(`\nDone — saved ${saved} TX US House candidates across ${districtData.filter(d => d.candidates.length > 0).length} districts`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
