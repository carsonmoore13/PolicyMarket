import { MongoClient } from "mongodb";
import { MONGO_URI, MONGO_DB_NAME } from "./config.js";

let client;
let db;

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

