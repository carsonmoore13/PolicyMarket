/**
 * Standalone TX seeder — run directly with Node.js:
 *   node seedTX.mjs
 *
 * Connects to MongoDB, seeds all 2026 Texas races (congressional + state
 * legislative) from Ballotpedia overview pages. No photos, includes bio
 * text as policy bullet points.
 *
 * Skips races already in the DB (idempotent — safe to re-run).
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB } from "./db.js";
import { seedStateRaces } from "./services/stateFullSeeder.js";

async function main() {
  console.log("=== PolicyMarket TX Seeder ===");
  try {
    await connectDB();
    console.log("Connected to MongoDB.\n");

    const stats = await seedStateRaces("TX");
    console.log(`\n=== TX Seeding complete ===`);
    console.log(`  Races processed : ${stats.races}`);
    console.log(`  Candidates saved: ${stats.saved}`);
    console.log(`  Already existed : ${stats.skipped}`);
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err.message);
    process.exit(1);
  }
}

main();
