import dotenv from "dotenv";
dotenv.config();
import { connectDB, getCandidatesCollection } from "../db.js";

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  const totalCount = await coll.countDocuments({ state: "TX" });
  const austinCount = await coll.countDocuments({ state: "TX", home_city: "Austin, TX" });
  const cities = await coll.distinct("home_city", { state: "TX" });

  console.log("Total TX candidates:", totalCount);
  console.log("With 'Austin, TX':", austinCount);
  console.log("Distinct home_city values:", JSON.stringify(cities));

  // Show federal+state candidates with Austin
  const austinFedState = await coll.find({
    state: "TX",
    home_city: "Austin, TX",
    office_level: { $in: ["federal", "state"] },
  }).project({ name: 1, home_city: 1, office: 1, district: 1, source_url: 1, office_level: 1 }).toArray();

  console.log(`\nFederal/State candidates with 'Austin, TX': ${austinFedState.length}`);
  for (const c of austinFedState) {
    console.log(`  ${c.name} | ${c.office} | ${c.district || "none"} | ${c.source_url || "no url"}`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
