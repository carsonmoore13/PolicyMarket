/**
 * Sidebar copy for local races before candidates are filed.
 *
 * Texas 2026 election calendar (uniform election dates under TX Election Code §41.001):
 *   - School board / city / township: November 3, 2026 (uniform election date)
 *   - Filing windows vary by jurisdiction type
 *
 * Override defaults with env vars:
 *   SCHOOL_BOARD_FILING_OPENS_TX, MAYOR_FILING_OPENS_TX,
 *   CITY_COUNCIL_FILING_OPENS_TX, TOWNSHIP_FILING_OPENS_TX (YYYY-MM-DD)
 */

const DEFAULT_TX_SCHOOL_FILING_OPENS = "2026-07-20";
const DEFAULT_TX_MAYOR_FILING_OPENS = "2026-07-18";
const DEFAULT_TX_CITY_COUNCIL_FILING_OPENS = "2026-07-18";
const DEFAULT_TX_TOWNSHIP_FILING_OPENS = "2026-07-18";
const TX_ELECTION_DATE_2026 = "November 3, 2026";

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatLongDate(iso) {
  const dt = parseISODate(iso);
  if (!dt) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}

/**
 * @param {string} voterState - 2-letter state
 * @param {string|null} schoolDistrictName - Census "Unified School District" NAME
 * @returns {null | { districtName: string, filingOpens: string, filingOpensDisplay: string, beforeFilingOpens: boolean }}
 */
export function getSchoolBoardNotice(voterState, schoolDistrictName) {
  if (!schoolDistrictName || !voterState) return null;
  const st = voterState.toUpperCase();
  const filingOpens =
    st === "TX"
      ? (process.env.SCHOOL_BOARD_FILING_OPENS_TX || DEFAULT_TX_SCHOOL_FILING_OPENS).trim()
      : (process.env.SCHOOL_BOARD_FILING_OPENS_DEFAULT || "2026-07-20").trim();

  const opensAt = parseISODate(filingOpens);
  const beforeFilingOpens = opensAt ? Date.now() < opensAt.getTime() : true;

  return {
    districtName: schoolDistrictName,
    filingOpens,
    filingOpensDisplay: formatLongDate(filingOpens),
    beforeFilingOpens,
    electionDate: st === "TX" ? TX_ELECTION_DATE_2026 : "November 2026",
  };
}

/**
 * @param {string} voterState - 2-letter state
 * @param {string|null} localityName - Census / geocoder place name (e.g. THE WOODLANDS)
 */
export function getMayoralNotice(voterState, localityName) {
  if (!localityName || !voterState) return null;
  const st = voterState.toUpperCase();
  const filingOpens =
    st === "TX"
      ? (process.env.MAYOR_FILING_OPENS_TX || DEFAULT_TX_MAYOR_FILING_OPENS).trim()
      : (process.env.MAYOR_FILING_OPENS_DEFAULT || "2026-07-18").trim();

  const opensAt = parseISODate(filingOpens);
  const beforeFilingOpens = opensAt ? Date.now() < opensAt.getTime() : true;

  const raw = localityName.trim();
  const localityLabel = raw
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  return {
    localityName: localityLabel,
    filingOpens,
    filingOpensDisplay: formatLongDate(filingOpens),
    beforeFilingOpens,
    electionDate: st === "TX" ? TX_ELECTION_DATE_2026 : "November 2026",
  };
}

/**
 * @param {string} voterState - 2-letter state
 * @param {string|null} localityName - Census / geocoder place name
 */
export function getCityCouncilNotice(voterState, localityName) {
  if (!localityName || !voterState) return null;
  const st = voterState.toUpperCase();
  const filingOpens =
    st === "TX"
      ? (process.env.CITY_COUNCIL_FILING_OPENS_TX || DEFAULT_TX_CITY_COUNCIL_FILING_OPENS).trim()
      : (process.env.CITY_COUNCIL_FILING_OPENS_DEFAULT || "2026-07-18").trim();

  const opensAt = parseISODate(filingOpens);
  const beforeFilingOpens = opensAt ? Date.now() < opensAt.getTime() : true;

  const raw = localityName.trim();
  const localityLabel = raw
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  return {
    localityName: localityLabel,
    filingOpens,
    filingOpensDisplay: formatLongDate(filingOpens),
    beforeFilingOpens,
    electionDate: st === "TX" ? TX_ELECTION_DATE_2026 : "November 2026",
  };
}

/**
 * Township board notice (e.g., The Woodlands Township Board of Directors).
 * @param {string} voterState - 2-letter state
 * @param {string|null} localityName - Census / geocoder place name
 */
export function getTownshipNotice(voterState, localityName) {
  if (!localityName || !voterState) return null;
  const st = voterState.toUpperCase();
  const filingOpens =
    st === "TX"
      ? (process.env.TOWNSHIP_FILING_OPENS_TX || DEFAULT_TX_TOWNSHIP_FILING_OPENS).trim()
      : (process.env.TOWNSHIP_FILING_OPENS_DEFAULT || "2026-07-18").trim();

  const opensAt = parseISODate(filingOpens);
  const beforeFilingOpens = opensAt ? Date.now() < opensAt.getTime() : true;

  const raw = localityName.trim();
  const localityLabel = raw
    .toLowerCase()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());

  return {
    localityName: localityLabel,
    filingOpens,
    filingOpensDisplay: formatLongDate(filingOpens),
    beforeFilingOpens,
    electionDate: st === "TX" ? TX_ELECTION_DATE_2026 : "November 2026",
  };
}
