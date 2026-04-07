#!/usr/bin/env node
/**
 * batchPhotos.mjs — Fetch headshots for all federal + statewide candidates.
 *
 * For each candidate without a photo:
 *   1. Try Ballotpedia infobox photo (via source_url slug)
 *   2. Try Wikipedia REST summary API
 *   3. Normalise to 400x400 JPEG
 *   4. Upload to S3
 *   5. Update MongoDB photo subdocument
 *
 * Generates initials placeholders for candidates with no photo found.
 *
 * Usage:  cd backend && node scripts/batchPhotos.mjs
 */

import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import { connectDB, getCandidatesCollection } from "../db.js";
import { processCandidate, pMap } from "../services/candidateImageService.js";

const CONCURRENCY = 2;

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   PolicyMarket — Batch Photo Pipeline (Federal + State)   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Find all federal + state candidates missing photos
  const candidates = await coll.find({
    office_level: { $in: ["federal", "state"] },
    $or: [
      { "photo.url": null },
      { "photo.url": { $exists: false } },
      { "photo.source": "not_found" },
    ],
  }).toArray();

  console.log(`Found ${candidates.length} candidates needing photos\n`);

  if (!candidates.length) {
    console.log("All candidates already have photos!");
    process.exit(0);
  }

  let success = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const progress = `[${i + 1}/${candidates.length}]`;
    process.stdout.write(`${progress} ${c.name.padEnd(35)} ${(c.office || "").padEnd(25)} `);

    try {
      const url = await processCandidate(c);
      if (url) {
        success++;
        process.stdout.write(`\n`);
      } else {
        notFound++;
        process.stdout.write(`— no photo found\n`);
      }
    } catch (err) {
      errors++;
      process.stdout.write(`— ERROR: ${err.message}\n`);
    }
  }

  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║                  PHOTO PIPELINE REPORT                    ║");
  console.log("╠═══════════════════════════════════════════════════════════╣");
  console.log(`║  Total processed:     ${String(candidates.length).padStart(5)}                              ║`);
  console.log(`║  Photos uploaded:     ${String(success).padStart(5)}                              ║`);
  console.log(`║  No photo found:      ${String(notFound).padStart(5)}                              ║`);
  console.log(`║  Errors:              ${String(errors).padStart(5)}                              ║`);
  console.log("╚═══════════════════════════════════════════════════════════╝");

  process.exit(0);
}

main().catch((err) => {
  console.error("\nFatal:", err);
  process.exit(1);
});
