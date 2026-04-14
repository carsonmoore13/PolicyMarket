/**
 * County on-demand Ballotpedia discovery (raceDiscovery county-runtime) may insert
 * names before local filing ends. Optionally hide those rows until a calendar day.
 *
 * - If COUNTY_RUNTIME_LOCALS_VISIBLE_ON_TX (or _DEFAULT) is **unset**, county-runtime
 *   locals are shown immediately (same as pre-gate behavior).
 * - Set to e.g. 2026-08-18 to hide until after typical TX uniform-election filing.
 * - COUNTY_RUNTIME_BYPASS_FILING_GATE=1 forces visibility regardless of dates.
 */

export const COUNTY_RUNTIME_SOURCE_NAME = "Ballotpedia (county-runtime)";

function parseStartOfDayUtc(iso) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(0);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

/**
 * After this date (00:00 UTC), county-runtime–discovered locals are returned to clients.
 * When env is unset, returns true (no filing-date filter).
 */
export function shouldExposeCountyRuntimeDiscoveredCandidates(voterState) {
  const bypass = process.env.COUNTY_RUNTIME_BYPASS_FILING_GATE;
  if (bypass === "1" || /^true$/i.test(String(bypass || "").trim())) {
    return true;
  }

  const st = (voterState || "").toUpperCase();
  const raw =
    st === "TX"
      ? process.env.COUNTY_RUNTIME_LOCALS_VISIBLE_ON_TX
      : process.env.COUNTY_RUNTIME_LOCALS_VISIBLE_ON_DEFAULT;
  const iso = raw != null && String(raw).trim() !== "" ? String(raw).trim() : null;
  if (!iso) return true;

  const start = parseStartOfDayUtc(iso);
  return Date.now() >= start.getTime();
}

export function isCountyRuntimeDiscoveredCandidate(c) {
  return (c?.source_name || "") === COUNTY_RUNTIME_SOURCE_NAME;
}

/** Drop county-runtime docs from the in-memory pool used for API filtering. */
export function excludeGatedCountyRuntimeCandidates(candidates, voterState) {
  if (shouldExposeCountyRuntimeDiscoveredCandidates(voterState)) return candidates;
  return candidates.filter((c) => !isCountyRuntimeDiscoveredCandidate(c));
}

/** Cached rich payloads store serialized candidates; strip by source_name. */
export function excludeGatedCountyRuntimeFromSerialized(candidates, voterState) {
  if (shouldExposeCountyRuntimeDiscoveredCandidates(voterState)) return candidates;
  return (candidates || []).filter((c) => c?.source_name !== COUNTY_RUNTIME_SOURCE_NAME);
}
