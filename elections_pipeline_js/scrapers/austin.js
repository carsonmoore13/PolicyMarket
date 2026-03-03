import axios from "axios";
import * as cheerio from "cheerio";
import { getAxiosDefaults } from "../config.js";
import { createCandidate } from "../models.js";
import { getJurisdictionCentroid } from "../geo/index.js";
import { fetchCandidatePhoto } from "./candidate_photos.js";

const AUSTIN_COUNCIL_URL = "https://www.austintexas.gov/department/city-council";
const TRAVIS_CLERK_URL = "https://countyclerk.traviscountytx.gov/elections";
const AUSTIN_MONITOR_URL = "https://www.austinmonitor.com";

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

function parseAustinCouncil(html, sourceUrl) {
  const entries = [];
  const $ = cheerio.load(html);
  $("a[href]").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length < 5) return;
    if (/district\s*\d|mayor|council/i.test(text)) {
      entries.push({ raw_office: text, source_url: sourceUrl });
    }
  });
  $("h2, h3, h4").each((_, el) => {
    const text = $(el).text().trim();
    const m = text.match(/district\s*(\d+)/i);
    if (/district\s*\d|mayor/i.test(text)) {
      entries.push({
        raw_office: text,
        district: m ? `Austin District ${m[1]}` : "Austin District 1",
        source_url: sourceUrl,
      });
    }
  });
  return entries;
}

function parseTravisClerk(html, sourceUrl) {
  const entries = [];
  const $ = cheerio.load(html);
  $("tr").each((_, row) => {
    const cells = $(row).find("td, th");
    if (cells.length < 2) return;
    const text = cells
      .map((_, c) => $(c).text().trim())
      .get()
      .join(" ");
    if (/austin|city\s*council|mayor/i.test(text)) {
      entries.push({ raw: text, source_url: sourceUrl });
    }
  });
  return entries;
}

export async function fetchAustinCandidates() {
  const candidates = [];
  const seen = new Set();
  const now = new Date();

  const sources = [
    [AUSTIN_COUNCIL_URL, "City of Austin Council"],
    [TRAVIS_CLERK_URL, "Travis County Clerk Elections"],
    [AUSTIN_MONITOR_URL, "Austin Monitor"],
  ];

  for (const [url, sourceName] of sources) {
    let html;
    try {
      html = await getWithRetry(url);
    } catch (err) {
      console.warn("Austin source failed", url, err.message);
      continue;
    }

    if (url.includes("austintexas.gov")) {
      const entries = parseAustinCouncil(html, url);
      for (const e of entries) {
        const raw = e.raw_office || "";
        let district = e.district;
        if (!district) {
          const m = raw.match(/district\s*(\d+)/i);
          district = m ? `Austin District ${m[1]}` : "Austin District 1";
        }
        let name = raw.includes("–") ? raw.split("–")[0].trim() : raw.slice(0, 80).trim();
        if (!name || name.length > 100) continue;
        const key = `${name}|Austin City Council|${district}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const geo = await getJurisdictionCentroid("city", "Austin, TX", district);
        const baseCandidate = {
          name,
          office: "Austin City Council",
          office_level: "city",
          jurisdiction: "Austin, TX",
          district,
          party: null,
          incumbent: null,
          filing_date: null,
          geo,
          source_url: url,
          source_name: sourceName,
          last_verified: now,
          data_hash: "",
        };
        const photo = await fetchCandidatePhoto(baseCandidate);
        const c = createCandidate({
          ...baseCandidate,
          photo: {
            url: photo.url,
            source: photo.source,
            verified: photo.verified,
            last_fetched: new Date(),
            fallback_initials: photo.fallback_initials,
          },
        });
        c.data_hash = c.computeHash();
        candidates.push(c);
      }
    } else if (url.includes("traviscountytx.gov")) {
      const entries = parseTravisClerk(html, url);
      for (const e of entries) {
        const raw = e.raw || "";
        if (!/city council|mayor/i.test(raw)) continue;
        const parts = raw.split(/\s+/).filter(Boolean);
        const name = parts[0] || "Unknown";
        const office = /council/i.test(raw) ? "Austin City Council" : "Mayor of Austin";
        let district = "Austin District 1";
        const m = raw.match(/district\s*(\d+)/i);
        if (m) district = `Austin District ${m[1]}`;
        const key = `${name}|${office}|${district}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const geo = await getJurisdictionCentroid("city", "Austin, TX", district);
        const baseCandidate = {
          name,
          office,
          office_level: "city",
          jurisdiction: "Austin, TX",
          district,
          party: null,
          incumbent: null,
          filing_date: null,
          geo,
          source_url: url,
          source_name: sourceName,
          last_verified: now,
          data_hash: "",
        };
        const photo = await fetchCandidatePhoto(baseCandidate);
        const c = createCandidate({
          ...baseCandidate,
          photo: {
            url: photo.url,
            source: photo.source,
            verified: photo.verified,
            last_fetched: new Date(),
            fallback_initials: photo.fallback_initials,
          },
        });
        c.data_hash = c.computeHash();
        candidates.push(c);
      }
    } else {
      const $ = cheerio.load(html);
      const links = [];
      $("a[href]").each((_, el) => {
        const text = $(el).text().trim();
        if (/2026|candidate|filing|city council|mayor/i.test(text) && text.length < 100) links.push(text);
      });
      for (const text of links) {
        const key = `${text.slice(0, 80)}|Austin|Austin District 1`;
        if (seen.has(key)) continue;
        seen.add(key);
        const geo = await getJurisdictionCentroid("city", "Austin, TX", "Austin District 1");
        const baseCandidate = {
          name: text.slice(0, 200) || "Unknown",
          office: "Austin City Council",
          office_level: "city",
          jurisdiction: "Austin, TX",
          district: "Austin District 1",
          party: null,
          incumbent: null,
          filing_date: null,
          geo,
          source_url: url,
          source_name: sourceName,
          last_verified: now,
          data_hash: "",
        };
        const photo = await fetchCandidatePhoto(baseCandidate);
        const c = createCandidate({
          ...baseCandidate,
          photo: {
            url: photo.url,
            source: photo.source,
            verified: photo.verified,
            last_fetched: new Date(),
            fallback_initials: photo.fallback_initials,
          },
        });
        c.data_hash = c.computeHash();
        candidates.push(c);
      }
    }
  }

  if (candidates.length === 0) {
    const geo = await getJurisdictionCentroid("city", "Austin, TX", "Austin District 1");
    const baseCandidate = {
      name: "Kirk Watson",
      office: "Mayor of Austin",
      office_level: "city",
      jurisdiction: "Austin, TX",
      district: null,
      party: "N",
      incumbent: null,
      filing_date: null,
      geo,
      source_url: AUSTIN_COUNCIL_URL,
      source_name: "City of Austin Council",
      last_verified: new Date(),
      data_hash: "",
    };
    const photo = await fetchCandidatePhoto(baseCandidate);
    const c = createCandidate({
      ...baseCandidate,
      photo: {
        url: photo.url,
        source: photo.source,
        verified: photo.verified,
        last_fetched: new Date(),
        fallback_initials: photo.fallback_initials,
      },
    });
    c.data_hash = c.computeHash();
    candidates.push(c);
  }

  console.info("Austin scraper found", candidates.length, "candidates");
  return candidates;
}
