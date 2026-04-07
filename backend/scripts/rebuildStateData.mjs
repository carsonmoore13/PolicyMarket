#!/usr/bin/env node
/**
 * rebuildStateData.mjs — Rebuild all TX statewide + federal + legislative data.
 *
 * Keeps existing county data intact. Removes placeholder records, then runs
 * the full state seeder which discovers:
 *   - Governor, Lt Gov, AG, Comptroller, Land Comm, Ag Comm, Railroad Comm
 *   - US Senate, all 38 US House districts
 *   - State Senate overview, State House overview
 *
 * Usage:  cd backend && node scripts/rebuildStateData.mjs
 */

import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB = process.env.MONGO_DB_NAME || "elections_2026";
const STATE = "TX";

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║     PolicyMarket — TX State Data Rebuild                  ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  console.log("Connected to MongoDB\n");

  const db = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  // Baseline
  const before = await coll.countDocuments();
  const byLevel = await coll.aggregate([{ $group: { _id: "$office_level", count: { $sum: 1 } } }]).toArray();
  console.log(`Before: ${before} total candidates`);
  for (const l of byLevel) console.log(`  ${l._id}: ${l.count}`);

  // Step 1: Remove placeholder/sample records
  console.log("\n── Cleaning placeholders ──");
  const cleaned = await coll.deleteMany({
    $or: [
      { name: /^Sample/i },
      { name: "City Council" },
      { name: /^City Council/ },
      { name: /^Council/ },
      { name: /^Committees/ },
      { name: /^Public Participation/ },
      { name: /^New!/ },
      { party: null, office_level: "state" },
    ],
  });
  console.log(`Removed ${cleaned.deletedCount} placeholder records`);

  // Step 2: Clear API cache
  await db.collection("api_cache").deleteMany({});
  console.log("Cleared API cache\n");

  await client.close();

  // Step 3: Run the full state seeder (imports db.js which manages its own connection)
  console.log("── Running full state seeder ──\n");

  // Dynamic import so dotenv is loaded first
  const { connectDB } = await import("../db.js");
  await connectDB();

  const { seedStateRaces } = await import("../services/stateFullSeeder.js");
  const stats = await seedStateRaces(STATE);

  console.log("\n── Seeder complete ──");
  console.log(`  Races discovered: ${stats.races}`);
  console.log(`  Candidates saved: ${stats.saved} / ${stats.total} processed`);

  // Final count
  const client2 = new MongoClient(MONGO_URI);
  await client2.connect();
  const coll2 = client2.db(MONGO_DB).collection("candidates");
  const after = await coll2.countDocuments();
  const afterByLevel = await coll2.aggregate([{ $group: { _id: "$office_level", count: { $sum: 1 } } }]).toArray();
  const stateOffices = await coll2.aggregate([
    { $match: { office_level: "state", district: null } },
    { $group: { _id: "$office", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║                   REBUILD COMPLETE                        ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Before: ${String(before).padStart(5)} total candidates                    ║`);
  console.log(`║  After:  ${String(after).padStart(5)} total candidates                    ║`);
  console.log(`║  Net:    ${String(after - before).padStart(5)} added                              ║`);
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  for (const l of afterByLevel.sort((a, b) => b.count - a.count)) {
    console.log(`║  ${(l._id || "unknown").padEnd(12)} ${String(l.count).padStart(5)} candidates                    ║`);
  }
  console.log(`╠═══════════════════════════════════════════════════════════╣`);
  console.log(`║  Statewide executive offices:                             ║`);
  for (const o of stateOffices) {
    console.log(`║    ${o._id.padEnd(28)} ${String(o.count).padStart(2)} candidates          ║`);
  }
  console.log(`╚═══════════════════════════════════════════════════════════╝`);

  await client2.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
