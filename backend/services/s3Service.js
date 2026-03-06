/**
 * s3Service.js
 *
 * AWS S3 utilities for the PolicyMarket candidate image pipeline.
 *
 * Bucket structure:
 *   policymarket/candidates/{state}/{candidateId}.jpg
 *
 * Image serving — two modes, swapped via IMAGE_BASE_URL in .env:
 *
 *   Public S3 (current):
 *     IMAGE_BASE_URL not set  →  https://policymarket.s3.us-east-1.amazonaws.com
 *
 *   CloudFront (future — set this when ready):
 *     IMAGE_BASE_URL=https://images.yourdomain.com
 *
 * No code changes needed to migrate — just update the env var and redeploy.
 */

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET || "policymarket";
const REGION = process.env.AWS_REGION || "us-east-1";

// When IMAGE_BASE_URL is set (e.g. a CloudFront domain), all public URLs use it.
// Defaults to the direct S3 endpoint for public-read buckets.
const IMAGE_BASE_URL = (process.env.IMAGE_BASE_URL || "").replace(/\/$/, "")
  || `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

// Lazy singleton — constructed on first use so tests can set env vars first
let _s3 = null;
function getClient() {
  if (!_s3) {
    const config = { region: REGION };
    // Only supply explicit credentials when env vars are present;
    // otherwise the SDK falls back to the credential provider chain
    // (IAM role, ~/.aws/credentials, etc.)
    if (process.env.AWS_ACCESS_KEY_ID) {
      config.credentials = {
        accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }
    _s3 = new S3Client(config);
  }
  return _s3;
}

// ─── Key / URL helpers ────────────────────────────────────────────────────────

/**
 * Build the S3 object key for a candidate.
 * @param {string} candidateId - MongoDB _id as a hex string
 * @param {string} state       - lowercase state name (e.g. "texas")
 */
export function makeCandidateKey(candidateId, state = "texas") {
  const safeId = String(candidateId).replace(/[^a-zA-Z0-9_-]/g, "");
  return `candidates/${state.toLowerCase()}/${safeId}.jpg`;
}

/**
 * Build the public HTTPS URL for a given S3 key.
 * Uses IMAGE_BASE_URL when set (CloudFront), otherwise falls back to direct S3.
 */
export function makePublicUrl(key) {
  return `${IMAGE_BASE_URL}/${key}`;
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * Check whether a key already exists in the bucket (idempotency guard).
 * Returns false on any access/permissions error — the upload attempt will
 * surface a real auth error if credentials are genuinely wrong.
 */
export async function s3KeyExists(key) {
  try {
    await getClient().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (err) {
    const status = err.$metadata?.httpStatusCode;
    // 404 / 403 both mean "we can't confirm it exists" → treat as not found
    if (status === 404 || status === 403 ||
        err.name === "NotFound" || err.name === "NoSuchKey" || err.name === "Forbidden") {
      return false;
    }
    throw err;
  }
}

/**
 * Upload a raw buffer to S3.
 *
 * @param {string} key         - S3 object key
 * @param {Buffer} buffer      - image data
 * @param {string} contentType - MIME type (default "image/jpeg")
 * @returns {string} The public URL of the uploaded object
 */
export async function uploadToS3(key, buffer, contentType = "image/jpeg") {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // One year cache; images keyed by candidateId are effectively immutable
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
  const url = makePublicUrl(key);
  console.log(`[S3] ✓ Uploaded ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return url;
}

/**
 * Delete an object from S3.
 */
export async function deleteFromS3(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  console.log(`[S3] Deleted ${key}`);
}

/**
 * High-level helper: upload a candidate headshot.
 *
 * Skips the upload if the key already exists (idempotent).
 * Returns the public URL regardless of whether it was newly uploaded.
 *
 * @param {string} candidateId  - MongoDB _id as hex string
 * @param {Buffer} jpegBuffer   - JPEG image data (already normalised by sharp)
 * @param {string} state        - lowercase state name
 * @returns {string} Public S3 URL
 */
export async function uploadCandidateImage(candidateId, jpegBuffer, state = "texas") {
  const key = makeCandidateKey(candidateId, state);

  if (await s3KeyExists(key)) {
    console.log(`[S3] Already exists, skipping upload: ${key}`);
    return makePublicUrl(key);
  }

  return uploadToS3(key, jpegBuffer, "image/jpeg");
}
