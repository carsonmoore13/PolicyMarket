/**
 * GET /api/address-lookup
 *
 * Resolves a voter's full street address to their legislative districts
 * using the US Census Bureau Geocoder (free, no API key required).
 *
 * Query params:
 *   street  (required)  e.g. "2201 Barton Springs Rd"
 *   city    (required)  e.g. "Austin"
 *   state   (required)  e.g. "TX"
 *   zip     (optional)  improves geocoding accuracy
 *
 * Response:
 *   { street, city, state, lat, lng, districts: { congressional, state_senate, state_house, locality } }
 */

import express from "express";
import { resolveAddress } from "../services/addressResolver.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const { street, city, state, zip } = req.query;

    if (!street || !city || !state) {
      return res.status(400).json({
        error: "Please provide street, city, and state.",
      });
    }

    const result = await resolveAddress({ street, city, state, zip });

    return res.json({
      street,
      city: result.city,
      state: result.state,
      county: result.county,
      lat: result.lat,
      lng: result.lng,
      districts: result.districts,
    });
  } catch (err) {
    const notFound =
      err.message?.toLowerCase().includes("not found") ||
      err.message?.toLowerCase().includes("address not found");
    console.error("Address lookup failed:", err.message);
    return res.status(notFound ? 404 : 500).json({ error: err.message });
  }
});

export default router;
