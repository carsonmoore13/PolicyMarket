import express from "express";
import axios from "axios";
import { getCandidatesCollection } from "../db.js";
import { resolveDistricts } from "../services/zipResolver.js";
import { filterCandidates } from "../services/candidateFilter.js";

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
    res.json(all);
  } catch (err) {
    console.error("Failed to fetch all candidates", err.message);
    res.status(500).json({ error: "Failed to fetch candidates." });
  }
});

router.get("/", async (req, res) => {
  try {
    const { zip, level } = req.query;
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
    res.json(filtered);
  } catch (err) {
    console.error("Candidate lookup failed", err.message);
    res.status(500).json({ error: "Failed to fetch candidates." });
  }
});

export default router;

