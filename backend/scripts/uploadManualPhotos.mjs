/**
 * uploadManualPhotos.mjs
 *
 * Manually upload headshots for candidates where automated scrapers failed
 * but we found photos via web search on campaign sites / news articles.
 */

import dotenv from "dotenv";
dotenv.config();

import { connectDB, getCandidatesCollection } from "../db.js";
import { normaliseImage, updateCandidatePhoto } from "../services/candidateImageService.js";
import { uploadCandidateImage } from "../services/s3Service.js";
import { downloadImageBuffer } from "../utils/imageScraper.js";

// Manual photo mappings: candidate name → photo URL + source label
const MANUAL_PHOTOS = [
  {
    name: "Pooja Sethi",
    photoUrl: "https://images.squarespace-cdn.com/content/v1/6813097b22fce2334c9dddfb/7818c9d6-7dbc-4454-bea1-a28ea1d89ee3/PoojaHS-167.jpg",
    sourceLabel: "campaign_website",
  },
  {
    name: "Kristian Carranza",
    photoUrl: "https://i0.wp.com/sanantonioreport.org/wp-content/uploads/2026/01/kristian-carranza.png?fit=392%2C390&ssl=1",
    sourceLabel: "san_antonio_report",
  },
  {
    name: "Heli Rodriguez Prilliman",
    photoUrl: "https://i0.wp.com/fortworthreport.org/wp-content/uploads/2026/02/candidatesurveyHeli-Rodriguez-Prilliman.jpg?fit=1080%2C1080&quality=89&ssl=1",
    sourceLabel: "fort_worth_report",
  },
  {
    name: "Ben Mostyn",
    photoUrl: "https://i0.wp.com/sanantonioreport.org/wp-content/uploads/2024/09/ben-mostyn.png?fit=350%2C443&ssl=1",
    sourceLabel: "san_antonio_report",
  },
  {
    name: "Julie Dahlberg",
    photoUrl: "https://i0.wp.com/sanantonioreport.org/wp-content/uploads/2025/12/julie-dahlberg.png?fit=1330%2C1260&ssl=1",
    sourceLabel: "san_antonio_report",
  },
  {
    name: "Caitlin Rourk",
    photoUrl: "https://cloudfront-us-east-1.images.arcpublishing.com/gray/2UJT3B4SGFAO3KC7DAK3Z5ZGIQ.jpg",
    sourceLabel: "kbtx_news",
  },
];

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log(" PolicyMarket — Manual Photo Upload");
  console.log(`  Candidates: ${MANUAL_PHOTOS.length}`);
  console.log("═══════════════════════════════════════════════════════\n");

  await connectDB();
  const coll = getCandidatesCollection();

  let uploaded = 0;
  let failed = 0;

  for (const entry of MANUAL_PHOTOS) {
    console.log(`Processing: ${entry.name} (${entry.office})`);

    // Find the candidate in MongoDB — match by name (may have multiple records)
    const candidates = await coll.find({
      name: entry.name,
      state: "TX",
    }).toArray();

    if (!candidates.length) {
      console.log(`  ✗ Not found in DB, skipping`);
      failed++;
      continue;
    }

    // Download image
    const buffer = await downloadImageBuffer(entry.photoUrl);
    if (!buffer) {
      console.log(`  ✗ Download failed: ${entry.photoUrl}`);
      failed++;
      continue;
    }

    console.log(`  Downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);

    // Normalize
    let jpeg;
    try {
      jpeg = await normaliseImage(buffer);
      console.log(`  Normalised: ${(jpeg.length / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.log(`  ✗ Normalise failed: ${err.message}`);
      failed++;
      continue;
    }

    // Upload for each matching candidate record (some candidates appear in multiple collections)
    for (const candidate of candidates) {
      const id = candidate._id.toString();
      const state = "texas";

      try {
        const s3Url = await uploadCandidateImage(id, jpeg, state);
        await updateCandidatePhoto(id, s3Url, entry.photoUrl, entry.sourceLabel);
        console.log(`  ✓ ${candidate.name} (${candidate.office || "?"}) → ${s3Url}`);
        uploaded++;
      } catch (err) {
        console.log(`  ✗ Upload failed for ${id}: ${err.message}`);
        failed++;
      }
    }

    console.log();
  }

  console.log("═══════════════════════════════════════════════════════");
  console.log(` Done: ${uploaded} uploaded, ${failed} failed`);
  console.log("═══════════════════════════════════════════════════════");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
