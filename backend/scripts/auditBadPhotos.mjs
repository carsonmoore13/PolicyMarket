/**
 * auditBadPhotos.mjs
 *
 * Finds Wikipedia-sourced photos that are likely wrong:
 *   - SVG files (seals, diagrams)
 *   - Known bad URL patterns (signatures, election SVGs)
 *
 * Nulls out bad entries in MongoDB so the next migration pass
 * re-fetches from Ballotpedia (which is accurate) instead.
 *
 * Run: node scripts/auditBadPhotos.mjs
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { deleteFromS3 } from "../services/s3Service.js";
import { makeCandidateKey } from "../services/s3Service.js";

// URL patterns that are definitively NOT headshots of the candidate.
const BAD_URL_PATTERNS = [
  /\.svg$/i,                         // SVG vector files
  /Seal_of_Texas/i,                  // Texas state seal
  /Great_Seal_of.*California/i,      // California seal
  /election\.svg/i,                  // election diagram SVGs
  /Signature\./i,                    // signature images
  /_Signature\b/i,
  /Roger_Williams_statue/i,          // wrong Roger Williams (statue)
  /Dizzy_Dean/i,                     // wrong Jay Dean
  /Jeff_Barry.*Newsday/i,            // wrong Jeffrey Barry (songwriter)
  /Todd_Hunter.*Dragon/i,            // wrong Todd Hunter (band)
  /Diana_Luna.*British_Open/i,       // wrong Diana Luna (golfer)
  /Shannon_Hurn/i,                   // wrong Ashley Thornton
  /Vincent_Perez_at_Berlinale/i,     // wrong Vincent Perez (actor)
  /Mark_Teixeira_basepaths/i,        // wrong Mark Teixeira (baseball)
  /Troy_Nehls/i,                     // wrong Nehls (different person)
  /Martha_Fierro_Baquero/i,          // Colombian politician
  /Bobby_Pulido.*CROPPED/i,          // likely the singer
  /Henry_Wyatt.*Cunningham/i,        // wrong Charles Cunningham (admiral painting)
  /2026_Texas_State_House_election/i, // election diagram
];

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  const wikiCandidates = await coll
    .find({ "photo.source": "wikipedia", "photo.url": { $regex: "amazonaws" } })
    .project({ name: 1, "photo.original_url": 1, "photo.url": 1, state: 1 })
    .toArray();

  console.log(`Auditing ${wikiCandidates.length} Wikipedia-sourced uploads...`);

  let badCount = 0;
  for (const c of wikiCandidates) {
    const origUrl = c.photo?.original_url || "";
    const isBad = BAD_URL_PATTERNS.some((p) => p.test(origUrl));
    if (!isBad) continue;

    badCount++;
    console.log(`  ✗ ${c.name}: BAD — ${origUrl}`);

    // Delete from S3
    const state = (c.state || "TX").toLowerCase() === "tx" ? "texas" : (c.state || "texas").toLowerCase();
    const s3Key = makeCandidateKey(c._id.toString(), state);
    try {
      await deleteFromS3(s3Key);
    } catch (e) {
      console.warn(`    [S3] delete failed: ${e.message}`);
    }

    // Reset photo in MongoDB so next migration re-fetches
    await coll.updateOne(
      { _id: c._id },
      {
        $set: {
          "photo.url": null,
          "photo.source": "not_found",
          "photo.verified": false,
          "photo.original_url": null,
          updated_at: new Date(),
        },
      }
    );
  }

  console.log(`\nAudit complete. Cleared ${badCount} bad uploads.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
