import express from "express";
import { resolveAddress } from "../services/addressResolver.js";

const router = express.Router();

// GET /api/debug/districts?street=123+Main+St&city=Austin&state=TX&zip=78705
// Returns the resolved districts for a given address.
// Intended for manual verification against TX SoS, Texas Tribune, etc.
router.get("/districts", async (req, res) => {
  try {
    const { street, city, state, zip } = req.query;

    if (!street || !city || !state) {
      return res.status(400).json({
        error: "Please provide street, city, and state query parameters.",
      });
    }

    const info = await resolveAddress({ street, city, state, zip });

    if (
      !info.districts.congressional &&
      !info.districts.state_senate &&
      !info.districts.state_house
    ) {
      return res.status(404).json({
        error: "Unable to resolve districts for this address.",
        address: { street, city, state },
      });
    }

    return res.json({
      address: { street, city: info.city, state: info.state, zip: zip || null },
      location: {
        city: info.city,
        county: info.county || null,
        lat: info.lat ?? null,
        lng: info.lng ?? null,
      },
      districts: info.districts,
    });
  } catch (err) {
    console.error("Debug district lookup failed", err.message);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
