/**
 * batchBallotpediaPhotos.mjs
 *
 * Targeted Ballotpedia-only photo fetcher. Designed to avoid Ballotpedia's
 * session-based rate limiting by processing a small batch per run with
 * generous per-request delays.
 *
 * Run multiple times until all candidates have photos:
 *   node scripts/batchBallotpediaPhotos.mjs
 *
 * Env options:
 *   STATE=TX          2-letter state (default TX)
 *   BATCH=50          Candidates to attempt per run (default 50)
 *   DELAY=2500        ms between Ballotpedia requests (default 2500)
 *   OFFSET=0          Skip first N missing candidates (for resuming)
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { uploadCandidateImage, makeCandidateKey, makePublicUrl } from "../services/s3Service.js";
import { normaliseImage, updateCandidatePhoto, markPhotoMissing } from "../services/candidateImageService.js";
import { fetchBallotpediaPhotoUrl, downloadImageBuffer, extractSlug } from "../utils/imageScraper.js";

const STATE_ARG = (process.env.STATE || "TX").toUpperCase();
const BATCH     = parseInt(process.env.BATCH  || "50",   10);
const DELAY_MS  = parseInt(process.env.DELAY  || "2500", 10);
const OFFSET    = parseInt(process.env.OFFSET || "0",    10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Batch Ballotpedia Photo Fetcher");
  console.log(`  State  : ${STATE_ARG}  Batch: ${BATCH}  Delay: ${DELAY_MS}ms  Offset: ${OFFSET}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Get candidates still missing photos
  const allMissing = await coll
    .find({ state: STATE_ARG, "photo.source": "not_found" })
    .project({ name: 1, source_url: 1, state: 1, party: 1, office: 1, district: 1 })
    .toArray();

  const batch = allMissing.slice(OFFSET, OFFSET + BATCH);

  console.log(`Total missing: ${allMissing.length}  |  Processing: ${batch.length} (offset ${OFFSET})\n`);

  if (!batch.length) {
    console.log("Nothing to process.");
    process.exit(0);
  }

  let found = 0;
  let skipped = 0;

  for (const candidate of batch) {
    const slug = extractSlug(candidate.source_url);
    if (!slug) {
      console.log(`  ✗ ${candidate.name}: no Ballotpedia slug`);
      skipped++;
      continue;
    }

    const stateStr = (candidate.state || "TX").toLowerCase() === "tx" ? "texas" : (candidate.state || "texas").toLowerCase();

    // Rate-limited Ballotpedia page fetch (respects bpRateLimit inside module)
    const photoUrl = await fetchBallotpediaPhotoUrl(slug);

    if (!photoUrl) {
      console.log(`  ✗ ${candidate.name}: no photo on Ballotpedia`);
      skipped++;
      // Add extra delay even on misses to avoid session pressure
      await sleep(DELAY_MS);
      continue;
    }

    // Download image
    const buffer = await downloadImageBuffer(photoUrl);
    if (!buffer) {
      console.log(`  ✗ ${candidate.name}: download failed for ${photoUrl}`);
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    // Normalise and upload
    try {
      const jpeg   = await normaliseImage(buffer);
      const id     = candidate._id.toString();
      const s3Url  = await uploadCandidateImage(id, jpeg, stateStr);
      await updateCandidatePhoto(id, s3Url, photoUrl, "ballotpedia");
      console.log(`  ✓ ${candidate.name} → ${s3Url.substring(0,70)}…`);
      found++;
    } catch (err) {
      console.error(`  ✗ ${candidate.name}: upload error — ${err.message}`);
      skipped++;
    }

    await sleep(DELAY_MS);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(` Done: ${found} uploaded, ${skipped} skipped`);
  const remaining = await coll.countDocuments({ state: STATE_ARG, "photo.source": "not_found" });
  console.log(` Still missing in DB: ${remaining}`);
  if (remaining > 0 && OFFSET + BATCH < allMissing.length) {
    console.log(`\n  Re-run with: OFFSET=${OFFSET + BATCH} to continue`);
  }
  console.log("═══════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
