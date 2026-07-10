const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const Student = require('../models/Student');
const multer = require('multer');
const { parseQuestionsFromExcel, generateQuestionTemplate } = require('../utils/excelParser');
const { shuffleArray, calculateGrade } = require('../utils/generateId');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.includes('spreadsheetml') || file.mimetype.includes('excel') || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files are allowed'), false);
    }
  }
});

// ==================== EXAM CRUD ====================

const getExams = async (req, res) => {
  try {
    const { status, department, semester } = req.query;
    const query = {};
    if (status) query.status = status;
    if (department) query.department = department;
    if (semester) query.semester = semester;

    const exams = await Exam.find(query)
      .populate('subject', 'name code')
      .populate('department', 'name code')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, exams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id)
      .populate('subject', 'name code')
      .populate('department', 'name code')
      .populate('createdBy', 'name email');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const normalizeSectionValue = (value) => String(value || '').trim().toUpperCase();

const validateExamOverlap = async (examData, excludeExamId = null) => {
  const { department, year, semester, section, startTime, endTime } = examData;

  const start = new Date(startTime);
  const end = new Date(endTime);
  const targetSection = normalizeSectionValue(section);

  // 1. Duplicate check: Same department, year, semester, section, start time
  const dupQuery = {
    department,
    year,
    semester,
    section: targetSection,
    startTime: start,
  };
  if (excludeExamId) dupQuery._id = { $ne: excludeExamId };
  const duplicate = await Exam.findOne(dupQuery);
  if (duplicate) {
    throw new Error('An identical exam already exists with the same department, year, semester, section, and start time.');
  }

  // 2. Overlap check
  const query = {
    department,
    year,
    semester,
    status: { $in: ['draft', 'scheduled', 'active'] },
  };
  if (excludeExamId) query._id = { $ne: excludeExamId };

  const existingExams = await Exam.find(query);
  const overlaps = existingExams.filter(ex => {
    const existingSection = normalizeSectionValue(ex.section);
    const sectionsOverlap = (targetSection === '' || existingSection === '' || targetSection === existingSection);
    if (!sectionsOverlap) return false;
    const exStart = new Date(ex.startTime);
    const exEnd = new Date(ex.endTime);
    return (start < exEnd && end > exStart);
  });

  if (overlaps.length > 0) {
    const conflicting = overlaps[0];
    throw new Error(`Exam time conflict: This overlaps with "${conflicting.title}" (${new Date(conflicting.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(conflicting.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}).`);
  }
};

const createExam = async (req, res) => {
  try {
    await validateExamOverlap(req.body);
    const examData = { ...req.body, createdBy: req.admin._id };

    // For multi-subject, compute totalMarks from subjects
    if (examData.examType === 'multi' && Array.isArray(examData.subjects) && examData.subjects.length > 0) {
      examData.totalMarks = examData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      examData.passMarks = examData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      // Multi-subject uses total duration of all subjects
      examData.duration = examData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
    }

    const exam = new Exam(examData);
    await exam.save();
    const populated = await exam.populate(['subject', 'department', 'createdBy']);
    res.status(201).json({ success: true, message: 'Exam created successfully', exam: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateExam = async (req, res) => {
  try {
    await validateExamOverlap(req.body, req.params.id);

    const updateData = { ...req.body };
    // For multi-subject, recompute totals from subjects
    if (updateData.examType === 'multi' && Array.isArray(updateData.subjects) && updateData.subjects.length > 0) {
      updateData.totalMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      updateData.passMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      updateData.duration = updateData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
    }

    const exam = await Exam.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('subject department createdBy');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status === 'active') {
      return res.status(400).json({ success: false, message: 'Cannot delete an active exam' });
    }
    await Question.deleteMany({ exam: req.params.id });
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Exam and all questions deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const publishExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const questionCount = await Question.countDocuments({ exam: req.params.id });
    if (questionCount === 0) {
      return res.status(400).json({ success: false, message: 'Add questions before publishing' });
    }

    // For multi-subject, validate each subject has questions
    if (exam.examType === 'multi' && exam.subjects.length > 0) {
      for (let i = 0; i < exam.subjects.length; i++) {
        const count = await Question.countDocuments({ exam: req.params.id, subjectIndex: i });
        if (count === 0) {
          return res.status(400).json({
            success: false,
            message: `Subject "${exam.subjects[i].subjectName}" has no questions. Add questions before publishing.`
          });
        }
      }
    }

    exam.status = 'scheduled';
    exam.totalQuestions = questionCount;
    await exam.save();
    res.json({ success: true, message: 'Exam published', exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXAM SUBJECTS (Multi-subject) ====================

const getExamSubjects = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, subjects: exam.subjects, examType: exam.examType });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addExamSubject = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const { subjectName, subjectCode, duration, totalMarks, passMarks, negativeMarking } = req.body;
    if (!subjectName || !duration || !totalMarks || passMarks === undefined) {
      return res.status(400).json({ success: false, message: 'subjectName, duration, totalMarks, passMarks are required' });
    }

    exam.subjects.push({
      subjectName: subjectName.trim(),
      subjectCode: (subjectCode || '').trim().toUpperCase(),
      duration: Number(duration),
      totalMarks: Number(totalMarks),
      passMarks: Number(passMarks),
      negativeMarking: !!negativeMarking,
      order: exam.subjects.length,
    });

    // Recompute exam totals
    exam.totalMarks = exam.subjects.reduce((sum, s) => sum + s.totalMarks, 0);
    exam.passMarks = exam.subjects.reduce((sum, s) => sum + s.passMarks, 0);
    exam.duration = exam.subjects.reduce((sum, s) => sum + s.duration, 0);
    exam.examType = 'multi';

    await exam.save();
    res.json({ success: true, message: 'Subject added', subjects: exam.subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateExamSubject = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const idx = parseInt(req.params.subjectIndex);
    if (isNaN(idx) || idx < 0 || idx >= exam.subjects.length) {
      return res.status(400).json({ success: false, message: 'Invalid subject index' });
    }

    const { subjectName, subjectCode, duration, totalMarks, passMarks, negativeMarking } = req.body;
    if (subjectName !== undefined) exam.subjects[idx].subjectName = subjectName.trim();
    if (subjectCode !== undefined) exam.subjects[idx].subjectCode = subjectCode.trim().toUpperCase();
    if (duration !== undefined) exam.subjects[idx].duration = Number(duration);
    if (totalMarks !== undefined) exam.subjects[idx].totalMarks = Number(totalMarks);
    if (passMarks !== undefined) exam.subjects[idx].passMarks = Number(passMarks);
    if (negativeMarking !== undefined) exam.subjects[idx].negativeMarking = !!negativeMarking;

    // Recompute totals
    exam.totalMarks = exam.subjects.reduce((sum, s) => sum + s.totalMarks, 0);
    exam.passMarks = exam.subjects.reduce((sum, s) => sum + s.passMarks, 0);
    exam.duration = exam.subjects.reduce((sum, s) => sum + s.duration, 0);

    // Mark subjects as modified (mongoose subdocument)
    exam.markModified('subjects');
    await exam.save();
    res.json({ success: true, message: 'Subject updated', subjects: exam.subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteExamSubject = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const idx = parseInt(req.params.subjectIndex);
    if (isNaN(idx) || idx < 0 || idx >= exam.subjects.length) {
      return res.status(400).json({ success: false, message: 'Invalid subject index' });
    }

    // Remove questions for this subject
    await Question.deleteMany({ exam: exam._id, subjectIndex: idx });

    // Re-index questions for subjects after the deleted one
    await Question.updateMany(
      { exam: exam._id, subjectIndex: { $gt: idx } },
      { $inc: { subjectIndex: -1 } }
    );

    exam.subjects.splice(idx, 1);

    // Fix order field
    exam.subjects.forEach((s, i) => { s.order = i; });

    // Recompute totals
    if (exam.subjects.length > 0) {
      exam.totalMarks = exam.subjects.reduce((sum, s) => sum + s.totalMarks, 0);
      exam.passMarks = exam.subjects.reduce((sum, s) => sum + s.passMarks, 0);
      exam.duration = exam.subjects.reduce((sum, s) => sum + s.duration, 0);
    }

    if (exam.subjects.length === 0) exam.examType = 'single';

    exam.markModified('subjects');
    await exam.save();

    // Update totalQuestions
    const questionCount = await Question.countDocuments({ exam: exam._id });
    exam.totalQuestions = questionCount;
    await exam.save();

    res.json({ success: true, message: 'Subject deleted', subjects: exam.subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const reorderExamSubjects = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const { order } = req.body; // Array of indices in new order, e.g. [2, 0, 1]
    if (!Array.isArray(order) || order.length !== exam.subjects.length) {
      return res.status(400).json({ success: false, message: 'Invalid order array' });
    }

    const reordered = order.map((oldIdx, newIdx) => ({
      ...exam.subjects[oldIdx].toObject(),
      order: newIdx,
    }));

    // Also update question subjectIndex values to match new order
    const oldToNew = {};
    order.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });

    // Batch update questions
    const updateOps = Object.entries(oldToNew).map(([oldIdx, newIdx]) =>
      Question.updateMany(
        { exam: exam._id, subjectIndex: parseInt(oldIdx) },
        { $set: { subjectIndex: newIdx } }
      )
    );
    await Promise.all(updateOps);

    exam.subjects = reordered;
    exam.markModified('subjects');
    await exam.save();

    res.json({ success: true, message: 'Subjects reordered', subjects: exam.subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== QUESTIONS ====================

const getQuestions = async (req, res) => {
  try {
    const query = { exam: req.params.examId };
    // Support ?subjectIndex=N filter for multi-subject
    if (req.query.subjectIndex !== undefined) {
      query.subjectIndex = parseInt(req.query.subjectIndex);
    }
    const questions = await Question.find(query).sort({ subjectIndex: 1, order: 1, createdAt: 1 });
    res.json({ success: true, questions, count: questions.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addQuestion = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const subjectIndex = req.body.subjectIndex !== undefined ? parseInt(req.body.subjectIndex) : 0;
    const count = await Question.countDocuments({ exam: req.params.examId, subjectIndex });
    const question = new Question({ ...req.body, exam: req.params.examId, subjectIndex, order: count + 1 });
    await question.save();

    const totalCount = await Question.countDocuments({ exam: req.params.examId });
    exam.totalQuestions = totalCount;
    await exam.save();

    res.status(201).json({ success: true, message: 'Question added', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.questionId, req.body, { new: true });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.questionId);
    const exam = await Exam.findById(req.params.examId);
    if (exam) {
      exam.totalQuestions = await Question.countDocuments({ exam: req.params.examId });
      await exam.save();
    }
    res.json({ success: true, message: 'Question deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkUploadQuestions = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const { questions, errors } = parseQuestionsFromExcel(req.file.buffer);

    if (questions.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid questions found', errors });
    }

    const exam = await Exam.findById(req.params.examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const subjectIndex = req.body.subjectIndex !== undefined ? parseInt(req.body.subjectIndex) : 0;
    const existingCount = await Question.countDocuments({ exam: req.params.examId, subjectIndex });
    const questionsWithExam = questions.map((q, i) => ({
      ...q,
      exam: req.params.examId,
      subjectIndex,
      order: existingCount + i + 1,
    }));

    await Question.insertMany(questionsWithExam);

    const totalCount = await Question.countDocuments({ exam: req.params.examId });
    exam.totalQuestions = totalCount;
    await exam.save();

    res.json({
      success: true,
      message: `${questions.length} questions uploaded successfully`,
      uploaded: questions.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const downloadQuestionTemplate = async (req, res) => {
  try {
    const buffer = generateQuestionTemplate();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=question_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== FORCE SUBMIT ====================

const forceSubmitStudent = async (req, res) => {
  try {
    const { studentId, examId } = req.params;

    const result = await Result.findOne({ student: studentId, exam: examId, status: 'in_progress' });
    if (!result) return res.status(404).json({ success: false, message: 'Active exam session not found' });

    const questions = await Question.find({ exam: examId });
    const exam = await Exam.findById(examId);

    // savedProgress.answers is a Map — retrieve correctly
    const savedAnswers = result.savedProgress?.answers;
    const optionMappings = result.savedProgress?.optionMappings;

    const getAnswer = (questionId) => {
      const qIdStr = questionId.toString();
      if (savedAnswers && typeof savedAnswers.get === 'function') return savedAnswers.get(qIdStr);
      if (savedAnswers && typeof savedAnswers === 'object') return savedAnswers[qIdStr];
      return null;
    };

    const getOriginalAnswer = (questionId, displayKey) => {
      if (!displayKey) return null;
      if (!optionMappings) return displayKey;
      const qIdStr = questionId.toString();
      const mapping = typeof optionMappings.get === 'function'
        ? optionMappings.get(qIdStr)
        : (optionMappings[qIdStr] || null);
      if (!mapping) return displayKey;
      // mapping is { displayKey -> originalKey }, e.g. { A: 'C', B: 'A', C: 'D', D: 'B' }
      return mapping[displayKey] || displayKey;
    };

    let obtainedMarks = 0, correct = 0, wrong = 0, skipped = 0;
    const subjectStats = {};

    questions.forEach(q => {
      const si = q.subjectIndex || 0;
      if (!subjectStats[si]) subjectStats[si] = { obtained: 0, total: 0, correct: 0, wrong: 0, skipped: 0 };
      subjectStats[si].total += q.marks;

      const displayAnswer = getAnswer(q._id);
      const selected = getOriginalAnswer(q._id, displayAnswer);

      if (!selected) {
        skipped++;
        subjectStats[si].skipped++;
      } else if (selected.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()) {
        obtainedMarks += q.marks;
        correct++;
        subjectStats[si].obtained += q.marks;
        subjectStats[si].correct++;
      } else {
        wrong++;
        subjectStats[si].wrong++;
        const useNegative = exam?.examType === 'multi'
          ? (exam.subjects[si]?.negativeMarking)
          : exam?.negativeMarking;
        if (useNegative && q.negativeMark > 0) {
          obtainedMarks -= q.negativeMark;
          subjectStats[si].obtained -= q.negativeMark;
        }
      }
    });

    obtainedMarks = Math.max(0, obtainedMarks);
    const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
    const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;

    // Build subject results for multi-subject
    const subjectResults = [];
    if (exam?.examType === 'multi' && exam.subjects.length > 0) {
      exam.subjects.forEach((subj, i) => {
        const stats = subjectStats[i] || { obtained: 0, total: subj.totalMarks, correct: 0, wrong: 0, skipped: 0 };
        const subjObtained = Math.max(0, stats.obtained);
        subjectResults.push({
          subjectName: subj.subjectName,
          subjectIndex: i,
          obtainedMarks: subjObtained,
          totalMarks: subj.totalMarks,
          passMarks: subj.passMarks,
          isPassed: subjObtained >= subj.passMarks,
          correctAnswers: stats.correct,
          wrongAnswers: stats.wrong,
          skippedAnswers: stats.skipped,
          percentage: subj.totalMarks > 0 ? (subjObtained / subj.totalMarks) * 100 : 0,
        });
      });
    }

    result.status = 'force_submitted';
    result.submittedAt = new Date();
    result.obtainedMarks = obtainedMarks;
    result.totalMarks = totalMarks;
    result.correctAnswers = correct;
    result.wrongAnswers = wrong;
    result.skippedAnswers = skipped;
    result.percentage = percentage;
    result.isPassed = obtainedMarks >= (exam?.passMarks || 0);
    result.grade = calculateGrade(percentage);
    result.subjectResults = subjectResults;
    await result.save();

    await Student.findByIdAndUpdate(studentId, { currentExam: null });

    res.json({ success: true, message: 'Student exam force submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== RESULTS ====================

const getExamResults = async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId, status: { $ne: 'in_progress' } })
      .populate('student', 'name studentId rollNumber department year semester section')
      .populate({ path: 'student', populate: { path: 'department', select: 'name code' } })
      .populate('exam', 'title totalMarks passMarks examType subjects')
      .sort({ obtainedMarks: -1 });

    const rankedResults = results.map((r, i) => ({ ...r.toObject(), rank: i + 1 }));
    res.json({ success: true, results: rankedResults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXCEL EXPORT ====================

const exportResultsExcel = async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId, status: { $ne: 'in_progress' } })
      .populate({
        path: 'student',
        select: 'name studentId rollNumber email year semester section',
        populate: { path: 'department', select: 'name' }
      })
      .populate({
        path: 'exam',
        select: 'title totalMarks passMarks subject examType subjects',
        populate: { path: 'subject', select: 'name' }
      })
      .sort({ obtainedMarks: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Results');

    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const subjectNames = isMulti ? exam.subjects.map(s => s.subjectName) : [];

    sheet.mergeCells('A1:P1');
    sheet.getCell('A1').value = 'SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:P2');
    sheet.getCell('A2').value = `Result Report: ${exam?.title || 'Exam'}`;
    sheet.getCell('A2').font = { bold: true, size: 12 };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.addRow([]);

    // Build columns dynamically
    const baseColumns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Student ID', key: 'studentId', width: 18 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll No', key: 'rollNumber', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
    ];

    const subjectColumns = subjectNames.map((sn, i) => [
      { header: `${sn} (Marks)`, key: `subj_${i}_marks`, width: 16 },
      { header: `${sn} (Status)`, key: `subj_${i}_status`, width: 14 },
    ]).flat();

    const trailingColumns = [
      { header: 'Total Marks', key: 'total', width: 12 },
      { header: 'Obtained', key: 'obtained', width: 12 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Correct', key: 'correct', width: 10 },
      { header: 'Wrong', key: 'wrong', width: 10 },
    ];

    sheet.columns = [...baseColumns, ...subjectColumns, ...trailingColumns];

    const headerRow = sheet.getRow(4);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    results.forEach((r, i) => {
      const rowData = {
        rank: i + 1,
        studentId: r.student?.studentId,
        name: r.student?.name,
        rollNumber: r.student?.rollNumber,
        department: r.student?.department?.name || 'N/A',
        year: r.student?.year || '',
        semester: r.student?.semester || '',
        total: r.totalMarks,
        obtained: r.obtainedMarks,
        percentage: `${(r.percentage || 0).toFixed(2)}%`,
        grade: r.grade,
        status: r.isPassed ? 'PASS' : 'FAIL',
        correct: r.correctAnswers,
        wrong: r.wrongAnswers,
      };

      // Add per-subject data
      if (isMulti && r.subjectResults) {
        subjectNames.forEach((sn, si) => {
          const sr = r.subjectResults.find(x => x.subjectIndex === si);
          rowData[`subj_${si}_marks`] = sr ? `${sr.obtainedMarks}/${sr.totalMarks}` : 'N/A';
          rowData[`subj_${si}_status`] = sr ? (sr.isPassed ? 'PASS' : 'FAIL') : 'N/A';
        });
      }

      const row = sheet.addRow(rowData);
      const statusCell = row.getCell('status');
      statusCell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: r.isPassed ? 'FF16A34A' : 'FFDC2626' }
      };
      statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=results_${req.params.examId}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CSV EXPORT ====================

const exportResultsCSV = async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId, status: { $ne: 'in_progress' } })
      .populate({ path: 'student', select: 'name studentId rollNumber year semester', populate: { path: 'department', select: 'name' } })
      .populate({ path: 'exam', select: 'title totalMarks passMarks subject examType subjects', populate: { path: 'subject', select: 'name' } })
      .sort({ obtainedMarks: -1 });

    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const subjectNames = isMulti ? exam.subjects.map(s => s.subjectName) : [];
    const examTitle = exam?.title || 'Exam';

    // Build header
    let headerParts = ['Rank', 'Student ID', 'Name', 'Roll No', 'Department', 'Year', 'Semester'];
    if (isMulti) {
      subjectNames.forEach(sn => {
        headerParts.push(`"${sn} Marks"`, `"${sn} Status"`);
      });
    } else {
      headerParts.push('Subject');
    }
    headerParts = [...headerParts, 'Total Marks', 'Obtained', 'Percentage', 'Grade', 'Status', 'Correct', 'Wrong', 'Skipped'];
    const header = headerParts.join(',') + '\n';

    const rows = results.map((r, i) => {
      const parts = [
        i + 1,
        r.student?.studentId || '',
        `"${r.student?.name || ''}"`,
        r.student?.rollNumber || '',
        `"${r.student?.department?.name || ''}"`,
        r.student?.year || '',
        r.student?.semester || '',
      ];

      if (isMulti) {
        subjectNames.forEach((sn, si) => {
          const sr = r.subjectResults?.find(x => x.subjectIndex === si);
          parts.push(sr ? `${sr.obtainedMarks}/${sr.totalMarks}` : 'N/A');
          parts.push(sr ? (sr.isPassed ? 'PASS' : 'FAIL') : 'N/A');
        });
      } else {
        parts.push(`"${exam?.subject?.name || 'N/A'}"`);
      }

      parts.push(
        r.totalMarks,
        r.obtainedMarks,
        `${(r.percentage || 0).toFixed(2)}%`,
        r.grade,
        r.isPassed ? 'PASS' : 'FAIL',
        r.correctAnswers,
        r.wrongAnswers,
        r.skippedAnswers,
      );
      return parts.join(',');
    }).join('\n');

    const csv = header + rows;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=results_${examTitle.replace(/\s+/g, '_')}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== PDF EXPORT ====================

const exportResultsPDF = async (req, res) => {
  try {
    const results = await Result.find({ exam: req.params.examId, status: { $ne: 'in_progress' } })
      .populate({ path: 'student', select: 'name studentId rollNumber year semester', populate: { path: 'department', select: 'name' } })
      .populate({ path: 'exam', select: 'title totalMarks passMarks subject startTime examType subjects', populate: { path: 'subject', select: 'name' } })
      .sort({ obtainedMarks: -1 });

    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=results_${req.params.examId}.pdf`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#1e3a8a');
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text('SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY', 40, 18, { align: 'center' });
    const subjectLabel = isMulti
      ? `Subjects: ${exam.subjects.map(s => s.subjectName).join(', ')}`
      : `Subject: ${exam?.subject?.name || '—'}`;
    doc.fontSize(11).font('Helvetica')
      .text(`Result Report: ${exam?.title || 'Exam'} | ${subjectLabel} | Generated: ${new Date().toLocaleString('en-IN')}`, 40, 44, { align: 'center' });

    // Stats bar
    const total = results.length;
    const passed = results.filter(r => r.isPassed).length;
    const avgPct = total > 0 ? (results.reduce((s, r) => s + (r.percentage || 0), 0) / total).toFixed(1) : 0;
    doc.rect(0, 80, doc.page.width, 28).fill('#0f172a');
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(10)
      .text(`Total Students: ${total}   |   Passed: ${passed}   |   Failed: ${total - passed}   |   Pass Rate: ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%   |   Avg Score: ${avgPct}%`, 40, 89, { align: 'center' });

    // Table
    const cols = isMulti
      ? [25, 55, 100, 55, 90, ...exam.subjects.map(() => [45, 35]).flat(), 40, 40, 35, 30, 40]
      : [30, 60, 110, 60, 110, 110, 45, 45, 40, 40, 45];
    const headers = isMulti
      ? ['Rank', 'Std ID', 'Name', 'Roll No', 'Dept', ...exam.subjects.map(s => [`${s.subjectName.slice(0, 6)} Marks`, 'Status']).flat(), 'Total', 'Marks', '%', 'Grd', 'Status']
      : ['Rank', 'Std ID', 'Name', 'Roll No', 'Dept', 'Subject', 'Total', 'Marks', '%', 'Grade', 'Status'];

    let y = 120;
    doc.rect(40, y, doc.page.width - 80, 20).fill('#1e40af');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(7);
    let x = 42;
    headers.forEach((h, i) => { doc.text(h, x, y + 6, { width: cols[i] - 2 }); x += cols[i]; });
    y += 20;

    results.forEach((r, idx) => {
      const rowFill = idx % 2 === 0 ? '#f8fafc' : 'white';
      doc.rect(40, y, doc.page.width - 80, 18).fill(rowFill);
      doc.fillColor('#1e293b').font('Helvetica').fontSize(7);
      x = 42;

      const vals = isMulti
        ? [
          String(idx + 1),
          r.student?.studentId || '',
          r.student?.name || '',
          r.student?.rollNumber || '',
          r.student?.department?.name || '',
          ...exam.subjects.map((s, si) => {
            const sr = r.subjectResults?.find(x => x.subjectIndex === si);
            return [sr ? `${sr.obtainedMarks}/${sr.totalMarks}` : '-', sr ? (sr.isPassed ? 'PASS' : 'FAIL') : '-'];
          }).flat(),
          String(r.totalMarks),
          String(r.obtainedMarks),
          `${(r.percentage || 0).toFixed(1)}%`,
          r.grade,
          r.isPassed ? 'PASS' : 'FAIL',
        ]
        : [
          String(idx + 1),
          r.student?.studentId || '',
          r.student?.name || '',
          r.student?.rollNumber || '',
          r.student?.department?.name || '',
          r.exam?.subject?.name || '',
          String(r.totalMarks),
          String(r.obtainedMarks),
          `${(r.percentage || 0).toFixed(1)}%`,
          r.grade,
          r.isPassed ? 'PASS' : 'FAIL',
        ];

      vals.forEach((v, i) => {
        const isStatusCol = i === vals.length - 1;
        doc.fillColor(isStatusCol ? (r.isPassed ? '#15803d' : '#b91c1c') : '#1e293b')
          .text(v, x, y + 5, { width: cols[i] - 2 });
        x += cols[i];
      });

      y += 18;
      if (y > doc.page.height - 60) { doc.addPage({ layout: 'landscape' }); y = 40; }
    });

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getExams, getExamById, createExam, updateExam, deleteExam, publishExam,
  getExamSubjects, addExamSubject, updateExamSubject, deleteExamSubject, reorderExamSubjects,
  getQuestions, addQuestion, updateQuestion, deleteQuestion, bulkUploadQuestions,
  downloadQuestionTemplate, forceSubmitStudent, getExamResults,
  exportResultsExcel, exportResultsCSV, exportResultsPDF,
  upload,
};
