/**
 * add-missing-depts.js
 *
 * Adds any missing departments to the DB without touching
 * students, exams, admins, or any other data.
 *
 * Run: node backend/add-missing-depts.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('./models/Department');

const REQUIRED_DEPARTMENTS = [
  { name: 'Computer Science and Engineering',          code: 'CSE'   },
  { name: 'CSE (AI & ML)',                             code: 'CSAI'  },
  { name: 'CSE (Data Science)',                        code: 'CSDS'  },
  { name: 'Electronics and Communication Engineering', code: 'ECE'   },
  { name: 'Electrical and Electronics Engineering',    code: 'EEE'   },
  { name: 'Mechanical Engineering',                    code: 'MECH'  },
  { name: 'Civil Engineering',                         code: 'CIVIL' },
];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) { console.error('❌ MONGODB_URI not set in .env'); process.exit(1); }

  await mongoose.connect(uri);
  console.log('✅  Connected to MongoDB\n');

  let added = 0, existed = 0;
  for (const dept of REQUIRED_DEPARTMENTS) {
    // Match by code (case-insensitive) OR exact name
    const existing = await Department.findOne({
      $or: [
        { code:  { $regex: new RegExp(`^${dept.code}$`,  'i') } },
        { name:  { $regex: new RegExp(`^${dept.name.replace(/[()&]/g, '\\$&')}$`, 'i') } },
      ],
    });

    if (existing) {
      console.log(`  ✔  Already exists: ${existing.name} (${existing.code})`);
      existed++;
    } else {
      await Department.create({ ...dept, isActive: true });
      console.log(`  ➕ Created: ${dept.name} (${dept.code})`);
      added++;
    }
  }

  console.log(`\nDone — ${added} added, ${existed} already existed.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('❌ Error:', err.message);
  mongoose.disconnect();
  process.exit(1);
});
