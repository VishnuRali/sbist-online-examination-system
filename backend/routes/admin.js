const express = require('express');
const router = express.Router();
const { adminOnly, superAdminOnly } = require('../middleware/auth');

// Existing admin controller
const {
  getAllStudents, getActiveStudents, generateStudentCredentials,
  toggleStudentStatus, forceLogoutStudent,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getSubjects, createSubject, updateSubject, deleteSubject,
  getDashboardStats, exportStudentsExcel, downloadCSVTemplate,
  updateStudentProfile, bulkUpdateStudents, getStudentAuditLog, exportSelectedStudents
} = require('../controllers/adminController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// New admin management controller
const {
  getAllAdmins, createAdmin, updateAdmin, deleteAdmin, toggleAdminStatus,
  resetAdminPassword, getAdminActivityLogs,
  getEmailLogs,
  importStudentsCSV,
  sendManualReminders,
  getSettings, saveSettings, testSettings,
  retrySingleEmail, retryAllFailedEmails,
  exportFailedEmailLogs,
  previewRecipientCount,
  getLiveMonitorData
} = require('../controllers/adminManagementController');

// ==================== DASHBOARD ====================
router.get('/dashboard', adminOnly, getDashboardStats);

// ==================== STUDENTS ====================
router.get('/students', adminOnly, getAllStudents);
router.get('/students/active', adminOnly, getActiveStudents);
router.post('/students/:studentId/credentials', adminOnly, generateStudentCredentials);
router.patch('/students/:studentId/toggle', adminOnly, toggleStudentStatus);
router.post('/students/:studentId/force-logout', adminOnly, forceLogoutStudent);
router.put('/students/:studentId', adminOnly, updateStudentProfile);
router.get('/students/:studentId/audit-log', adminOnly, getStudentAuditLog);
router.post('/students/bulk-update', adminOnly, bulkUpdateStudents);
router.post('/students/export-selected', adminOnly, exportSelectedStudents);
router.get('/export/students', adminOnly, exportStudentsExcel);

// ==================== DEPARTMENTS ====================
router.get('/departments', getDepartments); // Public for registration form
router.post('/departments', adminOnly, createDepartment);
router.put('/departments/:id', adminOnly, updateDepartment);
router.delete('/departments/:id', adminOnly, deleteDepartment);

// ==================== SUBJECTS ====================
router.get('/subjects', adminOnly, getSubjects);
router.post('/subjects', adminOnly, createSubject);
router.put('/subjects/:id', adminOnly, updateSubject);
router.delete('/subjects/:id', adminOnly, deleteSubject);

// ==================== ADMIN MANAGEMENT (Super Admin only) ====================
router.get('/admins', superAdminOnly, getAllAdmins);
router.post('/admins', superAdminOnly, createAdmin);
router.put('/admins/:adminId', superAdminOnly, updateAdmin);
router.delete('/admins/:adminId', superAdminOnly, deleteAdmin);
router.patch('/admins/:adminId/toggle', superAdminOnly, toggleAdminStatus);
router.post('/admins/:adminId/reset-password', superAdminOnly, resetAdminPassword);
router.get('/admins/:adminId/logs', superAdminOnly, getAdminActivityLogs);

// ==================== EMAIL LOGS ====================
router.get('/email-logs', adminOnly, getEmailLogs);
router.get('/email-logs/export-failed', adminOnly, exportFailedEmailLogs);
router.post('/email-logs/retry-all', adminOnly, retryAllFailedEmails);
router.post('/email-logs/:logId/retry', adminOnly, retrySingleEmail);

// ==================== CSV STUDENT IMPORT ====================
router.get('/students/csv-template', adminOnly, downloadCSVTemplate);
router.post('/students/import-csv', adminOnly, upload.single('file'), importStudentsCSV);

// ==================== MANUAL REMINDERS ====================
router.post('/send-reminders', adminOnly, sendManualReminders);
router.post('/send-reminders/preview-count', adminOnly, previewRecipientCount);
router.get('/live-monitor', adminOnly, getLiveMonitorData);

// ==================== MANUAL GOOGLE FORM SYNC ====================
router.post('/sync-google-form', adminOnly, async (req, res) => {
  try {
    const { processFormResponses } = require('../jobs/syncGoogleForm');
    const result = await processFormResponses();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, reason: error.message });
  }
});

// ==================== SYSTEM SETTINGS (Super Admin only) ====================
router.get('/settings', superAdminOnly, getSettings);
router.post('/settings', superAdminOnly, saveSettings);
router.post('/settings/test', superAdminOnly, testSettings);

module.exports = router;
