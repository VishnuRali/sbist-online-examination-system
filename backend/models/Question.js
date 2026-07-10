const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  // For multi-subject exams: which subject index (0-based) this question belongs to
  // Default 0 = first subject (or the only subject for single-subject exams)
  subjectIndex: { type: Number, default: 0, min: 0 },
  questionText: { type: String, required: true, trim: true },
  options: {
    A: { type: String, required: true, trim: true },
    B: { type: String, required: true, trim: true },
    C: { type: String, required: true, trim: true },
    D: { type: String, required: true, trim: true },
  },
  correctAnswer: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
  marks: { type: Number, required: true, default: 1, min: 0 },
  negativeMark: { type: Number, default: 0, min: 0 },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  topic: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { timestamps: true });

// Index for fast lookup by exam + subject
questionSchema.index({ exam: 1, subjectIndex: 1, order: 1 });

module.exports = mongoose.model('Question', questionSchema);
