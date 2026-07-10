/**
 * cleanup-fake-dept.js
 *
 * One-time migration script to:
 *  1. Find the fake "CSE / C0" department created by the CSV importer auto-create bug.
 *  2. Re-point all students linked to it to the real CSE department.
 *  3. Re-point all exams linked to it to the real CSE department.
 *  4. Delete the fake department record.
 *
 * Run with:  node backend/cleanup-fake-dept.js
 *
 * Safe to run multiple times — it is idempotent.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('❌  MONGO_URI not set in .env');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('✅  Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ── 1. Find the fake department ──────────────────────────────────────────
  const fakeDept = await db.collection('departments').findOne({
    $or: [
      { code: { $regex: /^C0$/i } },
      { $and: [{ name: { $regex: /^cse$/i } }, { code: { $not: /^cse$/i } }] },
    ],
  });

  if (!fakeDept) {
    console.log('ℹ️   No fake department found. Nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found fake department:`);
  console.log(`  _id  : ${fakeDept._id}`);
  console.log(`  name : ${fakeDept.name}`);
  console.log(`  code : ${fakeDept.code}`);

  // ── 2. Find the REAL CSE department ─────────────────────────────────────
  const realDept = await db.collection('departments').findOne({
    $and: [
      { $or: [{ name: { $regex: /computer science/i } }, { code: { $regex: /^cse$/i } }] },
      { _id: { $ne: fakeDept._id } },
    ],
  });

  if (!realDept) {
    console.error('❌  Real CSE department not found. Please create it manually first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`\nReal department to merge into:`);
  console.log(`  _id  : ${realDept._id}`);
  console.log(`  name : ${realDept.name}`);
  console.log(`  code : ${realDept.code}`);

  // ── 3. Re-point students ────────────────────────────────────────────────
  const studentsResult = await db.collection('students').updateMany(
    { department: fakeDept._id },
    { $set: { department: realDept._id } }
  );
  console.log(`\n📚  Students re-pointed: ${studentsResult.modifiedCount}`);

  // ── 4. Re-point exams ───────────────────────────────────────────────────
  const examsResult = await db.collection('exams').updateMany(
    { department: fakeDept._id },
    { $set: { department: realDept._id } }
  );
  console.log(`📝  Exams re-pointed   : ${examsResult.modifiedCount}`);

  // ── 5. Delete fake department ────────────────────────────────────────────
  await db.collection('departments').deleteOne({ _id: fakeDept._id });
  console.log(`🗑️   Fake department deleted: ${fakeDept._id}`);

  console.log('\n✅  Cleanup complete. All records now point to the real department.\n');
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌  Script error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
