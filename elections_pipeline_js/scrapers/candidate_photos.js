import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { MongoClient } from "mongodb";
import { MONGODB_URI, MONGODB_DB_NAME, REQUESTS_TIMEOUT, RATE_LIMIT_DELAY } from "../config.js";

const HTTP_TIMEOUT_MS = Math.min(REQUESTS_TIMEOUT * 1000, 5000);
const DOMAIN_RATE_LIMIT_MS = Math.max(Math.floor(RATE_LIMIT_DELAY * 1000), 1500);

let _client = null;

function getClient() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }
  return _client;
}

async function getDb() {
  const client = getClient();
  if (!client.topology) {
    await client.connect();
  }
  return client.db(MONGODB_DB_NAME);
}

// --- Simple per-domain rate limiting ---
const lastRequestPerDomain = new Map();

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return null;
  }
}

async function rateLimitForUrl(url) {
  const domain = getDomain(url);
  if (!domain) return;
  const now = Date.now();
  const last = lastRequestPerDomain.get(domain) ?? 0;
  const diff = now - last;
  if (diff < DOMAIN_RATE_LIMIT_MS) {
    await new Promise((r) => setTimeout(r, DOMAIN_RATE_LIMIT_MS - diff));
  }
  lastRequestPerDomain.set(domain, Date.now());
}

async function safeGet(url, options = {}) {
  await rateLimitForUrl(url);
  const opts = {
    timeout: HTTP_TIMEOUT_MS,
    maxRedirects: 5,
    ...options,
  };
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.get(url, opts);
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw lastErr;
}

function computeInitials(name) {
  if (!name) return "";
  const parts = name
    .split(" ")
    .filter((p) => p && /^[A-Za-z]/.test(p));
  if (!parts.length) return "";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function gravatarUrlForName(name) {
  const base = (name || "").toLowerCase().trim();
  const hash = crypto.createHash("md5").update(base, "utf8").digest("hex");
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=256`;
}

function normalizeNameParts(name) {
  if (!name) return { first: "", last: "" };
  const parts = name
    .split(" ")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

function logPhotoResult(candidate, source, result) {
  const name = candidate?.name || "Unknown";
  // result: "found", "not_found", or "error: message"
  console.log(`[PHOTO] ${name} | ${source} | ${result}`);
}

// --- Priority 1: Bioguide (federal only) ---

async function tryBioguide(candidate) {
  if ((candidate.office_level || "").toLowerCase() !== "federal") {
    return null;
  }
  const jurisdiction = (candidate.jurisdiction || "").toLowerCase();
  const stateAbbr = jurisdiction === "texas" ? "TX" : "";
  const { first, last } = normalizeNameParts(candidate.name);
  if (!first || !last || !stateAbbr) return null;

  try {
    const searchUrl = `https://bioguide.congress.gov/search/bio?lastname=${encodeURIComponent(
      last,
    )}&firstname=${encodeURIComponent(first)}&state=${encodeURIComponent(stateAbbr)}`;
    const res = await safeGet(searchUrl, { responseType: "json" });
    const data = res.data;
    const hits = Array.isArray(data?.results) ? data.results : [];
    if (!hits.length) {
      logPhotoResult(candidate, "bioguide", "not_found");
      return null;
    }
    const hit = hits[0];
    const bioguideId = hit.bioguide_id || hit.id;
    if (!bioguideId) {
      logPhotoResult(candidate, "bioguide", "not_found");
      return null;
    }
    const letter = bioguideId[0];
    const url = `https://bioguide.congress.gov/bioguide/photo/${letter}/${bioguideId}.jpg`;
    logPhotoResult(candidate, "bioguide", "found");
    return {
      url,
      source: "bioguide",
      verified: true,
    };
  } catch (err) {
    logPhotoResult(candidate, "bioguide", `error: ${err.message}`);
    return null;
  }
}

// --- Priority 2: FEC ---

async function tryFec(candidate) {
  const name = candidate.name || "";
  if (!name || (candidate.jurisdiction || "").toLowerCase() !== "texas") {
    return null;
  }
  try {
    const url = "https://api.open.fec.gov/v1/candidates/";
    const params = {
      api_key: process.env.FEC_API_KEY || "DEMO_KEY",
      name,
      state: "TX",
      per_page: 5,
    };
    const res = await safeGet(url, { params, responseType: "json" });
    const results = Array.isArray(res.data?.results) ? res.data.results : [];
    if (!results.length) {
      logPhotoResult(candidate, "fec", "not_found");
      return null;
    }
    const match = results[0];
    const photoUrl = match.image_url || match.photo_url || null;
    if (!photoUrl) {
      logPhotoResult(candidate, "fec", "not_found");
      return null;
    }
    logPhotoResult(candidate, "fec", "found");
    return {
      url: photoUrl,
      source: "fec",
      verified: true,
    };
  } catch (err) {
    logPhotoResult(candidate, "fec", `error: ${err.message}`);
    return null;
  }
}

// --- Priority 3: Official website (.gov / texas.gov / austintexas.gov) ---

function isOfficialGovUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".gov") ||
      host.endsWith(".texas.gov") ||
      host.endsWith("austintexas.gov")
    );
  } catch {
    return false;
  }
}

async function tryOfficialSite(candidate) {
  const srcUrl = candidate.source_url || "";
  if (!isOfficialGovUrl(srcUrl)) return null;
  try {
    const res = await safeGet(srcUrl, { responseType: "text" });
    const html = res.data;
    const $ = cheerio.load(html);
    const name = (candidate.name || "").toLowerCase();

    let bestImg = null;
    $("img").each((_, el) => {
      const alt = ($(el).attr("alt") || "").toLowerCase();
      const cls = ($(el).attr("class") || "").toLowerCase();
      if (!alt && !cls) return;
      if (name && (alt.includes(name) || cls.includes("headshot") || cls.includes("portrait"))) {
        const src = $(el).attr("src");
        if (src && !bestImg) {
          bestImg = src;
        }
      }
    });
    if (!bestImg) {
      logPhotoResult(candidate, "official_website", "not_found");
      return null;
    }
    let finalUrl = bestImg;
    if (!/^https?:\/\//i.test(bestImg)) {
      const base = new URL(srcUrl);
      finalUrl = new URL(bestImg, base).toString();
    }
    logPhotoResult(candidate, "official_website", "found");
    return {
      url: finalUrl,
      source: "official_website",
      verified: false,
    };
  } catch (err) {
    logPhotoResult(candidate, "official_website", `error: ${err.message}`);
    return null;
  }
}

// --- Priority 4: Wikipedia / Ballotpedia ---

async function tryWikipedia(candidate) {
  const name = candidate.name || "";
  if (!name) return null;
  const slug = name.trim().replace(/\s+/g, "_");
  const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`;
  try {
    const res = await safeGet(url, { responseType: "text" });
    const html = res.data;
    const $ = cheerio.load(html);
    const img = $(".infobox img").first();
    const src = img.attr("src");
    if (!src) {
      logPhotoResult(candidate, "wikipedia", "not_found");
      return null;
    }
    let finalUrl = src;
    if (src.startsWith("//")) {
      finalUrl = `https:${src}`;
    } else if (!/^https?:\/\//i.test(src)) {
      finalUrl = `https://en.wikipedia.org${src}`;
    }
    logPhotoResult(candidate, "wikipedia", "found");
    return {
      url: finalUrl,
      source: "wikipedia",
      verified: false,
    };
  } catch (err) {
    logPhotoResult(candidate, "wikipedia", `error: ${err.message}`);
    return null;
  }
}

async function tryBallotpedia(candidate) {
  const name = candidate.name || "";
  if (!name) return null;
  const slug = name.trim().replace(/\s+/g, "_");
  const url = `https://ballotpedia.org/${encodeURIComponent(slug)}`;
  try {
    const res = await safeGet(url, { responseType: "text" });
    const html = res.data;
    const $ = cheerio.load(html);
    const img = $(".infobox img").first();
    const src = img.attr("src");
    if (!src) {
      logPhotoResult(candidate, "ballotpedia", "not_found");
      return null;
    }
    let finalUrl = src;
    if (src.startsWith("//")) {
      finalUrl = `https:${src}`;
    } else if (!/^https?:\/\//i.test(src)) {
      finalUrl = `https://ballotpedia.org${src}`;
    }
    logPhotoResult(candidate, "ballotpedia", "found");
    return {
      url: finalUrl,
      source: "ballotpedia",
      verified: false,
    };
  } catch (err) {
    logPhotoResult(candidate, "ballotpedia", `error: ${err.message}`);
    return null;
  }
}

// --- Priority 5: Gravatar fallback ---

function makeGravatarFallback(candidate) {
  const url = gravatarUrlForName(candidate.name || "");
  logPhotoResult(candidate, "gravatar_fallback", "found");
  return {
    url,
    source: "gravatar_fallback",
    verified: false,
  };
}

export async function fetchCandidatePhoto(candidate) {
  const fallback_initials = computeInitials(candidate.name || "");

  try {
    const attempts = [
      tryBioguide,
      tryFec,
      tryOfficialSite,
      tryWikipedia,
      tryBallotpedia,
    ];

    for (const fn of attempts) {
      // eslint-disable-next-line no-await-in-loop
      const result = await fn(candidate);
      if (result && result.url) {
        return {
          url: result.url,
          source: result.source || null,
          verified: Boolean(result.verified),
          fallback_initials,
        };
      }
    }

    const fallback = makeGravatarFallback(candidate);
    return {
      url: fallback.url,
      source: fallback.source,
      verified: fallback.verified,
      fallback_initials,
    };
  } catch (err) {
    logPhotoResult(candidate, "pipeline", `error: ${err.message}`);
    const fallback = makeGravatarFallback(candidate);
    return {
      url: fallback.url,
      source: fallback.source,
      verified: fallback.verified,
      fallback_initials,
    };
  }
}

export async function enrichAllCandidatesWithPhotos() {
  const db = await getDb();
  const coll = db.collection("candidates");

  const cursor = coll.find({
    $or: [{ photo: { $exists: false } }, { "photo.url": null }],
  });

  let processed = 0;
  for await (const doc of cursor) {
    const candidate = doc;
    const photo = await fetchCandidatePhoto(candidate);
    const now = new Date();
    await coll.updateOne(
      { _id: candidate._id },
      {
        $set: {
          photo: {
            url: photo.url,
            source: photo.source,
            verified: photo.verified,
            last_fetched: now,
            fallback_initials: photo.fallback_initials,
          },
        },
      },
    );
    processed += 1;
  }

  console.info(`enrichAllCandidatesWithPhotos complete. processed=${processed}`);
}

// CLI entrypoint: node scrapers/candidate_photos.js --enrich
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes("--enrich")) {
    enrichAllCandidatesWithPhotos()
      .then(() => {
        console.log("Photo enrichment finished.");
        process.exit(0);
      })
      .catch((err) => {
        console.error("Photo enrichment failed:", err);
        process.exit(1);
      });
  }
}

