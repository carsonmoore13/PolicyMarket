/**
 * auditPolicies.mjs
 *
 * Diagnostic: audit policy coverage for local TX candidates.
 *
 * Usage:
 *   node scripts/auditPolicies.mjs
 */

import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

// Generic party policies (the fallback templates)
const GENERIC_D = [
  "Expand healthcare access",
  "Climate action & clean energy",
  "Strengthen workers' rights",
  "Public education funding",
  "Protect voting rights",
];
const GENERIC_R = [
  "Lower taxes & reduce spending",
  "Secure the border",
  "Second Amendment protections",
  "Deregulation & energy independence",
  "Law and order & public safety",
];

function isGeneric(policies) {
  if (!policies || policies.length === 0) return false;
  const str = JSON.stringify(policies);
  return str === JSON.stringify(GENERIC_D) || str === JSON.stringify(GENERIC_R);
}

const client = await MongoClient.connect(MONGO_URI);
const db = client.db(DB_NAME);
const coll = db.collection("candidates");

// ── Part 1: Global summary (all levels) ──────────────────────────────────────
const allDocs = await coll.find({ state: "TX" }).toArray();

const globalSummary = {};
for (const doc of allDocs) {
  const level = doc.office_level || "unknown";
  if (!globalSummary[level]) globalSummary[level] = { total: 0, specific: 0, generic: 0, none: 0 };
  globalSummary[level].total++;
  if (!doc.policies || doc.policies.length === 0) globalSummary[level].none++;
  else if (isGeneric(doc.policies)) globalSummary[level].generic++;
  else globalSummary[level].specific++;
}

console.log(`\n════════════════════════════════════════════════`);
console.log(`  POLICY AUDIT — ALL TX CANDIDATES`);
console.log(`════════════════════════════════════════════════\n`);

console.log(`Total TX candidates: ${allDocs.length}\n`);
console.log(`Level             Total  Specific  Generic  None`);
console.log(`─────────────────────────────────────────────────`);
for (const [level, s] of Object.entries(globalSummary).sort((a, b) => b[1].total - a[1].total)) {
  console.log(
    `${level.padEnd(18)}${String(s.total).padStart(5)}  ${String(s.specific).padStart(8)}  ${String(s.generic).padStart(7)}  ${String(s.none).padStart(4)}`
  );
}

// ── Part 2: Deep dive into local candidates ──────────────────────────────────
const locals = await coll
  .find({ state: "TX", office_level: { $in: ["local", "city"] } })
  .toArray();

console.log(`\n════════════════════════════════════════════════`);
console.log(`  LOCAL TX CANDIDATE POLICY AUDIT`);
console.log(`════════════════════════════════════════════════\n`);

console.log(`Total local candidates: ${locals.length}\n`);

let hasPolicies = 0;
let genericOnly = 0;
let noPolicies = 0;
let hasSpecific = 0;

const bySource = {};
const byOffice = {};
const needsEnrichment = [];

for (const c of locals) {
  const office = c.office || "(unknown)";
  if (!byOffice[office]) byOffice[office] = { total: 0, generic: 0, none: 0, specific: 0 };
  byOffice[office].total++;

  const policies = c.policies;
  const source = c.policies_source || "(none)";
  bySource[source] = (bySource[source] || 0) + 1;

  if (!policies || policies.length === 0) {
    noPolicies++;
    byOffice[office].none++;
    needsEnrichment.push(c);
  } else if (isGeneric(policies)) {
    genericOnly++;
    byOffice[office].generic++;
    hasPolicies++;
    needsEnrichment.push(c);
  } else {
    hasSpecific++;
    byOffice[office].specific++;
    hasPolicies++;
  }
}

console.log(`── Coverage Summary ──────────────────────────────`);
console.log(`  Has policies (any):       ${hasPolicies}`);
console.log(`    - Specific policies:    ${hasSpecific}`);
console.log(`    - Generic party only:   ${genericOnly}`);
console.log(`  No policies at all:       ${noPolicies}`);
console.log(`  NEEDS ENRICHMENT:         ${genericOnly + noPolicies}\n`);

console.log(`── By policies_source ───────────────────────────`);
const sortedSources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
for (const [source, count] of sortedSources) {
  console.log(`  ${source.padEnd(35)} ${count}`);
}

console.log(`\n── By Office Title ──────────────────────────────`);
const sortedOffices = Object.entries(byOffice).sort((a, b) => b[1].total - a[1].total);
for (const [office, stats] of sortedOffices) {
  const pct = stats.specific > 0 ? Math.round((stats.specific / stats.total) * 100) : 0;
  console.log(
    `  ${office.padEnd(50)} total: ${String(stats.total).padStart(3)} | specific: ${String(stats.specific).padStart(3)} | generic: ${String(stats.generic).padStart(3)} | none: ${String(stats.none).padStart(3)} | ${pct}% enriched`
  );
}

console.log(`\n── Candidates Needing Enrichment ─────────────────`);
for (const c of needsEnrichment) {
  const policiesStr = c.policies ? `generic (${c.policies.length} items)` : "NONE";
  const hasUrl = c.source_url ? "has URL" : "NO URL";
  console.log(`  ${(c.name || "").padEnd(35)} ${(c.office || "").padEnd(50)} ${(c.party || "").padEnd(3)} ${policiesStr.padEnd(22)} ${hasUrl}`);
}

// How many have a source_url?
const withUrl = needsEnrichment.filter((c) => c.source_url).length;
const withoutUrl = needsEnrichment.filter((c) => !c.source_url).length;
console.log(`\n  Of ${needsEnrichment.length} needing enrichment: ${withUrl} have Ballotpedia URL, ${withoutUrl} do not`);

// ── Template match test ─────────────────────────────────────────────────────
console.log(`\n── Template Match Test ───────────────────────────`);
let noMatch = 0;
for (const c of needsEnrichment) {
  const lower = (c.office || "").toLowerCase();
  let matchedKey = null;
  if (/county judge/i.test(lower)) matchedKey = "county judge";
  else if (/county sheriff|sheriff/i.test(lower)) matchedKey = "county sheriff";
  else if (/county commission/i.test(lower)) matchedKey = "county commissioner";
  else if (/district attorney/i.test(lower)) matchedKey = "district attorney";
  else if (/county attorney/i.test(lower)) matchedKey = "county attorney";
  else if (/tax assessor|tax collector/i.test(lower)) matchedKey = "tax assessor";
  else if (/county clerk/i.test(lower)) matchedKey = "county clerk";
  else if (/county treasurer|treasurer/i.test(lower)) matchedKey = "county treasurer";
  else if (/\bconstable\b/i.test(lower)) matchedKey = "constable";
  else if (/justice of the peace/i.test(lower)) matchedKey = "justice of the peace";
  else if (/city council/i.test(lower)) matchedKey = "city council";
  else if (/\bmayor\b/i.test(lower)) matchedKey = "mayor";

  if (!matchedKey) {
    console.log(`  NO MATCH: ${(c.name || "").padEnd(35)} office="${c.office}" level=${c.office_level}`);
    noMatch++;
  }
}
if (noMatch === 0) {
  console.log(`  All ${needsEnrichment.length} candidates match an office template!`);
} else {
  console.log(`\n  ${noMatch} candidates have no template match (would need new templates or API calls)`);
}

await client.close();
console.log(`\nDone.`);
