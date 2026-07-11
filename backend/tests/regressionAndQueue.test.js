const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Import helper functions
const { buildStudentEligibilityQuery } = require('../utils/studentEligibility');
const { processBatch } = require('../jobs/emailWorker');

// Normalization function used in controller
const normalizeSection = (value) => {
  const str = String(value || '').trim().toUpperCase();
  if (str === 'ALL' || str === 'ALL SECTIONS' || str === 'ALL SECTION' || str.startsWith('ALL SEC')) {
    return 'ALL';
  }
  const replaced = str.replace(/SEC(TION)?\s*/i, '').trim();
  if (replaced === 'ALL' || replaced === 'ALL SECTIONS' || replaced === 'ALL SECTION' || replaced.startsWith('ALL SEC')) {
    return 'ALL';
  }
  return replaced.replace(/[^A-Z0-9]/gi, '').toUpperCase();
};

test('Unified Regression and Asynchronous Email Queue Tests', async (t) => {
  let mongoServer;

  t.before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  t.after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  // Load models
  const Student = require('../models/Student');
  const Exam = require('../models/Exam');
  const EmailQueue = require('../models/EmailQueue');
  const Department = require('../models/Department');
  const Subject = require('../models/Subject');
  const EmailLog = require('../models/EmailLog');
  const Result = require('../models/Result');

  await t.test('Section Normalization Logic Tests', () => {
    assert.strictEqual(normalizeSection('All Sections'), 'ALL');
    assert.strictEqual(normalizeSection('ALL SECTIONS'), 'ALL');
    assert.strictEqual(normalizeSection('All'), 'ALL');
    assert.strictEqual(normalizeSection('ALL'), 'ALL');
    assert.strictEqual(normalizeSection('all'), 'ALL');
    assert.strictEqual(normalizeSection('All Section'), 'ALL');
    assert.strictEqual(normalizeSection('Section B'), 'B');
    assert.strictEqual(normalizeSection('section b'), 'B');
    assert.strictEqual(normalizeSection('B'), 'B');
    assert.strictEqual(normalizeSection('A'), 'A');
    assert.notStrictEqual(normalizeSection('Section A'), 'B');
  });

  await t.test('Eligibility Query & wildcards with Student Match Tests', async () => {
    const deptId = new mongoose.Types.ObjectId();
    const mockExam = {
      department: deptId,
      year: '4',
      semester: '1',
      sections: ['ALL']
    };

    const query = await buildStudentEligibilityQuery(mockExam, { target: 'all' });
    
    assert.strictEqual(query.section, undefined);
    assert.deepStrictEqual(query.department, deptId);
    assert.strictEqual(query.year, '4');
    assert.strictEqual(query.semester, '1');
  });

  await t.test('Database-level tests (Students & Exams)', async () => {
    await Student.deleteMany({});
    await Exam.deleteMany({});
    await EmailQueue.deleteMany({});
    await Department.deleteMany({});
    
    const Admin = require('../models/Admin');
    await Admin.deleteMany({});

    const dept = await Department.create({ name: 'Computer Science and Engineering', code: 'CSE', isActive: true });

    const admin = await Admin.create({
      name: 'Test Admin',
      employeeId: 'EMP001',
      email: 'admin@example.com',
      mobile: '9876543212',
      password: 'password123',
      role: 'admin',
      department: 'Computer Science and Engineering',
      isActive: true
    });
    
    const studentB = await Student.create({
      studentId: 'SBIT0001',
      rollNumber: 'R001',
      name: 'CSE Student B',
      email: 'studentb@example.com',
      mobile: '9876543210',
      password: 'password123',
      department: dept._id,
      year: '4',
      semester: '1',
      section: 'B',
      isActive: true
    });

    const studentA = await Student.create({
      studentId: 'SBIT0002',
      rollNumber: 'R002',
      name: 'CSE Student A',
      email: 'studenta@example.com',
      mobile: '9876543211',
      password: 'password123',
      department: dept._id,
      year: '4',
      semester: '1',
      section: 'A',
      isActive: true
    });

    const examAll = await Exam.create({
      title: 'CSE All Sections Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'active',
      questions: [],
      createdBy: admin._id,
      accessCode: '111111'
    });

    const queryAll = await buildStudentEligibilityQuery(examAll, { target: 'all' });
    const eligibleAll = await Student.find(queryAll);
    assert.strictEqual(eligibleAll.length, 2);

    const examB = await Exam.create({
      title: 'CSE Section B Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['B'],
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'active',
      questions: [],
      createdBy: admin._id,
      accessCode: '222222'
    });

    const queryB = await buildStudentEligibilityQuery(examB, { target: 'all' });
    const eligibleB = await Student.find(queryB);
    assert.strictEqual(eligibleB.length, 1);
    assert.strictEqual(eligibleB[0].section, 'B');

    const examUpcoming = await Exam.create({
      title: 'CSE Upcoming Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'scheduled',
      questions: [],
      createdBy: admin._id,
      accessCode: '333333'
    });

    const examExpired = await Exam.create({
      title: 'CSE Expired Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() - 7200000), 
      endTime: new Date(Date.now() - 3600000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'active',
      questions: [],
      createdBy: admin._id,
      accessCode: '444444'
    });

    const getVisibleExams = async (student) => {
      const allExams = await Exam.find({
        status: { $in: ['scheduled', 'active'] },
      }).lean();

      return allExams.filter((exam) => {
        const examYear = exam.year;
        const examSemester = exam.semester;
        const examEnd = new Date(exam.endTime);

        const reasons = [];
        if (examYear !== student.year) reasons.push('Year mismatch');
        if (examSemester !== student.semester) reasons.push('Semester mismatch');
        if (new Date() > examEnd) reasons.push('Exam ended');

        return reasons.length === 0;
      });
    };

    const visibleExams = await getVisibleExams(studentB);
    assert.strictEqual(visibleExams.length, 3);
    const visibleTitles = visibleExams.map(e => e.title);
    assert.ok(visibleTitles.includes('CSE All Sections Exam'));
    assert.ok(visibleTitles.includes('CSE Section B Exam'));
    assert.ok(visibleTitles.includes('CSE Upcoming Exam'));
    assert.ok(!visibleTitles.includes('CSE Expired Exam'));
  });

  await t.test('Asynchronous Queue & Worker Tests', async () => {
    await EmailQueue.deleteMany({});
    const exam = await Exam.findOne({ title: 'CSE All Sections Exam' });
    const student = await Student.findOne({ section: 'B' });

    const job = await EmailQueue.create({
      exam: exam._id,
      student: student._id,
      email: student.email,
      notificationType: 'custom',
      status: 'queued',
      nextRetryTime: new Date()
    });

    assert.strictEqual(job.status, 'queued');

    try {
      await EmailQueue.create({
        exam: exam._id,
        student: student._id,
        email: student.email,
        notificationType: 'custom',
        status: 'queued',
        nextRetryTime: new Date()
      });
      assert.fail('Should have thrown duplicate key error');
    } catch (err) {
      assert.ok(err.code === 11000 || err.message.includes('duplicate'));
    }

    await EmailQueue.updateOne({ _id: job._id }, { $set: { status: 'processing', processingStartedAt: new Date(Date.now() - 600000) } });
    
    const resetStaleJobs = async () => {
      return await EmailQueue.updateMany(
        { status: 'processing' },
        { $set: { status: 'queued', failureReason: 'Interrupted' }, $inc: { retryCount: 1 } }
      );
    };
    const resetRes = await resetStaleJobs();
    assert.strictEqual(resetRes.modifiedCount, 1);
    
    const recoveredJob = await EmailQueue.findById(job._id);
    assert.strictEqual(recoveredJob.status, 'queued');
    assert.strictEqual(recoveredJob.retryCount, 1);
  });

  await t.test('Exam Start & Access Code Regression Tests', async () => {
    await Result.deleteMany({});
    const exam = await Exam.findOne({ title: 'CSE All Sections Exam' });
    const student = await Student.findOne({ section: 'B' });
    
    const startExamLogic = async (studentId, examId, submittedCode) => {
      const ex = await Exam.findById(examId);
      const resVal = await Result.findOne({ student: studentId, exam: examId, status: 'in_progress' });
      if (!resVal) {
        const code = String(submittedCode || '').trim();
        if (!code || code !== String(ex.accessCode).trim()) {
          throw new Error('Invalid access code');
        }
      }
      
      const newResult = new Result({
        student: studentId,
        exam: examId,
        totalMarks: 100,
        startedAt: new Date(),
        status: 'in_progress'
      });
      await newResult.save();
      return newResult;
    };

    const res1 = await startExamLogic(student._id, exam._id, '111111');
    assert.ok(res1);
    assert.strictEqual(res1.status, 'in_progress');

    await Result.deleteMany({});

    try {
      await startExamLogic(student._id, exam._id, 'wrongcode');
      assert.fail('Should have failed with invalid access code');
    } catch (err) {
      assert.strictEqual(err.message, 'Invalid access code');
    }
    const resCount = await Result.countDocuments({ student: student._id, exam: exam._id });
    assert.strictEqual(resCount, 0, 'No Result should be created on failure');
  });

  await t.test('Email Queue Worker Failure Recovery Tests', async () => {
    await EmailQueue.deleteMany({});
    await EmailLog.deleteMany({});
    
    const exam = await Exam.findOne({ title: 'CSE All Sections Exam' });
    const student = await Student.findOne({ section: 'B' });

    const job = await EmailQueue.create({
      exam: exam._id,
      student: student._id,
      email: student.email,
      notificationType: 'welcome',
      status: 'queued',
      nextRetryTime: new Date()
    });

    const simulateWorkerSendFail = async (jobRecord, errorMsg) => {
      jobRecord.status = 'processing';
      await jobRecord.save();
      
      const nextRetry = jobRecord.retryCount + 1;
      if (nextRetry >= jobRecord.maxRetryCount || errorMsg.includes('credentials')) {
        jobRecord.status = 'failed';
        jobRecord.failedAt = new Date();
        jobRecord.failureReason = errorMsg;
        await jobRecord.save();
      } else {
        const backoffMs = Math.pow(2, nextRetry) * 60 * 1000;
        jobRecord.status = 'queued';
        jobRecord.retryCount = nextRetry;
        jobRecord.nextRetryTime = new Date(Date.now() + backoffMs);
        jobRecord.failureReason = errorMsg;
        await jobRecord.save();
      }

      await EmailLog.create({
        to: jobRecord.email,
        studentName: student.name,
        studentId: student.studentId,
        student: student._id,
        type: jobRecord.notificationType,
        subject: 'Welcome',
        status: 'failed',
        errorMessage: errorMsg,
        exam: exam._id,
        attempts: nextRetry
      });
    };

    await simulateWorkerSendFail(job, 'Invalid SMTP credentials');

    const finalJob = await EmailQueue.findById(job._id);
    assert.strictEqual(finalJob.status, 'failed');
    assert.strictEqual(finalJob.failureReason, 'Invalid SMTP credentials');

    const log = await EmailLog.findOne({ student: student._id });
    assert.ok(log);
    assert.strictEqual(log.status, 'failed');
    assert.strictEqual(log.errorMessage, 'Invalid SMTP credentials');
  });

  await t.test('SMTP Settings Encryption, Decryption, and Normalization', async () => {
    const Settings = require('../models/Settings');
    const { encrypt, decrypt } = require('../utils/crypto');
    await Settings.deleteMany({});

    // Test encryption/decryption helpers
    const rawPass = 'abcd efgh ijkl mnop';
    const encrypted = encrypt(rawPass.replace(/\s+/g, ''));
    assert.ok(encrypted.includes(':'));
    const decrypted = decrypt(encrypted);
    assert.strictEqual(decrypted, 'abcdefghijklmnop');

    // Save Settings
    const settings = new Settings({
      gmailUser: 'test@gmail.com',
      gmailAppPassword: encrypted,
      examPortalUrl: 'http://localhost:5173'
    });
    await settings.save();

    // Verify it is encrypted in DB
    const stored = await Settings.findOne();
    assert.ok(stored.gmailAppPassword.includes(':'));
    assert.notStrictEqual(stored.gmailAppPassword, 'abcdefghijklmnop');

    // Retrieve via decrypt
    const configPass = decrypt(stored.gmailAppPassword);
    assert.strictEqual(configPass, 'abcdefghijklmnop');
  });

  await t.test('Access Code Stability, GET Isolation & Regenerate Tests', async () => {
    const Exam = require('../models/Exam');
    const { regenerateAccessCode } = require('../controllers/examController');
    const admin = await mongoose.model('Admin').findOne({ email: 'admin@example.com' });
    const dept = await Department.findOne({ code: 'CSE' });

    // Clear and create a new test exam
    await Exam.deleteMany({});
    const exam = await Exam.create({
      title: 'CSE Isolation Test Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() - 3600000),
      endTime: new Date(Date.now() + 3600000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'active',
      questions: [],
      createdBy: admin._id,
      accessCode: '555555'
    });

    // Verify code starts as '555555'
    let fetched = await Exam.findById(exam._id);
    assert.strictEqual(fetched.accessCode, '555555');

    // Simulate 5 page refreshes (GET route fetches)
    for (let i = 0; i < 5; i++) {
      const all = await Exam.find({}).lean();
      assert.strictEqual(all[0].accessCode, '555555');
    }

    // Test Regenerate
    const reqMock = { params: { id: exam._id } };
    let jsonOutput = null;
    const resMock = {
      json: (data) => { jsonOutput = data; },
      status: function() { return this; }
    };
    
    await regenerateAccessCode(reqMock, resMock);
    assert.ok(jsonOutput);
    assert.strictEqual(jsonOutput.success, true);
    assert.notStrictEqual(jsonOutput.accessCode, '555555');
    assert.ok(/^\d{6}$/.test(jsonOutput.accessCode));

    // Verify it is saved in the database
    const finalFetched = await Exam.findById(exam._id);
    assert.strictEqual(finalFetched.accessCode, jsonOutput.accessCode);

    // Verify multiple GET refreshes still keep the new regenerated code
    for (let i = 0; i < 5; i++) {
      const all = await Exam.find({}).lean();
      assert.strictEqual(all[0].accessCode, jsonOutput.accessCode);
    }
  });
});

