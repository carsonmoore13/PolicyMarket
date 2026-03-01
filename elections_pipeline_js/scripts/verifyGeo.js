import { connect, getDb } from "../db.js";
import { getJurisdictionCentroid } from "../geo/index.js";

async function main() {
  await connect();
  const db = getDb();
  const coll = db.collection("candidates");
  const cursor = coll.find({
    $or: [{ geo: null }, { "geo.lat": null }, { geo: { $exists: false } }],
  });
  let fixed = 0;
  let failed = 0;
  for await (const doc of cursor) {
    const officeLevel = doc.office_level || "state";
    const jurisdiction = doc.jurisdiction || "Texas";
    const district = doc.district;
    try {
      const geo = await getJurisdictionCentroid(officeLevel, jurisdiction, district);
      if (geo && geo.lat != null && geo.lng != null) {
        await coll.updateOne(
          { _id: doc._id },
          { $set: { geo: geo.toDict(), updated_at: new Date() } }
        );
        fixed += 1;
      } else {
        failed += 1;
      }
    } catch (err) {
      console.warn("Re-geocode failed for", doc.name, err.message);
      failed += 1;
    }
  }
  console.info("Verify geo: fixed=" + fixed + " still_failed=" + failed);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
