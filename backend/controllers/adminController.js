const Student = require('../models/Student');
const Admin = require('../models/Admin');
const Department = require('../models/Department');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const bcrypt = require('bcryptjs');
const { generateStudentId, generatePassword } = require('../utils/generateId');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// ==================== STUDENTS ====================

const getAllStudents = async (req, res) => {
  try {
    const { department, year, semester, section, status, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (department) query.department = department;
    if (year) query.year = year;
    if (semester) query.semester = semester;
    if (section) query.section = section.trim().toUpperCase();
    if (status !== undefined && status !== '') {
      query.isActive = status === 'active' || status === 'true';
    }
    if (search) {
      const cleanSearch = search.trim();
      query.$or = [
        { name: { $regex: cleanSearch, $options: 'i' } },
        { studentId: { $regex: cleanSearch, $options: 'i' } },
        { rollNumber: { $regex: cleanSearch, $options: 'i' } },
        { email: { $regex: cleanSearch, $options: 'i' } },
        { mobile: { $regex: cleanSearch, $options: 'i' } },
      ];
    }

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .populate('department', 'name code')
      .select('-password -auditLog')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    res.json({ success: true, students, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getActiveStudents = async (req, res) => {
  try {
    const students = await Student.find({ isLoggedIn: true })
      .populate('department', 'name code')
      .populate('currentExam', 'title subject')
      .select('-password')
      .lean();
    res.json({ success: true, students, count: students.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const generateStudentCredentials = async (req, res) => {
  try {
    const { studentId: id } = req.params;
    const student = await Student.findById(id).populate('department', 'code');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const plainPassword = generatePassword(8);
    student.password = plainPassword;
    student.isPasswordChanged = false; // Force password change on next login
    await student.save();

    console.log(`🔐 [Credentials Reset] Student ${student.studentId} credentials regenerated. isPasswordChanged set to false.`);

    res.json({ 
      success: true, 
      message: 'Credentials reset successfully',
      studentId: student.studentId,
      password: plainPassword,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const toggleStudentStatus = async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    student.isActive = !student.isActive;
    await student.save();
    res.json({ success: true, message: `Student ${student.isActive ? 'activated' : 'deactivated'}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const forceLogoutStudent = async (req, res) => {
  try {
    await Student.findByIdAndUpdate(req.params.studentId, { isLoggedIn: false, currentExam: null });
    res.json({ success: true, message: 'Student force logged out' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== DEPARTMENTS ====================

const getDepartments = async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const existing = await Department.findOne({ $or: [{ name }, { code: code.toUpperCase() }] });
    if (existing) return res.status(400).json({ success: false, message: 'Department already exists' });
    const dept = new Department({ name, code, description });
    await dept.save();
    res.status(201).json({ success: true, message: 'Department created', department: dept });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const dept = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!dept) return res.status(404).json({ success: false, message: 'Department not found' });
    res.json({ success: true, department: dept });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    await Department.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Department deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== SUBJECTS ====================

const getSubjects = async (req, res) => {
  try {
    const { department, semester } = req.query;
    const query = { isActive: true };
    if (department) query.department = department;
    if (semester) query.semester = semester;
    const subjects = await Subject.find(query).populate('department', 'name code').sort({ name: 1 });
    res.json({ success: true, subjects });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createSubject = async (req, res) => {
  try {
    const { name, code, department, semester, year, description } = req.body;
    const existing = await Subject.findOne({ code: code.toUpperCase() });
    if (existing) return res.status(400).json({ success: false, message: 'Subject code already exists' });
    const subject = new Subject({ name, code, department, semester, year, description });
    await subject.save();
    const populated = await subject.populate('department', 'name code');
    res.status(201).json({ success: true, message: 'Subject created', subject: populated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateSubject = async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('department', 'name code');
    if (!subject) return res.status(404).json({ success: false, message: 'Subject not found' });
    res.json({ success: true, subject });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteSubject = async (req, res) => {
  try {
    await Subject.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Subject deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== ANALYTICS ====================

const getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart.getTime() + 86400000);
    const EmailLog = require('../models/EmailLog');

    const [
      totalStudents,
      activeStudents,
      onlineStudents,
      totalExams,
      runningExams,
      upcomingExams,
      completedExams,
      publishedResults,
      departmentsCount,
      subjectsCount,
      todayExams,
      emailSent,
      emailFailed,
    ] = await Promise.all([
      Student.countDocuments(),
      Student.countDocuments({ isActive: true }),
      Student.countDocuments({ isLoggedIn: true }),
      Exam.countDocuments(),
      Exam.countDocuments({ status: 'active' }),
      Exam.countDocuments({ status: 'scheduled' }),
      Exam.countDocuments({ status: 'completed' }),
      Result.countDocuments({ status: { $ne: 'in_progress' } }),
      Department.countDocuments({ isActive: true }),
      Subject.countDocuments({ isActive: true }),
      Exam.countDocuments({ startTime: { $gte: todayStart, $lt: todayEnd } }),
      EmailLog.countDocuments({ status: 'sent' }),
      EmailLog.countDocuments({ status: 'failed' }),
    ]);

    const completedResults = await Result.find({ status: { $ne: 'in_progress' } });
    const totalObtained = completedResults.reduce((sum, r) => sum + r.obtainedMarks, 0);
    const totalPossible = completedResults.reduce((sum, r) => sum + r.totalMarks, 0);
    const avgPercentage = completedResults.length > 0
      ? (totalObtained / totalPossible * 100).toFixed(2)
      : 0;
    const passCount = completedResults.filter(r => r.isPassed).length;
    const passPercentage = completedResults.length > 0
      ? ((passCount / completedResults.length) * 100).toFixed(2)
      : 0;

    const marks = completedResults.map(r => r.obtainedMarks);
    const highestMarks = marks.length > 0 ? Math.max(...marks) : 0;
    const lowestMarks  = marks.length > 0 ? Math.min(...marks) : 0;

    // Exam-wise results for chart
    const examStats = await Result.aggregate([
      { $match: { status: { $ne: 'in_progress' } } },
      { $group: {
        _id: '$exam',
        avgMarks: { $avg: '$obtainedMarks' },
        count: { $sum: 1 },
        passCount: { $sum: { $cond: ['$isPassed', 1, 0] } },
      }},
      { $lookup: { from: 'exams', localField: '_id', foreignField: '_id', as: 'examInfo' } },
      { $unwind: '$examInfo' },
      { $project: { title: '$examInfo.title', avgMarks: 1, count: 1, passCount: 1 } },
      { $limit: 10 },
    ]);

    // Monthly registration data
    const monthlyRegistrations = await Student.aggregate([
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 6 },
    ]);

    // Recent activity: last 8 exam results submitted
    const recentActivity = await Result.find({ status: { $ne: 'in_progress' } })
      .sort({ updatedAt: -1 })
      .limit(8)
      .populate('student', 'name studentId')
      .populate('exam', 'title')
      .select('student exam obtainedMarks totalMarks isPassed submittedAt status');

    res.json({
      success: true,
      stats: {
        totalStudents,
        activeStudents,
        onlineStudents,
        totalExams,
        runningExams,
        upcomingExams,
        completedExams,
        publishedResults,
        departmentsCount,
        subjectsCount,
        avgPercentage,
        passPercentage,
        highestMarks,
        lowestMarks,
        todayExams,
        emailSent,
        emailFailed,
      },
      examStats,
      monthlyRegistrations: monthlyRegistrations.reverse(),
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ==================== EXPORT ====================

const exportStudentsExcel = async (req, res) => {
  try {
    const students = await Student.find()
      .populate('department', 'name code')
      .select('-password')
      .sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Mobile', key: 'mobile', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Registered', key: 'createdAt', width: 20 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    students.forEach(s => {
      sheet.addRow({
        studentId: s.studentId,
        name: s.name,
        rollNumber: s.rollNumber,
        department: s.department?.name || '',
        year: s.year,
        semester: s.semester,
        email: s.email,
        mobile: s.mobile,
        status: s.isActive ? 'Active' : 'Inactive',
        createdAt: new Date(s.createdAt).toLocaleDateString(),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=students.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const downloadCSVTemplate = async (req, res) => {
  try {
    const csvContent = 'Name,Email,Roll Number,Phone Number,Department,Year,Semester,Section\n';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.csv');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== UPDATE STUDENT PROFILE (Admin only) ====================

const updateStudentProfile = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId).populate('department', 'name code');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const allowedFields = ['name', 'department', 'year', 'semester', 'section', 'rollNumber', 'email', 'mobile', 'isActive'];
    const adminName = req.admin?.name || 'Admin';
    const adminRole = req.admin?.role || 'admin';
    const changes = [];

    for (const field of allowedFields) {
      if (req.body[field] === undefined) continue;
      let newVal = req.body[field];
      let oldVal;

      if (field === 'name') {
        newVal = String(newVal).trim();
        oldVal = student[field];
        if (oldVal !== newVal) {
          changes.push({ field: 'Name', oldValue: oldVal || '—', newValue: newVal, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
        }
      } else if (field === 'department') {
        oldVal = student.department?._id?.toString() || student.department?.toString();
        // Resolve department name for audit
        const dept = await Department.findById(newVal);
        const oldDept = await Department.findById(oldVal);
        if (oldVal !== newVal) {
          changes.push({ field: 'Department', oldValue: oldDept?.code || oldVal || '—', newValue: dept?.code || newVal, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
        }
      } else if (field === 'section') {
        newVal = String(newVal).replace(/\s+/g, '').toUpperCase();
        oldVal = student[field];
        if (oldVal !== newVal) {
          changes.push({ field: 'Section', oldValue: oldVal || '—', newValue: newVal, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
        }
      } else if (field === 'email') {
        newVal = String(newVal).toLowerCase().trim();
        oldVal = student[field];
        // Check duplicate email
        if (oldVal !== newVal) {
          const existing = await Student.findOne({ email: newVal, _id: { $ne: student._id } });
          if (existing) return res.status(400).json({ success: false, message: 'Email already in use by another student' });
          changes.push({ field: 'Email', oldValue: oldVal || '—', newValue: newVal, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
        }
      } else {
        oldVal = student[field] !== undefined ? String(student[field]) : '—';
        const newValStr = String(newVal);
        if (oldVal !== newValStr) {
          const labelMap = { year: 'Year', semester: 'Semester', rollNumber: 'Roll Number', mobile: 'Mobile', isActive: 'Status' };
          const label = labelMap[field] || field;
          const displayOld = field === 'isActive' ? (student[field] ? 'Active' : 'Inactive') : oldVal;
          const displayNew = field === 'isActive' ? (newVal ? 'Active' : 'Inactive') : newValStr;
          changes.push({ field: label, oldValue: displayOld, newValue: displayNew, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
        }
      }

      student[field] = newVal;
    }

    if (changes.length === 0) {
      return res.json({ success: true, message: 'No changes detected', student });
    }

    // Append to audit log (keep last 200)
    student.auditLog.push(...changes);
    if (student.auditLog.length > 200) {
      student.auditLog = student.auditLog.slice(student.auditLog.length - 200);
    }

    await student.save();

    const changeDesc = changes.map(c => `${c.field}: ${c.oldValue} → ${c.newValue}`).join(', ');
    await req.admin.logActivity('UPDATE_STUDENT', `Updated student ${student.studentId}: ${changeDesc}`, req.ip);

    const updated = await Student.findById(student._id).populate('department', 'name code').select('-password');
    res.json({ success: true, message: `Student updated successfully (${changes.length} change${changes.length > 1 ? 's' : ''})`, student: updated, changes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== BULK UPDATE STUDENTS (Admin only) ====================

const bulkUpdateStudents = async (req, res) => {
  try {
    const { studentIds, action, value } = req.body;
    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'studentIds array is required' });
    }
    if (!action) return res.status(400).json({ success: false, message: 'action is required' });

    const validActions = ['department', 'year', 'semester', 'section', 'activate', 'deactivate', 'promoteYear'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ success: false, message: `Invalid action. Use: ${validActions.join(', ')}` });
    }

    const adminName = req.admin?.name || 'Admin';
    const adminRole = req.admin?.role || 'admin';
    const students = await Student.find({ _id: { $in: studentIds } });
    let updatedCount = 0;

    for (const student of students) {
      const changes = [];

      if (action === 'activate' || action === 'deactivate') {
        const newStatus = action === 'activate';
        if (student.isActive !== newStatus) {
          changes.push({ field: 'Status', oldValue: student.isActive ? 'Active' : 'Inactive', newValue: newStatus ? 'Active' : 'Inactive', changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
          student.isActive = newStatus;
        }
      } else if (action === 'promoteYear') {
        const currentYear = parseInt(student.year);
        if (currentYear < 4) {
          const newYear = String(currentYear + 1);
          changes.push({ field: 'Year', oldValue: student.year, newValue: newYear, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
          student.year = newYear;
        }
      } else if (action === 'section') {
        const newSection = String(value || '').replace(/\s+/g, '').toUpperCase();
        if (student.section !== newSection) {
          changes.push({ field: 'Section', oldValue: student.section || '—', newValue: newSection, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
          student.section = newSection;
        }
      } else {
        const oldVal = String(student[action] || '—');
        const newVal = String(value || '');
        if (oldVal !== newVal) {
          const labelMap = { department: 'Department', year: 'Year', semester: 'Semester' };
          changes.push({ field: labelMap[action] || action, oldValue: oldVal, newValue: newVal, changedBy: adminName, changedByRole: adminRole, changedAt: new Date() });
          student[action] = value;
        }
      }

      if (changes.length > 0) {
        student.auditLog.push(...changes);
        if (student.auditLog.length > 200) student.auditLog = student.auditLog.slice(student.auditLog.length - 200);
        await student.save();
        updatedCount++;
      }
    }

    await req.admin.logActivity('BULK_UPDATE_STUDENTS', `Bulk ${action} on ${updatedCount}/${studentIds.length} students`, req.ip);
    res.json({ success: true, message: `${updatedCount} student(s) updated`, updatedCount, total: studentIds.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== STUDENT AUDIT LOG ====================

const getStudentAuditLog = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId).select('studentId name auditLog');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });
    const log = [...(student.auditLog || [])].reverse();
    res.json({ success: true, student: { studentId: student.studentId, name: student.name }, log });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXPORT SELECTED STUDENTS ====================

const exportSelectedStudents = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const query = studentIds && studentIds.length > 0 ? { _id: { $in: studentIds } } : {};
    const students = await Student.find(query).populate('department', 'name code').select('-password -auditLog').sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Name', key: 'name', width: 28 },
      { header: 'Roll Number', key: 'rollNumber', width: 18 },
      { header: 'Department', key: 'department', width: 25 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Email', key: 'email', width: 32 },
      { header: 'Mobile', key: 'mobile', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Registered', key: 'createdAt', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    students.forEach(s => sheet.addRow({
      studentId: s.studentId, name: s.name, rollNumber: s.rollNumber,
      department: s.department?.name || '', year: s.year, semester: s.semester,
      section: s.section || '', email: s.email, mobile: s.mobile,
      status: s.isActive ? 'Active' : 'Inactive',
      createdAt: new Date(s.createdAt).toLocaleDateString(),
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=selected_students.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createStudent = async (req, res) => {
  try {
    const { name, email, rollNumber, mobile, department, year, semester, section } = req.body;

    if (!name || !email || !rollNumber || !mobile || !department || !year || !semester || !section) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.toLowerCase().trim();
    const cleanRoll = rollNumber.trim();
    const cleanMobile = mobile.trim();
    const cleanSection = section.trim().toUpperCase();
    const cleanYear = String(year).trim();
    const cleanSemester = String(semester).trim();

    const existingEmail = await Student.findOne({ email: cleanEmail });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email address is already registered' });
    }

    const existingRoll = await Student.findOne({ rollNumber: cleanRoll });
    if (existingRoll) {
      return res.status(400).json({ success: false, message: 'Roll number is already registered' });
    }

    const dept = await Department.findById(department);
    if (!dept || !dept.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive department' });
    }

    if (!['1', '2', '3', '4'].includes(cleanYear)) {
      return res.status(400).json({ success: false, message: 'Invalid year. Must be between 1 and 4' });
    }
    if (!['1', '2'].includes(cleanSemester)) {
      return res.status(400).json({ success: false, message: 'Invalid semester. Must be 1 or 2' });
    }
    if (!cleanSection) {
      return res.status(400).json({ success: false, message: 'Section is required' });
    }

    const plainPassword = generatePassword(8);

    let studentId;
    let isUnique = false;
    while (!isUnique) {
      studentId = generateStudentId(dept.code, cleanYear);
      const existingId = await Student.findOne({ studentId });
      if (!existingId) {
        isUnique = true;
      }
    }

    const student = new Student({
      studentId,
      name: cleanName,
      email: cleanEmail,
      rollNumber: cleanRoll,
      mobile: cleanMobile,
      department: dept._id,
      year: cleanYear,
      semester: cleanSemester,
      section: cleanSection,
      password: plainPassword,
      isPasswordChanged: false,
      isActive: true
    });

    const adminName = req.admin?.name || 'Admin';
    const adminRole = req.admin?.role || 'admin';
    student.auditLog.push({
      field: 'All',
      oldValue: '—',
      newValue: 'Account created manually by Admin',
      changedBy: adminName,
      changedByRole: adminRole,
      changedAt: new Date()
    });

    await student.save();

    let emailSent = false;
    let emailError = '';
    try {
      const { sendWelcomeEmail } = require('../utils/emailService');
      const mailRes = await sendWelcomeEmail({
        ...student.toJSON(),
        password: plainPassword,
        department: dept
      });
      if (mailRes.success) {
        emailSent = true;
        student.welcomeEmailSent = true;
        student.welcomeEmailSentAt = new Date();
        await student.save();
      } else {
        emailError = mailRes.error || mailRes.reason || 'Failed to dispatch email';
      }
    } catch (mailErr) {
      emailError = mailErr.message;
      console.error('[ManualRegistration] Welcome email sending error:', mailErr);
    }

    if (req.admin) {
      await req.admin.logActivity('CREATE_STUDENT', `Manually registered student ${student.studentId} (${student.name})`, req.ip);
    }

    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Student registered successfully and welcome email sent.'
        : `Student registered successfully, but welcome email failed (${emailError}).`,
      student,
      plainPassword
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found' });

    const attempts = await Result.countDocuments({ student: studentId });
    if (attempts > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete student because they have attempted one or more exams'
      });
    }

    await Student.findByIdAndDelete(studentId);

    if (req.admin) {
      await req.admin.logActivity('DELETE_STUDENT', `Deleted student ${student.studentId} (${student.name})`, req.ip);
    }

    res.json({ success: true, message: 'Student deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAllStudents, getActiveStudents, generateStudentCredentials, toggleStudentStatus,
  forceLogoutStudent, getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getSubjects, createSubject, updateSubject, deleteSubject,
  getDashboardStats, exportStudentsExcel, downloadCSVTemplate,
  updateStudentProfile, bulkUpdateStudents, getStudentAuditLog, exportSelectedStudents,
  createStudent, deleteStudent
};

