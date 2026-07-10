require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fetch = global.fetch;
const Student = require('../models/Student');
const Result = require('../models/Result');
const Exam = require('../models/Exam');
require('../models/Department');
require('../models/Subject');
require('../models/Question');

const BASE_URL = 'http://127.0.0.1:5000/api';

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const student = await Student.findOne({ studentId: 'SBIST20260002' }).populate('department');
  if (!student) {
    console.error('Student SBIST20260002 not found');
    process.exit(1);
  }

  const exam = await Exam.findOne({ title: 'Test Backend Submit Exam' });
  if (!exam) {
    console.error('Exam Test Backend Submit Exam not found');
    process.exit(1);
  }

  // Loop the entire flow 5 times
  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- 🔄 LOOP ${i} ---`);

    // Clean up result for clean start
    await Result.deleteMany({ student: student._id, exam: exam._id });

    // 1. Login
    const loginRes = await fetch(`${BASE_URL}/auth/student/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: student.studentId, password: 'Test1234!' })
    });
    const loginData = await loginRes.json();
    console.log(`[${i}] LOGIN status:`, loginRes.status, loginData.message || 'Success');
    if (loginRes.status !== 200) {
      console.error('Login failed:', loginData);
      break;
    }
    const token = loginData.token;

    // 2. Fetch current user (Dashboard mount)
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`[${i}] GET /auth/me status:`, meRes.status);

    // 3. Fetch exams (Dashboard load)
    const examsRes = await fetch(`${BASE_URL}/student/exams`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`[${i}] GET /student/exams status:`, examsRes.status);

    // 4. Start Exam
    const startRes = await fetch(`${BASE_URL}/student/exams/${exam._id}/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const startData = await startRes.json();
    console.log(`[${i}] POST /start status:`, startRes.status);

    if (startRes.status !== 200) {
      console.error('Start exam failed:', startData);
      break;
    }

    const resultId = startData.result._id;
    const qId = startData.questions[0]._id;

    // 5. Save progress
    const saveRes = await fetch(`${BASE_URL}/student/exams/save-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resultId, answers: { [qId]: 'A' }, currentQuestion: 0, reviewList: [] })
    });
    console.log(`[${i}] POST /save-progress status:`, saveRes.status);

    // 6. Submit Exam
    const submitRes = await fetch(`${BASE_URL}/student/exams/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resultId, answers: { [qId]: 'A' }, reviewList: [] })
    });
    console.log(`[${i}] POST /submit status:`, submitRes.status);

    // 7. Get student all results (Results load)
    const resultsRes = await fetch(`${BASE_URL}/student/results`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`[${i}] GET /results status:`, resultsRes.status);

    // 8. Fetch current user again
    const meRes2 = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`[${i}] GET /auth/me (after submit) status:`, meRes2.status);
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch(console.error);
