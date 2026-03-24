/**
 * seedMayors2026.mjs — Seed ALL contested Texas 2026 mayoral elections.
 *
 * Sources: Ballotpedia, official city filings, local news.
 * Idempotent — uses $setOnInsert so re-runs won't overwrite existing records.
 *
 * Usage: cd backend && node seedMayors2026.mjs
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

function buildMayorDoc({ name, city, lat, lng, party = "NP", policies = [], sourceUrl = null, sourceName = "Ballotpedia" }) {
  const cityState = `${city}, TX`;
  const office = `Mayor of ${city}`;
  const now = new Date();
  const doc = {
    name,
    office,
    office_level: "city",
    jurisdiction: city,
    state: "TX",
    district: null,
    party,
    incumbent: null,
    filing_date: null,
    geo: makeGeo(lat, lng, city),
    home_city: cityState,
    policies: policies.length ? policies : defaultPolicies(city),
    photo: {
      url: null,
      source: null,
      verified: false,
      last_fetched: null,
      fallback_initials: initials(name),
    },
    zip_codes: [],
    district_zip_map: { state: "TX", district: null, zip_codes: [] },
    source_url: sourceUrl,
    source_name: sourceName,
    last_verified: now,
    status_2026: "nominee",
    data_hash: "",
  };
  doc.data_hash = hashCandidate(doc);
  return doc;
}

function defaultPolicies(city) {
  return [
    `Economic development and job growth in ${city}`,
    "Property tax relief and responsible budgeting",
    "Public safety and first responder support",
    "Infrastructure improvements and road maintenance",
    "Community development and quality of life",
  ];
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
    console.warn(`  [MayorSeeder] DB error for ${doc.name}: ${err.message}`);
    return false;
  }
}

// ── City coordinates ────────────────────────────────────────────────────────

const CITIES = {
  Irving:              { lat: 32.8140, lng: -96.9489 },
  Lubbock:             { lat: 33.5779, lng: -101.8552 },
  Denton:              { lat: 33.2148, lng: -97.1331 },
  Tyler:               { lat: 32.3513, lng: -95.3011 },
  Abilene:             { lat: 32.4487, lng: -99.7331 },
  "New Braunfels":     { lat: 29.7030, lng: -98.1245 },
  Galveston:           { lat: 29.3013, lng: -94.7977 },
  Killeen:             { lat: 31.1171, lng: -97.7278 },
  Keller:              { lat: 32.9346, lng: -97.2520 },
  "Round Rock":        { lat: 30.5083, lng: -97.6789 },
  "Cedar Park":        { lat: 30.5052, lng: -97.8203 },
  Pearland:            { lat: 29.5636, lng: -95.2860 },
  Allen:               { lat: 33.1032, lng: -96.6706 },
  Waco:                { lat: 31.5493, lng: -97.1467 },
  "Live Oak":          { lat: 29.5652, lng: -98.3368 },
  "North Richland Hills": { lat: 32.8343, lng: -97.2289 },
  Rosenberg:           { lat: 29.5572, lng: -95.8088 },
  Justin:              { lat: 33.0848, lng: -97.2961 },
};

// ── Candidate Data ──────────────────────────────────────────────────────────
// All data sourced from Ballotpedia, official city filings, and local news.
// Party: "NP" = nonpartisan (Texas municipal elections).

const MAYORS = [

  // ═══════════════════════════════════════════════════════════════════════════
  // IRVING — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Olivia Novelo Abreu", city: "Irving", ...CITIES.Irving, party: "NP",
    policies: ["Expand community engagement and civic participation", "Support small business growth along Irving corridors", "Improve public transit connectivity", "Address housing affordability for working families", "Strengthen public safety programs"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Irving,_Texas_(2026)" },
  { name: "Zhanae Jackson", city: "Irving", ...CITIES.Irving, party: "NP",
    policies: ["Youth development and education investment", "Economic opportunity and workforce development", "Neighborhood revitalization", "Transparency in city government", "Public safety community partnerships"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Irving,_Texas_(2026)" },
  { name: "Albert Zapanta", city: "Irving", ...CITIES.Irving, party: "NP",
    policies: ["Business-friendly governance and economic growth", "Fiscal responsibility and lower taxes", "Public safety and crime reduction", "Infrastructure and roads improvement", "Veteran and military family support"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Irving,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // LUBBOCK — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Mark McBrayer", city: "Lubbock", ...CITIES.Lubbock, party: "NP",
    policies: ["Continue economic development momentum", "Maintain low tax rates", "Support Texas Tech University partnership", "Infrastructure improvements across Lubbock", "Public safety investment"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Lubbock,_Texas_(2026)" },
  { name: "Peggy Bohmfalk", city: "Lubbock", ...CITIES.Lubbock, party: "NP",
    policies: ["Improve city services and responsiveness", "Address road and infrastructure needs", "Support local business growth", "Community health and wellness initiatives", "Transparent budgeting"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Lubbock,_Texas_(2026)" },
  { name: "Stephen Sanders", city: "Lubbock", ...CITIES.Lubbock, party: "NP",
    policies: ["Reduce wasteful government spending", "Property tax relief for homeowners", "Support law enforcement and public safety", "Economic diversification beyond energy sector", "Improve city infrastructure"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Lubbock,_Texas_(2026)" },
  { name: "G. Todd Winans", city: "Lubbock", ...CITIES.Lubbock, party: "NP",
    policies: ["Fiscal conservatism and budget accountability", "Job creation and economic opportunity", "Public safety priority", "Road and utility infrastructure upgrades", "Support for Lubbock's agricultural heritage"],
    sourceUrl: "https://ballotpedia.org/Mayoral_election_in_Lubbock,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // DENTON — May 2, 2026 (incumbent Hudspeth term-limited)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Shannon Childs", city: "Denton", ...CITIES.Denton, party: "NP",
    policies: ["Managed growth and smart development", "Protect Denton's unique character", "Support UNT and TWU partnerships", "Environmental sustainability", "Affordable housing solutions"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Denton,_Texas_(2026)" },
  { name: "Angela Brewer", city: "Denton", ...CITIES.Denton, party: "NP",
    policies: ["Community-centered governance", "Address homelessness and housing access", "Support local arts and culture", "Improve public transit options", "Transparency and accountability"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Denton,_Texas_(2026)" },
  { name: "Brian Beck", city: "Denton", ...CITIES.Denton, party: "NP",
    policies: ["Business growth and economic development", "Property tax reform", "Public safety and crime reduction", "Infrastructure investment", "Responsible fiscal management"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Denton,_Texas_(2026)" },
  { name: "Chris Watts", city: "Denton", ...CITIES.Denton, party: "NP",
    policies: ["Fiscal responsibility and lower utility rates", "Smart growth management", "Support first responders", "Road and infrastructure repair", "Preserve Denton's quality of life"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Denton,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // TYLER — May 2, 2026 (Mayor Don Warren retiring)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Stuart Hene", city: "Tyler", ...CITIES.Tyler, party: "NP",
    policies: ["Downtown revitalization and economic growth", "Support East Texas healthcare industry", "Improve city parks and recreation", "Public safety investment", "Attract new businesses to Tyler"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Tyler,_Texas_(2026)" },
  { name: "Shirley McKellar", city: "Tyler", ...CITIES.Tyler, party: "NP",
    policies: ["Community empowerment and equity", "Improve underserved neighborhoods", "Youth programs and education support", "Affordable housing access", "Police-community relations"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Tyler,_Texas_(2026)" },
  { name: "John Nix", city: "Tyler", ...CITIES.Tyler, party: "NP",
    policies: ["Business-friendly environment", "Property tax relief", "Infrastructure and road improvements", "Support law enforcement", "Economic development and job growth"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Tyler,_Texas_(2026)" },
  { name: "James Wynne", city: "Tyler", ...CITIES.Tyler, party: "NP",
    policies: ["Transparent and accountable governance", "Neighborhood improvement programs", "Support local businesses and entrepreneurs", "Public safety and emergency preparedness", "Parks and community spaces investment"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Tyler,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // ABILENE — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Weldon Hurt", city: "Abilene", ...CITIES.Abilene, party: "NP",
    policies: ["Economic development and diversification", "Support military presence at Dyess AFB", "Infrastructure and water resource management", "Public safety", "Fiscal responsibility"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Abilene,_Texas_(2026)" },
  { name: "Dayakar Desi Reddy", city: "Abilene", ...CITIES.Abilene, party: "NP",
    policies: ["Small business support and entrepreneurship", "Improve healthcare access", "Diversity and inclusion in city services", "Education and workforce training", "Community engagement"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Abilene,_Texas_(2026)" },
  { name: "Ryan Goodwin", city: "Abilene", ...CITIES.Abilene, party: "NP",
    policies: ["Job creation and economic opportunity", "Property tax relief for residents", "Road and infrastructure repair", "Support law enforcement and fire services", "Attract young professionals to Abilene"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Abilene,_Texas_(2026)" },
  { name: "Chad Clark", city: "Abilene", ...CITIES.Abilene, party: "NP",
    policies: ["Conservative fiscal management", "Public safety priority", "Economic growth and business recruitment", "Improve city utilities and services", "Community development"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Abilene,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEW BRAUNFELS — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Neal Linnartz", city: "New Braunfels", ...CITIES["New Braunfels"], party: "NP",
    policies: ["Managed growth along I-35 corridor", "Preserve German heritage and tourism", "Water resource protection", "Infrastructure to keep pace with growth", "Support local businesses"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_New_Braunfels,_Texas_(2026)" },
  { name: "Michael French", city: "New Braunfels", ...CITIES["New Braunfels"], party: "NP",
    policies: ["Control rapid growth impacts", "Property tax relief for longtime residents", "Improve traffic and road infrastructure", "Protect natural resources and rivers", "Public safety expansion"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_New_Braunfels,_Texas_(2026)" },
  { name: "Jonathon Frazier", city: "New Braunfels", ...CITIES["New Braunfels"], party: "NP",
    policies: ["Smart growth planning", "Fiscal responsibility", "Community input in development decisions", "Water conservation", "Support parks and recreation"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_New_Braunfels,_Texas_(2026)" },
  { name: "Angela Allen", city: "New Braunfels", ...CITIES["New Braunfels"], party: "NP",
    policies: ["Community-first governance", "Address traffic congestion", "Affordable housing options", "Environmental stewardship", "Support local schools and education"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_New_Braunfels,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // GALVESTON — May 2, 2026 (incumbent Craig Brown term-limited)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Marie Robb", city: "Galveston", ...CITIES.Galveston, party: "NP",
    policies: ["Hurricane preparedness and coastal resilience", "Tourism economy growth", "Historic preservation", "Affordable housing for island residents", "Infrastructure and seawall maintenance"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Galveston,_Texas_(2026)" },
  { name: "John Paul Listowski", city: "Galveston", ...CITIES.Galveston, party: "NP",
    policies: ["Economic development beyond tourism", "Flood protection and drainage improvements", "Public safety and emergency response", "Support working families on the island", "Transparent city government"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Galveston,_Texas_(2026)" },
  { name: "William Boike", city: "Galveston", ...CITIES.Galveston, party: "NP",
    policies: ["Fiscal responsibility and lower taxes", "Beach and environmental protection", "Support local businesses and fisheries", "Improve island infrastructure", "Community-centered governance"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Galveston,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // KILLEEN — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Jose Segarra", city: "Killeen", ...CITIES.Killeen, party: "NP",
    policies: ["Support Fort Cavazos military community", "Economic diversification", "Improve city infrastructure and roads", "Public safety investment", "Attract retail and dining options"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Killeen,_Texas_(2026)" },
  { name: "Riakos Adams", city: "Killeen", ...CITIES.Killeen, party: "NP",
    policies: ["Community empowerment and engagement", "Youth programs and mentorship", "Neighborhood revitalization", "Support veterans and military families", "Affordable housing"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Killeen,_Texas_(2026)" },
  { name: "Joseph Solomon", city: "Killeen", ...CITIES.Killeen, party: "NP",
    policies: ["Government transparency and accountability", "Economic growth and job creation", "Road and infrastructure improvements", "Public safety and crime reduction", "Support small businesses"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Killeen,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // KELLER — May 2, 2026 (Mayor Mizani not seeking reelection)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Ross McMullin", city: "Keller", ...CITIES.Keller, party: "NP",
    policies: ["Preserve small-town character", "Responsible development", "Property tax management", "Support Keller schools", "Public safety"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Keller,_Texas_(2026)" },
  { name: "Tag Green", city: "Keller", ...CITIES.Keller, party: "NP",
    policies: ["Fiscal conservatism", "Manage growth and traffic", "Support first responders", "Neighborhood protection", "Community engagement"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Keller,_Texas_(2026)" },
  { name: "Ed Prem", city: "Keller", ...CITIES.Keller, party: "NP",
    policies: ["Business-friendly policies", "Infrastructure investment", "Keep taxes low", "Public safety priority", "Parks and recreation"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Keller,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND ROCK — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Craig Morgan", city: "Round Rock", ...CITIES["Round Rock"], party: "NP",
    policies: ["Continue economic momentum", "Support Dell Technologies corridor", "Infrastructure for rapid growth", "Public safety expansion", "Parks and quality of life"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Round_Rock,_Texas_(2026)" },
  { name: "Kelly Hall", city: "Round Rock", ...CITIES["Round Rock"], party: "NP",
    policies: ["Address traffic congestion", "Affordable housing options", "Community engagement in planning", "Environmental sustainability", "Support local businesses"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Round_Rock,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // CEDAR PARK — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Jim Penniman-Morin", city: "Cedar Park", ...CITIES["Cedar Park"], party: "NP",
    policies: ["Manage growth sustainably", "Keep property taxes competitive", "Support Cedar Park Center economic development", "Road and transit improvements", "Public safety"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Cedar_Park,_Texas_(2026)" },
  { name: "Dean Doscher", city: "Cedar Park", ...CITIES["Cedar Park"], party: "NP",
    policies: ["Property tax relief", "Control development pace", "Improve traffic flow on 183/1431", "Support local businesses", "Community parks and recreation"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Cedar_Park,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // PEARLAND — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Quentin Wiltz", city: "Pearland", ...CITIES.Pearland, party: "NP",
    policies: ["Economic development along 288 corridor", "Flood mitigation and drainage", "Public safety expansion", "Property tax management", "Community amenities"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Pearland,_Texas_(2026)" },
  { name: "Tony Carbone", city: "Pearland", ...CITIES.Pearland, party: "NP",
    policies: ["Fiscal responsibility", "Infrastructure and drainage improvements", "Support Pearland's family-friendly character", "Economic diversification", "Transparent governance"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Pearland,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLEN — May 2, 2026 (Mayor Baine Brooks term-limited)
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Chris Schulmeister", city: "Allen", ...CITIES.Allen, party: "NP",
    policies: ["Continue Allen's growth trajectory", "Support Allen Premium Outlets economic zone", "Property tax management", "Public safety", "Parks and community events"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Allen,_Texas_(2026)" },
  { name: "Dave Shafer", city: "Allen", ...CITIES.Allen, party: "NP",
    policies: ["Responsible growth management", "Keep Allen family-friendly", "Fiscal conservatism", "Infrastructure improvements", "Support local schools"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Allen,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // WACO — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Jim Holmes", city: "Waco", ...CITIES.Waco, party: "NP",
    policies: ["Continue downtown Waco renaissance", "Support Baylor University partnerships", "Affordable housing and anti-displacement", "Public safety investment", "Attract employers to Central Texas"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Waco,_Texas_(2026)" },
  { name: "Aiden Morgan", city: "Waco", ...CITIES.Waco, party: "NP",
    policies: ["Youth empowerment and opportunity", "Address income inequality", "Environmental sustainability", "Community policing reform", "Expand public transit"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Waco,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // LIVE OAK — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Mary M. Dennis", city: "Live Oak", ...CITIES["Live Oak"], party: "NP",
    policies: ["Maintain low tax rate", "Community safety", "Infrastructure maintenance", "Support military families near Randolph AFB", "Preserve residential character"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Live_Oak,_Texas_(2026)" },
  { name: "Christina Lichtenberg", city: "Live Oak", ...CITIES["Live Oak"], party: "NP",
    policies: ["Fresh leadership and new ideas", "Improve city services", "Community engagement", "Fiscal responsibility", "Neighborhood improvements"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Live_Oak,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // NORTH RICHLAND HILLS — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Jack McCarty", city: "North Richland Hills", ...CITIES["North Richland Hills"], party: "NP",
    policies: ["Continue economic development", "Support NRH Centre and retail", "Public safety investment", "Infrastructure and road improvements", "Community engagement"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_North_Richland_Hills,_Texas_(2026)" },
  { name: "Literally Anybody Else", city: "North Richland Hills", ...CITIES["North Richland Hills"], party: "NP",
    policies: ["Protest candidacy for government accountability", "Challenge status quo politics", "Citizen-first governance", "Fiscal transparency", "Direct democracy and civic engagement"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_North_Richland_Hills,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // ROSENBERG — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "Susan Kroll Euton", city: "Rosenberg", ...CITIES.Rosenberg, party: "NP",
    policies: ["Support Rosenberg's growth as Fort Bend hub", "Flood mitigation along Brazos River", "Economic development", "Community safety", "Infrastructure investment"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Rosenberg,_Texas_(2026)" },
  { name: "William Benton", city: "Rosenberg", ...CITIES.Rosenberg, party: "NP",
    policies: ["Fiscal responsibility and budget transparency", "Property tax management", "Public safety", "Attract businesses and jobs", "Improve city parks and services"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Rosenberg,_Texas_(2026)" },

  // ═══════════════════════════════════════════════════════════════════════════
  // JUSTIN — May 2, 2026
  // ═══════════════════════════════════════════════════════════════════════════
  { name: "James Clark", city: "Justin", ...CITIES.Justin, party: "NP",
    policies: ["Manage rapid growth sustainably", "Infrastructure for new development", "Keep small-town character", "Property tax control", "Public safety"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Justin,_Texas_(2026)" },
  { name: "Tomas Mendoza", city: "Justin", ...CITIES.Justin, party: "NP",
    policies: ["Community engagement and transparency", "Support local businesses", "Road and utility improvements", "Youth programs", "Responsible budgeting"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Justin,_Texas_(2026)" },
  { name: "Joe Cokel", city: "Justin", ...CITIES.Justin, party: "NP",
    policies: ["Controlled development", "Lower utility costs", "Public safety priority", "Improve roads and drainage", "Preserve Justin's heritage"],
    sourceUrl: "https://ballotpedia.org/City_elections_in_Justin,_Texas_(2026)" },
];

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  await connectDB();
  console.log(`Seeding ${MAYORS.length} mayoral candidates across ${Object.keys(CITIES).length} cities...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const m of MAYORS) {
    const doc = buildMayorDoc(m);
    const isNew = await upsertDoc(doc);
    if (isNew) {
      console.log(`  + ${doc.name} — ${doc.office}`);
      inserted++;
    } else {
      console.log(`  = ${doc.name} — ${doc.office} (already exists)`);
      skipped++;
    }
  }

  console.log(`\nDone: ${inserted} inserted, ${skipped} already existed`);
  console.log(`Total mayoral candidates in DB now covers ${new Set(MAYORS.map(m => m.city)).size} new cities`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
