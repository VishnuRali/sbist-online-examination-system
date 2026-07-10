const calculateGrade = (percentage) => {
  if (percentage >= 90) return 'O';
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'B+';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  return 'F';
};

const evaluateExamResult = (questions, savedAnswers, optionMappings, exam) => {
  // Helper to resolve original answer when options are randomized
  const resolveOriginalAnswer = (questionId, displayKey, optionMappings) => {
    if (!displayKey) return null;
    const normalized = displayKey.trim().toUpperCase();
    if (!optionMappings) return normalized;

    const qIdStr = questionId.toString();
    let mapping = null;
    if (typeof optionMappings.get === 'function') {
      mapping = optionMappings.get(qIdStr);
    } else if (typeof optionMappings === 'object') {
      mapping = optionMappings[qIdStr] || null;
    }

    if (!mapping) return normalized;
    return (mapping[normalized] || normalized).trim().toUpperCase();
  };

  const getSavedAnswer = (savedAnswers, questionId) => {
    const qIdStr = questionId.toString();
    if (!savedAnswers) return null;
    if (typeof savedAnswers.get === 'function') return savedAnswers.get(qIdStr) || null;
    return savedAnswers[qIdStr] || null;
  };

  let obtainedMarks = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  const subjectStats = {};

  questions.forEach(q => {
    const si = q.subjectIndex || 0;
    if (!subjectStats[si]) {
      subjectStats[si] = { obtained: 0, total: 0, correct: 0, wrong: 0, skipped: 0 };
    }
    subjectStats[si].total += q.marks;

    const displayAnswer = getSavedAnswer(savedAnswers, q._id);
    const originalAnswer = resolveOriginalAnswer(q._id, displayAnswer, optionMappings);

    if (!originalAnswer) {
      skipped++;
      subjectStats[si].skipped++;
    } else if (originalAnswer === q.correctAnswer.trim().toUpperCase()) {
      obtainedMarks += q.marks;
      correct++;
      subjectStats[si].obtained += q.marks;
      subjectStats[si].correct++;
    } else {
      wrong++;
      subjectStats[si].wrong++;
      
      const useNegative = exam?.examType === 'multi'
        ? (exam.subjects?.[si]?.negativeMarking === true)
        : (exam?.negativeMarking === true);

      if (useNegative && q.negativeMark > 0) {
        obtainedMarks -= q.negativeMark;
        subjectStats[si].obtained -= q.negativeMark;
      }
    }
  });

  obtainedMarks = Math.max(0, obtainedMarks);
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

  // Compute passing based on pass percentage threshold
  const examTotal = exam?.totalMarks || 100;
  const examPass = exam?.passMarks || 40;
  const passPercentage = examTotal > 0 ? Math.min(100, (examPass / examTotal) * 100) : 40;
  const requiredMarks = Math.ceil((passPercentage / 100) * totalMarks);
  const isPassed = obtainedMarks >= requiredMarks;

  const grade = calculateGrade(percentage);

  // Build subjectResults
  const subjectResults = [];
  if (exam?.examType === 'multi' && Array.isArray(exam.subjects) && exam.subjects.length > 0) {
    exam.subjects.forEach((subj, i) => {
      const stats = subjectStats[i] || { obtained: 0, total: subj.totalMarks, correct: 0, wrong: 0, skipped: 0 };
      const subjObtained = Math.max(0, stats.obtained);
      const subjPassPercentage = subj.totalMarks > 0 ? Math.min(100, (subj.passMarks / subj.totalMarks) * 100) : 40;
      const subjRequiredMarks = Math.ceil((subjPassPercentage / 100) * stats.total);

      subjectResults.push({
        subjectName: subj.subjectName,
        subjectIndex: i,
        obtainedMarks: subjObtained,
        totalMarks: stats.total,
        passMarks: subjRequiredMarks,
        isPassed: subjObtained >= subjRequiredMarks,
        correctAnswers: stats.correct,
        wrongAnswers: stats.wrong,
        skippedAnswers: stats.skipped,
        percentage: stats.total > 0 ? (subjObtained / stats.total) * 100 : 0,
      });
    });
  }

  return {
    totalMarks,
    obtainedMarks,
    percentage,
    isPassed,
    grade,
    correctAnswers: correct,
    wrongAnswers: wrong,
    skippedAnswers: skipped,
    subjectResults
  };
};

module.exports = {
  calculateGrade,
  evaluateExamResult
};
