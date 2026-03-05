import { connect, insertOrUpdateCandidate } from "./db.js";
import { fetchPostPrimary2026Candidates } from "./scrapers/ballotpedia2026.js";

export async function runPipeline() {
  const stats = {
    total_found: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed_sources: [],
  };

  const db = await connect();

  // Wipe the stale pre-primary candidate set before loading post-primary data.
  console.info("[pipeline] Clearing old candidates collection…");
  await db.collection("candidates").deleteMany({});
  console.info("[pipeline] Collection cleared.");

  // Also clear the api_cache so ZIP queries re-run against fresh data.
  try {
    await db.collection("api_cache").deleteMany({});
    console.info("[pipeline] api_cache cleared.");
  } catch (_) {}

  let candidates = [];
  try {
    candidates = await fetchPostPrimary2026Candidates();
  } catch (err) {
    console.error("[pipeline] Post-primary scraper failed:", err.message);
    stats.failed_sources.push("ballotpedia_2026");
  }

  stats.total_found = candidates.length;

  for (const c of candidates) {
    try {
      const result = await insertOrUpdateCandidate(c);
      if (result === "inserted") stats.inserted += 1;
      else if (result === "updated") stats.updated += 1;
      else stats.skipped += 1;
    } catch (err) {
      console.warn("[pipeline] Failed to save candidate:", c.name, err.message);
    }
  }

  console.info(
    "[pipeline] Complete:",
    `total=${stats.total_found}`,
    `inserted=${stats.inserted}`,
    `updated=${stats.updated}`,
    `skipped=${stats.skipped}`,
    `failed_sources=${JSON.stringify(stats.failed_sources)}`,
  );
  return stats;
}
