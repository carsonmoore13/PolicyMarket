import { MongoClient } from "mongodb";
import { MONGO_URI, MONGO_DB_NAME } from "./config.js";

let client;
let db;

async function ensureIndexes() {
  const database = getDB();
  const candidates = database.collection("candidates");
  const zipCache = database.collection("zip_district_cache");
  const apiCache = database.collection("api_cache");

  await candidates.createIndex({ zip_codes: 1 });
  await candidates.createIndex({ "photo.source": 1 });
  await candidates.createIndex({ "photo.verified": 1 });
  await candidates.createIndex({ "district_zip_map.zip_codes": 1 });

  // address_key is the primary lookup key (replaces the old zip_code index)
  await zipCache.createIndex({ address_key: 1 }, { unique: true, sparse: true });
  await zipCache.createIndex(
    { cached_at: 1 },
    { expireAfterSeconds: 30 * 24 * 60 * 60 },
  );
  // Drop legacy zip_code unique index if it still exists (ignore errors)
  zipCache.dropIndex("zip_code_1").catch(() => {});

  // api_cache uses address_key too — drop legacy zip index if present
  await apiCache.createIndex({ address_key: 1 }, { unique: true, sparse: true });
  apiCache.dropIndex("zip_1").catch(() => {});
  await apiCache.createIndex(
    { cached_at: 1 },
    { expireAfterSeconds: 24 * 60 * 60 },
  );
}

export async function connectDB() {
  if (db) return db;
  client = new MongoClient(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 10,
  });
  await client.connect();
  const hostMatch = MONGO_URI.match(/@([^/]+?)(?:\/|\?|$)/);
  const host = hostMatch ? hostMatch[1] : "unknown";
  console.log("Connected to MongoDB Atlas host:", host);
  db = client.db(MONGO_DB_NAME);
  await ensureIndexes();
  return db;
}

export function getDB() {
  if (!db) {
    throw new Error("Database not connected. Call connectDB() first.");
  }
  return db;
}

export function getCandidatesCollection() {
  return getDB().collection("candidates");
}

export function getZipDistrictCacheCollection() {
  return getDB().collection("zip_district_cache");
}

export function getApiCacheCollection() {
  return getDB().collection("api_cache");
}

