/**
 * cleanupJunkCandidates.mjs
 *
 * Finds and removes candidate records that are clearly NOT real people.
 * Detects: navigation/page elements, HTML/URLs, generic labels, single-word
 * names, names starting with numbers, overly long strings, etc.
 *
 * Also normalises names with unicode smart-quote nicknames (e.g.
 *   Gavino \u201cgavin\u201d Carrasco  ->  Gavino "Gavin" Carrasco
 * ) — these are real people but the name field needs fixing.
 *
 * Clears api_cache after any changes so stale data is not served.
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

// ── helpers ─────────────────────────────────────────────────────────────────

/** Return a reason string if the name looks like junk, or null if it's fine. */
function detectJunk(name) {
  if (!name || typeof name !== 'string') return 'empty or non-string name';
  const n = name.trim();

  // Too short (< 4 characters)
  if (n.length < 4) return `too short (${n.length} chars)`;

  // Starts with a digit
  if (/^\d/.test(n)) return 'starts with a number';

  // Contains URLs
  if (/https?:\/\/|www\./i.test(n)) return 'contains URL';

  // Contains HTML tags
  if (/<[^>]+>/.test(n)) return 'contains HTML';

  // Contains newlines, tabs, or other control characters
  if (/[\n\r\t]/.test(n)) return 'contains control characters';

  // ── Navigation / page-element phrases ────────────────────────────────
  const navPatterns = [
    /online\s+council/i,
    /staff\s+memo/i,
    /watch\s+video/i,
    /message\s+board/i,
    /council\s+meeting/i,
    /\bagenda\b/i,
    /\bminutes\b/i,
    /click\s+here/i,
    /read\s+more/i,
    /learn\s+more/i,
    /view\s+all/i,
    /sign\s+up/i,
    /\bsubscribe\b/i,
    /\bnewsletter\b/i,
    /contact\s+us/i,
    /privacy\s+policy/i,
    /terms\s+of\s+service/i,
    /\bATXN\b/,
    /filing\s+notice/i,
    /\bbulletin\b/i,
    /\barchive\b/i,
    /\bapplication\s+form/i,
    /\bschedule\s+of\b/i,
    /\bdirectory\b/i,
    /election\s+results?/i,
    /voter\s+registration/i,
    /\bdownload\b/i,
  ];
  for (const pat of navPatterns) {
    if (pat.test(n)) return `navigation / page element ("${n}")`;
  }

  // ── Generic positional labels ────────────────────────────────────────
  const labelPatterns = [
    /^position\s*\d/i,
    /^place\s*\d/i,
    /^at[\s-]?large$/i,
    /^seat\s*\d/i,
    /^seat\s*[a-z]$/i,
    /^district\s*\d/i,
    /^ward\s*\d/i,
    /^precinct\s*\d/i,
    /^group\s*\d/i,
    /^unexpired/i,
    /^vacant$/i,
    /^none$/i,
    /^n\/a$/i,
    /^tbd$/i,
    /^unknown$/i,
    /^write[\s-]?in$/i,
  ];
  for (const pat of labelPatterns) {
    if (pat.test(n)) return `generic label ("${n}")`;
  }

  // ── Way too long — likely a sentence, not a name ─────────────────────
  if (n.length > 60) return `too long (${n.length} chars)`;

  // ── Single-word name (not "Firstname Lastname") ──────────────────────
  const words = n.split(/\s+/).filter(w => w.length > 0);
  if (words.length < 2) return `single-word name ("${n}")`;

  // ── All uppercase or all lowercase (> 5 chars) ───────────────────────
  if (n.length > 5 && n === n.toUpperCase()) return `all uppercase ("${n}")`;
  if (n.length > 5 && n === n.toLowerCase()) return `all lowercase ("${n}")`;

  return null; // looks fine
}

/**
 * Return a cleaned version of the name if fixable, or null if no fix needed.
 * Currently handles unicode smart quotes around nicknames.
 */
function fixableName(name) {
  if (!name) return null;
  let fixed = name;

  // Replace smart quotes (\u201c / \u201d) with regular quotes
  fixed = fixed.replace(/[\u201c\u201d]/g, '"');

  // Collapse multiple spaces
  fixed = fixed.replace(/\s{2,}/g, ' ').trim();

  // Capitalise words inside quotes (nicknames)
  fixed = fixed.replace(/"([a-z])([^"]*?)"/gi, (_, first, rest) => {
    return `"${first.toUpperCase()}${rest}"`;
  });

  return fixed !== name ? fixed : null;
}

// ── main ────────────────────────────────────────────────────────────────────

const client = await MongoClient.connect(process.env.MONGO_URI);
const db = client.db(process.env.MONGO_DB_NAME);
const coll = db.collection('candidates');

const all = await coll.find({ state: 'TX' }).toArray();
console.log(`Total TX candidates in DB: ${all.length}\n`);

// ---- Phase 1: Flag junk records for deletion ----------------------------

const toDelete = [];
const toFix = [];

for (const c of all) {
  const reason = detectJunk(c.name);
  if (reason) {
    toDelete.push({ id: c._id, name: c.name, office: c.office, level: c.office_level, reason });
  } else {
    // Check if name can be fixed (smart quotes, etc.)
    const fixed = fixableName(c.name);
    if (fixed) {
      toFix.push({ id: c._id, oldName: c.name, newName: fixed });
    }
  }
}

// ---- Report junk --------------------------------------------------------

if (toDelete.length > 0) {
  console.log('=== JUNK RECORDS TO DELETE ===');
  for (const r of toDelete) {
    console.log(`  [${r.level}] "${r.name}"  ->  ${r.office}`);
    console.log(`           Reason: ${r.reason}`);
  }
  console.log(`\nDeleting ${toDelete.length} junk record(s)...`);
  const deleteResult = await coll.deleteMany({ _id: { $in: toDelete.map(r => r.id) } });
  console.log(`Deleted: ${deleteResult.deletedCount} record(s)\n`);
} else {
  console.log('No junk records found — database is clean.\n');
}

// ---- Phase 2: Fix names with formatting issues --------------------------

if (toFix.length > 0) {
  console.log('=== NAME FIXES (smart quotes / spacing) ===');
  for (const r of toFix) {
    console.log(`  "${r.oldName}"  ->  "${r.newName}"`);
    await coll.updateOne({ _id: r.id }, { $set: { name: r.newName } });
  }
  console.log(`Fixed ${toFix.length} name(s)\n`);
} else {
  console.log('No name formatting fixes needed.\n');
}

// ---- Phase 3: Clear api_cache -------------------------------------------

const anyChanges = toDelete.length > 0 || toFix.length > 0;
if (anyChanges) {
  const cacheResult = await db.collection('api_cache').deleteMany({});
  console.log(`Cleared api_cache: ${cacheResult.deletedCount} entries`);
}

// ---- Final counts -------------------------------------------------------

const pipeline = [
  { $match: { state: 'TX' } },
  { $group: { _id: '$office_level', count: { $sum: 1 } } },
  { $sort: { _id: 1 } },
];
const counts = await coll.aggregate(pipeline).toArray();
const total = counts.reduce((sum, r) => sum + r.count, 0);

console.log('\n=== FINAL COUNTS BY OFFICE LEVEL ===');
for (const r of counts) {
  console.log(`  ${r._id}: ${r.count}`);
}
console.log(`  TOTAL: ${total}`);

await client.close();
console.log('\nDone.');
