/**
 * GET /api/district-boundary?district=TX-20&type=congressional
 * GET /api/district-boundary?district=SD-14&type=state_senate
 * GET /api/district-boundary?district=HD-49&type=state_house
 * GET /api/district-boundary?type=state_outline          (Texas state boundary)
 *
 * Proxies the US Census Bureau TIGER Web REST API to fetch GeoJSON
 * boundaries for legislative districts. Results are cached in MongoDB
 * so subsequent requests are instant.
 */

import express from "express";
import axios from "axios";
import { getDB } from "../db.js";

const router = express.Router();

// Texas FIPS code
const TX_FIPS = "48";

// TIGER Web legislative service layers
const TIGER_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer";

// TIGER Web state boundary service
const TIGER_STATE_BASE =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer";

// Layer IDs in the TIGER Legislative service
const LAYER = {
  congressional: 0,   // 119th Congressional Districts
  state_senate: 1,    // 2024 State Legislative Districts - Upper
  state_house: 2,     // 2024 State Legislative Districts - Lower
};

/**
 * Parse a district string into a TIGER GEOID.
 *   TX-20  → { layer: 0,  geoid: "4820" }
 *   SD-14  → { layer: 10, geoid: "48014" }
 *   HD-49  → { layer: 20, geoid: "48049" }
 */
function parseDistrict(district, type) {
  if (!district || !type) return null;

  const layerId = LAYER[type];
  if (layerId == null) return null;

  // Extract the numeric part from the district string
  const match = district.match(/(\d+)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);

  let geoid;
  if (type === "congressional") {
    geoid = `${TX_FIPS}${String(num).padStart(2, "0")}`;
  } else {
    // State senate and house use 3-digit zero-padded numbers
    geoid = `${TX_FIPS}${String(num).padStart(3, "0")}`;
  }

  return { layerId, geoid };
}

/**
 * Fetch GeoJSON from the TIGER API for a specific GEOID + layer.
 */
async function fetchTigerBoundary(layerId, geoid, baseUrl = TIGER_BASE) {
  const url = `${baseUrl}/${layerId}/query`;
  const params = {
    where: `GEOID='${geoid}'`,
    outFields: "GEOID,BASENAME,NAME",
    f: "geojson",
    outSR: 4326,
  };

  const res = await axios.get(url, {
    params,
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
    },
  });

  if (
    res.data &&
    res.data.features &&
    res.data.features.length > 0
  ) {
    return res.data;
  }
  return null;
}

function getBoundaryCache() {
  return getDB().collection("boundary_cache");
}

router.get("/", async (req, res) => {
  try {
    const { district, type } = req.query;

    if (!type) {
      return res.status(400).json({
        error: "Please provide a type query parameter.",
      });
    }

    const validTypes = ["congressional", "state_senate", "state_house", "state_outline"];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `type must be one of: ${validTypes.join(", ")}`,
      });
    }

    const cache = getBoundaryCache();

    // Special case: Texas state outline (no district param needed)
    if (type === "state_outline") {
      const cacheKey = `state_outline:${TX_FIPS}`;
      const cached = await cache.findOne({ _id: cacheKey });
      if (cached?.geojson) {
        return res.json(cached.geojson);
      }

      // Layer 0 in State_County service = States
      const geojson = await fetchTigerBoundary(0, TX_FIPS, TIGER_STATE_BASE);
      if (!geojson) {
        return res.status(404).json({ error: "State boundary not found." });
      }

      await cache.updateOne(
        { _id: cacheKey },
        { $set: { _id: cacheKey, geojson, cached_at: new Date() } },
        { upsert: true },
      );
      return res.json(geojson);
    }

    // District-specific boundary types
    if (!district) {
      return res.status(400).json({
        error: "Please provide a district query parameter.",
      });
    }

    const parsed = parseDistrict(district, type);
    if (!parsed) {
      return res.status(400).json({ error: "Could not parse district." });
    }

    const cacheKey = `${type}:${parsed.geoid}`;

    // Check cache first
    const cached = await cache.findOne({ _id: cacheKey });
    if (cached?.geojson) {
      return res.json(cached.geojson);
    }

    // Fetch from TIGER API
    const geojson = await fetchTigerBoundary(parsed.layerId, parsed.geoid);
    if (!geojson) {
      return res.status(404).json({ error: "Boundary not found." });
    }

    // Cache indefinitely (boundaries don't change within a cycle)
    await cache.updateOne(
      { _id: cacheKey },
      { $set: { _id: cacheKey, geojson, cached_at: new Date() } },
      { upsert: true },
    );

    return res.json(geojson);
  } catch (err) {
    console.error("Boundary fetch failed:", err.message);
    return res.status(500).json({ error: "Failed to fetch boundary." });
  }
});

export default router;
