const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  selectedOption: { type: String, enum: ['A', 'B', 'C', 'D', null], default: null },
  isMarkedForReview: { type: Boolean, default: false },
  isAnswered: { type: Boolean, default: false },
  timeTaken: { type: Number, default: 0 }, // seconds spent on question
});

// Per-subject result breakdown (for multi-subject exams)
const subjectResultSchema = new mongoose.Schema({
  subjectName: { type: String, default: '' },
  subjectIndex: { type: Number, default: 0 },
  obtainedMarks: { type: Number, default: 0 },
  totalMarks: { type: Number, default: 0 },
  passMarks: { type: Number, default: 0 },
  isPassed: { type: Boolean, default: false },
  correctAnswers: { type: Number, default: 0 },
  wrongAnswers: { type: Number, default: 0 },
  skippedAnswers: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
}, { _id: false });

const resultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  answers: [answerSchema],

  // Overall result
  totalMarks: { type: Number, default: 0 },
  obtainedMarks: { type: Number, default: 0 },
  correctAnswers: { type: Number, default: 0 },
  wrongAnswers: { type: Number, default: 0 },
  skippedAnswers: { type: Number, default: 0 },
  percentage: { type: Number, default: 0 },
  grade: { type: String, default: '' },
  isPassed: { type: Boolean, default: false },
  rank: { type: Number, default: 0 },

  // Per-subject results (multi-subject exams only, empty for single-subject)
  subjectResults: { type: [subjectResultSchema], default: [] },

  status: {
    type: String,
    enum: ['in_progress', 'submitted', 'force_submitted', 'auto_submitted'],
    default: 'in_progress'
  },
  startedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date },
  timeSpent: { type: Number, default: 0 }, // seconds
  violations: { type: Number, default: 0 },
  violationDetails: [{
    type: { type: String },
    timestamp: { type: Date, default: Date.now },
    count: { type: Number, default: 1 }
  }],
  ipAddress: { type: String, default: '' },
  browserInfo: { type: String, default: '' },

  // Saved progress for resume functionality
  savedProgress: {
    answers: { type: Map, of: String },
    reviewList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    currentQuestion: { type: Number, default: 0 },
    currentSubjectIndex: { type: Number, default: 0 }, // for multi-subject
    // optionMappings: { questionId -> { displayKey -> originalKey } }
    // Stored as Map<string, object> to resolve randomized option selections during evaluation
    optionMappings: { type: Map, of: Object },
    // Track which subjects have been completed (for multi-subject)
    completedSubjects: { type: [Number], default: [] },
    lastSaved: { type: Date },
  },
}, { timestamps: true });

// Ensure one result per student per exam
resultSchema.index({ student: 1, exam: 1 }, { unique: true });
resultSchema.index({ exam: 1, status: 1 });       // admin results listing, live monitor
resultSchema.index({ exam: 1, isPassed: 1 });     // pass rate analytics
resultSchema.index({ student: 1 });               // student's own result history
resultSchema.index({ createdAt: -1 });            // pagination sort

module.exports = mongoose.model('Result', resultSchema);
