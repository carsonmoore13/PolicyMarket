import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection, getApiCacheCollection } from "./db.js";

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();
  const apiCache = getApiCacheCollection();

  // Remove "Click here" false positives
  const clickHere = await coll.deleteMany({ name: /^click here$/i });
  console.log(`Deleted "Click here" entries: ${clickHere.deletedCount}`);

  // Remove Lloyd Doggett from TX-37 (he's TX-35)
  const doggett37 = await coll.deleteMany({ name: "Lloyd Doggett", district: "TX-37" });
  console.log(`Deleted Lloyd Doggett from TX-37: ${doggett37.deletedCount}`);
  
  // Remove Greg Casar from TX-35 (he's TX-37) 
  const casar35 = await coll.deleteMany({ name: "Greg Casar", district: "TX-35" });
  console.log(`Deleted Greg Casar from TX-35: ${casar35.deletedCount}`);

  // Clear api_cache
  const cleared = await apiCache.deleteMany({});
  console.log(`Cleared ${cleared.deletedCount} api_cache entries`);

  const total = await coll.countDocuments({});
  console.log(`Total candidates remaining: ${total}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
