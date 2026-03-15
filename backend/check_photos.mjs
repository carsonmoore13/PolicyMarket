import dotenv from 'dotenv';
dotenv.config();

import { connectDB, getCandidatesCollection } from './db.js';

async function check() {
    await connectDB();
    const coll = getCandidatesCollection();
    const total = await coll.countDocuments();
    const withPhoto = await coll.countDocuments({ "photo.url": { $exists: true, $ne: null } });
    console.log(`Total Candidates: ${total}`);
    console.log(`Candidates with photo.url: ${withPhoto}`);

    if (withPhoto > 0) {
        const sample = await coll.findOne({ "photo.url": { $exists: true, $ne: null } });
        console.log("Sample photo:", sample.photo);
    } else {
        const sample = await coll.findOne();
        console.log("Sample candidate photo field (if any):", sample?.photo);
    }
    process.exit(0);
}
check().catch(console.error);
