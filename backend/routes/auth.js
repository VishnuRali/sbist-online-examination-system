const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/authController');
const { authenticate, studentOnly } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

router.post('/admin/login', loginLimiter, adminLogin);
router.post('/admin/register', adminRegister);
router.post('/student/login', loginLimiter, studentLogin);
router.post('/student/register', studentRegister);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);

// Student Force Password Change
router.post('/student/force-change-password', studentOnly, studentForceChangePassword);

// Forgot Password Flow
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);

module.exports = router;
