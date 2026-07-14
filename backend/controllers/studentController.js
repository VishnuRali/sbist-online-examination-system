const Exam = require('../models/Exam');
const Question = require('../models/Question');
const Result = require('../models/Result');
const Student = require('../models/Student');
const { shuffleArray, generateAccessCode } = require('../utils/generateId');
const { evaluateExamResult, calculateGrade } = require('../utils/resultEvaluator');

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

const mapToObject = (value) => {
  if (!value) return {};
  if (typeof value.entries === 'function') {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === 'object') return { ...value };
  return {};
};

const getSharedRemainingSeconds = (exam, result, now = new Date()) => {
  const endTime = new Date(exam.endTime);
  const isMulti = exam.examType === 'multi' && Array.isArray(exam.subjects) && exam.subjects.length > 0;
  const durationMs = isMulti
    ? exam.subjects.reduce((sum, s) => sum + (Number(s.duration) || 0), 0) * 60000
    : (Number(exam.duration) || 60) * 60000;
  const examEndByDuration = new Date(new Date(result.startedAt).getTime() + durationMs);
  const effectiveEnd = examEndByDuration < endTime ? examEndByDuration : endTime;
  return Math.max(0, Math.floor((effectiveEnd - now) / 1000));
};

const prepareQuestionsForSubject = (questions, exam, existingMappingsObj = {}) => {
  const newMappings = {};
  let list = questions;
  if (exam.randomizeQuestions) list = shuffleArray(questions);

  const preparedQuestions = list.map((q) => {
    const qId = q._id.toString();
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
      const existing = existingMappingsObj[qId];
      if (existing && typeof existing === 'object') {
        const rebuilt = {};
        Object.entries(existing).forEach(([displayKey, origKey]) => {
          rebuilt[displayKey] = q.options[origKey];
        });
        qObj.options = rebuilt;
      } else {
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
        newMappings[qId] = qMapping;
      }
    }

    return qObj;
  });

  return { preparedQuestions, newMappings };
};

const getSavedAnswer = (savedAnswers, questionId) => {
  const qIdStr = questionId.toString();
  if (!savedAnswers) return null;
  if (typeof savedAnswers.get === 'function') return savedAnswers.get(qIdStr) || null;
  return savedAnswers[qIdStr] || null;
};

const getAvailableExams = async (req, res) => {
  try {
    const now = new Date();
    const rawStudent = await Student.findById(req.student._id).populate('department', 'name code');
    if (!rawStudent) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const normalizeString = (value) => String(value || '').trim().toLowerCase();
    const normalizeNumberString = (value) => String(value || '').replace(/[^0-9]/g, '').trim();
    const normalizeSection = (value) => {
      const str = String(value || '').trim().toUpperCase();
      if (str === 'ALL' || str === 'ALL SECTIONS' || str === 'ALL SECTION' || str.startsWith('ALL SEC')) {
        return 'ALL';
      }
      const replaced = str.replace(/SEC(TION)?\s*/i, '').trim();
      if (replaced === 'ALL' || replaced === 'ALL SECTIONS' || replaced === 'ALL SECTION' || replaced.startsWith('ALL SEC')) {
        return 'ALL';
      }
      return replaced.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    };
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
    }).populate('subject', 'name code').populate('department', 'name code').lean();

    const filteredExams = allExams.filter((exam) => {
      const examDepartmentId = exam.department?._id?.toString() || String(exam.department || '').trim();
      const examDepartmentCode = normalizeString(exam.department?.code);
      const examDepartmentName = normalizeString(exam.department?.name);
      const examDepartmentAcronym = getAcronym(exam.department?.name);
      const examYear = normalizeNumberString(exam.year);
      const examSemester = normalizeNumberString(exam.semester);
      const examSection = normalizeSection(exam.section);
      const examStatus = normalizeString(exam.status);

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

      if (now > new Date(exam.endTime)) {
        reasons.push('Exam ended');
      }

      return reasons.length === 0;
    });

    const completedResults = await Result.find({
      student: student._id,
      status: { $ne: 'in_progress' },
    }).select('exam').lean();
    const completedExamIds = completedResults.map(r => r.exam.toString());

    const inProgressResult = await Result.findOne({
      student: student._id,
      status: 'in_progress',
    }).select('exam').lean();

    const enrichedExams = filteredExams.map(exam => {
      const safeExam = { ...exam };
      return {
        ...safeExam,
        isCompleted: completedExamIds.includes(exam._id.toString()),
        isInProgress: inProgressResult?.exam?.toString() === exam._id.toString(),
        isAvailable: now >= new Date(exam.startTime) && now <= new Date(exam.endTime),
        isUpcoming: now < new Date(exam.startTime),
        isExpired: now > new Date(exam.endTime),
      };
    });

    res.json({ success: true, exams: enrichedExams });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const startExam = async (req, res) => {
  try {
    const student = req.student;
    const { examId } = req.params;
    const now = new Date();

    const [exam, existingCompleted, inProgressResult] = await Promise.all([
      Exam.findById(examId).populate('subject', 'name code'),
      Result.findOne({ student: student._id, exam: examId, status: { $in: ['submitted', 'force_submitted', 'auto_submitted'] } }),
      Result.findOne({ student: student._id, exam: examId, status: 'in_progress' })
    ]);

    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });
    if (exam.status === 'draft') return res.status(403).json({ success: false, message: 'Exam is not published' });
    if (now < new Date(exam.startTime)) return res.status(403).json({ success: false, message: 'Exam has not started yet' });
    if (now > new Date(exam.endTime)) return res.status(403).json({ success: false, message: 'Exam time has ended' });

    if (existingCompleted) {
      return res.status(403).json({ success: false, message: 'You have already submitted this exam' });
    }

    let result = inProgressResult;

    // Access code required only on first start (no in-progress Result yet)
    if (!result) {
      const submittedCode = String(req.body.accessCode || '').trim();
      if (!exam.accessCode || !submittedCode || submittedCode !== String(exam.accessCode).trim()) {
        return res.status(401).json({ success: false, message: 'Invalid access code' });
      }
    }

    const isMulti = exam.examType === 'multi' && exam.subjects.length > 0;
    const currentSubjectIndex = result?.savedProgress?.currentSubjectIndex || 0;

    let questions;
    if (isMulti) {
      questions = await Question.find({ exam: examId, subjectIndex: currentSubjectIndex });
    } else {
      questions = await Question.find({ exam: examId });
    }

    const existingMappingsObj = result?.savedProgress?.optionMappings
      ? mapToObject(result.savedProgress.optionMappings)
      : {};
    const { preparedQuestions, newMappings: optionMappings } = prepareQuestionsForSubject(
      questions,
      exam,
      existingMappingsObj
    );

    if (!result) {
      const totalMarks = isMulti
        ? exam.subjects.reduce((sum, s) => sum + (Number(s.totalMarks) || 0), 0)
        : questions.reduce((sum, q) => sum + q.marks, 0);

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
      result.savedProgress.optionMappings = { ...existingMappingsObj, ...optionMappings };
      result.markModified('savedProgress');
      await result.save();
    }

    await Student.findByIdAndUpdate(student._id, { currentExam: examId });

    const totalDurationMinutes = isMulti
      ? exam.subjects.reduce((sum, s) => sum + (Number(s.duration) || 0), 0)
      : exam.duration;
    const remainingSeconds = getSharedRemainingSeconds(exam, result, now);

    res.json({
      success: true,
      exam: {
        _id: exam._id,
        title: exam.title,
        examType: exam.examType,
        subjects: isMulti ? exam.subjects : [],
        duration: totalDurationMinutes,
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
          answers: mapToObject(result.savedProgress?.answers),
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

const saveProgress = async (req, res) => {
  try {
    const { resultId, answers, currentQuestion, reviewList, currentSubjectIndex } = req.body;

    const setOps = { 'savedProgress.lastSaved': new Date() };
    const unsetOps = {};

    if (answers && typeof answers === 'object') {
      Object.entries(answers).forEach(([qId, val]) => {
        if (val === null || val === '') {
          unsetOps[`savedProgress.answers.${qId}`] = '';
        } else {
          setOps[`savedProgress.answers.${qId}`] = val;
        }
      });
    }

    if (reviewList !== undefined) setOps['savedProgress.reviewList'] = reviewList;
    if (currentQuestion !== undefined) setOps['savedProgress.currentQuestion'] = currentQuestion;
    if (currentSubjectIndex !== undefined) setOps['savedProgress.currentSubjectIndex'] = currentSubjectIndex;

    const update = { $set: setOps };
    if (Object.keys(unsetOps).length > 0) {
      update.$unset = unsetOps;
    }

    const result = await Result.findOneAndUpdate(
      { _id: resultId, student: req.student._id, status: 'in_progress' },
      update,
      { new: true, projection: { savedProgress: 1, status: 1 } }
    );

    if (!result) {
      const exists = await Result.findById(resultId);
      if (exists && exists.student.toString() !== req.student._id.toString()) {
        return res.status(403).json({ success: false, message: 'Not authorized for this exam session' });
      }
      return res.status(400).json({ success: false, message: 'Invalid or completed exam session' });
    }

    res.json({ success: true, message: 'Progress saved', lastSaved: result.savedProgress.lastSaved });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const switchSubject = async (req, res) => {
  try {
    const { resultId, subjectIndex, answers, reviewList, currentQuestion } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.student.toString() !== req.student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this exam session' });
    }
    if (result.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Invalid or completed exam session' });
    }

    const exam = await Exam.findById(result.exam);
    if (!exam || exam.examType !== 'multi' || !exam.subjects?.length) {
      return res.status(400).json({ success: false, message: 'Not a multi-subject exam' });
    }

    const targetIdx = parseInt(subjectIndex, 10);
    if (Number.isNaN(targetIdx) || targetIdx < 0 || targetIdx >= exam.subjects.length) {
      return res.status(400).json({ success: false, message: 'Invalid subject index' });
    }

    const existingAnswers = mapToObject(result.savedProgress?.answers);
    const incoming = answers || {};
    const mergedAnswers = { ...existingAnswers, ...incoming };
    Object.keys(incoming).forEach((key) => {
      if (incoming[key] == null || incoming[key] === '') delete mergedAnswers[key];
    });

    const existingMappingsObj = mapToObject(result.savedProgress?.optionMappings);

    let questions = await Question.find({ exam: exam._id, subjectIndex: targetIdx });
    const { preparedQuestions, newMappings } = prepareQuestionsForSubject(
      questions,
      exam,
      existingMappingsObj
    );
    const mergedMappings = { ...existingMappingsObj, ...newMappings };

    const completedSubjects = [...(result.savedProgress?.completedSubjects || [])];
    const prevIdx = result.savedProgress?.currentSubjectIndex;
    if (prevIdx !== undefined && prevIdx !== targetIdx && !completedSubjects.includes(prevIdx)) {
      completedSubjects.push(prevIdx);
    }

    result.savedProgress = {
      answers: mergedAnswers,
      reviewList: reviewList || [],
      currentQuestion: currentQuestion !== undefined ? currentQuestion : 0,
      currentSubjectIndex: targetIdx,
      completedSubjects,
      optionMappings: mergedMappings,
      lastSaved: new Date(),
    };
    result.markModified('savedProgress');
    await result.save();

    const remainingSeconds = getSharedRemainingSeconds(exam, result);

    res.json({
      success: true,
      currentSubjectIndex: targetIdx,
      currentSubject: exam.subjects[targetIdx],
      totalSubjects: exam.subjects.length,
      questions: preparedQuestions,
      remainingSeconds,
      completedSubjects,
      answers: mergedAnswers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const submitSubjectAndContinue = async (req, res) => {
  try {
    const { resultId, answers, reviewList, subjectIndex } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.student.toString() !== req.student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this exam session' });
    }
    if (result.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Invalid or completed exam session' });
    }

    const exam = await Exam.findById(result.exam);
    if (!exam || exam.examType !== 'multi') {
      return res.status(400).json({ success: false, message: 'Not a multi-subject exam' });
    }

    const currentIdx = subjectIndex !== undefined ? parseInt(subjectIndex) : (result.savedProgress?.currentSubjectIndex || 0);
    const nextIdx = currentIdx + 1;

    const existingAnswers = result.savedProgress?.answers
      ? Object.fromEntries(
        typeof result.savedProgress.answers.entries === 'function'
          ? result.savedProgress.answers.entries()
          : Object.entries(result.savedProgress.answers)
      )
      : {};
    const mergedAnswers = { ...existingAnswers, ...(answers || {}) };

    const existingMappings = result.savedProgress?.optionMappings;

    const completedSubjects = [...(result.savedProgress?.completedSubjects || [])];
    if (!completedSubjects.includes(currentIdx)) {
      completedSubjects.push(currentIdx);
    }

    const isLastSubject = nextIdx >= exam.subjects.length;

    if (isLastSubject) {
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

    let nextQuestions = await Question.find({ exam: exam._id, subjectIndex: nextIdx });
    if (exam.randomizeQuestions) nextQuestions = shuffleArray(nextQuestions);

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
    const remainingSeconds = getSharedRemainingSeconds(exam, result, now);

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

const reportViolation = async (req, res) => {
  try {
    const { resultId, violationType } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.student.toString() !== req.student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this exam session' });
    }
    if (result.status !== 'in_progress') {
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

const submitExam = async (req, res) => {
  try {
    const { resultId, answers, reviewList, submissionType, autoSubmitReason } = req.body;

    const result = await Result.findById(resultId);
    if (!result || result.student.toString() !== req.student._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized for this exam session' });
    }

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

    const existingAnswers = mapToObject(result.savedProgress?.answers);
    const incoming = answers || {};
    const mergedAnswers = { ...existingAnswers, ...incoming };
    Object.keys(incoming).forEach((key) => {
      if (incoming[key] == null || incoming[key] === '') delete mergedAnswers[key];
    });
    Object.keys(mergedAnswers).forEach((key) => {
      if (mergedAnswers[key] == null || mergedAnswers[key] === '') delete mergedAnswers[key];
    });

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

    const submitStatus =
      submissionType === 'auto_submitted'
        ? 'auto_submitted'
        : 'submitted';

    return submitExamLogic(
      result,
      exam,
      res,
      submitStatus,
      autoSubmitReason
    );
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const submitExamLogic = async (
  result,
  exam,
  res,
  submitStatus,
  autoSubmitReason = ''
) => {
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
    const evaluation = evaluateExamResult(
      questions,
      result.savedProgress?.answers || dbResult.savedProgress?.answers,
      result.savedProgress?.optionMappings || dbResult.savedProgress?.optionMappings,
      exam
    );

    const submittedAtDate = new Date();
    const updated = await Result.findOneAndUpdate(
      { _id: dbResult._id, status: 'in_progress' },
      {
        $set: {
          status: submitStatus,
          submittedAt: submittedAtDate,
          obtainedMarks: evaluation.obtainedMarks,
          totalMarks: evaluation.totalMarks,
          correctAnswers: evaluation.correctAnswers,
          wrongAnswers: evaluation.wrongAnswers,
          skippedAnswers: evaluation.skippedAnswers,
          percentage: evaluation.percentage,
          isPassed: evaluation.isPassed,
          grade: evaluation.grade,
          timeSpent: Math.max(0, Math.floor((submittedAtDate - dbResult.startedAt) / 1000)),
          subjectResults: evaluation.subjectResults,
          savedProgress: result.savedProgress || dbResult.savedProgress,
          autoSubmitReason: submitStatus === 'auto_submitted' ? autoSubmitReason : '',
        }
      },
      { new: true }
    );

    if (!updated) {
      const existing = await Result.findById(dbResult._id);
      return res.json({
        success: true,
        alreadySubmitted: true,
        message: 'Exam already submitted',
        result: {
          _id: existing._id,
          obtainedMarks: existing.obtainedMarks,
          totalMarks: existing.totalMarks,
          percentage: (existing.percentage || 0).toFixed(2),
          grade: existing.grade,
          isPassed: existing.isPassed,
          correctAnswers: existing.correctAnswers,
          wrongAnswers: existing.wrongAnswers,
          skippedAnswers: existing.skippedAnswers,
          status: existing.status,
          subjectResults: existing.subjectResults,
        },
        showResult: exam?.showResultAfterExam,
      });
    }

    await Student.findByIdAndUpdate(dbResult.student, { currentExam: null });

    res.json({
      success: true,
      message: 'Exam submitted successfully',
      result: {
        _id: updated._id,
        obtainedMarks: evaluation.obtainedMarks,
        totalMarks: evaluation.totalMarks,
        percentage: evaluation.percentage.toFixed(2),
        grade: updated.grade,
        isPassed: updated.isPassed,
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
  switchSubject,
  submitSubjectAndContinue,
  getStudentResult,
  getStudentAllResults,
  updateStudentProfile
};
