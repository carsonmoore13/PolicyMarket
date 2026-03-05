/**
 * Admin routes — NOT for public consumption.
 *
 * POST /api/admin/seed-state
 *   Body: { state: "TX" }
 *   Triggers a full Ballotpedia scrape for the given state (overview pages
 *   → every race → bio-text policies, no photos).
 *   Runs asynchronously; returns immediately with { accepted: true }.
 *
 * GET /api/admin/seed-state/:state/status
 *   Returns whether a seed is in progress for a state and how many
 *   candidates are currently stored for it.
 */

import express from "express";
import { getCandidatesCollection } from "../db.js";
import { seedStateRaces, isSeedingInProgress } from "../services/stateFullSeeder.js";

const router = express.Router();

// POST /api/admin/seed-state  { state: "TX" }
router.post("/seed-state", async (req, res) => {
  const { state } = req.body || {};
  if (!state || !/^[A-Z]{2}$/.test(state)) {
    return res.status(400).json({ error: "Provide a 2-letter state abbreviation in the body: { state: 'TX' }" });
  }

  if (isSeedingInProgress(state)) {
    return res.json({ accepted: false, message: `Seeding for ${state} is already in progress.` });
  }

  // Fire the seeder asynchronously — don't block the HTTP response.
  seedStateRaces(state).catch((err) =>
    console.error(`[Admin] Seed failed for ${state}:`, err.message)
  );

  return res.json({
    accepted: true,
    message: `Seeding ${state} in the background. Check /api/admin/seed-state/${state}/status for progress.`,
  });
});

// GET /api/admin/seed-state/:state/status
router.get("/seed-state/:state/status", async (req, res) => {
  const state = (req.params.state || "").toUpperCase();
  try {
    const coll = getCandidatesCollection();
    const count = await coll.countDocuments({
      $or: [{ state }, { "district_zip_map.state": state }],
    });
    return res.json({
      state,
      seeding: isSeedingInProgress(state),
      candidate_count: count,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/candidates/count  — quick overview of all states
router.get("/candidates/count", async (_req, res) => {
  try {
    const coll = getCandidatesCollection();
    const pipeline = [
      {
        $group: {
          _id: { $ifNull: ["$state", { $ifNull: ["$district_zip_map.state", "unknown"] }] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ];
    const result = await coll.aggregate(pipeline).toArray();
    const total = result.reduce((s, r) => s + r.count, 0);
    return res.json({ total, by_state: result.map((r) => ({ state: r._id, count: r.count })) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
