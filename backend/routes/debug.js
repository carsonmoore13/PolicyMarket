import express from "express";
import { resolveZipToDistricts } from "../geo/zip_to_district.js";

const router = express.Router();

// GET /api/debug/districts?zip=78705
// Returns the resolved congressional, state senate, and state house districts
// for a given ZIP code, along with basic location info. This is intended for
// manual verification against external tools (TX SoS, Texas Tribune, etc.).
router.get("/districts", async (req, res) => {
  try {
    const { zip } = req.query;
    if (!zip || !/^\d{5}$/.test(String(zip))) {
      return res
        .status(400)
        .json({ error: "Please provide a valid 5-digit zip parameter." });
    }

    const info = await resolveZipToDistricts(String(zip));

    if (
      !info.congressional_district &&
      !info.state_senate_district &&
      !info.state_house_district
    ) {
      return res.status(404).json({
        error: "Unable to resolve districts for this ZIP code.",
        zip: String(zip),
      });
    }

    return res.json({
      zip: String(zip),
      location: {
        city: info.city || null,
        county: info.county || null,
        lat: info.lat ?? null,
        lng: info.lng ?? null,
      },
      districts: {
        congressional: info.congressional_district || null,
        state_senate: info.state_senate_district || null,
        state_house: info.state_house_district || null,
      },
    });
  } catch (err) {
    console.error("Debug district lookup failed", err.message);
    return res
      .status(500)
      .json({ error: "Failed to resolve districts for this ZIP code." });
  }
});

export default router;

