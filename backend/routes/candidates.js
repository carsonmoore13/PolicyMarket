import express from "express";
import { ObjectId } from "mongodb";
import axios from "axios";
import * as cheerio from "cheerio";
import { getCandidatesCollection, getApiCacheCollection } from "../db.js";
import { resolveAddress, normalizeAddressKey } from "../services/addressResolver.js";
import { filterCandidates, isAllowedCandidate } from "../services/candidateFilter.js";
import { getSchoolBoardNotice, getMayoralNotice, getCityCouncilNotice, getTownshipNotice } from "../services/schoolElectionNotice.js";
import { triggerDiscovery, triggerCountyDiscovery, isDiscovering } from "../services/raceDiscovery.js";
import {
  excludeGatedCountyRuntimeCandidates,
  excludeGatedCountyRuntimeFromSerialized,
} from "../services/localDiscoveryGate.js";

// Generic party platform fallbacks — used when a candidate has no specific policies.
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

/**
 * Serialize a candidate document into the API response shape.
 * `image` is a convenience top-level field pointing at the S3 URL (or null).
 * `photo` retains the full sub-document for richer client-side use
 * (fallback initials, source label, etc.).
 *
 * Policies are guaranteed to be a non-empty array: DB policies → topics →
 * generic party-platform fallback.
 */
function serializeCandidate(c) {
  const photoUrl = c.photo?.url || null;
  // Merge policies and topics so both storage schemas render correctly.
  // Fall back to generic party policies so federal/state sidebar always has content.
  const party = (c.party || "").toUpperCase();
  const policies = (c.policies?.length ? c.policies : null) ||
                   (c.topics?.length   ? c.topics   : null) ||
                   GENERIC_POLICIES[party] ||
                   [];
  return {
    _id:          c._id?.toString() || null,
    name:         c.name,
    office:       c.office,
    office_level: c.office_level,
    jurisdiction: c.jurisdiction || null,
    party:        c.party,
    district:     c.district,
    home_city:    c.home_city || null,
    status_2026:  c.status_2026 || null,
    source_url:   c.source_url || null,
    source_name:  c.source_name || null,
    // Convenience field — the S3 (or external) image URL, ready to use in <img src>
    image: photoUrl,
    photo: c.photo
      ? {
          url:               photoUrl,
          source:            c.photo.source || null,
          verified:          c.photo.verified || false,
          fallback_initials: c.photo.fallback_initials || null,
        }
      : null,
    geo:      c.geo      || null,
    policies,
  };
}

const router = express.Router();

// GET /api/candidates/all  — returns aggregate counts by office_level (not full docs)
router.get("/all", async (_req, res) => {
  try {
    const coll = getCandidatesCollection();
    const pipeline = [
      { $group: { _id: "$office_level", count: { $sum: 1 } } },
    ];
    const results = await coll.aggregate(pipeline).toArray();
    const counts = { federal: 0, state: 0, local: 0, total: 0 };
    for (const r of results) {
      const lvl = (r._id || "").toLowerCase();
      if (counts[lvl] !== undefined) counts[lvl] = r.count;
      counts.total += r.count;
    }
    res.json(counts);
  } catch (err) {
    console.error("Failed to fetch candidate counts", err.message);
    res.status(500).json({ error: "Failed to fetch candidates." });
  }
});

// ─── Ballotpedia bio scraper (on-demand, cached in DB) ──────────────────────

/** Regex patterns that indicate a paragraph is CSS/HTML junk, not biography text. */
const BIO_JUNK_RE =
  /jQuery|padding|font-size|font-weight|margin-left|list-style|tusa-race|\.ballot-measure|\.endorsements|\.subcommittee|\.source-link|color:\s*#|<\/?pre>|<\/?p>|background-color|text-align|border-radius|\.mw-|\.campaign|display:\s*|position:\s*|overflow:\s*|z-index/i;

/**
 * Strip CSS / HTML fragments that leak into Ballotpedia article text.
 * Handles blocks like: ".subcommittee { font-weight: 400; ... }"
 */
function cleanBioText(text) {
  if (!text) return text;
  // Remove inline CSS rule blocks:  .selector { ... }
  let cleaned = text.replace(/\.[a-z_-]+\s*\{[^}]*\}/gi, "");
  // Remove stray HTML tags
  cleaned = cleaned.replace(/<\/?[a-z][^>]*>/gi, "");
  // Remove orphaned CSS property lines (e.g. "color: #337ab7, }")
  cleaned = cleaned.replace(/[a-z-]+:\s*[^;,}]+[;,}]/gi, (match) => {
    // Only strip if it looks like CSS, not natural English
    if (/^(color|font|margin|padding|border|display|position|background|list-style|text-align|overflow|z-index)/i.test(match)) return "";
    return match;
  });
  // Collapse whitespace
  cleaned = cleaned.replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function scrapeBio(html) {
  const $ = cheerio.load(html);
  const paragraphs = [];

  $(".mw-parser-output > p").each((_, el) => {
    let text = $(el)
      .text()
      .replace(/\[\d+\]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 40) return;
    if (BIO_JUNK_RE.test(text)) {
      // Try to salvage — some paragraphs have real bio text mixed with CSS
      text = cleanBioText(text);
      if (text.length < 40 || BIO_JUNK_RE.test(text)) return;
    }
    paragraphs.push(text);
  });

  return paragraphs.slice(0, 6).join("\n\n");
}

// GET /api/candidates/:id/bio
router.get("/:id/bio", async (req, res) => {
  try {
    const coll = getCandidatesCollection();
    let oid;
    try { oid = new ObjectId(req.params.id); } catch { 
      return res.status(400).json({ error: "Invalid candidate ID" });
    }

    const doc = await coll.findOne({ _id: oid });
    if (!doc) return res.status(404).json({ error: "Candidate not found" });

    // Return cached bio if we already have it
    if (doc.bio && doc.bio.length > 50) {
      let bio = doc.bio;
      // Clean cached bios that contain CSS/HTML junk from earlier scrapes
      if (BIO_JUNK_RE.test(bio)) {
        bio = cleanBioText(bio);
        if (bio.length > 30) {
          await coll.updateOne({ _id: oid }, { $set: { bio } });
        }
      }
      return res.json({ bio, source: doc.bio_source || "ballotpedia", cached: true });
    }

    if (!doc.source_url) {
      return res.json({ bio: null, source: null, error: "No Ballotpedia URL for this candidate" });
    }

    // Scrape bio from Ballotpedia
    let html;
    try {
      const resp = await axios.get(doc.source_url, {
        timeout: 12000,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
          Accept: "text/html",
        },
        responseType: "text",
      });
      html = resp.data;
    } catch {
      return res.json({ bio: null, source: null, error: "Failed to fetch Ballotpedia page" });
    }

    const bio = scrapeBio(html);
    if (!bio || bio.length < 30) {
      return res.json({ bio: null, source: null, error: "No bio found on Ballotpedia" });
    }

    // Cache in DB so we never re-scrape
    await coll.updateOne(
      { _id: oid },
      { $set: { bio, bio_source: "ballotpedia", bio_fetched: new Date() } },
    );

    return res.json({ bio, source: "ballotpedia", cached: false });
  } catch (err) {
    console.error("Bio fetch failed", err.message);
    return res.status(500).json({ error: "Failed to fetch bio" });
  }
});

/**
 * GET /api/candidates
 *
 * Required query params:
 *   street, city, state
 *
 * Optional:
 *   zip    — improves geocoding accuracy
 *   level  — "federal" | "state" | "local"
 *             Omit to get the rich payload (location + districts + all candidates).
 *             Include to get a flat filtered array for a single sidebar tab.
 *
 * DISCOVERY FLOW FOR NEW DISTRICTS:
 *   When candidates is empty for a new state, `triggerDiscovery` fires in the
 *   background to scrape Ballotpedia for the missing races. The response
 *   includes `discovering: true` so the frontend can show a "Loading…" message
 *   and re-fetch after ~30 seconds. The result is NOT cached until candidates
 *   are present so the next request gets the populated data.
 */
router.get("/", async (req, res) => {
  try {
    const { street, city, state, zip, level } = req.query;

    if (!street || !city || !state) {
      return res.status(400).json({
        error: "Please provide street, city, and state query parameters.",
      });
    }

    // Resolve address → lat/lng + districts (Census + Google Civic, cached).
    let resolved;
    try {
      resolved = await resolveAddress({ street, city, state, zip });
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }

    const { lat, lng, districts } = resolved;
    // Attach county to districts so candidateFilter can use it for local matching
    if (resolved.county) districts.county = resolved.county;
    const voterState = resolved.state || state; // 2-letter abbreviation
    const returnedCity = resolved.city || city;
    const returnedState = resolved.state || state;

    const cacheKey = normalizeAddressKey({ street, city, state });

    // ── Level-filtered path (sidebar tab re-fetch) ─────────────────────────
    if (level) {
      const lvl = level.toLowerCase();
      if (!["federal", "state", "local"].includes(lvl)) {
        return res
          .status(400)
          .json({ error: "level must be one of federal, state, local" });
      }

      const coll = getCandidatesCollection();
      const all = await coll.find({ state: voterState }).toArray();
      const allForApi = excludeGatedCountyRuntimeCandidates(all, voterState);
      const filtered = filterCandidates(allForApi, districts, lvl, voterState);

      // Trigger discovery in background if this tab is empty
      const needsDiscovery = filtered.length === 0;
      if (needsDiscovery) {
        triggerDiscovery(districts, voterState, all);
      }

      const school_board =
        lvl === "local" ? getSchoolBoardNotice(voterState, districts.school_district) : null;
      const mayoral = lvl === "local" ? getMayoralNotice(voterState, districts.locality) : null;
      const city_council = lvl === "local" ? getCityCouncilNotice(voterState, districts.locality) : null;
      const township = lvl === "local" ? getTownshipNotice(voterState, districts.locality) : null;

      // Return structured response so the frontend can show a "discovering" banner
      return res.json({
        candidates: filtered.map(serializeCandidate),
        discovering: needsDiscovery && isDiscovering(voterState, districts),
        school_board,
        mayoral,
        city_council,
        township,
      });
    }

    // ── Rich payload path (initial address submission) ─────────────────────
    const apiCache = getApiCacheCollection();
    const cached = await apiCache.findOne({ address_key: cacheKey });
    if (cached?.response) {
      const resp = { ...cached.response };
      if (Array.isArray(resp.candidates)) {
        resp.candidates = excludeGatedCountyRuntimeFromSerialized(resp.candidates, voterState);
      }
      return res.json(resp);
    }

    // Fetch candidates for the voter's state (avoids loading the full collection).
    const coll = getCandidatesCollection();
    const all = await coll.find({ state: voterState }).toArray();
    const allForApi = excludeGatedCountyRuntimeCandidates(all, voterState);

    const federal = filterCandidates(allForApi, districts, "federal", voterState);
    const state_candidates = filterCandidates(allForApi, districts, "state", voterState);
    const local = filterCandidates(allForApi, districts, "local", voterState);
    const candidates = [...federal, ...state_candidates, ...local];

    if (!districts.congressional && !districts.state_house) {
      return res.status(400).json({
        error:
          "Unable to resolve districts for this address. Please check the address and try again.",
      });
    }

    // If no candidates found for this state+districts, trigger background
    // discovery and let the client know to retry.
    const discovering = !candidates.length && !isDiscovering(voterState, districts);
    if (!candidates.length) {
      triggerDiscovery(districts, voterState, all);
    }

    // Trigger county-level local discovery if no local candidates for this county
    if (local.length === 0 && resolved.county) {
      triggerCountyDiscovery(resolved.county, voterState, all);
    }

    const payload = {
      address: { street, city: returnedCity, state: returnedState, zip: zip || null },
      location: {
        city: returnedCity,
        county: resolved.county || null,
        lat,
        lng,
      },
      districts: {
        congressional: districts.congressional,
        state_senate: districts.state_senate,
        state_house: districts.state_house,
        locality: districts.locality ?? null,
        school_district: districts.school_district ?? null,
      },
      candidates: candidates.map(serializeCandidate),
    };

    if (!payload.candidates.length) {
      payload.message = discovering
        ? "Fetching candidate data for your area — please try again in about 30 seconds."
        : "No 2026 candidates found for this address yet.";
      payload.discovering = discovering || isDiscovering(voterState, districts);
    }

    // Only cache when we have candidates so subsequent requests see fresh data.
    if (payload.candidates.length > 0) {
      await apiCache.updateOne(
        { address_key: cacheKey },
        {
          $set: {
            address_key: cacheKey,
            response: payload,
            cached_at: new Date(),
          },
        },
        { upsert: true }
      );
    }

    return res.json(payload);
  } catch (err) {
    console.error("Candidate lookup failed", err.message);
    return res.status(500).json({ error: "Failed to fetch candidates." });
  }
});

export default router;
