/**
 * One-time cleanup: remove non-person "candidates" that were inserted by
 * earlier scraper runs with weaker filters.
 *
 * Also clears the api_cache so stale results are regenerated.
 */
import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection, getApiCacheCollection } from "./db.js";

// Patterns for names that are clearly NOT real candidates
const BAD_NAME_PATTERNS = [
  /\band\b/i,           // "DDHQ and The Hill"
  /\d/,                  // "Texas' 2nd"
  /\belection\b/i,
  /\bpoll\b/i,
  /\bparty\b/i,
  /\bdelegation\b/i,
  /\bcongressional\b/i,
  /\bpolitical\b/i,
  /\breport\b/i,
  /\bmonitor\b/i,
  /\bcommittee\b/i,
  /\bcoalition\b/i,
  /\bassociation\b/i,
  /\bfoundation\b/i,
  /\binstitute\b/i,
  /\bjurney\b/i,
  /^General\b/i,
  /^Poll\b/i,
  /^Texas'/i,      // navigation links like "Texas' 2nd"
];

function isBadName(name) {
  if (!name) return true;
  if (name.length < 4 || name.length > 60) return true;
  for (const pat of BAD_NAME_PATTERNS) {
    if (pat.test(name)) return true;
  }
  // Must have at least 2 words that start with uppercase
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return true;
  if (!/^[A-Z]/.test(words[0])) return true;
  return false;
}

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();
  const apiCache = getApiCacheCollection();

  const all = await coll.find({}).toArray();
  const toDelete = all.filter(c => isBadName(c.name));

  console.log(`Found ${all.length} total candidates`);
  console.log(`Bad candidates to delete: ${toDelete.length}`);
  toDelete.forEach(c => console.log(`  - "${c.name}" (${c.office})`));

  if (toDelete.length > 0) {
    const ids = toDelete.map(c => c._id);
    const result = await coll.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted: ${result.deletedCount}`);
  }

  // Clear api_cache so fresh results are generated
  const cleared = await apiCache.deleteMany({});
  console.log(`Cleared ${cleared.deletedCount} api_cache entries`);

  // Final count
  const remaining = await coll.countDocuments({});
  console.log(`\nRemaining candidates: ${remaining}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
