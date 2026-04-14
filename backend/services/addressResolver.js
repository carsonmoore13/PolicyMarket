/**
 * addressResolver.js
 *
 * Resolves a voter's street address to their exact 2026-election legislative
 * districts using a two-stage approach:
 *
 * Stage 1 — Geocoding (lat/lng):
 *   US Census Bureau Geocoder API (free, no key, always used)
 *
 * Stage 2 — District lookup (election-accurate):
 *   PRIMARY:  Google Civic Information API v2
 *             - Maintained by Google's elections team; updated when states redistrict
 *             - Uses election-cycle boundaries (2026-accurate for TX)
 *             - Free at 25,000 req/day; requires GOOGLE_CIVIC_API_KEY in .env
 *             - Get a free key: https://console.cloud.google.com → Civic Information API
 *   FALLBACK: US Census Geocoder (uses 119th Congress / 2024 state legislative boundaries)
 *             - Congressional districts may lag after a state redistricts
 *             - State legislative districts are current for TX 2026 (no 2025 state-leg redistrict)
 *
 * WHY TWO SOURCES:
 *   Texas redistricted congressional maps in August 2025 for the 2026 elections.
 *   The Census Geocoder still returns 2021-vintage congressional boundaries
 *   (e.g. TX-21 instead of TX-20 for north San Antonio). Google Civic is
 *   election-aware and reflects the correct 2026 district numbers.
 */

import axios from "axios";
import { getZipDistrictCacheCollection } from "../db.js";

const CENSUS_GEO_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/address";
const GOOGLE_CIVIC_URL =
  "https://www.googleapis.com/civicinfo/v2/representatives";

// Normalize a cache key from address components.
export function normalizeAddressKey({ street, city, state }) {
  return [street, city, state]
    .map((s) => (s || "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

// ─── Stage 1: Census Geocoder (lat/lng + fallback districts) ─────────────────

async function censusGeocode({ street, city, state, zip }) {
  const params = {
    street,
    city,
    state,
    benchmark: "Public_AR_Current",
    vintage: "Current_Current",
    layers: "All",
    format: "json",
  };
  if (zip) params.zip = zip;

  const res = await axios.get(CENSUS_GEO_URL, { params, timeout: 12000 });
  const match = res.data?.result?.addressMatches?.[0];
  if (!match) return null;

  const lat = match.coordinates?.y ?? null;
  const lng = match.coordinates?.x ?? null;
  const returnedCity = match.addressComponents?.city || city;
  const returnedState = match.addressComponents?.state || state;
  const geos = match.geographies || {};

  function findGeoLayer(pattern) {
    const key = Object.keys(geos).find((k) => pattern.test(k));
    return key ? geos[key][0] : null;
  }

  // Congressional (119th Congress vintage — may be one cycle behind after redistricting)
  let congressional = null;
  const cdRaw = findGeoLayer(/Congressional Districts/i);
  if (cdRaw) {
    const cdField = Object.keys(cdRaw).find((k) => /^CD\d+$/.test(k));
    const num = (cdField ? cdRaw[cdField] : null) ?? cdRaw.BASENAME;
    if (num != null) congressional = `${returnedState}-${parseInt(String(num), 10)}`;
  }

  // State Senate — 2024 vintage (correct for 2026 in TX; TX didn't redistrict state-leg in 2025)
  let state_senate = null;
  const upperRaw = findGeoLayer(/State Legislative Districts.*Upper/i);
  if (upperRaw) {
    const num = upperRaw.SLDU ?? upperRaw.BASENAME;
    if (num != null) state_senate = `SD-${parseInt(String(num), 10)}`;
  }

  // State House — same vintage note as state senate
  let state_house = null;
  const lowerRaw = findGeoLayer(/State Legislative Districts.*Lower/i);
  if (lowerRaw) {
    const num = lowerRaw.SLDL ?? lowerRaw.BASENAME;
    if (num != null) state_house = `HD-${parseInt(String(num), 10)}`;
  }

  // County
  const countyRaw = findGeoLayer(/^Counties$/i);
  const county = countyRaw?.NAME ?? null;

  // Unified K–12 district (Census TIGER); used to zone school-board races to the voter's ISD.
  const schoolRaw = findGeoLayer(/^Unified School Districts$/i);
  const school_district = schoolRaw?.NAME ?? schoolRaw?.BASENAME ?? null;

  return {
    lat,
    lng,
    city: returnedCity,
    state: returnedState,
    county,
    congressional,
    state_senate,
    state_house,
    school_district,
  };
}

// ─── Stage 2: Google Civic API (election-accurate 2026 districts) ─────────────

/**
 * Parses OCD division IDs returned by Google Civic into our district format.
 *
 * OCD format examples:
 *   ocd-division/country:us/state:tx/cd:20       → TX-20
 *   ocd-division/country:us/state:tx/sldu:14     → SD-14
 *   ocd-division/country:us/state:tx/sldl:49     → HD-49
 */
function parseOcdDivisions(divisions, stateAbbr) {
  const st = stateAbbr.toLowerCase();
  let congressional = null;
  let state_senate = null;
  let state_house = null;

  for (const ocdId of Object.keys(divisions)) {
    // Congressional district
    const cdMatch = ocdId.match(
      new RegExp(`country:us/state:${st}/cd:(\\d+)`, "i")
    );
    if (cdMatch) {
      congressional = `${stateAbbr.toUpperCase()}-${parseInt(cdMatch[1], 10)}`;
      continue;
    }

    // State Senate (upper chamber)
    const sldMatch = ocdId.match(
      new RegExp(`country:us/state:${st}/sldu:(\\d+)`, "i")
    );
    if (sldMatch) {
      state_senate = `SD-${parseInt(sldMatch[1], 10)}`;
      continue;
    }

    // State House (lower chamber)
    const slhMatch = ocdId.match(
      new RegExp(`country:us/state:${st}/sldl:(\\d+)`, "i")
    );
    if (slhMatch) {
      state_house = `HD-${parseInt(slhMatch[1], 10)}`;
    }
  }

  return { congressional, state_senate, state_house };
}

async function googleCivicDistricts({ street, city, state, zip }) {
  const apiKey = process.env.GOOGLE_CIVIC_API_KEY;
  if (!apiKey) return null; // key not configured — caller will use Census fallback

  const address = [street, city, state, zip].filter(Boolean).join(", ");

  try {
    const res = await axios.get(GOOGLE_CIVIC_URL, {
      params: {
        address,
        key: apiKey,
        // Request both federal (country) and state (administrativeArea1) levels
        levels: ["country", "administrativeArea1"],
        roles: ["legislatorUpperBody", "legislatorLowerBody"],
      },
      timeout: 10000,
    });

    const divisions = res.data?.divisions || {};
    if (!Object.keys(divisions).length) return null;

    return parseOcdDivisions(divisions, state);
  } catch (err) {
    // Log and fall through to Census fallback; don't crash the whole lookup.
    console.warn(`[addressResolver] Google Civic API failed: ${err.message}`);
    return null;
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Resolve a voter address to lat/lng + 2026-accurate legislative districts.
 *
 * @param {{ street: string, city: string, state: string, zip?: string }} params
 * @returns {Promise<{ lat, lng, city, state, county, districts: { congressional, state_senate, state_house, locality, school_district } }>}
 */
export async function resolveAddress({ street, city, state, zip }) {
  if (!street || !city || !state) {
    throw new Error("street, city, and state are required");
  }

  const cacheKey = normalizeAddressKey({ street, city, state });
  const cacheColl = getZipDistrictCacheCollection();

  // Return cached result if available.
  const cached = await cacheColl.findOne({ address_key: cacheKey });
  if (cached?.districts) {
    let districts = cached.districts;
    // Backfill school district for older cache entries (pre-zoning).
    if (districts.school_district == null) {
      const patch = await censusGeocode({ street, city, state, zip });
      if (patch?.school_district) {
        districts = { ...districts, school_district: patch.school_district };
        await cacheColl.updateOne(
          { address_key: cacheKey },
          { $set: { districts, county: cached.county ?? patch.county } },
        );
      }
    }
    return {
      lat: cached.lat,
      lng: cached.lng,
      city: cached.city || city,
      state: cached.state || state,
      county: cached.county || null,
      districts,
    };
  }

  // Stage 1: Census Geocoder → lat/lng + fallback districts
  const censusResult = await censusGeocode({ street, city, state, zip });
  if (!censusResult) {
    throw new Error(
      `Address not found: "${street}, ${city}, ${state}". Please check the address and try again.`
    );
  }

  const { lat, lng } = censusResult;
  const returnedCity = censusResult.city;
  const returnedState = censusResult.state;
  const county = censusResult.county;

  // Stage 2: Google Civic API → 2026-accurate congressional + state legislative districts
  // Falls back to Census values if key is missing or request fails.
  const civicDistricts = await googleCivicDistricts({ street, city: returnedCity, state: returnedState, zip });

  const congressional = civicDistricts?.congressional ?? censusResult.congressional;
  const state_senate  = civicDistricts?.state_senate  ?? censusResult.state_senate;
  const state_house   = civicDistricts?.state_house   ?? censusResult.state_house;

  const locality = returnedCity || city || null;
  const school_district = censusResult.school_district ?? null;

  const result = {
    lat,
    lng,
    city: returnedCity,
    state: returnedState,
    county,
    districts: { congressional, state_senate, state_house, locality, school_district },
  };

  // Cache the resolved result.
  await cacheColl.updateOne(
    { address_key: cacheKey },
    {
      $set: {
        address_key: cacheKey,
        street,
        city: returnedCity,
        state: returnedState,
        county,
        lat,
        lng,
        districts: result.districts,
        district_source: civicDistricts ? "google_civic" : "census_fallback",
        cached_at: new Date(),
      },
    },
    { upsert: true }
  );

  return result;
}
