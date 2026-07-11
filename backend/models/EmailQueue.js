const mongoose = require('mongoose');

const emailQueueSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  notificationType: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['queued', 'processing', 'sent', 'failed'], 
    default: 'queued' 
  },
  retryCount: { type: Number, default: 0 },
  maxRetryCount: { type: Number, default: 5 },
  failureReason: { type: String, default: '' },
  processingStartedAt: { type: Date },
  nextRetryTime: { type: Date, default: Date.now },
  sentAt: { type: Date },
  failedAt: { type: Date },
}, { timestamps: true });

// Unique compound index for idempotency
emailQueueSchema.index({ exam: 1, student: 1, notificationType: 1 }, { unique: true });
// Index for queue querying
emailQueueSchema.index({ status: 1, nextRetryTime: 1 });

module.exports = mongoose.model('EmailQueue', emailQueueSchema);
