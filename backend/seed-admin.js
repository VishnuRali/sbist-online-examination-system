/**
 * SBIT Exam System — Database Cleanup & Full Seed Script
 *
 * This script:
 * 1. Drops ALL collections (Students, Admins, Exams, Questions, Results,
 *    EmailLogs, Departments, Subjects, Settings, Sessions)
 * 2. Seeds the 7 required departments using EXACT names from Google Form
 * 3. Creates the Super Admin account with the specified credentials
 * 4. Verifies the Admin password hash works before exiting
 *
 * Run: node seed-admin.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

// ── Departments: EXACT names as they appear in the Google Form dropdown ──────
const DEPARTMENTS = [
  { name: 'Computer Science and Engineering',        code: 'CSE'   },
  { name: 'CSE (AI & ML)',                           code: 'CSAI'  },
  { name: 'CSE (Data Science)',                      code: 'CSDS'  },
  { name: 'Electronics and Communication Engineering', code: 'ECE' },
  { name: 'Electrical and Electronics Engineering',  code: 'EEE'   },
  { name: 'Mechanical Engineering',                  code: 'MECH'  },
  { name: 'Civil Engineering',                       code: 'CIVIL' },
];

const seed = async () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SBIT Online Examination System — Full DB Reset');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🔌 Connecting to MongoDB...');

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');
  console.log('');

  // ── Load models ──────────────────────────────────────────
  const Admin      = require('./models/Admin');
  const Student    = require('./models/Student');
  const Exam       = require('./models/Exam');
  const Question   = require('./models/Question');
  const Result     = require('./models/Result');
  const Department = require('./models/Department');
  const Subject    = require('./models/Subject');
  let EmailLog, Settings;
  try { EmailLog = require('./models/EmailLog'); } catch(e) { EmailLog = null; }
  try { Settings = require('./models/Settings'); } catch(e) { Settings = null; }

  // ── 1. WIPE ALL COLLECTIONS ───────────────────────────────
  console.log('🗑️  Wiping all collections...');
  const [
    delStudents, delAdmins, delExams, delQuestions,
    delResults, delDepts, delSubjects
  ] = await Promise.all([
    Student.deleteMany({}),
    Admin.deleteMany({}),
    Exam.deleteMany({}),
    Question.deleteMany({}),
    Result.deleteMany({}),
    Department.deleteMany({}),
    Subject.deleteMany({}),
  ]);
  if (EmailLog) await EmailLog.deleteMany({});
  // Preserve Settings configuration so SMTP settings are not lost
  console.log('   ✓ settings collection preserved');

  // Also drop sessions collection if it exists
  try {
    const db = mongoose.connection.db;
    const colls = await db.listCollections({ name: 'sessions' }).toArray();
    if (colls.length) await db.collection('sessions').deleteMany({});
  } catch(e) { /* ignore */ }

  // Drop any other stray collections (notifications, google form imports etc.)
  try {
    const db = mongoose.connection.db;
    const allColls = await db.listCollections().toArray();
    const extraNames = allColls
      .map(c => c.name)
      .filter(n => !['students','admins','exams','questions','results','departments','subjects','emaillogs','settings','sessions'].includes(n.toLowerCase()));
    for (const name of extraNames) {
      await db.collection(name).deleteMany({});
      console.log(`   ✓ Cleared extra collection: ${name}`);
    }
  } catch(e) { /* ignore */ }

  console.log(`   ✓ ${delStudents.deletedCount} students`);
  console.log(`   ✓ ${delAdmins.deletedCount} admins`);
  console.log(`   ✓ ${delExams.deletedCount} exams`);
  console.log(`   ✓ ${delQuestions.deletedCount} questions`);
  console.log(`   ✓ ${delResults.deletedCount} results`);
  console.log(`   ✓ ${delDepts.deletedCount} departments`);
  console.log(`   ✓ ${delSubjects.deletedCount} subjects`);
  console.log('   ✓ email logs, settings, sessions cleared');
  console.log('');

  // ── 2. SEED DEPARTMENTS ───────────────────────────────────
  console.log('🏛️  Seeding departments (full names matching Google Form)...');
  const createdDepts = await Department.insertMany(
    DEPARTMENTS.map(d => ({ ...d, isActive: true }))
  );
  createdDepts.forEach(d => console.log(`   ✓ ${d.name} (${d.code})`));
  console.log('');

  // ── 3. CREATE SUPER ADMIN ─────────────────────────────────
  const email    = process.env.SUPER_ADMIN_EMAIL       || 'admin@sbit.edu';
  const password = process.env.SUPER_ADMIN_PASSWORD    || 'Admin@SBIT2025';
  const empId    = process.env.SUPER_ADMIN_EMPLOYEE_ID || 'SUPERADMIN';

  console.log('👤 Creating Super Admin...');
  const superAdmin = new Admin({
    name:       'Super Admin',
    employeeId: empId,
    email:      email.toLowerCase(),
    mobile:     '9999999999',
    department: 'Administration',
    role:       'super_admin',
    password,       // pre-save hook bcrypt-hashes this
    isActive:   true,
  });

  await superAdmin.save();

  // ── 4. VERIFY PASSWORD HASH ───────────────────────────────
  const found = await Admin.findOne({ email: email.toLowerCase() });
  if (!found) {
    console.error('❌ Super Admin not found in DB after save!');
    process.exit(1);
  }
  const hashOk = await bcrypt.compare(password, found.password);
  if (!hashOk) {
    console.error('❌ Password hash verification FAILED!');
    process.exit(1);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ✅ Super Admin Created & Verified');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Name       : Super Admin`);
  console.log(`  Email      : ${email}`);
  console.log(`  Admin ID   : ${empId}`);
  console.log(`  Password   : ${password}`);
  console.log(`  Role       : super_admin`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('🏛️  Departments seeded:');
  DEPARTMENTS.forEach((d, i) => console.log(`   ${i + 1}. ${d.name} (${d.code})`));
  console.log('');
  console.log('✅ Database reset complete. System is ready!');
  console.log('');

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch(err => {
  console.error('❌ Seed script failed:', err.message);
  process.exit(1);
});
