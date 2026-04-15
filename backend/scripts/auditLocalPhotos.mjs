#!/usr/bin/env node
/**
 * auditLocalPhotos.mjs
 *
 * Diagnostic script: checks photo coverage for local TX candidates.
 * Does NOT make any external API calls or modify data.
 */
import "dotenv/config";
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/elections_2026";
const MONGO_DB  = process.env.MONGO_DB_NAME || "elections_2026";

async function main() {
  const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  console.log("Connected to MongoDB\n");

  const db   = client.db(MONGO_DB);
  const coll = db.collection("candidates");

  // ── 1. All local TX candidates ─────────────────────────────────────
  const locals = await coll.find({ state: "TX", office_level: "local" }).toArray();
  console.log(`=== LOCAL TX CANDIDATES: ${locals.length} total ===\n`);

  // ── 2. Photo coverage buckets ──────────────────────────────────────
  let hasUrl       = 0;
  let hasPhotoNoUrl = 0;
  let noPhotoAtAll = 0;
  let placeholderOnly = 0;
  let realPhoto    = 0;

  const bySource     = {};   // source_name → { total, hasUrl, missing }
  const byPhotoSrc   = {};   // photo.source → count
  const missingList  = [];

  for (const c of locals) {
    const url    = c.photo?.url;
    const src    = c.photo?.source;
    const sName  = c.source_name || "(unknown)";

    // Track by source_name
    if (!bySource[sName]) bySource[sName] = { total: 0, hasUrl: 0, missing: 0 };
    bySource[sName].total++;

    if (url && url.length > 0) {
      hasUrl++;
      bySource[sName].hasUrl++;

      // Track photo source breakdown
      const psKey = src || "(no source label)";
      byPhotoSrc[psKey] = (byPhotoSrc[psKey] || 0) + 1;

      if (src === "initials_placeholder") {
        placeholderOnly++;
      } else {
        realPhoto++;
      }
    } else if (c.photo && !url) {
      hasPhotoNoUrl++;
      bySource[sName].missing++;
      missingList.push(c);
    } else {
      noPhotoAtAll++;
      bySource[sName].missing++;
      missingList.push(c);
    }
  }

  // ── 3. Summary ─────────────────────────────────────────────────────
  console.log("── Photo Coverage Summary ──");
  console.log(`  Has photo URL:           ${hasUrl}  (${realPhoto} real, ${placeholderOnly} placeholder)`);
  console.log(`  Has photo obj, no URL:   ${hasPhotoNoUrl}`);
  console.log(`  No photo field at all:   ${noPhotoAtAll}`);
  console.log(`  TOTAL MISSING:           ${hasPhotoNoUrl + noPhotoAtAll}\n`);

  // ── 4. By source_name ──────────────────────────────────────────────
  console.log("── By Source Name ──");
  const sorted = Object.entries(bySource).sort((a, b) => b[1].missing - a[1].missing);
  for (const [name, data] of sorted) {
    const pct = data.total > 0 ? ((data.hasUrl / data.total) * 100).toFixed(0) : "N/A";
    console.log(`  ${name}: ${data.total} total, ${data.hasUrl} with photo, ${data.missing} missing (${pct}% coverage)`);
  }

  // ── 5. By photo.source ─────────────────────────────────────────────
  console.log("\n── Photo Source Breakdown (for those with URLs) ──");
  for (const [src, count] of Object.entries(byPhotoSrc).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${count}`);
  }

  // ── 6. List missing candidates ─────────────────────────────────────
  if (missingList.length > 0) {
    console.log(`\n── Missing Photo List (${missingList.length}) ──`);
    for (const c of missingList) {
      console.log(`  - ${c.name} | ${c.party} | ${c.office} | source: ${c.source_name || "?"} | ballotpedia: ${c.ballotpedia_url || "none"}`);
    }
  }

  // ── 7. Also check: ALL TX candidates (all levels) quick summary ───
  console.log("\n\n=== ALL TX CANDIDATES (quick overview) ===");
  const allTX = await coll.find({ state: "TX" }).toArray();
  const levels = {};
  for (const c of allTX) {
    const lvl = c.office_level || "(unknown)";
    if (!levels[lvl]) levels[lvl] = { total: 0, hasUrl: 0, missing: 0, placeholder: 0 };
    levels[lvl].total++;
    const url = c.photo?.url;
    if (url && url.length > 0) {
      levels[lvl].hasUrl++;
      if (c.photo?.source === "initials_placeholder") levels[lvl].placeholder++;
    } else {
      levels[lvl].missing++;
    }
  }
  for (const [lvl, data] of Object.entries(levels).sort((a, b) => b[1].total - a[1].total)) {
    const pct = data.total > 0 ? ((data.hasUrl / data.total) * 100).toFixed(0) : "N/A";
    console.log(`  ${lvl}: ${data.total} total, ${data.hasUrl} with photo (${data.placeholder} placeholders), ${data.missing} missing — ${pct}% coverage`);
  }

  console.log(`\n  Grand total: ${allTX.length} TX candidates`);

  await client.close();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
