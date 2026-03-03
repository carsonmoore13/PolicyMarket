const TEXAS_ZIP_DISTRICT_MAP = {
  78701: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 9" },
  78702: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3" },
  78703: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 9" },
  78704: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 5" },
  // UT Austin / Central Austin now lies in TX-37 after redistricting.
  78705: { congressional: "TX-37", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 9" },
  78721: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 1" },
  78722: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 1" },
  78723: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 1" },
  78724: { congressional: "TX-10", state_senate: "SD-01", state_house: "HD-052", city_council: "Austin District 1" },
  78725: { congressional: "TX-10", state_senate: "SD-01", state_house: "HD-052", city_council: "Austin District 1" },
  78726: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6" },
  78727: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7" },
  78728: { congressional: "TX-31", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7" },
  78729: { congressional: "TX-31", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6" },
  78730: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10" },
  78731: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10" },
  78732: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10" },
  78733: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10" },
  78734: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10" },
  78735: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8" },
  78736: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8" },
  78737: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: null },
  78738: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: null },
  78739: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 8" },
  78741: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3" },
  78742: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3" },
  78744: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 2" },
  78745: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 5" },
  78746: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8" },
  78747: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 2" },
  78748: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 5" },
  78749: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 8" },
  78750: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6" },
  78751: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 4" },
  78752: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4" },
  78753: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4" },
  78754: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4" },
  78756: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 7" },
  78757: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 7" },
  78758: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7" },
  78759: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7" }
};

export function resolveDistricts(lat, lng, stateAbbr, zip) {
  const zipNum = zip ? parseInt(zip, 10) : null;

  if (stateAbbr !== "TX") {
    return {
      congressional: "Unknown — outside TX",
      state_senate: null,
      state_house: null,
      city_council: null
    };
  }

  if (zipNum && TEXAS_ZIP_DISTRICT_MAP[zipNum]) {
    return TEXAS_ZIP_DISTRICT_MAP[zipNum];
  }

  return {
    congressional: null,
    state_senate: null,
    state_house: null,
    city_council: null
  };
}

