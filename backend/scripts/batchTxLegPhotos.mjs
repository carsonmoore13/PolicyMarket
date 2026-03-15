/**
 * batchTxLegPhotos.mjs
 *
 * Fetches member photos from the official Texas House of Representatives
 * website for candidates with HD-* offices that are still missing photos.
 *
 * TX House member photo URL: https://www.house.texas.gov/images/members/{memberId}.jpg
 * where memberId is scraped from the member page at:
 *   http://house.texas.gov/members/member-page?district={N}
 *
 * Name matching: validates that the page's member name ≈ our candidate name
 * before uploading, to prevent wrong-person mismatches for open/flipped seats.
 *
 * Run: node scripts/batchTxLegPhotos.mjs
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { uploadCandidateImage } from "../services/s3Service.js";
import { normaliseImage, updateCandidatePhoto } from "../services/candidateImageService.js";
import axios from "axios";
import * as cheerio from "cheerio";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const httpClient = axios.create({
  timeout: 12000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
    Accept: "text/html,application/xhtml+xml,*/*",
  },
});

/**
 * Extract the district number from an office string like "HD-52" or "TX-HD-52".
 * Returns null if not a House district.
 */
function extractHouseDistrict(office) {
  if (!office) return null;
  const m = office.match(/HD-(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Normalise a name for fuzzy comparison: lowercase, strip punctuation, split to tokens.
 */
function nameTokens(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Check if two candidate names are likely the same person.
 * Requires at least 2 matching tokens (first + last, or last alone).
 */
function namesMatch(a, b) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  // At minimum, last name must match
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (lastA !== lastB) return false;
  // Require at least one more token match (first or middle)
  const sharedOther = ta.slice(0, -1).some((t) => tb.includes(t));
  return sharedOther || (ta.length === 1 && tb.length === 1); // single-name edge case
}

/**
 * Fetch the member photo URL for a given TX House district number.
 * Returns { photoUrl, memberName } or null.
 */
async function fetchTxHouseMemberPhoto(districtNum) {
  const pageUrl = `http://www.house.texas.gov/members/member-page?district=${districtNum}`;
  try {
    const res = await httpClient.get(pageUrl, { responseType: "text" });
    const $ = cheerio.load(res.data);

    // Photo img: typically has class "member-photo" or is inside .member-info
    let imgSrc = $("img.member-photo").attr("src") ||
                 $(".member-info img").first().attr("src") ||
                 $(".memberPhoto img").first().attr("src") ||
                 // Fallback: any /images/members/ URL in the page
                 null;

    if (!imgSrc) {
      // Search all images for the members path
      $("img").each((_, el) => {
        const src = $(el).attr("src") || "";
        if (src.includes("/images/members/")) {
          imgSrc = src;
          return false; // break
        }
      });
    }

    if (!imgSrc) return null;

    // Make absolute
    if (imgSrc.startsWith("//")) imgSrc = `https:${imgSrc}`;
    else if (!imgSrc.startsWith("http")) imgSrc = `https://www.house.texas.gov${imgSrc}`;

    // Member name from the page
    const memberName =
      $("h1.member-name").text().trim() ||
      $(".member-info h1").text().trim() ||
      $("h1").first().text().trim() ||
      "";

    return { photoUrl: imgSrc, memberName };
  } catch (err) {
    console.warn(`  [TxHouse] district ${districtNum} fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Download an image URL as a Buffer with strict validation.
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
    if (ct.includes("svg") || url.includes(".svg")) return null;
    if (buf.length < 5000) {
      console.log(`    [size] ${buf.length} B — too small`);
      return null;
    }
    return buf;
  } catch (err) {
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — TX House Legislature Photo Fetcher");
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  // Find TX House candidates still missing photos
  const missing = await coll
    .find({
      state: "TX",
      "photo.source": "not_found",
      office: { $regex: /HD-\d+/i },
    })
    .project({ name: 1, office: 1, district: 1, party: 1 })
    .toArray();

  console.log(`HD candidates missing photos: ${missing.length}\n`);

  if (!missing.length) {
    console.log("Nothing to process.");
    process.exit(0);
  }

  let found = 0;
  let skipped = 0;
  let mismatched = 0;

  for (const candidate of missing) {
    const districtNum = extractHouseDistrict(candidate.office);
    if (!districtNum) {
      skipped++;
      continue;
    }

    process.stdout.write(`  • ${candidate.name} (HD-${districtNum})… `);

    await sleep(1200);
    const result = await fetchTxHouseMemberPhoto(districtNum);

    if (!result) {
      console.log("✗ page unavailable");
      skipped++;
      continue;
    }

    const { photoUrl, memberName } = result;

    // Name validation: only accept if it looks like the same person
    if (memberName && !namesMatch(candidate.name, memberName)) {
      console.log(`✗ name mismatch — page says "${memberName}"`);
      mismatched++;
      continue;
    }

    const buffer = await downloadImageBuffer(photoUrl);
    if (!buffer) {
      console.log("✗ download failed");
      skipped++;
      continue;
    }

    const id = candidate._id.toString();
    try {
      const jpeg  = await normaliseImage(buffer);
      const s3Url = await uploadCandidateImage(id, jpeg, "texas");
      await updateCandidatePhoto(id, s3Url, photoUrl, "txleg");
      console.log(`✓ ${memberName || candidate.name} → ${s3Url.substring(0, 65)}…`);
      found++;
    } catch (err) {
      console.log(`✗ upload error — ${err.message}`);
      skipped++;
    }
  }

  console.log("\n═══════════════════════════════════════════════════════");
  console.log(` Done: ${found} uploaded, ${skipped} skipped, ${mismatched} name-mismatched`);
  const remaining = await coll.countDocuments({ state: "TX", "photo.source": "not_found" });
  console.log(` Still missing in DB: ${remaining}`);
  console.log("═══════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
