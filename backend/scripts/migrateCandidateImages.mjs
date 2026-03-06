/**
 * migrateCandidateImages.mjs
 *
 * Batch migration: for every Texas candidate in MongoDB that has no S3 image,
 * fetch a headshot from Ballotpedia (or Wikipedia as fallback), normalise it,
 * upload it to S3, and update the MongoDB record.
 *
 * Run:
 *   node scripts/migrateCandidateImages.mjs
 *
 * Options (env vars):
 *   FORCE_REUPLOAD=true   Re-upload images even if the S3 key already exists
 *   DRY_RUN=true          Print what would happen without uploading or writing to DB
 *   CONCURRENCY=3         How many uploads to run in parallel (default 3)
 *   STATE=TX              2-letter state to migrate (default TX)
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { processCandidate, pMap } from "../services/candidateImageService.js";
import { makeCandidateKey, makePublicUrl, s3KeyExists } from "../services/s3Service.js";

const FORCE     = process.env.FORCE_REUPLOAD === "true";
const DRY_RUN   = process.env.DRY_RUN === "true";
const CONC      = parseInt(process.env.CONCURRENCY || "3", 10);
const STATE_ARG = (process.env.STATE || "TX").toUpperCase();

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  total:      0,
  skipped:    0, // already in S3
  uploaded:   0,
  notFound:   0, // no photo available anywhere
  errors:     0,
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Candidate Image Migration");
  console.log(`  State      : ${STATE_ARG}`);
  console.log(`  Concurrency: ${CONC}`);
  console.log(`  Force      : ${FORCE}`);
  console.log(`  Dry run    : ${DRY_RUN}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // ── Build candidate list ──────────────────────────────────────────────────
  const query = { state: STATE_ARG };
  if (!FORCE) {
    // Only process candidates whose photo is not yet an S3 URL
    query.$or = [
      { "photo.url": null },
      { "photo.url": { $exists: false } },
      { "photo.source": { $ne: "s3" } },
    ];
  }

  const candidates = await coll.find(query).toArray();
  stats.total = candidates.length;

  if (!candidates.length) {
    console.log("No candidates need processing. All done!");
    process.exit(0);
  }

  console.log(`Found ${candidates.length} candidate(s) to process.\n`);

  // ── Batch process ─────────────────────────────────────────────────────────
  const startTime = Date.now();

  await pMap(
    candidates,
    async (candidate) => {
      const name = candidate.name;
      const id   = candidate._id.toString();
      const key  = makeCandidateKey(id, "texas");

      if (DRY_RUN) {
        const exists = await s3KeyExists(key);
        console.log(`[DRY_RUN] ${name} → key: ${key} (exists: ${exists})`);
        stats.skipped++;
        return;
      }

      try {
        const s3Url = await processCandidate(candidate, { force: FORCE });

        if (!s3Url) {
          stats.notFound++;
        } else if (s3Url.includes("amazonaws.com")) {
          if (!FORCE && candidate.photo?.url?.includes("amazonaws.com")) {
            stats.skipped++;
          } else {
            stats.uploaded++;
          }
        } else {
          stats.errors++;
        }
      } catch (err) {
        console.error(`[Migration] ✗ ${name}: ${err.message}`);
        stats.errors++;
      }
    },
    { concurrency: CONC, delayMs: 500 }
  );

  // ── Summary ───────────────────────────────────────────────────────────────
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(" Migration Complete");
  console.log(`  Total      : ${stats.total}`);
  console.log(`  Uploaded   : ${stats.uploaded}`);
  console.log(`  Skipped    : ${stats.skipped} (already in S3)`);
  console.log(`  Not found  : ${stats.notFound} (no photo available)`);
  console.log(`  Errors     : ${stats.errors}`);
  console.log(`  Time       : ${elapsed}s`);
  console.log("═══════════════════════════════════════════════════════");

  // Final DB check
  const withPhotos    = await coll.countDocuments({ state: STATE_ARG, "photo.url": { $regex: "amazonaws\\.com" } });
  const withoutPhotos = await coll.countDocuments({ state: STATE_ARG, "photo.url": null });
  console.log(`\nDB state after migration:`);
  console.log(`  With S3 photo   : ${withPhotos}`);
  console.log(`  Still missing   : ${withoutPhotos}`);

  process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
