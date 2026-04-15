/**
 * One-time DB cleanup: remove duplicate local candidates that appear from
 * multiple sources with different office title formatting.
 *
 * Groups by normalized name + jurisdiction, scores each record, keeps the best,
 * deletes the rest.
 */
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';

function normalizeNameForDedup(name) {
  let n = (name || '').trim().toLowerCase();
  n = n.replace(/[.,]/g, '');
  n = n.replace(/\s+(jr|sr|ii|iii|iv|v)\s*$/i, '');
  return n.replace(/\s+/g, ' ').trim();
}

function scoreCandidateRecord(c) {
  let score = 0;
  if (c.photo?.url) score += 10;
  if (c.source_url) score += 5;
  if (c.policies?.length) score += 3;
  if (c.district) score += 2;
  const src = (c.source_name || '').toLowerCase();
  if (src.includes('secretary of state')) score += 1;
  else if (src === 'ballotpedia') score += 2;
  return score;
}

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME);
const coll = db.collection('candidates');

const locals = await coll.find({ state: 'TX', office_level: 'local' }).toArray();
console.log(`Total local TX candidates in DB: ${locals.length}`);

// Group by normalized name + jurisdiction
const groups = new Map();
for (const c of locals) {
  const key = normalizeNameForDedup(c.name) + '|' + (c.jurisdiction || '').toLowerCase().trim();
  if (groups.get(key) === undefined) groups.set(key, []);
  groups.get(key).push(c);
}

const toDelete = [];
for (const [, group] of groups) {
  if (group.length <= 1) continue;
  // Sort by score descending — keep first, delete rest
  group.sort((a, b) => scoreCandidateRecord(b) - scoreCandidateRecord(a));
  for (let i = 1; i < group.length; i++) {
    toDelete.push(group[i]._id);
  }
}

console.log(`Duplicate groups found: ${groups.size - [...groups.values()].filter(g => g.length <= 1).length}`);
console.log(`Records to delete: ${toDelete.length}`);

if (toDelete.length > 0) {
  const result = await coll.deleteMany({ _id: { $in: toDelete } });
  console.log(`Deleted: ${result.deletedCount} duplicate records`);
}

const remaining = await coll.countDocuments({ state: 'TX', office_level: 'local' });
console.log(`Remaining local TX candidates: ${remaining}`);

// Also clear api_cache so fresh data is served
const cacheResult = await db.collection('api_cache').deleteMany({});
console.log(`Cleared api_cache: ${cacheResult.deletedCount} entries`);

await client.close();
console.log('Done.');
