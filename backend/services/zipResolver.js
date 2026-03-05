const TEXAS_ZIP_DISTRICT_MAP = {
  78701: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 9",   locality: "Austin" },
  78702: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3",   locality: "Austin" },
  78703: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 9",   locality: "Austin" },
  78704: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 5",   locality: "Austin" },
  // UT Austin / Central Austin now lies in TX-37 after redistricting.
  78705: { congressional: "TX-37", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 9",   locality: "Austin" },
  78721: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 1",   locality: "Austin" },
  78722: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 1",   locality: "Austin" },
  78723: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 1",   locality: "Austin" },
  78724: { congressional: "TX-10", state_senate: "SD-01", state_house: "HD-052", city_council: "Austin District 1",   locality: "Austin" },
  78725: { congressional: "TX-10", state_senate: "SD-01", state_house: "HD-052", city_council: "Austin District 1",   locality: "Austin" },
  78726: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6",   locality: "Austin" },
  78727: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7",   locality: "Austin" },
  78728: { congressional: "TX-31", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7",   locality: "Austin" },
  78729: { congressional: "TX-31", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6",   locality: "Austin" },
  78730: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10",  locality: "Austin" },
  78731: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10",  locality: "Austin" },
  78732: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10",  locality: "Austin" },
  78733: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10",  locality: "Austin" },
  78734: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 10",  locality: "Austin" },
  78735: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8",   locality: "Austin" },
  78736: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8",   locality: "Austin" },
  78737: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: null,                  locality: "Austin" },
  78738: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: null,                  locality: "Austin" },
  78739: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 8",   locality: "Austin" },
  78741: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3",   locality: "Austin" },
  78742: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 3",   locality: "Austin" },
  78744: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 2",   locality: "Austin" },
  78745: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-051", city_council: "Austin District 5",   locality: "Austin" },
  78746: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-047", city_council: "Austin District 8",   locality: "Austin" },
  78747: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 2",   locality: "Austin" },
  78748: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 5",   locality: "Austin" },
  78749: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-045", city_council: "Austin District 8",   locality: "Austin" },
  78750: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 6",   locality: "Austin" },
  78751: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 4",   locality: "Austin" },
  78752: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4",   locality: "Austin" },
  78753: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4",   locality: "Austin" },
  78754: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 4",   locality: "Austin" },
  78756: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 7",   locality: "Austin" },
  78757: { congressional: "TX-21", state_senate: "SD-14", state_house: "HD-049", city_council: "Austin District 7",   locality: "Austin" },
  78758: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7",   locality: "Austin" },
  78759: { congressional: "TX-10", state_senate: "SD-14", state_house: "HD-052", city_council: "Austin District 7",   locality: "Austin" },

  // ── San Antonio (Bexar County) ──────────────────────────────────────────
  // 78248: north SA (Inwood/Deerfield/Stone Oak corridor)
  // TX-20 covers ~78% of ZIP; SD-25 (Donna Campbell, not up until 2028); HD-121 (LaHood)
  78248: { congressional: "TX-20", state_senate: "SD-25", state_house: "HD-121", city_council: "San Antonio District 10", locality: "San Antonio" },

  // ── Burnet County (Hill Country) ───────────────────────────────────────
  // 78611: Burnet, TX — TX-25; SD-24 (Pete Flores, UP in 2026); HD-53 (Virdell)
  78611: { congressional: "TX-25", state_senate: "SD-24", state_house: "HD-53", city_council: null, locality: "Burnet" }
};

export function resolveDistricts(lat, lng, stateAbbr, zip) {
  const zipNum = zip ? parseInt(zip, 10) : null;

  if (stateAbbr !== "TX") {
    return {
      congressional: "Unknown — outside TX",
      state_senate: null,
      state_house: null,
      city_council: null,
      locality: null,
    };
  }

  if (zipNum && TEXAS_ZIP_DISTRICT_MAP[zipNum]) {
    return TEXAS_ZIP_DISTRICT_MAP[zipNum];
  }

  return {
    congressional: null,
    state_senate: null,
    state_house: null,
    city_council: null,
    locality: null,
  };
}

