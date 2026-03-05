/**
 * Remove US Representatives incorrectly stored as US Senate candidates.
 * Dan Crenshaw, Keith Self, Pat Fallon are TX House reps, not senators.
 */
import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection, getApiCacheCollection } from "./db.js";

const BAD_SENATE_NAMES = ["Dan Crenshaw", "Keith Self", "Pat Fallon"];

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();
  const apiCache = getApiCacheCollection();

  for (const name of BAD_SENATE_NAMES) {
    const result = await coll.deleteMany({ name, office: /U\.S\. Senate/ });
    console.log(`Deleted ${result.deletedCount} record(s) for "${name}" as Senate candidate`);
  }

  // Also remove the duplicate HD-47 candidates
  const hd47 = await coll.find({ district: "HD-47" }).toArray();
  console.log(`\nHD-47 candidates: ${hd47.length}`);
  if (hd47.length > 2) {
    // Keep only the first 2 (unique name+party combinations)
    const seen = new Set();
    for (const c of hd47) {
      const key = `${c.name}|${c.party}`;
      if (seen.has(key)) {
        await coll.deleteOne({ _id: c._id });
        console.log(`  Removed duplicate: ${c.name} (${c.party})`);
      } else {
        seen.add(key);
      }
    }
  }

  // Clear api_cache
  const cleared = await apiCache.deleteMany({});
  console.log(`\nCleared ${cleared.deletedCount} api_cache entries`);

  const remaining = await coll.countDocuments({});
  console.log(`Remaining candidates: ${remaining}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
