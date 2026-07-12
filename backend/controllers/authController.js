const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Department = require('../models/Department');
const { sendOtpEmail } = require('../utils/emailService');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

// Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body; // email field may hold Email OR Admin ID (Employee ID)
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email/Admin ID and password are required' });
    }

    let admin;
    if (email.includes('@')) {
      admin = await Admin.findOne({ email: email.toLowerCase() });
    } else {
      admin = await Admin.findOne({ employeeId: email.toUpperCase() });
    }

    if (!admin) {
      console.warn(`🔑 [Admin Login Failed] Admin account with identifier "${email}" not found.`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check account lockout
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((admin.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`
      });
    }

    if (!admin.isActive) {
      console.warn(`🔑 [Admin Login Failed] Admin account "${email}" is disabled.`);
      return res.status(403).json({ success: false, message: 'Your account has been disabled. Contact Super Admin.' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      console.warn(`🔑 [Admin Login Failed] Incorrect password entered for Admin identifier "${email}".`);

      admin.loginAttempts = (admin.loginAttempts || 0) + 1;
      if (admin.loginAttempts >= 5) {
        admin.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        await admin.save();
        return res.status(403).json({
          success: false,
          message: 'Account locked due to 5 failed attempts. Please try again in 15 minutes.'
        });
      }
      await admin.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Success: reset attempts
    admin.loginAttempts = 0;
    admin.lockUntil = undefined;
    admin.lastLogin = new Date();
    admin.activityLogs = admin.activityLogs || [];
    admin.activityLogs.push({ action: 'LOGIN', details: `Logged in from ${req.ip}`, ip: req.ip });
    if (admin.activityLogs.length > 100) admin.activityLogs = admin.activityLogs.slice(-100);
    await admin.save();

    const token = generateToken({ id: admin._id, role: 'admin', email: admin.email });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: admin.toJSON(),
      role: 'admin',
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Admin Register (protected by secret — legacy route)
const adminRegister = async (req, res) => {
  try {
    const { name, email, password, adminSecret } = req.body;

    if (adminSecret !== process.env.ADMIN_SECRET) {
      return res.status(403).json({ success: false, message: 'Invalid admin secret' });
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: 'Admin with this email already exists' });
    }

    // Generate employee ID
    const count = await Admin.countDocuments();
    const employeeId = `EMP${String(count + 1).padStart(3, '0')}`;

    const admin = new Admin({
      name,
      email,
      password,
      employeeId,
      mobile: '0000000000',
      department: 'Administration',
      role: 'admin',
    });
    await admin.save();

    const token = generateToken({ id: admin._id, role: 'admin', email: admin.email });

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      token,
      user: admin.toJSON(),
    });
  } catch (error) {
    console.error('Admin register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Student Login — strictly supports studentId only
const studentLogin = async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return res.status(400).json({ success: false, message: 'Student ID and password are required' });
    }

    // Allow login using either Student ID or Roll Number
    const loginId = String(studentId).trim().toUpperCase();

    const student = await Student.findOne({
      $or: [
        { studentId: loginId },
        { rollNumber: loginId }
      ]
    }).populate('department', 'name code');

    if (!student) {
      console.warn(`🔑 [Student Login Failed] Student ID "${studentId}" not found.`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check account lockout
    if (student.lockUntil && student.lockUntil > new Date()) {
      const minutesLeft = Math.ceil((student.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(403).json({
        success: false,
        message: `Account is temporarily locked. Please try again in ${minutesLeft} minutes.`
      });
    }

    if (!student.isActive) {
      console.warn(`🔑 [Student Login Failed] Student account "${studentId}" is deactivated.`);
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
    }

    const isMatch = await student.comparePassword(password);
    if (!isMatch) {
      console.warn(`🔑 [Student Login Failed] Incorrect password entered for Student ID "${studentId}".`);

      student.loginAttempts = (student.loginAttempts || 0) + 1;
      if (student.loginAttempts >= 5) {
        student.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        await student.save();
        return res.status(403).json({
          success: false,
          message: 'Account locked due to 5 failed attempts. Please try again in 15 minutes.'
        });
      }
      await student.save();
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Generate a new session ID — this automatically invalidates any previous active session
    // on another device, without locking the account permanently.
    const sessionId = crypto.randomUUID();

    // Success: reset attempts, update session
    student.loginAttempts = 0;
    student.lockUntil = undefined;
    student.isLoggedIn = true;
    student.currentSessionId = sessionId;
    student.lastLogin = new Date();
    await student.save();

    // Include sessionId in the JWT so the middleware can validate it
    const token = generateToken({ id: student._id, role: 'student', studentId: student.studentId, sessionId });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: student.toJSON(),
      role: 'student',
      forcePasswordChange: !student.isPasswordChanged,
    });
  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// Student Register (disabled in production)
const studentRegister = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: 'Student registration on this portal is disabled. Please register using the official Google Form.'
  });
};

// Logout
const logout = async (req, res) => {
  try {
    if (req.user?.role === 'student') {
      // Clear the session ID and logged-in flag so the student can log in again cleanly
      await Student.findByIdAndUpdate(req.user.id, {
        isLoggedIn: false,
        currentSessionId: null,
        currentExam: null,
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// Get current user
const getMe = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const admin = await Admin.findById(req.user.id).select('-password');
      return res.json({ success: true, user: admin, role: admin.role });
    } else {
      const student = await Student.findById(req.user.id)
        .select('-password')
        .populate('department', 'name code');
      return res.json({ success: true, user: student, role: 'student', forcePasswordChange: !student?.isPasswordChanged });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Force Password Change for students
const studentForceChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'All password fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'New passwords do not match' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
    }

    const student = await Student.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, student.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Incorrect current password' });
    }

    // Generate a fresh sessionId so the new token is consistent with the session model
    const sessionId = crypto.randomUUID();

    student.password = newPassword; // pre-save hook hashes this
    student.isPasswordChanged = true;
    student.currentSessionId = sessionId;
    await student.save();

    const token = generateToken({
      id: student._id,
      role: 'student',
      studentId: student.studentId,
      sessionId,
    });

    const updatedStudent = await Student.findById(student._id)
      .select('-password')
      .populate('department', 'name code');

    res.json({
      success: true,
      message: 'Password changed successfully',
      token,
      role: 'student',
      user: updatedStudent,
      redirectTo: '/student/dashboard',
    });
  } catch (error) {
    console.error('Force password change error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// Forgot Password: Request OTP
const forgotPassword = async (req, res) => {
  try {
    const { studentId, email } = req.body;
    if (!studentId || !email) {
      return res.status(400).json({ success: false, message: 'Student ID and Email are required' });
    }

    const student = await Student.findOne({
      studentId: String(studentId).toUpperCase(),
      email: email.toLowerCase()
    });

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student with this ID and Email combination not found.' });
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    student.resetPasswordOtp = otp;
    student.resetPasswordOtpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await student.save();

    const mailRes = await sendOtpEmail(student.email, student.name, otp);
    if (!mailRes.success) {
      return res.status(500).json({ success: false, message: mailRes.reason || 'Failed to send OTP email' });
    }

    res.json({ success: true, message: 'OTP sent to your registered email address.' });
  } catch (error) {
    console.error('Forgot password request error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Verify Forgot Password OTP
const verifyOtp = async (req, res) => {
  try {
    const { studentId, email, otp } = req.body;
    if (!studentId || !email || !otp) {
      return res.status(400).json({ success: false, message: 'Student ID, Email, and OTP are required' });
    }

    const student = await Student.findOne({
      studentId: String(studentId).toUpperCase(),
      email: email.toLowerCase(),
      resetPasswordOtp: otp,
      resetPasswordOtpExpires: { $gt: new Date() }
    });

    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    res.json({ success: true, message: 'OTP verified successfully.' });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Reset Password with verified OTP
const resetPassword = async (req, res) => {
  try {
    const { studentId, email, otp, newPassword } = req.body;
    if (!studentId || !email || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const student = await Student.findOne({
      studentId: String(studentId).toUpperCase(),
      email: email.toLowerCase(),
      resetPasswordOtp: otp,
      resetPasswordOtpExpires: { $gt: new Date() }
    });

    if (!student) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP session.' });
    }

    student.password = newPassword; // hashes via pre-save hook
    student.isPasswordChanged = true;
    student.resetPasswordOtp = undefined;
    student.resetPasswordOtpExpires = undefined;
    await student.save();

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  adminLogin,
  adminRegister,
  studentLogin,
  studentRegister,
  logout,
  getMe,
  studentForceChangePassword,
  forgotPassword,
  verifyOtp,
  resetPassword
};
