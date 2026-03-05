/**
 * Candidate filter — post-primary 2026.
 *
 * After the March 3, 2026 Texas primary the DB only holds real D/R nominees
 * and runoff candidates from Ballotpedia. All scraping noise has been
 * replaced, so we keep the filter simple: only show D or R, trust names
 * that came from Ballotpedia.
 */

const ALLOWED_PARTIES = new Set(["D", "R"]);

export function isAllowedCandidate(c) {
  if (!c || !c.name) return false;

  // Only D and R after the primary.
  const party = (c.party || "").toString().trim().toUpperCase();
  if (!ALLOWED_PARTIES.has(party)) return false;

  // Reject obviously non-person strings (shouldn't happen with the new scraper,
  // but kept as a safety net).
  const name = (c.name || "").trim();
  if (name.length < 4) return false;
  if (/^\d/.test(name)) return false;

  return true;
}

export function filterCandidates(candidates, districts, level) {
  if (!Array.isArray(candidates)) return [];

  const pool = candidates.filter(isAllowedCandidate);

  // Federal: U.S. House in the voter's congressional district OR U.S. Senate (statewide).
  const isFederal = (c) => {
    if (c.office_level !== "federal") return false;
    if (/senate/i.test(c.office)) return true;
    return c.district === districts.congressional;
  };

  // State: any state-level race in Texas.
  const isState = (c) => {
    if (c.office_level !== "state") return false;
    if (c.jurisdiction !== "Texas") return false;
    return true;
  };

  // Local: city/council level races.
  const isLocal = (c) =>
    c.office_level === "local" || c.office_level === "city";

  if (level === "federal") return pool.filter(isFederal);
  if (level === "state") return pool.filter(isState);
  if (level === "local") return pool.filter(isLocal);
  return pool;
}
