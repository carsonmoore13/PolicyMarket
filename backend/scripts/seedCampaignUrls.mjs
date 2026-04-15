/**
 * seedCampaignUrls.mjs
 *
 * Iterates all state & federal candidates that have a Ballotpedia source_url
 * but no campaign_url yet, scrapes their Ballotpedia page, and stores the
 * campaign website URL in the database.
 *
 * Usage:  node backend/scripts/seedCampaignUrls.mjs
 */

import { MongoClient } from "mongodb";
import axios from "axios";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load .env from the backend directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
}

/** Extract campaign website URL from a Ballotpedia page (same logic as the route). */
function scrapeCampaignUrl(html) {
    const $ = cheerio.load(html);
    let campaignUrl = null;

    // Ballotpedia infobox: look for "Campaign website" or "Website" label
    $(".infobox a, .widget-row a, .votebox-header-election-type a").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim().toLowerCase();
        if (
            (text.includes("campaign website") || text.includes("campaign site")) &&
            href.startsWith("http")
        ) {
            campaignUrl = href;
        }
    });

    // Fallback: look for external links labeled "Official website" or "Campaign website"
    if (!campaignUrl) {
        $("a[href]").each((_, el) => {
            const text = $(el).text().trim().toLowerCase();
            const href = $(el).attr("href") || "";
            if (
                (text === "campaign website" || text === "official website" || text === "website") &&
                href.startsWith("http") &&
                !href.includes("ballotpedia.org") &&
                !href.includes("wikipedia.org")
            ) {
                campaignUrl = href;
            }
        });
    }

    return campaignUrl;
}

/** Delay helper to be polite to Ballotpedia. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 5,
    });
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(MONGO_DB_NAME);
    const coll = db.collection("candidates");

    // Find state & federal candidates that have a Ballotpedia URL but no campaign_url yet
    const candidates = await coll
        .find({
            office_level: { $in: ["federal", "state", "Federal", "State"] },
            source_url: { $exists: true, $ne: null },
            $or: [
                { campaign_url: { $exists: false } },
                { campaign_url: null },
                { campaign_url: "" },
            ],
        })
        .toArray();

    console.log(`\nFound ${candidates.length} state/federal candidates without campaign_url\n`);

    let updated = 0;
    let failed = 0;
    let noUrl = 0;

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const label = `[${i + 1}/${candidates.length}] ${c.name} (${c.office_level})`;

        if (!c.source_url) {
            console.log(`${label} — no source_url, skipping`);
            continue;
        }

        try {
            const resp = await axios.get(c.source_url, {
                timeout: 12000,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; PolicyMarket/1.0; +https://policymarket.app)",
                    Accept: "text/html",
                },
                responseType: "text",
            });

            const campaignUrl = scrapeCampaignUrl(resp.data);

            if (campaignUrl) {
                await coll.updateOne(
                    { _id: c._id },
                    { $set: { campaign_url: campaignUrl } }
                );
                updated++;
                console.log(`${label} ✓  ${campaignUrl}`);
            } else {
                noUrl++;
                console.log(`${label} —  no campaign URL found on Ballotpedia page`);
            }
        } catch (err) {
            failed++;
            console.log(`${label} ✗  fetch error: ${err.message}`);
        }

        // Be polite: 800ms delay between requests
        await sleep(800);
    }

    console.log(`\n── Done ──`);
    console.log(`  Updated: ${updated}`);
    console.log(`  No URL found: ${noUrl}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total processed: ${candidates.length}`);

    await client.close();
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
