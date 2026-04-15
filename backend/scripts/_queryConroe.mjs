import "dotenv/config";
import { MongoClient } from "mongodb";
const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME);
const coll = db.collection("candidates");

// Broader search for Conroe ISD
const conroe = await coll.find({
  state: "TX",
  $or: [
    { office: /conroe/i },
    { jurisdiction: /conroe/i },
  ]
}).project({ name: 1, office: 1, jurisdiction: 1, office_level: 1 }).toArray();
console.log("Conroe matches:", conroe.length);
conroe.forEach(c => console.log("  " + c.name + " — " + c.office + " [" + c.office_level + "] | " + (c.jurisdiction || "")));

// Check Woodlands Township
const tw = await coll.find({
  state: "TX",
  $or: [
    { office: /woodlands|township/i },
    { jurisdiction: /woodlands|township/i },
  ]
}).project({ name: 1, office: 1, jurisdiction: 1 }).toArray();
console.log("\nTownship/Woodlands matches:", tw.length);
tw.forEach(c => console.log("  " + c.name + " — " + c.office + " | " + (c.jurisdiction || "")));

await client.close();
