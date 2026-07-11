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
    
    // Check that section check is not enforced/undefined for ALL wildcard
    assert.strictEqual(query.section, undefined);
    assert.deepStrictEqual(query.department, deptId);
    assert.strictEqual(query.year, '4');
    assert.strictEqual(query.semester, '1');
  });

  await t.test('Database-level tests (Students & Exams)', async () => {
    // Clean up
    await Student.deleteMany({});
    await Exam.deleteMany({});
    await EmailQueue.deleteMany({});
    await Department.deleteMany({});
    
    const Admin = require('../models/Admin');
    await Admin.deleteMany({});

    // Seed department first
    const dept = await Department.create({ name: 'Computer Science and Engineering', code: 'CSE', isActive: true });

    // Seed admin with department field
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

    // 1. All Sections Exam eligibility
    const examAll = await Exam.create({
      title: 'CSE All Sections Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() - 3600000), // Active
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
    assert.strictEqual(eligibleAll.length, 2); // Both A and B are eligible

    // 2. Section B only Exam eligibility
    const examB = await Exam.create({
      title: 'CSE Section B Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['B'],
      startTime: new Date(Date.now() - 3600000), // Active
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

    // 3. Time Filtering: Active exam vs Upcoming vs Expired
    // Upcoming exam
    const examUpcoming = await Exam.create({
      title: 'CSE Upcoming Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() + 3600000), // 1 hour later
      endTime: new Date(Date.now() + 7200000),
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'scheduled',
      questions: [],
      createdBy: admin._id,
      accessCode: '333333'
    });

    // Expired exam
    const examExpired = await Exam.create({
      title: 'CSE Expired Exam',
      department: dept._id,
      year: '4',
      semester: '1',
      sections: ['ALL'],
      startTime: new Date(Date.now() - 7200000), 
      endTime: new Date(Date.now() - 3600000), // Expired
      totalMarks: 100,
      passMarks: 40,
      duration: 60,
      status: 'active',
      questions: [],
      createdBy: admin._id,
      accessCode: '444444'
    });

    // Mock studentController getAvailableExams logic
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
    // Should include CSE All Sections Exam, CSE Section B Exam, and CSE Upcoming Exam. Excludes CSE Expired Exam.
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

    // 1. Queue a job
    const job = await EmailQueue.create({
      exam: exam._id,
      student: student._id,
      email: student.email,
      notificationType: 'custom',
      status: 'queued',
      nextRetryTime: new Date()
    });

    assert.strictEqual(job.status, 'queued');

    // 2. Prevent duplicate notifications via index
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

    // 3. Stale job recovery test
    await EmailQueue.updateOne({ _id: job._id }, { $set: { status: 'processing', processingStartedAt: new Date(Date.now() - 600000) } });
    
    // Simulate server restart recovery
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
});
