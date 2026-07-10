const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Result = require('../models/Result');
    const Exam = require('../models/Exam');
    const Student = require('../models/Student');

    const results = await Result.find({})
      .populate('student', 'name studentId')
      .populate('exam', 'title totalMarks passMarks');

    console.log(`Found ${results.length} results:`);
    results.forEach((r, idx) => {
      console.log(`\n--- Result ${idx + 1} ---`);
      console.log(`Student: ${r.student?.name} (${r.student?.studentId})`);
      console.log(`Exam: ${r.exam?.title}`);
      console.log(`Exam totalMarks: ${r.exam?.totalMarks}, passMarks: ${r.exam?.passMarks}`);
      console.log(`Result totalMarks: ${r.totalMarks}, obtainedMarks: ${r.obtainedMarks}`);
      console.log(`Percentage: ${r.percentage}%`);
      console.log(`Status: ${r.status}`);
      console.log(`isPassed: ${r.isPassed}`);
      console.log(`Grade: "${r.grade}"`);
    });

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
