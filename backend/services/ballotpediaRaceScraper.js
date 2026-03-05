/**
 * ballotpediaRaceScraper.js
 *
 * Dynamically discovers 2026 general-election nominees for any US federal or
 * state legislative race by scraping Ballotpedia election pages.
 *
 * Supported race types:
 *   "us_senate"    — United States Senate election in {State}, 2026
 *   "us_house"     — {State}'s {N}th Congressional District election, 2026
 *   "state_senate" — {State} State Senate District {N} election, 2026
 *   "state_house"  — {State} House of Representatives District {N} election, 2026
 *
 * When discovery succeeds the candidates are inserted into MongoDB and returned.
 * When a page cannot be parsed (JS-heavy or layout mismatch) an empty array
 * is returned gracefully so the caller can show "no data yet."
 */

import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";

const BP_BASE = "https://ballotpedia.org";
const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url) {
  await sleep(DELAY_MS);
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      responseType: "text",
    });
    return res.data;
  } catch (err) {
    console.warn(`[RaceScraper] fetch failed: ${url} — ${err.message}`);
    return null;
  }
}

// ─── Ordinal helper ──────────────────────────────────────────────────────────

function toOrdinal(n) {
  const v = n % 100;
  const suffix =
    v >= 11 && v <= 13
      ? "th"
      : ["th", "st", "nd", "rd", "th"][Math.min(v % 10, 4)];
  return `${n}${suffix}`;
}

// ─── State / chamber name tables ─────────────────────────────────────────────

const STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New_Hampshire", NJ: "New_Jersey", NM: "New_Mexico", NY: "New_York",
  NC: "North_Carolina", ND: "North_Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode_Island", SC: "South_Carolina",
  SD: "South_Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West_Virginia",
  WI: "Wisconsin", WY: "Wyoming",
};

// Full state name (no underscores) used for jurisdiction field in DB
const STATE_FULL = Object.fromEntries(
  Object.entries(STATE_NAMES).map(([abbr, name]) => [abbr, name.replace(/_/g, " ")])
);

// Lower-chamber fragment used in Ballotpedia election page URLs
const LOWER_CHAMBER = {
  AL: "Alabama_House_of_Representatives",
  AK: "Alaska_House_of_Representatives",
  AZ: "Arizona_House_of_Representatives",
  AR: "Arkansas_House_of_Representatives",
  CA: "California_State_Assembly",
  CO: "Colorado_House_of_Representatives",
  CT: "Connecticut_House_of_Representatives",
  DE: "Delaware_House_of_Representatives",
  FL: "Florida_House_of_Representatives",
  GA: "Georgia_House_of_Representatives",
  HI: "Hawaii_House_of_Representatives",
  ID: "Idaho_House_of_Representatives",
  IL: "Illinois_House_of_Representatives",
  IN: "Indiana_House_of_Representatives",
  IA: "Iowa_House_of_Representatives",
  KS: "Kansas_House_of_Representatives",
  KY: "Kentucky_House_of_Representatives",
  LA: "Louisiana_House_of_Representatives",
  ME: "Maine_House_of_Representatives",
  MD: "Maryland_House_of_Delegates",
  MA: "Massachusetts_House_of_Representatives",
  MI: "Michigan_House_of_Representatives",
  MN: "Minnesota_House_of_Representatives",
  MS: "Mississippi_House_of_Representatives",
  MO: "Missouri_House_of_Representatives",
  MT: "Montana_House_of_Representatives",
  NV: "Nevada_Assembly",
  NH: "New_Hampshire_House_of_Representatives",
  NJ: "New_Jersey_General_Assembly",
  NM: "New_Mexico_House_of_Representatives",
  NY: "New_York_State_Assembly",
  NC: "North_Carolina_House_of_Representatives",
  ND: "North_Dakota_House_of_Representatives",
  OH: "Ohio_House_of_Representatives",
  OK: "Oklahoma_House_of_Representatives",
  OR: "Oregon_House_of_Representatives",
  PA: "Pennsylvania_House_of_Representatives",
  RI: "Rhode_Island_House_of_Representatives",
  SC: "South_Carolina_House_of_Representatives",
  SD: "South_Dakota_House_of_Representatives",
  TN: "Tennessee_House_of_Representatives",
  TX: "Texas_House_of_Representatives",
  UT: "Utah_House_of_Representatives",
  VT: "Vermont_House_of_Representatives",
  VA: "Virginia_House_of_Delegates",
  WA: "Washington_House_of_Representatives",
  WV: "West_Virginia_House_of_Delegates",
  WI: "Wisconsin_State_Assembly",
  WY: "Wyoming_House_of_Representatives",
};

const UPPER_CHAMBER = {
  AL: "Alabama_State_Senate", AK: "Alaska_State_Senate",
  AZ: "Arizona_State_Senate", AR: "Arkansas_State_Senate",
  CA: "California_State_Senate", CO: "Colorado_State_Senate",
  CT: "Connecticut_State_Senate", DE: "Delaware_State_Senate",
  FL: "Florida_State_Senate", GA: "Georgia_State_Senate",
  HI: "Hawaii_State_Senate", ID: "Idaho_State_Senate",
  IL: "Illinois_State_Senate", IN: "Indiana_State_Senate",
  IA: "Iowa_State_Senate", KS: "Kansas_State_Senate",
  KY: "Kentucky_State_Senate", LA: "Louisiana_State_Senate",
  ME: "Maine_State_Senate", MD: "Maryland_State_Senate",
  MA: "Massachusetts_State_Senate", MI: "Michigan_State_Senate",
  MN: "Minnesota_State_Senate", MS: "Mississippi_State_Senate",
  MO: "Missouri_State_Senate", MT: "Montana_State_Senate",
  NE: "Nebraska_Legislature", NV: "Nevada_State_Senate",
  NH: "New_Hampshire_State_Senate", NJ: "New_Jersey_State_Senate",
  NM: "New_Mexico_State_Senate", NY: "New_York_State_Senate",
  NC: "North_Carolina_State_Senate", ND: "North_Dakota_State_Senate",
  OH: "Ohio_State_Senate", OK: "Oklahoma_State_Senate",
  OR: "Oregon_State_Senate", PA: "Pennsylvania_State_Senate",
  RI: "Rhode_Island_State_Senate", SC: "South_Carolina_State_Senate",
  SD: "South_Dakota_State_Senate", TN: "Tennessee_State_Senate",
  TX: "Texas_State_Senate", UT: "Utah_State_Senate",
  VT: "Vermont_State_Senate", VA: "Virginia_State_Senate",
  WA: "Washington_State_Senate", WV: "West_Virginia_State_Senate",
  WI: "Wisconsin_State_Senate", WY: "Wyoming_State_Senate",
};

// ─── URL builder ─────────────────────────────────────────────────────────────

/**
 * Returns the grammatically correct possessive form of a state name for use
 * in Ballotpedia URLs, encoded for use in a URL path.
 * e.g. "Texas" (ends in 's') → "Texas%27"  (Texas')
 *      "California"            → "California%27s" (California's)
 */
function statePossessive(stateName) {
  // Remove underscores to test the actual ending letter
  const bare = stateName.replace(/_/g, "");
  return bare.endsWith("s")
    ? `${stateName}%27`        // Texas' Arkansas' Illinois' Kansas' …
    : `${stateName}%27s`;      // California's New_York's Georgia's …
}

/**
 * Build the Ballotpedia election page URL for a given race.
 * Returns an array of URLs to try (primary + fallback variants).
 */
function buildRaceUrls(state, raceType, districtNum) {
  const sn = STATE_NAMES[state];
  if (!sn) return [];

  if (raceType === "us_senate") {
    return [
      `${BP_BASE}/United_States_Senate_election_in_${sn},_2026`,
    ];
  }

  if (raceType === "us_house") {
    const ord = toOrdinal(districtNum);
    const poss = statePossessive(sn);
    return [
      // Grammatically-correct possessive (Texas' 37th, California's 12th)
      `${BP_BASE}/${poss}_${ord}_Congressional_District_election,_2026`,
      // Some pages use both-apostrophe styles; try alternate as fallback
      `${BP_BASE}/${sn}%27s_${ord}_Congressional_District_election,_2026`,
    ];
  }

  if (raceType === "state_senate") {
    const ch = UPPER_CHAMBER[state];
    if (!ch) return [];
    return [`${BP_BASE}/${ch}_District_${districtNum}_election,_2026`];
  }

  if (raceType === "state_house") {
    const ch = LOWER_CHAMBER[state];
    if (!ch) return [];
    return [`${BP_BASE}/${ch}_District_${districtNum}_election,_2026`];
  }

  return [];
}

// ─── HTML parser ─────────────────────────────────────────────────────────────

// Words that appear at the start of non-person Ballotpedia slugs
const SLUG_NON_PERSON = /^(Template:|Category:|File:|Wikipedia:|Help:|Special:|Talk:|User:|Portal:|Draft:|United_States_|List_of_|General_|Poll_|Ballot_|Voting_|Primary_|Runoff_|Independent_|Write-in|Democratic_Party|Republican_Party|Election_|elections?$)/i;

// Words that appear in non-person link text
const NAME_EXCLUDE = /party|election|poll|district|senate|house|congress|general|primary|runoff|ballot|voting|campaign|endorsement|race|seat|term|office|county|city|state\b|representative|governor|mayor|council|incumbent|candidate|nomination/i;

function isPersonName(name) {
  if (!name || name.length < 4 || name.length > 60) return false;
  if (NAME_EXCLUDE.test(name)) return false;
  // Must have at least 2 words
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  // First word should start with an uppercase letter (real first name)
  if (!/^[A-Z]/.test(words[0])) return false;
  return true;
}

function isPersonLink(href, name) {
  if (!href || !href.startsWith("/")) return false;
  const path = href.slice(1);
  if (SLUG_NON_PERSON.test(path)) return false;
  if (/[#?]/.test(path)) return false;
  // Person slugs have at least one underscore (First_Last)
  if (!path.includes("_")) return false;
  // Exclude pure-numeric or very short paths
  if (/^\d+$/.test(path) || path.length < 5) return false;
  // Validate the visible link text looks like a real person name
  if (name && !isPersonName(name)) return false;
  return true;
}

/**
 * Parse a Ballotpedia election overview page and return nominees.
 * Returns array of { name, slug, party }.
 */
function parseElectionPageHtml(html) {
  const $ = cheerio.load(html);
  const nominees = [];
  const seen = new Set();

  // ── Strategy 1: Find "General election" heading, then parse tables after it ─
  let genElSection = null;
  $("h2, h3, h4").each((_, el) => {
    if (/General election/i.test($(el).text())) {
      genElSection = $(el);
      return false; // break
    }
  });

  /**
   * Scan through a Cheerio collection for wikitable rows that contain
   * party information adjacent to candidate links.
   */
  function scanTables($scope) {
    $scope.find("table").each((_, table) => {
      const $tbl = $(table);
      let currentParty = null;

      $tbl.find("tr").each((_, row) => {
        const $row = $(row);
        const rowText = $row.text();

        // Detect party from row text or background colors
        if (/Democrat(?:ic)?/i.test(rowText)) currentParty = "D";
        else if (/Republican/i.test(rowText)) currentParty = "R";

        // Also check for Ballotpedia party-color td/th backgrounds
        const bgCell = $row.find("[style*='background'], [class*='blue'], [class*='red']").first();
        if (bgCell.length) {
          const style = bgCell.attr("style") || "";
          const cls = bgCell.attr("class") || "";
          if (/#[02][04][08][0-9a-f]/i.test(style) || /blue/i.test(cls)) currentParty = "D";
          else if (/#[cC][cC][02][02][02][02]/i.test(style) || /red/i.test(cls)) currentParty = "R";
        }

        if (!currentParty) return; // skip rows with no party context

        // Find candidate links in this row
        $row.find("a[href]").each((_, link) => {
          const href = $(link).attr("href") || "";
          const name = $(link).text().trim();
          if (!isPersonLink(href, name)) return;
          const slug = href.slice(1);
          if (seen.has(slug)) return;
          seen.add(slug);
          nominees.push({ name, slug, party: currentParty });
        });
      });
    });
  }

  if (genElSection) {
    // Collect everything between this heading and the next h2
    const $between = genElSection.nextUntil("h2");
    scanTables($between);
  }

  // ── Strategy 2: If Strategy 1 found nothing, scan all wikitables ────────────
  if (!nominees.length) {
    scanTables($("body"));
  }

  // ── Strategy 3: Broadened link scan with party proximity detection ───────────
  if (!nominees.length) {
    $("a[href]").each((_, link) => {
      const href = $(link).attr("href") || "";
      const name = $(link).text().trim();
      if (!isPersonLink(href, name)) return;
      const slug = href.slice(1);
      if (seen.has(slug)) return;

      // Look at parent elements (up to 3 levels) for party context
      let $el = $(link);
      let party = null;
      for (let i = 0; i < 3 && !party; i++) {
        $el = $el.parent();
        const txt = $el.text();
        if (/Democrat(?:ic)?/i.test(txt)) party = "D";
        else if (/Republican/i.test(txt)) party = "R";
      }
      if (!party) return;
      seen.add(slug);
      nominees.push({ name, slug, party });
    });
  }

  return nominees;
}

// ─── Photo scraper (mirrors the pipeline version) ────────────────────────────

async function fetchPhoto(slug) {
  const url = `${BP_BASE}/${slug.replace(/ /g, "_")}`;
  const html = await fetchPage(url);
  if (!html) return { photo_url: null, ballotpedia_url: url };

  const $ = cheerio.load(html);
  let photo_url = null;
  const img = $(".infobox img, #mw-content-text .infobox img").first();
  let src = img.attr("src") || "";
  if (src) {
    if (src.startsWith("//")) src = `https:${src}`;
    else if (!src.startsWith("http")) src = `${BP_BASE}${src}`;
    photo_url = src;
  }
  return { photo_url, ballotpedia_url: url };
}

// ─── Default geo per state (state capital centroid) ──────────────────────────

const STATE_CAPITALS = {
  AL: { lat: 32.3668, lng: -86.2999, city: "Montgomery, AL" },
  AK: { lat: 58.3005, lng: -134.4197, city: "Juneau, AK" },
  AZ: { lat: 33.4484, lng: -112.0740, city: "Phoenix, AZ" },
  AR: { lat: 34.7465, lng: -92.2896, city: "Little Rock, AR" },
  CA: { lat: 38.5816, lng: -121.4944, city: "Sacramento, CA" },
  CO: { lat: 39.7392, lng: -104.9903, city: "Denver, CO" },
  CT: { lat: 41.7658, lng: -72.6851, city: "Hartford, CT" },
  DE: { lat: 39.1582, lng: -75.5244, city: "Dover, DE" },
  FL: { lat: 30.4383, lng: -84.2807, city: "Tallahassee, FL" },
  GA: { lat: 33.7490, lng: -84.3880, city: "Atlanta, GA" },
  HI: { lat: 21.3069, lng: -157.8583, city: "Honolulu, HI" },
  ID: { lat: 43.6150, lng: -116.2023, city: "Boise, ID" },
  IL: { lat: 39.7983, lng: -89.6544, city: "Springfield, IL" },
  IN: { lat: 39.7684, lng: -86.1581, city: "Indianapolis, IN" },
  IA: { lat: 41.5868, lng: -93.6250, city: "Des Moines, IA" },
  KS: { lat: 39.0483, lng: -95.6780, city: "Topeka, KS" },
  KY: { lat: 38.1867, lng: -84.8753, city: "Frankfort, KY" },
  LA: { lat: 30.4571, lng: -91.1874, city: "Baton Rouge, LA" },
  ME: { lat: 44.3106, lng: -69.7795, city: "Augusta, ME" },
  MD: { lat: 38.9784, lng: -76.4922, city: "Annapolis, MD" },
  MA: { lat: 42.3601, lng: -71.0589, city: "Boston, MA" },
  MI: { lat: 42.7325, lng: -84.5555, city: "Lansing, MI" },
  MN: { lat: 44.9537, lng: -93.0900, city: "Saint Paul, MN" },
  MS: { lat: 32.2988, lng: -90.1848, city: "Jackson, MS" },
  MO: { lat: 38.5767, lng: -92.1735, city: "Jefferson City, MO" },
  MT: { lat: 46.5958, lng: -112.0270, city: "Helena, MT" },
  NE: { lat: 40.8136, lng: -96.7026, city: "Lincoln, NE" },
  NV: { lat: 39.1638, lng: -119.7674, city: "Carson City, NV" },
  NH: { lat: 43.2081, lng: -71.5376, city: "Concord, NH" },
  NJ: { lat: 40.2171, lng: -74.7429, city: "Trenton, NJ" },
  NM: { lat: 35.6870, lng: -105.9378, city: "Santa Fe, NM" },
  NY: { lat: 42.6526, lng: -73.7562, city: "Albany, NY" },
  NC: { lat: 35.7796, lng: -78.6382, city: "Raleigh, NC" },
  ND: { lat: 46.8083, lng: -100.7837, city: "Bismarck, ND" },
  OH: { lat: 39.9612, lng: -82.9988, city: "Columbus, OH" },
  OK: { lat: 35.4676, lng: -97.5164, city: "Oklahoma City, OK" },
  OR: { lat: 44.9429, lng: -123.0351, city: "Salem, OR" },
  PA: { lat: 40.2732, lng: -76.8867, city: "Harrisburg, PA" },
  RI: { lat: 41.8240, lng: -71.4128, city: "Providence, RI" },
  SC: { lat: 34.0007, lng: -81.0348, city: "Columbia, SC" },
  SD: { lat: 44.3683, lng: -100.3510, city: "Pierre, SD" },
  TN: { lat: 36.1627, lng: -86.7816, city: "Nashville, TN" },
  TX: { lat: 30.2672, lng: -97.7431, city: "Austin, TX" },
  UT: { lat: 40.7608, lng: -111.8910, city: "Salt Lake City, UT" },
  VT: { lat: 44.2601, lng: -72.5754, city: "Montpelier, VT" },
  VA: { lat: 37.5407, lng: -77.4360, city: "Richmond, VA" },
  WA: { lat: 47.0379, lng: -122.9007, city: "Olympia, WA" },
  WV: { lat: 38.3498, lng: -81.6326, city: "Charleston, WV" },
  WI: { lat: 43.0747, lng: -89.3841, city: "Madison, WI" },
  WY: { lat: 41.1400, lng: -104.8197, city: "Cheyenne, WY" },
};

function makeGeo(state) {
  const c = STATE_CAPITALS[state] || { lat: 39.5, lng: -98.35, city: "United States" };
  return {
    jurisdiction_name: STATE_FULL[state] || state,
    lat: c.lat,
    lng: c.lng,
    geo_type: "state_capital",
    geo_source: "auto_discover",
    bounding_box: { north: null, south: null, east: null, west: null },
    geojson_point: { type: "Point", coordinates: [c.lng, c.lat] },
  };
}

function initials(name) {
  const parts = (name || "").split(" ").filter((p) => /^[A-Za-z]/.test(p));
  if (!parts.length) return "";
  return (
    (parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function hashCandidate(c) {
  const raw = [c.name, c.office, c.office_level, c.jurisdiction, c.district || "", c.party]
    .map((s) => (s || "").toLowerCase().trim())
    .join("|");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

// Generic platform positions by party (placeholder until manual research is added)
const GENERIC_POLICIES = {
  D: [
    "Expand healthcare access",
    "Climate action & clean energy",
    "Strengthen workers' rights",
    "Public education funding",
    "Protect voting rights",
  ],
  R: [
    "Lower taxes & reduce spending",
    "Secure the border",
    "Second Amendment protections",
    "Deregulation & energy independence",
    "Law and order & public safety",
  ],
};

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Discover 2026 nominees for a single race by scraping Ballotpedia.
 *
 * @param {object} params
 * @param {string} params.state       - 2-letter state abbreviation
 * @param {string} params.raceType    - "us_senate" | "us_house" | "state_senate" | "state_house"
 * @param {number|null} params.districtNum - district number (null for US Senate)
 *
 * @returns {Promise<object[]>} Array of candidate objects ready for MongoDB upsert.
 */
export async function discoverRaceCandidates({ state, raceType, districtNum }) {
  const urls = buildRaceUrls(state, raceType, districtNum);
  if (!urls.length) {
    console.warn(`[RaceScraper] No URL pattern for ${raceType} ${state} ${districtNum}`);
    return [];
  }

  // Try each URL variant until one works
  let nominees = [];
  for (const url of urls) {
    console.log(`[RaceScraper] Trying: ${url}`);
    const html = await fetchPage(url);
    if (html) {
      nominees = parseElectionPageHtml(html);
      if (nominees.length) break;
    }
  }

  if (!nominees.length) {
    console.log(`[RaceScraper] No nominees found for ${raceType} ${state}-${districtNum}`);
    return [];
  }

  // Deduplicate by slug — keep first occurrence
  const seenSlugs = new Set();
  nominees = nominees.filter(({ slug }) => {
    if (seenSlugs.has(slug)) return false;
    seenSlugs.add(slug);
    return true;
  });

  // Limit to max 2 per party (guard against parsing noise)
  const partyCount = { D: 0, R: 0 };
  nominees = nominees.filter(({ party }) => {
    if (!partyCount[party] && partyCount[party] !== 0) return true;
    if (partyCount[party] >= 2) return false;
    partyCount[party]++;
    return true;
  });

  // Build race metadata
  const stateFull = STATE_FULL[state] || state;
  const raceMeta = {
    us_senate:    { office: "U.S. Senate",   office_level: "federal", district: null },
    us_house:     { office: "U.S. House",    office_level: "federal", district: `${state}-${districtNum}` },
    state_senate: { office: "State Senate",  office_level: "state",   district: `SD-${districtNum}` },
    state_house:  { office: "State House",   office_level: "state",   district: `HD-${districtNum}` },
  }[raceType];

  if (!raceMeta) return [];

  const now = new Date();
  const candidates = [];

  for (const nominee of nominees) {
    console.log(`  [RaceScraper] Fetching photo for ${nominee.name} (${nominee.party})…`);
    const { photo_url, ballotpedia_url } = await fetchPhoto(nominee.slug);

    const officeLabel = raceMeta.office + (raceMeta.district ? ` ${raceMeta.district}` : "");
    const candidate = {
      name: nominee.name,
      office: officeLabel,
      office_level: raceMeta.office_level,
      jurisdiction: stateFull,
      state,
      district: raceMeta.district,
      party: nominee.party,
      incumbent: null,
      filing_date: null,
      geo: makeGeo(state),
      home_city: STATE_CAPITALS[state]?.city || `${state}`,
      policies: GENERIC_POLICIES[nominee.party] || [],
      photo: {
        url: photo_url || null,
        source: photo_url ? "ballotpedia" : null,
        verified: Boolean(photo_url),
        last_fetched: now,
        fallback_initials: initials(nominee.name),
      },
      zip_codes: [],
      district_zip_map: { state, district: raceMeta.district, zip_codes: [] },
      source_url: ballotpedia_url,
      source_name: "Ballotpedia (auto-discovered)",
      last_verified: now,
      status_2026: "nominee",
      data_hash: "",
    };
    candidate.data_hash = hashCandidate(candidate);
    candidates.push(candidate);
  }

  return candidates;
}
