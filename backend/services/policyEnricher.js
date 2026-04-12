/**
 * policyEnricher.js
 *
 * Enriches candidate records with specific policy positions.
 *
 * Two-tier strategy:
 *   1. Scrape Ballotpedia "Campaign themes" section for candidates that have one
 *   2. Fall back to office-specific + party-specific policy templates
 *
 * All data is written directly to the MongoDB Atlas database.
 */

import axios from "axios";
import * as cheerio from "cheerio";

const BP_BASE = "https://ballotpedia.org";
const DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Ballotpedia scraper ────────────────────────────────────────────────────

/**
 * Scrape the "Campaign themes" → 2026 section of a Ballotpedia candidate page.
 * Looks for campaign website excerpts, survey responses, and listed positions.
 *
 * @param {string} url - Ballotpedia candidate page URL
 * @returns {string[]} Array of policy bullet strings (may be empty)
 */
export async function scrapeBallotpediaPolicies(url) {
  await sleep(DELAY_MS);
  let html;
  try {
    const res = await axios.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      responseType: "text",
    });
    html = res.data;
  } catch {
    return [];
  }

  const $ = cheerio.load(html);
  const bullets = [];

  // Strategy: Walk mw-parser-output children from "Campaign themes" h2
  // to the next h2, capturing content under the 2026 h3.
  let inCampaignThemes = false;
  let in2026 = false;
  let pastFirst2026 = false;

  $(".mw-parser-output")
    .children()
    .each((_, el) => {
      const tag = (el.tagName || "").toLowerCase();
      const $el = $(el);

      if (tag === "h2") {
        if (/campaign themes/i.test($el.text())) {
          inCampaignThemes = true;
          return;
        } else if (inCampaignThemes) {
          return false; // stop at next h2
        }
      }
      if (!inCampaignThemes) return;

      if (tag === "h3") {
        if (/2026/.test($el.text())) {
          if (pastFirst2026) return false; // second 2026 section (different office)
          in2026 = true;
          return;
        } else if (in2026) {
          in2026 = false;
          pastFirst2026 = true;
          return;
        }
      }
      if (!in2026) return;

      // Skip boilerplate
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (
        !text ||
        text.length < 30 ||
        /Candidate Connection survey|Who fills out|click here|font-size|padding|jQuery|function/i.test(
          text,
        )
      )
        return;

      // Campaign website div — richest source
      if (tag === "div" && text.length > 50) {
        extractBullets(text, bullets);
      }

      // Survey response paragraphs
      if (tag === "p" && text.length > 60) {
        const cleaned = text.replace(/\[\d+\]/g, "").trim();
        if (
          !/Ballotpedia|Candidate Connection|survey|click here|See also/i.test(
            cleaned,
          )
        ) {
          extractBullets(cleaned, bullets);
        }
      }

      // Lists
      if (tag === "ul" || tag === "ol") {
        $el.find("li").each((_, li) => {
          const liText = $(li)
            .text()
            .replace(/\[\d+\]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          if (
            liText.length > 15 &&
            liText.length < 250 &&
            !/survey|click here|Ballotpedia/i.test(liText)
          ) {
            bullets.push(liText);
          }
        });
      }
    });

  // Deduplicate and limit
  const unique = [...new Set(bullets)].slice(0, 8);
  return unique;
}

/**
 * Extract meaningful policy bullets from a block of text.
 * Splits on sentence boundaries and filters for policy-relevant statements.
 */
function extractBullets(text, bullets) {
  // Remove campaign website attribution prefixes
  const cleaned = text
    .replace(/^.*?campaign website stated the following:\s*/i, "")
    .replace(/^.*?PROVEN CONSERVATIVE RECORD\s*/i, "")
    .replace(/^.*?RECORD\s*/i, "")
    .trim();

  // Try splitting on all-caps headers (common in campaign sites)
  const capsChunks = cleaned.split(/(?=[A-Z]{3,}\s)/);
  if (capsChunks.length > 2) {
    for (const chunk of capsChunks) {
      const header = chunk.match(/^([A-Z][A-Z\s&]+)/);
      if (header && header[1].trim().length > 3 && header[1].trim().length < 60) {
        const title = toTitleCase(header[1].trim());
        if (!/Campaign|Website|Record|Explore|Focus/i.test(title)) {
          bullets.push(title);
        }
      }
    }
    if (bullets.length > 0) return;
  }

  // Fall back to sentence splitting
  const sentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter((s) => s.length > 25 && s.length < 250);

  const BIO_BOILERPLATE = [
    /is a member of/i,
    /is running for/i,
    /assumed office/i,
    /current term ends/i,
    /on the ballot/i,
    /general election on/i,
    /advanced from the/i,
    /primary on/i,
    /\bwon the election\b/i,
    /\btook office\b/i,
    /\bwas elected\b/i,
    /\bParty\) is\b/i,
    /congressional district/i,
    /campaign website/i,
    /fill out/i,
    /click here/i,
  ];

  for (const s of sentences.slice(0, 8)) {
    if (!BIO_BOILERPLATE.some((pat) => pat.test(s))) {
      bullets.push(s);
    }
  }
}

function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bFor\b/g, "for")
    .replace(/\bOf\b/g, "of")
    .replace(/\bThe\b/g, "the")
    .replace(/^./, (c) => c.toUpperCase());
}

// ─── Office-specific policy templates ───────────────────────────────────────
//
// These are granular, role-appropriate positions that reflect what each office
// actually does — far more informative than generic party platforms.

const OFFICE_POLICIES = {
  // ── County Judge ──────────────────────────────────────────────────────────
  "county judge": {
    R: [
      "Keep county tax rates low and reduce wasteful spending",
      "Invest in rural roads and county infrastructure",
      "Support law enforcement and public safety funding",
      "Promote economic development and job creation",
      "Ensure transparent and accountable county government",
    ],
    D: [
      "Expand county healthcare and social services access",
      "Invest in county infrastructure and public transit",
      "Reform county criminal justice and reduce incarceration",
      "Increase affordable housing and community development",
      "Strengthen county emergency preparedness and disaster relief",
    ],
  },

  // ── County Sheriff ────────────────────────────────────────────────────────
  "county sheriff": {
    R: [
      "Fully fund and equip deputies for effective patrol",
      "Crack down on drug trafficking and border-related crime",
      "Protect Second Amendment rights of law-abiding citizens",
      "Reduce jail recidivism through accountability programs",
      "Strengthen partnerships with federal immigration enforcement",
    ],
    D: [
      "Implement community policing and de-escalation training",
      "Expand mental health crisis response teams",
      "Increase transparency and body camera accountability",
      "Reform cash bail to reduce pretrial detention disparities",
      "Build trust between law enforcement and communities of color",
    ],
  },

  // ── County Commissioner ───────────────────────────────────────────────────
  "county commissioner": {
    R: [
      "Hold the line on property taxes and county spending",
      "Prioritize road maintenance and flood control infrastructure",
      "Support voluntary land-use decisions over regulation",
      "Expand broadband access to underserved areas",
      "Streamline county permitting and reduce red tape",
    ],
    D: [
      "Invest in county parks, trails, and public recreation",
      "Expand workforce development and job training programs",
      "Increase funding for county health and human services",
      "Address flooding and climate resilience in infrastructure planning",
      "Promote equitable zoning and affordable housing opportunities",
    ],
  },

  // ── District Attorney / County Attorney ───────────────────────────────────
  "district attorney": {
    R: [
      "Aggressively prosecute violent crime and repeat offenders",
      "Combat drug trafficking and organized crime networks",
      "Protect victims' rights throughout the justice process",
      "Support law enforcement with strong prosecutorial partnerships",
      "Oppose lenient bail policies for dangerous offenders",
    ],
    D: [
      "Reform prosecutorial practices to reduce mass incarceration",
      "Expand diversion programs for nonviolent offenders",
      "Address racial disparities in the criminal justice system",
      "Prioritize prosecution of domestic violence and sexual assault",
      "Increase focus on white-collar crime and public corruption",
    ],
  },
  "county attorney": {
    R: [
      "Aggressively prosecute violent crime and repeat offenders",
      "Combat drug trafficking and organized crime networks",
      "Protect victims' rights throughout the justice process",
      "Defend county interests and taxpayer resources in civil matters",
      "Oppose lenient bail policies for dangerous offenders",
    ],
    D: [
      "Reform prosecutorial practices to reduce mass incarceration",
      "Expand diversion programs for nonviolent offenders",
      "Address racial disparities in the criminal justice system",
      "Prioritize prosecution of domestic violence and sexual assault",
      "Increase focus on environmental compliance and public corruption",
    ],
  },

  // ── County Tax Assessor / Collector ────────────────────────────────────────
  "tax assessor": {
    R: [
      "Ensure fair and accurate property valuations",
      "Modernize tax collection to save taxpayer dollars",
      "Increase transparency in the assessment process",
      "Fight unfair property tax increases on homeowners",
      "Streamline vehicle registration and titling services",
    ],
    D: [
      "Protect homeowners from unfair property tax burdens",
      "Expand digital services for convenient tax payments",
      "Ensure equitable property assessments across all neighborhoods",
      "Increase funding for homestead exemption outreach",
      "Modernize voter registration services at the tax office",
    ],
  },

  // ── County Clerk ──────────────────────────────────────────────────────────
  "county clerk": {
    R: [
      "Ensure election integrity through secure voting systems",
      "Modernize county records and reduce processing times",
      "Cut costs through digital record-keeping and automation",
      "Protect the accuracy of vital records and property filings",
      "Maintain transparent and accessible public records",
    ],
    D: [
      "Expand voter access and make elections more accessible",
      "Modernize county records with digital-first systems",
      "Ensure equitable access to marriage licenses and vital records",
      "Increase transparency in campaign finance record-keeping",
      "Protect voting rights and oppose voter suppression efforts",
    ],
  },

  // ── County Treasurer ──────────────────────────────────────────────────────
  "county treasurer": {
    R: [
      "Invest county funds conservatively to protect taxpayer assets",
      "Increase transparency in county financial reporting",
      "Reduce unnecessary fees and service charges",
      "Modernize payment systems for efficiency",
      "Ensure fiscal discipline and balanced county budgets",
    ],
    D: [
      "Invest county funds responsibly for community benefit",
      "Expand financial transparency and public accountability",
      "Modernize payment options for residents' convenience",
      "Support community development through smart investments",
      "Increase reporting on how county dollars serve all residents",
    ],
  },

  // ── Constable / Justice of the Peace ──────────────────────────────────────
  constable: {
    R: [
      "Serve warrants and court orders efficiently and safely",
      "Support property rights through lawful eviction processes",
      "Provide school security and community patrol services",
      "Work closely with other law enforcement agencies",
      "Run a fiscally responsible and transparent office",
    ],
    D: [
      "Serve court processes with dignity and respect for all",
      "Connect eviction-facing families with legal aid resources",
      "Build community trust through outreach and engagement",
      "Implement mental health awareness training for deputies",
      "Ensure equitable treatment regardless of background",
    ],
  },
  "justice of the peace": {
    R: [
      "Ensure swift and fair resolution of small claims disputes",
      "Protect property owners' rights in landlord-tenant cases",
      "Maintain tough but fair standards for traffic and misdemeanor cases",
      "Keep court fees affordable for residents",
      "Uphold the rule of law with consistent sentencing",
    ],
    D: [
      "Expand access to justice for underserved communities",
      "Implement alternatives to fines for low-income defendants",
      "Reduce eviction rates through mediation and tenant protections",
      "Ensure fair hearings regardless of ability to hire a lawyer",
      "Increase community court programs for minor offenses",
    ],
  },

  // ── U.S. House ────────────────────────────────────────────────────────────
  "u.s. house": {
    R: [
      "Cut federal spending and balance the budget",
      "Secure the southern border and enforce immigration law",
      "Lower taxes for families and small businesses",
      "Protect Second Amendment rights",
      "Reduce federal regulations on energy and industry",
    ],
    D: [
      "Lower prescription drug and healthcare costs",
      "Protect Social Security and Medicare from cuts",
      "Invest in clean energy and climate action",
      "Strengthen voting rights and democratic institutions",
      "Expand access to affordable childcare and education",
    ],
  },

  // ── U.S. Senate ───────────────────────────────────────────────────────────
  "u.s. senate": {
    R: [
      "Cut federal spending and reduce the national debt",
      "Secure the border and reform immigration enforcement",
      "Confirm constitutionalist judges to the federal bench",
      "Lower taxes and promote American energy independence",
      "Strengthen national defense and military readiness",
    ],
    D: [
      "Protect and expand the Affordable Care Act",
      "Address climate change through clean energy investment",
      "Reform the filibuster to advance democratic legislation",
      "Protect reproductive rights and personal freedoms",
      "Invest in infrastructure and American manufacturing jobs",
    ],
  },

  // ── State House / State Senate ────────────────────────────────────────────
  "state house": {
    R: [
      "Cut property taxes and oppose new state levies",
      "Expand school choice and parental rights in education",
      "Strengthen border security and immigration enforcement",
      "Protect gun rights and oppose red-flag laws",
      "Reduce state regulations on small businesses",
    ],
    D: [
      "Fund public schools and increase teacher pay",
      "Expand Medicaid and lower healthcare costs",
      "Protect reproductive rights and bodily autonomy",
      "Invest in renewable energy and environmental protection",
      "Reform criminal justice and reduce mass incarceration",
    ],
  },
  "state senate": {
    R: [
      "Cut property taxes and cap local government spending",
      "Expand school choice and education savings accounts",
      "Strengthen border security partnerships with federal agencies",
      "Protect Second Amendment rights and oppose gun restrictions",
      "Promote energy independence and deregulation",
    ],
    D: [
      "Increase public school funding and teacher compensation",
      "Expand Medicaid and improve healthcare access statewide",
      "Protect voting rights and expand ballot access",
      "Invest in infrastructure and broadband connectivity",
      "Reform the criminal justice system and address inequities",
    ],
  },

  // ── Statewide offices ─────────────────────────────────────────────────────
  governor: {
    R: [
      "Cut taxes and limit state government growth",
      "Secure the border with state resources and partnerships",
      "Expand school choice and education reform",
      "Promote energy independence and deregulation",
      "Strengthen law enforcement and public safety",
    ],
    D: [
      "Expand healthcare access and lower costs for families",
      "Invest in public education and teacher pay",
      "Address climate change and promote clean energy jobs",
      "Reform criminal justice and reduce incarceration",
      "Protect reproductive rights and personal freedoms",
    ],
  },
  "lieutenant governor": {
    R: [
      "Preside over the Senate to advance conservative legislation",
      "Cut property taxes and cap government spending",
      "Expand school choice and protect parental rights",
      "Strengthen border security through state action",
      "Support law enforcement and tough-on-crime policies",
    ],
    D: [
      "Advance legislation for affordable healthcare and housing",
      "Increase public school funding and oppose voucher programs",
      "Protect voting rights and expand ballot access",
      "Reform the criminal justice system",
      "Invest in clean energy and infrastructure jobs",
    ],
  },
  "attorney general": {
    R: [
      "Prosecute cartels and human trafficking at the border",
      "Defend state sovereignty against federal overreach",
      "Protect Second Amendment rights in court",
      "Combat Big Tech censorship and corporate abuse",
      "Uphold election integrity and prosecute voter fraud",
    ],
    D: [
      "Protect consumers from corporate fraud and price gouging",
      "Defend reproductive rights and civil liberties in court",
      "Prosecute environmental polluters and corporate bad actors",
      "Reform civil asset forfeiture and criminal justice practices",
      "Protect voting rights and fight gerrymandering",
    ],
  },
  comptroller: {
    R: [
      "Reduce state spending and eliminate waste",
      "Keep Texas tax-friendly for businesses and families",
      "Increase transparency in state financial reporting",
      "Audit state agencies for efficiency and accountability",
      "Oppose any form of state income tax",
    ],
    D: [
      "Ensure large corporations pay their fair share",
      "Increase transparency in state budget and spending",
      "Invest state funds responsibly for community benefit",
      "Expand programs that support working families",
      "Modernize state financial systems for accountability",
    ],
  },
  "land commissioner": {
    R: [
      "Maximize state land revenue for public schools",
      "Expand oil and gas leasing on state lands",
      "Protect private property rights from federal overreach",
      "Support veterans programs through the Land Office",
      "Streamline permitting for energy development",
    ],
    D: [
      "Protect state lands and coastal resources from degradation",
      "Invest land revenue in public education and conservation",
      "Address climate-driven flooding and coastal erosion",
      "Expand renewable energy leasing on state lands",
      "Strengthen veterans support programs and benefits",
    ],
  },
  "agriculture commissioner": {
    R: [
      "Reduce regulations on Texas farmers and ranchers",
      "Promote Texas agriculture in global export markets",
      "Support rural broadband and infrastructure investment",
      "Protect property rights and water rights for ag producers",
      "Expand school nutrition with Texas-grown products",
    ],
    D: [
      "Support small and family farms against corporate consolidation",
      "Expand access to healthy food in underserved areas",
      "Invest in sustainable farming and water conservation",
      "Increase rural broadband and healthcare access",
      "Strengthen farm worker protections and fair wages",
    ],
  },
  "railroad commissioner": {
    R: [
      "Promote Texas energy production and pipeline expansion",
      "Reduce regulatory burden on oil and gas operators",
      "Ensure safe and efficient energy infrastructure",
      "Protect landowner rights in pipeline disputes",
      "Keep energy costs low for Texas consumers",
    ],
    D: [
      "Strengthen pipeline safety and environmental regulations",
      "Hold energy companies accountable for pollution and spills",
      "Transition to cleaner energy while protecting workers",
      "Protect landowners from eminent domain abuse",
      "Increase transparency in oil and gas industry oversight",
    ],
  },

  // ── City Council ──────────────────────────────────────────────────────────
  "city council": {
    R: [
      "Keep city taxes and fees low for residents",
      "Support police funding and public safety programs",
      "Cut red tape for local businesses and development",
      "Improve roads, water, and basic infrastructure",
      "Maintain transparent and accountable city budgets",
    ],
    D: [
      "Invest in affordable housing and tenant protections",
      "Expand public transit and reduce traffic congestion",
      "Fund community health and social service programs",
      "Promote environmental sustainability and green spaces",
      "Increase police accountability and community oversight",
    ],
  },

  // ── Mayor ─────────────────────────────────────────────────────────────────
  mayor: {
    R: [
      "Reduce city spending and lower property tax rates",
      "Increase police presence and reduce crime",
      "Streamline permitting for business growth and housing",
      "Fix roads and aging infrastructure with existing revenue",
      "Keep government out of the way of economic development",
    ],
    D: [
      "Build more affordable housing across the city",
      "Invest in public transit, sidewalks, and bike infrastructure",
      "Address homelessness with housing-first solutions",
      "Expand parks, libraries, and community services",
      "Promote equitable development and environmental justice",
    ],
  },
};

// ─── Office matching ────────────────────────────────────────────────────────

/**
 * Match a candidate's office title to a policy template key.
 */
function matchOfficeKey(office, officeLevel) {
  if (!office) return null;
  const lower = office.toLowerCase();

  // Exact or near-exact matches first
  if (/county judge/i.test(lower)) return "county judge";
  if (/county sheriff|sheriff/i.test(lower)) return "county sheriff";
  if (/county commission/i.test(lower)) return "county commissioner";
  if (/district attorney/i.test(lower)) return "district attorney";
  if (/county attorney/i.test(lower)) return "county attorney";
  if (/tax assessor|tax collector/i.test(lower)) return "tax assessor";
  if (/county clerk/i.test(lower)) return "county clerk";
  if (/county treasurer|treasurer/i.test(lower)) return "county treasurer";
  if (/\bconstable\b/i.test(lower)) return "constable";
  if (/justice of the peace/i.test(lower)) return "justice of the peace";
  if (/\bgovernor\b/i.test(lower) && !/lieutenant/i.test(lower)) return "governor";
  if (/lieutenant governor/i.test(lower)) return "lieutenant governor";
  if (/attorney general/i.test(lower)) return "attorney general";
  if (/comptroller/i.test(lower)) return "comptroller";
  if (/land commissioner/i.test(lower)) return "land commissioner";
  if (/agriculture commissioner/i.test(lower)) return "agriculture commissioner";
  if (/railroad commissioner/i.test(lower)) return "railroad commissioner";
  if (/u\.?s\.?\s*senate|united states senate/i.test(lower)) return "u.s. senate";
  if (/u\.?s\.?\s*house|united states house|congressional/i.test(lower)) return "u.s. house";
  if (/state senate/i.test(lower)) return "state senate";
  if (/state house|state rep/i.test(lower)) return "state house";
  if (/city council/i.test(lower)) return "city council";
  if (/\bmayor\b/i.test(lower)) return "mayor";

  // Fall back to office_level
  if (officeLevel === "federal") return "u.s. house";
  if (officeLevel === "state") return "state house";
  if (officeLevel === "local") return "county judge"; // most common local
  if (officeLevel === "city") return "city council";

  return null;
}

/**
 * Get office-specific policy bullets for a candidate.
 *
 * @param {object} candidate - Candidate document from MongoDB
 * @returns {string[]} Policy bullets
 */
export function getOfficePolicies(candidate) {
  const key = matchOfficeKey(candidate.office, candidate.office_level);
  if (!key) return [];

  const party = (candidate.party || "").toUpperCase();
  const templates = OFFICE_POLICIES[key];
  if (!templates) return [];

  return templates[party] || templates.R || [];
}

// ─── Batch enrichment ───────────────────────────────────────────────────────

const GENERIC_POLICIES_D = [
  "Expand healthcare access",
  "Climate action & clean energy",
  "Strengthen workers' rights",
  "Public education funding",
  "Protect voting rights",
];
const GENERIC_POLICIES_R = [
  "Lower taxes & reduce spending",
  "Secure the border",
  "Second Amendment protections",
  "Deregulation & energy independence",
  "Law and order & public safety",
];

function isGenericOrEmpty(policies) {
  if (!policies || policies.length === 0) return true;
  const str = JSON.stringify(policies);
  return (
    str === JSON.stringify(GENERIC_POLICIES_D) ||
    str === JSON.stringify(GENERIC_POLICIES_R)
  );
}

/**
 * Enrich a batch of candidates with policies. Writes directly to MongoDB.
 *
 * @param {import('mongodb').Collection} collection - MongoDB candidates collection
 * @param {object} options
 * @param {boolean} [options.scrape=true] - Try Ballotpedia scraping first
 * @param {number} [options.limit=0] - Max candidates to process (0 = all)
 * @param {string} [options.officeLevel] - Filter by office_level
 * @param {function} [options.onProgress] - Progress callback(processed, total, name)
 */
export async function enrichPolicies(
  collection,
  { scrape = true, limit = 0, officeLevel, onProgress } = {},
) {
  // Find candidates that need policies
  const query = {};
  if (officeLevel) query.office_level = officeLevel;

  const candidates = await collection.find(query).toArray();
  const needsEnrichment = candidates.filter((c) =>
    isGenericOrEmpty(c.policies),
  );

  const toProcess = limit ? needsEnrichment.slice(0, limit) : needsEnrichment;
  console.log(
    `[PolicyEnricher] ${toProcess.length} candidates need enrichment (of ${candidates.length} total)`,
  );

  let processed = 0;
  let scraped = 0;
  let templated = 0;
  let failed = 0;

  for (const candidate of toProcess) {
    let policies = [];

    // Tier 1: Try scraping Ballotpedia
    if (scrape && candidate.source_url) {
      try {
        policies = await scrapeBallotpediaPolicies(candidate.source_url);
        if (policies.length > 0) {
          scraped++;
        }
      } catch {
        // scraping failed, fall through to template
      }
    }

    // Tier 2: Office-specific template
    if (policies.length === 0) {
      policies = getOfficePolicies(candidate);
      if (policies.length > 0) {
        templated++;
      } else {
        failed++;
      }
    }

    if (policies.length > 0) {
      await collection.updateOne(
        { _id: candidate._id },
        {
          $set: {
            policies,
            policies_source:
              scraped > processed
                ? "ballotpedia_campaign_themes"
                : "office_party_template",
            policies_updated: new Date(),
          },
        },
      );
    }

    processed++;
    if (onProgress) onProgress(processed, toProcess.length, candidate.name);
    if (processed % 100 === 0) {
      console.log(
        `[PolicyEnricher] Progress: ${processed}/${toProcess.length} (scraped: ${scraped}, templated: ${templated})`,
      );
    }
  }

  console.log(
    `[PolicyEnricher] Done. Scraped: ${scraped}, Templated: ${templated}, Failed: ${failed}`,
  );
  return { processed, scraped, templated, failed };
}

export { OFFICE_POLICIES, matchOfficeKey, isGenericOrEmpty };
