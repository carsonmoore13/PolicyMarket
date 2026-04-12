/**
 * mergeDBs.mjs — Merge local MongoDB candidates into Atlas (or vice versa).
 * Uses MONGO_URI from .env as the Atlas target.
 */
import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";

const LOCAL_URI = "mongodb://localhost:27017";
const ATLAS_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

if (!ATLAS_URI) {
  console.error("MONGO_URI not set in .env");
  process.exit(1);
}

const localClient = await MongoClient.connect(LOCAL_URI);
const localDb = localClient.db(DB_NAME);
const localDocs = await localDb.collection("candidates").find({}).toArray();

const atlasClient = await MongoClient.connect(ATLAS_URI);
const atlasDb = atlasClient.db(DB_NAME);
const atlasColl = atlasDb.collection("candidates");

console.log(`Local docs to upsert: ${localDocs.length}`);

let updated = 0;
let inserted = 0;
let errors = 0;

for (const doc of localDocs) {
  const { _id, ...fields } = doc;
  try {
    const result = await atlasColl.updateOne(
      { name: doc.name, office: doc.office, district: doc.district },
      { $set: fields },
      { upsert: true },
    );
    if (result.upsertedCount > 0) inserted++;
    else if (result.modifiedCount > 0) updated++;
  } catch (err) {
    errors++;
    console.error(`  Error on ${doc.name}: ${err.message}`);
  }
}

console.log(`\nResults: ${updated} updated, ${inserted} inserted, ${errors} errors`);

const finalCount = await atlasColl.countDocuments();
const byLevel = await atlasColl
  .aggregate([{ $group: { _id: "$office_level", count: { $sum: 1 } } }])
  .toArray();

console.log(`\nFinal Atlas total: ${finalCount}`);
console.log("By level:", JSON.stringify(byLevel, null, 2));

await localClient.close();
await atlasClient.close();
