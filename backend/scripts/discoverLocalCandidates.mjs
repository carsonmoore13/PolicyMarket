#!/usr/bin/env node
/**
 * discoverLocalCandidates.mjs
 *
 * Discovers Texas 2026 local election candidates using two strategies:
 *
 *   Phase 1 — Google Civic Information API voterInfoQuery (if GOOGLE_CIVIC_API_KEY set)
 *     Queries representative addresses from ~100+ TX cities to find local contests.
 *     This is the most comprehensive free source for local ballot data.
 *
 *   Phase 2 — Ballotpedia city election page scraping (always runs)
 *     Scrapes city election pages for all major TX cities (pop >= ~15k).
 *     Parses votebox, wikitable, and candidate-list formats.
 *
 *   Phase 3 — Photo pipeline for new candidates
 *     Scrapes Ballotpedia + Wikipedia for headshots, generates initials placeholders,
 *     uploads to S3.
 *
 * Idempotent: uses $setOnInsert so re-runs never overwrite existing records.
 *
 * Usage:  cd backend && node scripts/discoverLocalCandidates.mjs
 */

import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";
import { MongoClient } from "mongodb";
import sharp from "sharp";

// Dynamic imports for S3 (must come after dotenv.config)
const { uploadCandidateImage, makeCandidateKey, makePublicUrl, s3KeyExists } =
  await import("../services/s3Service.js");
const { findCandidatePhoto } = await import("../utils/imageScraper.js");
const { normaliseImage } = await import("../services/candidateImageService.js");

// ── Config ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB = process.env.MONGO_DB_NAME || "elections_2026";
const CIVIC_API_KEY = process.env.GOOGLE_CIVIC_API_KEY || "";
const CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";
const BP_BASE = "https://ballotpedia.org";
const FETCH_DELAY = 1200; // ms between Ballotpedia requests
const CIVIC_DELAY = 200;  // ms between Civic API requests
const CONCURRENCY = 3;
const PHOTO_CONCURRENCY = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const httpClient = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
    Accept: "text/html,application/xhtml+xml,*/*",
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function makeGeo(lat, lng, cityName) {
  return {
    jurisdiction_name: cityName,
    lat, lng,
    geo_type: "city_center",
    geo_source: "civic_api_discovery",
    bounding_box: { north: null, south: null, east: null, west: null },
    geojson_point: { type: "Point", coordinates: [lng, lat] },
  };
}

function normalizeParty(raw) {
  if (!raw) return "NP";
  const lc = raw.toLowerCase();
  if (lc.includes("republican")) return "R";
  if (lc.includes("democrat")) return "D";
  if (lc.includes("nonpartisan") || lc.includes("independent") || lc === "np") return "NP";
  return "NP";
}

function isPersonName(name) {
  if (!name || name.length < 4 || name.length > 60) return false;
  // Comprehensive exclusion pattern (matches ballotpediaRaceScraper.js NAME_EXCLUDE + extras)
  if (/party|election|poll|district|senate|house|congress|general|primary|runoff|ballot|voting|campaign|endorsement|race|seat|term|office|county|city|state\b|representative|governor|mayor|council|incumbent|candidate|nomination|report|monitor|committee|coalition|association|political|foundation|institute|center|bureau|department|division|agency|authority|commission|board|court|journal|news|tribune|times|post|gazette|herald|review|observer|biography|submitted|survey|source\b|spending|satellite|delegation|information|\bclick\b|\bhere\b|\bview\b|\bmore\b|\bsee\b|public policy|endorser|how to|what's on|who represents|external link|footnote|content|u\.s\. president|federal courts|state executive|state legislature|local courts|top counties|cities in|texas$|help inform/i.test(name)) return false;
  if (/\band\b/i.test(name)) return false;
  if (/[?!,]/.test(name)) return false; // punctuation = not a name
  if (/^\d/.test(name)) return false; // starts with number
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  if (!/^[A-Z]/.test(words[0])) return false;
  // Every word should start with a letter (real names)
  if (words.some(w => !/^[A-Za-z]/.test(w))) return false;
  return true;
}

function buildLocalDoc({ name, office, city, lat, lng, district, party, policies, sourceUrl, sourceName }) {
  const now = new Date();
  const doc = {
    name,
    office,
    office_level: "city",
    jurisdiction: city,
    state: "TX",
    district: district || null,
    party: party || "NP",
    incumbent: null,
    filing_date: null,
    geo: makeGeo(lat, lng, city),
    home_city: `${city}, TX`,
    policies: policies && policies.length ? policies : defaultPolicies(party),
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
    source_name: sourceName || "Auto-discovered",
    last_verified: now,
    status_2026: "nominee",
    data_hash: "",
  };
  doc.data_hash = hashCandidate(doc);
  return doc;
}

function defaultPolicies(party) {
  if (party === "D") return [
    "Expand healthcare access",
    "Climate action & clean energy",
    "Strengthen workers' rights",
    "Public education funding",
    "Protect voting rights",
  ];
  if (party === "R") return [
    "Lower taxes & reduce spending",
    "Secure the border",
    "Second Amendment protections",
    "Deregulation & energy independence",
    "Law and order & public safety",
  ];
  return [
    "Responsible fiscal management",
    "Public safety and community services",
    "Infrastructure improvements",
    "Economic development and job growth",
    "Transparent and accountable governance",
  ];
}

// ── Texas cities (top ~120 by population, with coordinates) ─────────────────

const TX_CITIES = [
  { name: "Houston", lat: 29.7604, lng: -95.3698, addr: "901 Bagby St, Houston, TX 77002" },
  { name: "San Antonio", lat: 29.4241, lng: -98.4936, addr: "100 Military Plaza, San Antonio, TX 78205" },
  { name: "Dallas", lat: 32.7767, lng: -96.7970, addr: "1500 Marilla St, Dallas, TX 75201" },
  { name: "Austin", lat: 30.2672, lng: -97.7431, addr: "301 W 2nd St, Austin, TX 78701" },
  { name: "Fort Worth", lat: 32.7555, lng: -97.3308, addr: "200 Texas St, Fort Worth, TX 76102" },
  { name: "El Paso", lat: 31.7619, lng: -106.4850, addr: "300 N Campbell St, El Paso, TX 79901" },
  { name: "Arlington", lat: 32.7357, lng: -97.1081, addr: "101 W Abram St, Arlington, TX 76010" },
  { name: "Corpus Christi", lat: 27.8006, lng: -97.3964, addr: "1201 Leopard St, Corpus Christi, TX 78401" },
  { name: "Plano", lat: 33.0198, lng: -96.6989, addr: "1520 K Ave, Plano, TX 75074" },
  { name: "Laredo", lat: 27.5036, lng: -99.5076, addr: "1110 Houston St, Laredo, TX 78040" },
  { name: "Lubbock", lat: 33.5779, lng: -101.8552, addr: "1625 13th St, Lubbock, TX 79401" },
  { name: "Garland", lat: 32.9126, lng: -96.6389, addr: "200 N 5th St, Garland, TX 75040" },
  { name: "Irving", lat: 32.8140, lng: -96.9489, addr: "825 W Irving Blvd, Irving, TX 75060" },
  { name: "Amarillo", lat: 35.2220, lng: -101.8313, addr: "509 SE 7th Ave, Amarillo, TX 79101" },
  { name: "Grand Prairie", lat: 32.7459, lng: -96.9978, addr: "317 College St, Grand Prairie, TX 75050" },
  { name: "Brownsville", lat: 25.9017, lng: -97.4975, addr: "1001 E Elizabeth St, Brownsville, TX 78520" },
  { name: "McKinney", lat: 33.1972, lng: -96.6397, addr: "222 N Tennessee St, McKinney, TX 75069" },
  { name: "Frisco", lat: 33.1507, lng: -96.8236, addr: "6101 Frisco Square Blvd, Frisco, TX 75034" },
  { name: "Pasadena", lat: 29.6911, lng: -95.2091, addr: "1149 Ellsworth Dr, Pasadena, TX 77506" },
  { name: "Mesquite", lat: 32.7668, lng: -96.5992, addr: "1515 N Galloway Ave, Mesquite, TX 75149" },
  { name: "Killeen", lat: 31.1171, lng: -97.7278, addr: "101 N College St, Killeen, TX 76541" },
  { name: "McAllen", lat: 26.2034, lng: -98.2300, addr: "1300 Houston Ave, McAllen, TX 78501" },
  { name: "Denton", lat: 33.2148, lng: -97.1331, addr: "215 E McKinney St, Denton, TX 76201" },
  { name: "Midland", lat: 31.9973, lng: -102.0779, addr: "300 N Loraine St, Midland, TX 79701" },
  { name: "Waco", lat: 31.5493, lng: -97.1467, addr: "300 Austin Ave, Waco, TX 76701" },
  { name: "Carrollton", lat: 32.9537, lng: -96.8903, addr: "1945 E Jackson Rd, Carrollton, TX 75006" },
  { name: "Round Rock", lat: 30.5083, lng: -97.6789, addr: "221 E Main St, Round Rock, TX 78664" },
  { name: "Abilene", lat: 32.4487, lng: -99.7331, addr: "555 Walnut St, Abilene, TX 79601" },
  { name: "Pearland", lat: 29.5636, lng: -95.2860, addr: "3519 Liberty Dr, Pearland, TX 77581" },
  { name: "Richardson", lat: 32.9483, lng: -96.7299, addr: "411 W Arapaho Rd, Richardson, TX 75080" },
  { name: "Odessa", lat: 31.8457, lng: -102.3676, addr: "411 W 8th St, Odessa, TX 79761" },
  { name: "Sugar Land", lat: 29.6197, lng: -95.6350, addr: "2700 Town Center Blvd N, Sugar Land, TX 77479" },
  { name: "Tyler", lat: 32.3513, lng: -95.3011, addr: "212 N Bonner Ave, Tyler, TX 75702" },
  { name: "College Station", lat: 30.6280, lng: -96.3344, addr: "1101 Texas Ave, College Station, TX 77840" },
  { name: "Beaumont", lat: 30.0802, lng: -94.1266, addr: "801 Main St, Beaumont, TX 77701" },
  { name: "Lewisville", lat: 33.0462, lng: -96.9942, addr: "151 W Church St, Lewisville, TX 75057" },
  { name: "League City", lat: 29.5075, lng: -95.0950, addr: "300 W Walker St, League City, TX 77573" },
  { name: "Allen", lat: 33.1032, lng: -96.6706, addr: "305 Century Pkwy, Allen, TX 75013" },
  { name: "San Angelo", lat: 31.4638, lng: -100.4370, addr: "72 W College Ave, San Angelo, TX 76903" },
  { name: "Edinburg", lat: 26.3017, lng: -98.1633, addr: "415 W University Dr, Edinburg, TX 78539" },
  { name: "Conroe", lat: 30.3119, lng: -95.4560, addr: "300 W Davis St, Conroe, TX 77301" },
  { name: "New Braunfels", lat: 29.7030, lng: -98.1245, addr: "550 Landa St, New Braunfels, TX 78130" },
  { name: "Flower Mound", lat: 33.0146, lng: -97.0970, addr: "2121 Cross Timbers Rd, Flower Mound, TX 75028" },
  { name: "Temple", lat: 31.0982, lng: -97.3428, addr: "2 N Main St, Temple, TX 76501" },
  { name: "Longview", lat: 32.5007, lng: -94.7405, addr: "300 W Cotton St, Longview, TX 75601" },
  { name: "North Richland Hills", lat: 32.8343, lng: -97.2289, addr: "7301 NE Loop 820, North Richland Hills, TX 76180" },
  { name: "Bryan", lat: 30.6744, lng: -96.3700, addr: "300 S Texas Ave, Bryan, TX 77803" },
  { name: "Mission", lat: 26.2159, lng: -98.3253, addr: "1201 E 8th St, Mission, TX 78572" },
  { name: "Pharr", lat: 26.1948, lng: -98.1836, addr: "118 S Cage Blvd, Pharr, TX 78577" },
  { name: "Baytown", lat: 29.7355, lng: -94.9774, addr: "2401 Market St, Baytown, TX 77520" },
  { name: "Missouri City", lat: 29.6186, lng: -95.5377, addr: "1522 Texas Pkwy, Missouri City, TX 77489" },
  { name: "Cedar Park", lat: 30.5052, lng: -97.8203, addr: "450 Cypress Creek Rd, Cedar Park, TX 78613" },
  { name: "Mansfield", lat: 32.5632, lng: -97.1417, addr: "1200 E Broad St, Mansfield, TX 76063" },
  { name: "Pflugerville", lat: 30.4394, lng: -97.6200, addr: "100 E Main St, Pflugerville, TX 78660" },
  { name: "Harlingen", lat: 26.1906, lng: -97.6961, addr: "118 E Tyler Ave, Harlingen, TX 78550" },
  { name: "Georgetown", lat: 30.6332, lng: -97.6780, addr: "808 Martin Luther King Jr St, Georgetown, TX 78626" },
  { name: "Rowlett", lat: 32.9029, lng: -96.5639, addr: "4000 Main St, Rowlett, TX 75088" },
  { name: "Victoria", lat: 28.8053, lng: -96.9850, addr: "700 N Main St, Victoria, TX 77901" },
  { name: "San Marcos", lat: 29.8833, lng: -97.9414, addr: "630 E Hopkins St, San Marcos, TX 78666" },
  { name: "Euless", lat: 32.8371, lng: -97.0820, addr: "201 N Ector Dr, Euless, TX 76039" },
  { name: "DeSoto", lat: 32.5899, lng: -96.8570, addr: "211 E Pleasant Run Rd, DeSoto, TX 75115" },
  { name: "Grapevine", lat: 32.9343, lng: -97.0781, addr: "200 S Main St, Grapevine, TX 76051" },
  { name: "Galveston", lat: 29.3013, lng: -94.7977, addr: "823 Rosenberg Ave, Galveston, TX 77550" },
  { name: "Bedford", lat: 32.8440, lng: -97.1431, addr: "2000 Forest Ridge Dr, Bedford, TX 76021" },
  { name: "Cedar Hill", lat: 32.5885, lng: -96.9562, addr: "285 Uptown Blvd, Cedar Hill, TX 75104" },
  { name: "Texas City", lat: 29.3838, lng: -94.9027, addr: "1801 9th Ave N, Texas City, TX 77590" },
  { name: "Wylie", lat: 33.0151, lng: -96.5389, addr: "300 Country Club Rd, Wylie, TX 75098" },
  { name: "Burleson", lat: 32.5421, lng: -97.3208, addr: "141 W Renfro St, Burleson, TX 76028" },
  { name: "Port Arthur", lat: 29.8990, lng: -93.9290, addr: "444 4th St, Port Arthur, TX 77640" },
  { name: "Haltom City", lat: 32.7996, lng: -97.2692, addr: "5024 Broadway Ave, Haltom City, TX 76117" },
  { name: "Keller", lat: 32.9346, lng: -97.2520, addr: "1100 Bear Creek Pkwy, Keller, TX 76248" },
  { name: "Coppell", lat: 32.9546, lng: -97.0150, addr: "255 E Parkway Blvd, Coppell, TX 75019" },
  { name: "Rockwall", lat: 32.9312, lng: -96.4597, addr: "385 S Goliad St, Rockwall, TX 75087" },
  { name: "Huntsville", lat: 30.7235, lng: -95.5508, addr: "1212 Avenue M, Huntsville, TX 77340" },
  { name: "Duncanville", lat: 32.6518, lng: -96.9086, addr: "203 E Wheatland Rd, Duncanville, TX 75116" },
  { name: "Sherman", lat: 33.6357, lng: -96.6089, addr: "220 W Mulberry St, Sherman, TX 75090" },
  { name: "The Colony", lat: 33.0890, lng: -96.8861, addr: "6800 Main St, The Colony, TX 75056" },
  { name: "Hurst", lat: 32.8234, lng: -97.1706, addr: "1505 Precinct Line Rd, Hurst, TX 76054" },
  { name: "Lancaster", lat: 32.5921, lng: -96.7562, addr: "211 N Henry St, Lancaster, TX 75146" },
  { name: "Friendswood", lat: 29.5293, lng: -95.2010, addr: "910 S Friendswood Dr, Friendswood, TX 77546" },
  { name: "Weslaco", lat: 26.1596, lng: -97.9908, addr: "255 S Kansas Ave, Weslaco, TX 78596" },
  { name: "Lufkin", lat: 31.3382, lng: -94.7291, addr: "300 E Shepherd Ave, Lufkin, TX 75901" },
  { name: "Wichita Falls", lat: 33.9137, lng: -98.4934, addr: "1300 7th St, Wichita Falls, TX 76301" },
  { name: "Schertz", lat: 29.5522, lng: -98.2698, addr: "1400 Schertz Pkwy, Schertz, TX 78154" },
  { name: "Kyle", lat: 29.9889, lng: -97.8772, addr: "100 W Center St, Kyle, TX 78640" },
  { name: "Texarkana", lat: 33.4418, lng: -94.0477, addr: "220 Texas Blvd, Texarkana, TX 75501" },
  { name: "Weatherford", lat: 32.7593, lng: -97.7973, addr: "303 Palo Pinto St, Weatherford, TX 76086" },
  { name: "Cleburne", lat: 32.3477, lng: -97.3867, addr: "10 N Robinson St, Cleburne, TX 76033" },
  { name: "Watauga", lat: 32.8582, lng: -97.2547, addr: "7105 Whitley Rd, Watauga, TX 76148" },
  { name: "Farmers Branch", lat: 32.9265, lng: -96.8961, addr: "13000 Wm Dodson Pkwy, Farmers Branch, TX 75234" },
  { name: "Sachse", lat: 32.9762, lng: -96.5953, addr: "3815 Sachse Rd, Sachse, TX 75048" },
  { name: "La Porte", lat: 29.6658, lng: -95.0194, addr: "604 W Fairmont Pkwy, La Porte, TX 77571" },
  { name: "Corsicana", lat: 32.0954, lng: -96.4689, addr: "200 N 12th St, Corsicana, TX 75110" },
  { name: "Copperas Cove", lat: 31.1240, lng: -97.9031, addr: "914 S Main St, Copperas Cove, TX 76522" },
  { name: "Benbrook", lat: 32.6732, lng: -97.4606, addr: "911 Winscott Rd, Benbrook, TX 76126" },
  { name: "Katy", lat: 29.7858, lng: -95.8245, addr: "901 Avenue C, Katy, TX 77493" },
  { name: "Tomball", lat: 30.0972, lng: -95.6161, addr: "401 Market St, Tomball, TX 77375" },
  { name: "Humble", lat: 29.9988, lng: -95.2622, addr: "114 W Higgins St, Humble, TX 77338" },
  { name: "Rosenberg", lat: 29.5572, lng: -95.8088, addr: "2110 4th St, Rosenberg, TX 77471" },
  { name: "Bastrop", lat: 30.1105, lng: -97.3153, addr: "904 Main St, Bastrop, TX 78602" },
  { name: "Live Oak", lat: 29.5652, lng: -98.3368, addr: "8001 Shin Oak Dr, Live Oak, TX 78233" },
  { name: "Justin", lat: 33.0848, lng: -97.2961, addr: "415 N College St, Justin, TX 76247" },
  { name: "Prosper", lat: 33.2362, lng: -96.8011, addr: "250 W First St, Prosper, TX 75078" },
  { name: "Murphy", lat: 33.0151, lng: -96.6128, addr: "206 N Murphy Rd, Murphy, TX 75094" },
  { name: "Fate", lat: 32.9415, lng: -96.3814, addr: "105 E Fate Main Pl, Fate, TX 75132" },
  { name: "Anna", lat: 33.3490, lng: -96.5486, addr: "111 N Powell Pkwy, Anna, TX 75409" },
  { name: "Forney", lat: 32.7482, lng: -96.4719, addr: "101 E Main St, Forney, TX 75126" },
  { name: "Celina", lat: 33.3248, lng: -96.7842, addr: "142 N Ohio St, Celina, TX 75009" },
  { name: "Little Elm", lat: 33.1626, lng: -96.9376, addr: "100 W Eldorado Pkwy, Little Elm, TX 75068" },
  { name: "Buda", lat: 30.0852, lng: -97.8403, addr: "405 E Loop St, Buda, TX 78610" },
  { name: "Dripping Springs", lat: 30.1902, lng: -98.0867, addr: "511 Mercer St, Dripping Springs, TX 78620" },
  { name: "Boerne", lat: 29.7947, lng: -98.7320, addr: "447 N Main St, Boerne, TX 78006" },
  { name: "Saginaw", lat: 32.8601, lng: -97.3639, addr: "333 W McLeroy Blvd, Saginaw, TX 76179" },
  { name: "Southlake", lat: 32.9412, lng: -97.1342, addr: "1400 Main St, Southlake, TX 76092" },
  { name: "Colleyville", lat: 32.8810, lng: -97.1550, addr: "100 Main St, Colleyville, TX 76034" },
  { name: "Aledo", lat: 32.6960, lng: -97.6022, addr: "200 Old Annetta Rd, Aledo, TX 76008" },
  { name: "Liberty Hill", lat: 30.6644, lng: -97.9225, addr: "101 Quarry Rim Dr, Liberty Hill, TX 78642" },
  { name: "Hutto", lat: 30.5427, lng: -97.5467, addr: "401 W Front St, Hutto, TX 78634" },
  { name: "Leander", lat: 30.5788, lng: -97.8531, addr: "200 W Willis St, Leander, TX 78641" },
  { name: "Bee Cave", lat: 30.3085, lng: -97.9469, addr: "4000 Galleria Pkwy, Bee Cave, TX 78738" },
  { name: "Lakeway", lat: 30.3633, lng: -97.9795, addr: "1102 Lohmans Crossing Rd, Lakeway, TX 78734" },
  { name: "Manor", lat: 30.3408, lng: -97.5569, addr: "105 E Rector St, Manor, TX 78653" },
];

// ── Phase 1: Google Civic Information API ─────────────────────────────────

async function discoverViaCivicApi(cities) {
  if (!CIVIC_API_KEY) {
    console.log("\n⚠  GOOGLE_CIVIC_API_KEY not set — skipping Phase 1 (Civic API)");
    console.log("   Set it in backend/.env for maximum local coverage.\n");
    return [];
  }

  console.log("\n═══ Phase 1: Google Civic Information API ═══");
  console.log(`Querying voterInfoQuery for ${cities.length} TX cities...\n`);

  const allCandidates = [];
  let apiCalls = 0;
  let contestsFound = 0;
  let errors = 0;

  for (const city of cities) {
    try {
      await sleep(CIVIC_DELAY);
      const res = await axios.get(`${CIVIC_BASE}/voterinfo`, {
        params: { address: city.addr, key: CIVIC_API_KEY },
        timeout: 10000,
      });
      apiCalls++;

      const contests = res.data?.contests || [];
      for (const contest of contests) {
        const levels = contest.level || [];
        // Only local-level contests
        const isLocal = levels.some((l) =>
          ["locality", "administrativeArea2", "regional", "special"].includes(l)
        );
        if (!isLocal) continue;

        const candidates = contest.candidates || [];
        if (!candidates.length) continue;

        contestsFound++;
        const officeName = contest.office || "Local Office";
        const districtName = contest.district?.name || null;

        for (const cand of candidates) {
          if (!cand.name || !isPersonName(cand.name)) continue;

          const party = normalizeParty(cand.party);
          const district = districtName ? `${city.name} ${districtName}` : null;
          const office = districtName
            ? `${city.name} ${officeName} ${districtName}`
            : /mayor/i.test(officeName) ? `Mayor of ${city.name}` : `${city.name} ${officeName}`;

          allCandidates.push({
            name: cand.name,
            office,
            city: city.name,
            lat: city.lat,
            lng: city.lng,
            district,
            party,
            policies: [],
            sourceUrl: cand.candidateUrl || null,
            sourceName: "Google Civic API",
            photoUrl: cand.photoUrl || null,
          });
        }
      }
    } catch (err) {
      if (err.response?.status === 400) {
        // "Election unknown" or no data — expected for many cities
      } else {
        errors++;
        if (errors <= 5) console.warn(`  [Civic] Error for ${city.name}: ${err.message}`);
      }
    }
  }

  console.log(`  Civic API: ${apiCalls} calls, ${contestsFound} local contests, ${allCandidates.length} candidates`);
  if (errors) console.log(`  ${errors} API errors (many expected — no election data for those cities)`);

  return allCandidates;
}

// ── Phase 2: Ballotpedia Scraping ───────────────────────────────────────

async function fetchBpPage(url) {
  await sleep(FETCH_DELAY);
  try {
    const res = await httpClient.get(url, { responseType: "text" });
    return res.data;
  } catch {
    return null;
  }
}

/**
 * Parse a Ballotpedia city elections page for candidates.
 * ONLY extracts from votebox containers (the reliable structured format).
 * Ignores sidebar, navigation, and paragraph links to avoid false positives.
 */
function parseCityElectionPage(html, cityName, lat, lng) {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();

  // Remove election history / past elections
  const $histH2 = $("h2").filter((_, el) => /election history|past elections|election results/i.test($(el).text())).first();
  if ($histH2.length) {
    $histH2.nextAll().remove();
    $histH2.remove();
  }

  // ── ONLY parse votebox containers (structured, reliable) ─────────────────
  $("div.votebox-scroll-container").each((_, container) => {
    const $vb = $(container).find("div.votebox").first();
    if (!$vb.length) return;

    const title = $vb.find("h5.votebox-header-election-type").text().trim();
    const isPrimary = /primary/i.test(title) && !/runoff/i.test(title);
    if (isPrimary) return; // skip completed primaries

    // Extract office from the votebox header title
    let office = null;
    let district = null;

    if (/mayor/i.test(title) && !/deputy|vice/i.test(title)) {
      office = `Mayor of ${cityName}`;
    } else if (/council|alderman|alderperson/i.test(title)) {
      const dm = title.match(/(?:district|ward|place|seat|position)\s*(\d+|[A-Z])/i);
      if (dm) {
        office = `${cityName} City Council District ${dm[1]}`;
        district = `${cityName} District ${dm[1]}`;
      } else if (/at.large/i.test(title)) {
        office = `${cityName} City Council At-Large`;
      } else {
        office = `${cityName} City Council`;
      }
    } else if (/school board|school trustee|ISD/i.test(title)) {
      const dm = title.match(/(?:district|place|seat|position)\s*(\d+|[A-Z])/i);
      if (dm) {
        office = `${cityName} School Board Place ${dm[1]}`;
        district = `${cityName} School Place ${dm[1]}`;
      } else {
        office = `${cityName} School Board`;
      }
    } else {
      // Generic — try to clean up the votebox title into an office name
      const cleaned = title
        .replace(/^(special\s+)?(general\s+election|runoff)\s+(for\s+)?/i, "")
        .replace(/,?\s*2026.*$/, "")
        .trim();
      if (cleaned.length > 3 && cleaned.length < 100) {
        office = cleaned;
      } else {
        office = `${cityName} Local Office`;
      }
    }

    // Party from votebox header class
    const headerClass = $vb.find("div.race_header").attr("class") || "";
    const vbPartyClass = /\brepublican\b/i.test(headerClass) ? "R"
                       : /\bdemocrat(ic)?\b/i.test(headerClass) ? "D"
                       : null;

    $vb.find("tr.results_row").each((_, row) => {
      const $row = $(row);
      const $cell = $row.find("td.votebox-results-cell--text");
      if (!$cell.length) return;

      // Party detection (thumbnail wrapper → cell text → votebox header → NP)
      const thumbClass = $row.find("div[class*='image-candidate-thumbnail-wrapper']").attr("class") || "";
      let party = /\brepublican\b/i.test(thumbClass) ? "R"
                : /\bdemocrat(ic)?\b/i.test(thumbClass) ? "D"
                : null;
      if (!party) {
        const cellText = $cell.text().trim();
        const m = cellText.match(/\(([RD])\)/);
        if (m) party = m[1];
      }
      if (!party) party = vbPartyClass || "NP";

      // Extract candidate from the first link in the cell
      $cell.find("a[href]").first().each((_, link) => {
        const name = $(link).text().trim().replace(/\s*\(i\)\s*$/, "").trim();
        const href = $(link).attr("href") || "";
        if (!isPersonName(name)) return;

        let slug = "";
        if (href.includes("ballotpedia.org/")) {
          const raw = href.split("ballotpedia.org/")[1];
          if (raw) slug = decodeURIComponent(raw.split("#")[0]);
        } else if (href.startsWith("/")) {
          slug = decodeURIComponent(href.slice(1).split("#")[0]);
        }
        if (!slug || slug.length < 5) return;
        if (/^(Ballotpedia|Wikipedia|File:|Special:|Template:|Category:)/i.test(slug)) return;
        // Slug must look like a person (contains underscore = First_Last)
        if (!slug.includes("_")) return;

        const key = `${name}|${office}`;
        if (seen.has(key)) return;
        seen.add(key);

        candidates.push({
          name, office,
          city: cityName, lat, lng,
          district,
          party,
          policies: [],
          sourceUrl: `${BP_BASE}/${slug}`,
          sourceName: "Ballotpedia (local-discovered)",
        });
      });
    });
  });

  return candidates;
}

async function discoverViaBallotpedia(cities) {
  console.log("\n═══ Phase 2: Ballotpedia City Election Pages ═══");
  console.log(`Scraping election pages for ${cities.length} TX cities...\n`);

  const allCandidates = [];
  let pagesFound = 0;
  let pagesNotFound = 0;

  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const slug = city.name.replace(/ /g, "_");

    // Try multiple URL patterns for each city
    const urls = [
      `${BP_BASE}/City_elections_in_${slug},_Texas_(2026)`,
      `${BP_BASE}/Mayoral_election_in_${slug},_Texas_(2026)`,
      `${BP_BASE}/${slug},_Texas,_city_council_election,_2026`,
    ];

    process.stdout.write(`  [${i + 1}/${cities.length}] ${city.name}...`);
    let cityCandidates = [];

    for (const url of urls) {
      const html = await fetchBpPage(url);
      if (!html) continue;

      const cands = parseCityElectionPage(html, city.name, city.lat, city.lng);
      if (cands.length) {
        // Deduplicate within this city
        for (const c of cands) {
          const key = `${c.name}|${c.office}`;
          if (!cityCandidates.some(x => `${x.name}|${x.office}` === key)) {
            cityCandidates.push(c);
          }
        }
      }
    }

    if (cityCandidates.length) {
      pagesFound++;
      allCandidates.push(...cityCandidates);
      process.stdout.write(` ${cityCandidates.length} candidates\n`);
    } else {
      process.stdout.write(` no candidates\n`);
      pagesNotFound++;
    }
  }

  console.log(`\n  Ballotpedia: ${pagesFound} cities with data, ${pagesNotFound} without, ${allCandidates.length} total candidates`);
  return allCandidates;
}

// ── Phase 3: Photo Pipeline ─────────────────────────────────────────────

const PARTY_COLORS = {
  R: { bg: "#b91c1c", text: "#ffffff" },
  D: { bg: "#1d4ed8", text: "#ffffff" },
};
const DEFAULT_COLOR = { bg: "#374151", text: "#ffffff" };

async function generatePlaceholderImage(name, party) {
  const init = initials(name);
  const colors = PARTY_COLORS[(party || "").toUpperCase()] || DEFAULT_COLOR;
  const svg = `
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.bg}" />
      <stop offset="100%" stop-color="${colors.bg}cc" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="0" />
  <text x="200" y="215" font-family="Arial,Helvetica,sans-serif" font-size="160"
        font-weight="bold" text-anchor="middle" dominant-baseline="central"
        fill="${colors.text}" opacity="0.9">${init}</text>
</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85, progressive: true }).toBuffer();
}

async function processPhotos(coll, newCandidateIds) {
  if (!newCandidateIds.length) return { scraped: 0, placeholders: 0, errors: 0 };

  console.log("\n═══ Phase 3: Photo Pipeline ═══");
  console.log(`Processing photos for ${newCandidateIds.length} new candidates...\n`);

  const candidates = await coll.find({ _id: { $in: newCandidateIds } }).toArray();
  let scraped = 0, placeholders = 0, errors = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const candidateId = c._id.toString();
    const state = "texas";
    const key = makeCandidateKey(candidateId, state);

    process.stdout.write(`  [${i + 1}/${candidates.length}] ${c.name} — `);

    try {
      // Check S3 first
      if (await s3KeyExists(key)) {
        const url = makePublicUrl(key);
        await coll.updateOne({ _id: c._id }, {
          $set: { "photo.url": url, "photo.source": "s3_existing", "photo.verified": true,
                  "photo.last_fetched": new Date(), updated_at: new Date() },
        });
        process.stdout.write(`already in S3\n`);
        continue;
      }

      // Try scraping a real photo
      let jpegBuffer = null;
      let sourceLabel = null;

      const result = await findCandidatePhoto(c);
      if (result) {
        jpegBuffer = await normaliseImage(result.buffer);
        sourceLabel = result.sourceLabel;
        scraped++;
        process.stdout.write(`${sourceLabel} photo`);
      } else {
        jpegBuffer = await generatePlaceholderImage(c.name, c.party);
        sourceLabel = "initials_placeholder";
        placeholders++;
        process.stdout.write(`initials placeholder`);
      }

      const s3Url = await uploadCandidateImage(candidateId, jpegBuffer, state);
      await coll.updateOne({ _id: c._id }, {
        $set: {
          "photo.url": s3Url, "photo.source": sourceLabel,
          "photo.verified": sourceLabel !== "initials_placeholder",
          "photo.last_fetched": new Date(), "photo.fallback_initials": initials(c.name),
          updated_at: new Date(),
        },
      });
      process.stdout.write(` → uploaded\n`);
    } catch (err) {
      errors++;
      process.stdout.write(` ERROR: ${err.message}\n`);
    }
  }

  return { scraped, placeholders, errors };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  PolicyMarket — TX Local Election Candidate Discovery    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Connect to MongoDB
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  // Baseline count
  const baselineTotal = await coll.countDocuments();
  const baselineLocal = await coll.countDocuments({
    $or: [{ office_level: "city" }, { office_level: "local" }],
  });
  console.log(`Baseline: ${baselineTotal} total candidates, ${baselineLocal} local\n`);

  // ── Phase 1: Google Civic API ─────────────────────────────────────────
  const civicCandidates = await discoverViaCivicApi(TX_CITIES);

  // ── Phase 2: Ballotpedia Scraping ─────────────────────────────────────
  const bpCandidates = await discoverViaBallotpedia(TX_CITIES);

  // ── Merge & Deduplicate ───────────────────────────────────────────────
  const allDiscovered = [...civicCandidates, ...bpCandidates];
  const uniqueMap = new Map();
  for (const c of allDiscovered) {
    const key = `${c.name.toLowerCase().trim()}|${c.office.toLowerCase().trim()}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, c);
    }
  }
  const uniqueCandidates = [...uniqueMap.values()];
  console.log(`\n═══ Deduplication ═══`);
  console.log(`  Raw discovered: ${allDiscovered.length}`);
  console.log(`  After dedup: ${uniqueCandidates.length}`);

  // ── Upsert to MongoDB ────────────────────────────────────────────────
  console.log(`\n═══ Database Upsert ═══`);
  let inserted = 0;
  let existed = 0;
  const newCandidateIds = [];

  for (const c of uniqueCandidates) {
    const doc = buildLocalDoc(c);
    try {
      const r = await coll.updateOne(
        { name: doc.name, office: doc.office, district: doc.district },
        { $setOnInsert: { ...doc, created_at: new Date(), updated_at: new Date() } },
        { upsert: true },
      );
      if (r.upsertedCount > 0) {
        inserted++;
        newCandidateIds.push(r.upsertedId);
        console.log(`  + ${c.name} — ${c.office} (${c.party})`);
      } else {
        existed++;
      }
    } catch (err) {
      console.warn(`  ! DB error for ${c.name}: ${err.message}`);
    }
  }

  console.log(`\n  Inserted: ${inserted} new candidates`);
  console.log(`  Already existed: ${existed}`);

  // ── Phase 3: Photos ───────────────────────────────────────────────────
  const photoStats = await processPhotos(coll, newCandidateIds);

  // ── Clear API cache ───────────────────────────────────────────────────
  const cacheResult = await db.collection("api_cache").deleteMany({});
  console.log(`\nCleared ${cacheResult.deletedCount} api_cache entries`);

  // ── Final Report ──────────────────────────────────────────────────────
  const finalTotal = await coll.countDocuments();
  const finalLocal = await coll.countDocuments({
    $or: [{ office_level: "city" }, { office_level: "local" }],
  });

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                    DISCOVERY REPORT                      ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  Civic API candidates found:    ${String(civicCandidates.length).padStart(5)}                  ║`);
  console.log(`║  Ballotpedia candidates found:  ${String(bpCandidates.length).padStart(5)}                  ║`);
  console.log(`║  After deduplication:            ${String(uniqueCandidates.length).padStart(5)}                  ║`);
  console.log(`║                                                           ║`);
  console.log(`║  NEW candidates inserted:        ${String(inserted).padStart(5)}                  ║`);
  console.log(`║  Already existed (skipped):      ${String(existed).padStart(5)}                  ║`);
  console.log(`║                                                           ║`);
  console.log(`║  Photos scraped (real):          ${String(photoStats.scraped).padStart(5)}                  ║`);
  console.log(`║  Photos generated (initials):    ${String(photoStats.placeholders).padStart(5)}                  ║`);
  console.log(`║  Photo errors:                   ${String(photoStats.errors).padStart(5)}                  ║`);
  console.log(`║                                                           ║`);
  console.log(`║  DB before:  ${String(baselineTotal).padStart(4)} total / ${String(baselineLocal).padStart(4)} local              ║`);
  console.log(`║  DB after:   ${String(finalTotal).padStart(4)} total / ${String(finalLocal).padStart(4)} local              ║`);
  console.log(`║  Net new:    ${String(finalTotal - baselineTotal).padStart(4)} candidates                        ║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");

  await client.close();
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
