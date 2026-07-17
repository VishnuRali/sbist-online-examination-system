const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, uppercase: true, trim: true },
  password: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  rollNumber: { type: String, default: '', trim: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  branch: { type: String, default: '', trim: true },
  year: { type: String, required: true, enum: ['1', '2', '3', '4'] },
  semester: { type: String, required: true },
  section: { type: String, default: '', uppercase: true, trim: true },
  academicYear: { type: String, default: '', trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  mobile: { type: String, default: '', trim: true },
  role: { type: String, default: 'student' },
  isActive: { type: Boolean, default: true },
  isLoggedIn: { type: Boolean, default: false },
  currentExam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
  lastLogin: { type: Date },
  profilePic: { type: String, default: '' },
  // Google Form integration
  googleFormResponseId: { type: String, default: '', trim: true },
  // Email tracking
  welcomeEmailSent: { type: Boolean, default: false },
  welcomeEmailSentAt: { type: Date },
  // Security and password management fields
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
  isPasswordChanged: { type: Boolean, default: false },
  resetPasswordOtp: { type: String },
  resetPasswordOtpExpires: { type: Date },
  // Session management — stores the active session ID embedded in the JWT
  // When a student logs in on a new device, this is overwritten, invalidating the old session
  currentSessionId: { type: String, default: null },
  // Admin audit log — tracks every field change made by admins
  auditLog: [{
    field: { type: String },
    oldValue: { type: String },
    newValue: { type: String },
    changedBy: { type: String },  // Admin name
    changedByRole: { type: String }, // Admin role
    changedAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// ── Compound indexes for high-performance queries ────────────────────────────
studentSchema.index({ department: 1, year: 1, semester: 1, section: 1 }); // eligibility queries
studentSchema.index({ department: 1, year: 1, semester: 1 });             // broad search
studentSchema.index({ isActive: 1, department: 1 });                      // active filter
studentSchema.index({ name: 'text', email: 'text', studentId: 'text' });  // full-text search
studentSchema.index({ createdAt: -1 });                                    // pagination sort
studentSchema.index({ rollNumber: 1 });

studentSchema.pre('save', async function (next) {
  console.log(`🔐 [Student Pre-Save Hook] Save called on Student ${this.studentId || this._id}`);
  console.log(`🔐 [Student Pre-Save Hook] isModified('password'): ${this.isModified('password')}`);
  if (this.isModified('password')) {
    console.log(`🔐 [Student Pre-Save Hook] Hashing password. Length of input password: ${this.password?.length}`);
    const originalPassword = this.password;
    this.password = await bcrypt.hash(this.password, 12);
    console.log(`🔐 [Student Pre-Save Hook] Password successfully hashed. Hash length: ${this.password?.length}`);
    
    // Immediate verification check
    const match = await bcrypt.compare(originalPassword, this.password);
    console.log(`🔐 [Student Pre-Save Hook] Post-hash verification check: ${match}`);
  }
  next();
});

studentSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

studentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Student', studentSchema);
