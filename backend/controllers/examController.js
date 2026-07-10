const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const Student = require('../models/Student');
const multer = require('multer');
const { parseQuestionsFromExcel, generateQuestionTemplate } = require('../utils/excelParser');
const { shuffleArray } = require('../utils/generateId');
const { evaluateExamResult, calculateGrade } = require('../utils/resultEvaluator');
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
  const { department, year, semester, section, sections, startTime, endTime } = examData;

  const start = new Date(startTime);
  const end = new Date(endTime);
  
  const normalizeSection = (value) => String(value || '').trim().toUpperCase();
  const targetSections = Array.isArray(sections) && sections.length > 0
    ? sections.map(s => normalizeSection(s))
    : (section ? [normalizeSection(section)] : []);

  // 1. Duplicate check: Same department, year, semester, section, start time
  const dupQuery = {
    department,
    year,
    semester,
    startTime: start,
  };
  if (excludeExamId) dupQuery._id = { $ne: excludeExamId };
  
  const existingWithSameTime = await Exam.find(dupQuery);
  const duplicate = existingWithSameTime.find(ex => {
    const exSections = Array.isArray(ex.sections) && ex.sections.length > 0
      ? ex.sections.map(s => normalizeSection(s))
      : (ex.section ? [normalizeSection(ex.section)] : []);
    
    return exSections.length === 0 || targetSections.length === 0 ||
      exSections.some(s => targetSections.includes(s));
  });

  if (duplicate) {
    throw new Error('An identical exam already exists with the same department, year, semester, sections, and start time.');
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
    const exSections = Array.isArray(ex.sections) && ex.sections.length > 0
      ? ex.sections.map(s => normalizeSection(s))
      : (ex.section ? [normalizeSection(ex.section)] : []);

    const sectionsOverlap = exSections.length === 0 || targetSections.length === 0 ||
      exSections.some(s => targetSections.includes(s));
    
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
      examData.subjects.forEach(s => {
        if (Number(s.passMarks) > Number(s.totalMarks)) {
          throw new Error(`Passing marks for subject "${s.subjectName}" cannot be greater than its total marks.`);
        }
      });
      examData.totalMarks = examData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      examData.passMarks = examData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      examData.duration = examData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
    } else {
      if (Number(examData.passMarks) > Number(examData.totalMarks)) {
        throw new Error('Passing marks cannot be greater than total marks.');
      }
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
      updateData.subjects.forEach(s => {
        if (Number(s.passMarks) > Number(s.totalMarks)) {
          throw new Error(`Passing marks for subject "${s.subjectName}" cannot be greater than its total marks.`);
        }
      });
      updateData.totalMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      updateData.passMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      updateData.duration = updateData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
    } else {
      if (Number(updateData.passMarks) > Number(updateData.totalMarks)) {
        throw new Error('Passing marks cannot be greater than total marks.');
      }
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

    // Trigger automatic section-wise email notifications
    const report = await sendPublishNotifications(exam._id);

    res.json({ success: true, message: 'Exam published and notifications sent', exam, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const sendPublishNotifications = async (examId, targetFailedStudentIds = null) => {
  const EmailLog = require('../models/EmailLog');
  const { getGmailConfig, createTransporter, getReminderEmailHTML, parseSmtpError } = require('../utils/emailService');

  const exam = await Exam.findById(examId).populate('department subject');
  if (!exam) throw new Error('Exam not found');

  const normalizeSection = (value) => String(value || '')
    .trim()
    .toUpperCase();

  const examSections = Array.isArray(exam.sections) && exam.sections.length > 0
    ? exam.sections.map(s => normalizeSection(s))
    : (exam.section ? [normalizeSection(exam.section)] : []);

  const studentQuery = {
    department: exam.department?._id || exam.department,
    year: String(exam.year),
    semester: String(exam.semester),
    isActive: true
  };

  // If specific sections are selected, limit to those sections
  if (examSections.length > 0 && !examSections.includes('ALL') && !examSections.includes('')) {
    studentQuery.section = { $in: examSections };
  }

  // If retrying, limit only to those failed student IDs
  if (targetFailedStudentIds && Array.isArray(targetFailedStudentIds)) {
    studentQuery._id = { $in: targetFailedStudentIds };
  }

  const eligibleStudents = await Student.find(studentQuery).populate('department');

  // Load SMTP config
  const { user, pass, portalUrl } = await getGmailConfig();
  const isSmtpConfigured = !!(user && pass && !user.includes('your_gmail'));
  
  let sentCount = 0;
  let failedCount = 0;
  const failedStudentsList = [];

  const transporter = isSmtpConfigured ? createTransporter(user, pass) : null;

  for (const student of eligibleStudents) {
    // Generate email HTML
    const emailHtml = getReminderEmailHTML(student, exam, 'custom', portalUrl);
    
    // Create email log
    const log = new EmailLog({
      to: student.email,
      studentName: student.name,
      studentId: student.studentId,
      studentRef: student._id,
      emailType: 'custom',
      subject: `📚 Exam Announcement: ${exam.title}`,
      body: emailHtml,
      status: 'pending',
      department: student.department?._id || student.department,
      year: student.year,
      semester: student.semester,
      section: student.section,
      exam: exam._id
    });
    await log.save();

    if (!isSmtpConfigured) {
      log.status = 'failed';
      log.errorMessage = 'SMTP credentials not configured';
      await log.save();
      failedCount++;
      failedStudentsList.push({
        _id: student._id.toString(),
        name: student.name,
        studentId: student.studentId,
        email: student.email,
        section: student.section || '—',
        reason: 'SMTP credentials not configured'
      });
      continue;
    }

    try {
      await transporter.sendMail({
        from: `"SBIST Exam Portal" <${user}>`,
        to: student.email,
        subject: `📚 Exam Announcement: ${exam.title}`,
        html: emailHtml
      });

      log.status = 'sent';
      log.sentAt = new Date();
      await log.save();
      sentCount++;
    } catch (err) {
      const errorMsg = parseSmtpError(err);
      log.status = 'failed';
      log.errorMessage = errorMsg;
      await log.save();
      failedCount++;
      failedStudentsList.push({
        _id: student._id.toString(),
        name: student.name,
        studentId: student.studentId,
        email: student.email,
        section: student.section || '—',
        reason: errorMsg
      });
    }

    // Add tiny delay to protect Gmail limits
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return {
    selectedSections: examSections.length > 0 ? examSections.join(', ') : 'All Sections',
    eligibleCount: eligibleStudents.length,
    sentCount,
    failedCount,
    failedStudents: failedStudentsList
  };
};

const retryPublishNotifications = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const { id } = req.params; // examId
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds array is required' });
    }

    const report = await sendPublishNotifications(id, studentIds);
    res.json({ success: true, report });
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

const syncExamMarksAndQuestions = async (examId) => {
  const exam = await Exam.findById(examId);
  if (!exam) return;
  exam.totalQuestions = await Question.countDocuments({ exam: examId });
  const allQs = await Question.find({ exam: examId });
  const computedTotalMarks = allQs.reduce((sum, q) => sum + (q.marks || 0), 0);
  
  if (exam.examType !== 'multi') {
    if (computedTotalMarks > 0) {
      exam.totalMarks = computedTotalMarks;
      // ensure passMarks <= totalMarks
      if (exam.passMarks > exam.totalMarks) {
        exam.passMarks = exam.totalMarks;
      }
    }
  } else {
    // For multi-subject, sync the subject totalMarks based on their questions
    const subjectMarksMap = {};
    allQs.forEach(q => {
      const idx = q.subjectIndex || 0;
      subjectMarksMap[idx] = (subjectMarksMap[idx] || 0) + (q.marks || 0);
    });
    
    if (exam.subjects && exam.subjects.length > 0) {
      exam.subjects.forEach((s, idx) => {
        const computedSubjTotal = subjectMarksMap[idx] || 0;
        if (computedSubjTotal > 0) {
          s.totalMarks = computedSubjTotal;
          if (s.passMarks > s.totalMarks) {
            s.passMarks = s.totalMarks;
          }
        }
      });
      exam.totalMarks = exam.subjects.reduce((sum, s) => sum + s.totalMarks, 0);
      exam.passMarks = exam.subjects.reduce((sum, s) => sum + s.passMarks, 0);
    }
  }
  await exam.save();
};

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

    await syncExamMarksAndQuestions(req.params.examId);

    res.status(201).json({ success: true, message: 'Question added', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.questionId, req.body, { new: true });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    await syncExamMarksAndQuestions(question.exam);

    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    const examId = question.exam;

    await Question.findByIdAndDelete(req.params.questionId);
    await syncExamMarksAndQuestions(examId);

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

    await syncExamMarksAndQuestions(req.params.examId);

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

    const evaluation = evaluateExamResult(questions, result.savedProgress?.answers, result.savedProgress?.optionMappings, exam);

    result.status = 'force_submitted';
    result.submittedAt = new Date();
    result.obtainedMarks = evaluation.obtainedMarks;
    result.totalMarks = evaluation.totalMarks;
    result.correctAnswers = evaluation.correctAnswers;
    result.wrongAnswers = evaluation.wrongAnswers;
    result.skippedAnswers = evaluation.skippedAnswers;
    result.percentage = evaluation.percentage;
    result.isPassed = evaluation.isPassed;
    result.grade = evaluation.grade;
    result.subjectResults = evaluation.subjectResults;
    await result.save();

    await Student.findByIdAndUpdate(studentId, { currentExam: null });

    res.json({ success: true, message: 'Student exam force submitted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== RESULTS ====================

const computeResultsList = async (examId, query) => {
  const { department, year, semester, section, examStatus, resultStatus, search, dateFrom, dateTo } = query;

  const exam = await Exam.findById(examId).populate('department subject');
  if (!exam) return [];

  // Find all students matching exam's target
  const studentQuery = { isActive: true };
  const examDeptId = exam.department?._id || exam.department;
  if (examDeptId) studentQuery.department = examDeptId;
  if (exam.year) studentQuery.year = String(exam.year).trim();
  if (exam.semester) studentQuery.semester = String(exam.semester).trim();
  if (exam.section && exam.section.trim() !== '') {
    studentQuery.section = exam.section.trim().toUpperCase();
  }

  const students = await Student.find(studentQuery).populate('department', 'name code').select('-password');

  // Find all results for this exam
  const results = await Result.find({ exam: examId });

  // Map of studentId -> result
  const resultMap = {};
  results.forEach(r => {
    resultMap[r.student.toString()] = r;
  });

  const now = new Date();
  const startTime = new Date(exam.startTime);
  const endTime = new Date(exam.endTime);

  let list = students.map(student => {
    const result = resultMap[student._id.toString()];
    let currentStatus = 'Not Started';
    if (!result) {
      if (now < startTime) currentStatus = 'Waiting';
      else if (now > endTime) currentStatus = 'Absent';
      else currentStatus = 'Not Started';
    } else {
      if (result.violations >= (exam.maxViolations || 3)) currentStatus = 'Disqualified';
      else if (result.status === 'in_progress') currentStatus = 'In Progress (Writing Exam)';
      else if (result.status === 'auto_submitted') currentStatus = 'Auto Submitted';
      else if (result.status === 'submitted' || result.status === 'force_submitted') {
        currentStatus = result.isPassed ? 'Completed' : 'Submitted';
      }
    }

    return {
      _id: result ? result._id : null,
      student: {
        _id: student._id,
        studentId: student.studentId,
        name: student.name,
        rollNumber: student.rollNumber,
        department: student.department,
        year: student.year,
        semester: student.semester,
        section: student.section,
        email: student.email,
        mobile: student.mobile,
        isActive: student.isActive
      },
      exam: {
        _id: exam._id,
        title: exam.title,
        subjects: exam.examType === 'multi' ? exam.subjects.map(s => s.subjectName) : [exam.subject?.name],
        examType: exam.examType,
        subject: exam.subject,
        startTime: exam.startTime,
        endTime: exam.endTime,
        duration: exam.duration,
        totalMarks: exam.totalMarks,
        passMarks: exam.passMarks
      },
      obtainedMarks: result ? result.obtainedMarks : 0,
      totalMarks: result ? result.totalMarks : exam.totalMarks,
      percentage: result ? result.percentage : 0,
      isPassed: result ? result.isPassed : false,
      grade: result ? result.grade : '—',
      submittedAt: result ? result.submittedAt : null,
      timeSpent: result ? result.timeSpent : 0,
      violations: result ? result.violations : 0,
      status: currentStatus,
      resultId: result ? result._id : null,
      subjectResults: result ? result.subjectResults : []
    };
  });

  // Apply filters
  if (department) {
    list = list.filter(item => item.student.department?._id?.toString() === department);
  }
  if (year) {
    list = list.filter(item => String(item.student.year).trim() === String(year).trim());
  }
  if (semester) {
    list = list.filter(item => String(item.student.semester).trim() === String(semester).trim());
  }
  if (section) {
    list = list.filter(item => String(item.student.section).trim().toUpperCase() === String(section).trim().toUpperCase());
  }
  if (examStatus) {
    list = list.filter(item => item.status === examStatus);
  }
  if (resultStatus) {
    const wantPass = resultStatus.toLowerCase() === 'pass';
    list = list.filter(item => item.status !== 'Waiting' && item.status !== 'Not Started' && item.status !== 'Absent' && item.status !== 'In Progress (Writing Exam)' && item.isPassed === wantPass);
  }
  if (dateFrom) {
    const fromDate = new Date(dateFrom);
    list = list.filter(item => item.submittedAt && new Date(item.submittedAt) >= fromDate);
  }
  if (dateTo) {
    const toDate = new Date(dateTo);
    list = list.filter(item => item.submittedAt && new Date(item.submittedAt) <= toDate);
  }
  if (search) {
    const s = search.toLowerCase().trim();
    list = list.filter(item =>
      item.student.name.toLowerCase().includes(s) ||
      item.student.studentId.toLowerCase().includes(s) ||
      item.student.rollNumber.toLowerCase().includes(s) ||
      item.student.email.toLowerCase().includes(s) ||
      item.student.mobile.includes(s)
    );
  }

  // Assign Ranks based on obtainedMarks of finished students
  const gradedList = list.filter(item => item.status !== 'Waiting' && item.status !== 'Not Started' && item.status !== 'Absent' && item.status !== 'In Progress (Writing Exam)')
    .sort((a, b) => b.obtainedMarks - a.obtainedMarks);
  
  const rankMap = {};
  gradedList.forEach((item, i) => {
    rankMap[item.student._id.toString()] = i + 1;
  });

  return list.map(item => ({
    ...item,
    rank: rankMap[item.student._id.toString()] || '—'
  }));
};

const getExamResults = async (req, res) => {
  try {
    const results = await computeResultsList(req.params.examId, req.query);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXCEL EXPORT ====================

const exportResultsExcel = async (req, res) => {
  try {
    const results = await computeResultsList(req.params.examId, req.query);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Results');

    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const subjectNames = isMulti ? exam.subjects : [];

    sheet.mergeCells('A1:Q1');
    sheet.getCell('A1').value = 'SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:Q2');
    sheet.getCell('A2').value = `Result Report: ${exam?.title || 'Exam'}`;
    sheet.getCell('A2').font = { bold: true, size: 12 };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    sheet.addRow([]);

    const baseColumns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Student ID', key: 'studentId', width: 18 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll No', key: 'rollNumber', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Mobile', key: 'mobile', width: 15 },
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
      { header: 'Exam Status', key: 'status', width: 20 },
      { header: 'Violations', key: 'violations', width: 12 },
    ];

    sheet.columns = [...baseColumns, ...subjectColumns, ...trailingColumns];

    const headerRow = sheet.getRow(4);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    results.forEach((r) => {
      const rowData = {
        rank: r.rank,
        studentId: r.student?.studentId,
        name: r.student?.name,
        rollNumber: r.student?.rollNumber,
        department: r.student?.department?.name || 'N/A',
        year: r.student?.year || '',
        semester: r.student?.semester || '',
        section: r.student?.section || '',
        email: r.student?.email || '',
        mobile: r.student?.mobile || '',
        total: r.totalMarks,
        obtained: r.obtainedMarks,
        percentage: `${(r.percentage || 0).toFixed(2)}%`,
        grade: r.grade,
        status: r.status,
        violations: r.violations,
      };

      if (isMulti && r.subjectResults) {
        subjectNames.forEach((sn, si) => {
          const sr = r.subjectResults.find(x => x.subjectIndex === si);
          rowData[`subj_${si}_marks`] = sr ? `${sr.obtainedMarks}/${sr.totalMarks}` : 'N/A';
          rowData[`subj_${si}_status`] = sr ? (sr.isPassed ? 'PASS' : 'FAIL') : 'N/A';
        });
      }

      const row = sheet.addRow(rowData);
      const statusCell = row.getCell('status');
      const hasTaken = ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status);
      const isPassedVal = hasTaken && r.isPassed;
      statusCell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: isPassedVal ? 'FF16A34A' : (hasTaken ? 'FFDC2626' : 'FF64748B') }
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
    const results = await computeResultsList(req.params.examId, req.query);
    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const subjectNames = isMulti ? exam.subjects : [];
    const examTitle = exam?.title || 'Exam';

    let headerParts = ['Rank', 'Student ID', 'Name', 'Roll No', 'Department', 'Year', 'Semester', 'Section', 'Email', 'Mobile'];
    if (isMulti) {
      subjectNames.forEach(sn => {
        headerParts.push(`"${sn} Marks"`, `"${sn} Status"`);
      });
    } else {
      headerParts.push('Subject');
    }
    headerParts = [...headerParts, 'Total Marks', 'Obtained', 'Percentage', 'Grade', 'Exam Status', 'Violations'];
    const header = headerParts.join(',') + '\n';

    const rows = results.map((r) => {
      const parts = [
        r.rank,
        r.student?.studentId || '',
        `"${r.student?.name || ''}"`,
        r.student?.rollNumber || '',
        `"${r.student?.department?.name || ''}"`,
        r.student?.year || '',
        r.student?.semester || '',
        r.student?.section || '',
        r.student?.email || '',
        r.student?.mobile || '',
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
        `"${r.status}"`,
        r.violations,
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
    const results = await computeResultsList(req.params.examId, req.query);
    const exam = results[0]?.exam;
    const isMulti = exam?.examType === 'multi' && exam?.subjects?.length > 0;
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=results_${req.params.examId}.pdf`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill('#1e3a8a');
    doc.fillColor('white').fontSize(16).font('Helvetica-Bold')
      .text('SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY', 30, 18, { align: 'center' });
    const subjectLabel = isMulti
      ? `Subjects: ${exam.subjects.join(', ')}`
      : `Subject: ${exam?.subject?.name || '—'}`;
    doc.fontSize(11).font('Helvetica')
      .text(`Result Report: ${exam?.title || 'Exam'} | ${subjectLabel} | Generated: ${new Date().toLocaleString('en-IN')}`, 30, 44, { align: 'center' });

    // Stats bar
    const total = results.length;
    const submittedCount = results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status)).length;
    const passed = results.filter(r => ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) && r.isPassed).length;
    const avgPct = submittedCount > 0 ? (results.reduce((s, r) => s + (['Completed', 'Submitted', 'Auto Submitted'].includes(r.status) ? (r.percentage || 0) : 0), 0) / submittedCount).toFixed(1) : 0;
    doc.rect(0, 80, doc.page.width, 28).fill('#0f172a');
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(9)
      .text(`Total: ${total}   |   Submitted: ${submittedCount}   |   Passed: ${passed}   |   Failed: ${submittedCount - passed}   |   Avg Score: ${avgPct}%`, 30, 89, { align: 'center' });

    // Table Columns
    const cols = isMulti
      ? [20, 45, 80, 45, 60, 45, 45, 50, ...exam.subjects.map(() => [35, 30]).flat(), 35, 30, 30, 25, 40]
      : [25, 50, 90, 50, 70, 50, 50, 60, 100, 35, 35, 30, 30, 50];
    const headers = isMulti
      ? ['Rank', 'Std ID', 'Name', 'Roll No', 'Dept', 'Year', 'Sem', 'Sec', ...exam.subjects.map(s => [`${s.slice(0, 5)}`, 'Status']).flat(), 'Total', 'Marks', '%', 'Grd', 'Status']
      : ['Rank', 'Std ID', 'Name', 'Roll No', 'Dept', 'Year', 'Sem', 'Sec', 'Subject', 'Total', 'Marks', '%', 'Grade', 'Status'];

    let y = 120;
    doc.rect(30, y, doc.page.width - 60, 20).fill('#1e40af');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(6.5);
    let x = 32;
    headers.forEach((h, i) => { doc.text(h, x, y + 6, { width: cols[i] - 2 }); x += cols[i]; });
    y += 20;

    results.forEach((r, idx) => {
      const rowFill = idx % 2 === 0 ? '#f8fafc' : 'white';
      doc.rect(30, y, doc.page.width - 60, 18).fill(rowFill);
      doc.fillColor('#1e293b').font('Helvetica').fontSize(6.5);
      x = 32;

      const vals = isMulti
        ? [
          String(r.rank),
          r.student?.studentId || '',
          r.student?.name || '',
          r.student?.rollNumber || '',
          r.student?.department?.code || '',
          String(r.student?.year || ''),
          String(r.student?.semester || ''),
          r.student?.section || '',
          ...exam.subjects.map((s, si) => {
            const sr = r.subjectResults?.find(x => x.subjectIndex === si);
            return [sr ? `${sr.obtainedMarks}/${sr.totalMarks}` : '-', sr ? (sr.isPassed ? 'PASS' : 'FAIL') : '-'];
          }).flat(),
          String(r.totalMarks),
          String(r.obtainedMarks),
          `${(r.percentage || 0).toFixed(1)}%`,
          r.grade,
          r.status,
        ]
        : [
          String(r.rank),
          r.student?.studentId || '',
          r.student?.name || '',
          r.student?.rollNumber || '',
          r.student?.department?.code || '',
          String(r.student?.year || ''),
          String(r.student?.semester || ''),
          r.student?.section || '',
          r.exam?.subject?.name || '',
          String(r.totalMarks),
          String(r.obtainedMarks),
          `${(r.percentage || 0).toFixed(1)}%`,
          r.grade,
          r.status,
        ];

      vals.forEach((v, i) => {
        const isStatusCol = i === vals.length - 1;
        const hasTaken = ['Completed', 'Submitted', 'Auto Submitted'].includes(r.status);
        const isPassedVal = hasTaken && r.isPassed;
        doc.fillColor(isStatusCol ? (isPassedVal ? '#15803d' : (hasTaken ? '#b91c1c' : '#64748b')) : '#1e293b')
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
  getExams, getExamById, createExam, updateExam, deleteExam, publishExam, retryPublishNotifications,
  getExamSubjects, addExamSubject, updateExamSubject, deleteExamSubject, reorderExamSubjects,
  getQuestions, addQuestion, updateQuestion, deleteQuestion, bulkUploadQuestions,
  downloadQuestionTemplate, forceSubmitStudent, getExamResults,
  exportResultsExcel, exportResultsCSV, exportResultsPDF,
  upload,
};
