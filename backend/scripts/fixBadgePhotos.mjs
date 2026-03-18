/**
 * fixBadgePhotos.mjs
 *
 * One-time fix: revert candidates whose photo was set to the Ballotpedia
 * "Election Coverage Badge" (not a real headshot) back to not_found status,
 * and delete the bad S3 objects.
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { makeCandidateKey } from "../services/s3Service.js";
import { markPhotoMissing } from "../services/candidateImageService.js";

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  // Find candidates whose original_url points to the Election Coverage Badge
  const badCandidates = await coll.find({
    "photo.original_url": { $regex: /Election_Coverage_Badge/i },
  }).toArray();

  console.log(`Found ${badCandidates.length} candidate(s) with badge photo to fix.\n`);

  for (const c of badCandidates) {
    const id = c._id.toString();
    console.log(`  Reverting: ${c.name} (${c.office || "?"})`);

    // Reset in MongoDB
    await markPhotoMissing(id);

    // Note: bad S3 objects left in place — they'll be overwritten if a real photo is found later
  }

  console.log(`\nDone. Reverted ${badCandidates.length} candidate(s).`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
