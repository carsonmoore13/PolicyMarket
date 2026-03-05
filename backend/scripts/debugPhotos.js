// Quick debug helper to inspect photo fields in the local MongoDB.
// Usage:
//   node backend/scripts/debugPhotos.js
//   node backend/scripts/debugPhotos.js 78705

import { MongoClient } from "mongodb";
import { MONGO_URI, MONGO_DB_NAME } from "../config.js";

async function main() {
  const zipFilter = process.argv[2] || null;
  const client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  const coll = db.collection("candidates");

  const match = {};
  if (zipFilter) {
    match.zip_codes = zipFilter;
  }

  const sample = await coll
    .find(
      {
        ...match,
        "photo.url": { $exists: true },
      },
      { projection: { name: 1, office: 1, "photo.url": 1, "photo.source": 1 } },
    )
    .limit(5)
    .toArray();

  const counts = await coll
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            hasPhoto: {
              $cond: [{ $ifNull: ["$photo.url", null] }, true, false],
            },
          },
          c: { $sum: 1 },
        },
      },
    ])
    .toArray();

  console.log("photoUrl counts", counts);
  console.log("sample with photo:", sample);

  await client.close();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

