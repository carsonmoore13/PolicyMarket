/**
 * updateCandidateGeo.mjs
 *
 * Updates MongoDB candidate geo.lat / geo.lng for all TX candidates to use
 * accurate district centroids (Census TIGER interior label points).
 *
 * Priority:
 *   1. District centroid (congressional / state senate / state house)
 *   2. TX geographic center for statewide offices
 *
 * Run: node scripts/updateCandidateGeo.mjs
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { DISTRICT_CENTROIDS } from "../../frontend/src/utils/districtCentroids.js";

// TX geographic center (not Austin — better for statewide races)
const TX_CENTER = { lat: 31.0, lng: -98.5 };

function districtGeoType(key) {
  if (key.startsWith("TX-")) return "congressional_district";
  if (key.startsWith("SD-")) return "state_senate_district";
  if (key.startsWith("HD-")) return "state_house_district";
  return "district";
}

function getCentroid(district) {
  if (!district) return null;
  const key = district.toUpperCase().trim();
  const entry = DISTRICT_CENTROIDS[key];
  if (!entry) return null;
  const [lat, lng] = entry;
  return { lat, lng, geo_type: districtGeoType(key) };
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log(" PolicyMarket — Candidate Geo Coordinate Updater");
  console.log(`  Using ${Object.keys(DISTRICT_CENTROIDS).length} district centroids`);
  console.log("═══════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  const candidates = await coll.find({ state: "TX" })
    .project({ _id: 1, name: 1, district: 1, office: 1, office_level: 1, geo: 1 })
    .toArray();

  console.log(`Processing ${candidates.length} TX candidates…\n`);

  let updated = 0;
  let statewide = 0;
  let noChange = 0;

  for (const c of candidates) {
    const centroid = getCentroid(c.district);

    let newLat, newLng, geoType;

    if (centroid) {
      newLat = centroid.lat;
      newLng = centroid.lng;
      geoType = centroid.geo_type;
    } else {
      // Statewide (Governor, AG, US Senator, etc.)
      newLat = TX_CENTER.lat;
      newLng = TX_CENTER.lng;
      geoType = "state_center";
      statewide++;
    }

    // Skip if coordinate is already correct (< 10m difference)
    const cur = c.geo || {};
    const latDiff = Math.abs((cur.lat || 0) - newLat);
    const lngDiff = Math.abs((cur.lng || 0) - newLng);
    if (latDiff < 0.0001 && lngDiff < 0.0001 && cur.geo_type === geoType) {
      noChange++;
      continue;
    }

    await coll.updateOne(
      { _id: c._id },
      {
        $set: {
          "geo.lat":            newLat,
          "geo.lng":            newLng,
          "geo.geo_type":       geoType,
          "geo.geo_source":     "census_tiger",
          "geo.geojson_point":  { type: "Point", coordinates: [newLng, newLat] },
          updated_at:           new Date(),
        },
      }
    );
    updated++;
  }

  // Coverage report
  const byType = {};
  for (const c of candidates) {
    const centroid = getCentroid(c.district);
    const t = centroid ? centroid.geo_type : "state_center";
    byType[t] = (byType[t] || 0) + 1;
  }

  console.log("═══════════════════════════════════════════════════");
  console.log(` Done: ${updated} updated, ${noChange} unchanged`);
  console.log("\n Coverage by geo_type:");
  Object.entries(byType).sort().forEach(([t, n]) => console.log(`   ${t}: ${n}`));
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
