import { MongoClient } from 'mongodb';
import { MONGODB_URI, MONGODB_DB_NAME } from './config.js';

let _client = null;

export function getDb() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }
  return _client.db(MONGODB_DB_NAME);
}

export async function connect() {
  if (!_client) {
    _client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }
  await _client.connect();
  return getDb();
}

export async function createIndexes() {
  const db = getDb();
  const candidates = db.collection('candidates');
  const geoCache = db.collection('geo_cache');

  await candidates.createIndex({ name: 1 });
  await candidates.createIndex({ office_level: 1 });
  await candidates.createIndex({ jurisdiction: 1 });
  await candidates.createIndex({ district: 1 });
  await candidates.createIndex(
    { name: 1, office: 1, district: 1 },
    { unique: true }
  );
  await candidates.createIndex({ 'geo.geojson_point': '2dsphere' });
  await geoCache.createIndex({ jurisdiction_key: 1 }, { unique: true });
  console.info('Indexes created on candidates and geo_cache');
}

export async function insertOrUpdateCandidate(candidate) {
  const db = getDb();
  const coll = db.collection('candidates');
  const now = new Date();
  const doc = candidate.toDict();
  const dataHash = doc.data_hash;
  const key = {
    name: candidate.name,
    office: candidate.office,
    district: candidate.district,
  };

  const existing = await coll.findOne(key);
  if (!existing) {
    doc.created_at = now;
    doc.updated_at = now;
    await coll.insertOne(doc);
    return 'inserted';
  }
  if (existing.data_hash !== dataHash) {
    doc.created_at = existing.created_at || now;
    doc.updated_at = now;
    await coll.replaceOne(key, doc);
    return 'updated';
  }
  await coll.updateOne(key, { $set: { last_verified: now } });
  return 'skipped';
}

export async function getOrCreateGeoCache(jurisdictionKey, computeFn) {
  const db = getDb();
  const coll = db.collection('geo_cache');
  const doc = await coll.findOne({ jurisdiction_key: jurisdictionKey });
  if (doc && doc.geo) return doc.geo;

  const result = await Promise.resolve(computeFn());
  const geoDoc = typeof result.toDict === "function" ? result.toDict() : result;
  await coll.updateOne(
    { jurisdiction_key: jurisdictionKey },
    { $set: { jurisdiction_key: jurisdictionKey, geo: geoDoc } },
    { upsert: true }
  );
  return geoDoc;
}
