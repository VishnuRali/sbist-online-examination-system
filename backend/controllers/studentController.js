const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const Student = require('../models/Student');
const { shuffleArray } = require('../utils/generateId');
const { evaluateExamResult, calculateGrade } = require('../utils/resultEvaluator');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: resolve a student's displayed answer key back to the original key
// when randomizeOptions was active. The optionMappings map is:
//   { questionId -> { displayKey -> originalKey } }
// e.g. if option A in display is actually original option C:
//   mapping['A'] = 'C'
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: get a saved answer from the Map (handles both Map and plain object)
// ─────────────────────────────────────────────────────────────────────────────
const getSavedAnswer = (savedAnswers, questionId) => {
  const qIdStr = questionId.toString();
  if (!savedAnswers) return null;
  if (typeof savedAnswers.get === 'function') return savedAnswers.get(qIdStr) || null;
  return savedAnswers[qIdStr] || null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Get available exams for student
// ─────────────────────────────────────────────────────────────────────────────
const getAvailableExams = async (req, res) => {
  try {
    const now = new Date();
    const rawStudent = await Student.findById(req.student._id).populate('department', 'name code');
    if (!rawStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const normalizeString = (value) => String(value || '').trim().toLowerCase();
    const normalizeNumberString = (value) => String(value || '').replace(/[^0-9]/g, '').trim();
    const normalizeSection = (value) => String(value || '')
      .trim()
      .replace(/section\s*/i, '')
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase();
    const getAcronym = (value) => String(value || '')
      .trim()
      .split(/\s+/)
      .map(word => word[0] || '')
      .join('')
      .toUpperCase();

    const student = {
      ...rawStudent.toObject(),
      year: normalizeNumberString(rawStudent.year),
      semester: normalizeNumberString(rawStudent.semester),
      section: normalizeSection(rawStudent.section),
      departmentId: rawStudent.department?._id?.toString() || String(rawStudent.department || '').trim(),
      departmentCode: normalizeString(rawStudent.department?.code),
      departmentName: normalizeString(rawStudent.department?.name),
      departmentAcronym: getAcronym(rawStudent.department?.name),
    };

    const allExams = await Exam.find({
      status: { $in: ['scheduled', 'active'] },
    }).populate('subject', 'name code').populate('department', 'name code');

    const filteredExams = allExams.filter((exam) => {
      const examDepartmentId = exam.department?._id?.toString() || String(exam.department || '').trim();
      const examDepartmentCode = normalizeString(exam.department?.code);
      const examDepartmentName = normalizeString(exam.department?.name);
      const examDepartmentAcronym = getAcronym(exam.department?.name);
      const examYear = normalizeNumberString(exam.year);
      const examSemester = normalizeNumberString(exam.semester);
      const examSection = normalizeSection(exam.section);
      const examStatus = normalizeString(exam.status);
      const examStart = new Date(exam.startTime);
      const examEnd = new Date(exam.endTime);

      const reasons = [];
      if (!examDepartmentId || student.departmentId !== examDepartmentId) {
        const deptMatch = (student.departmentCode && examDepartmentCode && student.departmentCode === examDepartmentCode)
          || (student.departmentName && examDepartmentName && student.departmentName === examDepartmentName)
          || (student.departmentAcronym && examDepartmentAcronym && student.departmentAcronym === examDepartmentAcronym);
        if (!deptMatch) reasons.push('Department mismatch');
      }
      if (examYear !== student.year) reasons.push('Year mismatch');
      if (examSemester !== student.semester) reasons.push('Semester mismatch');

      const examSections = Array.isArray(exam.sections) && exam.sections.length > 0
        ? exam.sections.map(s => normalizeSection(s))
        : (exam.section ? [normalizeSection(exam.section)] : []);

      const sectionMatches =
        examSections.length === 0 ||
        examSections.includes('ALL') ||
        examSections.includes('') ||
        (student.section !== '' && examSections.includes(student.section));
      if (!sectionMatches) reasons.push(`Section mismatch`);

      const statusMatches = ['scheduled', 'active'].includes(examStatus);
      if (!statusMatches) reasons.push('Status mismatch');

      const timeMatches = now >= examStart && now <= examEnd;
      if (!timeMatches) {
        if (now < examStart) reasons.push('Not started yet');
        if (now > examEnd) reasons.push('Exam ended');
      }

      return reasons.length === 0;
    });

    const completedResults = await Result.find({
      student: student._id,
      status: { $ne: 'in_progress' },
    }).select('exam');
    const completedExamIds = completedResults.map(r => r.exam.toString());

    const inProgressResult = await Result.findOne({
      student: student._id,
      status: 'in_progress',
    }).select('exam');

    const enrichedExams = filteredExams.map(exam => ({
      ...exam.toObject(),
      isCompleted: completedExamIds.includes(exam._id.toString()),
      isInProgress: inProgressResult?.exam?.toString() === exam._id.toString(),
      isAvailable: now >= new Date(exam.startTime) && now <= new Date(exam.endTime),
      isUpcoming: now < new Date(exam.startTime),
      isExpired: now > new Date(exam.endTime),
    }));

    res.json({ success: true, exams: enrichedExams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Start exam
// ─────────────────────────────────────────────────────────────────────────────
const startExam = async (req, res) => {
  try {
    const student = req.student;
    const { examId } = req.params;
    const now = new Date();

    const exam = await Exam.findById(examId).populate('subject', 'name code');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status === 'draft') return res.status(403).json({ success: false, message: 'Exam is not published' });
    if (now < new Date(exam.startTime)) return res.status(403).json({ success: false, message: 'Exam has not started yet' });
    if (now > new Date(exam.endTime)) return res.status(403).json({ success: false, message: 'Exam time has ended' });

    // Check if already completed
    const existingCompleted = await Result.findOne({
      student: student._id, exam: examId,
      status: { $in: ['submitted', 'force_submitted', 'auto_submitted'] }
    });
    if (existingCompleted) {
      return res.status(403).json({ success: false, message: 'You have already submitted this exam' });
    }

    // Check for in-progress (resume)
    let result = await Result.findOne({ student: student._id, exam: examId, status: 'in_progress' });

    const isMulti = exam.examType === 'multi' && exam.subjects.length > 0;

    // For single-subject: load all questions
    // For multi-subject: load questions for the current subject
    const currentSubjectIndex = result?.savedProgress?.currentSubjectIndex || 0;

    let questions;
    if (isMulti) {
      questions = await Question.find({ exam: examId, subjectIndex: currentSubjectIndex });
    } else {
      questions = await Question.find({ exam: examId });
    }

    if (exam.randomizeQuestions) questions = shuffleArray(questions);

    // ── CRITICAL: Store optionMappings in savedProgress ──────────────────────
    // For each question, if randomizeOptions is true, build a mapping from
    // display key → original key so we can correctly evaluate answers on submit.
    // ─────────────────────────────────────────────────────────────────────────
    const optionMappings = {}; // { questionId: { displayKey: originalKey } }

    const preparedQuestions = questions.map(q => {
      const qObj = {
        _id: q._id,
        questionText: q.questionText,
        marks: q.marks,
        topic: q.topic,
        order: q.order,
        subjectIndex: q.subjectIndex,
        options: { ...q.options },
      };

      if (exam.randomizeOptions) {
        const optionKeys = ['A', 'B', 'C', 'D'];
        const shuffledKeys = shuffleArray(optionKeys);
        const newOptions = {};
        const qMapping = {}; // displayKey -> originalKey

        shuffledKeys.forEach((origKey, i) => {
          const newKey = optionKeys[i];
          newOptions[newKey] = q.options[origKey];
          qMapping[newKey] = origKey; // student selects newKey → actual answer is origKey
        });

        qObj.options = newOptions;
        // Store mapping for this question
        optionMappings[q._id.toString()] = qMapping;
      }

      return qObj;
    });

    if (!result) {
      const allQuestionsCount = await Question.countDocuments({ exam: examId });
      const totalMarks = (await Question.find({ exam: examId }))
        .reduce((sum, q) => sum + q.marks, 0);

      result = new Result({
        student: student._id,
        exam: examId,
        totalMarks,
        startedAt: now,
        savedProgress: {
          answers: {},
          reviewList: [],
          currentQuestion: 0,
          currentSubjectIndex: 0,
          completedSubjects: [],
          optionMappings,
          lastSaved: now,
        }
      });
      await result.save();
    } else if (Object.keys(optionMappings).length > 0) {
      // Merge new optionMappings into existing (for resumed exam, randomize new subject's questions)
      const existingMappings = result.savedProgress?.optionMappings
        ? Object.fromEntries(
          typeof result.savedProgress.optionMappings.entries === 'function'
            ? result.savedProgress.optionMappings.entries()
            : Object.entries(result.savedProgress.optionMappings)
        )
        : {};
      result.savedProgress.optionMappings = { ...existingMappings, ...optionMappings };
      result.markModified('savedProgress');
      await result.save();
    }

    // Update student's current exam
    await Student.findByIdAndUpdate(student._id, { currentExam: examId });

    // Calculate remaining time for current subject
    const endTime = new Date(exam.endTime);
    let subjectDuration;
    if (isMulti) {
      subjectDuration = (exam.subjects[currentSubjectIndex]?.duration || 60) * 60000;
    } else {
      subjectDuration = exam.duration * 60000;
    }
    const examEndByDuration = new Date(result.startedAt.getTime() + subjectDuration);
    const effectiveEndTime = examEndByDuration < endTime ? examEndByDuration : endTime;
    const remainingSeconds = Math.max(0, Math.floor((effectiveEndTime - now) / 1000));

    res.json({
      success: true,
      exam: {
        _id: exam._id,
        title: exam.title,
        examType: exam.examType,
        subjects: isMulti ? exam.subjects : [],
        duration: isMulti ? (exam.subjects[currentSubjectIndex]?.duration || 60) : exam.duration,
        totalMarks: exam.totalMarks,
        instructions: exam.instructions,
        maxViolations: exam.maxViolations,
        endTime: exam.endTime,
      },
      currentSubjectIndex,
      currentSubject: isMulti ? exam.subjects[currentSubjectIndex] : null,
      totalSubjects: isMulti ? exam.subjects.length : 1,
      questions: preparedQuestions,
      result: {
        _id: result._id,
        savedProgress: {
          answers: result.savedProgress?.answers
            ? Object.fromEntries(
              typeof result.savedProgress.answers.entries === 'function'
                ? result.savedProgress.answers.entries()
                : Object.entries(result.savedProgress.answers)
            )
            : {},
          reviewList: result.savedProgress?.reviewList || [],
          currentQuestion: result.savedProgress?.currentQuestion || 0,
          currentSubjectIndex,
          completedSubjects: result.savedProgress?.completedSubjects || [],
        },
        violations: result.violations,
      },
      remainingSeconds,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Save progress (auto-save)
// ─────────────────────────────────────────────────────────────────────────────
const saveProgress = async (req, res) => {
  try {
    const { resultId, answers, currentQuestion, reviewList, currentSubjectIndex } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Invalid or completed exam session' });
    }

    // Preserve existing optionMappings while updating the rest
    const existingMappings = result.savedProgress?.optionMappings;
    const existingCompletedSubjects = result.savedProgress?.completedSubjects || [];

    result.savedProgress = {
      answers: answers || {},
      reviewList: reviewList || [],
      currentQuestion: currentQuestion || 0,
      currentSubjectIndex: currentSubjectIndex !== undefined ? currentSubjectIndex : (result.savedProgress?.currentSubjectIndex || 0),
      completedSubjects: existingCompletedSubjects,
      optionMappings: existingMappings,
      lastSaved: new Date(),
    };
    await result.save();

    res.json({ success: true, message: 'Progress saved', lastSaved: result.savedProgress.lastSaved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Submit current subject and get next subject's questions (multi-subject only)
// ─────────────────────────────────────────────────────────────────────────────
const submitSubjectAndContinue = async (req, res) => {
  try {
    const { resultId, answers, reviewList, subjectIndex } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Invalid or completed exam session' });
    }

    const exam = await Exam.findById(result.exam);
    if (!exam || exam.examType !== 'multi') {
      return res.status(400).json({ success: false, message: 'Not a multi-subject exam' });
    }

    const currentIdx = subjectIndex !== undefined ? parseInt(subjectIndex) : (result.savedProgress?.currentSubjectIndex || 0);
    const nextIdx = currentIdx + 1;

    // Merge new answers into savedProgress
    const existingAnswers = result.savedProgress?.answers
      ? Object.fromEntries(
        typeof result.savedProgress.answers.entries === 'function'
          ? result.savedProgress.answers.entries()
          : Object.entries(result.savedProgress.answers)
      )
      : {};
    const mergedAnswers = { ...existingAnswers, ...(answers || {}) };

    const existingMappings = result.savedProgress?.optionMappings;

    // Mark current subject as completed
    const completedSubjects = [...(result.savedProgress?.completedSubjects || [])];
    if (!completedSubjects.includes(currentIdx)) {
      completedSubjects.push(currentIdx);
    }

    const isLastSubject = nextIdx >= exam.subjects.length;

    if (isLastSubject) {
      // All subjects done — trigger final submission
      result.savedProgress = {
        answers: mergedAnswers,
        reviewList: reviewList || [],
        currentQuestion: 0,
        currentSubjectIndex: nextIdx,
        completedSubjects,
        optionMappings: existingMappings,
        lastSaved: new Date(),
      };
      result.markModified('savedProgress');
      await result.save();
      return submitExamLogic(result, exam, res, 'submitted');
    }

    // Load next subject's questions
    let nextQuestions = await Question.find({ exam: exam._id, subjectIndex: nextIdx });
    if (exam.randomizeQuestions) nextQuestions = shuffleArray(nextQuestions);

    // Build optionMappings for next subject's questions
    const newMappings = {};
    const preparedQuestions = nextQuestions.map(q => {
      const qObj = {
        _id: q._id,
        questionText: q.questionText,
        marks: q.marks,
        topic: q.topic,
        order: q.order,
        subjectIndex: q.subjectIndex,
        options: { ...q.options },
      };

      if (exam.randomizeOptions) {
        const optionKeys = ['A', 'B', 'C', 'D'];
        const shuffledKeys = shuffleArray(optionKeys);
        const newOptions = {};
        const qMapping = {};
        shuffledKeys.forEach((origKey, i) => {
          const newKey = optionKeys[i];
          newOptions[newKey] = q.options[origKey];
          qMapping[newKey] = origKey;
        });
        qObj.options = newOptions;
        newMappings[q._id.toString()] = qMapping;
      }
      return qObj;
    });

    // Merge new mappings with existing
    const existingMappingsObj = existingMappings
      ? Object.fromEntries(
        typeof existingMappings.entries === 'function'
          ? existingMappings.entries()
          : Object.entries(existingMappings)
      )
      : {};
    const mergedMappings = { ...existingMappingsObj, ...newMappings };

    result.savedProgress = {
      answers: mergedAnswers,
      reviewList: [],
      currentQuestion: 0,
      currentSubjectIndex: nextIdx,
      completedSubjects,
      optionMappings: mergedMappings,
      lastSaved: new Date(),
    };
    result.markModified('savedProgress');
    await result.save();

    const now = new Date();
    const endTime = new Date(exam.endTime);
    const subjectDuration = (exam.subjects[nextIdx]?.duration || 60) * 60000;
    const subjectEnd = new Date(now.getTime() + subjectDuration);
    const effectiveEnd = subjectEnd < endTime ? subjectEnd : endTime;
    const remainingSeconds = Math.max(0, Math.floor((effectiveEnd - now) / 1000));

    res.json({
      success: true,
      message: `Subject ${currentIdx + 1} completed. Starting ${exam.subjects[nextIdx].subjectName}`,
      nextSubjectIndex: nextIdx,
      currentSubject: exam.subjects[nextIdx],
      questions: preparedQuestions,
      remainingSeconds,
      totalSubjects: exam.subjects.length,
      completedSubjects,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Report violation
// ─────────────────────────────────────────────────────────────────────────────
const reportViolation = async (req, res) => {
  try {
    const { resultId, violationType } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Invalid session' });
    }

    result.violations += 1;
    result.violationDetails.push({ type: violationType, timestamp: new Date() });
    await result.save();

    const exam = await Exam.findById(result.exam);
    const maxViolations = exam?.maxViolations || 3;

    if (result.violations >= maxViolations) {
      return submitExamLogic(result, exam, res, 'auto_submitted');
    }

    res.json({
      success: true,
      violations: result.violations,
      maxViolations,
      remaining: maxViolations - result.violations,
      message: `Warning: ${result.violations}/${maxViolations} violations recorded`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Submit exam (final submission)
// ─────────────────────────────────────────────────────────────────────────────
const submitExam = async (req, res) => {
  try {
    const { resultId, answers, reviewList } = req.body;

    const result = await Result.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });
    
    const exam = await Exam.findById(result.exam);
    if (result.status !== 'in_progress') {
      return res.json({
        success: true,
        alreadySubmitted: true,
        message: 'Exam already submitted',
        result: {
          _id: result._id,
          obtainedMarks: result.obtainedMarks,
          totalMarks: result.totalMarks,
          percentage: (result.percentage || 0).toFixed(2),
          grade: result.grade,
          isPassed: result.isPassed,
          correctAnswers: result.correctAnswers,
          wrongAnswers: result.wrongAnswers,
          skippedAnswers: result.skippedAnswers,
          status: result.status,
          subjectResults: result.subjectResults,
        },
        showResult: exam?.showResultAfterExam,
      });
    }

    // Merge submitted answers with existing saved answers
    const existingAnswers = result.savedProgress?.answers
      ? Object.fromEntries(
        typeof result.savedProgress.answers.entries === 'function'
          ? result.savedProgress.answers.entries()
          : Object.entries(result.savedProgress.answers)
      )
      : {};
    const mergedAnswers = { ...existingAnswers, ...(answers || {}) };

    const existingMappings = result.savedProgress?.optionMappings;
    const existingCompletedSubjects = result.savedProgress?.completedSubjects || [];

    result.savedProgress = {
      answers: mergedAnswers,
      reviewList: reviewList || [],
      currentQuestion: 0,
      currentSubjectIndex: result.savedProgress?.currentSubjectIndex || 0,
      completedSubjects: existingCompletedSubjects,
      optionMappings: existingMappings,
      lastSaved: new Date(),
    };
    result.markModified('savedProgress');

    return submitExamLogic(result, exam, res, 'submitted');
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL FIX: Evaluate and finalize exam submission
// Uses optionMappings to correctly resolve randomized option selections
// ─────────────────────────────────────────────────────────────────────────────
const submitExamLogic = async (result, exam, res, submitStatus) => {
  try {
    const dbResult = await Result.findById(result._id);
    if (!dbResult) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    if (dbResult.status !== 'in_progress') {
      return res.json({
        success: true,
        alreadySubmitted: true,
        message: 'Exam already submitted',
        result: {
          _id: dbResult._id,
          obtainedMarks: dbResult.obtainedMarks,
          totalMarks: dbResult.totalMarks,
          percentage: (dbResult.percentage || 0).toFixed(2),
          grade: dbResult.grade,
          isPassed: dbResult.isPassed,
          correctAnswers: dbResult.correctAnswers,
          wrongAnswers: dbResult.wrongAnswers,
          skippedAnswers: dbResult.skippedAnswers,
          status: dbResult.status,
          subjectResults: dbResult.subjectResults,
        },
        showResult: exam?.showResultAfterExam,
      });
    }

    const questions = await Question.find({ exam: dbResult.exam });
    const evaluation = evaluateExamResult(questions, dbResult.savedProgress?.answers, dbResult.savedProgress?.optionMappings, exam);

    dbResult.status = submitStatus;
    dbResult.submittedAt = new Date();
    dbResult.obtainedMarks = evaluation.obtainedMarks;
    dbResult.totalMarks = evaluation.totalMarks;
    dbResult.correctAnswers = evaluation.correctAnswers;
    dbResult.wrongAnswers = evaluation.wrongAnswers;
    dbResult.skippedAnswers = evaluation.skippedAnswers;
    dbResult.percentage = evaluation.percentage;
    dbResult.isPassed = evaluation.isPassed;
    dbResult.grade = evaluation.grade;
    dbResult.timeSpent = Math.floor((dbResult.submittedAt - dbResult.startedAt) / 1000);
    dbResult.subjectResults = evaluation.subjectResults;
    await dbResult.save();

    // Clear the student's current exam reference
    await Student.findByIdAndUpdate(dbResult.student, { currentExam: null });

    res.json({
      success: true,
      message: 'Exam submitted successfully',
      result: {
        _id: dbResult._id,
        obtainedMarks: evaluation.obtainedMarks,
        totalMarks: evaluation.totalMarks,
        percentage: evaluation.percentage.toFixed(2),
        grade: dbResult.grade,
        isPassed: dbResult.isPassed,
        correctAnswers: evaluation.correctAnswers,
        wrongAnswers: evaluation.wrongAnswers,
        skippedAnswers: evaluation.skippedAnswers,
        status: submitStatus,
        subjectResults: evaluation.subjectResults,
      },
      showResult: exam?.showResultAfterExam,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get student's result for a specific exam
// ─────────────────────────────────────────────────────────────────────────────
const getStudentResult = async (req, res) => {
  try {
    const result = await Result.findOne({
      student: req.student._id,
      exam: req.params.examId,
      status: { $ne: 'in_progress' }
    }).populate('exam', 'title totalMarks passMarks showResultAfterExam allowDownloadResult subject examType subjects')
      .populate({ path: 'exam', populate: { path: 'subject', select: 'name code' } });

    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });

    if (!result.exam.showResultAfterExam) {
      return res.json({
        success: true,
        message: 'Result will be published by admin',
        result: { status: result.status, submittedAt: result.submittedAt }
      });
    }

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Get all results for student
// ─────────────────────────────────────────────────────────────────────────────
const getStudentAllResults = async (req, res) => {
  try {
    const results = await Result.find({
      student: req.student._id,
      status: { $ne: 'in_progress' }
    }).populate('exam', 'title totalMarks passMarks subject startTime examType subjects')
      .sort({ createdAt: -1 });

    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Update student profile
// ─────────────────────────────────────────────────────────────────────────────
const updateStudentProfile = async (req, res) => {
  try {
    const { mobile, currentPassword, newPassword } = req.body;
    const student = await Student.findById(req.student._id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    if (mobile !== undefined) {
      student.mobile = mobile;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Current password is required' });
      }
      const isMatch = await student.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Incorrect current password' });
      }
      student.password = newPassword;
      student.isPasswordChanged = true;
    }

    await student.save();
    res.json({ success: true, message: 'Profile updated successfully', user: student.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAvailableExams,
  startExam,
  saveProgress,
  reportViolation,
  submitExam,
  submitSubjectAndContinue,
  getStudentResult,
  getStudentAllResults,
  updateStudentProfile
};
