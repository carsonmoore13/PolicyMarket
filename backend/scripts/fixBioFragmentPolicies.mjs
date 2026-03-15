#!/usr/bin/env node
/**
 * fixBioFragmentPolicies.mjs
 *
 * Identifies candidates whose "policies" are actually bio-fragment sentences
 * (from bioToBullets splitting the Ballotpedia bio paragraph) and replaces
 * them with meaningful generic party-platform policies.
 *
 * Detection heuristics:
 *   - Policy text contains the candidate's first or last name
 *   - Policy text matches known bio patterns ("is a member of", "assumed office", etc.)
 *   - Policy text mentions election logistics ("on the ballot", "primary", "general election")
 *
 * Usage:  node scripts/fixBioFragmentPolicies.mjs [--dry-run]
 */

import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB = process.env.MONGO_DB_NAME || "elections_2026";
const DRY_RUN = process.argv.includes("--dry-run");

const GENERIC_POLICIES = {
  D: [
    "Expand healthcare access",
    "Climate action & clean energy",
    "Strengthen workers' rights",
    "Public education funding",
    "Protect voting rights",
  ],
  R: [
    "Lower taxes & reduce spending",
    "Secure the border",
    "Second Amendment protections",
    "Deregulation & energy independence",
    "Law and order & public safety",
  ],
};

// Patterns that indicate a "policy" is actually a bio fragment
const BIO_PATTERNS = [
  /is a member of/i,
  /is running for/i,
  /assumed office/i,
  /current term ends/i,
  /on the ballot/i,
  /general election on/i,
  /advanced from the/i,
  /primary on/i,
  /representing/i,
  /congressional district/i,
  /was elected/i,
  /won the election/i,
  /took office/i,
  /\bParty\b.*is/i,
  /^\w+ \w+ \((?:Republican|Democratic)/i,
];

/**
 * Check if a set of policies looks like bio fragments rather than real policy positions.
 * Returns true if the majority of policies match bio-fragment heuristics.
 */
function isBioFragmentPolicies(policies, candidateName) {
  if (!Array.isArray(policies) || policies.length === 0) return false;

  const nameParts = (candidateName || "").split(" ").filter((p) => p.length > 2);
  const firstName = nameParts[0] || "";
  const lastName = nameParts[nameParts.length - 1] || "";

  let bioCount = 0;
  for (const p of policies) {
    const text = p || "";
    // Check if the policy mentions the candidate by name
    if (firstName && text.includes(firstName)) { bioCount++; continue; }
    if (lastName && text.includes(lastName)) { bioCount++; continue; }
    // Check against known bio patterns
    if (BIO_PATTERNS.some((pat) => pat.test(text))) { bioCount++; continue; }
  }

  // If more than half of policies look like bio fragments, replace them all
  return bioCount >= policies.length / 2;
}

async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  console.log("Connected to MongoDB");
  if (DRY_RUN) console.log("=== DRY RUN — no changes will be made ===\n");

  const db = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  const allCandidates = await coll.find({}).toArray();
  console.log(`Total candidates: ${allCandidates.length}\n`);

  let fixed = 0;
  let skipped = 0;

  for (const c of allCandidates) {
    if (!isBioFragmentPolicies(c.policies, c.name)) {
      skipped++;
      continue;
    }

    const party = (c.party || "").toUpperCase();
    const newPolicies = GENERIC_POLICIES[party] || GENERIC_POLICIES.R;

    console.log(`[FIX] ${c.name} (${c.party}, ${c.office})`);
    console.log(`  OLD: ${c.policies?.map(p => p.slice(0, 60)).join(" | ")}`);
    console.log(`  NEW: ${newPolicies.join(" | ")}`);

    if (!DRY_RUN) {
      await coll.updateOne(
        { _id: c._id },
        {
          $set: {
            policies: newPolicies,
            "policies_source": "generic_party_platform",
            updated_at: new Date(),
          },
        },
      );
    }
    fixed++;
  }

  // Clear API cache
  if (!DRY_RUN) {
    const cleared = await db.collection("api_cache").deleteMany({});
    console.log(`\nCleared ${cleared.deletedCount} api_cache entries`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped (already good): ${skipped}`);

  await client.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
