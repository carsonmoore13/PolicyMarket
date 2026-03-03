import express from "express";
import axios from "axios";
import { getCandidatesCollection, getApiCacheCollection } from "../db.js";
import { resolveDistricts } from "../services/zipResolver.js";
import { filterCandidates, isAllowedCandidate } from "../services/candidateFilter.js";
import { getCandidatesByZip } from "../geo/zip_to_district.js";

const router = express.Router();

async function fetchZipInfo(zip) {
  const url = `https://api.zippopotam.us/us/${zip}`;
  const res = await axios.get(url, { timeout: 10000 });
  const place = res.data.places && res.data.places[0];
  if (!place) throw new Error("ZIP data missing places");
  return {
    zip: res.data["post code"],
    city: place["place name"],
    state: place["state"],
    state_abbreviation: place["state abbreviation"],
    lat: parseFloat(place.latitude),
    lng: parseFloat(place.longitude),
  };
}

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

router.get("/", async (req, res) => {
  try {
    const { zip, level } = req.query;

    // New behavior: if only zip is provided, return rich zip-based payload
    if (zip && !level) {
      if (!/^\d{5}$/.test(zip)) {
        return res
          .status(400)
          .json({ error: "Please provide a valid 5-digit zip parameter." });
      }

      const apiCache = getApiCacheCollection();
      const cached = await apiCache.findOne({ zip });
      if (cached?.response) {
        return res.json(cached.response);
      }

      const { districts, candidates } = await getCandidatesByZip(zip);

      if (!districts || (!districts.congressional_district && !districts.state_house_district)) {
        return res.status(400).json({
          error: "Unable to resolve districts for this ZIP code.",
        });
      }

      const info = await fetchZipInfo(zip);

      const payload = {
        zip,
        location: {
          city: info.city,
          county: districts.county || null,
          lat: info.lat,
          lng: info.lng,
        },
        districts: {
          congressional: districts.congressional_district,
          state_senate: districts.state_senate_district,
          state_house: districts.state_house_district,
        },
        candidates: candidates.map((c) => ({
          name: c.name,
          office: c.office,
          office_level: c.office_level,
          party: c.party,
          district: c.district,
          photo: c.photo || null,
          geo: c.geo || null,
        })),
      };

      if (!payload.candidates.length) {
        payload.message = "No 2026 candidates found for this zip code yet";
      }

      await apiCache.updateOne(
        { zip },
        { $set: { zip, response: payload, cached_at: new Date() } },
        { upsert: true },
      );

      return res.json(payload);
    }

    // Existing behavior: zip + level -> filtered list for current view
    const lvl = (level || "federal").toLowerCase();
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res
        .status(400)
        .json({ error: "Please provide a valid 5-digit zip parameter." });
    }
    if (!["federal", "state", "local"].includes(lvl)) {
      return res
        .status(400)
        .json({ error: "level must be one of federal, state, local" });
    }

    const info = await fetchZipInfo(zip);
    const districts = resolveDistricts(
      info.lat,
      info.lng,
      info.state_abbreviation,
      zip,
    );

    const coll = getCandidatesCollection();
    const all = await coll.find({}).toArray();
    const filtered = filterCandidates(all, districts, lvl);
    return res.json(filtered);
  } catch (err) {
    console.error("Candidate lookup failed", err.message);
    return res.status(500).json({ error: "Failed to fetch candidates." });
  }
});

/**
 * FRONTEND CONSUMPTION NOTES
 *
 * - Sidebar candidate cards:
 *   - Call GET /api/candidates?zip=XXXXX (without level) once the user enters a ZIP.
 *   - Use response.candidates[*].photo.url as <img src>. Attach an onError handler to
 *     fall back to rendering response.candidates[*].photo.fallback_initials in a styled
 *     circle avatar if the image fails to load.
 *
 * - Map markers:
 *   - Use response.candidates[*].geo.lat/lng for marker positions.
 *   - If photo.url is present, build a custom Leaflet divIcon that includes the photo.
 *   - If photo.url is null or the image fails, render a colored circle with the
 *     fallback_initials text overlaid, matching the candidate’s party color.
 *
 * - Verified badge:
 *   - If response.candidates[*].photo.verified === true, display a small checkmark
 *     badge on the candidate’s photo (both in the sidebar card and on the map marker).
 *   - Optional tooltip: "Official verified headshot".
 */

export default router;

