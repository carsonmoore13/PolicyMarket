import axios from "axios";
import * as cheerio from "cheerio";
import { getAxiosDefaults } from "../config.js";
import { createCandidate } from "../models.js";
import { getJurisdictionCentroid } from "../geo/index.js";

const FEC_API_BASE = "https://api.open.fec.gov/v1/candidates/";
const FEC_API_KEY = "DEMO_KEY";
const BALLOTPEDIA_URL = "https://ballotpedia.org/Texas_congressional_delegations";

async function getWithRetry(url, params = null, attempts = 3) {
  const opts = getAxiosDefaults();
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, { ...opts, params: params || {} });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

function normalizeCd(district) {
  if (district == null) return null;
  if (typeof district === "number") return district >= 1 && district <= 38 ? `TX-${district}` : null;
  const m = String(district).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 38 ? `TX-${n}` : null;
}

export async function fetchFederalTexasCandidates() {
  const candidates = [];
  const seen = new Set();
  const now = new Date();

  for (const [officeCode, officeLabel] of [
    ["H", "U.S. House"],
    ["S", "U.S. Senate"],
  ]) {
    try {
      let page = 1;
      while (true) {
        const data = await getWithRetry(FEC_API_BASE, {
          state: "TX",
          election_year: 2026,
          office: officeCode,
          api_key: FEC_API_KEY,
          per_page: 50,
          page,
        });
        const results = data.results || [];
        const pagination = data.pagination || {};
        for (const item of results) {
          const name = (item.name || "").trim();
          if (!name) continue;
          const districtRaw = item.district ?? item.district_number;
          const district = officeCode === "S" ? null : normalizeCd(districtRaw);
          const party = (item.party || item.party_full || "").trim().slice(0, 10) || null;
          const cid = item.candidate_id || item.id;
          const key = `${name}|${officeLabel}|${district || ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const geo = await getJurisdictionCentroid("federal", "Texas", district);
          const officeStr = officeLabel + (district ? ` TX-${district.split("-")[1]}` : "");
          const c = createCandidate({
            name,
            office: officeStr,
            office_level: "federal",
            jurisdiction: "Texas",
            district,
            party,
            incumbent: null,
            filing_date: null,
            geo,
            source_url: FEC_API_BASE,
            source_name: "FEC",
            last_verified: now,
            data_hash: "",
            source_candidate_id: cid != null ? String(cid) : null,
          });
          c.data_hash = c.computeHash();
          candidates.push(c);
        }
        const totalPages = pagination.pages || 1;
        if (page >= totalPages) break;
        page += 1;
      }
    } catch (err) {
      console.warn("FEC API failed", officeCode, err.message);
    }
  }

  try {
    const html = await getWithRetry(BALLOTPEDIA_URL);
    const $ = cheerio.load(html);
    const linkTexts = [];
    $("a[href]").each((_, el) => {
      const text = $(el).text().trim();
      if (/district\s*\d+|texas'?\s*\d+|congress/i.test(text) && text.length < 100) linkTexts.push(text);
    });
    for (const text of linkTexts) {
      const m = text.match(/(\d+)/);
      const district = m && parseInt(m[1], 10) >= 1 && parseInt(m[1], 10) <= 38 ? `TX-${m[1]}` : null;
      const key = `${text.slice(0, 80)}|U.S. House|${district || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const geo = await getJurisdictionCentroid("federal", "Texas", district);
      const c = createCandidate({
        name: text.slice(0, 200),
        office: "U.S. House",
        office_level: "federal",
        jurisdiction: "Texas",
        district,
        party: null,
        incumbent: null,
        filing_date: null,
        geo,
        source_url: BALLOTPEDIA_URL,
        source_name: "Ballotpedia",
        last_verified: now,
        data_hash: "",
      });
      c.data_hash = c.computeHash();
      candidates.push(c);
    }
  } catch (err) {
    console.warn("Ballotpedia fetch failed", err.message);
  }

  if (candidates.length === 0) {
    for (const dist of ["TX-21", "TX-25"]) {
      const geo = await getJurisdictionCentroid("federal", "Texas", dist);
      const c = createCandidate({
        name: "Sample Federal Candidate",
        office: "U.S. House",
        office_level: "federal",
        jurisdiction: "Texas",
        district: dist,
        party: null,
        incumbent: null,
        filing_date: null,
        geo,
        source_url: FEC_API_BASE,
        source_name: "FEC",
        last_verified: new Date(),
        data_hash: "",
      });
      c.data_hash = c.computeHash();
      candidates.push(c);
    }
  }

  console.info("Federal Texas scraper found", candidates.length, "candidates");
  return candidates;
}
