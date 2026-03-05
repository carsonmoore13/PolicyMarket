import axios from "axios";
import { NOMINATIM_USER_AGENT, REQUESTS_TIMEOUT, RATE_LIMIT_DELAY } from "../config.js";
import { createGeoPoint } from "./models.js";
import * as dc from "./districtCentroids.js";
import { getOrCreateGeoCache } from "../db.js";

const bboxNone = { north: null, south: null, east: null, west: null };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function nominatimGeocode(jurisdiction, district) {
  await sleep(RATE_LIMIT_DELAY * 1000);
  const q = district ? `${district}, ${jurisdiction}` : jurisdiction;
  try {
    const { data } = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q, format: "json", limit: 1 },
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      timeout: REQUESTS_TIMEOUT * 1000,
    });
    if (!data || !data[0]) return null;
    const item = data[0];
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    let bounding_box = bboxNone;
    if (item.boundingbox && item.boundingbox.length >= 4) {
      try {
        bounding_box = {
          south: parseFloat(item.boundingbox[0]),
          north: parseFloat(item.boundingbox[1]),
          west: parseFloat(item.boundingbox[2]),
          east: parseFloat(item.boundingbox[3]),
        };
      } catch (_) {}
    }
    return createGeoPoint({
      jurisdiction_name: jurisdiction,
      lat,
      lng,
      geo_type: "district_centroid",
      geo_source: "nominatim",
      bounding_box,
    });
  } catch (err) {
    console.warn("Nominatim geocode failed for", q, err.message);
    return null;
  }
}

async function computeCentroid(officeLevel, jurisdiction, district) {
  const jurisdictionName = jurisdiction || "Texas";

  if (officeLevel === "city" && jurisdiction && jurisdiction.toLowerCase().includes("austin")) {
    let num = null;
    if (district) {
      const m = district.match(/(?:district\s*)?(\d+)/i);
      if (m) num = parseInt(m[1], 10);
    }
    if (num != null && num >= 1 && num <= 10 && dc.AUSTIN_COUNCIL[num]) {
      const [lat, lng] = dc.AUSTIN_COUNCIL[num];
      return createGeoPoint({
        jurisdiction_name: jurisdictionName,
        lat,
        lng,
        geo_type: "district_centroid",
        geo_source: "census_tiger",
        bounding_box: bboxNone,
      });
    }
    const [lat, lng] = dc.AUSTIN_CENTROID;
    return createGeoPoint({
      jurisdiction_name: jurisdictionName,
      lat,
      lng,
      geo_type: "city_centroid",
      geo_source: "hardcoded_fallback",
      bounding_box: bboxNone,
    });
  }

  if (officeLevel === "state") {
    let num = null;
    if (district) {
      let m = district.match(/SD-?(\d+)/i);
      if (m) {
        num = parseInt(m[1], 10);
        if (num >= 1 && num <= 31 && dc.TX_SENATE[num]) {
          const [lat, lng] = dc.TX_SENATE[num];
          return createGeoPoint({
            jurisdiction_name: jurisdictionName,
            lat,
            lng,
            geo_type: "district_centroid",
            geo_source: "census_tiger",
            bounding_box: bboxNone,
          });
        }
      }
      m = district.match(/HD-?(\d+)/i) || district.match(/(\d{1,3})\b/);
      if (m) {
        num = parseInt(m[1], 10);
        if (num >= 1 && num <= 150 && dc.TX_HOUSE[num]) {
          const [lat, lng] = dc.TX_HOUSE[num];
          return createGeoPoint({
            jurisdiction_name: jurisdictionName,
            lat,
            lng,
            geo_type: "district_centroid",
            geo_source: "census_tiger",
            bounding_box: bboxNone,
          });
        }
      }
    }
    // For statewide offices without a specific district (e.g., Governor),
    // use Austin as the representative location instead of the raw state centroid.
    const [lat, lng] = dc.AUSTIN_CENTROID || dc.TEXAS_CENTROID;
    return createGeoPoint({
      jurisdiction_name: jurisdictionName,
      lat,
      lng,
      geo_type: "state_centroid",
      geo_source: "hardcoded_fallback",
      bounding_box: bboxNone,
    });
  }

  if (officeLevel === "federal") {
    let num = null;
    if (district) {
      const m = district.match(/TX-?(\d+)/i) || district.match(/(\d{1,2})\b/);
      if (m) {
        num = parseInt(m[1], 10);
        if (num >= 1 && num <= 38 && dc.TX_CONGRESSIONAL[num]) {
          const [lat, lng] = dc.TX_CONGRESSIONAL[num];
          return createGeoPoint({
            jurisdiction_name: jurisdictionName,
            lat,
            lng,
            geo_type: "district_centroid",
            geo_source: "census_tiger",
            bounding_box: bboxNone,
          });
        }
      }
    }
    // For statewide federal offices (U.S. Senate) where district is null,
    // also use Austin as the representative "base" location.
    const [lat, lng] = dc.AUSTIN_CENTROID || dc.TEXAS_CENTROID;
    return createGeoPoint({
      jurisdiction_name: jurisdictionName,
      lat,
      lng,
      geo_type: "state_centroid",
      geo_source: "hardcoded_fallback",
      bounding_box: bboxNone,
    });
  }

  const pt = await nominatimGeocode(jurisdiction, district);
  if (pt) return pt;
  const [lat, lng] = dc.TEXAS_CENTROID;
  return createGeoPoint({
    jurisdiction_name: jurisdictionName || "Texas",
    lat,
    lng,
    geo_type: "state_centroid",
    geo_source: "hardcoded_fallback",
    bounding_box: bboxNone,
  });
}

export async function getJurisdictionCentroid(officeLevel, jurisdiction, district) {
  const key = `${officeLevel}|${jurisdiction || ""}|${district || ""}`;
  try {
    const geoDoc = await getOrCreateGeoCache(key, async () => computeCentroid(officeLevel, jurisdiction, district));
    if (geoDoc && typeof geoDoc.lat === "number" && typeof geoDoc.lng === "number") {
      return createGeoPoint({
        jurisdiction_name: geoDoc.jurisdiction_name,
        lat: geoDoc.lat,
        lng: geoDoc.lng,
        geo_type: geoDoc.geo_type,
        geo_source: geoDoc.geo_source,
        bounding_box: geoDoc.bounding_box ?? null,
      });
    }
  } catch (err) {
    console.warn("Geo cache lookup failed", key, err.message);
  }
  return await computeCentroid(officeLevel, jurisdiction, district);
}
