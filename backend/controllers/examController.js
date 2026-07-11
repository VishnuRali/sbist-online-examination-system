const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const Student = require('../models/Student');
const multer = require('multer');
const { parseQuestionsFromExcel, generateQuestionTemplate } = require('../utils/excelParser');
const { shuffleArray, generateAccessCode } = require('../utils/generateId');
const { evaluateExamResult, calculateGrade } = require('../utils/resultEvaluator');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { parseToIST, formatDateTime } = require('../utils/dateFormatter');
const {
  normalizeYear,
  normalizeSemester,
  normalizeSection,
  resolveDepartmentId
} = require('../utils/studentEligibility');

// ensureAccessCode and ensureAccessCodes are removed to prevent dynamic access code changes.


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
      .sort({ createdAt: -1 })
      .lean();

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

  if (!department || !startTime || !endTime || !year || !semester) return;

  const start = new Date(startTime);
  const end = new Date(endTime);

  if (start >= end) {
    throw new Error('Start time must be before end time.');
  }

  const query = {
    _id: { $ne: excludeExamId },
    department,
    year,
    semester,
    status: { $in: ['scheduled', 'active'] },
  };

  const existingExams = await Exam.find(query).lean();

  const targetSections = Array.isArray(sections) && sections.length > 0
    ? sections.map(s => normalizeSectionValue(s))
    : (section ? [normalizeSectionValue(section)] : []);

  const overlaps = existingExams.filter(ex => {
    const exSections = Array.isArray(ex.sections) && ex.sections.length > 0
      ? ex.sections.map(s => normalizeSectionValue(s))
      : (ex.section ? [normalizeSectionValue(ex.section)] : []);

    const hasCommonSection = targetSections.length === 0 || exSections.length === 0 ||
      targetSections.includes('ALL') || exSections.includes('ALL') ||
      targetSections.some(s => exSections.includes(s));

    if (!hasCommonSection) return false;

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
    if (req.body.startTime) req.body.startTime = parseToIST(req.body.startTime);
    if (req.body.endTime) req.body.endTime = parseToIST(req.body.endTime);

    await validateExamOverlap(req.body);
    const examData = { ...req.body, createdBy: req.admin._id };
    delete examData.accessCode;
    examData.accessCode = generateAccessCode();

    if (!examData.subject) {
      delete examData.subject;
    }

    if (examData.examType === 'multi' && Array.isArray(examData.subjects) && examData.subjects.length > 0) {
      examData.subjects.forEach(s => {
        if (Number(s.passMarks) > Number(s.totalMarks)) {
          throw new Error(`Passing marks for subject "${s.subjectName}" cannot be greater than its total marks.`);
        }
      });
      examData.totalMarks = examData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      examData.passMarks = examData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      examData.duration = examData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
      delete examData.subject;
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
    if (req.body.startTime) req.body.startTime = parseToIST(req.body.startTime);
    if (req.body.endTime) req.body.endTime = parseToIST(req.body.endTime);

    await validateExamOverlap(req.body, req.params.id);

    const updateData = { ...req.body };
    delete updateData.accessCode;

    if (!updateData.subject) {
      delete updateData.subject;
      if (updateData.examType === 'multi') {
        updateData.$unset = { ...(updateData.$unset || {}), subject: 1 };
      }
    }

    if (updateData.examType === 'multi' && Array.isArray(updateData.subjects) && updateData.subjects.length > 0) {
      updateData.subjects.forEach(s => {
        if (Number(s.passMarks) > Number(s.totalMarks)) {
          throw new Error(`Passing marks for subject "${s.subjectName}" cannot be greater than its total marks.`);
        }
      });
      updateData.totalMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.totalMarks || 0), 0);
      updateData.passMarks = updateData.subjects.reduce((sum, s) => sum + Number(s.passMarks || 0), 0);
      updateData.duration = updateData.subjects.reduce((sum, s) => sum + Number(s.duration || 0), 0);
      delete updateData.subject;
      updateData.$unset = { ...(updateData.$unset || {}), subject: 1 };
    } else {
      if (Number(updateData.passMarks) > Number(updateData.totalMarks)) {
        throw new Error('Passing marks cannot be greater than total marks.');
      }
    }

    const unset = updateData.$unset;
    delete updateData.$unset;
    const updateOps = unset ? { $set: updateData, $unset: unset } : updateData;

    const exam = await Exam.findByIdAndUpdate(req.params.id, updateOps, { new: true, runValidators: true })
      .populate('subject department createdBy');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    res.json({ success: true, exam });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const regenerateAccessCode = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    exam.accessCode = generateAccessCode();
    await exam.save();

    res.json({ success: true, message: 'Access code regenerated', accessCode: exam.accessCode });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
    const exam = await Exam.findById(req.params.id).populate('subject department');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Exam is already published' });
    }

    const qCount = await Question.countDocuments({ exam: exam._id });
    if (qCount === 0) {
      return res.status(400).json({ success: false, message: 'Cannot publish exam with 0 questions. Please add questions first.' });
    }

    exam.status = 'scheduled';
    exam.updateStatus();
    exam.totalQuestions = qCount;
    await exam.save();

    const studentQuery = await buildStudentEligibilityQuery(exam, { target: 'all' });
    const students = await Student.find(studentQuery);

    const EmailQueue = require('../models/EmailQueue');
    const jobs = students.map(student => ({
      exam: exam._id,
      student: student._id,
      email: student.email,
      notificationType: 'welcome',
      status: 'queued',
      nextRetryTime: new Date()
    }));

    let queuedCount = 0;
    let failedStudents = [];

    if (jobs.length > 0) {
      for (const job of jobs) {
        try {
          await EmailQueue.create(job);
          queuedCount++;
        } catch (err) {
          const matchedStudent = students.find(s => s._id.toString() === job.student.toString());
          failedStudents.push({
            _id: job.student,
            name: matchedStudent?.name || 'Unknown',
            studentId: matchedStudent?.studentId || 'N/A',
            rollNumber: matchedStudent?.rollNumber || 'N/A',
            email: job.email,
            reason: err.code === 11000 ? 'Already queued/sent' : err.message
          });
        }
      }
    }

    await req.admin.logActivity('PUBLISH_EXAM', `Published exam: "${exam.title}" (type: ${exam.examType}), queued ${queuedCount} notifications, failed: ${failedStudents.length}`, req.ip);

    res.json({
      success: true,
      message: `Exam published successfully! Total eligible students: ${students.length}. Queued welcome notifications: ${queuedCount}.`,
      exam,
      publishReport: {
        examId: exam._id,
        eligibleCount: students.length,
        queuedCount,
        failedCount: failedStudents.length,
        failedStudents
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const retryFailedPublishNotifications = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const examId = req.params.id;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds array is required' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const students = await Student.find({ _id: { $in: studentIds } });
    const EmailQueue = require('../models/EmailQueue');

    let retriedCount = 0;
    const failedStudents = [];

    for (const student of students) {
      try {
        await EmailQueue.create({
          exam: exam._id,
          student: student._id,
          email: student.email,
          notificationType: 'welcome',
          status: 'queued',
          nextRetryTime: new Date()
        });
        retriedCount++;
      } catch (err) {
        failedStudents.push({
          _id: student._id,
          name: student.name,
          studentId: student.studentId,
          rollNumber: student.rollNumber,
          email: student.email,
          reason: err.code === 11000 ? 'Already queued/sent' : err.message
        });
      }
    }

    res.json({
      success: true,
      message: `Retry processing complete. Successfully queued: ${retriedCount}, failed: ${failedStudents.length}`,
      retriedCount,
      failedCount: failedStudents.length,
      failedStudents
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const cancelExam = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Cannot cancel a completed exam' });
    }

    exam.status = 'cancelled';
    await exam.save();

    await req.admin.logActivity('CANCEL_EXAM', `Cancelled exam: ${exam.title}`, req.ip);

    res.json({ success: true, message: 'Exam cancelled successfully', exam });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const duplicateExam = async (req, res) => {
  try {
    const sourceExam = await Exam.findById(req.params.id);
    if (!sourceExam) return res.status(404).json({ success: false, message: 'Source exam not found' });

    const duplicatedData = sourceExam.toObject();
    delete duplicatedData._id;
    delete duplicatedData.createdAt;
    delete duplicatedData.updatedAt;
    delete duplicatedData.totalQuestions;

    duplicatedData.title = `${duplicatedData.title} (Copy)`;
    duplicatedData.status = 'draft';
    duplicatedData.accessCode = generateAccessCode();
    duplicatedData.createdBy = req.admin._id;
    duplicatedData.reminderSent24h = false;
    duplicatedData.reminderSent1h = false;
    duplicatedData.reminderSent30m = false;

    const duplicatedExam = new Exam(duplicatedData);
    await duplicatedExam.save();

    const sourceQuestions = await Question.find({ exam: req.params.id }).lean();
    if (sourceQuestions.length > 0) {
      const duplicatedQuestions = sourceQuestions.map(q => {
        delete q._id;
        delete q.createdAt;
        delete q.updatedAt;
        q.exam = duplicatedExam._id;
        return q;
      });
      await Question.insertMany(duplicatedQuestions);
    }

    const populated = await duplicatedExam.populate(['subject', 'department', 'createdBy']);

    await req.admin.logActivity('DUPLICATE_EXAM', `Duplicated exam "${sourceExam.title}" to "${duplicatedExam.title}"`, req.ip);

    res.status(201).json({
      success: true,
      message: 'Exam duplicated successfully (saved as Draft)',
      exam: populated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getQuestionsByExamId = async (req, res) => {
  try {
    const questions = await Question.find({ exam: req.params.id }).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, questions, count: questions.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addQuestionToExam = async (req, res) => {
  try {
    const { questionText, options, correctAnswer, marks, topic, order, subjectIndex } = req.body;
    const examId = req.params.id;

    if (!questionText || !options || !correctAnswer || marks === undefined) {
      return res.status(400).json({ success: false, message: 'Question text, options, correct answer, and marks are required' });
    }

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Cannot add questions to a published exam' });
    }

    const question = new Question({
      exam: examId,
      questionText,
      options,
      correctAnswer,
      marks,
      topic: topic || '',
      order: order || 0,
      subjectIndex: subjectIndex !== undefined ? subjectIndex : 0,
    });

    await question.save();

    const qCount = await Question.countDocuments({ exam: examId });
    exam.totalQuestions = qCount;
    await exam.save();

    res.status(201).json({ success: true, message: 'Question added successfully', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { questionText, options, correctAnswer, marks, topic, order, subjectIndex } = req.body;
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const exam = await Exam.findById(question.exam);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Cannot update questions of a published exam' });
    }

    if (questionText) question.questionText = questionText;
    if (options) question.options = options;
    if (correctAnswer) question.correctAnswer = correctAnswer;
    if (marks !== undefined) question.marks = marks;
    if (topic !== undefined) question.topic = topic;
    if (order !== undefined) question.order = order;
    if (subjectIndex !== undefined) question.subjectIndex = subjectIndex;

    await question.save();
    res.json({ success: true, message: 'Question updated successfully', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });

    const exam = await Exam.findById(question.exam);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Cannot delete questions from a published exam' });
    }

    await Question.findByIdAndDelete(questionId);

    const qCount = await Question.countDocuments({ exam: exam._id });
    exam.totalQuestions = qCount;
    await exam.save();

    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const importQuestionsExcel = async (req, res) => {
  try {
    const examId = req.params.id;
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status !== 'draft') {
      return res.status(400).json({ success: false, message: 'Cannot import questions to a published exam' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel file' });
    }

    const { questions, errors } = await parseQuestionsFromExcel(req.file.buffer);

    if (questions.length === 0 && errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const formattedQuestions = questions.map(q => ({
      exam: examId,
      questionText: q.questionText,
      options: q.options,
      correctAnswer: q.correctAnswer,
      marks: q.marks || 1,
      topic: q.topic || '',
      order: q.order || 0,
      subjectIndex: q.subjectIndex !== undefined ? q.subjectIndex : 0,
    }));

    await Question.insertMany(formattedQuestions);

    const qCount = await Question.countDocuments({ exam: examId });
    exam.totalQuestions = qCount;
    await exam.save();

    await req.admin.logActivity('IMPORT_QUESTIONS_EXCEL', `Imported ${formattedQuestions.length} questions from Excel to: ${exam.title}`, req.ip);

    res.status(201).json({
      success: true,
      message: `Successfully imported ${formattedQuestions.length} questions!`,
      importedCount: formattedQuestions.length,
      errors
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const downloadQuestionTemplate = async (req, res) => {
  try {
    const { isMulti } = req.query;
    const buffer = await generateQuestionTemplate(isMulti === 'true');

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=question_import_template_${isMulti === 'true' ? 'multi' : 'single'}.xlsx`);

    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const downloadExamAuditReportPDF = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('subject department createdBy');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const results = await Result.find({ exam: exam._id }).populate('student', 'name studentId rollNumber');

    const doc = new PDFDocument({ margin: 50 });
    let filename = `Exam_Audit_Report_${exam.title.replace(/\s+/g, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 20).fill('#1e3a8a');

    doc.fillColor('#1e3a8a').font('Helvetica-Bold').fontSize(24).text('EXAMINATION AUDIT REPORT', { align: 'center' });
    doc.moveDown();

    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).fillColor('#334155').text('Exam Information', { underline: true });
    doc.moveDown(0.5);

    const infoTable = [
      ['Title:', exam.title, 'Department:', exam.department?.name || 'N/A'],
      ['Subject:', exam.subject?.name || 'Multi-Subject', 'Semester:', `Semester ${exam.semester}`],
      ['Start Time:', formatDateTime(exam.startTime), 'End Time:', formatDateTime(exam.endTime)],
      ['Duration:', `${exam.duration} mins`, 'Total Marks:', String(exam.totalMarks)],
      ['Status:', exam.status.toUpperCase(), 'Created By:', exam.createdBy?.name || 'N/A']
    ];

    let startY = doc.y;
    infoTable.forEach((row) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text(row[0], 50, doc.y, { width: 80, continued: true });
      doc.font('Helvetica').fillColor('#0f172a').text(row[1], { width: 180 });
      doc.font('Helvetica-Bold').fillColor('#475569').text(row[2], 300, startY, { width: 80, continued: true });
      doc.font('Helvetica').fillColor('#0f172a').text(row[3], { width: 180 });
      doc.moveDown(0.5);
      startY = doc.y;
    });

    doc.moveDown();
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).fillColor('#334155').text('Student Performance Summary', { underline: true });
    doc.moveDown(0.5);

    const totalStudents = results.length;
    const passed = results.filter(r => r.isPassed).length;
    const failed = results.filter(r => !r.isPassed && r.status !== 'in_progress').length;
    const writing = results.filter(r => r.status === 'in_progress').length;

    const summaryTable = [
      ['Total Attempts:', String(totalStudents), 'Passed Students:', String(passed)],
      ['Failed Students:', String(failed), 'Active/Writing:', String(writing)]
    ];

    startY = doc.y;
    summaryTable.forEach((row) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#475569').text(row[0], 50, doc.y, { width: 100, continued: true });
      doc.font('Helvetica').fillColor('#0f172a').text(row[1], { width: 150 });
      doc.font('Helvetica-Bold').fillColor('#475569').text(row[2], 300, startY, { width: 100, continued: true });
      doc.font('Helvetica').fillColor('#0f172a').text(row[3], { width: 150 });
      doc.moveDown(0.5);
      startY = doc.y;
    });

    doc.moveDown();
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(14).fillColor('#334155').text('Detailed Student Logs', { underline: true });
    doc.moveDown();

    let tableY = doc.y;
    doc.rect(50, tableY, doc.page.width - 100, 20).fill('#f1f5f9');
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9);
    doc.text('Student ID', 55, tableY + 5, { width: 80 });
    doc.text('Name', 140, tableY + 5, { width: 120 });
    doc.text('Status', 270, tableY + 5, { width: 80 });
    doc.text('Marks', 360, tableY + 5, { width: 50 });
    doc.text('Violations', 420, tableY + 5, { width: 60 });
    doc.text('Disqualified', 490, tableY + 5, { width: 60 });

    doc.moveDown(0.8);

    results.forEach((r) => {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        tableY = 40;
        doc.rect(50, tableY, doc.page.width - 100, 20).fill('#f1f5f9');
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9);
        doc.text('Student ID', 55, tableY + 5, { width: 80 });
        doc.text('Name', 140, tableY + 5, { width: 120 });
        doc.text('Status', 270, tableY + 5, { width: 80 });
        doc.text('Marks', 360, tableY + 5, { width: 50 });
        doc.text('Violations', 420, tableY + 5, { width: 60 });
        doc.text('Disqualified', 490, tableY + 5, { width: 60 });
        doc.moveDown(0.8);
      }

      const isDisqualified = r.violations >= (exam.maxViolations || 3);
      const studentId = r.student?.studentId || 'N/A';
      const studentName = r.student?.name || 'N/A';

      doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
      doc.text(studentId, 55, doc.y, { width: 80, continued: true });
      doc.text(studentName, 140, doc.y, { width: 120, continued: true });
      doc.text(r.status.toUpperCase(), 270, doc.y, { width: 80, continued: true });
      doc.text(r.status === 'in_progress' ? '—' : `${r.obtainedMarks}/${r.totalMarks}`, 360, doc.y, { width: 50, continued: true });
      doc.text(String(r.violations), 420, doc.y, { width: 60, continued: true });
      doc.text(isDisqualified ? 'YES' : 'NO', 490, doc.y, { width: 60 });
      doc.moveDown(0.5);
    });

    doc.end();
  } catch (error) {
    console.error('Failed to export PDF:', error);
  }
};

const exportExamPerformanceExcel = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id).populate('subject department');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    const results = await Result.find({ exam: exam._id }).populate('student', 'name studentId rollNumber branch section');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Exam Performance');

    sheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 15 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Branch', key: 'branch', width: 15 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Obtained Marks', key: 'obtainedMarks', width: 15 },
      { header: 'Total Marks', key: 'totalMarks', width: 15 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'Passed', key: 'isPassed', width: 10 },
      { header: 'Violations', key: 'violations', width: 12 },
      { header: 'Disqualified', key: 'disqualified', width: 15 },
      { header: 'Time Spent (s)', key: 'timeSpent', width: 15 }
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' }
    };

    results.forEach(r => {
      const isDisqualified = r.violations >= (exam.maxViolations || 3);
      sheet.addRow({
        studentId: r.student?.studentId || 'N/A',
        rollNumber: r.student?.rollNumber || 'N/A',
        name: r.student?.name || 'N/A',
        section: r.student?.section || '—',
        branch: r.student?.branch || 'N/A',
        status: r.status.toUpperCase(),
        obtainedMarks: r.status === 'in_progress' ? '—' : r.obtainedMarks,
        totalMarks: r.totalMarks,
        percentage: r.status === 'in_progress' ? '—' : r.percentage.toFixed(2),
        grade: r.status === 'in_progress' ? '—' : r.grade,
        isPassed: r.status === 'in_progress' ? '—' : (r.isPassed ? 'YES' : 'NO'),
        violations: r.violations,
        disqualified: isDisqualified ? 'YES' : 'NO',
        timeSpent: r.timeSpent || 0
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=Exam_Performance_${exam.title.replace(/\s+/g, '_')}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getExams,
  getExamById,
  createExam,
  updateExam,
  deleteExam,
  publishExam,
  cancelExam,
  duplicateExam,
  getQuestionsByExamId,
  addQuestionToExam,
  updateQuestion,
  deleteQuestion,
  importQuestionsExcel,
  downloadQuestionTemplate,
  downloadExamAuditReportPDF,
  exportExamPerformanceExcel,
  retryFailedPublishNotifications,
  regenerateAccessCode
};
