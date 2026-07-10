require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Subject = require('../models/Subject');
const Department = require('../models/Department');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const student = await Student.findOne({ studentId: 'SBIST20260001' }).populate('department');
  if (!student) {
    console.error('Student SBIST20260001 not found');
    process.exit(1);
  }

  // Create subject if not exists
  let subject = await Subject.findOne({ code: 'CS_TEST_101' });
  if (!subject) {
    subject = await Subject.create({
      name: 'Test Algorithms',
      code: 'CS_TEST_101',
      department: student.department._id,
      semester: '1',
      year: '4'
    });
  }

  // Delete any existing test exams
  const existingExams = await Exam.find({ title: 'Reproduce Issue Exam' });
  for (const ex of existingExams) {
    await Question.deleteMany({ exam: ex._id });
    await Exam.deleteOne({ _id: ex._id });
  }

  const Admin = require('../models/Admin');
  const admin = await Admin.findOne({ email: process.env.SUPER_ADMIN_EMAIL });
  if (!admin) {
    console.error('Super Admin not found');
    process.exit(1);
  }

  // Create the matching active exam
  const exam = await Exam.create({
    title: 'Reproduce Issue Exam',
    subject: subject._id,
    department: student.department._id,
    semester: '1',
    year: '4',
    section: '', // Empty matches all sections
    description: 'Active exam for reproduction',
    duration: 60,
    totalMarks: 100,
    passMarks: 40,
    startTime: new Date(Date.now() - 5 * 60 * 1000), // Started 5 mins ago
    endTime: new Date(Date.now() + 55 * 60 * 1000),   // Ends in 55 mins
    status: 'active',
    randomizeQuestions: false,
    randomizeOptions: false,
    showResultAfterExam: true,
    allowDownloadResult: true,
    maxViolations: 3,
    negativeMarking: false,
    createdBy: admin._id,
  });

  // Create a sample question
  await Question.create({
    exam: exam._id,
    questionText: 'What is 2 + 2?',
    marks: 10,
    correctAnswer: 'A',
    options: {
      A: '4',
      B: '3',
      C: '5',
      D: '6'
    },
    order: 1,
    topic: 'Math'
  });

  console.log('✅ Created matching exam "Reproduce Issue Exam"');
  await mongoose.disconnect();
};

run().catch(console.error);
