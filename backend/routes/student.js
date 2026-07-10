const express = require('express');
const router = express.Router();
const { studentOnly } = require('../middleware/auth');
const { examLimiter } = require('../middleware/rateLimiter');
const {
  getAvailableExams, startExam, saveProgress, reportViolation,
  submitExam, submitSubjectAndContinue, getStudentResult, getStudentAllResults,
  updateStudentProfile
} = require('../controllers/studentController');

router.get('/exams', studentOnly, getAvailableExams);
router.post('/exams/:examId/start', studentOnly, examLimiter, startExam);
router.post('/exams/save-progress', studentOnly, saveProgress);
router.post('/exams/violation', studentOnly, reportViolation);
router.post('/exams/submit', studentOnly, submitExam);
// Multi-subject: submit current subject and get next
router.post('/exams/submit-subject', studentOnly, submitSubjectAndContinue);
router.get('/exams/:examId/result', studentOnly, getStudentResult);
router.get('/results', studentOnly, getStudentAllResults);
router.put('/profile', studentOnly, updateStudentProfile);

module.exports = router;
