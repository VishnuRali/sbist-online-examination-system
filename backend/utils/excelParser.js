const XLSX = require('xlsx');

/**
 * Parse Excel file buffer and return array of question objects
 * Expected columns: Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Marks, Topic, Difficulty
 */
const parseQuestionsFromExcel = (buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const questions = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2; // Excel rows start from 2 (row 1 is header)

    const questionText = row['Question'] || row['question'] || row['QUESTION'];
    const optionA = row['OptionA'] || row['Option A'] || row['option_a'] || row['A'];
    const optionB = row['OptionB'] || row['Option B'] || row['option_b'] || row['B'];
    const optionC = row['OptionC'] || row['Option C'] || row['option_c'] || row['C'];
    const optionD = row['OptionD'] || row['Option D'] || row['option_d'] || row['D'];
    const correctAnswer = (row['CorrectAnswer'] || row['Correct Answer'] || row['correct_answer'] || row['Answer'] || '').toString().trim().toUpperCase();
    const marks = parseFloat(row['Marks'] || row['marks'] || 1);
    const topic = row['Topic'] || row['topic'] || '';
    const difficulty = (row['Difficulty'] || row['difficulty'] || 'medium').toLowerCase();

    if (!questionText) {
      errors.push(`Row ${rowNum}: Missing question text`);
      return;
    }
    if (!optionA || !optionB || !optionC || !optionD) {
      errors.push(`Row ${rowNum}: Missing one or more options`);
      return;
    }
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
      errors.push(`Row ${rowNum}: Invalid correct answer "${correctAnswer}". Must be A, B, C, or D`);
      return;
    }

    questions.push({
      questionText: questionText.toString().trim(),
      options: {
        A: optionA.toString().trim(),
        B: optionB.toString().trim(),
        C: optionC.toString().trim(),
        D: optionD.toString().trim(),
      },
      correctAnswer,
      marks: isNaN(marks) ? 1 : marks,
      topic: topic.toString().trim(),
      difficulty: ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium',
    });
  });

  return { questions, errors };
};

/**
 * Generate Excel template for question upload
 */
const generateQuestionTemplate = () => {
  const workbook = XLSX.utils.book_new();
  const data = [
    ['Question', 'OptionA', 'OptionB', 'OptionC', 'OptionD', 'CorrectAnswer', 'Marks', 'Topic', 'Difficulty'],
    [
      'What is the full form of CPU?',
      'Central Processing Unit',
      'Computer Processing Unit',
      'Central Program Unit',
      'Central Process Utility',
      'A', 1, 'Computer Basics', 'easy'
    ],
    [
      'Which of the following is an object-oriented programming language?',
      'C', 'Python', 'Assembly', 'Fortran',
      'B', 2, 'Programming', 'medium'
    ],
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Questions');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};

module.exports = { parseQuestionsFromExcel, generateQuestionTemplate };
