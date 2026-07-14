const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Load models
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Department = require('../models/Department');
const Question = require('../models/Question');
const Admin = require('../models/Admin');

// Load controllers
const studentController = require('../controllers/studentController');
const adminManagementController = require('../controllers/adminManagementController');

test('SWARNA BHARATHI INSTITUTE System Optimizations & Security Regression Tests', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  // ── Wipe every collection before each sub-test so uniquely-indexed
  //    fields like Department.name and Admin.email never collide.
  t.beforeEach(async () => {
    await Promise.all([
      Student.deleteMany({}),
      Result.deleteMany({}),
      Exam.deleteMany({}),
      Question.deleteMany({}),
      Department.deleteMany({}),
      Admin.deleteMany({}),
    ]);
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Helper to create mocked express res object
  const mockResponse = () => {
    const res = {
      statusCode: 200,
      jsonData: null,
      status: function (code) {
        this.statusCode = code;
        return this;
      },
      json: function (data) {
        this.jsonData = data;
        return this;
      }
    };
    return res;
  };

  // Helper that creates a valid Admin document satisfying every schema constraint.
  // employeeId, email, and mobile are derived from a counter to remain unique
  // across tests even when the beforeEach wipe hasn't finished propagating index drops.
  let _adminCounter = 0;
  const makeAdmin = (overrides = {}) => {
    _adminCounter++;
    return Admin.create({
      name: 'Test Admin',
      employeeId: `EMP${_adminCounter}`,
      email: `testadmin${_adminCounter}@sbit.test`,
      mobile: `98765${String(_adminCounter).padStart(5, '0')}`,
      department: 'CSE',
      role: 'admin',
      password: 'testpass123',
      ...overrides,
    });
  };

  await t.test('1. Cross-student resultId access returns 403', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });

    // Create Student A and Student B
    const studentA = await Student.create({
      studentId: 'SA001',
      rollNumber: 'RA001',
      name: 'Student A',
      email: 'studenta@example.com',
      password: 'password123',
      department: dept._id,
      year: '4',
      semester: '1',
      isActive: true
    });

    const studentB = await Student.create({
      studentId: 'SB001',
      rollNumber: 'RB001',
      name: 'Student B',
      email: 'studentb@example.com',
      password: 'password123',
      department: dept._id,
      year: '4',
      semester: '1',
      isActive: true
    });

    // Create Result for Student A
    const resultA = await Result.create({
      student: studentA._id,
      exam: new mongoose.Types.ObjectId(),
      status: 'in_progress',
      savedProgress: {
        answers: {},
        reviewList: [],
        currentQuestion: 0,
        currentSubjectIndex: 0
      }
    });

    // Student B attempts to save progress on Student A's result
    const reqSave = {
      student: studentB,
      body: {
        resultId: resultA._id,
        answers: { 'q1': 'A' }
      }
    };
    const resSave = mockResponse();
    await studentController.saveProgress(reqSave, resSave);
    assert.strictEqual(resSave.statusCode, 403);
    assert.strictEqual(resSave.jsonData.success, false);
    assert.match(resSave.jsonData.message, /authorized/i);

    // Student B attempts to submit exam on Student A's result
    const reqSubmit = {
      student: studentB,
      body: {
        resultId: resultA._id
      }
    };
    const resSubmit = mockResponse();
    await studentController.submitExam(reqSubmit, resSubmit);
    assert.strictEqual(resSubmit.statusCode, 403);
    assert.strictEqual(resSubmit.jsonData.success, false);

    // Student B attempts to switch subject on Student A's result
    const reqSwitch = {
      student: studentB,
      body: {
        resultId: resultA._id,
        subjectIndex: 1
      }
    };
    const resSwitch = mockResponse();
    await studentController.switchSubject(reqSwitch, resSwitch);
    assert.strictEqual(resSwitch.statusCode, 403);

    // Student B attempts to report violation on Student A's result
    const reqViolation = {
      student: studentB,
      body: {
        resultId: resultA._id,
        violationType: 'tab-switch'
      }
    };
    const resViolation = mockResponse();
    await studentController.reportViolation(reqViolation, resViolation);
    assert.strictEqual(resViolation.statusCode, 403);
  });

  await t.test('2. Two simultaneous submissions produce exactly one final evaluation', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });
    const admin = await makeAdmin();

    const student = await Student.create({
      studentId: 'SA002', rollNumber: 'RA002', name: 'Student', email: 's@ex.com', password: 'pw', department: dept._id, year: '4', semester: '1'
    });

    const exam = await Exam.create({
      title: 'Math Exam', department: dept._id, year: '4', semester: '1', startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalMarks: 10, passMarks: 4, duration: 60, status: 'active', accessCode: '123456', createdBy: admin._id
    });

    const question = await Question.create({
      exam: exam._id, questionText: '1+1=?', options: { A: '1', B: '2', C: '3', D: '4' }, correctAnswer: 'B', marks: 10, subjectIndex: 0
    });

    const result = await Result.create({
      student: student._id,
      exam: exam._id,
      status: 'in_progress',
      startedAt: new Date(),
      savedProgress: {
        answers: { [question._id.toString()]: 'B' },
        reviewList: [],
        currentQuestion: 0,
        currentSubjectIndex: 0
      }
    });

    // Simulate two submission requests concurrently
    const req1 = { student, body: { resultId: result._id, answers: { [question._id.toString()]: 'B' } } };
    const req2 = { student, body: { resultId: result._id, answers: { [question._id.toString()]: 'B' } } };

    const res1 = mockResponse();
    const res2 = mockResponse();

    // Call submitExam concurrently
    await Promise.all([
      studentController.submitExam(req1, res1),
      studentController.submitExam(req2, res2)
    ]);

    // One must have success: true with alreadySubmitted undefined/false
    // The other must have success: true with alreadySubmitted: true
    const resultsOutputs = [res1.jsonData, res2.jsonData];
    const normalSub = resultsOutputs.find(r => r && !r.alreadySubmitted);
    const alreadySub = resultsOutputs.find(r => r && r.alreadySubmitted);

    assert.ok(normalSub, 'One request should successfully finalize submission');
    assert.strictEqual(normalSub.success, true);
    assert.strictEqual(normalSub.result.obtainedMarks, 10);

    assert.ok(alreadySub, 'The second request should detect alreadySubmitted: true');
    assert.strictEqual(alreadySub.success, true);
    assert.strictEqual(alreadySub.alreadySubmitted, true);
  });

  await t.test('3. Latest-answer submission immediately after answer selection works', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });
    const admin = await makeAdmin();

    const student = await Student.create({
      studentId: 'SA003', rollNumber: 'RA003', name: 'Student', email: 's3@ex.com', password: 'pw', department: dept._id, year: '4', semester: '1'
    });

    const exam = await Exam.create({
      title: 'Science Exam', department: dept._id, year: '4', semester: '1', startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalMarks: 10, passMarks: 4, duration: 60, status: 'active', accessCode: '123456', createdBy: admin._id
    });

    const question = await Question.create({
      exam: exam._id, questionText: 'What color is the sky?', options: { A: 'Green', B: 'Blue', C: 'Red', D: 'Yellow' }, correctAnswer: 'B', marks: 10, subjectIndex: 0
    });

    // DB has no answers saved yet
    const result = await Result.create({
      student: student._id,
      exam: exam._id,
      status: 'in_progress',
      startedAt: new Date(),
      savedProgress: {
        answers: {},
        reviewList: [],
        currentQuestion: 0,
        currentSubjectIndex: 0
      }
    });

    // Student submits with answers directly in the request body
    const reqSubmit = {
      student,
      body: {
        resultId: result._id,
        answers: { [question._id.toString()]: 'B' } // Selecting correct answer on submit
      }
    };
    const resSubmit = mockResponse();
    await studentController.submitExam(reqSubmit, resSubmit);

    assert.strictEqual(resSubmit.statusCode, 200);
    assert.strictEqual(resSubmit.jsonData.success, true);
    assert.strictEqual(resSubmit.jsonData.result.obtainedMarks, 10, 'Evaluation should grade latest answers from body');

    // Confirm it is saved in the database
    const dbRes = await Result.findById(result._id);
    assert.strictEqual(dbRes.savedProgress.answers.get(question._id.toString()), 'B', 'Saved progress should be updated to latest answers');
  });

  await t.test('4. Autosave and final submission concurrency handles status filters', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });
    const admin = await makeAdmin();

    const student = await Student.create({
      studentId: 'SA004', rollNumber: 'RA004', name: 'Student', email: 's4@ex.com', password: 'pw', department: dept._id, year: '4', semester: '1'
    });

    const exam = await Exam.create({
      title: 'History Exam', department: dept._id, year: '4', semester: '1', startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalMarks: 10, passMarks: 4, duration: 60, status: 'active', accessCode: '123456', createdBy: admin._id
    });

    const result = await Result.create({
      student: student._id,
      exam: exam._id,
      status: 'in_progress',
      startedAt: new Date(),
      savedProgress: {
        answers: {},
        reviewList: [],
        currentQuestion: 0,
        currentSubjectIndex: 0
      }
    });

    // Run submit first, then autosave immediately after (autosave should fail with 400 since it is no longer in_progress)
    const reqSubmit = { student, body: { resultId: result._id, answers: {} } };
    const reqSave = { student, body: { resultId: result._id, answers: { 'q1': 'A' } } };

    const resSubmit = mockResponse();
    const resSave = mockResponse();

    await studentController.submitExam(reqSubmit, resSubmit);
    await studentController.saveProgress(reqSave, resSave);

    assert.strictEqual(resSubmit.statusCode, 200);
    assert.strictEqual(resSave.statusCode, 400, 'Autosave should fail with 400 on completed exam');
  });

  await t.test('5. Student ID and roll-number logins can both find the student successfully', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });

    await Student.create({
      studentId: 'SBIT999',
      rollNumber: 'R999',
      name: 'Test Student Index',
      email: 'index@ex.com',
      password: 'pw',
      department: dept._id,
      year: '4',
      semester: '1'
    });

    const loginId1 = 'SBIT999';
    const loginId2 = 'R999';

    const s1 = await Student.findOne({ $or: [ { studentId: loginId1 }, { rollNumber: loginId1 } ] });
    const s2 = await Student.findOne({ $or: [ { studentId: loginId2 }, { rollNumber: loginId2 } ] });

    assert.ok(s1);
    assert.ok(s2);
    assert.strictEqual(s1._id.toString(), s2._id.toString());

    // Verify index is declared on Student schema
    const indexes = Student.schema.indexes();
    const hasRollNumberIndex = indexes.some(idx => idx[0] && idx[0].rollNumber === 1);
    assert.ok(hasRollNumberIndex, 'Student schema should contain rollNumber: 1 index');
  });

  await t.test('6. Live Monitor output is backward compatible with selected fields and lean objects', async () => {
    const dept = await Department.create({ name: 'CSE', code: 'CSE', isActive: true });
    const admin = await makeAdmin();

    const exam = await Exam.create({
      title: 'Live Monitor Test Exam', department: dept._id, year: '4', semester: '1', startTime: new Date(), endTime: new Date(Date.now() + 3600000), totalMarks: 10, passMarks: 4, duration: 60, status: 'active', accessCode: '123456', createdBy: admin._id
    });

    const student = await Student.create({
      studentId: 'SA005', rollNumber: 'RA005', name: 'Student Live', email: 'slive@ex.com', password: 'pw', department: dept._id, year: '4', semester: '1', isActive: true, isLoggedIn: true
    });

    await Result.create({
      student: student._id,
      exam: exam._id,
      status: 'in_progress',
      violations: 1,
      autoSubmitReason: '',
      savedProgress: {
        answers: {},
        reviewList: [],
        currentQuestion: 0,
        currentSubjectIndex: 0
      }
    });

    const req = {
      query: { examId: exam._id.toString() }
    };
    const res = mockResponse();

    await adminManagementController.getLiveMonitorData(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.jsonData.success, true);
    assert.strictEqual(res.jsonData.stats.writing, 1);
    assert.strictEqual(res.jsonData.students.length, 1);
    assert.strictEqual(res.jsonData.students[0].name, 'Student Live');
    assert.strictEqual(res.jsonData.students[0].status, 'Currently Writing Exam');
    assert.strictEqual(res.jsonData.students[0].violations, 1);
  });
});
