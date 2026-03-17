/**
 * fetchLocalPhotos.mjs — Fetch headshot photos for local/city candidates
 * from Ballotpedia and Wikipedia.
 *
 * Usage: node scripts/fetchLocalPhotos.mjs
 */

import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1") });

import { connectDB, getCandidatesCollection } from "../db.js";
import {
  fetchBallotpediaPhotoUrl,
  fetchWikipediaPhotoUrl,
  downloadImageBuffer,
} from "../utils/imageScraper.js";

function slugify(name) {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_À-ÿ]/g, "");
}

async function main() {
  await connectDB();
  const coll = getCandidatesCollection();

  const locals = await coll
    .find({ office_level: "city", "photo.url": null })
    .toArray();

  console.log(`Local candidates needing photos: ${locals.length}\n`);

  let found = 0;
  for (const c of locals) {
    const slug = slugify(c.name);

    // Try Ballotpedia first
    let url = await fetchBallotpediaPhotoUrl(slug);
    if (url) {
      const buf = await downloadImageBuffer(url);
      if (buf) {
        await coll.updateOne(
          { _id: c._id },
          {
            $set: {
              "photo.url": url,
              "photo.source": "ballotpedia",
              "photo.verified": false,
              "photo.last_fetched": new Date(),
            },
          },
        );
        console.log(`  BP ✓ ${c.name}`);
        found++;
        continue;
      }
    }

    // Try Wikipedia
    url = await fetchWikipediaPhotoUrl(c.name);
    if (url) {
      const buf = await downloadImageBuffer(url);
      if (buf) {
        await coll.updateOne(
          { _id: c._id },
          {
            $set: {
              "photo.url": url,
              "photo.source": "wikipedia",
              "photo.verified": false,
              "photo.last_fetched": new Date(),
            },
          },
        );
        console.log(`  WP ✓ ${c.name}`);
        found++;
        continue;
      }
    }

    console.log(`  ✗ ${c.name} — no photo found`);
  }

  console.log(`\nPhotos found: ${found} / ${locals.length}`);
  process.exit(0);
}

main();
