const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Student = require('../models/Student');

const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Token is not valid' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Authentication server error' });
  }
};

const adminOnly = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Token is not valid' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
    }
    try {
      const admin = await Admin.findById(decoded.id).select('-password');
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Admin not found' });
      }
      if (!admin.isActive) {
        return res.status(403).json({ success: false, message: 'Your admin account has been disabled. Contact Super Admin.' });
      }
      req.admin = admin;
      req.user = decoded;
      next();
    } catch (dbErr) {
      return res.status(500).json({ success: false, message: 'Database error during authentication' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Authentication server error' });
  }
};

const superAdminOnly = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Token is not valid' });
    }
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
    }
    try {
      const admin = await Admin.findById(decoded.id).select('-password');
      if (!admin) {
        return res.status(401).json({ success: false, message: 'Admin not found' });
      }
      if (!admin.isActive) {
        return res.status(403).json({ success: false, message: 'Your admin account has been disabled.' });
      }
      if (admin.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Access denied. Super Admin only.' });
      }
      req.admin = admin;
      req.user = decoded;
      next();
    } catch (dbErr) {
      return res.status(500).json({ success: false, message: 'Database error during authentication' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Authentication server error' });
  }
};

const studentOnly = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token, authorization denied' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      return res.status(401).json({ success: false, message: 'Token is not valid' });
    }
    if (decoded.role !== 'student') {
      return res.status(403).json({ success: false, message: 'Access denied. Students only.' });
    }
    try {
      const student = await Student.findById(decoded.id).select('-password');
      if (!student || !student.isActive) {
        return res.status(401).json({ success: false, message: 'Student account not active' });
      }
      // Session validation: if JWT contains a sessionId, verify it matches the DB record.
      // This ensures that when a student logs in on a new device the old device gets logged out
      // automatically on their next request, without permanently locking the account.
      if (decoded.sessionId && student.currentSessionId !== decoded.sessionId) {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.',
        });
      }
      req.student = student;
      req.user = decoded;
      next();
    } catch (dbErr) {
      return res.status(500).json({ success: false, message: 'Database error during authentication' });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Authentication server error' });
  }
};

module.exports = { authenticate, adminOnly, superAdminOnly, studentOnly };

