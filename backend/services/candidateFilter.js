export function filterCandidates(candidates, districts, level) {
  if (!Array.isArray(candidates)) return [];

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

  if (level === "federal") return candidates.filter(isFederal);
  if (level === "state") return candidates.filter(isState);
  if (level === "local") return candidates.filter(isLocal);
  return candidates;
}

