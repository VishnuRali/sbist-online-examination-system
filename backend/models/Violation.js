const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  type: { type: String, required: true }, // 'Head Turn', 'No Face', 'Multiple Faces', 'Auto Submitted', etc.
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

// Index for live monitoring queries
violationSchema.index({ examId: 1, timestamp: -1 });

module.exports = mongoose.model('Violation', violationSchema);
