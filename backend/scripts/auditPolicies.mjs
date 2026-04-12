import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME || "elections_2026");
const docs = await db.collection("candidates").find({}).toArray();

const GENERIC_D = ["Expand healthcare access","Climate action & clean energy","Strengthen workers' rights","Public education funding","Protect voting rights"];
const GENERIC_R = ["Lower taxes & reduce spending","Secure the border","Second Amendment protections","Deregulation & energy independence","Law and order & public safety"];

function isGeneric(p) {
  if (!p || !p.length) return true;
  const s = JSON.stringify(p);
  return s === JSON.stringify(GENERIC_D) || s === JSON.stringify(GENERIC_R);
}

const summary = {};
for (const doc of docs) {
  const level = doc.office_level || "unknown";
  if (!summary[level]) summary[level] = { total: 0, custom: 0, generic: 0, none: 0, scraped: 0, templated: 0 };
  summary[level].total++;
  if (!doc.policies || !doc.policies.length) summary[level].none++;
  else if (isGeneric(doc.policies)) summary[level].generic++;
  else summary[level].custom++;
  if (doc.policies_source === "ballotpedia_campaign_themes") summary[level].scraped++;
  if (doc.policies_source === "office_party_template") summary[level].templated++;
}

console.log("\n=== FINAL POLICY AUDIT ===\n");
for (const [level, s] of Object.entries(summary)) {
  console.log(`${level.toUpperCase()} (${s.total}):`);
  console.log(`  Custom/specific: ${s.custom}  (scraped: ${s.scraped}, templated: ${s.templated})`);
  console.log(`  Generic fallback: ${s.generic}`);
  console.log(`  No policies: ${s.none}`);
}

// Sample a local candidate to show what their policies look like
const sample = docs.find(d => d.office_level === "local" && d.policies_source === "office_party_template");
if (sample) {
  console.log(`\nSample local candidate: ${sample.name} (${sample.office}, ${sample.party})`);
  sample.policies.forEach(p => console.log(`  - ${p}`));
}

await client.close();
