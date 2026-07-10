const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const {
  getExams, getExamById, createExam, updateExam, deleteExam, publishExam,
  getExamSubjects, addExamSubject, updateExamSubject, deleteExamSubject, reorderExamSubjects,
  getQuestions, addQuestion, updateQuestion, deleteQuestion,
  bulkUploadQuestions, downloadQuestionTemplate,
  forceSubmitStudent, getExamResults, exportResultsExcel, exportResultsCSV, exportResultsPDF,
  upload,
} = require('../controllers/examController');

// ── Exams CRUD ────────────────────────────────────────────────────────────────
router.get('/', adminOnly, getExams);
router.get('/:id', adminOnly, getExamById);
router.post('/', adminOnly, createExam);
router.put('/:id', adminOnly, updateExam);
router.delete('/:id', adminOnly, deleteExam);
router.patch('/:id/publish', adminOnly, publishExam);

// ── Multi-subject management ──────────────────────────────────────────────────
router.get('/:examId/subjects', adminOnly, getExamSubjects);
router.post('/:examId/subjects', adminOnly, addExamSubject);
router.put('/:examId/subjects/:subjectIndex', adminOnly, updateExamSubject);
router.delete('/:examId/subjects/:subjectIndex', adminOnly, deleteExamSubject);
router.post('/:examId/subjects/reorder', adminOnly, reorderExamSubjects);

// ── Questions ─────────────────────────────────────────────────────────────────
router.get('/:examId/questions', adminOnly, getQuestions);
router.post('/:examId/questions', adminOnly, addQuestion);
router.put('/:examId/questions/:questionId', adminOnly, updateQuestion);
router.delete('/:examId/questions/:questionId', adminOnly, deleteQuestion);
router.post('/:examId/questions/bulk-upload', adminOnly, upload.single('file'), bulkUploadQuestions);
router.get('/questions/template', downloadQuestionTemplate);

// ── Force submit ──────────────────────────────────────────────────────────────
router.post('/:examId/force-submit/:studentId', adminOnly, forceSubmitStudent);

// ── Results & exports ─────────────────────────────────────────────────────────
router.get('/:examId/results', adminOnly, getExamResults);
router.get('/:examId/results/export-excel', adminOnly, exportResultsExcel);
router.get('/:examId/results/export-csv', adminOnly, exportResultsCSV);
router.get('/:examId/results/export-pdf', adminOnly, exportResultsPDF);
// Legacy alias
router.get('/:examId/results/export', adminOnly, exportResultsExcel);

module.exports = router;
