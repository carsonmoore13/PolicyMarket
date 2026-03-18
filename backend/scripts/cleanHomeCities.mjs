import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection } from "../db.js";

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  // Fix entries with district suffix like "Austin, TX (HD-47)"
  const toFix = await coll.find({
    state: "TX",
    home_city: { $regex: /\(HD-|SD-/ },
  }).toArray();

  console.log(`Found ${toFix.length} entries with district suffix to clean.`);

  for (const c of toFix) {
    const cleaned = c.home_city.replace(/\s*\(.*?\)\s*$/, "").trim();
    console.log(`  ${c.name}: "${c.home_city}" → "${cleaned}"`);
    await coll.updateOne({ _id: c._id }, { $set: { home_city: cleaned } });
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
