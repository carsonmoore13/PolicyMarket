#!/usr/bin/env node
/**
 * seedWoodlandsLocal.mjs
 * 
 * Seeds all verified 2026 local candidates for 63 Driftoak Circle, The Woodlands, TX 77381.
 * Covers: Montgomery County, The Woodlands Township, Conroe ISD, district courts, DA.
 * 
 * Usage: node scripts/seedWoodlandsLocal.mjs
 */
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

const WOODLANDS_GEO = { lat: 30.1658, lng: -95.4613 };

const CANDIDATES = [
  // ════════════════════════════════════════════════════════════════════════
  // MONTGOMERY COUNTY — Countywide offices (March 3 Primary → Nov 3 General)
  // ════════════════════════════════════════════════════════════════════════

  // County Judge (already have Keough, Mack, Graf — adding none)
  
  // JP Precinct 1 — William Waggoner is missing from DB
  {
    name: "William Waggoner",
    office: "Montgomery County Justice of the Peace Precinct 1",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "primary",
    source_url: "https://ballotpedia.org/William_Waggoner_(Montgomery_County_Justice_of_the_Peace_Precinct_1,_Texas,_candidate_2026)",
    source_name: "Ballotpedia",
  },

  // TX 9th Judicial District Attorney (Special)
  {
    name: "Mike Holley",
    office: "9th Judicial District Attorney",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "nominee",
    source_url: "https://ballotpedia.org/Montgomery_County,_Texas,_elections,_2026",
    source_name: "Ballotpedia",
  },

  // District Courts
  {
    name: "Lisa Michalk",
    office: "221st District Court Judge",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "nominee",
    source_url: "https://ballotpedia.org/Montgomery_County,_Texas,_elections,_2026",
    source_name: "Ballotpedia",
  },
  {
    name: "Kristin Bays",
    office: "284th District Court Judge",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "nominee",
    source_url: "https://ballotpedia.org/Montgomery_County,_Texas,_elections,_2026",
    source_name: "Ballotpedia",
  },
  {
    name: "Michael H. Ghutzman",
    office: "359th District Court Judge",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "primary",
    source_url: "https://ballotpedia.org/Montgomery_County,_Texas,_elections,_2026",
    source_name: "Ballotpedia",
  },
  {
    name: "Jo Ann Linzer",
    office: "359th District Court Judge",
    office_level: "local",
    jurisdiction: "Montgomery County",
    state: "TX",
    party: "R",
    district: null,
    status_2026: "primary",
    source_url: "https://ballotpedia.org/Montgomery_County,_Texas,_elections,_2026",
    source_name: "Ballotpedia",
  },

  // ════════════════════════════════════════════════════════════════════════
  // THE WOODLANDS TOWNSHIP — Board of Directors (Nov 3 2026)
  // Filing opens July 18, 2026. No candidates filed yet.
  // We create placeholder race entries so the UI shows these offices exist.
  // ════════════════════════════════════════════════════════════════════════

  // NOTE: Current board members whose terms expire Nov 2026:
  // Position 1 — Craig Rickard (incumbent)
  // Position 2 — Jason Nelson (incumbent) 
  // Position 3 — John Anthony Brown (incumbent)
  // Position 4 — Steven Lawrence (incumbent)
  // Filing not yet open — no candidates to seed, but we mark the race

  // ════════════════════════════════════════════════════════════════════════
  // CONROE ISD SCHOOL BOARD — Positions 1, 2, 3 (Nov 3 2026)
  // Filing opens July 20, 2026. No candidates filed yet.
  // Current trustees whose terms expire 2026:
  //   Position 1 — Agueda Gambino
  //   Position 2 — Melissa Dungan  
  //   Position 3 — Misty Odenweller
  // ════════════════════════════════════════════════════════════════════════

  // No candidates to seed yet — filing deadline Aug 17, 2026
];

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Seed Local Candidates — The Woodlands / Montgomery Co   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const coll = db.collection("candidates");

  let inserted = 0;
  let skipped = 0;

  for (const c of CANDIDATES) {
    const doc = {
      ...c,
      geo: { lat: WOODLANDS_GEO.lat, lng: WOODLANDS_GEO.lng, geo_type: "county_center" },
      created_at: new Date(),
      updated_at: new Date(),
    };

    const result = await coll.updateOne(
      { name: c.name, office: c.office },
      { $setOnInsert: doc },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      console.log(`  + ${c.name} — ${c.office} (${c.party})`);
      inserted++;
    } else {
      console.log(`  = ${c.name} — already exists`);
      skipped++;
    }
  }

  // Also fix jurisdiction on existing Montgomery County candidates to ensure
  // they show up for The Woodlands addresses (candidateFilter checks jurisdiction)
  const fixResult = await coll.updateMany(
    {
      office: /Montgomery County/i,
      office_level: { $in: ["local", "city"] },
      $or: [
        { jurisdiction: { $exists: false } },
        { jurisdiction: null },
      ],
    },
    { $set: { jurisdiction: "Montgomery County" } },
  );
  if (fixResult.modifiedCount > 0) {
    console.log(`\n  Fixed jurisdiction on ${fixResult.modifiedCount} existing records`);
  }

  // Clear API cache
  await db.collection("api_cache").deleteMany({});
  console.log("  Cleared API cache\n");

  // Final count
  const total = await coll.countDocuments({
    state: "TX",
    office_level: { $in: ["local", "city"] },
    $or: [
      { jurisdiction: /montgomery/i },
      { office: /montgomery/i },
    ],
  });

  console.log(`═══ RESULTS ═══`);
  console.log(`  Inserted: ${inserted}, Skipped: ${skipped}`);
  console.log(`  Total Montgomery County local candidates: ${total}`);

  // Show race summary
  console.log("\n═══ RACE INVENTORY FOR THE WOODLANDS (77381) ═══\n");

  console.log("  COUNTY OFFICES (Montgomery County):");
  const countyRaces = await coll.aggregate([
    { $match: { jurisdiction: /montgomery/i, office_level: { $in: ["local", "city"] } } },
    { $group: { _id: "$office", count: { $sum: 1 }, candidates: { $push: { name: "$name", party: "$party" } } } },
    { $sort: { _id: 1 } },
  ]).toArray();
  for (const r of countyRaces) {
    const names = r.candidates.map(c => `${c.name} (${c.party})`).join(", ");
    console.log(`    ${r._id}: ${names}`);
  }

  console.log("\n  TOWNSHIP (The Woodlands) — Nov 3, 2026:");
  console.log("    Board of Directors Pos 1-4: Filing opens Jul 18 (no candidates yet)");

  console.log("\n  SCHOOL BOARD (Conroe ISD) — Nov 3, 2026:");
  console.log("    Positions 1, 2, 3: Filing opens Jul 20 (no candidates yet)");
  console.log("    Current: Agueda Gambino (Pos 1), Melissa Dungan (Pos 2), Misty Odenweller (Pos 3)");

  await client.close();
  process.exit(0);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
