/**
 * fixMissingHeadshots.mjs
 *
 * Targeted script to find and upload headshots for candidates that currently
 * have placeholder initials or bad/fake photos (e.g. Ballotpedia SubmitPhoto).
 *
 * Targets:
 *   - photo.source === "initials_placeholder"
 *   - photo.source === "not_found"
 *   - photo.original_url matching known placeholder patterns
 *
 * Uses the existing processCandidate pipeline with force=true to re-scrape
 * from Ballotpedia and Wikipedia.
 *
 * Run:
 *   node scripts/fixMissingHeadshots.mjs
 *
 * Env options:
 *   DRY_RUN=true    List candidates that would be processed without uploading
 *   CONCURRENCY=2   Parallel uploads (default 2 — be gentle on Ballotpedia)
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { processCandidate, pMap } from "../services/candidateImageService.js";

const DRY_RUN = process.env.DRY_RUN === "true";
const CONC = parseInt(process.env.CONCURRENCY || "2", 10);

const stats = {
  total: 0,
  uploaded: 0,
  notFound: 0,
  errors: 0,
};

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Fix Missing Headshots");
  console.log(`  Concurrency: ${CONC}`);
  console.log(`  Dry run    : ${DRY_RUN}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Find all candidates with placeholder/missing photos
  const candidates = await coll.find({
    state: "TX",
    $or: [
      { "photo.source": "initials_placeholder" },
      { "photo.source": "not_found" },
      { "photo.source": { $exists: false } },
      { "photo.url": null },
      { "photo.url": { $exists: false } },
      // Catch bad placeholders that slipped through (e.g. SubmitPhoto)
      { "photo.original_url": { $regex: /SubmitPhoto/i } },
      { "photo.original_url": { $regex: /BP-Initials/i } },
    ],
  }).toArray();

  stats.total = candidates.length;

  if (!candidates.length) {
    console.log("All candidates already have photos. Nothing to do!");
    process.exit(0);
  }

  console.log(`Found ${candidates.length} candidate(s) needing headshots:\n`);

  // Print list
  for (const c of candidates) {
    const src = c.photo?.source || "none";
    const origUrl = c.photo?.original_url || "";
    const isBadPlaceholder = /SubmitPhoto|BP-Initials/i.test(origUrl);
    const flag = isBadPlaceholder ? " [BAD PLACEHOLDER]" : "";
    console.log(`  - ${c.name} (${c.office || "?"}) — photo.source: ${src}${flag}`);
  }
  console.log();

  if (DRY_RUN) {
    console.log("[DRY_RUN] Exiting without processing.");
    process.exit(0);
  }

  // Process each candidate through the pipeline with force=true
  const startTime = Date.now();

  await pMap(
    candidates,
    async (candidate) => {
      try {
        const s3Url = await processCandidate(candidate, { force: true });

        if (s3Url && s3Url.includes("amazonaws.com")) {
          stats.uploaded++;
        } else {
          stats.notFound++;
        }
      } catch (err) {
        console.error(`[Fix] ✗ ${candidate.name}: ${err.message}`);
        stats.errors++;
      }
    },
    { concurrency: CONC, delayMs: 2000 }
  );

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" Fix Missing Headshots — Complete");
  console.log(`  Total      : ${stats.total}`);
  console.log(`  Uploaded   : ${stats.uploaded}`);
  console.log(`  Not found  : ${stats.notFound} (no photo on Ballotpedia/Wikipedia)`);
  console.log(`  Errors     : ${stats.errors}`);
  console.log(`  Time       : ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════════");

  // Final DB state
  const withPhotos = await coll.countDocuments({
    state: "TX",
    "photo.url": { $regex: "amazonaws\\.com" },
  });
  const stillMissing = await coll.countDocuments({
    state: "TX",
    $or: [
      { "photo.source": "initials_placeholder" },
      { "photo.source": "not_found" },
      { "photo.url": null },
    ],
  });
  console.log(`\nDB state after fix:`);
  console.log(`  With S3 photo   : ${withPhotos}`);
  console.log(`  Still missing   : ${stillMissing}`);

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
