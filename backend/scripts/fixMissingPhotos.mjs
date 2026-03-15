#!/usr/bin/env node
/**
 * fixMissingPhotos.mjs
 *
 * For every candidate without a photo.url:
 *   1. Retry Ballotpedia + Wikipedia photo scraping
 *   2. If still no photo found, generate an initials-based placeholder image
 *   3. Upload to S3, update MongoDB
 *   4. Clear the api_cache so fresh data is served
 *
 * Usage:  node scripts/fixMissingPhotos.mjs
 */

import { MongoClient, ObjectId } from "mongodb";
import sharp from "sharp";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load .env BEFORE importing any service that reads process.env at module init.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// Dynamic imports — ensures process.env.AWS_REGION etc. are set before
// s3Service.js evaluates its top-level `const REGION = ...`.
const { findCandidatePhoto } = await import("../utils/imageScraper.js");
const { uploadCandidateImage, makeCandidateKey, makePublicUrl, s3KeyExists } = await import("../services/s3Service.js");
const { normaliseImage } = await import("../services/candidateImageService.js");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB = process.env.MONGO_DB_NAME || "elections_2026";

// Party colors for placeholder backgrounds
const PARTY_COLORS = {
  R: { bg: "#b91c1c", text: "#ffffff" },  // red-700
  D: { bg: "#1d4ed8", text: "#ffffff" },  // blue-700
};
const DEFAULT_COLOR = { bg: "#374151", text: "#ffffff" }; // gray-700

function getInitials(name) {
  if (!name) return "?";
  const parts = name.split(" ").filter((p) => /^[A-Za-z]/.test(p));
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Generate a 400x400 JPEG placeholder with colored initials using sharp + SVG.
 */
async function generatePlaceholderImage(name, party) {
  const initials = getInitials(name);
  const colors = PARTY_COLORS[(party || "").toUpperCase()] || DEFAULT_COLOR;

  const svg = `
<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors.bg}" />
      <stop offset="100%" stop-color="${colors.bg}cc" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="0" />
  <text x="200" y="215" font-family="Arial,Helvetica,sans-serif" font-size="160"
        font-weight="bold" text-anchor="middle" dominant-baseline="central"
        fill="${colors.text}" opacity="0.9">${initials}</text>
</svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 85, progressive: true }).toBuffer();
}

async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  console.log("Connected to MongoDB");

  const db = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  // Find all candidates without a photo URL
  const missing = await coll.find({
    $or: [
      { "photo.url": null },
      { "photo.url": { $exists: false } },
      { "photo.url": "" },
    ],
  }).toArray();

  console.log(`Found ${missing.length} candidates without photos\n`);

  let scraped = 0;
  let placeholders = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < missing.length; i++) {
    const c = missing[i];
    const candidateId = c._id.toString();
    const state = (c.state || "TX").toLowerCase() === "tx" ? "texas" : (c.state || "texas").toLowerCase();
    const key = makeCandidateKey(candidateId, state);

    console.log(`[${i + 1}/${missing.length}] ${c.name} (${c.party}) — ${c.office}`);

    try {
      // Check if S3 already has the image (maybe uploaded separately)
      if (await s3KeyExists(key)) {
        const url = makePublicUrl(key);
        console.log(`  Already in S3, updating MongoDB → ${url}`);
        await coll.updateOne(
          { _id: c._id },
          {
            $set: {
              "photo.url": url,
              "photo.source": "s3_existing",
              "photo.verified": true,
              "photo.last_fetched": new Date(),
              updated_at: new Date(),
            },
          },
        );
        skipped++;
        continue;
      }

      // Try scraping a real photo first
      let jpegBuffer = null;
      let sourceLabel = null;

      const result = await findCandidatePhoto(c);
      if (result) {
        jpegBuffer = await normaliseImage(result.buffer);
        sourceLabel = result.sourceLabel;
        scraped++;
        console.log(`  Found real photo via ${sourceLabel}`);
      } else {
        // Generate initials placeholder
        jpegBuffer = await generatePlaceholderImage(c.name, c.party);
        sourceLabel = "initials_placeholder";
        placeholders++;
        console.log(`  Generated initials placeholder`);
      }

      // Upload to S3
      const s3Url = await uploadCandidateImage(candidateId, jpegBuffer, state);

      // Update MongoDB
      await coll.updateOne(
        { _id: c._id },
        {
          $set: {
            "photo.url": s3Url,
            "photo.source": sourceLabel,
            "photo.verified": sourceLabel !== "initials_placeholder",
            "photo.last_fetched": new Date(),
            "photo.fallback_initials": getInitials(c.name),
            updated_at: new Date(),
          },
        },
      );
      console.log(`  Uploaded → ${s3Url}\n`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
      errors++;
    }
  }

  // Clear the api_cache so fresh data is served
  const deleteResult = await db.collection("api_cache").deleteMany({});
  console.log(`\nCleared ${deleteResult.deletedCount} api_cache entries`);

  console.log(`\n=== Summary ===`);
  console.log(`Total processed: ${missing.length}`);
  console.log(`Real photos scraped: ${scraped}`);
  console.log(`Initials placeholders: ${placeholders}`);
  console.log(`Already in S3: ${skipped}`);
  console.log(`Errors: ${errors}`);

  await client.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
