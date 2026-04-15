import { MongoClient } from "mongodb";
import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "elections_2026";

if (!MONGO_URI) {
    console.error("Missing MONGO_URI in .env");
    process.exit(1);
}

function cleanName(name) {
    let cleaned = name.replace(/\b(Jr\.?|Sr\.?|III|II|IV|Dr\.?|Rev\.?)\b/gi, "");
    cleaned = cleaned.replace(/['".\-]/g, "");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    return cleaned.toLowerCase();
}

async function verifyDomain(url, lastName) {
    try {
        const resp = await axios.get(url, {
            timeout: 5000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            },
            maxRedirects: 3,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // Resolve promises on redirects or 2xx
            }
        });

        if (!resp.data || typeof resp.data !== 'string') return false;

        const html = resp.data.toLowerCase();
        const lName = lastName.toLowerCase();

        // Simple heuristic to differentiate a real campaign site from a parked domain
        // Must contain the candidate's last name AND a common campaign keyword
        if (html.includes(lName) && (html.includes("vote") || html.includes("campaign") || html.includes("elect") || html.includes("texas") || html.includes("district"))) {
            return true;
        }
        return false;
    } catch (err) {
        return false;
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
        office_level: { $in: ["state", "State"] },
        $or: [{ campaign_url: { $exists: false } }, { campaign_url: null }, { campaign_url: "" }],
    }).toArray();

    console.log(`Found ${candidates.length} state candidates without campaign_url. Starting scan...\n`);

    let updated = 0;

    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        const cleaned = cleanName(c.name);
        const parts = cleaned.split(" ");

        if (parts.length < 2) continue;

        const first = parts[0];
        const last = parts[parts.length - 1];

        const domains = [
            `https://${first}${last}.com`,
            `https://${first}${last}fortexas.com`,
            `https://vote${first}${last}.com`,
            `https://${first}${last}tx.com`,
            `https://${last}fortexas.com`
        ];

        let foundUrl = null;

        for (const domain of domains) {
            process.stdout.write(`[${i + 1}/${candidates.length}] ${c.name} -> Checking ${domain}... `);
            const isValid = await verifyDomain(domain, last);
            if (isValid) {
                console.log("✅ FOUND!");
                foundUrl = domain;
                break;
            } else {
                console.log("✗");
            }
        }

        if (foundUrl) {
            await coll.updateOne({ _id: c._id }, { $set: { campaign_url: foundUrl } });
            updated++;
        }
    }

    console.log(`\n── Scan Complete ──`);
    console.log(`Updated: ${updated} candidates.\n`);

    await client.close();
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
