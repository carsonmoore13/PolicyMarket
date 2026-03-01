/**
 * Quick MongoDB Atlas connection test. Run: node scripts/testConnection.js
 * Helps distinguish credential/network issues from TLS/Node issues.
 */
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const uri = process.env.MONGODB_URI;
if (!uri || uri.includes("<") || uri.includes(">")) {
  console.error("Missing or placeholder MONGODB_URI in .env");
  process.exit(1);
}

// Hide password in log
const safeUri = uri.replace(/:[^:@]+@/, ":****@");
console.log("Connecting to:", safeUri);

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("OK: Connected to MongoDB Atlas.");
  } catch (err) {
    console.error("Connection failed:", err.message);
    if (err.message.includes("authentication") || err.message.includes("auth")) {
      console.error("Tip: Check username/password. Encode special chars: ! -> %21, @ -> %40, # -> %23, $ -> %24");
    }
    if (err.message.includes("SSL") || err.message.includes("TLS")) {
      console.error("Tip: In Atlas → Network Access, add 0.0.0.0/0 (Allow from anywhere) to rule out IP blocking.");
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}
run();
