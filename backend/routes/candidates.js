import express from "express";
import { getCandidatesCollection, getApiCacheCollection } from "../db.js";
import { resolveAddress, normalizeAddressKey } from "../services/addressResolver.js";
import { filterCandidates, isAllowedCandidate } from "../services/candidateFilter.js";
import { triggerDiscovery, isDiscovering } from "../services/raceDiscovery.js";

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

// GET /api/candidates/all  — returns the full unfiltered candidate set
router.get("/all", async (_req, res) => {
  try {
    const coll = getCandidatesCollection();
    const all = await coll.find({}).toArray();
    const filtered = all.filter(isAllowedCandidate);
    res.json(filtered);
  } catch (err) {
    console.error("Failed to fetch all candidates", err.message);
    res.status(500).json({ error: "Failed to fetch candidates." });
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
      const all = await coll.find({}).toArray();
      const filtered = filterCandidates(all, districts, lvl, voterState);

      // Trigger discovery in background if this tab is empty
      const needsDiscovery = filtered.length === 0;
      if (needsDiscovery) {
        triggerDiscovery(districts, voterState, all);
      }

      // Return structured response so the frontend can show a "discovering" banner
      return res.json({
        candidates: filtered.map(serializeCandidate),
        discovering: needsDiscovery && isDiscovering(voterState, districts),
      });
    }

    // ── Rich payload path (initial address submission) ─────────────────────
    const apiCache = getApiCacheCollection();
    const cached = await apiCache.findOne({ address_key: cacheKey });
    if (cached?.response) {
      return res.json(cached.response);
    }

    // Fetch all candidates and filter for each level.
    const coll = getCandidatesCollection();
    const all = await coll.find({}).toArray();

    const federal = filterCandidates(all, districts, "federal", voterState);
    const state_candidates = filterCandidates(all, districts, "state", voterState);
    const local = filterCandidates(all, districts, "local", voterState);
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
