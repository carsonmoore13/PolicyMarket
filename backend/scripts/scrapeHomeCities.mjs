/**
 * scrapeHomeCities.mjs
 *
 * Scrape actual home cities for Texas candidates from Ballotpedia pages.
 * Updates the `home_city` field in MongoDB.
 *
 * Strategy:
 *   1. Fetch each candidate's Ballotpedia page
 *   2. Parse the infobox for residence/location fields
 *   3. Parse biographical text for city mentions
 *   4. Fall back to a district → major city mapping
 *
 * Run:
 *   node scripts/scrapeHomeCities.mjs
 *
 * Env options:
 *   DRY_RUN=true     Print updates without writing to DB
 *   BATCH=999        Max candidates to process (default: all)
 *   DELAY=1200       ms between Ballotpedia requests (default 1200)
 *   LEVEL=federal    Only process "federal" or "state" level
 */

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import * as cheerio from "cheerio";
import { connectDB, getCandidatesCollection } from "../db.js";

const DRY_RUN = process.env.DRY_RUN === "true";
const BATCH = parseInt(process.env.BATCH || "999", 10);
const DELAY_MS = parseInt(process.env.DELAY || "1200", 10);
const LEVEL = process.env.LEVEL || null; // "federal" | "state" | null (both)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const httpClient = axios.create({
  timeout: 12000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
    Accept: "text/html,application/xhtml+xml,*/*",
  },
});

// ── Texas district → major city mapping ─────────────────────────────────────
// Used as fallback when Ballotpedia doesn't have residence data.
// Congressional districts
const TX_CD_CITIES = {
  "TX-1": "Tyler, TX", "TX-2": "The Woodlands, TX", "TX-3": "McKinney, TX",
  "TX-4": "Sherman, TX", "TX-5": "Mesquite, TX", "TX-6": "Arlington, TX",
  "TX-7": "Houston, TX", "TX-8": "The Woodlands, TX", "TX-9": "Houston, TX",
  "TX-10": "Austin, TX", "TX-11": "Midland, TX", "TX-12": "Fort Worth, TX",
  "TX-13": "Amarillo, TX", "TX-14": "Galveston, TX", "TX-15": "McAllen, TX",
  "TX-16": "El Paso, TX", "TX-17": "College Station, TX", "TX-18": "Houston, TX",
  "TX-19": "Lubbock, TX", "TX-20": "San Antonio, TX", "TX-21": "San Antonio, TX",
  "TX-22": "Sugar Land, TX", "TX-23": "San Antonio, TX", "TX-24": "Irving, TX",
  "TX-25": "Austin, TX", "TX-26": "Denton, TX", "TX-27": "Corpus Christi, TX",
  "TX-28": "Laredo, TX", "TX-29": "Houston, TX", "TX-30": "Dallas, TX",
  "TX-31": "Temple, TX", "TX-32": "Dallas, TX", "TX-33": "Dallas, TX",
  "TX-34": "Brownsville, TX", "TX-35": "San Antonio, TX", "TX-36": "Beaumont, TX",
  "TX-37": "Houston, TX", "TX-38": "Houston, TX",
};

// State Senate districts
const TX_SD_CITIES = {
  "SD-1": "Longview, TX", "SD-2": "Houston, TX", "SD-3": "Dallas, TX",
  "SD-4": "Houston, TX", "SD-5": "Beaumont, TX", "SD-6": "Houston, TX",
  "SD-7": "Houston, TX", "SD-8": "Spring, TX", "SD-9": "Plano, TX",
  "SD-10": "San Antonio, TX", "SD-11": "Dallas, TX", "SD-12": "Fort Worth, TX",
  "SD-13": "Wichita Falls, TX", "SD-14": "Corpus Christi, TX",
  "SD-15": "McAllen, TX", "SD-16": "Dallas, TX", "SD-17": "San Angelo, TX",
  "SD-18": "Dallas, TX", "SD-19": "San Antonio, TX", "SD-20": "Corpus Christi, TX",
  "SD-21": "San Antonio, TX", "SD-22": "Round Rock, TX", "SD-23": "Fort Worth, TX",
  "SD-24": "Laredo, TX", "SD-25": "San Antonio, TX", "SD-26": "San Antonio, TX",
  "SD-27": "Brownsville, TX", "SD-28": "Houston, TX", "SD-29": "Lubbock, TX",
  "SD-30": "Dallas, TX", "SD-31": "Amarillo, TX",
};

// State House districts — major city for each
const TX_HD_CITIES = {
  "HD-1": "Lufkin, TX", "HD-2": "Huntsville, TX", "HD-3": "Texarkana, TX",
  "HD-4": "Bonham, TX", "HD-5": "Jacksonville, TX", "HD-6": "Tyler, TX",
  "HD-7": "Longview, TX", "HD-8": "Nacogdoches, TX", "HD-9": "Lufkin, TX",
  "HD-10": "Bryan, TX", "HD-11": "Midland, TX", "HD-12": "Galveston, TX",
  "HD-13": "Beaumont, TX", "HD-14": "College Station, TX", "HD-15": "Beaumont, TX",
  "HD-16": "Victoria, TX", "HD-17": "College Station, TX", "HD-18": "Brenham, TX",
  "HD-19": "Waco, TX", "HD-20": "Waco, TX", "HD-21": "Temple, TX",
  "HD-22": "Killeen, TX", "HD-23": "Georgetown, TX", "HD-24": "Pflugerville, TX",
  "HD-25": "Pflugerville, TX", "HD-26": "Katy, TX", "HD-27": "Rosenberg, TX",
  "HD-28": "Hays County, TX", "HD-29": "League City, TX", "HD-30": "South Houston, TX",
  "HD-31": "Wharton, TX", "HD-32": "Lockhart, TX", "HD-33": "Rockwall, TX",
  "HD-34": "Rio Grande Valley, TX", "HD-35": "San Antonio, TX",
  "HD-36": "San Antonio, TX", "HD-37": "Corpus Christi, TX",
  "HD-38": "San Antonio, TX", "HD-39": "San Antonio, TX", "HD-40": "Laredo, TX",
  "HD-41": "Del Rio, TX", "HD-42": "El Paso, TX", "HD-43": "El Paso, TX",
  "HD-44": "San Antonio, TX", "HD-45": "San Marcos, TX", "HD-46": "Austin, TX",
  "HD-47": "Austin, TX", "HD-48": "Austin, TX", "HD-49": "Austin, TX",
  "HD-50": "Austin, TX", "HD-51": "Austin, TX", "HD-52": "Round Rock, TX",
  "HD-53": "Temple, TX", "HD-54": "San Angelo, TX", "HD-55": "Waco, TX",
  "HD-56": "Abilene, TX", "HD-57": "Stephenville, TX", "HD-58": "Granbury, TX",
  "HD-59": "Corsicana, TX", "HD-60": "Burleson, TX", "HD-61": "Fort Worth, TX",
  "HD-62": "Wichita Falls, TX", "HD-63": "North Richland Hills, TX",
  "HD-64": "Denton, TX", "HD-65": "Denton, TX", "HD-66": "Plano, TX",
  "HD-67": "Allen, TX", "HD-68": "Mesquite, TX", "HD-69": "Rowlett, TX",
  "HD-70": "Garland, TX", "HD-71": "Odessa, TX", "HD-72": "San Angelo, TX",
  "HD-73": "Kerrville, TX", "HD-74": "El Paso, TX", "HD-75": "El Paso, TX",
  "HD-76": "El Paso, TX", "HD-77": "El Paso, TX", "HD-78": "San Antonio, TX",
  "HD-79": "El Paso, TX", "HD-80": "Eagle Pass, TX", "HD-81": "Ector County, TX",
  "HD-82": "Midland, TX", "HD-83": "Lubbock, TX", "HD-84": "Lubbock, TX",
  "HD-85": "Amarillo, TX", "HD-86": "Amarillo, TX", "HD-87": "Amarillo, TX",
  "HD-88": "Lubbock, TX", "HD-89": "Big Spring, TX", "HD-90": "Fort Worth, TX",
  "HD-91": "Fort Worth, TX", "HD-92": "Fort Worth, TX", "HD-93": "Fort Worth, TX",
  "HD-94": "Fort Worth, TX", "HD-95": "Fort Worth, TX",
  "HD-96": "Keller, TX", "HD-97": "Fort Worth, TX", "HD-98": "Keller, TX",
  "HD-99": "Fort Worth, TX", "HD-100": "Dallas, TX", "HD-101": "Grand Prairie, TX",
  "HD-102": "Dallas, TX", "HD-103": "Richardson, TX", "HD-104": "Dallas, TX",
  "HD-105": "Irving, TX", "HD-106": "Carrollton, TX", "HD-107": "Dallas, TX",
  "HD-108": "Dallas, TX", "HD-109": "Dallas, TX", "HD-110": "Dallas, TX",
  "HD-111": "DeSoto, TX", "HD-112": "Dallas, TX", "HD-113": "Dallas, TX",
  "HD-114": "Dallas, TX", "HD-115": "Mesquite, TX", "HD-116": "San Antonio, TX",
  "HD-117": "San Antonio, TX", "HD-118": "San Antonio, TX",
  "HD-119": "San Antonio, TX", "HD-120": "San Antonio, TX",
  "HD-121": "San Antonio, TX", "HD-122": "San Antonio, TX",
  "HD-123": "San Antonio, TX", "HD-124": "San Antonio, TX",
  "HD-125": "San Antonio, TX", "HD-126": "Katy, TX", "HD-127": "Houston, TX",
  "HD-128": "Pasadena, TX", "HD-129": "Houston, TX", "HD-130": "Houston, TX",
  "HD-131": "Houston, TX", "HD-132": "Houston, TX", "HD-133": "Houston, TX",
  "HD-134": "Houston, TX", "HD-135": "Houston, TX", "HD-136": "Houston, TX",
  "HD-137": "Houston, TX", "HD-138": "Houston, TX", "HD-139": "Houston, TX",
  "HD-140": "Houston, TX", "HD-141": "Houston, TX", "HD-142": "Houston, TX",
  "HD-143": "Houston, TX", "HD-144": "Pasadena, TX", "HD-145": "Houston, TX",
  "HD-146": "Houston, TX", "HD-147": "Houston, TX", "HD-148": "Houston, TX",
  "HD-149": "Houston, TX", "HD-150": "Houston, TX",
};

// ── Ballotpedia scraping ────────────────────────────────────────────────────

/**
 * Attempt to scrape the candidate's residence/hometown from their Ballotpedia page.
 * Returns a city string like "Tyler, TX" or null.
 */
async function scrapeResidence(url) {
  if (!url || !url.includes("ballotpedia.org")) return null;

  try {
    const res = await httpClient.get(url, { responseType: "text" });
    const $ = cheerio.load(res.data);

    // Strategy 1: Look for "Residence" or "Home" in the infobox
    const infobox = $(".infobox, .votebox, .bpInfobox");
    let residence = null;

    infobox.find("tr, div").each((_, el) => {
      const text = $(el).text();
      // Match "Residence: CityName" or "Home: CityName" patterns in infobox
      const match = text.match(/(?:Residence|Home|Location)\s*[:]\s*(.+)/i);
      if (match && !residence) {
        residence = match[1].trim().replace(/\s+/g, " ");
      }
    });

    if (residence) return cleanCity(residence);

    // Strategy 2: Look for biographical text patterns
    const bodyText = $("#mw-content-text").text();

    // "lives in [City], Texas" or "lives in [City] County, Texas"
    const livesMatch = bodyText.match(/lives?\s+in\s+([A-Z][a-zA-Z\s]+(?:County)?),?\s*Texas/i);
    if (livesMatch) return cleanCity(livesMatch[1].trim() + ", TX");

    // "from [City], Texas"
    const fromMatch = bodyText.match(/(?:^|\.\s+)\w+\s+is\s+from\s+([A-Z][a-zA-Z\s]+),?\s*Texas/i);
    if (fromMatch) return cleanCity(fromMatch[1].trim() + ", TX");

    // "born in [City], Texas" (as last resort — birthplace isn't always current city)
    // Skip this for now — it's unreliable

    // Strategy 3: "of [City]" right after the candidate name in opening paragraph
    const firstPara = $("#mw-content-text p").first().text();
    const ofMatch = firstPara.match(/of\s+([A-Z][a-zA-Z\s]+),?\s*Texas/i);
    if (ofMatch) return cleanCity(ofMatch[1].trim() + ", TX");

    return null;
  } catch {
    return null;
  }
}

function cleanCity(raw) {
  if (!raw) return null;
  // Remove trailing periods, wiki refs, etc.
  let city = raw.replace(/\[.*?\]/g, "").replace(/\.\s*$/, "").trim();
  // Ensure it ends with ", TX" if it doesn't already
  if (!city.match(/,\s*TX$/i)) {
    if (!city.includes(",")) city += ", TX";
  }
  // Cap reasonable length
  if (city.length > 50) return null;
  return city;
}

/**
 * Get the fallback city for a candidate based on their district.
 */
function getDistrictCity(district) {
  if (!district) return null;
  const d = district.toUpperCase();
  return TX_CD_CITIES[d] || TX_SD_CITIES[d] || TX_HD_CITIES[d] || null;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Scrape Real Home Cities");
  console.log(`  Dry run : ${DRY_RUN}`);
  console.log(`  Delay   : ${DELAY_MS}ms`);
  console.log(`  Level   : ${LEVEL || "all"}`);
  console.log(`  Batch   : ${BATCH}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Find candidates with "Austin, TX" that need correction
  const query = {
    state: "TX",
    home_city: "Austin, TX",
  };
  if (LEVEL) {
    query.office_level = LEVEL;
  } else {
    query.office_level = { $in: ["federal", "state"] };
  }

  const candidates = await coll.find(query)
    .project({ name: 1, office: 1, district: 1, source_url: 1, office_level: 1, home_city: 1 })
    .limit(BATCH)
    .toArray();

  console.log(`Found ${candidates.length} candidates with 'Austin, TX' to fix.\n`);

  const stats = { scraped: 0, district_fallback: 0, unchanged: 0, errors: 0 };

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const progress = `[${i + 1}/${candidates.length}]`;

    // First try Ballotpedia scrape
    let newCity = null;
    if (c.source_url) {
      await sleep(DELAY_MS);
      newCity = await scrapeResidence(c.source_url);
      if (newCity) stats.scraped++;
    }

    // Fallback to district mapping
    if (!newCity && c.district) {
      newCity = getDistrictCity(c.district);
      if (newCity) stats.district_fallback++;
    }

    // Skip if we'd set it back to Austin (already correct for Austin-area districts)
    if (!newCity || newCity === "Austin, TX") {
      // Check if this candidate's district IS actually in Austin
      const distCity = getDistrictCity(c.district);
      if (distCity === "Austin, TX") {
        console.log(`${progress} ${c.name} — Austin, TX (confirmed correct for ${c.district})`);
      } else if (!newCity) {
        console.log(`${progress} ${c.name} — no city found, keeping Austin, TX`);
      }
      stats.unchanged++;
      continue;
    }

    console.log(`${progress} ${c.name} (${c.office}) → ${newCity}`);

    if (!DRY_RUN) {
      try {
        await coll.updateOne(
          { _id: c._id },
          { $set: { home_city: newCity, updated_at: new Date() } }
        );
      } catch (err) {
        console.error(`  ✗ DB update failed: ${err.message}`);
        stats.errors++;
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" Home City Scrape — Complete");
  console.log(`  Scraped from Ballotpedia : ${stats.scraped}`);
  console.log(`  District fallback        : ${stats.district_fallback}`);
  console.log(`  Unchanged (Austin OK)    : ${stats.unchanged}`);
  console.log(`  Errors                   : ${stats.errors}`);
  console.log("═══════════════════════════════════════════════════════");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
