/**
 * seedLocalTX.mjs — Seed Texas 2026 local (city) elections into MongoDB.
 *
 * Covers mayoral and city council races for:
 *   - Austin (Districts 1, 3, 5, 8, 9 — Nov 3, 2026)
 *   - Houston (District C special — Apr 4, 2026)
 *   - Arlington (Mayor + Districts 3, 4, 5, 8 — May 2, 2026)
 *   - Frisco (Mayor + Council Places 5, 6 — May 2, 2026)
 *   - Fort Worth (District 10 special — May 2, 2026)
 *
 * All candidate data sourced from official city filings, Ballotpedia,
 * and local news coverage (Community Impact, KXAN, Houston Public Media,
 * Fort Worth Report, KERA News, Local Profile).
 *
 * Usage:
 *   node seedLocalTX.mjs
 *
 * Idempotent — uses $setOnInsert so re-runs won't overwrite existing records.
 */

import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import { connectDB, getCandidatesCollection } from "./db.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function makeGeo(lat, lng, cityName) {
  return {
    jurisdiction_name: cityName,
    lat,
    lng,
    geo_type: "city_center",
    geo_source: "manual_research",
    bounding_box: { north: null, south: null, east: null, west: null },
    geojson_point: { type: "Point", coordinates: [lng, lat] },
  };
}

function buildLocalDoc({
  name,
  office,
  officeType,
  city,
  cityState,
  district,
  party,
  lat,
  lng,
  policies,
  sourceUrl,
  sourceName,
  status2026 = "nominee",
}) {
  const now = new Date();
  const doc = {
    name,
    office,
    office_level: "city",
    jurisdiction: city,
    state: "TX",
    district: district || null,
    party,
    incumbent: null,
    filing_date: null,
    geo: makeGeo(lat, lng, city),
    home_city: cityState,
    policies: policies || [],
    photo: {
      url: null,
      source: null,
      verified: false,
      last_fetched: null,
      fallback_initials: initials(name),
    },
    zip_codes: [],
    district_zip_map: { state: "TX", district: district || null, zip_codes: [] },
    source_url: sourceUrl || null,
    source_name: sourceName || "Local election filing",
    last_verified: now,
    status_2026: status2026,
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
      { upsert: true },
    );
    return r.upsertedCount > 0;
  } catch (err) {
    console.warn(`  [LocalSeeder] DB error for ${doc.name}: ${err.message}`);
    return false;
  }
}

// ── City coordinates ────────────────────────────────────────────────────────

const CITIES = {
  Austin:    { lat: 30.2672, lng: -97.7431, state: "Austin, TX" },
  Houston:   { lat: 29.7604, lng: -95.3698, state: "Houston, TX" },
  Arlington: { lat: 32.7357, lng: -97.1081, state: "Arlington, TX" },
  Frisco:    { lat: 33.1507, lng: -96.8236, state: "Frisco, TX" },
  FortWorth: { lat: 32.7555, lng: -97.3308, state: "Fort Worth, TX" },
};

// ── Candidate Data ──────────────────────────────────────────────────────────
// All data sourced from official filings, Ballotpedia, and local news.
// Flags: [INCOMPLETE] marks candidates with limited public info.

const LOCAL_CANDIDATES = [

  // ═══════════════════════════════════════════════════════════════════════════
  // AUSTIN — City Council Elections — November 3, 2026
  // Filing deadline: August 17, 2026. Some candidates filed early.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Austin District 1 (open seat — Harper-Madison term-limited) ──────────
  {
    name: "Steven Brown",
    office: "Austin City Council District 1",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 1",
    party: "D",
    lat: 30.2849,
    lng: -97.7128,
    policies: [
      "Environmental justice and protection for East Austin communities",
      "Housing affordability and anti-displacement measures",
      "Accountability in city spending and public services",
      "Protect residential neighborhoods from overdevelopment",
      "Racial equity in hiring and public safety",
    ],
    sourceUrl: "https://stevenbrownford1atx.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Alexandria Anderson",
    office: "Austin City Council District 1",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 1",
    party: "D",
    lat: 30.2900,
    lng: -97.7050,
    policies: [
      "Community health and youth fitness programs",
      "Small business support for East Austin entrepreneurs",
      "Affordable housing preservation",
      "Public safety through community investment",
      "Parks and recreation access for underserved neighborhoods",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Austin District 3 (incumbent José Velásquez, unopposed so far) ──────
  {
    name: "José Velásquez",
    office: "Austin City Council District 3",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 3",
    party: "D",
    lat: 30.2100,
    lng: -97.7350,
    policies: [
      "Expand affordable housing in South and East Austin",
      "Improve public transit connectivity",
      "Support small businesses and local workforce development",
      "Flood mitigation and infrastructure improvements",
      "Increase access to healthcare and social services",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Austin District 5 (incumbent Ryan Alter) ────────────────────────────
  {
    name: "Ryan Alter",
    office: "Austin City Council District 5",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 5",
    party: "D",
    lat: 30.2200,
    lng: -97.8000,
    policies: [
      "Housing affordability through increased supply",
      "Public transit expansion including Project Connect",
      "Climate resilience and clean energy investment",
      "Fiscal responsibility and transparent budgeting",
      "Support for Austin's creative economy",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "David Weinberg",
    office: "Austin City Council District 5",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 5",
    party: "D",
    lat: 30.2150,
    lng: -97.8100,
    policies: [
      "Strengthen neighborhood-level public safety",
      "Address housing costs through zoning reform",
      "Invest in South Austin infrastructure and roads",
      "Support public education and workforce programs",
      "Expand parks and green space access",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Austin District 8 (incumbent Paige Ellis seeking 3rd term) ──────────
  {
    name: "Paige Ellis",
    office: "Austin City Council District 8",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 8",
    party: "D",
    lat: 30.1900,
    lng: -97.8600,
    policies: [
      "Climate action and environmental sustainability",
      "Wildfire prevention and emergency preparedness",
      "Transportation infrastructure for Southwest Austin",
      "Affordable housing and anti-displacement policy",
      "Water quality and Barton Springs protection",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Selena Xie",
    office: "Austin City Council District 8",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 8",
    party: "D",
    lat: 30.1950,
    lng: -97.8500,
    policies: [
      "Public safety through first responder experience and EMS investment",
      "Housing affordability with anti-displacement protections",
      "Transportation infrastructure in Southwest Austin",
      "Stronger constituent services and community communication",
      "Negotiate harder with developers for community concessions",
    ],
    sourceUrl: "https://selenaforaustin.com/",
    sourceName: "Campaign website",
  },

  // ── Austin District 9 (incumbent Zo Qadri) ─────────────────────────────
  {
    name: "Zo Qadri",
    office: "Austin City Council District 9",
    officeType: "city_council",
    city: "Austin",
    cityState: "Austin, TX",
    district: "Austin District 9",
    party: "D",
    lat: 30.2750,
    lng: -97.7500,
    policies: [
      "Expand affordable housing stock in Central Austin",
      "Public safety and police accountability reform",
      "Support creative arts and live music venues",
      "Climate and sustainability initiatives",
      "Pedestrian safety and bike infrastructure",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Austin,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HOUSTON — District C Special Election — April 4, 2026
  // Replacing Abbie Kamin. Seven candidates on ballot.
  // Source: Houston Public Media, Community Impact
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "Sophia Campos",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7800,
    lng: -95.3950,
    policies: [
      "Revenue increases for city services including garbage fee reform",
      "Rehousing residents at Life at Jackson Square",
      "Prioritize public education and youth programs",
      "Honest dialogue with Mayor Whitmire on budget",
      "Community investment in Heights and Montrose neighborhoods",
    ],
    sourceUrl: "https://sophiafordistrictc.org/",
    sourceName: "Campaign website",
  },
  {
    name: "Laura Gallier",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7750,
    lng: -95.4000,
    policies: [
      "Public safety through better lighting, sidewalks, and trash service",
      "Fiscal accountability before raising taxes",
      "Oppose blanket police budget increases",
      "Infrastructure maintenance in aging neighborhoods",
      "Transparent city spending and budget oversight",
    ],
    sourceUrl: "https://lauraforhouston.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Nick Hellyar",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7700,
    lng: -95.4100,
    policies: [
      "Flood mitigation especially in Meyerland area",
      "Strong working relationship with Mayor Whitmire",
      "Budget expertise and fiscal responsibility",
      "Infrastructure investment for District C neighborhoods",
      "Public safety and neighborhood protection",
    ],
    sourceUrl: "https://nickforhouston.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Angelica Luna Kaufman",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7650,
    lng: -95.3900,
    policies: [
      "Flood control and drainage project funding",
      "Oppose Montrose TIRZ board overhaul",
      "Work across political divides on city issues",
      "Neighborhood preservation and smart development",
      "Public safety and emergency preparedness",
    ],
    sourceUrl: "https://angelicaforhouston.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Audrey Nath",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7600,
    lng: -95.3850,
    policies: [
      "Pedestrian safety and walkable streets",
      "Flood mitigation infrastructure investment",
      "Oppose cuts to parks and recreation budget",
      "Public health access through community clinics",
      "Environmental protection and climate resilience",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Houston,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Patrick Oathout",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7550,
    lng: -95.3950,
    policies: [
      "Disaster planning and emergency preparedness",
      "Pedestrian safety and Vision Zero implementation",
      "Seven-year fiscal sustainability plan for Houston",
      "Cost reductions before any property tax increases",
      "AI safety and technology modernization for city services",
    ],
    sourceUrl: "https://patrickforhouston.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Joe Panzarella",
    office: "Houston City Council District C",
    officeType: "city_council",
    city: "Houston",
    cityState: "Houston, TX",
    district: "Houston District C",
    party: "D",
    lat: 29.7850,
    lng: -95.3800,
    policies: [
      "Street safety and walkability improvements",
      "Housing affordability and tenant protections",
      "Revenue increases over service cuts",
      "Rethink police and fire budget allocations",
      "Renewable energy and sustainable infrastructure",
    ],
    sourceUrl: "https://joeforhouston.com/",
    sourceName: "Campaign website",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ARLINGTON — Mayor + City Council — May 2, 2026
  // Source: Fort Worth Report, KERA News, Ballotpedia
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Arlington Mayor ─────────────────────────────────────────────────────
  {
    name: "Jim Ross",
    office: "Mayor of Arlington",
    officeType: "mayor",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: null,
    party: "R",
    lat: 32.7357,
    lng: -97.1081,
    policies: [
      "Public safety and police force expansion",
      "Economic development and entertainment district growth",
      "Property tax stability for homeowners",
      "Infrastructure investment in roads and utilities",
      "Veterans affairs and military community support",
    ],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Hunter Crow",
    office: "Mayor of Arlington",
    officeType: "mayor",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: null,
    party: "D",
    lat: 32.7357,
    lng: -97.1081,
    policies: [
      "Expand public transit options for Arlington",
      "Affordable housing and workforce development",
      "Police reform and community-oriented public safety",
      "Environmental sustainability and green infrastructure",
      "Increased civic engagement and government transparency",
    ],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Steve Cavender",
    office: "Mayor of Arlington",
    officeType: "mayor",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: null,
    party: "R",
    lat: 32.7357,
    lng: -97.1081,
    policies: [
      "Address city budget shortfall and reduce property tax increases",
      "Strengthen Arlington entertainment district economy",
      "Medal of Honor Museum and veterans community support",
      "Fiscal responsibility in city spending",
      "Infrastructure maintenance and flood prevention",
    ],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Arlington District 3 ───────────────────────────────────────────────
  {
    name: "Nikkie Hunter",
    office: "Arlington City Council District 3",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 3",
    party: "R",
    lat: 32.7200,
    lng: -97.0800,
    policies: [
      "Neighborhood safety and code enforcement",
      "Road and infrastructure maintenance",
      "Support small businesses and local economy",
      "Responsible city budget management",
      "Parks and recreation improvements",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Kelly Burke",
    office: "Arlington City Council District 3",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 3",
    party: "D",
    lat: 32.7250,
    lng: -97.0750,
    policies: [
      "Community investment in District 3 neighborhoods",
      "Improved public services and infrastructure",
      "Government transparency and accountability",
      "Support for local schools and education",
      "Environmental stewardship",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Arlington District 4 (open seat — Piel term-limited) ──────────────
  {
    name: "Tom Ware",
    office: "Arlington City Council District 4",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 4",
    party: "R",
    lat: 32.7500,
    lng: -97.1300,
    policies: [
      "Public safety and police staffing",
      "Property tax relief for homeowners",
      "Infrastructure investment in District 4",
      "Economic development and job creation",
      "Neighborhood preservation",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Lisa Ventura",
    office: "Arlington City Council District 4",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 4",
    party: "D",
    lat: 32.7550,
    lng: -97.1250,
    policies: [
      "Affordable housing and tenant protections",
      "Community health and social services",
      "Public transit and walkability improvements",
      "Youth programs and education support",
      "Environmental sustainability",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Rojo Meixueiro",
    office: "Arlington City Council District 4",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 4",
    party: "D",
    lat: 32.7450,
    lng: -97.1350,
    policies: [
      "Community engagement and bilingual outreach",
      "Affordable housing in North Arlington",
      "Support local small businesses",
      "Infrastructure and road improvements",
      "Parks and recreation access for all residents",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Arlington District 5 ───────────────────────────────────────────────
  {
    name: "Rebecca Boxall",
    office: "Arlington City Council District 5",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 5",
    party: "R",
    lat: 32.7100,
    lng: -97.1200,
    policies: [
      "Public safety and neighborhood watch programs",
      "Responsible fiscal management",
      "Infrastructure and drainage improvements",
      "Support entertainment district economic growth",
      "Quality of life improvements for South Arlington",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Brittney Garcia-Dumas",
    office: "Arlington City Council District 5",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 5",
    party: "D",
    lat: 32.7150,
    lng: -97.1150,
    policies: [
      "Youth engagement and education programs",
      "Community-oriented policing",
      "Affordable housing for working families",
      "Parks and green space expansion",
      "Government transparency and public accountability",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ── Arlington District 8 (open seat — Odom-Wesley term-limited) ───────
  {
    name: "Melody Fowler",
    office: "Arlington City Council District 8",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 8",
    party: "R",
    lat: 32.6900,
    lng: -97.0900,
    policies: [
      "Public safety and emergency services",
      "Senior services and aging-in-place support",
      "Infrastructure repair and maintenance",
      "Responsible property tax management",
      "Community engagement and neighborhood events",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Corey Harris",
    office: "Arlington City Council District 8",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 8",
    party: "D",
    lat: 32.6950,
    lng: -97.0850,
    policies: [
      "Economic opportunity and workforce training",
      "Public safety and community policing",
      "Affordable housing in East Arlington",
      "Youth mentorship and education investment",
      "Parks and recreation funding",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Jason Shelton",
    office: "Arlington City Council District 8",
    officeType: "city_council",
    city: "Arlington",
    cityState: "Arlington, TX",
    district: "Arlington District 8",
    party: "D",
    lat: 32.6880,
    lng: -97.0950,
    policies: [
      "Community development and blight reduction",
      "Public safety and first responder support",
      "Infrastructure investment for underserved areas",
      "Transparent government and community input",
      "Small business support and local economic growth",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Arlington,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FRISCO — Mayor + City Council — May 2, 2026
  // Source: Local Profile, Community Impact, Star Local Media
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Frisco Mayor (open seat — Jeff Cheney term-limited) ────────────────
  {
    name: "John Keating",
    office: "Mayor of Frisco",
    officeType: "mayor",
    city: "Frisco",
    cityState: "Frisco, TX",
    district: null,
    party: "R",
    lat: 33.1507,
    lng: -96.8236,
    policies: [
      "Disciplined fiscal management without property tax increases",
      "Smart public-private partnerships for development",
      "Infrastructure planning aligned with growth",
      "Public safety investment and service sustainability",
      "Quality of life as a full-life-cycle city for all generations",
    ],
    sourceUrl: "https://keatingforfrisco.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Mark Hill",
    office: "Mayor of Frisco",
    officeType: "mayor",
    city: "Frisco",
    cityState: "Frisco, TX",
    district: null,
    party: "R",
    lat: 33.1507,
    lng: -96.8236,
    policies: [
      "Responsible growth management that protects neighborhoods",
      "Strengthen public safety amid population growth",
      "Education-centered community building through Frisco ISD",
      "Fiscal discipline and infrastructure investment",
      "Professional, collaborative leadership free from political rivalries",
    ],
    sourceUrl: "https://markhill4mayor.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Shona Sowell",
    office: "Mayor of Frisco",
    officeType: "mayor",
    city: "Frisco",
    cityState: "Frisco, TX",
    district: null,
    party: "R",
    lat: 33.1507,
    lng: -96.8236,
    policies: [
      "Long-term financial sustainability and aging infrastructure planning",
      "Reserve development incentives for high-paying jobs only",
      "Equitable development across all Frisco neighborhoods",
      "Assess long-term maintenance costs before approving projects",
      "Better, not bigger — strategic growth over rapid expansion",
    ],
    sourceUrl: "https://shonaforfrisco.com/",
    sourceName: "Campaign website",
  },
  {
    name: "Rod Vilhauer",
    office: "Mayor of Frisco",
    officeType: "mayor",
    city: "Frisco",
    cityState: "Frisco, TX",
    district: null,
    party: "R",
    lat: 33.1507,
    lng: -96.8236,
    policies: [
      "Manage growth while maintaining quality of life",
      "Property tax management for homeowners",
      "Public safety and emergency services",
      "Transportation and road infrastructure",
      "Community engagement and resident input",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Frisco,_Texas_(2026)",
    sourceName: "Ballotpedia",
    // [INCOMPLETE] Limited policy details available for this candidate
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FORT WORTH — District 10 Special Election — May 2, 2026
  // Replacing Alan Blaylock (departing for TX House race)
  // Source: KERA News, Fort Worth Report
  // ═══════════════════════════════════════════════════════════════════════════

  {
    name: "Chris Jamieson",
    office: "Fort Worth City Council District 10",
    officeType: "city_council",
    city: "Fort Worth",
    cityState: "Fort Worth, TX",
    district: "Fort Worth District 10",
    party: "R",
    lat: 32.8200,
    lng: -97.2600,
    policies: [
      "Entrepreneurship and small business growth",
      "Public safety and neighborhood security",
      "Infrastructure and road improvements",
      "Responsible city budget management",
      "Economic development for North Fort Worth",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Fort_Worth,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
  {
    name: "Alicia Ortiz",
    office: "Fort Worth City Council District 10",
    officeType: "city_council",
    city: "Fort Worth",
    cityState: "Fort Worth, TX",
    district: "Fort Worth District 10",
    party: "D",
    lat: 32.8150,
    lng: -97.2650,
    policies: [
      "Community engagement and constituent services",
      "Affordable housing and workforce development",
      "Public safety and first responder support",
      "Parks and recreation improvements",
      "Government transparency and accountability",
    ],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Fort_Worth,_Texas_(2026)",
    sourceName: "Ballotpedia",
  },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== PolicyMarket TX Local Elections Seeder ===\n");

  try {
    await connectDB();
    console.log("Connected to MongoDB.\n");

    let saved = 0;
    let skipped = 0;

    for (const c of LOCAL_CANDIDATES) {
      const doc = buildLocalDoc(c);
      const inserted = await upsertDoc(doc);
      if (inserted) {
        saved++;
        console.log(`  ✓ ${c.name} — ${c.office}`);
      } else {
        skipped++;
        console.log(`  · ${c.name} — already exists`);
      }
    }

    console.log(`\n=== Seeding complete ===`);
    console.log(`  Total candidates: ${LOCAL_CANDIDATES.length}`);
    console.log(`  Inserted:         ${saved}`);
    console.log(`  Already existed:  ${skipped}`);

    // Clear the API cache so new local candidates appear immediately
    const { getApiCacheCollection } = await import("./db.js");
    const apiCache = getApiCacheCollection();
    const deleted = await apiCache.deleteMany({});
    console.log(`  API cache cleared: ${deleted.deletedCount} entries removed`);

    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exit(1);
  }
}

main();
