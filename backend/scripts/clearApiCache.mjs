import dotenv from "dotenv";
dotenv.config();
import { connectDB, getApiCacheCollection } from "../db.js";

await connectDB();
const cache = getApiCacheCollection();
const result = await cache.deleteMany({});
console.log(`Cleared ${result.deletedCount} API cache entries.`);
process.exit(0);
