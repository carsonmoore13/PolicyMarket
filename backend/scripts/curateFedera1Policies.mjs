/**
 * Curate specific, accurate policy positions for the 6 federal candidates
 * visible from 63 Driftoak Circle, The Woodlands TX (TX-2, US Senate TX).
 *
 * Source: Ballotpedia campaign themes (campaign website excerpts, 2025-2026)
 */

import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";

const CURATED = [
  {
    name: "John Cornyn",
    office: "U.S. Senate",
    policies: [
      "Reimburse Texas for $11B spent on border security; authored Laken Riley Act provision",
      "Crack down on drug cartels with fentanyl and human trafficking laws",
      "End sanctuary cities by blocking their federal funding",
      "Pro-life: 100% rating; co-sponsored Born-Alive Abortion Survivors Protection Act",
      "Defend Second Amendment with A+ NRA rating; push concealed carry reciprocity",
      "Expand oil and gas production; lifted crude oil export ban; opposes Green New Deal",
      "Support Israel with Iron Dome funding and anti-BDS legislation",
      "Reduce taxes on family farms; renew Trump Tax Cuts",
    ],
    source: "ballotpedia_curated",
  },
  {
    name: "Ken Paxton",
    office: "U.S. Senate",
    policies: [
      "Champion Trump's legislative agenda: tax cuts, border security, deportations",
      "Finish the border wall and deport criminal illegal immigrants",
      "Sued Biden administration 100+ times as AG, including over open border policies",
      "Protect gun rights and oppose any Second Amendment restrictions",
      "Defend the unborn and oppose the radical transgender movement in schools",
      "Cut taxes and stop wasteful spending; nation is $36T+ in debt",
      "America First foreign policy: peace through strength, no blank checks abroad",
      "Remove regulations hurting Texas energy companies; bring down consumer costs",
    ],
    source: "ballotpedia_curated",
  },
  {
    name: "James Talarico",
    office: "U.S. Senate",
    policies: [
      "Close the wealth gap: billionaires and corporations must pay their fair share",
      "Fund public schools and stop defunding education",
      "Expand healthcare access and stop gutting coverage for working families",
      "Unite across party lines to take on special interests and mega-donors",
      "Fight corporate consolidation of media and social media manipulation",
      "Empower communities over billionaire-backed puppet politicians",
    ],
    source: "ballotpedia_curated",
  },
  {
    name: "Dan Crenshaw",
    office_pattern: /U\.S\. House TX-2/,
    policies: [
      "Secure the border permanently; led bills to fix asylum loopholes and Flores Settlement",
      "Authorize military force against Mexican drug cartels to stop fentanyl",
      "Protect Second Amendment: fought universal background checks and ATF pistol brace rule",
      "End DEI requirements in universities and the military",
      "Ban taxpayer-funded gender transition surgeries for minors",
      "Free-market healthcare: lower costs, increase transparency, no government takeover",
      "Promote carbon capture and all-of-the-above energy strategy",
      "Houston flood mitigation: secured $4B in federal relief and Army Corps projects",
    ],
    source: "ballotpedia_curated",
  },
  {
    name: "Steve Toth",
    office_pattern: /U\.S\. House TX-2/,
    policies: [
      "Finish Trump's border wall; appropriated billions for border security in TX House",
      "Eliminated CRT and DEI from Texas public schools and universities",
      "Block China, Iran, and foreign adversaries from owning Texas land",
      "Defend Second Amendment: oppose red flag laws and all gun restrictions",
      "Secured $27M for advanced active shooter training facility for law enforcement",
      "Support strategic tariffs to bring manufacturing back from China",
      "Expand domestic oil and gas production for full energy independence",
      "Ban government vaccine mandates; support personal health autonomy",
    ],
    source: "ballotpedia_curated",
  },
  {
    name: "Shaun Finnie",
    office_pattern: /U\.S\. House TX-2/,
    policies: [
      "Remove tariffs (consumption tax) driving up costs for families",
      "Protect Social Security, Medicare, and Medicaid from any cuts",
      "Ensure women's right to make their own healthcare decisions",
      "Invest in public education and medical and scientific research",
      "Implement economic policies to reduce oppressive youth debt burdens",
      "Focus on fairness and safety for all community members",
    ],
    source: "ballotpedia_curated",
  },
];

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME || "elections_2026");
const coll = db.collection("candidates");

for (const entry of CURATED) {
  const query = { name: entry.name, state: "TX" };
  if (entry.office) query.office = entry.office;

  let doc;
  if (entry.office_pattern) {
    // Use regex match for office field
    const candidates = await coll.find({ name: entry.name, state: "TX" }).toArray();
    doc = candidates.find(c => entry.office_pattern.test(c.office));
    if (doc) {
      query._id = doc._id;
      delete query.name;
      delete query.state;
    }
  } else {
    doc = await coll.findOne(query);
  }

  if (!doc) {
    console.log(`  NOT FOUND: ${entry.name} (${entry.office || entry.office_pattern})`);
    continue;
  }

  const result = await coll.updateOne(
    { _id: doc._id },
    {
      $set: {
        policies: entry.policies,
        policies_source: entry.source,
        policies_updated: new Date(),
      },
    }
  );

  console.log(
    `  ${result.modifiedCount ? 'UPDATED' : 'NO CHANGE'}: ${entry.name} — ${doc.office} (${entry.policies.length} policies)`
  );
}

// Verify
console.log("\n=== Verification ===");
for (const entry of CURATED) {
  const query = { name: entry.name, state: "TX" };
  if (entry.office) query.office = entry.office;

  let doc;
  if (entry.office_pattern) {
    const candidates = await coll.find({ name: entry.name, state: "TX" }).toArray();
    doc = candidates.find(c => entry.office_pattern.test(c.office));
  } else {
    doc = await coll.findOne(query);
  }
  if (doc) {
    console.log(`\n${doc.name} (${doc.party}) — ${doc.office}`);
    doc.policies.forEach(p => console.log(`  • ${p}`));
  }
}

await client.close();
