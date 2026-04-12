/**
 * enrichPolicies.mjs
 *
 * Enriches candidates in Atlas with specific policy positions.
 *
 * Usage:
 *   node scripts/enrichPolicies.mjs                  # all levels, scrape federal/state
 *   node scripts/enrichPolicies.mjs --level local     # local only (no scraping, fast)
 *   node scripts/enrichPolicies.mjs --level federal   # federal only (with scraping)
 *   node scripts/enrichPolicies.mjs --limit 10        # process max 10 candidates
 *   node scripts/enrichPolicies.mjs --no-scrape       # skip Ballotpedia scraping
 */

import dotenv from "dotenv";
dotenv.config();

import { MongoClient } from "mongodb";
import { enrichPolicies } from "../services/policyEnricher.js";

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

// Parse CLI args
const args = process.argv.slice(2);
const levelIdx = args.indexOf("--level");
const limitIdx = args.indexOf("--limit");
const officeLevel = levelIdx > -1 ? args[levelIdx + 1] : undefined;
const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1], 10) : 0;
const scrape = !args.includes("--no-scrape");

console.log(`[EnrichPolicies] Connecting to Atlas...`);
console.log(`  Level: ${officeLevel || "all"}`);
console.log(`  Limit: ${limit || "none"}`);
console.log(`  Scrape Ballotpedia: ${scrape}`);

const client = await MongoClient.connect(MONGO_URI);
const db = client.db(DB_NAME);
const coll = db.collection("candidates");

// For local/county candidates, skip scraping (pages have no policy data)
const shouldScrape = scrape && officeLevel !== "local";

const result = await enrichPolicies(coll, {
  scrape: shouldScrape,
  limit,
  officeLevel,
  onProgress: (done, total, name) => {
    if (done % 50 === 0 || done === total) {
      console.log(`  [${done}/${total}] ${name}`);
    }
  },
});

console.log("\n=== Results ===");
console.log(`  Processed: ${result.processed}`);
console.log(`  Scraped from Ballotpedia: ${result.scraped}`);
console.log(`  Used office templates: ${result.templated}`);
console.log(`  Failed (no match): ${result.failed}`);

// Verify final state
const bySource = await coll
  .aggregate([
    { $group: { _id: "$policies_source", count: { $sum: 1 } } },
  ])
  .toArray();
console.log("\nPolicies source breakdown:");
bySource.forEach((s) => console.log(`  ${s._id || "(none)"}: ${s.count}`));

await client.close();
