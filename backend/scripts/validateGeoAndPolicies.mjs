import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection } from "../db.js";
import { DISTRICT_CENTROIDS } from "../../frontend/src/utils/districtCentroids.js";

await connectDB();
const coll = getCandidatesCollection();

console.log("═══════════════════════════════════════════════════════");
console.log(" Validation: Geo + Policy coverage for TX candidates");
console.log("═══════════════════════════════════════════════════════\n");

const total = await coll.countDocuments({ state: "TX" });

// Geo type distribution
const geoTypes = await coll.aggregate([
  { $match: { state: "TX" } },
  { $group: { _id: "$geo.geo_type", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
]).toArray();

console.log("Geo type distribution:");
geoTypes.forEach(g => console.log(`  ${g._id || "null"}: ${g.count}`));

// Any candidates still at state_capital
const atCapital = await coll.countDocuments({ state: "TX", "geo.geo_type": "state_capital" });
console.log(`\nStill at state_capital: ${atCapital}`);

// Policy coverage
const withPolicies = await coll.countDocuments({ state: "TX", policies: { $exists: true, $not: { $size: 0 } } });
console.log(`With non-empty policies: ${withPolicies}/${total}`);

// Spot-check: verify 5 HD candidates have correct coordinates
const hdSamples = await coll.find({ state: "TX", district: { $regex: /^HD-/ } })
  .limit(5).project({ name: 1, district: 1, "geo.lat": 1, "geo.lng": 1, "geo.geo_type": 1, policies: 1 }).toArray();

console.log("\nState House spot-check (5 candidates):");
hdSamples.forEach(c => {
  const key = c.district?.toUpperCase();
  const expected = DISTRICT_CENTROIDS[key];
  const actual = [c.geo?.lat?.toFixed(4), c.geo?.lng?.toFixed(4)];
  const match = expected && Math.abs(expected[0] - c.geo?.lat) < 0.01 && Math.abs(expected[1] - c.geo?.lng) < 0.01;
  console.log(`  ${c.name} [${c.district}]: geo=[${actual}] ${match ? "✓ centroid match" : "✗ MISMATCH"}  policies=${c.policies?.length || 0}`);
});

// Spot-check congressional
const txSamples = await coll.find({ state: "TX", district: { $regex: /^TX-/ } })
  .limit(5).project({ name: 1, district: 1, "geo.lat": 1, "geo.lng": 1, "geo.geo_type": 1 }).toArray();

console.log("\nCongressional spot-check (5 candidates):");
txSamples.forEach(c => {
  const key = c.district?.toUpperCase();
  const expected = DISTRICT_CENTROIDS[key];
  const match = expected && Math.abs(expected[0] - c.geo?.lat) < 0.01 && Math.abs(expected[1] - c.geo?.lng) < 0.01;
  console.log(`  ${c.name} [${c.district}]: geo=[${c.geo?.lat?.toFixed(4)}, ${c.geo?.lng?.toFixed(4)}] ${match ? "✓" : "✗"}`);
});

console.log("\n═══════════════════════════════════════════════════════");
console.log(` Total TX candidates: ${total}`);
console.log(` All with policies: ${withPolicies === total ? "YES ✓" : `NO — ${total - withPolicies} missing`}`);
console.log(`DISTRICT_CENTROIDS size: ${Object.keys(DISTRICT_CENTROIDS).length} entries`);
process.exit(0);
