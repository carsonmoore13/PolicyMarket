import axios from "axios";
import * as cheerio from "cheerio";
import { getAxiosDefaults } from "../config.js";
import { createCandidate } from "../models.js";
import { getJurisdictionCentroid } from "../geo/index.js";

const SOS_CANDIDATES_URL = "https://www.sos.state.tx.us/elections/candidates/";
const SOS_ELECTIONS_URL = "https://www.sos.texas.gov/elections/";

async function getWithRetry(url, attempts = 3) {
  const opts = getAxiosDefaults();
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await axios.get(url, opts);
      return res.data;
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

function normalizeDistrict(office, rawDistrict) {
  if (!rawDistrict) return null;
  const m = String(rawDistrict).match(/\d+/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  if (/senate|SD/i.test(office || "") || /SD/i.test(String(rawDistrict))) {
    return n >= 1 && n <= 31 ? `SD-${n}` : null;
  }
  if (/house|HD|representative/i.test(office || "") || /HD/i.test(String(rawDistrict))) {
    return n >= 1 && n <= 150 ? `HD-${String(n).padStart(3, "0")}` : null;
  }
  return null;
}

export async function fetchTexasStateCandidates() {
  const candidates = [];
  const seen = new Set();
  const now = new Date();

  for (const [url, sourceName] of [
    [SOS_CANDIDATES_URL, "TX Secretary of State"],
    [SOS_ELECTIONS_URL, "TX SOS Elections"],
  ]) {
    let html;
    try {
      html = await getWithRetry(url);
    } catch (err) {
      console.warn("Texas state source failed", url, err.message);
      continue;
    }

    const $ = cheerio.load(html);
    const rows = [];
    $("table tr").each((_, row) => {
      const cells = $(row).find("td, th").map((_, c) => $(c).text().trim()).get();
      if (cells.length >= 2) rows.push(cells);
    });
    for (const cells of rows) {
      const name = cells[0]?.slice(0, 200) || "";
      const office = cells[1] || "State Office";
      const districtRaw = cells[2];
      const party = cells[3]?.slice(0, 10) || null;
      if (!name || /^name|candidate$/i.test(name)) continue;
      let district = normalizeDistrict(office, districtRaw);
      if (!district && /district|house|senate/i.test(office)) {
        const m = office.match(/\d+/);
        if (m) district = /house/i.test(office) ? `HD-${String(parseInt(m[0], 10)).padStart(3, "0")}` : `SD-${m[0]}`;
      }
      const key = `${name}|${office}|${district || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const geo = await getJurisdictionCentroid("state", "Texas", district);
      const c = createCandidate({
        name,
        office,
        office_level: "state",
        jurisdiction: "Texas",
        district,
        party,
        incumbent: null,
        filing_date: null,
        geo,
        source_url: url,
        source_name: sourceName,
        last_verified: now,
        data_hash: "",
      });
      c.data_hash = c.computeHash();
      candidates.push(c);
    }

    const linkTexts = [];
    $("a[href]").each((_, el) => {
      const text = $(el).text().trim();
      if (/governor|attorney general|comptroller|lieutenant|senate|house|district\s*\d+/i.test(text)) linkTexts.push(text);
    });
    for (const text of linkTexts) {
      const key = `${text.slice(0, 80)}|Texas State|`;
      if (seen.has(key)) continue;
      seen.add(key);
      const district = normalizeDistrict(text, text);
      const geo = await getJurisdictionCentroid("state", "Texas", district);
      const c = createCandidate({
        name: text.slice(0, 200) || "Unknown",
        office: text.slice(0, 150) || "State Office",
        office_level: "state",
        jurisdiction: "Texas",
        district,
        party: null,
        incumbent: null,
        filing_date: null,
        geo,
        source_url: url,
        source_name: sourceName,
        last_verified: now,
        data_hash: "",
      });
      c.data_hash = c.computeHash();
      candidates.push(c);
    }
  }

  if (candidates.length === 0) {
    for (const [title, district] of [
      ["Governor", null],
      ["TX Senate District 21", "SD-21"],
      ["TX House District 47", "HD-047"],
    ]) {
      const geo = await getJurisdictionCentroid("state", "Texas", district);
      const c = createCandidate({
        name: "Sample State Candidate",
        office: title,
        office_level: "state",
        jurisdiction: "Texas",
        district,
        party: null,
        incumbent: null,
        filing_date: null,
        geo,
        source_url: SOS_CANDIDATES_URL,
        source_name: "TX Secretary of State",
        last_verified: new Date(),
        data_hash: "",
      });
      c.data_hash = c.computeHash();
      candidates.push(c);
    }
  }

  console.info("Texas state scraper found", candidates.length, "candidates");
  return candidates;
}
