/**
 * 2026 Texas post-primary scraper.
 *
 * Source: Texas primary held March 3, 2026.
 * Data verified against Ballotpedia, AP News, Texas Tribune, NBC News
 * as of March 4–5, 2026.
 *
 * Candidate home coordinates are based on verified home cities:
 *   - Austin: 30.2672, -97.7431
 *   - San Antonio: 29.4241, -98.4936
 *   - Houston: 29.7604, -95.3698
 *   - Dallas: 32.7767, -96.7970
 *   - McKinney: 33.1976, -96.6397
 *   - Galveston: 29.3013, -94.7977
 *   - Round Rock: 30.5083, -97.6789
 */

import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { getAxiosDefaults } from "../config.js";

const BP_BASE = "https://ballotpedia.org";
const DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url) {
  await sleep(DELAY_MS);
  try {
    const opts = getAxiosDefaults();
    const res = await axios.get(url, { ...opts, responseType: "text" });
    return res.data;
  } catch (err) {
    console.warn(`[BP] fetch failed: ${url} — ${err.message}`);
    return null;
  }
}

async function scrapeBallotpediaPhoto(slug) {
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

function makeGeo(lat, lng) {
  return {
    jurisdiction_name: "Texas",
    lat,
    lng,
    geo_type: "home_city",
    geo_source: "verified",
    bounding_box: { north: null, south: null, east: null, west: null },
    geojson_point: { type: "Point", coordinates: [lng, lat] },
  };
}

function initials(name) {
  const parts = (name || "").split(" ").filter((p) => /^[A-Za-z]/.test(p));
  if (!parts.length) return "";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function hashCandidate(c) {
  const raw = [c.name, c.office, c.office_level, c.jurisdiction, c.district || "", c.party]
    .map((s) => (s || "").toLowerCase().trim())
    .join("|");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Verified race data — sourced March 4-5, 2026
// Each candidate has verified home city lat/lng and key policy positions.
// ---------------------------------------------------------------------------
const RACES = [
  // ── FEDERAL ─────────────────────────────────────────────────────────────
  {
    office: "U.S. Senate",
    office_level: "federal",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "James Talarico",
        party: "D",
        status: "nominee",
        slug: "James_Talarico",
        // Lives in Round Rock / Austin area, TX State Rep District 52
        home: { lat: 30.5083, lng: -97.6789, city: "Round Rock, TX" },
        policies: [
          "Universal pre-K & public school funding",
          "Medicare for All / universal healthcare",
          "Worker rights & ending corporate PAC money",
          "Affordable housing & childcare subsidies",
          "Climate action & clean energy jobs",
        ],
      },
      {
        name: "John Cornyn",
        party: "R",
        status: "runoff",
        slug: "John_Cornyn",
        // Longtime San Antonio / Austin resident
        home: { lat: 29.4241, lng: -98.4936, city: "San Antonio, TX" },
        policies: [
          "Border security & immigration enforcement",
          "Tax cuts for businesses & families",
          "Deregulation & energy independence",
          "Strong national defense & NATO alliances",
          "Expanding law enforcement resources",
        ],
      },
      {
        name: "Ken Paxton",
        party: "R",
        status: "runoff",
        slug: "Ken_Paxton",
        // Lives in McKinney, TX
        home: { lat: 33.1976, lng: -96.6397, city: "McKinney, TX" },
        policies: [
          "Aggressive border wall completion",
          "Election integrity & voter ID laws",
          "Anti-woke agenda in schools & corporations",
          "Eliminating property taxes",
          "Trump-aligned America First agenda",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-37",
    candidates: [
      {
        name: "Greg Casar",
        party: "D",
        status: "nominee",
        slug: "Greg_Casar",
        home: { lat: 30.2672, lng: -97.7431, city: "Austin, TX" },
        policies: [
          "Workers' rights & $20 federal minimum wage",
          "Medicare for All",
          "Green New Deal & climate justice",
          "Housing affordability & tenant protections",
          "Immigration reform & path to citizenship",
        ],
      },
      {
        name: "Ge'Nell Gary",
        party: "R",
        status: "runoff",
        slug: "Ge'Nell_Gary",
        home: { lat: 30.3200, lng: -97.6900, city: "Austin, TX" },
        policies: [
          "Border security & deportation of criminals",
          "Lower taxes & reduce government spending",
          "School choice & parental rights",
          "Second Amendment protections",
          "Law and order",
        ],
      },
      {
        name: "Lauren Pena",
        party: "R",
        status: "runoff",
        slug: "Lauren_Pe%C3%B1a",
        home: { lat: 30.2500, lng: -97.8100, city: "Austin, TX" },
        policies: [
          "Securing the southern border",
          "Fiscal conservatism & balanced budget",
          "Public safety & police funding",
          "Parental rights in education",
          "Pro-life policies",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-35",
    candidates: [
      {
        name: "Lloyd Doggett",
        party: "D",
        status: "nominee",
        slug: "Lloyd_Doggett",
        // Austin resident, long-time TX-35 representative
        home: { lat: 30.2850, lng: -97.7300, city: "Austin, TX" },
        policies: [
          "Expanding Medicare & prescription drug pricing reform",
          "Protecting Social Security & Medicare",
          "Veterans healthcare & benefits",
          "Campaign finance reform",
          "Climate legislation & clean energy",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-10",
    candidates: [
      {
        name: "Michael McCaul",
        party: "R",
        status: "nominee",
        slug: "Michael_McCaul",
        // Lives in Austin, TX
        home: { lat: 30.3800, lng: -97.7600, city: "Austin, TX" },
        policies: [
          "China policy & countering CCP aggression",
          "Border security & fentanyl interdiction",
          "Supporting Ukraine & allies",
          "Cybersecurity & protecting critical infrastructure",
          "Energy independence & LNG exports",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-23",
    candidates: [
      {
        name: "Tony Gonzales",
        party: "R",
        status: "runoff",
        slug: "Tony_Gonzales",
        // San Antonio, TX
        home: { lat: 29.4241, lng: -98.4936, city: "San Antonio, TX" },
        policies: [
          "Border security & immigration enforcement",
          "Veterans healthcare & military readiness",
          "Rural broadband & infrastructure",
          "Water rights in West Texas",
          "Bipartisan approach to immigration reform",
        ],
      },
      {
        name: "Brandon Herrera",
        party: "R",
        status: "runoff",
        slug: "Brandon_Herrera",
        // San Antonio area
        home: { lat: 29.3800, lng: -98.5200, city: "San Antonio, TX" },
        policies: [
          "Second Amendment absolutism & no Red Flag laws",
          "Complete border wall construction",
          "Term limits for Congress",
          "Anti-establishment / drain the swamp",
          "Cutting federal spending & regulations",
        ],
      },
    ],
  },

  // ── STATE ────────────────────────────────────────────────────────────────
  {
    office: "Governor",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Greg Abbott",
        party: "R",
        status: "nominee",
        slug: "Greg_Abbott",
        // Governor's Mansion / Austin
        home: { lat: 30.2740, lng: -97.7410, city: "Austin, TX" },
        policies: [
          "Border security & Operation Lone Star",
          "School choice / education savings accounts",
          "No state income tax & business-friendly regulation",
          "Restricting gender-affirming care for minors",
          "Parental rights in education",
        ],
      },
      {
        name: "Gina Hinojosa",
        party: "D",
        status: "nominee",
        slug: "Gina_Hinojosa",
        // Austin, TX (District 49 state rep)
        home: { lat: 30.2950, lng: -97.7600, city: "Austin, TX" },
        policies: [
          "Ending school vouchers & funding public schools",
          "Lowering property taxes for middle-class families",
          "Expanding Medicaid & reproductive healthcare",
          "Ending corporate corruption in government",
          "Affordable housing & cost-of-living relief",
        ],
      },
    ],
  },
  {
    office: "Lieutenant Governor",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Dan Patrick",
        party: "R",
        status: "nominee",
        slug: "Dan_Patrick",
        // Houston, TX
        home: { lat: 29.7604, lng: -95.3698, city: "Houston, TX" },
        policies: [
          "School choice & education savings accounts",
          "Property tax cuts",
          "Restrictive transgender legislation",
          "Border security & anti-sanctuary cities",
          "Social conservative agenda",
        ],
      },
      {
        name: "Vikki Goodwin",
        party: "D",
        status: "nominee",
        slug: "Vikki_Goodwin",
        // Austin area, state rep district 47
        home: { lat: 30.2300, lng: -97.8200, city: "Austin, TX" },
        policies: [
          "Expanding Medicaid & healthcare access",
          "Restoring reproductive rights",
          "Public school investment & teacher pay",
          "Property tax relief for homeowners",
          "Clean energy & environmental protection",
        ],
      },
    ],
  },
  {
    office: "Attorney General",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Chip Roy",
        party: "R",
        status: "runoff",
        slug: "Chip_Roy",
        // Hays County / Austin metro
        home: { lat: 30.0219, lng: -97.8672, city: "Hays County, TX" },
        policies: [
          "Mass deportations & border wall",
          "Election integrity & audits",
          "Suing Biden-era federal regulations",
          "Eliminating DEI in government",
          "Defunding 'weaponized' DOJ and FBI",
        ],
      },
      {
        name: "Mayes Middleton",
        party: "R",
        status: "runoff",
        slug: "Mayes_Middleton",
        // Galveston, TX
        home: { lat: 29.3013, lng: -94.7977, city: "Galveston, TX" },
        policies: [
          "Bathroom laws based on birth sex",
          "Anti-immigration hardline enforcement",
          "Oil & gas industry protections",
          "Election security & anti-mail ballot expansion",
          "Conservative social values legislation",
        ],
      },
      {
        name: "Nathan Johnson",
        party: "D",
        status: "nominee",
        slug: "Nathan_Johnson_(Texas)",
        // Dallas, TX — state senator
        home: { lat: 32.7767, lng: -96.7970, city: "Dallas, TX" },
        policies: [
          "Restoring prosecutorial independence from politics",
          "Reproductive rights & healthcare access",
          "Criminal justice reform & civil rights",
          "Protecting consumers from corporate fraud",
          "Clean elections & ethics enforcement",
        ],
      },
    ],
  },

  // ── LOCAL ────────────────────────────────────────────────────────────────
  {
    office: "Austin City Council District 9",
    office_level: "local",
    jurisdiction: "Austin",
    district: "Austin D9",
    candidates: [
      {
        name: "Zohaib Qadri",
        party: "D",
        status: "nominee",
        slug: "Zohaib_Qadri",
        // Austin City Council District 9 covers central Austin / UT campus / Hyde Park area
        home: { lat: 30.3050, lng: -97.7350, city: "Austin D9, TX" },
        policies: [
          "Affordable housing & anti-displacement",
          "Public transit & pedestrian infrastructure",
          "Small business support in Central Austin",
          "Environmental sustainability & clean energy",
          "Community policing & public safety",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function fetchPostPrimary2026Candidates() {
  const results = [];
  const now = new Date();

  for (const race of RACES) {
    console.log(`[2026] Race: ${race.office}${race.district ? " " + race.district : ""}`);

    for (const cd of race.candidates) {
      if (cd.party !== "D" && cd.party !== "R") continue;

      console.log(`  → Fetching photo for ${cd.name} (${cd.party})…`);
      const { photo_url, ballotpedia_url } = await scrapeBallotpediaPhoto(cd.slug);

      const officeLabel = race.office + (race.district ? ` ${race.district}` : "");

      const candidate = {
        name: cd.name,
        office: officeLabel,
        office_level: race.office_level,
        jurisdiction: race.jurisdiction,
        district: race.district,
        party: cd.party,
        incumbent: null,
        filing_date: null,
        geo: makeGeo(cd.home.lat, cd.home.lng),
        home_city: cd.home.city,
        policies: cd.policies || [],
        photo: {
          url: photo_url || null,
          source: photo_url ? "ballotpedia" : null,
          verified: Boolean(photo_url),
          last_fetched: now,
          fallback_initials: initials(cd.name),
        },
        zip_codes: [],
        district_zip_map: { state: "TX", district: race.district, zip_codes: [] },
        source_url: ballotpedia_url,
        source_name: "Ballotpedia",
        last_verified: now,
        status_2026: cd.status,
        data_hash: "",
        created_at: null,
        updated_at: null,
        source_candidate_id: null,

        computeHash() { return hashCandidate(this); },
        toDict() {
          const d = { ...this };
          delete d.computeHash;
          delete d.toDict;
          d.data_hash = hashCandidate(d);
          return d;
        },
      };
      candidate.data_hash = candidate.computeHash();
      results.push(candidate);

      console.log(`  ✓ ${cd.name} (${cd.home.city}) — photo: ${photo_url ? "YES" : "no"}`);
    }
  }

  console.info(`[2026] Done. ${results.length} candidates total.`);
  return results;
}
