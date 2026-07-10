require('dotenv').config();
const mongoose = require('mongoose');
const fetch = global.fetch;
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Department = require('../models/Department');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');

const BASE_URL = 'http://127.0.0.1:5000/api';

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  let dept = await Department.findOne({ code: 'CSE' });
  if (!dept) dept = await Department.create({ name: 'Computer Science and Engineering', code: 'CSE' });

  let subject = await Subject.findOne({ code: 'CS101' });
  if (!subject) subject = await Subject.create({ name: 'Algorithms', code: 'CS101', department: dept._id, semester: '1', year: '4' });

  let admin = await Admin.findOne({ email: process.env.SUPER_ADMIN_EMAIL });
  if (!admin) {
    admin = await Admin.create({ name: 'Super Admin', email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD, employeeId: process.env.SUPER_ADMIN_EMPLOYEE_ID || 'SUPERADMIN', mobile: '9999999999', department: 'Administration', role: 'super_admin' });
  }

  let student = await Student.findOne({ studentId: 'RATE_LIMIT_TEST_2026' });
  if (!student) {
    student = await Student.create({ studentId: 'RATE_LIMIT_TEST_2026', name: 'Rate Limit Test Student', email: 'rate-limit-test@student.test', password: 'Test1234!', department: dept._id, year: '4', semester: '1', section: 'A', role: 'student', isActive: true, isPasswordChanged: true, loginAttempts: 0, lockUntil: null, isLoggedIn: false });
  } else {
    student.isLoggedIn = false; student.loginAttempts = 0; student.lockUntil = null; student.isActive = true; await student.save();
  }

  let exam = await Exam.findOne({ title: 'Test Backend Submit Exam' });
  if (!exam) {
    exam = await Exam.create({ title: 'Test Backend Submit Exam', subject: subject._id, department: dept._id, semester: '1', year: '4', section: 'A', description: 'Submit test exam', duration: 60, totalMarks: 100, passMarks: 40, startTime: new Date(Date.now() - 5 * 60 * 1000), endTime: new Date(Date.now() + 55 * 60 * 1000), status: 'scheduled', createdBy: admin._id });
    await Question.create({ exam: exam._id, questionText: 'Sample question 1', marks: 10, correctAnswer: 'A', options: { A: 'One', B: 'Two', C: 'Three', D: 'Four' }, order: 1, topic: 'Sample' });
  }

  // Delete previous results to allow clean re-test
  await Result.deleteMany({ student: student._id, exam: exam._id });

  const loginRes = await fetch(`${BASE_URL}/auth/student/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: student.studentId, password: 'Test1234!' }) });
  const loginData = await loginRes.json();
  console.log('LOGIN', loginRes.status, loginData.message);
  if (loginRes.status !== 200) throw new Error('Login failed');
  const token = loginData.token;

  const startRes = await fetch(`${BASE_URL}/student/exams/${exam._id}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  const startData = await startRes.json();
  console.log('START', startRes.status, startData.message || startData);
  if (startRes.status !== 200) throw new Error('Start exam failed');

  const submitRes = await fetch(`${BASE_URL}/student/exams/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ resultId: startData.result._id, answers: { [startData.questions[0]._id]: 'A' }, reviewList: [] }) });
  const submitData = await submitRes.json();
  console.log('SUBMIT', submitRes.status, submitData.message || submitData);

  // Check if token is still valid after submission
  const afterRes = await fetch(`${BASE_URL}/student/exams`, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const afterData = await afterRes.json();
  console.log('AFTER_SUBMIT_API_CALL', afterRes.status, afterRes.status === 200 ? 'SUCCESS' : afterData);

  await mongoose.disconnect();
};

run().catch(err => { console.error(err); process.exit(1); });