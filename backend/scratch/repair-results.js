const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const Result = require('../models/Result');
    const Exam = require('../models/Exam');
    const Question = require('../models/Question');
    const Student = require('../models/Student');
    const { evaluateExamResult } = require('../utils/resultEvaluator');

    const results = await Result.find({ status: { $ne: 'in_progress' } })
      .populate('student', 'name studentId')
      .populate('exam');

    console.log(`Checking ${results.length} completed results...`);
    let repairCount = 0;

    for (const r of results) {
      if (!r.exam) {
        console.log(`⚠️ Skipped Result ${r._id} - Associated exam deleted.`);
        continue;
      }

      // Fetch all questions for this exam
      const questions = await Question.find({ exam: r.exam._id });
      if (questions.length === 0) {
        console.log(`⚠️ Skipped Result ${r._id} - No questions found for exam "${r.exam.title}".`);
        continue;
      }

      // Evaluate result using unified logic
      const evaluation = evaluateExamResult(questions, r.savedProgress?.answers, r.savedProgress?.optionMappings, r.exam);

      // Check if any field differs
      const needsRepair =
        r.totalMarks !== evaluation.totalMarks ||
        r.obtainedMarks !== evaluation.obtainedMarks ||
        Math.abs((r.percentage || 0) - evaluation.percentage) > 0.01 ||
        r.isPassed !== evaluation.isPassed ||
        r.grade !== evaluation.grade ||
        r.correctAnswers !== evaluation.correctAnswers ||
        r.wrongAnswers !== evaluation.wrongAnswers ||
        r.skippedAnswers !== evaluation.skippedAnswers;

      if (needsRepair) {
        console.log(`\n🔧 Repairing Result ${r._id} for Student: ${r.student?.name} (${r.student?.studentId})`);
        console.log(`  Exam: "${r.exam.title}"`);
        console.log(`  [totalMarks]      Old: ${r.totalMarks} -> New: ${evaluation.totalMarks}`);
        console.log(`  [obtainedMarks]   Old: ${r.obtainedMarks} -> New: ${evaluation.obtainedMarks}`);
        console.log(`  [percentage]      Old: ${r.percentage}% -> New: ${evaluation.percentage}%`);
        console.log(`  [isPassed]        Old: ${r.isPassed} -> New: ${evaluation.isPassed}`);
        console.log(`  [grade]           Old: "${r.grade}" -> New: "${evaluation.grade}"`);
        console.log(`  [correctAnswers]  Old: ${r.correctAnswers} -> New: ${evaluation.correctAnswers}`);

        // Update fields
        r.totalMarks = evaluation.totalMarks;
        r.obtainedMarks = evaluation.obtainedMarks;
        r.percentage = evaluation.percentage;
        r.isPassed = evaluation.isPassed;
        r.grade = evaluation.grade;
        r.correctAnswers = evaluation.correctAnswers;
        r.wrongAnswers = evaluation.wrongAnswers;
        r.skippedAnswers = evaluation.skippedAnswers;
        r.subjectResults = evaluation.subjectResults;

        await r.save();
        repairCount++;
      }
    }

    console.log(`\n✅ Migration complete. Repaired ${repairCount} results.`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
