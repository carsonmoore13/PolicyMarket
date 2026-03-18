/**
 * imageScraper.js
 *
 * Searches multiple online sources for a candidate's headshot, in priority order:
 *   1. Ballotpedia  — infobox photo on the candidate's page (most reliable)
 *   2. Wikipedia    — REST summary API thumbnail (good for incumbents)
 *
 * Returns null when no suitable image is found.
 */

import axios from "axios";
import * as cheerio from "cheerio";

const HTTP_TIMEOUT = 12000;
const MIN_IMAGE_BYTES = 4096; // ignore anything under 4 KB (icons / blank placeholders)

// Ballotpedia placeholder URLs — not real headshots
const PLACEHOLDER_URL_PATTERNS = [
  /SubmitPhoto/i,
  /BP-Initials/i,
  /no[-_]?photo/i,
  /placeholder/i,
  /default[-_]?avatar/i,
  /Election_Coverage_Badge/i,
  /Ballotpedia_Logo/i,
];

const httpClient = axios.create({
  timeout: HTTP_TIMEOUT,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
    Accept: "text/html,application/xhtml+xml,*/*",
  },
});

// Polite delay between Ballotpedia page fetches to avoid rate limiting.
const BP_DELAY_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let _lastBpFetch = 0;
async function bpRateLimit() {
  const now = Date.now();
  const wait = BP_DELAY_MS - (now - _lastBpFetch);
  if (wait > 0) await sleep(wait);
  _lastBpFetch = Date.now();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Download an image URL as a Buffer.
 * Returns null on any failure or if the response is below MIN_IMAGE_BYTES.
 */
export async function downloadImageBuffer(url) {
  try {
    const res = await httpClient.get(url, { responseType: "arraybuffer" });
    const buf = Buffer.from(res.data);
    if (buf.length < MIN_IMAGE_BYTES) {
      console.warn(`[ImageScraper] Image too small (${buf.length} B), skipping: ${url}`);
      return null;
    }
    const ct = res.headers["content-type"] || "";
    if (!ct.startsWith("image/")) {
      console.warn(`[ImageScraper] Non-image content-type "${ct}", skipping: ${url}`);
      return null;
    }
    // Reject SVG and other vector formats — they are diagrams/logos, not headshots.
    if (ct.includes("svg") || url.endsWith(".svg")) {
      console.warn(`[ImageScraper] SVG rejected (not a headshot): ${url}`);
      return null;
    }
    return buf;
  } catch (err) {
    console.warn(`[ImageScraper] Download failed: ${url} — ${err.message}`);
    return null;
  }
}

// ─── Source 1: Ballotpedia ────────────────────────────────────────────────────

/**
 * Fetch the headshot URL from a Ballotpedia candidate page.
 *
 * @param {string} slug  e.g. "Steve_Toth"
 * @returns {string|null} Absolute image URL, or null
 */
export async function fetchBallotpediaPhotoUrl(slug) {
  if (!slug) return null;
  const pageUrl = `https://ballotpedia.org/${encodeURIComponent(slug).replace(/%20/g, "_")}`;
  try {
    await bpRateLimit();
    const res = await httpClient.get(pageUrl, { responseType: "text" });
    const $ = cheerio.load(res.data);

    // Ballotpedia uses a Wikipedia-style infobox; the first img inside it is the headshot.
    let src = $(".infobox img, #mw-content-text .infobox img").first().attr("src") || "";

    // Some pages serve a protocol-relative URL
    if (src.startsWith("//")) src = `https:${src}`;
    else if (src && !src.startsWith("http")) src = `https://ballotpedia.org${src}`;

    // Ballotpedia thumbnails live at .../files/thumbs/W/H/name.jpg on S3.
    // Strip the /thumbs/W/H segment to get the full-size URL:
    //   .../files/thumbs/200/300/Dan_Patrick.jpg → .../files/Dan_Patrick.jpg
    // (The old replacement "/thumbs/…/" → "/files/" produced a double /files/files/ path.)
    if (src.includes("/thumbs/")) {
      const fullSize = src.replace(/\/thumbs\/\d+\/\d+/, "");
      src = fullSize;
    }

    return src || null;
  } catch (err) {
    console.warn(`[ImageScraper] Ballotpedia fetch failed for "${slug}": ${err.message}`);
    return null;
  }
}

// ─── Source 2: Wikipedia ─────────────────────────────────────────────────────

/**
 * Fetch a headshot URL via the Wikipedia REST summary API.
 * Works best for high-profile incumbents who have Wikipedia pages.
 *
 * @param {string} name  e.g. "John Cornyn"
 * @returns {string|null} Absolute image URL, or null
 */
export async function fetchWikipediaPhotoUrl(name) {
  if (!name) return null;

  // Wikipedia titles use underscores
  const title = name.trim().replace(/\s+/g, "_");
  const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;

  try {
    const res = await httpClient.get(apiUrl, {
      headers: {
        Accept: "application/json",
        "Api-User-Agent": "PolicyMarket/1.0 (https://policymarket.app)",
      },
    });
    const data = res.data;

    // Prefer the full original image; fall back to the thumbnail
    const imgUrl =
      data?.originalimage?.source ||
      data?.thumbnail?.source ||
      null;

    if (!imgUrl) return null;

    // Convert Wikipedia thumbnail URL to the full-res commons URL.
    // Thumbnail format: .../commons/thumb/e/e4/File.jpg/200px-File.jpg
    // Full-size format: .../commons/e/e4/File.jpg
    // The old regex only stripped the px prefix, producing a 404-producing double path.
    const fullUrl = imgUrl.includes("/thumb/")
      ? imgUrl.replace(/\/thumb\/(.*?)\/\d+px-[^/]+$/, "/$1")
      : imgUrl;
    return fullUrl;
  } catch (err) {
    // 404 is expected for candidates without Wikipedia pages — log at debug level
    if (err.response?.status !== 404) {
      console.warn(`[ImageScraper] Wikipedia API failed for "${name}": ${err.message}`);
    }
    return null;
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Try every photo source for a candidate until one yields a downloadable image.
 *
 * @param {object} candidate  MongoDB candidate document
 * @returns {{ buffer: Buffer, sourceLabel: string } | null}
 */
export async function findCandidatePhoto(candidate) {
  const slug = extractSlug(candidate.source_url);
  const name = candidate.name;

  const sources = [
    {
      label: "ballotpedia",
      fetchUrl: () => fetchBallotpediaPhotoUrl(slug),
    },
    {
      label: "wikipedia",
      fetchUrl: () => fetchWikipediaPhotoUrl(name),
    },
  ];

  for (const { label, fetchUrl } of sources) {
    let imgUrl;
    try {
      imgUrl = await fetchUrl();
    } catch (err) {
      console.warn(`[ImageScraper] ${label} URL fetch threw: ${err.message}`);
      continue;
    }

    if (!imgUrl) continue;

    // Reject known placeholder URLs before downloading
    if (PLACEHOLDER_URL_PATTERNS.some(p => p.test(imgUrl))) {
      console.log(`[ImageScraper] Skipping placeholder URL for "${name}": ${imgUrl}`);
      continue;
    }

    const buffer = await downloadImageBuffer(imgUrl);
    if (buffer) {
      console.log(`[ImageScraper] ✓ Found photo for "${name}" via ${label}: ${imgUrl}`);
      return { buffer, sourceLabel: label, originalUrl: imgUrl };
    }
  }

  console.log(`[ImageScraper] ✗ No photo found for "${name}"`);
  return null;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

/**
 * Extract the Ballotpedia slug from a source_url stored in MongoDB.
 * e.g. "https://ballotpedia.org/Steve_Toth" → "Steve_Toth"
 */
export function extractSlug(sourceUrl) {
  if (!sourceUrl) return null;
  const match = sourceUrl.match(/ballotpedia\.org\/(.+?)(?:\?.*)?$/);
  return match ? decodeURIComponent(match[1]) : null;
}
