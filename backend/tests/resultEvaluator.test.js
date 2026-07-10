const test = require('node:test');
const assert = require('node:assert');
const { evaluateExamResult, calculateGrade } = require('../utils/resultEvaluator');

test('evaluateExamResult unit tests', async (t) => {

  await t.test('3/3 = 100% -> PASS with correct grade O', () => {
    const questions = [
      { _id: 'q1', marks: 1, correctAnswer: 'A' },
      { _id: 'q2', marks: 1, correctAnswer: 'B' },
      { _id: 'q3', marks: 1, correctAnswer: 'C' }
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'B', 'q3': 'C' };
    const exam = { totalMarks: 100, passMarks: 40, examType: 'single' };

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 3);
    assert.strictEqual(res.obtainedMarks, 3);
    assert.strictEqual(res.correctAnswers, 3);
    assert.strictEqual(res.wrongAnswers, 0);
    assert.strictEqual(res.skippedAnswers, 0);
    assert.strictEqual(res.percentage, 100);
    assert.strictEqual(res.isPassed, true);
    assert.strictEqual(res.grade, 'O');
  });

  await t.test('2/3 = 66.67% -> PASS if configured pass percentage is 40%', () => {
    const questions = [
      { _id: 'q1', marks: 1, correctAnswer: 'A' },
      { _id: 'q2', marks: 1, correctAnswer: 'B' },
      { _id: 'q3', marks: 1, correctAnswer: 'C' }
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'B', 'q3': 'D' }; // 2 correct, 1 wrong
    const exam = { totalMarks: 100, passMarks: 40, examType: 'single' }; // 40%

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 3);
    assert.strictEqual(res.obtainedMarks, 2);
    assert.strictEqual(res.percentage > 66 && res.percentage < 67, true);
    assert.strictEqual(res.isPassed, true); // 66.67% >= 40%
  });

  await t.test('2/3 = 66.67% -> FAIL if configured pass percentage is 70%', () => {
    const questions = [
      { _id: 'q1', marks: 1, correctAnswer: 'A' },
      { _id: 'q2', marks: 1, correctAnswer: 'B' },
      { _id: 'q3', marks: 1, correctAnswer: 'C' }
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'B', 'q3': 'D' }; // 2 correct, 1 wrong
    const exam = { totalMarks: 100, passMarks: 70, examType: 'single' }; // 70%

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.isPassed, false); // 66.67% < 70%
  });

  await t.test('0/3 = 0% -> FAIL', () => {
    const questions = [
      { _id: 'q1', marks: 1, correctAnswer: 'A' },
      { _id: 'q2', marks: 1, correctAnswer: 'B' },
      { _id: 'q3', marks: 1, correctAnswer: 'C' }
    ];
    const savedAnswers = { 'q1': 'B', 'q2': 'C', 'q3': 'A' }; // all wrong
    const exam = { totalMarks: 100, passMarks: 40, examType: 'single' };

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.isPassed, false);
    assert.strictEqual(res.obtainedMarks, 0);
    assert.strictEqual(res.grade, 'F');
  });

  await t.test('totalMarks = 0 must not cause division by zero', () => {
    const questions = [];
    const savedAnswers = {};
    const exam = { totalMarks: 100, passMarks: 40, examType: 'single' };

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 0);
    assert.strictEqual(res.obtainedMarks, 0);
    assert.strictEqual(res.percentage, 0);
    assert.strictEqual(res.isPassed, true); // 0 out of 0 is passed
    assert.strictEqual(res.grade, 'F'); // 0% gets F
  });

  await t.test('negative marking calculates correctly', () => {
    const questions = [
      { _id: 'q1', marks: 4, correctAnswer: 'A', negativeMark: 1 },
      { _id: 'q2', marks: 4, correctAnswer: 'B', negativeMark: 1 }
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'C' }; // 1 correct (4 marks), 1 wrong (-1 mark)
    const exam = { totalMarks: 100, passMarks: 40, negativeMarking: true, examType: 'single' };

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 8);
    assert.strictEqual(res.obtainedMarks, 3); // 4 - 1 = 3
    assert.strictEqual(res.correctAnswers, 1);
    assert.strictEqual(res.wrongAnswers, 1);
  });

  await t.test('multi-subject results calculate correctly', () => {
    const exam = {
      examType: 'multi',
      subjects: [
        { subjectName: 'Math', totalMarks: 50, passMarks: 20, duration: 30, negativeMarking: false },
        { subjectName: 'Science', totalMarks: 50, passMarks: 20, duration: 30, negativeMarking: true }
      ]
    };
    const questions = [
      { _id: 'q1', marks: 10, correctAnswer: 'A', subjectIndex: 0 }, // Math (correct)
      { _id: 'q2', marks: 10, correctAnswer: 'B', subjectIndex: 0 }, // Math (wrong)
      { _id: 'q3', marks: 10, correctAnswer: 'C', subjectIndex: 1, negativeMark: 2 }, // Science (correct)
      { _id: 'q4', marks: 10, correctAnswer: 'D', subjectIndex: 1, negativeMark: 2 }  // Science (wrong)
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'C', 'q3': 'C', 'q4': 'A' };

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 40);
    assert.strictEqual(res.obtainedMarks, 18); // Math 10 + Science (10 - 2) = 18
    assert.strictEqual(res.subjectResults.length, 2);
    
    // Subject Math
    assert.strictEqual(res.subjectResults[0].subjectName, 'Math');
    assert.strictEqual(res.subjectResults[0].obtainedMarks, 10);
    assert.strictEqual(res.subjectResults[0].totalMarks, 20);
    
    // Subject Science
    assert.strictEqual(res.subjectResults[1].subjectName, 'Science');
    assert.strictEqual(res.subjectResults[1].obtainedMarks, 8);
    assert.strictEqual(res.subjectResults[1].totalMarks, 20);
  });

  await t.test('old single-subject exams remain compatible', () => {
    const questions = [
      { _id: 'q1', marks: 50, correctAnswer: 'A' },
      { _id: 'q2', marks: 50, correctAnswer: 'B' }
    ];
    const savedAnswers = { 'q1': 'A', 'q2': 'B' };
    const exam = {}; // default pass marks fallback

    const res = evaluateExamResult(questions, savedAnswers, null, exam);
    
    assert.strictEqual(res.totalMarks, 100);
    assert.strictEqual(res.obtainedMarks, 100);
    assert.strictEqual(res.isPassed, true);
    assert.strictEqual(res.grade, 'O');
  });

});
