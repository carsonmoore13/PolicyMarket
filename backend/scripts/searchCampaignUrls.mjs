import { MongoClient } from "mongodb";
import * as cheerio from "cheerio";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import axios from "axios";

// Setup environment and DB
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
}

const IGNORE_DOMAINS = [
    "ballotpedia.org",
    "wikipedia.org",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "transparencyusa.org",
    "texastribune.org",
    "texas.gov",
    "house.texas.gov",
    "senate.texas.gov",
    "votesmart.org",
    "justfacts.votesmart.org",
    "opensecrets.org",
    "dallasnews.com",
    "houstonchronicle.com",
    "statesman.com"
];

// Verify if the domain is a campaign site
async function verifyDomain(url, lastName) {
    try {
        const resp = await axios.get(url, {
            timeout: 5000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            },
            maxRedirects: 3,
            validateStatus: (status) => status >= 200 && status < 400
        });

        if (!resp.data || typeof resp.data !== 'string') return false;

        const html = resp.data.toLowerCase();
        const lName = lastName.toLowerCase();

        // Loosened policy: if it includes their last name and basic keywords
        if (html.includes(lName) && (html.includes("vote") || html.includes("campaign") || html.includes("elect") || html.includes("texas") || html.includes("rep") || html.includes("district"))) {
            return true;
        }
        return false;
    } catch (err) {
        return false;
    }
}

// Scrape Bing search results
async function scrapeBingSearch(query) {
    try {
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
        const resp = await axios.get(searchUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            },
            timeout: 10000
        });

        const $ = cheerio.load(resp.data);
        const results = [];

        // Bing typically wraps search results in an h2 -> a
        $("li.b_algo h2 a").each((_, el) => {
            const href = $(el).attr("href");
            if (href && href.startsWith("http")) {
                results.push(href);
            }
        });

        return results;
    } catch (err) {
        console.error("Bing scrape failed:", err.message);
        return [];
    }
}

async function main() {
    const client = new MongoClient(MONGO_URI, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 5,
    });
    await client.connect();
    console.log("Connected to MongoDB");

    const db = client.db(MONGO_DB_NAME);
    const coll = db.collection("candidates");

    const candidates = await coll.find({
        office_level: { $in: ["state", "State", "federal", "Federal"] },
        $or: [{ campaign_url: { $exists: false } }, { campaign_url: null }, { campaign_url: "" }],
    }).toArray();

    console.log(`Found ${candidates.length} candidates missing campaign_url. Starting Bing search scan...\n`);

    let updated = 0;

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const parts = c.name.split(" ");
        const last = parts[parts.length - 1];

        process.stdout.write(`[${i + 1}/${candidates.length}] Searching for ${c.name}... `);

        try {
            const query = `"${c.name}" Texas ${c.office_level} campaign website 2026`;
            const searchResults = await scrapeBingSearch(query);

            let foundUrl = null;

            for (const resUrl of searchResults) {
                try {
                    const urlObj = new URL(resUrl);
                    const rootDomain = urlObj.hostname.replace('www.', '').toLowerCase();

                    let ignored = false;
                    for (const ign of IGNORE_DOMAINS) {
                        if (rootDomain.includes(ign)) {
                            ignored = true;
                            break;
                        }
                    }
                    if (ignored) continue;

                    // Found a plausible personal domain. Verifying it...
                    const isValid = await verifyDomain(resUrl, last);
                    if (isValid) {
                        foundUrl = resUrl.split('?')[0]; // Strip tracking params
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (foundUrl) {
                console.log(`✅ FOUND: ${foundUrl}`);
                await coll.updateOne({ _id: c._id }, { $set: { campaign_url: foundUrl } });
                updated++;
            } else {
                console.log(`✗ No valid campaign website found on Page 1.`);
            }

        } catch (err) {
            console.log(`✗ Error: ${err.message}`);
        }

        // Be polite to Bing
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n── Search Scan Complete ──`);
    console.log(`Successfully found and updated: ${updated} candidates.\n`);

    await client.close();
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
