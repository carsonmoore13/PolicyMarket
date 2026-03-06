/**
 * candidateImageService.js
 *
 * Orchestrates the full image pipeline for a single candidate:
 *   1. Accept a raw image buffer (from imageScraper or any source)
 *   2. Normalise to a 400×400 JPEG via sharp
 *   3. Upload to S3 with dedup guard
 *   4. Update the MongoDB candidate document
 *
 * Also exposes helpers used by both migration scripts.
 */

import sharp from "sharp";
import { ObjectId } from "mongodb";
import { getCandidatesCollection } from "../db.js";
import {
  uploadCandidateImage,
  makeCandidateKey,
  makePublicUrl,
  s3KeyExists,
} from "./s3Service.js";
import { findCandidatePhoto } from "../utils/imageScraper.js";

// ─── Image normalisation ──────────────────────────────────────────────────────

const OUTPUT_WIDTH  = 400;
const OUTPUT_HEIGHT = 400;

/**
 * Normalise an arbitrary image buffer:
 *   • Resize to 400×400, cropped to face area (top-biased cover)
 *   • Convert to JPEG at 85 % quality
 *   • Strip EXIF/metadata
 *
 * Returns a JPEG Buffer or throws.
 */
export async function normaliseImage(rawBuffer) {
  return sharp(rawBuffer)
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: "cover",
      position: "top", // portrait photos → keep head visible
    })
    .jpeg({ quality: 85, progressive: true })
    .withMetadata(false) // strip EXIF
    .toBuffer();
}

// ─── Single-candidate pipeline ────────────────────────────────────────────────

/**
 * Full pipeline for one candidate:
 *   download photo → normalise → upload to S3 → update MongoDB.
 *
 * If the S3 key already exists the upload is skipped (idempotent).
 * Returns the S3 public URL, or null on failure.
 *
 * @param {object} candidate   Full MongoDB document (must have _id, state)
 * @param {object} [options]
 * @param {boolean} [options.force=false]  Re-upload even if S3 key exists
 */
export async function processCandidate(candidate, { force = false } = {}) {
  const candidateId = candidate._id.toString();
  const state = (candidate.state || "TX").toLowerCase() === "tx" ? "texas" : (candidate.state || "texas").toLowerCase();
  const key = makeCandidateKey(candidateId, state);

  // ── Dedup guard ───────────────────────────────────────────────────────────
  if (!force && await s3KeyExists(key)) {
    const existingUrl = makePublicUrl(key);
    // Sync MongoDB if it doesn't already point at S3
    if (!candidate.photo?.url?.includes("s3.amazonaws.com")) {
      await updateCandidatePhoto(candidateId, existingUrl, candidate.photo?.url);
    }
    console.log(`[Pipeline] Already in S3, skipped: ${candidate.name}`);
    return existingUrl;
  }

  // ── Find a photo ──────────────────────────────────────────────────────────
  const result = await findCandidatePhoto(candidate);
  if (!result) {
    await markPhotoMissing(candidateId);
    return null;
  }

  // ── Normalise → upload → update DB ───────────────────────────────────────
  try {
    const jpeg = await normaliseImage(result.buffer);
    const s3Url = await uploadCandidateImage(candidateId, jpeg, state);
    await updateCandidatePhoto(candidateId, s3Url, result.originalUrl, result.sourceLabel);
    console.log(`[Pipeline] ✓ ${candidate.name} → ${s3Url}`);
    return s3Url;
  } catch (err) {
    console.error(`[Pipeline] ✗ Failed for ${candidate.name}: ${err.message}`);
    await markPhotoError(candidateId, err.message);
    return null;
  }
}

// ─── MongoDB helpers ──────────────────────────────────────────────────────────

/**
 * Update the candidate's photo sub-document with the S3 URL.
 * Removes any embedded image data (base64 fields) to keep the document lean.
 */
export async function updateCandidatePhoto(
  candidateId,
  s3Url,
  originalUrl = null,
  sourceLabel = "s3"
) {
  const coll = getCandidatesCollection();
  await coll.updateOne(
    { _id: new ObjectId(candidateId) },
    {
      $set: {
        "photo.url": s3Url,
        "photo.source": sourceLabel,
        "photo.verified": true,
        "photo.last_fetched": new Date(),
        "photo.original_url": originalUrl || null,
        updated_at: new Date(),
      },
      // Remove legacy embedded image fields if they exist
      $unset: {
        image_data: "",
        base64_image: "",
        headshot_buffer: "",
      },
    }
  );
}

/**
 * Flag a candidate as having no photo available (prevents repeated retries).
 */
export async function markPhotoMissing(candidateId) {
  const coll = getCandidatesCollection();
  await coll.updateOne(
    { _id: new ObjectId(candidateId) },
    {
      $set: {
        "photo.url": null,
        "photo.source": "not_found",
        "photo.verified": false,
        "photo.last_fetched": new Date(),
        updated_at: new Date(),
      },
    }
  );
}

/**
 * Record an error during photo processing without overwriting existing data.
 */
export async function markPhotoError(candidateId, errorMessage) {
  const coll = getCandidatesCollection();
  await coll.updateOne(
    { _id: new ObjectId(candidateId) },
    {
      $set: {
        "photo.last_error": errorMessage,
        "photo.last_fetched": new Date(),
        updated_at: new Date(),
      },
    }
  );
}

// ─── Batch utilities ──────────────────────────────────────────────────────────

/**
 * A rate-limited concurrent map identical to the pattern used elsewhere in this
 * codebase.  `concurrency` parallel tasks at a time, with `delayMs` between
 * each batch.
 */
export async function pMap(items, fn, { concurrency = 3, delayMs = 600 } = {}) {
  const results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...await Promise.all(batch.map(fn)));
    if (i + concurrency < items.length) await sleep(delayMs);
  }
  return results;
}
