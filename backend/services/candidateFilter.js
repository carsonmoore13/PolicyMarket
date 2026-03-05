/**
 * Candidate filter — post-primary 2026.
 *
 * Supports multi-state filtering: federal candidates are matched by
 * congressional district (US House) or voter state (US Senate). State-level
 * candidates are matched by state + district. Local candidates are matched
 * by jurisdiction/locality.
 */

const ALLOWED_PARTIES = new Set(["D", "R"]);

// Map full jurisdiction/state names → 2-letter abbreviation.
const STATE_ABBR_FROM_JURISDICTION = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID",
  Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
  Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};

/**
 * Derive a 2-letter state abbreviation from a candidate object.
 * Checks (in priority order):
 *   1. c.state             — top-level field set by new scrapers
 *   2. c.district_zip_map.state — legacy field used by TX pipeline
 *   3. c.jurisdiction → name→abbr lookup
 */
function getCandidateState(c) {
  if (c.state && /^[A-Z]{2}$/.test(c.state)) return c.state;
  const dzmState = c.district_zip_map?.state;
  if (dzmState && /^[A-Z]{2}$/.test(dzmState)) return dzmState;
  if (c.jurisdiction) return STATE_ABBR_FROM_JURISDICTION[c.jurisdiction] || null;
  return null;
}

export function isAllowedCandidate(c) {
  if (!c || !c.name) return false;
  const party = (c.party || "").toString().trim().toUpperCase();
  if (!ALLOWED_PARTIES.has(party)) return false;
  const name = (c.name || "").trim();
  if (name.length < 4) return false;
  if (/^\d/.test(name)) return false;
  return true;
}

// Normalize district strings: "HD-049" == "HD-49", "SD-014" == "SD-14"
function normalizeDistrict(d) {
  if (!d) return "";
  return d.replace(/(\D+)0*(\d+)/, (_, prefix, num) => `${prefix}${parseInt(num, 10)}`);
}

/**
 * Filter candidates by level for a specific voter.
 *
 * @param {object[]} candidates  - full candidate array from MongoDB
 * @param {object}   districts   - { congressional, state_senate, state_house, locality }
 * @param {string}   level       - "federal" | "state" | "local"
 * @param {string}   [voterState] - 2-letter state abbreviation from the address resolver (e.g. "TX")
 */
export function filterCandidates(candidates, districts, level, voterState = null) {
  if (!Array.isArray(candidates)) return [];

  const pool = candidates.filter(isAllowedCandidate);

  // Federal: US House in voter's congressional district OR US Senate for voter's state.
  const isFederal = (c) => {
    if (c.office_level !== "federal") return false;

    if (/u\.?s\.?\s+senate/i.test(c.office)) {
      // US Senate is state-wide: only show for voter's state.
      if (!voterState) return true; // no state info → include (backward compat)
      const cState = getCandidateState(c);
      return !cState || cState === voterState;
    }

    // US House: must match the voter's exact congressional district.
    return c.district === districts.congressional;
  };

  // State: district-specific or statewide races, filtered by voter's state.
  const isState = (c) => {
    if (c.office_level !== "state") return false;

    // Exclude candidates from a different state.
    if (voterState) {
      const cState = getCandidateState(c);
      if (cState && cState !== voterState) return false;
    }

    // No district on the candidate → statewide race, always include.
    if (!c.district) return true;

    const cd = normalizeDistrict(c.district);

    if (/^HD-/i.test(cd)) return cd === normalizeDistrict(districts.state_house);
    if (/^SD-/i.test(cd)) return cd === normalizeDistrict(districts.state_senate);

    return false;
  };

  // Local: city/council/county races matched by voter's locality.
  const isLocal = (c) => {
    if (c.office_level !== "local" && c.office_level !== "city") return false;
    if (c.jurisdiction && districts.locality) {
      return (
        c.jurisdiction.toLowerCase().includes(districts.locality.toLowerCase()) ||
        districts.locality.toLowerCase().includes(c.jurisdiction.toLowerCase())
      );
    }
    return true;
  };

  if (level === "federal") return pool.filter(isFederal);
  if (level === "state") return pool.filter(isState);
  if (level === "local") return pool.filter(isLocal);
  return pool;
}
