/**
 * batchWikipediaPhotos.mjs
 *
 * Wikipedia-fallback photo fetcher for candidates still missing photos after
 * the Ballotpedia pass. Only tries Wikipedia (no Ballotpedia, to avoid
 * re-processing already-attempted slugs).
 *
 * Strict image validation:
 *   - Minimum 20 KB to exclude icons/initials/placeholder images
 *   - Rejects SVG, GIF, and other non-photo formats
 *   - Rejects known bad Wikipedia URL patterns (wrong-person false positives)
 *   - Tries "Name Texas" disambiguation if plain name fails
 *
 * Run: node scripts/batchWikipediaPhotos.mjs
 *
 * Env options:
 *   STATE=TX      2-letter state (default TX)
 *   BATCH=100     Candidates to attempt per run (default 100)
 *   DELAY=1000    ms between Wikipedia requests (default 1000)
 *   OFFSET=0      Skip first N missing candidates
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { uploadCandidateImage } from "../services/s3Service.js";
import { normaliseImage, updateCandidatePhoto, markPhotoMissing } from "../services/candidateImageService.js";
import axios from "axios";

const STATE_ARG = (process.env.STATE || "TX").toUpperCase();
const BATCH     = parseInt(process.env.BATCH  || "100",  10);
const DELAY_MS  = parseInt(process.env.DELAY  || "1000", 10);
const OFFSET    = parseInt(process.env.OFFSET || "0",    10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimum file size for a real headshot (20 KB). Icons and initials placeholders
// are typically much smaller.
const MIN_PHOTO_BYTES = 20 * 1024;

// Wikipedia URL patterns that are NOT headshots of the candidate.
const BAD_WIKI_PATTERNS = [
  /\.svg$/i,
  /\.gif$/i,
  /Seal_of_Texas/i,
  /Great_Seal/i,
  /State_seal/i,
  /Signature\./i,
  /_Signature\b/i,
  /Roger_Williams_statue/i,
  /Dizzy_Dean/i,
  /Jeff_Barry.*Newsday/i,
  /Todd_Hunter.*Dragon/i,
  /Diana_Luna.*British_Open/i,
  /Shannon_Hurn/i,
  /Vincent_Perez_at_Berlinale/i,
  /Mark_Teixeira/i,
  /Troy_Nehls/i,
  /Martha_Fierro_Baquero/i,
  /Bobby_Pulido/i,
  /Henry_Wyatt.*Cunningham/i,
  /2026_Texas_State_House_election/i,
  /2026_Texas_State_Senate_election/i,
  /election.*diagram/i,
  /flag_of/i,
  /Flag_of/i,
  /coat_of_arms/i,
  /Coat_of_arms/i,
];

const httpClient = axios.create({
  timeout: 12000,
  headers: {
    "User-Agent": "PolicyMarket/1.0 (https://policymarket.app; civic/election data)",
    Accept: "application/json",
  },
});

/**
 * Fetch Wikipedia summary for a given title, returning the image URL or null.
 * Strips /thumb/ from the URL to get full-size.
 */
async function fetchWikipediaPhotoUrl(title) {
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await httpClient.get(apiUrl);
    const data = res.data;

    // Must be a politician/person page — sanity check title type
    if (data?.type === "disambiguation") return null;

    const imgUrl = data?.originalimage?.source || data?.thumbnail?.source || null;
    if (!imgUrl) return null;

    // Convert thumbnail to full-size URL
    const fullUrl = imgUrl.includes("/thumb/")
      ? imgUrl.replace(/\/thumb\/(.*?)\/\d+px-[^/]+$/, "/$1")
      : imgUrl;

    return fullUrl;
  } catch (err) {
    if (err.response?.status !== 404) {
      console.warn(`  [Wiki] API error for "${title}": ${err.message}`);
    }
    return null;
  }
}

/**
 * Download an image URL as a Buffer. Returns null on failure or bad content.
 */
async function downloadImageBuffer(url) {
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 12000,
      headers: { "User-Agent": "PolicyMarket/1.0 (https://policymarket.app)" },
    });
    const buf = Buffer.from(res.data);
    const ct = res.headers["content-type"] || "";

    if (!ct.startsWith("image/")) return null;
    if (ct.includes("svg") || url.endsWith(".svg")) return null;
    if (ct.includes("gif") || url.endsWith(".gif")) return null;
    if (buf.length < MIN_PHOTO_BYTES) {
      console.log(`    [size] ${buf.length} B — too small, skipping`);
      return null;
    }
    return buf;
  } catch (err) {
    return null;
  }
}

/**
 * Try multiple Wikipedia title variants for a candidate.
 * Returns { buffer, imgUrl } or null.
 */
async function findWikipediaPhoto(candidate) {
  const name = candidate.name;

  // Build title variants to try in order
  const stateName = STATE_ARG === "TX" ? "Texas" : STATE_ARG;
  const officeHint = candidate.office || "";
  const variants = [name];

  // Add state-scoped disambiguation
  variants.push(`${name} (politician)`);
  variants.push(`${name} (${stateName} politician)`);

  // For state legislators, try office-specific disambiguation
  if (officeHint.includes("HD-") || officeHint.includes("House")) {
    variants.push(`${name} (${stateName} politician)`);
    variants.push(`${name} ${stateName} House`);
  }
  if (officeHint.includes("SD-") || officeHint.includes("Senate")) {
    variants.push(`${name} (${stateName} politician)`);
  }

  for (const title of variants) {
    await sleep(DELAY_MS);
    const imgUrl = await fetchWikipediaPhotoUrl(title);
    if (!imgUrl) continue;

    // Check for bad URL patterns before downloading
    if (BAD_WIKI_PATTERNS.some((p) => p.test(imgUrl))) {
      console.log(`    [skip] known bad pattern: ${imgUrl.split("/").pop()}`);
      continue;
    }

    const buffer = await downloadImageBuffer(imgUrl);
    if (buffer) {
      return { buffer, imgUrl, title };
    }
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Batch Wikipedia Photo Fetcher");
  console.log(`  State  : ${STATE_ARG}  Batch: ${BATCH}  Delay: ${DELAY_MS}ms  Offset: ${OFFSET}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  const allMissing = await coll
    .find({ state: STATE_ARG, "photo.source": "not_found" })
    .project({ name: 1, source_url: 1, state: 1, party: 1, office: 1, district: 1 })
    .toArray();

  const batch = allMissing.slice(OFFSET, OFFSET + BATCH);
  console.log(`Total not_found: ${allMissing.length}  |  Processing: ${batch.length} (offset ${OFFSET})\n`);

  if (!batch.length) {
    console.log("Nothing to process.");
    process.exit(0);
  }

  let found = 0;
  let skipped = 0;

  for (const candidate of batch) {
    process.stdout.write(`  • ${candidate.name} (${candidate.office || "?"})… `);

    const result = await findWikipediaPhoto(candidate);

    if (!result) {
      console.log("✗ no photo");
      skipped++;
      continue;
    }

    const { buffer, imgUrl, title } = result;
    const id = candidate._id.toString();
    const stateStr = STATE_ARG.toLowerCase() === "tx" ? "texas" : STATE_ARG.toLowerCase();

    try {
      const jpeg  = await normaliseImage(buffer);
      const s3Url = await uploadCandidateImage(id, jpeg, stateStr);
      await updateCandidatePhoto(id, s3Url, imgUrl, "wikipedia");
      console.log(`✓ ${s3Url.substring(0, 70)}…`);
      found++;
    } catch (err) {
      console.log(`✗ upload error — ${err.message}`);
      skipped++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(` Done: ${found} uploaded, ${skipped} skipped`);
  const remaining = await coll.countDocuments({ state: STATE_ARG, "photo.source": "not_found" });
  console.log(` Still missing in DB: ${remaining}`);
  if (remaining > 0 && OFFSET + BATCH < allMissing.length) {
    console.log(`\n  Re-run with: OFFSET=${OFFSET + BATCH} to continue`);
  }
  console.log("═══════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
