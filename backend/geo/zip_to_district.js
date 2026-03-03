import axios from "axios";
import { getDB, getZipDistrictCacheCollection, getCandidatesCollection } from "../db.js";
import { resolveDistricts as localResolveDistricts } from "../services/zipResolver.js";
import { isAllowedCandidate } from "../services/candidateFilter.js";

const CENSUS_URL =
  "https://geocoding.geo.census.gov/geocoder/geographies/address?benchmark=Public_AR_Current&vintage=Current_Districts&layers=Congressional+Districts,State+Legislative+Districts+(Upper+Chamber),State+Legislative+Districts+(Lower+Chamber)&format=json";

async function safeGet(url, params) {
  const opts = {
    timeout: 5000,
    params,
  };
  const res = await axios.get(url, opts);
  return res.data;
}

export async function resolveZipToDistricts(zipCode) {
  const zip = String(zipCode).trim();
  if (!/^\d{5}$/.test(zip)) {
    throw new Error("Invalid ZIP code format");
  }

  const cacheColl = getZipDistrictCacheCollection();
  const cached = await cacheColl.findOne({ zip_code: zip });
  // For most ZIPs, trust the cached districts. For 78705 specifically, we
  // want to force an updated mapping to TX-37, so we skip the cache and
  // recompute/override below.
  if (cached && zip !== "78705") {
    return {
      congressional_district: cached.congressional_district,
      state_senate_district: cached.state_senate_district,
      state_house_district: cached.state_house_district,
      city: cached.city,
      county: cached.county,
      lat: cached.lat,
      lng: cached.lng,
    };
  }

  // Fallback to existing ZIP service to get basic lat/lng and city
  const zippopotam = await axios
    .get(`https://api.zippopotam.us/us/${zip}`, { timeout: 5000 })
    .then((r) => r.data)
    .catch(() => null);

  let city = null;
  let stateAbbr = "TX";
  let lat = null;
  let lng = null;
  if (zippopotam?.places?.[0]) {
    const place = zippopotam.places[0];
    city = place["place name"] || null;
    stateAbbr = place["state abbreviation"] || "TX";
    lat = parseFloat(place.latitude);
    lng = parseFloat(place.longitude);
  }

  let congressional_district = null;
  let state_senate_district = null;
  let state_house_district = null;
  let county = null;

  try {
    const data = await safeGet(CENSUS_URL, {
      zip_code: zip,
      street: "",
      city: "",
      state: stateAbbr,
    });
    const result = data?.result;
    const geos = result?.geographies || {};

    const cd = geos["Congressional Districts"]?.[0];
    if (cd?.CD116 || cd?.CD) {
      const raw = cd.CD116 || cd.CD;
      const num = String(raw).padStart(2, "0");
      congressional_district = `${stateAbbr}-${num}`;
    }

    const upper = geos["State Legislative Districts (Upper Chamber)"]?.[0];
    if (upper?.SLDU) {
      const num = String(upper.SLDU).padStart(2, "0");
      state_senate_district = `SD-${parseInt(num, 10)}`;
    }

    const lower = geos["State Legislative Districts (Lower Chamber)"]?.[0];
    if (lower?.SLDL) {
      const num = String(lower.SLDL).padStart(3, "0");
      state_house_district = `HD-${num}`;
    }

    if (cd?.COUNTY) {
      county = cd.COUNTY;
    } else if (upper?.COUNTY) {
      county = upper.COUNTY;
    } else if (lower?.COUNTY) {
      county = lower.COUNTY;
    }
  } catch (err) {
    // Fall back to existing local resolver for Texas ZIPs
    try {
      if (stateAbbr === "TX" && lat != null && lng != null) {
        const districts = localResolveDistricts(lat, lng, stateAbbr, zip);
        congressional_district = districts.congressional || null;
        state_senate_district = districts.state_senate || null;
        state_house_district = districts.state_house || null;
      }
    } catch {
      // ignore
    }
  }

  // Hard override for known post-redistricting cases where external APIs
  // may lag reality. UT Austin / 78705 should be TX-37, not TX-21.
  if (zip === "78705") {
    congressional_district = "TX-37";
    if (!state_senate_district) state_senate_district = "SD-14";
    if (!state_house_district) state_house_district = "HD-049";
  }

  const doc = {
    zip_code: zip,
    congressional_district,
    state_senate_district,
    state_house_district,
    city,
    county,
    lat,
    lng,
    cached_at: new Date(),
  };
  await cacheColl.updateOne({ zip_code: zip }, { $set: doc }, { upsert: true });

  return {
    congressional_district,
    state_senate_district,
    state_house_district,
    city,
    county,
    lat,
    lng,
  };
}

export async function getCandidatesByZip(zipCode) {
  const zip = String(zipCode).trim();
  const districts = await resolveZipToDistricts(zip);
  const candidatesColl = getCandidatesCollection();

  const query = {
    $or: [
      { district: districts.congressional_district, office_level: "federal" },
      { district: districts.state_senate_district, office_level: "state" },
      { district: districts.state_house_district, office_level: "state" },
      districts.city
        ? {
            jurisdiction: { $regex: districts.city, $options: "i" },
            office_level: "city",
          }
        : null,
    ].filter(Boolean),
  };

  const all = await candidatesColl.find(query).toArray();
  const filtered = all.filter(isAllowedCandidate);

  // Update zip_codes and district_zip_map for matched candidates
  const bulk = candidatesColl.initializeUnorderedBulkOp();
  for (const c of filtered) {
    const zipCodes = Array.isArray(c.zip_codes) ? c.zip_codes : [];
    if (!zipCodes.includes(zip)) {
      zipCodes.push(zip);
    }
    const dzm = c.district_zip_map || {
      state: "TX",
      district: c.district || null,
      zip_codes: [],
    };
    if (!Array.isArray(dzm.zip_codes)) dzm.zip_codes = [];
    if (!dzm.zip_codes.includes(zip)) {
      dzm.zip_codes.push(zip);
    }
    bulk.find({ _id: c._id }).updateOne({
      $set: {
        zip_codes: zipCodes,
        district_zip_map: dzm,
      },
    });
  }
  if (bulk.length > 0) {
    await bulk.execute();
  }

  return { districts, candidates: filtered };
}

// CLI: node backend/geo/zip_to_district.js --zip=78701
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv
    .slice(2)
    .find((a) => a.startsWith("--zip="));
  const zip = arg ? arg.split("=")[1] : null;
  if (!zip) {
    // eslint-disable-next-line no-console
    console.error("Usage: node geo/zip_to_district.js --zip=78701");
    process.exit(1);
  }
  import("../server.js")
    .then(() => getDB())
    .then(() => getCandidatesByZip(zip))
    .then(({ districts, candidates }) => {
      // eslint-disable-next-line no-console
      console.log("Districts:", districts);
      // eslint-disable-next-line no-console
      console.log("Candidates:", candidates.map((c) => c.name));
      process.exit(0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}

