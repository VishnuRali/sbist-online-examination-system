require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Department = require('../models/Department');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const students = await Student.find().populate('department', 'name code');
  console.log('\n--- 👥 All Students ---');
  for (const s of students) {
    console.log(`ID: ${s._id}, Student ID: ${s.studentId}, Name: ${s.name}, Email: ${s.email}, Active: ${s.isActive}, isLoggedIn: ${s.isLoggedIn}, Dept: ${s.department?.name || 'None'}`);
    
    // Set password to Test1234! and activate them
    s.password = 'Test1234!';
    s.isActive = true;
    s.isPasswordChanged = true;
    s.isLoggedIn = false;
    s.currentSessionId = null;
    await s.save();
    console.log(`  -> Reset password to "Test1234!", isActive=true, isLoggedIn=false, currentSessionId=null`);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(console.error);
