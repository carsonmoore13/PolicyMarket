/**
 * cleanBioCss.mjs — One-time script to strip CSS/HTML junk from cached bios.
 * Fixes bios that contain ".subcommittee { font-weight: 400; ... }" etc.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const BIO_JUNK_RE =
  /\.subcommittee|\.source-link|font-weight:\s*\d|margin-left:\s*\d|list-style-type|color:\s*#[0-9a-f]{3,6}|<\/?pre>|<\/?p>/i;

function cleanBioText(text) {
  if (!text) return text;
  let cleaned = text.replace(/\.[a-z_-]+\s*\{[^}]*\}/gi, "");
  cleaned = cleaned.replace(/<\/?[a-z][^>]*>/gi, "");
  cleaned = cleaned.replace(/[a-z-]+:\s*[^;,}]+[;,}]/gi, (match) => {
    if (/^(color|font|margin|padding|border|display|position|background|list-style|text-align|overflow|z-index)/i.test(match)) return "";
    return match;
  });
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME);
const coll = db.collection("candidates");

const withBio = await coll.find({ bio: { $exists: true, $ne: null } }).toArray();
console.log(`Candidates with cached bios: ${withBio.length}`);

let fixed = 0;
let cleared = 0;
for (const doc of withBio) {
  if (!BIO_JUNK_RE.test(doc.bio)) continue;

  const cleaned = cleanBioText(doc.bio);
  if (cleaned.length < 30) {
    // Bio is mostly junk — clear it so it gets re-scraped next time
    await coll.updateOne({ _id: doc._id }, { $unset: { bio: 1, bio_fetched: 1 } });
    console.log(`  CLEARED (too short after clean): ${doc.name}`);
    cleared++;
  } else {
    await coll.updateOne({ _id: doc._id }, { $set: { bio: cleaned } });
    console.log(`  FIXED: ${doc.name}`);
    fixed++;
  }
}

console.log(`\nDone. Fixed: ${fixed}, Cleared for re-scrape: ${cleared}`);
await client.close();
