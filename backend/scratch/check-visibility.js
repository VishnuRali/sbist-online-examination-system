require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const m = require('mongoose');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
require('../models/Department'); // needed for population


m.connect(process.env.MONGODB_URI).then(async () => {
  const now = new Date();

  const normalizeString = v => String(v || '').trim().toLowerCase();
  const normalizeNum = v => String(v || '').replace(/[^0-9]/g, '').trim();
  const normalizeSection = v => String(v || '').trim().replace(/section\s*/i, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const getAcronym = v => String(v || '').trim().split(/\s+/).map(w => w[0] || '').join('').toUpperCase();

  const rawStudent = await Student.findOne({ studentId: 'SBIST20260001' }).populate('department', 'name code');
  if (!rawStudent) { console.error('Student not found'); process.exit(1); }

  const student = {
    year: normalizeNum(rawStudent.year),
    semester: normalizeNum(rawStudent.semester),
    section: normalizeSection(rawStudent.section),
    departmentId: rawStudent.department?._id?.toString(),
    departmentCode: normalizeString(rawStudent.department?.code),
    departmentName: normalizeString(rawStudent.department?.name),
    departmentAcronym: getAcronym(rawStudent.department?.name),
  };
  console.log('Student normalized:', student);

  const allExams = await Exam.find({ status: { $in: ['scheduled', 'active'] } }).populate('department', 'name code');
  console.log('Total scheduled/active exams:', allExams.length);

  allExams.forEach(exam => {
    const examDeptId = exam.department?._id?.toString();
    const examDeptCode = normalizeString(exam.department?.code);
    const examDeptName = normalizeString(exam.department?.name);
    const examYear = normalizeNum(exam.year);
    const examSem = normalizeNum(exam.semester);
    const examSec = normalizeSection(exam.section);
    const examStart = new Date(exam.startTime);
    const examEnd = new Date(exam.endTime);

    const reasons = [];
    const deptOk = student.departmentId === examDeptId ||
      (student.departmentCode && examDeptCode && student.departmentCode === examDeptCode) ||
      (student.departmentName && examDeptName && student.departmentName === examDeptName);
    if (!deptOk) reasons.push('dept: student=' + student.departmentCode + ' exam=' + examDeptCode);
    if (examYear !== student.year) reasons.push('year: ' + examYear + ' vs ' + student.year);
    if (examSem !== student.semester) reasons.push('sem: ' + examSem + ' vs ' + student.semester);
    const secOk = examSec === '' || (student.section !== '' && examSec === student.section);
    if (!secOk) reasons.push('section: exam=' + (examSec || 'All') + ' student=' + (student.section || 'None'));
    if (now < examStart) reasons.push('not started yet');
    if (now > examEnd) reasons.push('expired');

    console.log(exam.title, '->', reasons.length === 0 ? 'VISIBLE' : 'HIDDEN (' + reasons.join(', ') + ')');
  });

  await m.disconnect();
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });
