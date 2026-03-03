const DISALLOWED_NAME_REGEX = /(donald\s+trump|kamala\s+harris)/i;

export function isAllowedCandidate(candidate) {
  if (!candidate) return false;
  const name = candidate.name || "";
  if (DISALLOWED_NAME_REGEX.test(name)) return false;
  return true;
}

export function filterCandidates(candidates, districts, level) {
  if (!Array.isArray(candidates)) return [];

  const pool = candidates.filter(isAllowedCandidate);

  const isFederal = (c) =>
    c.office_level === "federal" &&
    (c.district === districts.congressional ||
      (c.jurisdiction === "Texas" && /senate/i.test(c.office)));

  const isState = (c) => {
    if (c.office_level !== "state") return false;
    if (c.jurisdiction === "Texas" && !/district/i.test(c.office)) {
      // statewide (Governor, AG, etc.)
      return true;
    }
    return (
      c.district === districts.state_senate ||
      c.district === districts.state_house
    );
  };

  const isLocal = (c) =>
    c.office_level === "city" &&
    (c.district === districts.city_council ||
      c.jurisdiction === "Austin, TX");

  if (level === "federal") return pool.filter(isFederal);
  if (level === "state") return pool.filter(isState);
  if (level === "local") return pool.filter(isLocal);
  return pool;
}

