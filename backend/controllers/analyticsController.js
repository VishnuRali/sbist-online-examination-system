const mongoose = require('mongoose');
const Result = require('../models/Result');
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const Subject = require('../models/Subject');
const Department = require('../models/Department');
const ExcelJS = require('exceljs');
const { calculateGrade } = require('../utils/resultEvaluator');

// In-memory cache for student performance summaries to prevent DB overload (30 seconds TTL)
const cache = new Map();
const CACHE_TTL = 30000; // 30 seconds

const getCacheKey = (query) => {
  return JSON.stringify(query);
};

const getFromCache = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

const setToCache = (key, data) => {
  if (cache.size >= 100) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp >= CACHE_TTL) {
        cache.delete(k);
      }
    }
  }
  if (cache.size >= 100) {
    cache.clear();
  }
  cache.set(key, { data, timestamp: Date.now() });
};

// Trend evaluation helper
const calculateTrend = (percentages) => {
  if (!percentages || percentages.length <= 1) return 'Insufficient Data';
  const latest = percentages[percentages.length - 1];
  const previous = percentages.slice(0, percentages.length - 1);
  const prevAvg = previous.reduce((a, b) => a + b, 0) / previous.length;
  const diff = latest - prevAvg;
  if (diff > 2) return 'Improving';
  if (diff < -2) return 'Declining';
  return 'Stable';
};

// ==================== GET PERFORMANCE SUMMARY & CHARTS ====================
const getStudentPerformanceSummary = async (req, res) => {
  try {
    const { examId, departmentId, year, semester, section, subjectId } = req.query;

    const cleanExamId = examId && mongoose.Types.ObjectId.isValid(examId) ? String(examId) : undefined;
    const cleanDeptId = departmentId && mongoose.Types.ObjectId.isValid(departmentId) ? String(departmentId) : undefined;
    const cleanSubjectId = subjectId && mongoose.Types.ObjectId.isValid(subjectId) ? String(subjectId) : undefined;
    const cleanYear = year ? String(year) : undefined;
    const cleanSemester = semester ? String(semester) : undefined;
    const cleanSection = section ? String(section).trim().toUpperCase() : undefined;

    const cacheKey = getCacheKey({
      examId: cleanExamId,
      departmentId: cleanDeptId,
      year: cleanYear,
      semester: cleanSemester,
      section: cleanSection,
      subjectId: cleanSubjectId
    });
    const cachedData = getFromCache(cacheKey);

    if (cachedData) {
      return res.json({ success: true, ...cachedData, cached: true });
    }

    // 1. Calculate Total Assigned / Eligible Students
    let totalAssigned = 0;
    if (cleanExamId) {
      const targetExam = await Exam.findById(cleanExamId).lean();
      if (targetExam) {
        const { buildStudentEligibilityQuery } = require('../utils/studentEligibility');
        const studentQuery = await buildStudentEligibilityQuery(targetExam, {
          target: 'filter',
          departmentId: cleanDeptId,
          year: cleanYear,
          semester: cleanSemester,
          section: cleanSection
        });
        totalAssigned = await Student.countDocuments(studentQuery);
      }
    } else {
      const query = { isActive: true };
      if (cleanDeptId) {
        query.department = new mongoose.Types.ObjectId(cleanDeptId);
      }
      if (cleanYear) query.year = cleanYear;
      if (cleanSemester) query.semester = cleanSemester;
      if (cleanSection) query.section = cleanSection;
      totalAssigned = await Student.countDocuments(query);
    }

    // 2. Build Result Aggregation Pipeline
    const matchConditions = {};

    const pipeline = [
      {
        $lookup: {
          from: 'students',
          localField: 'student',
          foreignField: '_id',
          as: 'studentDoc'
        }
      },
      { $unwind: '$studentDoc' },
      {
        $lookup: {
          from: 'exams',
          localField: 'exam',
          foreignField: '_id',
          as: 'examDoc'
        }
      },
      { $unwind: '$examDoc' }
    ];

    if (cleanExamId) {
      matchConditions.exam = new mongoose.Types.ObjectId(cleanExamId);
    }
    if (cleanDeptId) {
      matchConditions['studentDoc.department'] = new mongoose.Types.ObjectId(cleanDeptId);
    }
    if (cleanYear) {
      matchConditions['studentDoc.year'] = cleanYear;
    }
    if (cleanSemester) {
      matchConditions['studentDoc.semester'] = cleanSemester;
    }
    if (cleanSection) {
      matchConditions['studentDoc.section'] = cleanSection;
    }
    if (cleanSubjectId) {
      matchConditions['examDoc.subject'] = new mongoose.Types.ObjectId(cleanSubjectId);
    }

    if (Object.keys(matchConditions).length > 0) {
      pipeline.push({ $match: matchConditions });
    }

    pipeline.push({
      $facet: {
        stats: [
          {
            $group: {
              _id: null,
              totalAttended: { $sum: 1 },
              totalSubmitted: {
                $sum: { $cond: [ { $ne: ['$status', 'in_progress'] }, 1, 0 ] }
              },
              totalPassed: {
                $sum: { $cond: [ { $and: [ { $ne: ['$status', 'in_progress'] }, { $eq: ['$isPassed', true] } ] }, 1, 0 ] }
              },
              totalFailed: {
                $sum: { $cond: [ { $and: [ { $ne: ['$status', 'in_progress'] }, { $eq: ['$isPassed', false] } ] }, 1, 0 ] }
              },
              avgMarks: {
                $avg: { $cond: [ { $ne: ['$status', 'in_progress'] }, '$obtainedMarks', null ] }
              },
              maxMarks: {
                $max: { $cond: [ { $ne: ['$status', 'in_progress'] }, '$obtainedMarks', null ] }
              },
              minMarks: {
                $min: { $cond: [ { $ne: ['$status', 'in_progress'] }, '$obtainedMarks', null ] }
              }
            }
          }
        ],
        marksDistribution: [
          { $match: { status: { $ne: 'in_progress' } } },
          {
            $bucket: {
              groupBy: '$percentage',
              boundaries: [0, 40, 50, 60, 70, 80, 90, 101],
              default: 'Other',
              output: {
                count: { $sum: 1 }
              }
            }
          }
        ],
        passFailDistribution: [
          { $match: { status: { $ne: 'in_progress' } } },
          {
            $group: {
              _id: '$isPassed',
              count: { $sum: 1 }
            }
          }
        ],
        trends: [
          { $match: { status: { $ne: 'in_progress' } } },
          {
            $group: {
              _id: { examId: '$examDoc._id', title: '$examDoc.title', startTime: '$examDoc.startTime' },
              avgMarks: { $avg: '$obtainedMarks' },
              avgPercentage: { $avg: '$percentage' },
              passedCount: { $sum: { $cond: [ { $eq: ['$isPassed', true] }, 1, 0 ] } },
              totalCount: { $sum: 1 }
            }
          },
          { $sort: { '_id.startTime': 1 } }
        ]
      }
    });

    const aggregationResult = await Result.aggregate(pipeline);
    const facetData = aggregationResult[0] || { stats: [], marksDistribution: [], passFailDistribution: [], trends: [] };

    const stats = facetData.stats[0] || {
      totalAttended: 0,
      totalSubmitted: 0,
      totalPassed: 0,
      totalFailed: 0,
      avgMarks: 0,
      maxMarks: 0,
      minMarks: 0
    };

    const payload = {
      summary: {
        totalAssigned,
        totalAttended: stats.totalAttended,
        totalSubmitted: stats.totalSubmitted,
        totalPassed: stats.totalPassed,
        totalFailed: stats.totalFailed,
        passPercentage: stats.totalSubmitted > 0 ? (stats.totalPassed / stats.totalSubmitted) * 100 : 0,
        avgMarks: stats.avgMarks || 0,
        maxMarks: stats.maxMarks || 0,
        minMarks: stats.minMarks || 0
      },
      charts: {
        marksDistribution: facetData.marksDistribution,
        passFailDistribution: facetData.passFailDistribution,
        trends: facetData.trends
      }
    };

    setToCache(cacheKey, payload);
    res.json({ success: true, ...payload });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET PERFORMANCE TABLE ====================
const getStudentPerformanceTable = async (req, res) => {
  try {
    const { examId, departmentId, year, semester, section, subjectId, search, page = 1, limit = 20, sortBy = 'obtainedMarks', sortOrder = 'desc' } = req.query;

    const cleanExamId = examId && mongoose.Types.ObjectId.isValid(examId) ? String(examId) : undefined;
    const cleanDeptId = departmentId && mongoose.Types.ObjectId.isValid(departmentId) ? String(departmentId) : undefined;
    const cleanSubjectId = subjectId && mongoose.Types.ObjectId.isValid(subjectId) ? String(subjectId) : undefined;
    const cleanYear = year ? String(year) : undefined;
    const cleanSemester = semester ? String(semester) : undefined;
    const cleanSection = section ? String(section).trim().toUpperCase() : undefined;
    const cleanSearch = search ? String(search).trim().toLowerCase() : undefined;

    // Validate page & limit inputs
    let limitNum = parseInt(limit, 10);
    let pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
    if (limitNum > 100) limitNum = 100; // clamp to max 100

    const query = { status: { $ne: 'in_progress' } };
    if (cleanExamId) {
      query.exam = cleanExamId;
    }

    // Read matching results
    let resultsQuery = Result.find(query)
      .populate({
        path: 'student',
        select: 'name studentId rollNumber department year semester section',
        populate: { path: 'department', select: 'name code' }
      })
      .populate({
        path: 'exam',
        select: 'title totalMarks passMarks subject',
        populate: { path: 'subject', select: 'name' }
      });

    let results = await resultsQuery.lean();

    // Filter in memory for student attributes and nested objects using clean params
    if (cleanDeptId) {
      results = results.filter(r => r.student?.department?._id?.toString() === cleanDeptId);
    }
    if (cleanYear) {
      results = results.filter(r => String(r.student?.year) === cleanYear);
    }
    if (cleanSemester) {
      results = results.filter(r => String(r.student?.semester) === cleanSemester);
    }
    if (cleanSection) {
      results = results.filter(r => String(r.student?.section || '').trim().toUpperCase() === cleanSection);
    }
    if (cleanSubjectId) {
      results = results.filter(r => r.exam?.subject?._id?.toString() === cleanSubjectId || r.exam?.subject?.toString() === cleanSubjectId);
    }
    if (cleanSearch) {
      results = results.filter(r => 
        r.student?.name?.toLowerCase().includes(cleanSearch) ||
        r.student?.studentId?.toLowerCase().includes(cleanSearch) ||
        r.student?.rollNumber?.toLowerCase().includes(cleanSearch)
      );
    }

    // Assign competition ranks
    results.sort((a, b) => b.obtainedMarks - a.obtainedMarks);

    let currentRank = 1;
    let prevMarks = null;

    results = results.map((r, index) => {
      if (prevMarks === null || r.obtainedMarks !== prevMarks) {
        currentRank = index + 1;
        prevMarks = r.obtainedMarks;
      }
      return {
        ...r,
        rank: currentRank
      };
    });

    const total = results.length;

    // Sort results based on requested sorting column
    if (sortBy) {
      const order = sortOrder === 'asc' ? 1 : -1;
      results.sort((a, b) => {
        let valA, valB;
        if (sortBy === 'studentName') {
          valA = a.student?.name || '';
          valB = b.student?.name || '';
        } else if (sortBy === 'studentId') {
          valA = a.student?.studentId || '';
          valB = b.student?.studentId || '';
        } else if (sortBy === 'rollNumber') {
          valA = a.student?.rollNumber || '';
          valB = b.student?.rollNumber || '';
        } else if (sortBy === 'examName') {
          valA = a.exam?.title || '';
          valB = b.exam?.title || '';
        } else {
          valA = a[sortBy] !== undefined ? a[sortBy] : 0;
          valB = b[sortBy] !== undefined ? b[sortBy] : 0;
        }

        if (typeof valA === 'string') {
          return valA.localeCompare(valB) * order;
        }
        return (valA - valB) * order;
      });
    }

    // Paginate results
    const paginatedSlice = results.slice((pageNum - 1) * limitNum, pageNum * limitNum);

    // Fetch historical data to evaluate trends (1 single query, no N+1 query)
    const studentIdsInPage = paginatedSlice.map(r => r.student?._id).filter(Boolean);
    const historicalResults = await Result.find({
      student: { $in: studentIdsInPage },
      status: { $ne: 'in_progress' }
    })
      .populate('exam', 'title startTime')
      .lean();

    const studentHistoryMap = {};
    historicalResults.forEach(r => {
      const sId = r.student.toString();
      if (!studentHistoryMap[sId]) studentHistoryMap[sId] = [];
      studentHistoryMap[sId].push(r);
    });

    const finalizedResults = paginatedSlice.map(r => {
      const sId = r.student?._id?.toString();
      const history = studentHistoryMap[sId] || [];
      // Sort history by exam start time
      history.sort((a, b) => {
        const timeA = a.exam?.startTime ? new Date(a.exam.startTime).getTime() : 0;
        const timeB = b.exam?.startTime ? new Date(b.exam.startTime).getTime() : 0;
        return timeA - timeB;
      });

      const percentages = history.map(h => h.percentage);
      const trend = calculateTrend(percentages);

      return {
        ...r,
        trend
      };
    });

    res.json({
      success: true,
      results: finalizedResults,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== GET INDIVIDUAL STUDENT DETAIL & HISTORY ====================
const getIndividualStudentPerformance = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, message: 'Invalid Student ID format' });
    }

    const student = await Student.findById(studentId)
      .populate('department', 'name code')
      .select('-password -auditLog')
      .lean();

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const results = await Result.find({ student: studentId, status: { $ne: 'in_progress' } })
      .populate({
        path: 'exam',
        select: 'title totalMarks passMarks subject startTime',
        populate: { path: 'subject', select: 'name' }
      })
      .lean();

    // Sort history by exam start time
    results.sort((a, b) => {
      const timeA = a.exam?.startTime ? new Date(a.exam.startTime).getTime() : 0;
      const timeB = b.exam?.startTime ? new Date(b.exam.startTime).getTime() : 0;
      return timeA - timeB;
    });

    const percentages = results.map(r => r.percentage);
    const totalExams = results.length;

    let avgScore = 0;
    let highestScore = 0;
    let lowestScore = 0;
    let passCount = 0;

    if (totalExams > 0) {
      avgScore = percentages.reduce((a, b) => a + b, 0) / totalExams;
      highestScore = Math.max(...percentages);
      lowestScore = Math.min(...percentages);
      passCount = results.filter(r => r.isPassed).length;
    }

    const trend = calculateTrend(percentages);

    res.json({
      success: true,
      student,
      results,
      summary: {
        totalExams,
        avgScore,
        highestScore,
        lowestScore,
        passCount,
        failCount: totalExams - passCount,
        passRate: totalExams > 0 ? (passCount / totalExams) * 100 : 0,
        trend
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==================== EXCEL EXPORT REPORT ====================
const exportStudentPerformance = async (req, res) => {
  try {
    const { examId, departmentId, year, semester, section, subjectId, search } = req.query;

    const cleanExamId = examId && mongoose.Types.ObjectId.isValid(examId) ? String(examId) : undefined;
    const cleanDeptId = departmentId && mongoose.Types.ObjectId.isValid(departmentId) ? String(departmentId) : undefined;
    const cleanSubjectId = subjectId && mongoose.Types.ObjectId.isValid(subjectId) ? String(subjectId) : undefined;
    const cleanYear = year ? String(year) : undefined;
    const cleanSemester = semester ? String(semester) : undefined;
    const cleanSection = section ? String(section).trim().toUpperCase() : undefined;
    const cleanSearch = search ? String(search).trim().toLowerCase() : undefined;

    const query = { status: { $ne: 'in_progress' } };
    if (cleanExamId) {
      query.exam = cleanExamId;
    }

    let results = await Result.find(query)
      .populate({
        path: 'student',
        select: 'name studentId rollNumber department year semester section',
        populate: { path: 'department', select: 'name code' }
      })
      .populate({
        path: 'exam',
        select: 'title totalMarks passMarks subject',
        populate: { path: 'subject', select: 'name' }
      })
      .lean();

    // Filter results using clean parameters
    if (cleanDeptId) {
      results = results.filter(r => r.student?.department?._id?.toString() === cleanDeptId);
    }
    if (cleanYear) {
      results = results.filter(r => String(r.student?.year) === cleanYear);
    }
    if (cleanSemester) {
      results = results.filter(r => String(r.student?.semester) === cleanSemester);
    }
    if (cleanSection) {
      results = results.filter(r => String(r.student?.section || '').trim().toUpperCase() === cleanSection);
    }
    if (cleanSubjectId) {
      results = results.filter(r => r.exam?.subject?._id?.toString() === cleanSubjectId || r.exam?.subject?.toString() === cleanSubjectId);
    }
    if (cleanSearch) {
      results = results.filter(r => 
        r.student?.name?.toLowerCase().includes(cleanSearch) ||
        r.student?.studentId?.toLowerCase().includes(cleanSearch) ||
        r.student?.rollNumber?.toLowerCase().includes(cleanSearch)
      );
    }

    // Assign competition ranks
    results.sort((a, b) => b.obtainedMarks - a.obtainedMarks);
    let currentRank = 1;
    let prevMarks = null;
    results = results.map((r, index) => {
      if (prevMarks === null || r.obtainedMarks !== prevMarks) {
        currentRank = index + 1;
        prevMarks = r.obtainedMarks;
      }
      return { ...r, rank: currentRank };
    });

    // Create Excel Workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Student Performance Report');

    sheet.columns = [
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Student ID', key: 'studentId', width: 15 },
      { header: 'Roll Number', key: 'rollNumber', width: 15 },
      { header: 'Student Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 12 },
      { header: 'Year', key: 'year', width: 8 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Exam Title', key: 'examTitle', width: 25 },
      { header: 'Total Marks', key: 'totalMarks', width: 12 },
      { header: 'Obtained Marks', key: 'obtainedMarks', width: 15 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'Status', key: 'status', width: 12 }
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '1E3A8A' }
    };

    results.forEach(r => {
      sheet.addRow({
        rank: r.rank,
        studentId: r.student?.studentId || '—',
        rollNumber: r.student?.rollNumber || '—',
        name: r.student?.name || '—',
        department: r.student?.department?.code || '—',
        year: r.student?.year || '—',
        semester: r.student?.semester || '—',
        section: r.student?.section || '—',
        examTitle: r.exam?.title || '—',
        totalMarks: r.totalMarks,
        obtainedMarks: r.obtainedMarks,
        percentage: `${r.percentage.toFixed(2)}%`,
        grade: r.grade,
        status: r.isPassed ? 'PASSED' : 'FAILED'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=student_performance.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getStudentPerformanceSummary,
  getStudentPerformanceTable,
  getIndividualStudentPerformance,
  exportStudentPerformance
};
