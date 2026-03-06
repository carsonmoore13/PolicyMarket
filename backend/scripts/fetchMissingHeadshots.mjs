/**
 * fetchMissingHeadshots.mjs
 *
 * Second-pass script: targets candidates that still have no photo after
 * migrateCandidateImages.mjs has run (i.e. photo.url is null).
 *
 * Uses a more aggressive search strategy:
 *   1. Ballotpedia (re-attempt, in case the page was temporarily unavailable)
 *   2. Wikipedia REST API
 *
 * Reports remaining failures in a structured log so you can manually review.
 *
 * Run:
 *   node scripts/fetchMissingHeadshots.mjs
 *
 * Env options:
 *   STATE=TX            2-letter state (default TX)
 *   CONCURRENCY=2       Parallel requests (default 2, conservative)
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { processCandidate, pMap } from "../services/candidateImageService.js";

const STATE_ARG = (process.env.STATE || "TX").toUpperCase();
const CONC      = parseInt(process.env.CONCURRENCY || "2", 10);

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Fetch Missing Headshots");
  console.log(`  State      : ${STATE_ARG}`);
  console.log(`  Concurrency: ${CONC}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Only target candidates with truly no photo (not just "not_found" from a
  // previous failed attempt — those are re-attempted too in case data changed)
  const missing = await coll
    .find({
      state: STATE_ARG,
      $or: [
        { "photo.url": null },
        { "photo.url": { $exists: false } },
      ],
    })
    .project({ name: 1, office: 1, district: 1, party: 1, source_url: 1, photo: 1 })
    .toArray();

  if (!missing.length) {
    console.log("No candidates are missing photos. All done!");
    process.exit(0);
  }

  console.log(`Found ${missing.length} candidate(s) with missing photos:\n`);
  missing.forEach((c) =>
    console.log(`  • ${c.name} (${c.party}) — ${c.office} ${c.district || ""}`.trim())
  );
  console.log();

  const stillMissing = [];
  const found        = [];
  const errors       = [];

  await pMap(
    missing,
    async (candidate) => {
      const result = await processCandidate(candidate, { force: true });
      if (result) {
        found.push({ name: candidate.name, url: result });
      } else {
        stillMissing.push(candidate);
      }
    },
    { concurrency: CONC, delayMs: 800 }
  );

  // ── Report ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════");
  console.log(` Results`);
  console.log(`  Found   : ${found.length}`);
  console.log(`  Missing : ${stillMissing.length}`);
  console.log(`  Errors  : ${errors.length}`);

  if (found.length) {
    console.log("\nSuccessfully found:");
    found.forEach((f) => console.log(`  ✓ ${f.name}`));
  }

  if (stillMissing.length) {
    console.log("\nStill missing (manual review needed):");
    stillMissing.forEach((c) => {
      console.log(`  ✗ ${c.name} (${c.party}) — ${c.office} ${c.district || ""}`.trim());
      if (c.source_url) console.log(`      source_url: ${c.source_url}`);
    });

    // Write a JSON report file for easy copy-paste or further tooling
    const report = {
      generated_at: new Date().toISOString(),
      state: STATE_ARG,
      missing: stillMissing.map((c) => ({
        _id: c._id.toString(),
        name: c.name,
        party: c.party,
        office: c.office,
        district: c.district,
        source_url: c.source_url,
      })),
    };

    const fs = await import("fs/promises");
    const reportPath = `scripts/missing_photos_${STATE_ARG.toLowerCase()}.json`;
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);
  }

  console.log("═══════════════════════════════════════════════════════");
  process.exit(stillMissing.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
