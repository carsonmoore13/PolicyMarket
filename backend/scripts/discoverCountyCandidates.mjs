#!/usr/bin/env node
/**
 * discoverCountyCandidates.mjs
 *
 * Automated discovery of county-level candidates for all 254 Texas counties
 * from Ballotpedia's structured county election pages.
 *
 * Discovers: County Judge, Commissioners, JPs, District/County Clerks,
 * Treasurer, Sheriff, Tax Assessor, District Courts, DA, County Courts at Law,
 * Probate Courts, Constables, and other county-level offices.
 *
 * Usage:
 *   node scripts/discoverCountyCandidates.mjs                # all 254 counties
 *   node scripts/discoverCountyCandidates.mjs --county Harris # single county
 *   node scripts/discoverCountyCandidates.mjs --top 50        # top N by population
 */
import { fileURLToPath } from "url";
import path from "path";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import crypto from "crypto";
import axios from "axios";
import * as cheerio from "cheerio";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB = process.env.MONGO_DB_NAME || "elections_2026";
const BP_BASE = "https://ballotpedia.org";
const FETCH_DELAY = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const http = axios.create({
  timeout: 15000,
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; PolicyMarket/1.0)",
    Accept: "text/html",
  },
});

// ── All 254 Texas counties with approximate center coordinates ───────────
// Sorted by population (descending) for --top N mode
const TX_COUNTIES = [
  { name: "Harris", lat: 29.76, lng: -95.37 },
  { name: "Dallas", lat: 32.77, lng: -96.80 },
  { name: "Tarrant", lat: 32.77, lng: -97.29 },
  { name: "Bexar", lat: 29.45, lng: -98.52 },
  { name: "Travis", lat: 30.33, lng: -97.77 },
  { name: "Collin", lat: 33.19, lng: -96.57 },
  { name: "Denton", lat: 33.20, lng: -97.13 },
  { name: "Hidalgo", lat: 26.40, lng: -98.18 },
  { name: "Fort Bend", lat: 29.53, lng: -95.77 },
  { name: "El Paso", lat: 31.76, lng: -106.44 },
  { name: "Williamson", lat: 30.64, lng: -97.60 },
  { name: "Montgomery", lat: 30.30, lng: -95.50 },
  { name: "Brazoria", lat: 29.17, lng: -95.43 },
  { name: "Nueces", lat: 27.73, lng: -97.51 },
  { name: "Galveston", lat: 29.30, lng: -94.80 },
  { name: "Cameron", lat: 26.17, lng: -97.50 },
  { name: "Bell", lat: 31.06, lng: -97.47 },
  { name: "Lubbock", lat: 33.58, lng: -101.85 },
  { name: "Webb", lat: 27.76, lng: -99.33 },
  { name: "Jefferson", lat: 29.86, lng: -94.23 },
  { name: "McLennan", lat: 31.55, lng: -97.15 },
  { name: "Smith", lat: 32.38, lng: -95.27 },
  { name: "Brazos", lat: 30.66, lng: -96.36 },
  { name: "Hays", lat: 30.05, lng: -98.03 },
  { name: "Johnson", lat: 32.38, lng: -97.40 },
  { name: "Ellis", lat: 32.35, lng: -96.79 },
  { name: "Midland", lat: 32.00, lng: -102.08 },
  { name: "Ector", lat: 31.87, lng: -102.54 },
  { name: "Guadalupe", lat: 29.59, lng: -97.94 },
  { name: "Kaufman", lat: 32.60, lng: -96.29 },
  { name: "Parker", lat: 32.78, lng: -97.80 },
  { name: "Comal", lat: 29.81, lng: -98.25 },
  { name: "Rockwall", lat: 32.89, lng: -96.41 },
  { name: "Hunt", lat: 33.18, lng: -96.09 },
  { name: "Randall", lat: 34.96, lng: -101.90 },
  { name: "Grayson", lat: 33.62, lng: -96.68 },
  { name: "Taylor", lat: 32.30, lng: -99.80 },
  { name: "Tom Green", lat: 31.40, lng: -100.47 },
  { name: "Gregg", lat: 32.49, lng: -94.82 },
  { name: "Henderson", lat: 32.21, lng: -95.85 },
  { name: "Potter", lat: 35.38, lng: -101.95 },
  { name: "Wichita", lat: 33.90, lng: -98.70 },
  { name: "Liberty", lat: 30.15, lng: -94.80 },
  { name: "Wise", lat: 33.22, lng: -97.56 },
  { name: "Hood", lat: 32.43, lng: -97.83 },
  { name: "Bowie", lat: 33.45, lng: -94.42 },
  { name: "Victoria", lat: 28.79, lng: -97.00 },
  { name: "Orange", lat: 30.09, lng: -93.74 },
  { name: "San Patricio", lat: 28.00, lng: -97.52 },
  { name: "Starr", lat: 26.56, lng: -98.74 },
  { name: "Angelina", lat: 31.25, lng: -94.63 },
  { name: "Cherokee", lat: 31.84, lng: -95.17 },
  { name: "Coryell", lat: 31.39, lng: -97.80 },
  { name: "Bastrop", lat: 30.11, lng: -97.33 },
  { name: "Nacogdoches", lat: 31.61, lng: -94.66 },
  { name: "Harrison", lat: 32.55, lng: -94.37 },
  { name: "Burnet", lat: 30.78, lng: -98.22 },
  { name: "Caldwell", lat: 29.84, lng: -97.62 },
  { name: "Waller", lat: 30.06, lng: -95.99 },
  { name: "Chambers", lat: 29.71, lng: -94.60 },
  { name: "Navarro", lat: 32.05, lng: -96.48 },
  { name: "Kendall", lat: 29.94, lng: -98.68 },
  { name: "Medina", lat: 29.35, lng: -99.10 },
  { name: "Polk", lat: 30.79, lng: -94.83 },
  { name: "Walker", lat: 30.74, lng: -95.57 },
  { name: "Atascosa", lat: 28.89, lng: -98.53 },
  { name: "Wilson", lat: 29.17, lng: -98.09 },
  { name: "Van Zandt", lat: 32.56, lng: -95.84 },
  { name: "Rusk", lat: 32.11, lng: -94.76 },
  { name: "Matagorda", lat: 28.79, lng: -96.00 },
  { name: "Lamar", lat: 33.67, lng: -95.58 },
  { name: "Erath", lat: 32.24, lng: -98.23 },
  { name: "Hardin", lat: 30.35, lng: -94.38 },
  { name: "Upshur", lat: 32.74, lng: -94.97 },
  { name: "Wood", lat: 32.78, lng: -95.38 },
  { name: "Kerr", lat: 30.06, lng: -99.35 },
  { name: "Cooke", lat: 33.64, lng: -97.21 },
  { name: "Jasper", lat: 30.76, lng: -94.02 },
  { name: "Jim Wells", lat: 27.73, lng: -98.09 },
  { name: "Hopkins", lat: 33.15, lng: -95.57 },
  { name: "Palo Pinto", lat: 32.75, lng: -98.30 },
  { name: "Titus", lat: 33.22, lng: -94.97 },
  { name: "Brown", lat: 31.77, lng: -98.98 },
  { name: "Cass", lat: 33.08, lng: -94.34 },
  { name: "Hill", lat: 31.97, lng: -97.13 },
  { name: "Bee", lat: 28.42, lng: -97.74 },
  { name: "Fannin", lat: 33.59, lng: -96.11 },
  { name: "Maverick", lat: 28.74, lng: -100.31 },
  { name: "Val Verde", lat: 29.89, lng: -101.15 },
  { name: "Kleberg", lat: 27.42, lng: -97.66 },
  { name: "Anderson", lat: 31.79, lng: -95.65 },
  { name: "Washington", lat: 30.22, lng: -96.40 },
  { name: "Gillespie", lat: 30.32, lng: -98.88 },
  { name: "Llano", lat: 30.71, lng: -98.68 },
  { name: "Leon", lat: 31.30, lng: -95.99 },
  { name: "Milam", lat: 30.78, lng: -96.98 },
  { name: "Gray", lat: 35.40, lng: -100.81 },
  { name: "San Jacinto", lat: 30.58, lng: -95.07 },
  { name: "Austin", lat: 29.89, lng: -96.28 },
  { name: "Colorado", lat: 29.62, lng: -96.53 },
  { name: "Lampasas", lat: 31.20, lng: -98.18 },
  { name: "Bandera", lat: 29.74, lng: -99.25 },
  { name: "Blanco", lat: 30.27, lng: -98.40 },
  { name: "Lee", lat: 30.33, lng: -96.96 },
  { name: "DeWitt", lat: 29.09, lng: -97.36 },
  { name: "Grimes", lat: 30.54, lng: -95.98 },
  { name: "Lavaca", lat: 29.38, lng: -96.93 },
  { name: "Limestone", lat: 31.55, lng: -96.58 },
  { name: "Panola", lat: 32.16, lng: -94.30 },
  { name: "Shelby", lat: 31.79, lng: -94.14 },
  { name: "Falls", lat: 31.25, lng: -96.93 },
  { name: "Robertson", lat: 31.03, lng: -96.51 },
  { name: "Fayette", lat: 29.87, lng: -96.92 },
  { name: "Wharton", lat: 29.28, lng: -96.22 },
  { name: "Uvalde", lat: 29.36, lng: -99.75 },
  { name: "Jackson", lat: 28.95, lng: -96.58 },
  { name: "Gonzales", lat: 29.47, lng: -97.49 },
  { name: "Hale", lat: 34.07, lng: -101.82 },
  { name: "Freestone", lat: 31.71, lng: -96.15 },
  { name: "Willacy", lat: 26.47, lng: -97.59 },
  { name: "Aransas", lat: 28.11, lng: -96.99 },
  { name: "Young", lat: 33.18, lng: -98.69 },
  { name: "Eastland", lat: 32.33, lng: -98.83 },
  { name: "Camp", lat: 32.97, lng: -94.98 },
  { name: "Houston", lat: 31.32, lng: -95.44 },
  { name: "Trinity", lat: 31.09, lng: -95.13 },
  { name: "Marion", lat: 32.80, lng: -94.36 },
  { name: "Morris", lat: 33.18, lng: -94.73 },
  { name: "Red River", lat: 33.62, lng: -95.05 },
  { name: "Sabine", lat: 31.34, lng: -93.85 },
  { name: "San Augustine", lat: 31.39, lng: -94.16 },
  { name: "Tyler", lat: 30.77, lng: -94.38 },
  { name: "Refugio", lat: 28.33, lng: -97.16 },
  { name: "Calhoun", lat: 28.44, lng: -96.62 },
  { name: "Goliad", lat: 28.66, lng: -97.42 },
  { name: "Karnes", lat: 28.90, lng: -97.86 },
  { name: "Burleson", lat: 30.50, lng: -96.62 },
  { name: "Madison", lat: 30.97, lng: -95.93 },
  { name: "Franklin", lat: 33.18, lng: -95.22 },
  { name: "Delta", lat: 33.39, lng: -95.68 },
  { name: "Rains", lat: 32.87, lng: -95.79 },
  { name: "Somervell", lat: 32.22, lng: -97.77 },
  { name: "Jack", lat: 33.23, lng: -98.17 },
  { name: "Stephens", lat: 32.74, lng: -98.84 },
  { name: "Comanche", lat: 31.95, lng: -98.60 },
  { name: "Hamilton", lat: 31.70, lng: -98.11 },
  { name: "Mills", lat: 31.49, lng: -98.60 },
  { name: "San Saba", lat: 31.15, lng: -98.72 },
  { name: "McCulloch", lat: 31.20, lng: -99.35 },
  { name: "Mason", lat: 30.75, lng: -99.23 },
  { name: "Kimble", lat: 30.48, lng: -99.75 },
  { name: "Menard", lat: 30.90, lng: -99.80 },
  { name: "Concho", lat: 31.33, lng: -99.86 },
  { name: "Coke", lat: 31.89, lng: -100.53 },
  { name: "Runnels", lat: 31.83, lng: -99.97 },
  { name: "Coleman", lat: 31.83, lng: -99.45 },
  { name: "Callahan", lat: 32.30, lng: -99.37 },
  { name: "Shackelford", lat: 32.74, lng: -99.35 },
  { name: "Throckmorton", lat: 33.18, lng: -99.18 },
  { name: "Haskell", lat: 33.16, lng: -99.73 },
  { name: "Jones", lat: 32.74, lng: -99.88 },
  { name: "Fisher", lat: 32.74, lng: -100.40 },
  { name: "Nolan", lat: 32.30, lng: -100.42 },
  { name: "Mitchell", lat: 32.30, lng: -100.92 },
  { name: "Howard", lat: 32.31, lng: -101.45 },
  { name: "Martin", lat: 32.31, lng: -101.95 },
  { name: "Andrews", lat: 32.31, lng: -102.64 },
  { name: "Crane", lat: 31.42, lng: -102.35 },
  { name: "Upton", lat: 31.36, lng: -101.97 },
  { name: "Reagan", lat: 31.36, lng: -101.52 },
  { name: "Glasscock", lat: 31.87, lng: -101.52 },
  { name: "Sterling", lat: 31.83, lng: -101.05 },
  { name: "Irion", lat: 31.30, lng: -100.98 },
  { name: "Schleicher", lat: 30.90, lng: -100.54 },
  { name: "Sutton", lat: 30.49, lng: -100.54 },
  { name: "Crockett", lat: 30.73, lng: -101.41 },
  { name: "Pecos", lat: 30.78, lng: -103.11 },
  { name: "Terrell", lat: 30.22, lng: -102.08 },
  { name: "Brewster", lat: 29.81, lng: -103.25 },
  { name: "Presidio", lat: 29.99, lng: -104.14 },
  { name: "Jeff Davis", lat: 30.72, lng: -104.14 },
  { name: "Reeves", lat: 31.32, lng: -103.69 },
  { name: "Loving", lat: 31.85, lng: -103.98 },
  { name: "Winkler", lat: 31.85, lng: -103.05 },
  { name: "Ward", lat: 31.51, lng: -103.10 },
  { name: "Culberson", lat: 31.45, lng: -104.52 },
  { name: "Hudspeth", lat: 31.45, lng: -105.37 },
  { name: "Dawson", lat: 32.74, lng: -101.95 },
  { name: "Gaines", lat: 32.74, lng: -102.64 },
  { name: "Terry", lat: 33.17, lng: -102.33 },
  { name: "Yoakum", lat: 33.17, lng: -102.83 },
  { name: "Lynn", lat: 33.17, lng: -101.82 },
  { name: "Garza", lat: 33.18, lng: -101.30 },
  { name: "Scurry", lat: 32.75, lng: -100.92 },
  { name: "Borden", lat: 32.74, lng: -101.43 },
  { name: "Crosby", lat: 33.62, lng: -101.30 },
  { name: "Dickens", lat: 33.62, lng: -100.78 },
  { name: "Kent", lat: 33.18, lng: -100.78 },
  { name: "Stonewall", lat: 33.18, lng: -100.25 },
  { name: "Knox", lat: 33.60, lng: -99.75 },
  { name: "Foard", lat: 33.97, lng: -99.78 },
  { name: "Hardeman", lat: 34.29, lng: -99.75 },
  { name: "Wilbarger", lat: 34.08, lng: -99.24 },
  { name: "Baylor", lat: 33.62, lng: -99.22 },
  { name: "Archer", lat: 33.62, lng: -98.69 },
  { name: "Clay", lat: 33.79, lng: -98.21 },
  { name: "Montague", lat: 33.68, lng: -97.72 },
  { name: "Childress", lat: 34.53, lng: -100.21 },
  { name: "Cottle", lat: 34.08, lng: -100.28 },
  { name: "King", lat: 33.62, lng: -100.25 },
  { name: "Motley", lat: 34.07, lng: -100.78 },
  { name: "Floyd", lat: 34.07, lng: -101.30 },
  { name: "Briscoe", lat: 34.53, lng: -101.21 },
  { name: "Hall", lat: 34.53, lng: -100.69 },
  { name: "Donley", lat: 34.97, lng: -100.81 },
  { name: "Collingsworth", lat: 34.97, lng: -100.27 },
  { name: "Wheeler", lat: 35.40, lng: -100.27 },
  { name: "Hemphill", lat: 35.83, lng: -100.27 },
  { name: "Roberts", lat: 35.83, lng: -100.81 },
  { name: "Lipscomb", lat: 36.28, lng: -100.27 },
  { name: "Ochiltree", lat: 36.28, lng: -100.81 },
  { name: "Hansford", lat: 36.28, lng: -101.35 },
  { name: "Sherman", lat: 36.28, lng: -101.89 },
  { name: "Moore", lat: 35.83, lng: -101.89 },
  { name: "Hartley", lat: 35.83, lng: -102.61 },
  { name: "Dallam", lat: 36.28, lng: -102.61 },
  { name: "Oldham", lat: 35.40, lng: -102.61 },
  { name: "Deaf Smith", lat: 34.97, lng: -102.61 },
  { name: "Parmer", lat: 34.53, lng: -102.78 },
  { name: "Castro", lat: 34.53, lng: -102.26 },
  { name: "Swisher", lat: 34.53, lng: -101.73 },
  { name: "Armstrong", lat: 34.97, lng: -101.35 },
  { name: "Carson", lat: 35.40, lng: -101.35 },
  { name: "Hutchinson", lat: 35.83, lng: -101.35 },
  { name: "Lamb", lat: 34.07, lng: -102.35 },
  { name: "Bailey", lat: 34.07, lng: -102.83 },
  { name: "Cochran", lat: 33.60, lng: -102.83 },
  { name: "Hockley", lat: 33.60, lng: -102.35 },
  { name: "Duval", lat: 27.68, lng: -98.51 },
  { name: "Brooks", lat: 27.03, lng: -98.22 },
  { name: "Zapata", lat: 27.00, lng: -99.17 },
  { name: "Jim Hogg", lat: 27.05, lng: -98.69 },
  { name: "Kenedy", lat: 26.90, lng: -97.63 },
  { name: "Dimmit", lat: 28.42, lng: -99.75 },
  { name: "Zavala", lat: 28.87, lng: -99.76 },
  { name: "Frio", lat: 28.87, lng: -99.11 },
  { name: "La Salle", lat: 28.35, lng: -98.70 },
  { name: "McMullen", lat: 28.35, lng: -98.24 },
  { name: "Live Oak", lat: 28.35, lng: -98.12 },
  { name: "Kinney", lat: 29.33, lng: -100.42 },
  { name: "Real", lat: 29.83, lng: -99.82 },
  { name: "Edwards", lat: 29.98, lng: -100.30 },
  { name: "Kerr", lat: 30.06, lng: -99.35 },
];

function isPersonName(name) {
  if (!name || name.length < 4 || name.length > 60) return false;
  if (/party|election|poll|district|senate|house|congress|general|primary|runoff|ballot|voting|campaign|endorsement|race|seat|term|office|county|city|state\b|representative|governor|mayor|council|incumbent|candidate|nomination|report|committee|association|political|foundation|institute|center|department|division|agency|authority|commission|board|court|journal|news|tribune|times|gazette|herald|review|biography|submitted|survey|source\b|click\b|here\b|view\b|more\b|see\b|public policy|how to|what's on|who represents|external link|footnote|content/i.test(name)) return false;
  if (/\band\b/i.test(name)) return false;
  if (/[?!,]/.test(name)) return false;
  if (/^\d/.test(name)) return false;
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return false;
  if (!/^[A-Z]/.test(words[0])) return false;
  return true;
}

function normalizeParty(raw) {
  if (!raw) return "R";
  const lc = raw.toLowerCase();
  if (lc.includes("republican")) return "R";
  if (lc.includes("democrat")) return "D";
  if (lc.includes("nonpartisan") || lc.includes("independent")) return "NP";
  if (lc === "r") return "R";
  if (lc === "d") return "D";
  return "NP";
}

function initials(name) {
  const parts = (name || "").split(" ").filter((p) => /^[A-Za-z]/.test(p));
  if (!parts.length) return "";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function hashCandidate(c) {
  return crypto.createHash("sha256")
    .update([c.name, c.office, c.office_level, c.jurisdiction, c.district || "", c.party]
      .map((s) => (s || "").toLowerCase().trim()).join("|"), "utf8")
    .digest("hex");
}

// Office-role-specific policy templates (better than generic party fallbacks)
function officeTypePolicies(office, party) {
  const lc = (office || "").toLowerCase();
  if (/judge|court|judicial/i.test(lc)) return [
    "Ensure fair and impartial adjudication of cases",
    "Improve court efficiency and reduce case backlogs",
    "Manage growing caseloads from county population growth",
    "Maintain accessible court services for all residents",
    "Uphold rule of law and consistent legal standards",
  ];
  if (/clerk/i.test(lc)) return [
    "Modernize records management with digital systems",
    "Ensure transparent and accessible public records",
    "Streamline filing and processing times",
    "Maintain election integrity through secure administration",
    "Reduce costs through technology and automation",
  ];
  if (/treasurer/i.test(lc)) return [
    "Invest county funds conservatively to protect taxpayer assets",
    "Increase transparency in county financial reporting",
    "Modernize payment systems for efficiency",
    "Ensure fiscal discipline and balanced county budgets",
    "Reduce unnecessary fees and service charges",
  ];
  if (/sheriff|constable/i.test(lc)) return [
    "Support law enforcement with adequate resources and training",
    "Enhance community safety through proactive policing",
    "Maintain transparent and accountable law enforcement operations",
    "Improve emergency response capabilities",
    "Build community trust through outreach programs",
  ];
  if (/attorney|da\b/i.test(lc)) return [
    "Prosecute criminal cases effectively and efficiently",
    "Support victims' rights and restitution",
    "Address growing caseloads in rapidly growing county",
    "Ensure public safety through vigorous prosecution",
    "Maintain integrity and transparency in the justice system",
  ];
  if (/commissioner/i.test(lc)) return [
    "Manage county growth through responsible infrastructure investment",
    "Maintain fiscal responsibility while addressing community needs",
    "Support law enforcement and emergency services",
    "Improve road maintenance and drainage infrastructure",
    "Ensure transparent county government operations",
  ];
  if (/county judge/i.test(lc)) return [
    "Manage county growth and infrastructure responsibly",
    "Maintain fiscal discipline and property tax accountability",
    "Support law enforcement and public safety",
    "Lead emergency management and disaster preparedness",
    "Ensure transparent and efficient county government",
  ];
  return [
    party === "D" ? "Expand access to public services" : "Lower taxes and reduce spending",
    "Support public safety and law enforcement",
    "Improve county infrastructure",
    "Ensure transparent government operations",
    "Promote economic development",
  ];
}

/**
 * Parse a Ballotpedia county elections page.
 * 
 * Structure: h2 sections → h3 date subsections → collapsible ULs.
 * Inside each collapsible panel: div.widget-data-list containing
 *   <p><b>Office Name</b></p>
 *   <ul><li><a href="...">Candidate</a> (R)</li></ul>
 * alternating.
 */
function parseCountyElectionPage(html, countyName, lat, lng) {
  const $ = cheerio.load(html);
  const candidates = [];
  const seen = new Set();
  const jurisdiction = `${countyName} County`;

  const skipOffice = /municipal utility|improvement district|water control|water district|MUD\b|fresh water|levee|emergency service/i;

  // Find all widget-data-list containers (these hold county + judicial candidates)
  $("div.widget-data-list").each((_, container) => {
    const $div = $(container);
    let currentOffice = null;

    // Walk through child elements in order: <p> tags have bold office names,
    // <ul> tags have candidate list items
    $div.children().each((_, child) => {
      const $child = $(child);
      const tag = (child.tagName || "").toLowerCase();

      if (tag === "p") {
        // Check for bold office name
        const bold = $child.find("b").text().trim();
        if (bold && bold.length > 3 && bold.length < 150) {
          currentOffice = bold;
        }
      } else if (tag === "ul" && currentOffice) {
        if (skipOffice.test(currentOffice)) return;

        // Each LI is a candidate
        $child.find("li").each((_, li) => {
          const $li = $(li);
          const $link = $li.find("a[href]").first();
          if (!$link.length) return;

          const name = $link.text().trim().replace(/\s*\(i\)\s*$/, "").trim();
          const href = $link.attr("href") || "";
          if (!isPersonName(name)) return;

          // Extract party from the LI text
          const liText = $li.text();
          let party = "NP";
          if (/\(R\)/.test(liText)) party = "R";
          else if (/\(D\)/.test(liText)) party = "D";
          else if (/\(Nonpartisan\)/i.test(liText)) party = "NP";

          const sourceUrl = href.startsWith("/") ? `${BP_BASE}${href}` : href.includes("ballotpedia.org") ? href : null;

          const key = `${name}|${currentOffice}`;
          if (seen.has(key)) return;
          seen.add(key);

          candidates.push({ name, office: currentOffice, party, sourceUrl, jurisdiction, countyName, lat, lng });
        });
      }
    });
  });

  return candidates;
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  TX County Election Candidate Discovery (Ballotpedia)    ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const args = process.argv.slice(2);
  let counties = TX_COUNTIES;

  const countyIdx = args.indexOf("--county");
  if (countyIdx !== -1 && args[countyIdx + 1]) {
    const target = args[countyIdx + 1].toLowerCase();
    counties = TX_COUNTIES.filter((c) => c.name.toLowerCase() === target);
    if (!counties.length) { console.error(`County "${args[countyIdx + 1]}" not found`); process.exit(1); }
  }

  const topIdx = args.indexOf("--top");
  if (topIdx !== -1 && args[topIdx + 1]) {
    counties = TX_COUNTIES.slice(0, parseInt(args[topIdx + 1], 10));
  }

  console.log(`Discovering county candidates for ${counties.length} counties...\n`);

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  const baseline = await coll.countDocuments({ office_level: "local" });
  console.log(`Baseline: ${baseline} local candidates in DB\n`);

  let totalDiscovered = 0, inserted = 0, existed = 0, fetchErrors = 0;

  for (let i = 0; i < counties.length; i++) {
    const county = counties[i];
    const slug = county.name.replace(/ /g, "_");
    const url = `${BP_BASE}/${slug}_County,_Texas,_elections,_2026`;

    process.stdout.write(`  [${i + 1}/${counties.length}] ${county.name} County... `);

    await sleep(FETCH_DELAY);
    let html;
    try {
      const res = await http.get(url, { responseType: "text" });
      html = res.data;
    } catch {
      process.stdout.write("no page\n");
      fetchErrors++;
      continue;
    }

    const candidates = parseCountyElectionPage(html, county.name, county.lat, county.lng);
    if (!candidates.length) {
      process.stdout.write("0 candidates\n");
      continue;
    }

    totalDiscovered += candidates.length;
    let countyInserted = 0;

    for (const c of candidates) {
      const now = new Date();
      const doc = {
        name: c.name,
        office: c.office,
        office_level: "local",
        jurisdiction: c.jurisdiction,
        state: "TX",
        district: null,
        party: c.party,
        incumbent: null,
        filing_date: null,
        geo: {
          jurisdiction_name: c.jurisdiction,
          lat: c.lat, lng: c.lng,
          geo_type: "county_center",
          geo_source: "ballotpedia_county_discovery",
          bounding_box: { north: null, south: null, east: null, west: null },
          geojson_point: { type: "Point", coordinates: [c.lng, c.lat] },
        },
        home_city: null,
        policies: officeTypePolicies(c.office, c.party),
        policies_source: "office_party_template",
        photo: {
          url: null, source: null, verified: false,
          last_fetched: null, fallback_initials: initials(c.name),
        },
        zip_codes: [],
        district_zip_map: { state: "TX", district: null, zip_codes: [] },
        source_url: c.sourceUrl,
        source_name: "Ballotpedia (county-discovered)",
        last_verified: now,
        status_2026: "nominee",
        data_hash: "",
      };
      doc.data_hash = hashCandidate(doc);

      try {
        const r = await coll.updateOne(
          { name: doc.name, office: doc.office },
          { $setOnInsert: { ...doc, created_at: now, updated_at: now } },
          { upsert: true },
        );
        if (r.upsertedCount > 0) { inserted++; countyInserted++; }
        else existed++;
      } catch { /* duplicate or write error — skip */ }
    }

    process.stdout.write(`${candidates.length} found, ${countyInserted} new\n`);
  }

  await db.collection("api_cache").deleteMany({});

  const finalLocal = await coll.countDocuments({ office_level: "local" });
  console.log("\n═══ RESULTS ═══");
  console.log(`  Counties scraped: ${counties.length - fetchErrors} / ${counties.length}`);
  console.log(`  Total candidates discovered: ${totalDiscovered}`);
  console.log(`  New inserted: ${inserted}`);
  console.log(`  Already existed: ${existed}`);
  console.log(`  Local candidates: ${baseline} → ${finalLocal} (+${finalLocal - baseline})`);

  await client.close();
  process.exit(0);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
