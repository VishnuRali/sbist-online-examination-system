const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  to: { type: String, required: true, lowercase: true, trim: true },
  studentName: { type: String, default: '' },
  studentId: { type: String, default: '' },
  type: { 
    type: String, 
    enum: ['welcome', 'reminder_24h', 'reminder_1h', 'reminder_30m', 'custom'], 
    required: true 
  },
  status: { type: String, enum: ['sent', 'failed', 'pending'], default: 'pending' },
  subject: { type: String, default: '' },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  errorMessage: { type: String, default: '' },
  sentAt: { type: Date },
  attemptedAt: { type: Date, default: Date.now },
  attempts: { type: Number, default: 1 },
  nextAttemptAt: { type: Date },
  retried: { type: Boolean, default: false },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  year: { type: String, default: '' },
  semester: { type: String, default: '' },
  section: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('EmailLog', emailLogSchema);
