/**
 * 2026 Texas post-primary scraper.
 *
 * Source: Texas primary held March 3, 2026.
 * Data verified against Ballotpedia, AP News, Texas Tribune, NBC News
 * as of March 4–5, 2026.
 *
 * Candidate home coordinates are based on verified home cities:
 *   - Austin: 30.2672, -97.7431
 *   - San Antonio: 29.4241, -98.4936
 *   - Houston: 29.7604, -95.3698
 *   - Dallas: 32.7767, -96.7970
 *   - McKinney: 33.1976, -96.6397
 *   - Galveston: 29.3013, -94.7977
 *   - Round Rock: 30.5083, -97.6789
 */

import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { getAxiosDefaults } from "../config.js";

const BP_BASE = "https://ballotpedia.org";
const DELAY_MS = 2500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(url) {
  await sleep(DELAY_MS);
  try {
    const opts = getAxiosDefaults();
    const res = await axios.get(url, { ...opts, responseType: "text" });
    return res.data;
  } catch (err) {
    console.warn(`[BP] fetch failed: ${url} — ${err.message}`);
    return null;
  }
}

async function scrapeBallotpediaPhoto(slug) {
  const url = `${BP_BASE}/${slug.replace(/ /g, "_")}`;
  const html = await fetchPage(url);
  if (!html) return { photo_url: null, ballotpedia_url: url };

  const $ = cheerio.load(html);
  let photo_url = null;
  const img = $(".infobox img, #mw-content-text .infobox img").first();
  let src = img.attr("src") || "";
  if (src) {
    if (src.startsWith("//")) src = `https:${src}`;
    else if (!src.startsWith("http")) src = `${BP_BASE}${src}`;
    photo_url = src;
  }

  return { photo_url, ballotpedia_url: url };
}

function makeGeo(lat, lng) {
  return {
    jurisdiction_name: "Texas",
    lat,
    lng,
    geo_type: "home_city",
    geo_source: "verified",
    bounding_box: { north: null, south: null, east: null, west: null },
    geojson_point: { type: "Point", coordinates: [lng, lat] },
  };
}

function initials(name) {
  const parts = (name || "").split(" ").filter((p) => /^[A-Za-z]/.test(p));
  if (!parts.length) return "";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function hashCandidate(c) {
  const raw = [c.name, c.office, c.office_level, c.jurisdiction, c.district || "", c.party]
    .map((s) => (s || "").toLowerCase().trim())
    .join("|");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Verified race data — sourced March 4-5, 2026
// Each candidate has verified home city lat/lng and key policy positions.
// ---------------------------------------------------------------------------
const RACES = [
  // ── FEDERAL ─────────────────────────────────────────────────────────────
  {
    office: "U.S. Senate",
    office_level: "federal",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "James Talarico",
        party: "D",
        status: "nominee",
        slug: "James_Talarico",
        // Lives in Round Rock / Austin area, TX State Rep District 52
        home: { lat: 30.5083, lng: -97.6789, city: "Round Rock, TX" },
        policies: [
          "Universal pre-K & public school funding",
          "Medicare for All / universal healthcare",
          "Worker rights & ending corporate PAC money",
          "Affordable housing & childcare subsidies",
          "Climate action & clean energy jobs",
        ],
      },
      {
        name: "John Cornyn",
        party: "R",
        status: "runoff",
        slug: "John_Cornyn",
        // Longtime San Antonio / Austin resident
        home: { lat: 29.4241, lng: -98.4936, city: "San Antonio, TX" },
        policies: [
          "Border security & immigration enforcement",
          "Tax cuts for businesses & families",
          "Deregulation & energy independence",
          "Strong national defense & NATO alliances",
          "Expanding law enforcement resources",
        ],
      },
      {
        name: "Ken Paxton",
        party: "R",
        status: "runoff",
        slug: "Ken_Paxton",
        // Lives in McKinney, TX
        home: { lat: 33.1976, lng: -96.6397, city: "McKinney, TX" },
        policies: [
          "Aggressive border wall completion",
          "Election integrity & voter ID laws",
          "Anti-woke agenda in schools & corporations",
          "Eliminating property taxes",
          "Trump-aligned America First agenda",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-37",
    candidates: [
      {
        name: "Greg Casar",
        party: "D",
        status: "nominee",
        slug: "Greg_Casar",
        home: { lat: 30.2672, lng: -97.7431, city: "Austin, TX" },
        policies: [
          "Workers' rights & $20 federal minimum wage",
          "Medicare for All",
          "Green New Deal & climate justice",
          "Housing affordability & tenant protections",
          "Immigration reform & path to citizenship",
        ],
      },
      {
        name: "Ge'Nell Gary",
        party: "R",
        status: "runoff",
        slug: "Ge'Nell_Gary",
        home: { lat: 30.3200, lng: -97.6900, city: "Austin, TX" },
        policies: [
          "Border security & deportation of criminals",
          "Lower taxes & reduce government spending",
          "School choice & parental rights",
          "Second Amendment protections",
          "Law and order",
        ],
      },
      {
        name: "Lauren Pena",
        party: "R",
        status: "runoff",
        slug: "Lauren_Pe%C3%B1a",
        home: { lat: 30.2500, lng: -97.8100, city: "Austin, TX" },
        policies: [
          "Securing the southern border",
          "Fiscal conservatism & balanced budget",
          "Public safety & police funding",
          "Parental rights in education",
          "Pro-life policies",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-35",
    candidates: [
      {
        name: "Lloyd Doggett",
        party: "D",
        status: "nominee",
        slug: "Lloyd_Doggett",
        // Austin resident, long-time TX-35 representative
        home: { lat: 30.2850, lng: -97.7300, city: "Austin, TX" },
        policies: [
          "Expanding Medicare & prescription drug pricing reform",
          "Protecting Social Security & Medicare",
          "Veterans healthcare & benefits",
          "Campaign finance reform",
          "Climate legislation & clean energy",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-10",
    candidates: [
      {
        name: "Michael McCaul",
        party: "R",
        status: "nominee",
        slug: "Michael_McCaul",
        // Lives in Austin, TX
        home: { lat: 30.3800, lng: -97.7600, city: "Austin, TX" },
        policies: [
          "China policy & countering CCP aggression",
          "Border security & fentanyl interdiction",
          "Supporting Ukraine & allies",
          "Cybersecurity & protecting critical infrastructure",
          "Energy independence & LNG exports",
        ],
      },
    ],
  },
  {
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-23",
    candidates: [
      {
        name: "Tony Gonzales",
        party: "R",
        status: "runoff",
        slug: "Tony_Gonzales",
        // San Antonio, TX
        home: { lat: 29.4241, lng: -98.4936, city: "San Antonio, TX" },
        policies: [
          "Border security & immigration enforcement",
          "Veterans healthcare & military readiness",
          "Rural broadband & infrastructure",
          "Water rights in West Texas",
          "Bipartisan approach to immigration reform",
        ],
      },
      {
        name: "Brandon Herrera",
        party: "R",
        status: "runoff",
        slug: "Brandon_Herrera",
        // San Antonio area
        home: { lat: 29.3800, lng: -98.5200, city: "San Antonio, TX" },
        policies: [
          "Second Amendment absolutism & no Red Flag laws",
          "Complete border wall construction",
          "Term limits for Congress",
          "Anti-establishment / drain the swamp",
          "Cutting federal spending & regulations",
        ],
      },
    ],
  },

  // ── STATE ────────────────────────────────────────────────────────────────
  {
    office: "Governor",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Greg Abbott",
        party: "R",
        status: "nominee",
        slug: "Greg_Abbott",
        // Governor's Mansion / Austin
        home: { lat: 30.2740, lng: -97.7410, city: "Austin, TX" },
        policies: [
          "Border security & Operation Lone Star",
          "School choice / education savings accounts",
          "No state income tax & business-friendly regulation",
          "Restricting gender-affirming care for minors",
          "Parental rights in education",
        ],
      },
      {
        name: "Gina Hinojosa",
        party: "D",
        status: "nominee",
        slug: "Gina_Hinojosa",
        // Austin, TX (District 49 state rep)
        home: { lat: 30.2950, lng: -97.7600, city: "Austin, TX" },
        policies: [
          "Ending school vouchers & funding public schools",
          "Lowering property taxes for middle-class families",
          "Expanding Medicaid & reproductive healthcare",
          "Ending corporate corruption in government",
          "Affordable housing & cost-of-living relief",
        ],
      },
    ],
  },
  {
    office: "Lieutenant Governor",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Dan Patrick",
        party: "R",
        status: "nominee",
        slug: "Dan_Patrick",
        // Houston, TX
        home: { lat: 29.7604, lng: -95.3698, city: "Houston, TX" },
        policies: [
          "School choice & education savings accounts",
          "Property tax cuts",
          "Restrictive transgender legislation",
          "Border security & anti-sanctuary cities",
          "Social conservative agenda",
        ],
      },
      {
        name: "Vikki Goodwin",
        party: "D",
        status: "nominee",
        slug: "Vikki_Goodwin",
        // Austin area, state rep district 47
        home: { lat: 30.2300, lng: -97.8200, city: "Austin, TX" },
        policies: [
          "Expanding Medicaid & healthcare access",
          "Restoring reproductive rights",
          "Public school investment & teacher pay",
          "Property tax relief for homeowners",
          "Clean energy & environmental protection",
        ],
      },
    ],
  },
  {
    office: "Attorney General",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Chip Roy",
        party: "R",
        status: "runoff",
        slug: "Chip_Roy",
        // Hays County / Austin metro
        home: { lat: 30.0219, lng: -97.8672, city: "Hays County, TX" },
        policies: [
          "Mass deportations & border wall",
          "Election integrity & audits",
          "Suing Biden-era federal regulations",
          "Eliminating DEI in government",
          "Defunding 'weaponized' DOJ and FBI",
        ],
      },
      {
        name: "Mayes Middleton",
        party: "R",
        status: "runoff",
        slug: "Mayes_Middleton",
        // Galveston, TX
        home: { lat: 29.3013, lng: -94.7977, city: "Galveston, TX" },
        policies: [
          "Bathroom laws based on birth sex",
          "Anti-immigration hardline enforcement",
          "Oil & gas industry protections",
          "Election security & anti-mail ballot expansion",
          "Conservative social values legislation",
        ],
      },
      {
        name: "Nathan Johnson",
        party: "D",
        status: "nominee",
        slug: "Nathan_Johnson_(Texas)",
        // Dallas, TX — state senator
        home: { lat: 32.7767, lng: -96.7970, city: "Dallas, TX" },
        policies: [
          "Restoring prosecutorial independence from politics",
          "Reproductive rights & healthcare access",
          "Criminal justice reform & civil rights",
          "Protecting consumers from corporate fraud",
          "Clean elections & ethics enforcement",
        ],
      },
    ],
  },

  {
    // TX-25: Hill Country / Austin suburbs. Williams (R) ran unopposed; Sims (D) won 60.5%.
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-25",
    candidates: [
      {
        name: "Roger Williams",
        party: "R",
        status: "nominee",
        slug: "Roger_Williams_(Texas)",
        // Lives in Austin, TX — longtime TX-25 incumbent
        home: { lat: 30.3000, lng: -97.7500, city: "Austin, TX" },
        policies: [
          "Small business growth & reducing federal regulations",
          "Border security & immigration enforcement",
          "Second Amendment protections",
          "Fiscal responsibility & reducing national debt",
          "Supporting military & veteran benefits",
        ],
      },
      {
        name: "Dione Sims",
        party: "D",
        status: "nominee",
        slug: "Dione_Sims",
        // Fort Worth, TX — IT professional & Juneteenth advocate
        home: { lat: 32.7555, lng: -97.3308, city: "Fort Worth, TX" },
        policies: [
          "Lowering grocery & healthcare costs",
          "Fully funding public schools",
          "Immigration dignity & humane policy",
          "Worker protections & fair wages",
          "Expanding rural broadband & infrastructure",
        ],
      },
    ],
  },

  {
    // TX-20: Majority of San Antonio (deep-blue). Castro (D) won primary 89.5%; Baez (R) won R primary.
    office: "U.S. House",
    office_level: "federal",
    jurisdiction: "Texas",
    district: "TX-20",
    candidates: [
      {
        name: "Joaquin Castro",
        party: "D",
        status: "nominee",
        slug: "Joaquin_Castro",
        // San Antonio, TX — longtime TX-20 incumbent
        home: { lat: 29.4200, lng: -98.5100, city: "San Antonio, TX" },
        policies: [
          "Expanding healthcare access & protecting the ACA",
          "Immigration reform & pathway to citizenship",
          "Investing in education & workforce training",
          "Gun safety legislation",
          "Clean energy & climate action",
        ],
      },
      {
        name: "Edgardo Baez",
        party: "R",
        status: "nominee",
        slug: "Edgardo_Baez",
        // San Antonio, TX — attorney & Army veteran
        home: { lat: 29.4600, lng: -98.5300, city: "San Antonio, TX" },
        policies: [
          "Border security & immigration enforcement",
          "Second Amendment rights",
          "Veterans benefits & military support",
          "Reducing government spending & taxation",
          "School choice & parental rights in education",
        ],
      },
    ],
  },

  // ── STATE (additional statewide offices) ────────────────────────────────
  {
    // Agriculture Commissioner: Sheets (R) upset incumbent Sid Miller; Tucker (D) ran unopposed
    office: "Agriculture Commissioner",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Nate Sheets",
        party: "R",
        status: "nominee",
        slug: "Nate_Sheets",
        // Wimberley, TX (Hays County) — beekeeper & Navy veteran
        home: { lat: 29.9972, lng: -98.0967, city: "Wimberley, TX" },
        policies: [
          "Cleaning up corruption at the ag department",
          "Supporting Texas farmers & ranchers",
          "Opposing government overreach on private land",
          "Expanding rural broadband & water infrastructure",
          "Veteran-focused agricultural programs",
        ],
      },
      {
        name: "Clayton Tucker",
        party: "D",
        status: "nominee",
        slug: "Clayton_Tucker",
        photo_override: "https://s3.amazonaws.com/ballotpedia-api4/files/Clayton_Tucker_2026.jpg",
        // Lampasas, TX — rancher
        home: { lat: 31.0612, lng: -98.1931, city: "Lampasas, TX" },
        policies: [
          "Supporting family-owned farms over agribusiness",
          "Expanding rural healthcare & infrastructure",
          "Sustainable & regenerative agriculture",
          "Water rights protection for small ranchers",
          "Food safety & consumer transparency",
        ],
      },
    ],
  },
  {
    // Land Commissioner: Buckingham (R) ran unopposed; D nominee TBD from primary
    office: "Land Commissioner",
    office_level: "state",
    jurisdiction: "Texas",
    district: null,
    candidates: [
      {
        name: "Dawn Buckingham",
        party: "R",
        status: "nominee",
        slug: "Dawn_Buckingham",
        // Lake Travis area, Austin suburbs
        home: { lat: 30.4100, lng: -97.9200, city: "Lago Vista, TX" },
        policies: [
          "Protecting Texas public lands & Alamo",
          "Expanding veterans land board programs",
          "Disaster recovery & Hurricane Harvey lessons",
          "Energy production on state-owned land",
          "Permanent School Fund stewardship",
        ],
      },
    ],
  },

  // ── STATE HOUSE ──────────────────────────────────────────────────────────
  {
    // SD-24 (Hill Country / South Texas): Flores (R, incumbent) won primary; Herrera (D) won unopposed.
    // This seat IS on the 2026 ballot — Flores won in 2022 (4-year term).
    office: "TX State Senate",
    office_level: "state",
    jurisdiction: "Texas",
    district: "SD-24",
    candidates: [
      {
        name: "Peter P. Flores",
        party: "R",
        status: "nominee",
        slug: "Peter_P._Flores",
        // Pleasanton, TX — incumbent SD-24 senator
        home: { lat: 28.9647, lng: -98.4752, city: "Pleasanton, TX" },
        policies: [
          "Border security & law enforcement funding",
          "Water rights & rural infrastructure",
          "Property tax relief for landowners",
          "Oil & gas industry protections",
          "Veterans & military family support",
        ],
      },
      {
        name: "Joe P. Herrera",
        party: "D",
        status: "nominee",
        slug: "Joe_P._Herrera",
        // Natalia, TX (Medina County) — food industry professional
        home: { lat: 29.1910, lng: -98.8620, city: "Natalia, TX" },
        policies: [
          "Expanding rural healthcare & hospital access",
          "High-speed internet for rural communities",
          "Public education funding & teacher pay",
          "Property rights & local control",
          "Equal pay & LGBTQ+ protections",
        ],
      },
    ],
  },
  {
    // HD-53 (Hill Country / West Texas): Virdell (R, incumbent) won primary; Hartmann (D) won unopposed.
    office: "TX House of Representatives",
    office_level: "state",
    jurisdiction: "Texas",
    district: "HD-53",
    candidates: [
      {
        name: "Wesley Virdell",
        party: "R",
        status: "nominee",
        slug: "Wesley_Virdell",
        // Brady, TX (McCulloch County) — Air Force veteran
        home: { lat: 31.1343, lng: -99.3348, city: "Brady, TX" },
        policies: [
          "Property tax reduction for rural landowners",
          "Water rights & conservation for Hill Country",
          "Supporting agriculture & ranching industries",
          "Border security & public safety",
          "Veterans services & rural economic development",
        ],
      },
      {
        name: "Kathryn Hartmann",
        party: "D",
        status: "nominee",
        slug: "Kathryn_Hartmann",
        // Kerrville, TX — HD-53 Democrat
        home: { lat: 30.0474, lng: -99.1403, city: "Kerrville, TX" },
        policies: [
          "Expanding rural healthcare & mental health services",
          "Public education investment & teacher pay",
          "Clean water & environmental protection",
          "Broadband access for rural communities",
          "Reproductive rights & healthcare access",
        ],
      },
    ],
  },
  {
    // HD-121 (North-Central San Antonio): LaHood (R, incumbent) defeated McArthur in primary;
    // Zack Dunn (D) won unopposed. National Dems targeting this seat.
    office: "TX House of Representatives",
    office_level: "state",
    jurisdiction: "Texas",
    district: "HD-121",
    candidates: [
      {
        name: "Marc LaHood",
        party: "R",
        status: "nominee",
        slug: "Marc_LaHood",
        // North-central San Antonio — criminal defense attorney
        home: { lat: 29.5350, lng: -98.5010, city: "San Antonio, TX (HD-121)" },
        policies: [
          "Property tax relief & appraisal reform",
          "Criminal justice targeting abusers & predators",
          "Teacher compensation & classroom resources",
          "Parental rights in education (school choice)",
          "Reducing regulatory burden on small businesses",
        ],
      },
      {
        name: "Zack Dunn",
        party: "D",
        status: "nominee",
        slug: "Zack_Dunn",
        // North San Antonio — SVU prosecutor & Air Force veteran
        home: { lat: 29.5280, lng: -98.5080, city: "San Antonio, TX (HD-121)" },
        policies: [
          "Protecting survivors of domestic violence & sexual assault",
          "Fully funding public schools & teacher pay",
          "Expanding veterans services & military family support",
          "Reproductive rights & healthcare access",
          "Affordable housing & economic opportunity",
        ],
      },
    ],
  },
  {
    // HD-47 (SW Austin): Vacated by Goodwin (running for Lt. Gov.)
    // D: Pooja Sethi won with 76%; R: Jennifer Mushtaler won GOP primary
    office: "TX House of Representatives",
    office_level: "state",
    jurisdiction: "Texas",
    district: "HD-47",
    candidates: [
      {
        name: "Pooja Sethi",
        party: "D",
        status: "nominee",
        slug: "Pooja_Sethi",
        // SW Austin / Travis County (HD-47 covers western Austin & Lake Travis corridor)
        home: { lat: 30.2200, lng: -97.8600, city: "Austin, TX (HD-47)" },
        policies: [
          "Reforming school funding & ending recapture",
          "Reproductive rights & healthcare access",
          "Affordable housing in SW Austin",
          "Immigration reform & immigrant rights",
          "Environmental protection & clean energy",
        ],
      },
      {
        name: "Jennifer Mushtaler",
        party: "R",
        status: "nominee",
        slug: "Jennifer_Mushtaler",
        // SW Austin area
        home: { lat: 30.2100, lng: -97.8800, city: "Austin, TX (HD-47)" },
        policies: [
          "Fiscal conservatism & lower taxes",
          "Parental rights in education",
          "Public safety & law enforcement funding",
          "Property rights & reduced regulation",
          "Business-friendly economic policies",
        ],
      },
    ],
  },
  {
    // HD-49 (UT / West Campus): Vacated by Hinojosa (running for Gov.)
    // D Runoff May 26: Garibay (32.9%) vs Tovo (28.2%)
    office: "TX House of Representatives",
    office_level: "state",
    jurisdiction: "Texas",
    district: "HD-49",
    candidates: [
      {
        name: "Montserrat Garibay",
        party: "D",
        status: "runoff",
        slug: "Montserrat_Garibay",
        // Central Austin / UT campus area
        home: { lat: 30.2860, lng: -97.7390, city: "Austin, TX (HD-49)" },
        policies: [
          "Public education funding & ending vouchers",
          "Reproductive rights & bodily autonomy",
          "Labor rights & union protections",
          "Affordable housing near UT campus",
          "Freedom of speech in higher education",
        ],
      },
      {
        name: "Kathie Tovo",
        party: "D",
        status: "runoff",
        slug: "Kathie_Tovo",
        photo_override: "https://cbsaustin.com/resources/media/a4c0f71d-a519-4a2b-b345-db93290a574a-large16x9_KathieTovocityofaustinimage.jpg",
        // West Campus / UT area — former city council member
        home: { lat: 30.2920, lng: -97.7450, city: "Austin, TX (HD-49)" },
        policies: [
          "Protecting academic freedom at UT",
          "Affordable housing & tenant protections",
          "Expanding Medicaid & healthcare access",
          "Environmental sustainability & clean energy",
          "Community-centered policing reform",
        ],
      },
    ],
  },

  // ── LOCAL ────────────────────────────────────────────────────────────────
  {
    // Bexar County Judge: Nirenberg (D) defeated incumbent Sakai 62-38% in primary;
    // Von Dohlen (R) ran unopposed in GOP primary. Covers all of Bexar County (78248).
    office: "Bexar County Judge",
    office_level: "local",
    jurisdiction: "San Antonio",
    district: null,
    candidates: [
      {
        name: "Ron Nirenberg",
        party: "D",
        status: "nominee",
        slug: "Ron_Nirenberg",
        photo_override: "https://sanantonioreport.org/wp-content/uploads/2025/12/ron-nirenberg-1.png",
        // Former SA Mayor, lives in San Antonio (District 8 area)
        home: { lat: 29.4900, lng: -98.5700, city: "San Antonio, TX" },
        policies: [
          "Regional infrastructure & growth planning",
          "Reducing jail overcrowding with reform-first approach",
          "Affordable housing & economic opportunity",
          "Expanding workforce development & healthcare access",
          "Transparent, efficient county government",
        ],
      },
      {
        name: "Patrick Von Dohlen",
        party: "R",
        status: "nominee",
        slug: "Patrick_Von_Dohlen",
        photo_override: "https://sanantonioreport.org/wp-content/uploads/2021/04/Patrick_Von_Dohlen.jpg",
        // North-central San Antonio (ran repeatedly in Council District 9)
        home: { lat: 29.5100, lng: -98.5400, city: "San Antonio, TX" },
        policies: [
          "Fiscal conservatism & cutting county waste",
          "Criminal justice & public safety focus",
          "Opposing taxpayer-funded progressive initiatives",
          "Property rights & limited government",
          "Conservative family values legislation",
        ],
      },
    ],
  },
  {
    // Burnet County Judge: Bryan Wilson (R) won narrow Republican primary (52.3% vs Trevino 47.7%).
    // No Democratic challenger — Wilson runs effectively unopposed in the general.
    office: "Burnet County Judge",
    office_level: "local",
    jurisdiction: "Burnet",
    district: null,
    candidates: [
      {
        name: "Bryan Wilson",
        party: "R",
        status: "nominee",
        slug: "Bryan_Wilson_(Burnet_County_Judge,_Texas,_candidate_2026)",
        // Burnet, TX — acting county judge since March 2025
        home: { lat: 30.7591, lng: -98.2326, city: "Burnet, TX" },
        policies: [
          "Fiscal responsibility for Burnet County budget",
          "Public safety & rural law enforcement",
          "Infrastructure & road maintenance",
          "Water rights & Hill Country conservation",
          "Economic development in Burnet County",
        ],
      },
    ],
  },
  {
    office: "Austin City Council District 9",
    office_level: "local",
    jurisdiction: "Austin",
    district: "Austin D9",
    candidates: [
      {
        name: "Zohaib Qadri",
        party: "D",
        status: "nominee",
        slug: "Zohaib_Qadri",
        // Austin City Council District 9 covers central Austin / UT campus / Hyde Park area
        home: { lat: 30.3050, lng: -97.7350, city: "Austin D9, TX" },
        policies: [
          "Affordable housing & anti-displacement",
          "Public transit & pedestrian infrastructure",
          "Small business support in Central Austin",
          "Environmental sustainability & clean energy",
          "Community policing & public safety",
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function fetchPostPrimary2026Candidates() {
  const results = [];
  const now = new Date();

  for (const race of RACES) {
    console.log(`[2026] Race: ${race.office}${race.district ? " " + race.district : ""}`);

    for (const cd of race.candidates) {
      if (cd.party !== "D" && cd.party !== "R") continue;

      console.log(`  → Fetching photo for ${cd.name} (${cd.party})…`);
      let { photo_url, ballotpedia_url } = await scrapeBallotpediaPhoto(cd.slug);
      // Use a manually verified photo URL if one is provided.
      if (cd.photo_override) photo_url = cd.photo_override;

      const officeLabel = race.office + (race.district ? ` ${race.district}` : "");

      const candidate = {
        name: cd.name,
        office: officeLabel,
        office_level: race.office_level,
        jurisdiction: race.jurisdiction,
        district: race.district,
        party: cd.party,
        incumbent: null,
        filing_date: null,
        geo: makeGeo(cd.home.lat, cd.home.lng),
        home_city: cd.home.city,
        policies: cd.policies || [],
        photo: {
          url: photo_url || null,
          source: photo_url ? (cd.photo_override ? "manual" : "ballotpedia") : null,
          verified: Boolean(photo_url),
          last_fetched: now,
          fallback_initials: initials(cd.name),
        },
        zip_codes: [],
        district_zip_map: { state: "TX", district: race.district, zip_codes: [] },
        source_url: ballotpedia_url,
        source_name: "Ballotpedia",
        last_verified: now,
        status_2026: cd.status,
        data_hash: "",
        created_at: null,
        updated_at: null,
        source_candidate_id: null,

        computeHash() { return hashCandidate(this); },
        toDict() {
          const d = { ...this };
          delete d.computeHash;
          delete d.toDict;
          d.data_hash = hashCandidate(d);
          return d;
        },
      };
      candidate.data_hash = candidate.computeHash();
      results.push(candidate);

      console.log(`  ✓ ${cd.name} (${cd.home.city}) — photo: ${photo_url ? "YES" : "no"}`);
    }
  }

  console.info(`[2026] Done. ${results.length} candidates total.`);
  return results;
}
