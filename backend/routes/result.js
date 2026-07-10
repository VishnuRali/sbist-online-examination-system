const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const { studentOnly } = require('../middleware/auth');
const Result = require('../models/Result');
const PDFDocument = require('pdfkit');

// ==================== ADMIN: Get all results ====================
router.get('/', adminOnly, async (req, res) => {
  try {
    const { exam, student, department, search, page = 1, limit = 50 } = req.query;
    const query = { status: { $ne: 'in_progress' } };
    if (exam) query.exam = exam;
    if (student) query.student = student;

    let results = await Result.find(query)
      .populate({
        path: 'student',
        select: 'name studentId rollNumber department email',
        populate: { path: 'department', select: 'name code' }
      })
      .populate({ path: 'exam', select: 'title subject startTime totalMarks passMarks', populate: { path: 'subject', select: 'name' } })
      .sort({ obtainedMarks: -1 })
      .limit(500);

    // Filter by department
    if (department) {
      results = results.filter(r => r.student?.department?._id?.toString() === department);
    }

    // Filter by search
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(r =>
        r.student?.name?.toLowerCase().includes(s) ||
        r.student?.rollNumber?.toLowerCase().includes(s) ||
        r.exam?.title?.toLowerCase().includes(s)
      );
    }

    // Assign ranks
    const ranked = results.map((r, i) => ({ ...r.toObject(), rank: i + 1 }));

    // Paginate
    const total = ranked.length;
    const paginated = ranked.slice((page - 1) * limit, page * limit);

    res.json({ success: true, results: paginated, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== STUDENT: Download own result as PDF ====================
router.get('/:resultId/pdf', studentOnly, async (req, res) => {
  try {
    const result = await Result.findOne({ _id: req.params.resultId, student: req.student._id })
      .populate({ path: 'student', select: 'name studentId rollNumber department year semester', populate: { path: 'department', select: 'name' } })
      .populate({ path: 'exam', select: 'title totalMarks passMarks subject startTime duration', populate: { path: 'subject', select: 'name code' } });

    if (!result) return res.status(404).json({ success: false, message: 'Result not found' });

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=result_${result.student.studentId}_${result.exam.title.replace(/\s+/g, '_')}.pdf`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 100).fill('#1e3a8a');
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
      .text('SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY', 50, 25, { align: 'center' });
    doc.fontSize(11).font('Helvetica').text('SBIST Online Examination System — Result Certificate', 50, 52, { align: 'center' });
    doc.fillColor('#60a5fa').fontSize(10).text(`Generated: ${new Date().toLocaleString('en-IN')}`, 50, 72, { align: 'center' });

    doc.fillColor('#1e293b');
    let y = 120;

    // Student Info box
    doc.roundedRect(50, y, 495, 110, 8).stroke('#94a3b8').fill('#f8fafc');
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(12).text('STUDENT INFORMATION', 65, y + 12);
    doc.font('Helvetica').fontSize(10);
    const studentInfo = [
      ['Student Name', result.student.name],
      ['Student ID', result.student.studentId],
      ['Roll Number', result.student.rollNumber],
      ['Department', result.student.department?.name || '—'],
      ['Year / Semester', `${result.student.year} / ${result.student.semester}`],
    ];
    studentInfo.forEach(([label, value], i) => {
      const col = i < 3 ? 0 : 1;
      const row = i < 3 ? i : i - 3;
      const x = col === 0 ? 65 : 300;
      const ry = y + 32 + row * 22;
      doc.fillColor('#64748b').text(label + ':', x, ry).fillColor('#1e293b').text(value, x + 120, ry);
    });

    y += 130;

    // Exam Info
    doc.roundedRect(50, y, 495, 85, 8).stroke('#94a3b8').fill('#f0f7ff');
    doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(12).text('EXAM INFORMATION', 65, y + 12);
    doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
    const examDate = result.exam.startTime ? new Date(result.exam.startTime).toLocaleString('en-IN') : '—';
    [
      ['Exam Title', result.exam.title],
      ['Subject', result.exam.subject?.name || '—'],
      ['Exam Date', examDate],
    ].forEach(([label, value], i) => {
      doc.fillColor('#64748b').text(label + ':', 65, y + 32 + i * 18).fillColor('#1e293b').text(value, 185, y + 32 + i * 18);
    });

    y += 105;

    // Score box
    const passed = result.isPassed;
    doc.roundedRect(50, y, 495, 100, 8).fill(passed ? '#f0fdf4' : '#fff1f2').stroke(passed ? '#16a34a' : '#dc2626');
    doc.fillColor(passed ? '#15803d' : '#b91c1c').font('Helvetica-Bold').fontSize(14)
      .text(passed ? '✓  PASSED' : '✗  FAILED', 65, y + 14, { align: 'center', width: 465 });

    const scoreData = [
      ['Total Marks', String(result.totalMarks)],
      ['Obtained Marks', String(result.obtainedMarks)],
      ['Percentage', `${result.percentage.toFixed(2)}%`],
      ['Grade', result.grade],
      ['Correct', String(result.correctAnswers)],
      ['Wrong', String(result.wrongAnswers)],
      ['Skipped', String(result.skippedAnswers)],
    ];

    scoreData.forEach(([label, value], i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const sx = 65 + col * 120;
      const sy = y + 42 + row * 28;
      doc.fillColor('#64748b').font('Helvetica').fontSize(9).text(label, sx, sy);
      doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(11).text(value, sx, sy + 12);
    });

    y += 120;

    // Footer
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
      .text('This is a computer-generated result. No signature required.', 50, y, { align: 'center', width: 495 });
    doc.text('SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY — SBIST Online Examination System', 50, y + 14, { align: 'center', width: 495 });

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
