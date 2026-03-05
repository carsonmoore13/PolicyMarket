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

// Normalize district strings for comparison: "HD-049" == "HD-49", "SD-014" == "SD-14"
function normalizeDistrict(d) {
  if (!d) return "";
  // Remove leading zeros from the numeric portion only.
  return d.replace(/(\D+)0*(\d+)/, (_, prefix, num) => `${prefix}${parseInt(num, 10)}`);
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

  // State: statewide offices (no district) always show; district-specific offices
  // (state house / state senate) only show if they match the voter's district.
  const isState = (c) => {
    if (c.office_level !== "state") return false;
    if (c.jurisdiction !== "Texas") return false;

    // No district on the candidate = statewide race, always include.
    if (!c.district) return true;

    const cd = normalizeDistrict(c.district);

    // State house race — match voter's house district.
    if (/^HD-/i.test(cd)) {
      return cd === normalizeDistrict(districts.state_house);
    }

    // State senate race — match voter's senate district.
    if (/^SD-/i.test(cd) || /^TX-SD/i.test(cd)) {
      return cd === normalizeDistrict(districts.state_senate);
    }

    // Anything else with a district (e.g. TX- congressional run from state level) — skip.
    return false;
  };

  // Local: city/council/county level races filtered by the voter's locality.
  const isLocal = (c) => {
    if (c.office_level !== "local" && c.office_level !== "city") return false;
    // If the candidate has a jurisdiction and we know the voter's locality,
    // only show candidates whose jurisdiction matches.
    if (c.jurisdiction && districts.locality) {
      return c.jurisdiction.toLowerCase().includes(districts.locality.toLowerCase()) ||
             districts.locality.toLowerCase().includes(c.jurisdiction.toLowerCase());
    }
    return true;
  };

  if (level === "federal") return pool.filter(isFederal);
  if (level === "state") return pool.filter(isState);
  if (level === "local") return pool.filter(isLocal);
  return pool;
}
