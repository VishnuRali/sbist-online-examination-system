const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const activityLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  details: { type: String, default: '' },
  ip: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
});

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  employeeId: { type: String, required: true, unique: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  mobile: { type: String, required: true, trim: true },
  department: { type: String, required: true, trim: true },
  role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
  password: { type: String, required: true, minlength: 6 },
  isActive: { type: Boolean, default: true },
  profilePic: { type: String, default: '' },
  lastLogin: { type: Date },
  activityLogs: [activityLogSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date },
}, { timestamps: true });

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

adminSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

adminSchema.methods.logActivity = async function (action, details = '', ip = '') {
  this.activityLogs.push({ action, details, ip });
  // Keep only last 100 logs
  if (this.activityLogs.length > 100) {
    this.activityLogs = this.activityLogs.slice(-100);
  }
  await this.save();
};

adminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Admin', adminSchema);
