const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const EmailLog = require('../models/EmailLog');
const Settings = require('../models/Settings');
const Student = require('../models/Student');
const Department = require('../models/Department');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Subject = require('../models/Subject');
const bcrypt = require('bcryptjs');
const { generatePassword } = require('../utils/generateId');
const { parseStudentsFromCSV } = require('../utils/csvParser');
const { sendWelcomeEmail, testSmtpConnection, retryEmailLog, retryAllFailedLogs } = require('../utils/emailService');
const { testSheetsConnection } = require('../utils/googleSheets');
const { formatDateTime } = require('../utils/dateFormatter');

// ==================== ADMIN CRUD (Super Admin only) ====================

const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, admins, count: admins.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createAdmin = async (req, res) => {
  try {
    const { name, employeeId, email, mobile, department, role, password } = req.body;

    if (!name || !employeeId || !email || !mobile || !department || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only Super Admin can create another Super Admin' });
    }

    const existingEmail = await Admin.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const existingEmpId = await Admin.findOne({ employeeId });
    if (existingEmpId) {
      return res.status(400).json({ success: false, message: 'Employee ID already in use' });
    }

    const admin = new Admin({
      name,
      employeeId,
      email: email.toLowerCase(),
      mobile,
      department,
      role: role || 'admin',
      password,
      isActive: true,
      createdBy: req.admin._id,
    });

    await admin.save();

    await req.admin.logActivity('CREATE_ADMIN', `Created admin: ${name} (${email})`, req.ip);

    res.status(201).json({ success: true, message: 'Admin created successfully', admin: admin.toJSON() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateAdmin = async (req, res) => {
  try {
    const { name, employeeId, email, mobile, department, role } = req.body;
    const targetAdmin = await Admin.findById(req.params.adminId);

    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (targetAdmin.role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot modify Super Admin account' });
    }

    if (email && email !== targetAdmin.email) {
      const existing = await Admin.findOne({ email: email.toLowerCase() });
      if (existing) return res.status(400).json({ success: false, message: 'Email already in use' });
    }

    const updates = { name, employeeId, email, mobile, department };
    if (role && req.admin.role === 'super_admin') updates.role = role;

    const updated = await Admin.findByIdAndUpdate(
      req.params.adminId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    await req.admin.logActivity('UPDATE_ADMIN', `Updated admin: ${targetAdmin.email}`, req.ip);

    res.json({ success: true, message: 'Admin updated successfully', admin: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteAdmin = async (req, res) => {
  try {
    const targetAdmin = await Admin.findById(req.params.adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (targetAdmin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    if (targetAdmin.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot delete Super Admin account' });
    }

    await Admin.findByIdAndDelete(req.params.adminId);
    await req.admin.logActivity('DELETE_ADMIN', `Deleted admin: ${targetAdmin.email}`, req.ip);

    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleAdminStatus = async (req, res) => {
  try {
    const targetAdmin = await Admin.findById(req.params.adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (targetAdmin._id.toString() === req.admin._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot disable your own account' });
    }
    if (targetAdmin.role === 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot disable Super Admin' });
    }

    targetAdmin.isActive = !targetAdmin.isActive;
    await targetAdmin.save();

    await req.admin.logActivity(
      'TOGGLE_ADMIN_STATUS',
      `${targetAdmin.isActive ? 'Enabled' : 'Disabled'} admin: ${targetAdmin.email}`,
      req.ip
    );

    res.json({
      success: true,
      message: `Admin ${targetAdmin.isActive ? 'enabled' : 'disabled'}`,
      isActive: targetAdmin.isActive
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetAdminPassword = async (req, res) => {
  try {
    const targetAdmin = await Admin.findById(req.params.adminId);
    if (!targetAdmin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    if (targetAdmin.role === 'super_admin' && req.admin.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Cannot reset Super Admin password' });
    }

    const newPassword = generatePassword(10);
    targetAdmin.password = newPassword;
    await targetAdmin.save();

    await req.admin.logActivity('RESET_ADMIN_PASSWORD', `Reset password for: ${targetAdmin.email}`, req.ip);

    res.json({
      success: true,
      message: 'Password reset successfully',
      newPassword,
      adminName: targetAdmin.name,
      adminEmail: targetAdmin.email
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAdminActivityLogs = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.adminId).select('name email activityLogs');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const logs = [...(admin.activityLogs || [])].reverse().slice(0, 50);
    res.json({ success: true, admin: { name: admin.name, email: admin.email }, logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEmailLogs = async (req, res) => {
  try {
    const { type, status, department, year, semester, section, exam, subject, dateFrom, dateTo, page = 1, limit = 30, search } = req.query;
    const query = {};
    if (type) query.type = type;
    if (status && !['queued', 'scheduled', 'processing'].includes(status)) query.status = status;
    if (department) query.department = department;
    if (year) query.year = String(year).trim();
    if (semester) query.semester = String(semester).trim();
    if (section) query.section = String(section).trim().toUpperCase();
    if (exam) query.exam = exam;
    if (subject) {
      const Exam = require('../models/Exam');
      const matchingExams = await Exam.find({ subject }).select('_id').lean();
      query.exam = { $in: matchingExams.map(e => e._id) };
    }
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    if (search) {
      const cleanSearch = String(search).trim();
      if (cleanSearch) {
        const matchingStudents = await Student.find({
          $or: [
            { studentId: { $regex: cleanSearch, $options: 'i' } },
            { name: { $regex: cleanSearch, $options: 'i' } },
            { email: { $regex: cleanSearch, $options: 'i' } }
          ]
        }).select('_id').lean();
        const studentIds = matchingStudents.map(s => s._id);

        query.$or = [
          { studentId: { $regex: cleanSearch, $options: 'i' } },
          { studentName: { $regex: cleanSearch, $options: 'i' } },
          { to: { $regex: cleanSearch, $options: 'i' } },
          { student: { $in: studentIds } }
        ];
      }
    }

    const statsQuery = { ...query };
    delete statsQuery.status;

    const statsResult = await EmailLog.aggregate([
      { $match: statsQuery },
      {
        $group: {
          _id: null,
          totalEmails: { $sum: 1 },
          sentCount: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failedCount: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          retriedCount: { $sum: { $cond: [{ $eq: ['$retried', true] }, 1, 0] } }
        }
      }
    ]);

    const stats = statsResult[0] || {
      totalEmails: 0,
      sentCount: 0,
      failedCount: 0,
      pendingCount: 0,
      retriedCount: 0
    };

    const EmailQueue = require('../models/EmailQueue');
    const now = new Date();
    let logs = [];
    let total = 0;

    if (status === 'queued' || status === 'scheduled' || status === 'processing') {
      const qQuery = {};
      if (exam) qQuery.exam = exam;
      if (status === 'queued') {
        qQuery.status = 'queued';
        qQuery.nextRetryTime = { $lte: now };
      } else if (status === 'scheduled') {
        qQuery.status = 'queued';
        qQuery.nextRetryTime = { $gt: now };
      } else if (status === 'processing') {
        qQuery.status = 'processing';
      }

      let queueItems = await EmailQueue.find(qQuery)
        .populate('exam', 'title')
        .populate({
          path: 'student',
          select: 'name studentId rollNumber department year semester section',
          populate: { path: 'department', select: 'name code' }
        })
        .sort({ createdAt: -1 })
        .lean();

      if (department) {
        queueItems = queueItems.filter(q => q.student?.department?._id?.toString() === department);
      }
      if (year) {
        queueItems = queueItems.filter(q => String(q.student?.year) === String(year).trim());
      }
      if (semester) {
        queueItems = queueItems.filter(q => String(q.student?.semester) === String(semester).trim());
      }
      if (section) {
        queueItems = queueItems.filter(q => String(q.student?.section || '').trim().toUpperCase() === String(section).trim().toUpperCase());
      }
      if (search) {
        const s = search.toLowerCase().trim();
        queueItems = queueItems.filter(q =>
          q.email?.toLowerCase().includes(s) ||
          q.student?.name?.toLowerCase().includes(s) ||
          q.student?.studentId?.toLowerCase().includes(s) ||
          q.student?.rollNumber?.toLowerCase().includes(s)
        );
      }

      total = queueItems.length;
      const paginatedItems = queueItems.slice((page - 1) * limit, page * limit);

      logs = paginatedItems.map(q => {
        const isScheduled = q.status === 'queued' && q.nextRetryTime > now;
        return {
          _id: q._id,
          to: q.email,
          studentName: q.student?.name || '—',
          studentId: q.student?.studentId || '—',
          type: q.notificationType,
          status: isScheduled ? 'scheduled' : q.status,
          subject: q.notificationType === 'welcome'
            ? `🎓 Welcome to SBIT Exam Portal`
            : `📚 Exam Announcement: ${q.exam?.title || 'Exam'}`,
          exam: q.exam,
          student: q.student,
          errorMessage: q.failureReason || '',
          attemptedAt: q.updatedAt,
          createdAt: q.createdAt,
          attempts: q.retryCount + 1,
          nextAttemptAt: q.nextRetryTime,
          department: q.student?.department,
          year: q.student?.year,
          semester: q.student?.semester,
          section: q.student?.section,
          isQueueRecord: true
        };
      });
    } else {
      const logQuery = { ...query };
      if (status === 'retried') {
        // 'retried' is a boolean field, not a status enum value
        logQuery.retried = true;
        delete logQuery.status;
      } else if (status) {
        logQuery.status = status;
      }

      logs = await EmailLog.find(logQuery)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .populate('exam', 'title')
        .populate('student', 'name studentId rollNumber')
        .populate('department', 'name code')
        .lean();

      if (status) {
        if (status === 'sent') total = stats.sentCount;
        else if (status === 'failed') total = stats.failedCount;
        else if (status === 'pending') total = stats.pendingCount;
        else total = await EmailLog.countDocuments(logQuery);
      } else {
        total = stats.totalEmails;
      }

      if (!status && parseInt(page) === 1) {
        const qQuery = { status: { $in: ['queued', 'processing'] } };
        if (exam) qQuery.exam = exam;

        let activeQueue = await EmailQueue.find(qQuery)
          .populate('exam', 'title')
          .populate({
            path: 'student',
            select: 'name studentId rollNumber department year semester section',
            populate: { path: 'department', select: 'name code' }
          })
          .sort({ createdAt: -1 })
          .lean();

        if (department) {
          activeQueue = activeQueue.filter(q => q.student?.department?._id?.toString() === department);
        }
        if (year) {
          activeQueue = activeQueue.filter(q => String(q.student?.year) === String(year).trim());
        }
        if (semester) {
          activeQueue = activeQueue.filter(q => String(q.student?.semester) === String(semester).trim());
        }
        if (section) {
          activeQueue = activeQueue.filter(q => String(q.student?.section || '').trim().toUpperCase() === String(section).trim().toUpperCase());
        }
        if (search) {
          const s = search.toLowerCase().trim();
          activeQueue = activeQueue.filter(q =>
            q.email?.toLowerCase().includes(s) ||
            q.student?.name?.toLowerCase().includes(s) ||
            q.student?.studentId?.toLowerCase().includes(s) ||
            q.student?.rollNumber?.toLowerCase().includes(s)
          );
        }

        const mappedQueue = activeQueue.map(q => {
          const isScheduled = q.status === 'queued' && q.nextRetryTime > now;
          return {
            _id: q._id,
            to: q.email,
            studentName: q.student?.name || '—',
            studentId: q.student?.studentId || '—',
            type: q.notificationType,
            status: isScheduled ? 'scheduled' : q.status,
            subject: q.notificationType === 'welcome'
              ? `🎓 Welcome to SBIT Exam Portal`
              : `📚 Exam Announcement: ${q.exam?.title || 'Exam'}`,
            exam: q.exam,
            student: q.student,
            errorMessage: q.failureReason || '',
            attemptedAt: q.updatedAt,
            createdAt: q.createdAt,
            attempts: q.retryCount + 1,
            nextAttemptAt: q.nextRetryTime,
            department: q.student?.department,
            year: q.student?.year,
            semester: q.student?.semester,
            section: q.student?.section,
            isQueueRecord: true
          };
        });

        logs = [...mappedQueue, ...logs];
        total += mappedQueue.length;
      }
    }

    res.json({
      success: true,
      logs,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      totalEmails: stats.totalEmails,
      sentCount: stats.sentCount,
      failedCount: stats.failedCount,
      pendingCount: stats.pendingCount,
      retriedCount: stats.retriedCount
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const retrySingleEmail = async (req, res) => {
  try {
    const { logId } = req.params;
    const EmailLog = require('../models/EmailLog');
    const log = await EmailLog.findById(logId);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Email log not found' });
    }
    const result = await retryEmailLog(log);
    if (result.success) {
      res.json({ success: true, message: 'Email resent successfully!' });
    } else {
      res.status(400).json({ success: false, message: result.error || 'Resend failed' });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const retryAllFailedEmails = async (req, res) => {
  try {
    const result = await retryAllFailedLogs();

    const EmailQueue = require('../models/EmailQueue');
    const queueResult = await EmailQueue.updateMany(
      { status: 'failed' },
      { $set: { status: 'queued', retryCount: 0, nextRetryTime: new Date() } }
    );

    res.json({
      success: true,
      message: `Retry process complete. Legacy sent: ${result.successCount}, failed: ${result.failCount}. Background queue retries reset: ${queueResult.modifiedCount}.`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEmailQueueProgress = async (req, res) => {
  try {
    const { examId } = req.query;
    const query = {};
    if (examId) query.exam = examId;

    const EmailQueue = require('../models/EmailQueue');
    const now = new Date();

    const statsResult = await EmailQueue.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
          failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        }
      }
    ]);

    const stats = statsResult[0] || {
      total: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };

    // Scheduled: queued status but nextRetryTime is in the future
    const scheduled = await EmailQueue.countDocuments({
      ...query,
      status: 'queued',
      nextRetryTime: { $gt: now }
    });

    // Queued: queued status and nextRetryTime is now or past
    const queued = await EmailQueue.countDocuments({
      ...query,
      status: 'queued',
      nextRetryTime: { $lte: now }
    });

    const nextJob = await EmailQueue.findOne({
      ...query,
      status: 'queued',
      nextRetryTime: { $gt: now }
    })
    .sort({ nextRetryTime: 1 })
    .select('nextRetryTime')
    .lean();

    const nextScheduledTime = nextJob ? nextJob.nextRetryTime : null;

    const delayedJob = await EmailQueue.findOne({
      ...query,
      status: 'queued',
      nextRetryTime: { $lte: new Date(Date.now() - 60 * 1000) }
    }).lean();

    const isDelayed = !!delayedJob;

    let statusText = 'idle';
    if (stats.processing > 0) {
      statusText = 'active';
    } else if (queued > 0) {
      statusText = isDelayed ? 'delayed' : 'active';
    } else if (scheduled > 0) {
      statusText = 'scheduled';
    }

    const completedPercent = stats.total > 0
      ? Math.round((stats.sent / stats.total) * 100)
      : 0;

    res.json({
      success: true,
      progress: {
        total: stats.total,
        queued,
        scheduled,
        processing: stats.processing,
        sent: stats.sent,
        failed: stats.failed,
        percentage: completedPercent,
        nextScheduledTime,
        statusText,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const importStudentsCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a CSV file' });
    }

    const { students, errors: parseErrors } = parseStudentsFromCSV(req.file.buffer);

    if (students.length === 0 && parseErrors.length > 0) {
      return res.status(400).json({ success: false, message: parseErrors[0], errors: parseErrors });
    }

    const errors = [...parseErrors];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let emailsSent = 0;
    let emailsFailed = 0;

    const uniqueDeptNames = [...new Set(
      students.map(s => (s.departmentName || '').trim().toLowerCase()).filter(Boolean)
    )];
    const deptCache = new Map();

    await Promise.all(uniqueDeptNames.map(async (deptNameLower) => {
      const escaped = deptNameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const dept = await Department.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${escaped}$`, 'i') } },
          { code: { $regex: new RegExp(`^${escaped}$`, 'i') } },
        ],
        isActive: true,
      }).lean();
      if (dept) deptCache.set(deptNameLower, dept);
    }));

    const toCreate = [];

    for (const sData of students) {
      const sectionVal = (sData.section || '').trim().toUpperCase();
      if (!sectionVal) {
        errors.push({ rollNumber: sData.rollNumber || 'N/A', reason: 'Section is missing' });
        continue;
      }
      if (!/^[A-Z]$/.test(sectionVal)) {
        errors.push({ rollNumber: sData.rollNumber || 'N/A', reason: `Invalid section value: "${sData.section}"` });
        continue;
      }

      const rawDeptName = (sData.departmentName || '').trim();
      if (!rawDeptName) {
        errors.push({ rollNumber: sData.rollNumber || 'N/A', reason: 'Department name is missing in CSV' });
        continue;
      }

      const dept = deptCache.get(rawDeptName.toLowerCase());
      if (!dept) {
        errors.push({
          rollNumber: sData.rollNumber || 'N/A',
          reason: `Department not found: "${rawDeptName}". Please create it first in the portal.`,
        });
        continue;
      }

      const emailVal = emailLower(sData.email);

      let existingStudent = null;
      if (sData.rollNumber) {
        existingStudent = await Student.findOne({ rollNumber: sData.rollNumber });
      }
      if (!existingStudent && emailVal) {
        existingStudent = await Student.findOne({ email: emailVal });
      }

      if (existingStudent) {
        existingStudent.section = sectionVal;
        existingStudent.department = dept._id;
        existingStudent.year = String(sData.year || '1');
        existingStudent.semester = String(sData.semester || '1');
        if (emailVal) existingStudent.email = emailVal;
        if (sData.mobile) existingStudent.mobile = sData.mobile;

        try {
          await existingStudent.save();
          updated++;
        } catch (err) {
          errors.push({ rollNumber: sData.rollNumber || 'N/A', reason: `Failed to update existing student: ${err.message}` });
        }
      } else {
        sData.section = sectionVal;
        toCreate.push({ sData, dept });
      }
    }

    const currentYear = new Date().getFullYear();
    const prefix = `SBIT${currentYear}`;
    let sequence = 1;

    if (toCreate.length > 0) {
      const lastStudent = await Student
        .findOne({ studentId: { $regex: new RegExp(`^${prefix}`) } })
        .sort({ studentId: -1 })
        .select('studentId')
        .lean();

      if (lastStudent) {
        const lastSeq = parseInt(lastStudent.studentId.replace(prefix, ''), 10);
        if (!isNaN(lastSeq)) sequence = lastSeq + 1;
      }
    }

    const BATCH_SIZE = 50;
    const savedStudents = [];

    for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
      const batch = toCreate.slice(i, i + BATCH_SIZE);

      const saveTasks = batch.map(async ({ sData, dept }) => {
        const studentId = `${prefix}${String(sequence++).padStart(4, '0')}`;
        const plainPassword = generatePassword(8);

        try {
          const student = new Student({
            studentId,
            password: plainPassword,
            name: sData.name,
            rollNumber: sData.rollNumber,
            department: dept._id,
            branch: sData.branch || '',
            year: String(sData.year || '1'),
            semester: String(sData.semester || '1'),
            section: sData.section || '',
            email: emailLower(sData.email),
            mobile: sData.mobile || '',
          });
          await student.save();
          created++;
          savedStudents.push({ student, plainPassword });
        } catch (err) {
          errors.push({ rollNumber: sData.rollNumber || 'N/A', reason: err.message });
        }
      });

      await Promise.all(saveTasks);
    }

    const EMAIL_CONCURRENCY = 5;

    for (let i = 0; i < savedStudents.length; i += EMAIL_CONCURRENCY) {
      const batch = savedStudents.slice(i, i + EMAIL_CONCURRENCY);
      const emailTasks = batch.map(({ student, plainPassword }) =>
        sendWelcomeEmail({
          ...student.toJSON(),
          password: plainPassword,
        }).then(r => {
          if (r.success) emailsSent++;
          else emailsFailed++;
        }).catch(() => { emailsFailed++; })
      );
      await Promise.allSettled(emailTasks);

      if (i + EMAIL_CONCURRENCY < savedStudents.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    if (req.admin) {
      await req.admin.logActivity(
        'CSV_STUDENT_IMPORT',
        `Imported ${created} new students, updated ${updated} existing, skipped ${skipped} duplicates, ${emailsSent} emails sent, ${emailsFailed} failed`,
        req.ip
      );
    }

    res.json({
      success: true,
      created,
      updated,
      skipped,
      emailsSent,
      emailsFailed,
      errors,
      total: students.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

function emailLower(email) {
  return (email || '').toLowerCase().trim();
}

const { buildStudentEligibilityQuery } = require('../utils/studentEligibility');

const sendManualReminders = async (req, res) => {
  try {
    const { examId, type, target = 'all', targetValue } = req.body;

    if (!examId || !type) {
      return res.status(400).json({ success: false, message: 'examId and type are required' });
    }

    const validTypes = ['reminder_24h', 'reminder_1h', 'reminder_30m', 'custom'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `Invalid type. Use: ${validTypes.join(', ')}` });
    }

    const validTargets = ['all', 'department', 'year', 'semester', 'section', 'student', 'filter'];
    if (!validTargets.includes(target)) {
      return res.status(400).json({ success: false, message: `Invalid target. Use: ${validTargets.join(', ')}` });
    }

    const Exam = require('../models/Exam');
    const { sendReminderEmail } = require('../utils/emailService');

    const exam = await Exam.findById(examId).populate('department subject');
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (target === 'student' && !targetValue) {
      return res.status(400).json({ success: false, message: 'targetValue (studentId) is required for target=student' });
    }

    const studentQuery = await buildStudentEligibilityQuery(exam, req.body);

    console.log('[DEBUG] Send Reminders Requested filters:', req.body);
    console.log('[DEBUG] Send Reminders Mongo query:', JSON.stringify(studentQuery, null, 2));

    const students = await Student.find(studentQuery);

    console.log('[DEBUG] Send Reminders Students matched:', students.length);
    console.log('[DEBUG] Send Reminders Matched student IDs:', students.map(s => s.studentId || s._id));

    let sent = 0, failed = 0, skipped = 0;
    const errorsList = [];

    for (const student of students) {
      try {
        const alreadySent = await EmailLog.findOne({
          exam: exam._id,
          student: student._id,
          type,
          status: 'sent'
        });
        if (alreadySent) {
          skipped++;
          continue;
        }

        const result = await sendReminderEmail(student, exam, type);
        if (result.success) sent++;
        else failed++;

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        errorsList.push({ rollNumber: student.rollNumber || 'N/A', reason: err.message });
        failed++;
      }
    }

    await req.admin.logActivity(
      'SEND_REMINDERS',
      `Sent ${type} reminders (target=${target}) for "${exam.title}": ${sent} sent, ${failed} failed, ${skipped} skipped`,
      req.ip
    );

    res.json({ success: true, sent, failed, skipped, total: students.length, target, targetValue, errors: errorsList });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportFailedEmailLogs = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');

    const logs = await EmailLog.find({ status: 'failed' })
      .populate('department', 'name')
      .populate('exam', 'title')
      .sort({ updatedAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Failed Email Deliveries');
    sheet.columns = [
      { header: 'Student Name', key: 'studentName', width: 25 },
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Email Address', key: 'to', width: 30 },
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Exam Title', key: 'examTitle', width: 30 },
      { header: 'Email Type', key: 'type', width: 15 },
      { header: 'Attempts', key: 'attempts', width: 10 },
      { header: 'Failure Reason', key: 'errorMessage', width: 45 },
      { header: 'Attempted At', key: 'attemptedAt', width: 22 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };

    logs.forEach(l => {
      sheet.addRow({
        studentName: l.studentName || '—',
        studentId: l.studentId || '—',
        to: l.to,
        department: l.department?.name || '—',
        year: l.year || '—',
        semester: l.semester || '—',
        section: l.section || '—',
        examTitle: l.exam?.title || '—',
        type: l.type,
        attempts: l.attempts,
        errorMessage: l.errorMessage || 'Unknown Error',
        attemptedAt: l.attemptedAt ? formatDateTime(l.attemptedAt) : '—',
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=failed_email_logs.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const previewRecipientCount = async (req, res) => {
  try {
    const { target, examId, targetValue } = req.body;

    const Exam = require('../models/Exam');
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found' });

    if (target === 'student' && !targetValue) {
      return res.json({ success: true, count: 0 });
    }

    const studentQuery = await buildStudentEligibilityQuery(exam, req.body);

    console.log('[DEBUG] Recipients Preview Requested filters:', req.body);
    console.log('[DEBUG] Recipients Preview Mongo query:', JSON.stringify(studentQuery, null, 2));

    const matchedStudents = await Student.find(studentQuery).select('_id studentId name').lean();
    const count = matchedStudents.length;

    console.log('[DEBUG] Recipients Preview Students matched:', count);
    console.log('[DEBUG] Recipients Preview Matched student IDs:', matchedStudents.map(s => s.studentId || s._id));

    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== CONFIGURATION SETTINGS ====================

const getSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({});
      await settings.save();
    }

    const data = settings.toObject();
    if (data.gmailAppPassword) data.gmailAppPassword = '••••••••••••••••';
    if (data.googleServiceAccountJson) data.googleServiceAccountJson = '••••••••••••••••';

    res.json({ success: true, settings: data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const saveSettings = async (req, res) => {
  try {
    const { gmailUser, gmailAppPassword, examPortalUrl, googleSpreadsheetId, googleServiceAccountJson } = req.body;

    let settings = await Settings.findOne();
    if (!settings) settings = new Settings({});

    if (gmailUser !== undefined) settings.gmailUser = gmailUser ? gmailUser.trim() : '';
    if (gmailAppPassword !== undefined && gmailAppPassword !== '••••••••••••••••') {
      const normalizedPass = String(gmailAppPassword).replace(/\s+/g, '');
      if (normalizedPass.length !== 16) {
        return res.status(400).json({ success: false, message: 'Invalid Gmail App Password length' });
      }
      const { encrypt } = require('../utils/crypto');
      settings.gmailAppPassword = encrypt(normalizedPass);
    }
    if (examPortalUrl !== undefined) settings.examPortalUrl = examPortalUrl ? examPortalUrl.trim() : '';
    if (googleSpreadsheetId !== undefined) settings.googleSpreadsheetId = googleSpreadsheetId;
    if (googleServiceAccountJson !== undefined && googleServiceAccountJson !== '••••••••••••••••') {
      settings.googleServiceAccountJson = googleServiceAccountJson;
    }

    await settings.save();
    await req.admin.logActivity('SAVE_SETTINGS', 'Updated system SMTP and Google Sheets configurations', req.ip);

    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const testSettings = async (req, res) => {
  try {
    const { gmailUser, gmailAppPassword, recipientEmail, googleSpreadsheetId, googleServiceAccountJson } = req.body;

    let smtpResult = { success: false, reason: 'Not tested (empty credentials)' };
    let finalPassword = gmailAppPassword;

    if (gmailAppPassword === '••••••••••••••••') {
      const dbSettings = await Settings.findOne();
      finalPassword = dbSettings ? dbSettings.gmailAppPassword : '';
    } else if (gmailAppPassword) {
      finalPassword = String(gmailAppPassword).replace(/\s+/g, '');
      if (finalPassword.length !== 16) {
        return res.json({
          success: true,
          smtp: { success: false, reason: 'Invalid Gmail App Password length' },
          sheets: { success: false, reason: 'Not tested' }
        });
      }
    }

    if (gmailUser && finalPassword) {
      smtpResult = await testSmtpConnection(gmailUser, finalPassword, recipientEmail);
    }

    let sheetsResult = { success: false, reason: 'Not tested (empty credentials)' };
    let finalSpreadsheetId = googleSpreadsheetId;
    let finalServiceAccountJson = googleServiceAccountJson;

    if (googleServiceAccountJson === '••••••••••••••••') {
      const dbSettings = await Settings.findOne();
      finalSpreadsheetId = dbSettings ? dbSettings.googleSpreadsheetId : '';
      finalServiceAccountJson = dbSettings ? dbSettings.googleServiceAccountJson : '';
    }

    if (finalSpreadsheetId && finalServiceAccountJson) {
      sheetsResult = await testSheetsConnection(finalSpreadsheetId, finalServiceAccountJson);
    }

    res.json({ success: true, smtp: smtpResult, sheets: sheetsResult });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


const getLiveMonitorData = async (req, res) => {
  try {
    const { departmentId, year, semester, section, examId } = req.query;

    const Exam = require('../models/Exam');
    let examQuery = {};
    if (examId) {
      examQuery._id = examId;
    } else {
      examQuery.status = { $in: ['active', 'scheduled', 'completed'] };
    }

    const exams = await Exam.find(examQuery).populate('department subject');
    if (examId && exams.length === 0) {
      return res.status(404).json({ success: false, message: 'Exam not found' });
    }

    const now = new Date();
    let totalStudents = 0, waiting = 0, writing = 0, submitted = 0, autoSubmitted = 0, absent = 0, disqualified = 0;
    const studentsDetails = [];

    const filteredExams = [];
    const studentQueries = [];
    const examIds = [];

    for (const exam of exams) {
      const examDeptId = exam.department?._id || exam.department;

      if (departmentId && examDeptId && examDeptId.toString() !== departmentId) continue;
      if (year && exam.year && String(exam.year).trim() !== String(year).trim()) continue;
      if (semester && exam.semester && String(exam.semester).trim() !== String(semester).trim()) continue;
      if (section && exam.section && String(exam.section).trim().toUpperCase() !== String(section).trim().toUpperCase()) continue;

      filteredExams.push(exam);
      examIds.push(exam._id);

      const singleStudentQuery = {
        isActive: true,
        department: departmentId || examDeptId,
        year: year ? String(year).trim() : (exam.year ? String(exam.year).trim() : undefined),
        semester: semester ? String(semester).trim() : (exam.semester ? String(exam.semester).trim() : undefined),
      };

      let examSection = section ? String(section).trim().toUpperCase() : (exam.section && exam.section.trim() !== '' ? exam.section.trim().toUpperCase() : undefined);
      if (examSection) {
        singleStudentQuery.section = examSection;
      }

      // Remove undefined keys
      Object.keys(singleStudentQuery).forEach(key => {
        if (singleStudentQuery[key] === undefined) delete singleStudentQuery[key];
      });

      studentQueries.push(singleStudentQuery);
    }

    let students = [];
    let results = [];

    if (filteredExams.length > 0 && studentQueries.length > 0) {
      const [allStudents, allResults] = await Promise.all([
        Student.find({ $or: studentQueries }).populate('department', 'name code').select('-password').lean(),
        Result.find({ exam: { $in: examIds } })
          .select('student exam status violations isPassed obtainedMarks totalMarks submittedAt autoSubmitReason')
          .lean()
      ]);
      students = allStudents;
      results = allResults;
    }

    for (const exam of filteredExams) {
      const examDeptId = exam.department?._id || exam.department;
      const targetDeptId = departmentId || examDeptId;
      const targetYear = year ? String(year).trim() : (exam.year ? String(exam.year).trim() : null);
      const targetSem = semester ? String(semester).trim() : (exam.semester ? String(exam.semester).trim() : null);
      const targetSec = section ? String(section).trim().toUpperCase() : (exam.section && exam.section.trim() !== '' ? exam.section.trim().toUpperCase() : null);

      const examStudents = students.filter(student => {
        const studentDeptId = student.department?._id || student.department;
        if (targetDeptId && studentDeptId?.toString() !== targetDeptId.toString()) return false;
        if (targetYear && String(student.year).trim() !== targetYear) return false;
        if (targetSem && String(student.semester).trim() !== targetSem) return false;
        if (targetSec && String(student.section || '').trim().toUpperCase() !== targetSec) return false;
        return true;
      });

      const resultMap = {};
      results.forEach(r => {
        if (r.exam.toString() === exam._id.toString()) {
          resultMap[r.student.toString()] = r;
        }
      });

      const startTime = new Date(exam.startTime);
      const endTime = new Date(exam.endTime);

      examStudents.forEach(student => {
        const result = resultMap[student._id.toString()];
        let status = 'Not Started';

        if (!result) {
          if (now < startTime) status = 'Waiting';
          else if (now > endTime) status = 'Absent';
          else status = 'Waiting';
        } else {
          if (result.violations >= (exam.maxViolations || 3)) status = 'Disqualified';
          else if (result.status === 'in_progress') status = 'Currently Writing Exam';
          else if (result.status === 'auto_submitted') status = 'Auto Submitted';
          else if (result.status === 'submitted' || result.status === 'force_submitted') status = 'Submitted';
        }

        totalStudents++;
        if (status === 'Waiting') waiting++;
        else if (status === 'Currently Writing Exam') writing++;
        else if (status === 'Submitted') submitted++;
        else if (status === 'Auto Submitted') autoSubmitted++;
        else if (status === 'Absent') absent++;
        else if (status === 'Disqualified') disqualified++;

        studentsDetails.push({
          studentId: student.studentId,
          name: student.name,
          rollNumber: student.rollNumber,
          department: student.department?.code || 'N/A',
          classDetails: `Y${student.year}/S${student.semester}/Sec ${student.section || '—'}`,
          status,
          violations: result ? result.violations : 0,
          autoSubmitReason: result?.autoSubmitReason || '',
          examTitle: exam.title,
          isOnline: student.isLoggedIn
        });
      });
    }

    res.json({
      success: true,
      stats: {
        totalStudents,
        waiting,
        writing,
        submitted,
        autoSubmitted,
        absent,
        disqualified
      },
      students: studentsDetails
    });
  } catch (error) {
    console.error('LIVE MONITOR ERROR:', error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getAllAdmins, createAdmin, updateAdmin, deleteAdmin, toggleAdminStatus,
  resetAdminPassword, getAdminActivityLogs,
  getEmailLogs,
  importStudentsCSV,
  sendManualReminders,
  getSettings, saveSettings, testSettings,
  retrySingleEmail, retryAllFailedEmails,
  exportFailedEmailLogs,
  previewRecipientCount,
  getLiveMonitorData,
  getEmailQueueProgress
};
