const mongoose = require('mongoose');

const normalizeSection = (value) => {
  // Convert "Section B" or "Sec B" or "B" to "B"
  return String(value || '')
    .trim()
    .replace(/sec(tion)?\s*/i, '')
    .toUpperCase();
};

const normalizeYear = (value) => {
  // Convert "Year 4" or "4th Year" or "4" to "4"
  return String(value || '')
    .trim()
    .replace(/[^0-9]/g, '');
};

const normalizeSemester = (value) => {
  // Convert "Semester 1" or "Sem 1" or "1" to "1"
  return String(value || '')
    .trim()
    .replace(/[^0-9]/g, '');
};

const resolveDepartmentId = async (dept) => {
  if (!dept) return null;
  if (typeof dept === 'object' && dept._id) {
    return dept._id;
  }
  const trimmed = String(dept).trim();
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    return new mongoose.Types.ObjectId(trimmed);
  }
  const Department = require('../models/Department');
  const doc = await Department.findOne({
    $or: [
      { code: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
      { name: { $regex: new RegExp(`^${trimmed}$`, 'i') } }
    ]
  }).lean();
  return doc ? doc._id : null;
};

/**
 * Builds a unified MongoDB query to match eligible students for an exam.
 * 
 * Supports both automatic publication notifications (options.target === 'all')
 * and manual notifications/reminders with various targets/filters.
 */
const buildStudentEligibilityQuery = async (exam, options = {}) => {
  const query = { isActive: true };

  if (!exam) return query;

  const examDeptId = exam.department?._id || exam.department;

  const target = options.target || 'all';
  const targetValue = options.targetValue;

  // 1. Handle individual student target
  if (target === 'student') {
    if (targetValue) {
      if (mongoose.Types.ObjectId.isValid(targetValue)) {
        query._id = new mongoose.Types.ObjectId(targetValue);
      } else {
        query.studentId = String(targetValue).trim().toUpperCase();
      }
    }
    return query;
  }

  // 2. Default academic criteria from exam
  let deptId = await resolveDepartmentId(examDeptId);
  let year = normalizeYear(exam.year);
  let semester = normalizeSemester(exam.semester);
  
  // Parse exam sections (either array or string)
  const examSections = Array.isArray(exam.sections) && exam.sections.length > 0
    ? exam.sections.map(s => normalizeSection(s))
    : (exam.section ? [normalizeSection(exam.section)] : []);

  // 3. Handle filters vs. standard target types
  if (target === 'filter') {
    if (options.departmentId || options.department) {
      deptId = await resolveDepartmentId(options.departmentId || options.department);
    }
    if (options.year !== undefined && options.year !== null && String(options.year).trim() !== '') {
      year = normalizeYear(options.year);
    }
    if (options.semester !== undefined && options.semester !== null && String(options.semester).trim() !== '') {
      semester = normalizeSemester(options.semester);
    }
    if (options.section !== undefined && options.section !== null && String(options.section).trim() !== '') {
      const sec = normalizeSection(options.section);
      if (sec && sec !== 'ALL') {
        query.section = sec;
      }
    }
  } else {
    // For standard target types, default department is set
    if (deptId) query.department = deptId;

    switch (target) {
      case 'all':
        if (year) query.year = year;
        if (semester) query.semester = semester;
        
        // Match the exam's sections
        const activeSections = examSections.filter(s => s !== '' && s !== 'ALL' && s !== 'ALL SECTIONS');
        if (activeSections.length > 0) {
          query.section = { $in: activeSections };
        }
        break;

      case 'department':
        // No additional year/semester/section filters
        break;

      case 'year':
        const yVal = targetValue || year;
        if (yVal) query.year = normalizeYear(yVal);
        break;

      case 'semester':
        if (year) query.year = year;
        const sVal = targetValue || semester;
        if (sVal) query.semester = normalizeSemester(sVal);
        break;

      case 'section':
        if (year) query.year = year;
        if (semester) query.semester = semester;
        const secVal = targetValue || (examSections.length > 0 ? examSections[0] : exam.section);
        if (secVal) {
          const sec = normalizeSection(secVal);
          if (sec && sec !== 'ALL') {
            query.section = sec;
          }
        }
        break;

      default:
        break;
    }
  }

  // 4. Force canonical normalization onto the final query object
  if (!deptId || !year || !semester) {
    return { _id: null };
  }
  if (deptId) query.department = deptId;
  if (year) query.year = year;
  if (semester) query.semester = semester;

  return query;
};

module.exports = {
  buildStudentEligibilityQuery,
  normalizeSection,
  normalizeYear,
  normalizeSemester,
  resolveDepartmentId
};
