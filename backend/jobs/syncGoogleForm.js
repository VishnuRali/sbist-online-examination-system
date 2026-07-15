const cron = require('node-cron');
const Student = require('../models/Student');
const Department = require('../models/Department');
const { fetchFormResponses, markRowAsSynced, isGoogleConfigured } = require('../utils/googleSheets');
const { sendWelcomeEmail } = require('../utils/emailService');
const { generatePassword } = require('../utils/generateId');
const bcrypt = require('bcryptjs');

let lastSyncTime = null;
let lastSyncResult = { created: 0, skipped: 0, emailsSent: 0, emailsFailed: 0, errors: [] };

let isSyncing = false;

const processFormResponses = async () => {
  if (isSyncing) {
    console.log('[GoogleFormSync] Sync is already in progress, rejecting request.');
    return { 
      success: false, 
      reason: 'Synchronization is already in progress. Please wait until it completes.', 
      created: 0, skipped: 0, emailsSent: 0, emailsFailed: 0, errors: [],
    };
  }

  isSyncing = true;
  try {
    const configured = await isGoogleConfigured();
  if (!configured) {
    return { 
      success: false, 
      reason: 'Google Sheets API settings are not configured. Please check settings page.', 
      created: 0, skipped: 0, emailsSent: 0, emailsFailed: 0, errors: [],
    };
  }

  console.log('[GoogleFormSync] Fetching Google Sheets responses...');
  const { success, data, reason, syncColLetter } = await fetchFormResponses();
  if (!success) {
    return { 
      success: false, 
      reason: reason || 'Failed to fetch form responses', 
      created: 0, skipped: 0, emailsSent: 0, emailsFailed: 0, errors: [],
    };
  }

  let created = 0;
  let skipped = 0;
  let emailsSent = 0;
  let emailsFailed = 0;
  const errors = [];

  for (const response of data) {
    try {
      // ── 1. Skip duplicate emails ─────────────────────────
      const existingByEmail = await Student.findOne({ email: response.email });
      if (existingByEmail) {
        skipped++;
        // Mark as synced so we don't keep retrying
        await markRowAsSynced(response.rowIndex, response.syncColLetter || syncColLetter || 'K');
        continue;
      }

      // ── 2. Skip duplicate roll numbers (if provided) ─────
      if (response.rollNumber) {
        const existingByRoll = await Student.findOne({ rollNumber: response.rollNumber });
        if (existingByRoll) {
          skipped++;
          continue;
        }
      }

      // ── 3. Find department by EXACT name or code match (ignoring capitalization and extra whitespace) ─
      const rawDeptName = response.departmentName || '';
      const deptName = rawDeptName.trim().replace(/\s+/g, ' ');

      if (!deptName) {
        throw new Error('Department is empty');
      }

      // Escape regex special chars
      const escapedDeptName = deptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      let dept = await Department.findOne({ 
        $or: [
          { name: { $regex: new RegExp(`^${escapedDeptName}$`, 'i') } },
          { code: { $regex: new RegExp(`^${escapedDeptName}$`, 'i') } }
        ],
        isActive: true,
      });

      if (!dept) {
        throw new Error(`Invalid Department name or code: "${rawDeptName}". Must be one of the allowed department names or codes.`);
      }

      // ── 4. Validate Year: must be 1, 2, 3, or 4 ──
      const rawYear = response.year || '';
      const year = rawYear.trim().replace(/\s+/g, ' ');
      if (!['1', '2', '3', '4'].includes(year)) {
        throw new Error(`Invalid Year: "${rawYear}". Allowed values: 1, 2, 3, 4.`);
      }

      // ── 5. Validate Semester: must be 1 or 2 ──
      const rawSemester = response.semester || '';
      const semester = rawSemester.trim().replace(/\s+/g, ' ');
      if (!['1', '2'].includes(semester)) {
        throw new Error(`Invalid Semester: "${rawSemester}". Allowed values: 1, 2.`);
      }

      // ── 6. Validate Section: must be A, B, or C ──
      const rawSection = response.section || '';
      const section = rawSection.trim().replace(/\s+/g, ' ').toUpperCase();
      if (!['A', 'B', 'C'].includes(section)) {
        throw new Error(`Invalid Section: "${rawSection}". Allowed values: A, B, C.`);
      }

      // ── 7. Generate unique Student ID ───────────────────
      const currentYear = new Date().getFullYear();
      const prefix = `SBIT${currentYear}`;
      let sequence = (await Student.countDocuments({ studentId: { $regex: new RegExp(`^${prefix}`) } })) + 1;
      let studentId;
      let isUnique = false;
      while (!isUnique) {
        studentId = `${prefix}${String(sequence).padStart(4, '0')}`;
        const dup = await Student.findOne({ studentId });
        if (!dup) { isUnique = true; } else { sequence++; }
      }

      // ── 8. Generate secure password ──────────────────────
      const plainPassword = generatePassword(8);

      // ── 9. Save student record ───────────────────────────
      const student = new Student({
        studentId,
        password:      plainPassword,     // pre-save hook hashes this
        name:          response.name,
        email:         response.email,
        rollNumber:    response.rollNumber || '',
        mobile:        response.phone      || '',
        department:    dept._id,
        year,
        semester,
        section,
        academicYear:  response.academicYear || '',
        googleFormResponseId: response.responseId,
      });
      await student.save();

      // ── 10. Verify hash in DB BEFORE sending email ────────
      const saved = await Student.findOne({ studentId }).populate('department', 'name');
      if (!saved) throw new Error(`ABORT: Student ${studentId} not found after save`);
      const hashOk = await bcrypt.compare(plainPassword, saved.password);
      if (!hashOk) throw new Error(`ABORT: Password hash mismatch for Student ${studentId}`);
      console.log(`✅ [GoogleFormSync] Verified: ${studentId} (${response.name})`);
      created++;

      // ── 11. Send welcome email ────────────────────────────
      try {
        const mailRes = await sendWelcomeEmail({
          ...saved.toJSON(),
          studentId,
          password: plainPassword,
          name:     response.name,
          email:    response.email,
          department: saved.department,
          year,
          semester,
          section,
          academicYear: response.academicYear || '',
        });
        if (mailRes.success) { emailsSent++; } else { emailsFailed++; }
      } catch (mailErr) {
        emailsFailed++;
        console.error(`[GoogleFormSync] Email error for ${response.email}:`, mailErr.message);
      }

      // ── 12. Mark row as Synced in sheet ──────────────────
      await markRowAsSynced(response.rowIndex, response.syncColLetter || syncColLetter || 'K');

    } catch (error) {
      console.error('[GoogleFormSync] Row error:', error.message);
      if (error.message && error.message.startsWith('ABORT:')) throw error;
      errors.push({ 
        email: response.email || 'unknown', 
        rollNumber: response.rollNumber || response.email || 'unknown',
        reason: error.message 
      });
    }
  }

  lastSyncTime = new Date();
  lastSyncResult = { created, skipped, emailsSent, emailsFailed, errors };

  console.log(`[GoogleFormSync] Done — Created: ${created}, Skipped: ${skipped}, Emails: ${emailsSent}✓ ${emailsFailed}✗`);
  return { success: true, created, skipped, emailsSent, emailsFailed, errors };
  } finally {
    isSyncing = false;
  }
};

const startGoogleFormSync = () => {
  console.log('ℹ️ Google Form automatic sync cron is disabled (Manual sync only).');
};

const getSyncStatus = async () => {
  const configured = await isGoogleConfigured();
  return { lastSyncTime, lastSyncResult, isConfigured: configured };
};

module.exports = { startGoogleFormSync, processFormResponses, getSyncStatus };
