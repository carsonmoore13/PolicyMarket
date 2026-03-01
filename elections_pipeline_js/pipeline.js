import { insertOrUpdateCandidate } from "./db.js";
import { fetchAustinCandidates } from "./scrapers/austin.js";
import { fetchTexasStateCandidates } from "./scrapers/texasState.js";
import { fetchFederalTexasCandidates } from "./scrapers/federalTexas.js";

export async function runPipeline() {
  const stats = {
    total_found: 0,
    city_count: 0,
    state_count: 0,
    federal_count: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed_sources: [],
    geo_success: 0,
    geo_failed: 0,
    geo_source_breakdown: {},
  };

  let cityList = [];
  let stateList = [];
  let federalList = [];

  try {
    cityList = await fetchAustinCandidates();
  } catch (err) {
    console.error("Austin scraper failed", err);
    stats.failed_sources.push("austin");
  }
  try {
    stateList = await fetchTexasStateCandidates();
  } catch (err) {
    console.error("Texas state scraper failed", err);
    stats.failed_sources.push("texas_state");
  }
  try {
    federalList = await fetchFederalTexasCandidates();
  } catch (err) {
    console.error("Federal Texas scraper failed", err);
    stats.failed_sources.push("federal_texas");
  }

  const all = [...cityList, ...stateList, ...federalList];
  stats.total_found = all.length;
  stats.city_count = cityList.length;
  stats.state_count = stateList.length;
  stats.federal_count = federalList.length;

  for (const c of all) {
    if (c.geo && c.geo.lat != null && c.geo.lng != null) {
      stats.geo_success += 1;
      const src = c.geo.geo_source || "unknown";
      stats.geo_source_breakdown[src] = (stats.geo_source_breakdown[src] || 0) + 1;
    } else {
      stats.geo_failed += 1;
    }
    const result = await insertOrUpdateCandidate(c);
    if (result === "inserted") stats.inserted += 1;
    else if (result === "updated") stats.updated += 1;
    else stats.skipped += 1;
  }

  console.info(
    "Pipeline complete:",
    "total_found=" + stats.total_found,
    "city=" + stats.city_count,
    "state=" + stats.state_count,
    "federal=" + stats.federal_count,
    "inserted=" + stats.inserted,
    "updated=" + stats.updated,
    "skipped=" + stats.skipped,
    "failed_sources=" + JSON.stringify(stats.failed_sources),
    "geo_success=" + stats.geo_success,
    "geo_failed=" + stats.geo_failed,
    "geo_breakdown=" + JSON.stringify(stats.geo_source_breakdown)
  );
  return stats;
}
