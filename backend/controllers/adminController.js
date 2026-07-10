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
    const { department, year, semester, search, page = 1, limit = 20 } = req.query;
    const query = {};
    if (department) query.department = department;
    if (year) query.year = year;
    if (semester) query.semester = semester;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { rollNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .populate('department', 'name code')
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

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
      .select('-password');
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

module.exports = {
  getAllStudents, getActiveStudents, generateStudentCredentials, toggleStudentStatus,
  forceLogoutStudent, getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getSubjects, createSubject, updateSubject, deleteSubject,
  getDashboardStats, exportStudentsExcel, downloadCSVTemplate
};

