import express from "express";
import axios from "axios";
import { resolveDistricts } from "../services/zipResolver.js";

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

router.get("/", async (req, res) => {
  try {
    const { zip } = req.query;
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res
        .status(400)
        .json({ error: "Please provide a valid 5-digit zip parameter." });
    }
    const info = await fetchZipInfo(zip);
    const districts = resolveDistricts(
      info.lat,
      info.lng,
      info.state_abbreviation,
      zip,
    );
    const response = {
      zip: info.zip,
      city: info.city,
      state: info.state_abbreviation,
      lat: info.lat,
      lng: info.lng,
      districts,
    };
    if (!districts.congressional && !districts.state_house) {
      response.note = "District data not available for this ZIP";
    }
    res.json(response);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return res
        .status(404)
        .json({ error: "Could not find location data for this ZIP." });
    }
    console.error("ZIP lookup failed", err.message);
    res.status(500).json({ error: "Failed to resolve ZIP code." });
  }
});

export default router;

