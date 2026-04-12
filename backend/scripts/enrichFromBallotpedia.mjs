/**
 * enrichFromBallotpedia.mjs
 *
 * Scalable policy enrichment pipeline. For each candidate:
 *   1. Fetch their Ballotpedia page
 *   2. Extract "Campaign themes → 2026" campaign website content
 *   3. Parse structured section headers + body into concise policy bullets
 *   4. Fall back to bio-based extraction if no campaign themes exist
 *   5. Write directly to Atlas
 *
 * Usage:
 *   node scripts/enrichFromBallotpedia.mjs --ids 6801a,6801b     # specific IDs
 *   node scripts/enrichFromBallotpedia.mjs --address "63 Driftoak Circle,The Woodlands,TX,77381" --level state
 *   node scripts/enrichFromBallotpedia.mjs --level federal        # all federal
 *   node scripts/enrichFromBallotpedia.mjs --all                  # everything with a source_url
 *   node scripts/enrichFromBallotpedia.mjs --stale                # only those with bad/generic policies
 */

import dotenv from "dotenv";
dotenv.config();

import axios from "axios";
import * as cheerio from "cheerio";
import { MongoClient } from "mongodb";

const DELAY_MS = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Ballotpedia page fetcher ───────────────────────────────────────────────

async function fetchPage(url) {
  await sleep(DELAY_MS);
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      responseType: "text",
    });
    return res.data;
  } catch {
    return null;
  }
}

// ─── Campaign themes extractor ──────────────────────────────────────────────

/**
 * Extract the campaign website text from the "Campaign themes → 2026" section.
 * Returns the raw text block (cleaned of scripts/styles/boilerplate).
 */
function extractCampaignText(html) {
  const $ = cheerio.load(html);
  const chunks = [];

  let inCampaign = false;
  let in2026 = false;

  $(".mw-parser-output")
    .children()
    .each((_, el) => {
      const tag = (el.tagName || "").toLowerCase();
      const $el = $(el);
      const rawText = $el.text().trim();

      if (tag === "h2" && /campaign themes/i.test(rawText)) {
        inCampaign = true;
        return;
      }
      if (tag === "h2" && inCampaign) return false;
      if (!inCampaign) return;

      if (tag === "h3" && /2026/.test(rawText)) {
        in2026 = true;
        return;
      }
      // Stop at next non-2026 h3 (different election year)
      if (tag === "h3" && in2026 && !/2026/.test(rawText)) {
        in2026 = false;
        return;
      }
      if (!in2026) return;
      if (tag === "script" || tag === "style") return;

      const $clone = $el.clone();
      $clone.find("script, style").remove();
      const cleaned = $clone.text().replace(/\s+/g, " ").trim();

      // Skip boilerplate
      if (!cleaned || cleaned.length < 30) return;
      if (
        /jQuery|function\s*\(|padding|font-size|googletag|\.survey|Candidate Connection|fill out|Who fills out/i.test(
          cleaned,
        )
      )
        return;

      // Campaign website content (in divs) or priority lists (in p tags)
      if (tag === "div" || tag === "p") {
        // Strip the "campaign website stated the following:" prefix
        let stripped = cleaned
          .replace(
            /^.*?campaign website stated the following:\s*/i,
            "",
          )
          .replace(/^.*?PRIORITIES\s*/i, "PRIORITIES ")
          .replace(
            /\s*—\s*[\w\s.']+campaign website.*$/i,
            "",
          )
          .replace(
            /\s*Note: This text is quoted verbatim.*$/i,
            "",
          )
          .trim();

        // Insert newlines before section headers to help the parser.
        // Handles "...end of section.Header Text Here..." patterns
        // where a period/sentence-end is immediately followed by a
        // Title Case or ALL CAPS header with no whitespace.
        stripped = stripped
          // ALL CAPS header after lowercase text: "...word.BORDER SECURITY"
          .replace(/([a-z.!?])([A-Z][A-Z\s&]{3,40}[A-Z])(?=[A-Z][a-z])/g, "$1\n$2\n")
          // Title Case header smashed after period: "...word.Securing the Border"
          .replace(/([a-z])([A-Z][a-z]+(?:\s+(?:the|and|of|for|in|to|our|&)\s+[A-Z]?[a-z]+|[A-Z][a-z]+)+)(?=[:,.]?\s*[A-Z])/g, "$1\n$2: ");

        if (
          stripped.length > 40 &&
          !/See also:|Ballotpedia|campaign ad,/i.test(stripped)
        ) {
          chunks.push(stripped);
        }
      }
    });

  return chunks.join("\n\n");
}

/**
 * Extract bio paragraphs AND any campaign themes from non-2026 years as fallback.
 * Also looks for content from older campaign theme years if 2026 is empty.
 */
function extractBio(html) {
  const $ = cheerio.load(html);
  const paragraphs = [];

  // First try: campaign themes from any year (not just 2026)
  let inCampaign = false;
  $(".mw-parser-output").children().each((_, el) => {
    const tag = (el.tagName || "").toLowerCase();
    const $el = $(el);
    const rawText = $el.text().trim();

    if (tag === "h2" && /campaign themes/i.test(rawText)) { inCampaign = true; return; }
    if (tag === "h2" && inCampaign) return false;
    if (!inCampaign) return;
    if (tag === "script" || tag === "style") return;

    if (tag === "div" || tag === "p") {
      const $clone = $el.clone();
      $clone.find("script, style").remove();
      const cleaned = $clone.text().replace(/\s+/g, " ").trim();
      if (
        cleaned.length > 60 &&
        /campaign website stated|PRIORITIES/i.test(cleaned) &&
        !/jQuery|function\s*\(|padding|googletag/i.test(cleaned)
      ) {
        const stripped = cleaned
          .replace(/^.*?campaign website stated the following:\s*/i, "")
          .replace(/\s*—\s*[\w\s.']+campaign website.*$/i, "")
          .replace(/\s*Note: This text is quoted verbatim.*$/i, "")
          .trim();
        if (stripped.length > 50) paragraphs.push(stripped);
      }
    }
  });

  if (paragraphs.length > 0) return paragraphs.join("\n\n");

  // Second try: bio paragraphs
  $(".mw-parser-output > p").each((_, el) => {
    const text = $(el)
      .text()
      .replace(/\[\d+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (
      text.length > 80 &&
      !/jQuery|padding|font-size|tusa-race|\.ballot-measure|\.endorsements/i.test(
        text,
      )
    ) {
      paragraphs.push(text);
    }
  });

  return paragraphs.slice(0, 5).join("\n\n");
}

// ─── Text → Policy bullets parser ──────────────────────────────────────────

/**
 * Parse campaign website text into concise policy bullet points.
 *
 * Handles multiple text structures:
 *   1. ALL CAPS headers: "BORDER SECURITY" followed by body
 *   2. Title Case headers: "Securing Our Southern Border" followed by body
 *   3. Inline bold topics: "Topic. Description here..."
 *   4. Listed priorities: "Ensure X", "Protect Y", "Invest in Z"
 */
function textToBullets(text) {
  if (!text || text.length < 50) return [];

  const bullets = [];

  // Strategy 1: Split by ALL CAPS headers (like Crenshaw's page)
  const capsPattern =
    /(?:^|\n|(?<=[.!?])\s*)([A-Z][A-Z\s&:,']{4,50}?)(?=[A-Z][a-z]|\n)/g;
  const capsHeaders = [...text.matchAll(capsPattern)].map((m) => ({
    header: m[1].trim(),
    index: m.index,
  }));

  if (capsHeaders.length >= 2) {
    for (let i = 0; i < capsHeaders.length; i++) {
      const start = capsHeaders[i].index + capsHeaders[i].header.length;
      const end =
        i + 1 < capsHeaders.length ? capsHeaders[i + 1].index : text.length;
      const body = text.substring(start, end).trim();
      const header = toTitleCase(capsHeaders[i].header);

      // Skip non-policy headers
      if (
        /Campaign Website|Why .* Cares?|Note:|Quoted Verbatim/i.test(header)
      )
        continue;

      const bullet = distillSection(header, body);
      if (bullet) bullets.push(bullet);
    }
    if (bullets.length >= 2) return dedup(bullets).slice(0, 8);
  }

  // Strategy 2: Split by Title Case headers followed by body text
  // Pattern: "Header Text" then sentences/paragraphs until next header
  const titlePattern =
    /(?:^|\n|(?<=[.!?])\s*)([A-Z][a-z]+(?:\s+(?:[A-Z][a-z]+|&|the|and|of|for|in|to|our|a|an|on|at|with|vs\.?))+)(?=[.A-Z\n])/g;
  const titleHeaders = [...text.matchAll(titlePattern)]
    .map((m) => ({
      header: m[1].trim(),
      index: m.index,
    }))
    .filter(
      (h) =>
        h.header.length > 8 &&
        h.header.length < 60 &&
        !/Campaign Website|Note This|Quoted Verbatim|Released\s/i.test(
          h.header,
        ),
    );

  if (titleHeaders.length >= 2) {
    for (let i = 0; i < titleHeaders.length; i++) {
      const start = titleHeaders[i].index + titleHeaders[i].header.length;
      const end =
        i + 1 < titleHeaders.length ? titleHeaders[i + 1].index : text.length;
      const body = text.substring(start, end).trim();
      const bullet = distillSection(titleHeaders[i].header, body);
      if (bullet) bullets.push(bullet);
    }
    if (bullets.length >= 2) return dedup(bullets).slice(0, 8);
  }

  // Strategy 3: Priority-list style ("Ensure X", "Protect Y")
  const priorityPattern =
    /(?:^|\n|(?<=[.!?])\s*)((?:Ensure|Protect|Invest|Expand|Support|Fight|Defend|Promote|Reduce|Reform|Remove|Implement|Focus|Lower|Secure|Stop|End|Ban|Oppose|Strengthen|Restore|Treat|Create|Build|Address|Hold)\b[^.!?\n]{15,200})/gi;
  const priorities = [...text.matchAll(priorityPattern)].map((m) =>
    m[1].replace(/\s+/g, " ").trim(),
  );

  if (priorities.length >= 3) {
    return dedup(priorities).slice(0, 8);
  }

  // Strategy 4: Sentence-level extraction from bio/unstructured text
  return extractSentenceBullets(text);
}

/**
 * Distill a section header + body into a single concise bullet.
 */
function distillSection(header, body) {
  if (!body || body.length < 20) return header;

  // Clean body
  const clean = body
    .replace(/\[\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Look for concrete actions: "authored", "led", "passed", "introduced", "fought"
  const actionPattern =
    /(?:authored|co-?sponsored|led|passed|introduced|fought|secured|appropriated|filed|signed|supported|opposed|voted|earned|demanded|banned|eliminated|blocked|sued)\b[^.!?]{10,150}/gi;
  const actions = [...clean.matchAll(actionPattern)].map((m) =>
    m[0].replace(/\s+/g, " ").trim(),
  );

  if (actions.length > 0) {
    // Capitalize first letter of action
    const action = actions[0].charAt(0).toUpperCase() + actions[0].slice(1);
    // If header is short enough, combine
    if (header.length + action.length < 160) {
      return `${header}: ${action}`;
    }
    return action;
  }

  // Look for key stance sentences
  const sentences = clean
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length > 25 && s.length < 200);

  // Filter out boilerplate
  const SKIP = [
    /is a member of/i,
    /is running for/i,
    /assumed office/i,
    /campaign website/i,
    /born in/i,
    /graduated from/i,
    /earned a/i,
    /career experience/i,
  ];

  const good = sentences.filter((s) => !SKIP.some((p) => p.test(s)));

  if (good.length > 0) {
    const best = good[0];
    if (header.length + best.length < 160 && header.length < 40) {
      return `${header}: ${best.toLowerCase().startsWith(header.toLowerCase()) ? best : best}`;
    }
    return best;
  }

  return header.length > 10 ? header : null;
}

/**
 * Extract policy-relevant sentences from unstructured text.
 */
function extractSentenceBullets(text) {
  const sentences = text
    .replace(/\[\d+\]/g, "")
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/\.$/, "").replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 30 && s.length < 220);

  const SKIP = [
    /is a member of/i,
    /is running for/i,
    /assumed office/i,
    /current term ends/i,
    /on the ballot/i,
    /general election on/i,
    /advanced from the/i,
    /primary on/i,
    /\bwon the election\b/i,
    /\btook office\b/i,
    /\bwas elected\b/i,
    /born in/i,
    /graduated from/i,
    /earned a (bachelor|master|law|J\.D)/i,
    /career experience includes/i,
    /campaign website/i,
    /Ballotpedia/i,
    /fill out this survey/i,
    /Note: This text/i,
  ];

  // Prioritize sentences with policy signals
  const POLICY_SIGNALS = [
    /\b(fight|fought|oppose|support|defend|protect|expand|reform|invest|fund|cut|reduce|increase|secure|promote|ban|eliminate|strengthen|restore)\b/i,
    /\b(tax|healthcare|border|immigration|education|gun|energy|climate|jobs|housing|abortion|rights)\b/i,
  ];

  const scored = sentences
    .filter((s) => !SKIP.some((p) => p.test(s)))
    .map((s) => ({
      text: s,
      score: POLICY_SIGNALS.reduce(
        (n, pat) => n + (pat.test(s) ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  return scored
    .filter((s) => s.score > 0)
    .slice(0, 8)
    .map((s) => s.text);
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(And|For|Of|The|In|To|On|At|A|An|With|Vs)\b/g, (m) =>
      m.toLowerCase(),
    )
    .replace(/^./, (c) => c.toUpperCase());
}

function dedup(arr) {
  const seen = new Set();
  return arr.filter((item) => {
    const key = item.toLowerCase().substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Post-process bullets to clean up common artifacts from HTML parsing.
 */
function cleanBullets(bullets) {
  return bullets
    .map((b) => {
      let s = b
        // Remove stray 1-3 char prefixes from HTML artifacts (e.g. "eTexas" → "Texas")
        .replace(/^[a-z]{1,3}(?=[A-Z][a-z])/, "")
        // Remove leading special chars
        .replace(/^[":;\s]+/, "")
        // Remove trailing attribution
        .replace(/\s*—\s*[\w\s.']+campaign website.*$/i, "")
        .replace(/\s*Note: This text.*$/i, "")
        // Fix stray chars before words mid-bullet: "Header: TThe" → "Header: The"
        .replace(/:\s*[A-Z](?=[A-Z][a-z])/g, (m) => ": ")
        // Fix doubled capitals from HTML join: "TThe" → "The", "RWithout" → "Without"
        .replace(/(?<![A-Z])([A-Z])(?=[A-Z][a-z]{2,})/g, "")
        // Fix "word.NextWord" → "word. NextWord"
        .replace(/([a-z])\.([A-Z])/g, "$1. $2")
        // Remove "Earned:" "Led:" with no real content after (garbled)
        .replace(/\b(?:Earned|Led|Passed):?\s*(?=[A-Z])/g, "")
        // Remove ": es." or ": y." type artifacts (stray chars after colon)
        .replace(/:\s*[a-z]{1,3}\.\s*/g, ": ")
        // Clean trailing fragments like "as Te" or "and so"
        .replace(/\s+\w{1,3}$/, "")
        // Trim excessive length
        .trim();

      // If bullet is too long, truncate at a sentence boundary
      if (s.length > 180) {
        const firstSentence = s.match(/^[^.!?]+[.!?]/);
        if (firstSentence && firstSentence[0].length > 30) {
          s = firstSentence[0].replace(/\.$/, "");
        } else {
          s = s.substring(0, 175).replace(/\s+\S*$/, "").trim();
        }
      }

      return s;
    })
    .filter((b) => b.length > 15 && b.length < 200);
}

// ─── Main pipeline ──────────────────────────────────────────────────────────

async function enrichCandidate(doc) {
  if (!doc.source_url) return null;

  const html = await fetchPage(doc.source_url);
  if (!html) return null;

  // Try campaign themes first
  let rawText = extractCampaignText(html);
  let source = "ballotpedia_campaign_themes";

  // Fall back to bio
  if (!rawText || rawText.length < 80) {
    rawText = extractBio(html);
    source = "ballotpedia_bio";
  }

  if (!rawText || rawText.length < 50) return null;

  const rawBullets = textToBullets(rawText);
  const bullets = cleanBullets(rawBullets);
  if (bullets.length < 2) return null;

  return { policies: bullets, source };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME || "elections_2026");
const coll = db.collection("candidates");

let candidates = [];

// --address "street,city,state,zip" --level state|federal
const addrIdx = args.indexOf("--address");
const levelIdx = args.indexOf("--level");
const level = levelIdx > -1 ? args[levelIdx + 1] : null;

if (addrIdx > -1) {
  const [street, city, state, zip] = args[addrIdx + 1].split(",");
  console.log(`Resolving address: ${street}, ${city}, ${state} ${zip}`);

  const params = new URLSearchParams({ street, city, state, zip });
  if (level) params.set("level", level);

  const res = await axios.get(
    `http://localhost:3001/api/candidates?${params}`,
  );
  const ids = (res.data.candidates || []).map((c) => c._id);

  // Fetch full docs from DB
  const { ObjectId } = await import("mongodb");
  candidates = await coll
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .toArray();
} else if (args.includes("--ids")) {
  const idStr = args[args.indexOf("--ids") + 1];
  const { ObjectId } = await import("mongodb");
  const ids = idStr.split(",").map((id) => new ObjectId(id.trim()));
  candidates = await coll.find({ _id: { $in: ids } }).toArray();
} else if (level) {
  candidates = await coll.find({ office_level: level }).toArray();
} else if (args.includes("--stale")) {
  // Find candidates with bad policies (garbled text, too short, generic)
  candidates = await coll.find({ source_url: { $exists: true } }).toArray();
  candidates = candidates.filter((c) => {
    if (!c.policies || c.policies.length === 0) return true;
    // Check for garbled text (very short bullets or fragments)
    const hasGarbled = c.policies.some(
      (p) => p.length < 10 || /^[A-Z][a-z]+ [A-Z]$/.test(p),
    );
    return hasGarbled;
  });
} else if (args.includes("--all")) {
  candidates = await coll
    .find({ source_url: { $exists: true, $ne: null } })
    .toArray();
}

if (!candidates.length) {
  console.log("No candidates to process. Use --address, --level, --ids, --stale, or --all");
  await client.close();
  process.exit(0);
}

console.log(`\nProcessing ${candidates.length} candidates...\n`);

let enriched = 0;
let skipped = 0;
let failed = 0;

for (const doc of candidates) {
  process.stdout.write(`  ${doc.name} (${doc.party}) — ${doc.office}... `);

  const result = await enrichCandidate(doc);

  if (!result) {
    console.log("NO DATA");
    failed++;
    continue;
  }

  if (result.policies.length < 2) {
    console.log(`SKIP (only ${result.policies.length} bullets)`);
    skipped++;
    continue;
  }

  await coll.updateOne(
    { _id: doc._id },
    {
      $set: {
        policies: result.policies,
        policies_source: result.source,
        policies_updated: new Date(),
      },
    },
  );

  console.log(`OK (${result.policies.length} bullets from ${result.source})`);
  result.policies.forEach((p) => console.log(`    • ${p}`));
  enriched++;
}

console.log(
  `\nDone. Enriched: ${enriched}, Skipped: ${skipped}, Failed: ${failed}`,
);

await client.close();
