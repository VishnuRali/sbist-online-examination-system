require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Department = require('../models/Department');

const BASE_URL = 'http://127.0.0.1:5000/api/auth';

const runTest = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const adminPayload = {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  };

  const studentId = 'RATE_LIMIT_TEST_2026';
  const studentPassword = 'Test1234!';

  const department = await Department.findOne({ code: 'CSE' }) || await Department.create({ name: 'Computer Science and Engineering', code: 'CSE' });

  let student = await Student.findOne({ studentId });
  if (!student) {
    student = await Student.create({
      studentId,
      name: 'Rate Limit Test Student',
      email: 'rate-limit-test@student.test',
      password: studentPassword,
      department: department._id,
      year: '4',
      semester: '1',
      section: 'A',
      role: 'student',
      isActive: true,
      isPasswordChanged: true,
      loginAttempts: 0,
      lockUntil: null,
      isLoggedIn: false,
    });
    console.log('Created test student', student.studentId);
  } else {
    student.loginAttempts = 0;
    student.lockUntil = null;
    student.isLoggedIn = false;
    await student.save();
  }

  const makeRequest = async (path, body) => {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { status: response.status, data };
  };

  const adminResult = await makeRequest('/admin/login', adminPayload);
  console.log('ADMIN LOGIN:', adminResult.status, adminResult.data);

  const studentResult = await makeRequest('/student/login', { studentId, password: studentPassword });
  console.log('STUDENT LOGIN:', studentResult.status, studentResult.data);

  await mongoose.disconnect();
};

runTest().catch((error) => {
  console.error('TEST ERROR', error);
  process.exit(1);
});
