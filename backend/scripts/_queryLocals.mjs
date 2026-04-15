import "dotenv/config";
import { MongoClient } from "mongodb";
const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME);
const coll = db.collection("candidates");

// Check what local candidates exist for The Woodlands / Montgomery County
const locals = await coll.find({
  state: "TX",
  office_level: { $in: ["local", "city"] },
  $or: [
    { jurisdiction: { $regex: /montgomery|woodlands|conroe/i } },
    { office: { $regex: /montgomery|woodlands|conroe/i } },
  ]
}).project({ name: 1, office: 1, jurisdiction: 1, office_level: 1, party: 1 }).toArray();

console.log("Local candidates for Montgomery/Woodlands/Conroe: " + locals.length);
locals.forEach(c => console.log("  [" + c.office_level + "] " + c.name + " — " + c.office + " | " + (c.jurisdiction || "")));

// Check school board for Conroe ISD
const sb = await coll.find({
  state: "TX",
  $or: [
    { office: { $regex: /conroe.*school|conroe.*isd|school.*conroe/i } },
    { jurisdiction: { $regex: /conroe.*school|conroe.*isd/i } },
  ]
}).project({ name: 1, office: 1, jurisdiction: 1 }).toArray();
console.log("\nConroe ISD school board: " + sb.length);
sb.forEach(c => console.log("  " + c.name + " — " + c.office));

// Check mayor / city council for The Woodlands
const twCandidates = await coll.find({
  state: "TX",
  $or: [
    { jurisdiction: { $regex: /woodlands/i } },
    { office: { $regex: /woodlands/i } },
  ]
}).project({ name: 1, office: 1, jurisdiction: 1 }).toArray();
console.log("\nThe Woodlands candidates: " + twCandidates.length);
twCandidates.forEach(c => console.log("  " + c.name + " — " + c.office + " | " + (c.jurisdiction || "")));

await client.close();
