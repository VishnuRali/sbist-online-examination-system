const mongoose = require('mongoose');

// Embedded schema for each subject in a multi-subject exam
const examSubjectSchema = new mongoose.Schema({
  subjectName: { type: String, required: true, trim: true },
  subjectCode: { type: String, default: '', trim: true },
  duration: { type: Number, required: true, min: 1 }, // in minutes
  totalMarks: { type: Number, required: true, min: 1 },
  passMarks: { type: Number, required: true, min: 0 },
  negativeMarking: { type: Boolean, default: false },
  order: { type: Number, default: 0 }, // display/attempt order
}, { _id: false });

const examSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  examType: { type: String, enum: ['single', 'multi'], default: 'single' },

  // ── Single-subject fields (kept for backward compat) ──────────────────────
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: false },
  duration: { type: Number, min: 1, default: 60 }, // in minutes
  totalMarks: { type: Number, min: 1, default: 100 },
  passMarks: { type: Number, min: 0, default: 40 },
  negativeMarking: { type: Boolean, default: false },

  // ── Multi-subject fields ──────────────────────────────────────────────────
  subjects: { type: [examSubjectSchema], default: [] },

  // ── Common fields ─────────────────────────────────────────────────────────
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  semester: { type: String, required: true },
  year: { type: String, required: true },
  section: { type: String, default: '' },
  sections: { type: [String], default: [] },
  description: { type: String, default: '' },
  instructions: { type: String, default: '' },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
    default: 'draft'
  },
  randomizeQuestions: { type: Boolean, default: false },
  randomizeOptions: { type: Boolean, default: false },
  showResultAfterExam: { type: Boolean, default: true },
  allowDownloadResult: { type: Boolean, default: true },
  maxViolations: { type: Number, default: 3 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  totalQuestions: { type: Number, default: 0 },

  // Reminder email idempotency flags
  reminderSent24h: { type: Boolean, default: false },
  reminderSent1h: { type: Boolean, default: false },
  reminderSent30m: { type: Boolean, default: false },
}, { timestamps: true });

// Auto-update status based on time
examSchema.methods.updateStatus = function () {
  const now = new Date();
  if (this.status === 'draft') return;
  if (now >= this.startTime && now <= this.endTime) {
    this.status = 'active';
  } else if (now > this.endTime) {
    this.status = 'completed';
  }
};

// ── Compound indexes for high-performance queries ────────────────────────────
examSchema.index({ status: 1, startTime: 1, endTime: 1 });               // status cron + student dashboard
examSchema.index({ department: 1, status: 1 });                          // admin listing filter
examSchema.index({ department: 1, year: 1, semester: 1, status: 1 });   // eligibility + filtering
examSchema.index({ createdAt: -1 });                                      // default listing sort

module.exports = mongoose.model('Exam', examSchema);
