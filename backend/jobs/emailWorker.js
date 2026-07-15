const EmailQueue = require('../models/EmailQueue');
const Student = require('../models/Student');
const Exam = require('../models/Exam');
const EmailLog = require('../models/EmailLog');
const { sendWithBrevo, getReminderEmailHTML, getWelcomeEmailHTML } = require('../utils/emailService');

let workerInterval = null;

const resetStaleJobs = async () => {
  try {
    const res = await EmailQueue.updateMany(
      { status: 'processing' },
      { $set: { status: 'queued', failureReason: 'Interrupted by server restart' }, $inc: { retryCount: 1 } }
    );
    if (res.modifiedCount > 0) {
      console.log(`[EmailWorker] Recovered ${res.modifiedCount} stale processing jobs.`);
    }
  } catch (err) {
    console.error('[EmailWorker] Failed to recover stale jobs:', err.message);
  }
};

const sendEmailForJob = async (job) => {
  try {
    const student = await Student.findById(job.student).populate('department');
    const exam = await Exam.findById(job.exam).populate('department subject');

    if (!student || !exam) {
      job.status = 'failed';
      job.failedAt = new Date();
      job.failureReason = !student ? 'Student not found' : 'Exam not found';
      await job.save();
      return;
    }

    // ── Safety Layer 1: Check if already successfully delivered ──
    const alreadySent = await EmailLog.findOne({
      student: job.student,
      exam: job.exam,
      type: job.notificationType,
      status: 'sent'
    });
    if (alreadySent) {
      console.log(`[EmailWorker] Job ${job._id} skipped: already delivered successfully in log.`);
      job.status = 'sent';
      job.sentAt = new Date();
      await job.save();
      return;
    }

    // ── Safety Layer 2: Check if expired reminder ──
    const now = new Date();
    if (job.notificationType.startsWith('reminder_') && exam.startTime && new Date(exam.startTime) <= now) {
      console.log(`[EmailWorker] Job ${job._id} skipped: reminder has expired (exam already started/ended).`);
      job.status = 'failed';
      job.failedAt = now;
      job.failureReason = 'Reminder expired: exam has already started or ended';
      await job.save();
      return;
    }

    const portalUrl =
      process.env.EXAM_URL ||
      process.env.FRONTEND_URL ||
      'https://sbist-online-examination-system.vercel.app';
    let emailHtml = '';
    let subject = '';

    if (job.notificationType === 'welcome') {
      emailHtml = getWelcomeEmailHTML(student, portalUrl);
      subject = `🎓 Welcome to SBIT Exam Portal: ${student.studentId}`;
    } else {
      emailHtml = getReminderEmailHTML(student, exam, job.notificationType, portalUrl);
      subject = `📚 Exam Announcement: ${exam.title}`;
    }

    await sendWithBrevo({
      to: job.email,
      subject,
      html: emailHtml
    });

    job.status = 'sent';
    job.sentAt = new Date();
    await job.save();

    // Create persistent EmailLog to integrate with existing UI
    await EmailLog.create({
      to: job.email,
      studentName: student.name,
      studentId: student.studentId,
      student: student._id,
      type: job.notificationType,
      subject,
      status: 'sent',
      sentAt: new Date(),
      exam: exam._id,
      department: student.department?._id || student.department,
      year: student.year,
      semester: student.semester,
      section: student.section,
      attempts: job.retryCount + 1
    });

  } catch (err) {
    const errorMsg = err.message || 'Unknown SMTP error';
    console.error(`[EmailWorker] Job ${job._id} error:`, errorMsg);

    const nextRetry = job.retryCount + 1;
    if (nextRetry >= job.maxRetryCount || errorMsg.includes('credentials') || errorMsg.includes('configured')) {
      job.status = 'failed';
      job.failedAt = new Date();
      job.failureReason = errorMsg;
      await job.save();

      // Log failure in EmailLog
      const student = await Student.findById(job.student);
      const exam = await Exam.findById(job.exam);
      if (student && exam) {
        await EmailLog.create({
          to: job.email,
          studentName: student.name,
          studentId: student.studentId,
          student: student._id,
          type: job.notificationType,
          subject: job.notificationType === 'welcome'
            ? `🎓 Welcome to SBIT Exam Portal: ${student.studentId}`
            : `📚 Exam Announcement: ${exam.title}`,
          status: 'failed',
          errorMessage: errorMsg,
          exam: exam._id,
          department: student.department,
          year: student.year,
          semester: student.semester,
          section: student.section,
          attempts: nextRetry
        });
      }
    } else {
      // Exponential backoff
      const backoffMs = Math.pow(2, nextRetry) * 60 * 1000;
      job.status = 'queued';
      job.retryCount = nextRetry;
      job.nextRetryTime = new Date(Date.now() + backoffMs);
      job.failureReason = errorMsg;
      await job.save();
    }
  }
};

const processBatch = async () => {
  const batchSize = 5;
  const now = new Date();

  const jobs = await EmailQueue.find({
    status: 'queued',
    nextRetryTime: { $lte: now }
  }).limit(batchSize);

  if (jobs.length === 0) return;

  for (const job of jobs) {
    const claimedJob = await EmailQueue.findOneAndUpdate(
      { _id: job._id, status: 'queued' },
      { $set: { status: 'processing', processingStartedAt: new Date() } },
      { new: true }
    );

    if (claimedJob) {
      await sendEmailForJob(claimedJob);
      // Introduce a 200ms delay between Brevo requests in background batch
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
};

const startEmailWorker = async () => {
  if (workerInterval) return;

  await resetStaleJobs();

  workerInterval = setInterval(async () => {
    try {
      await processBatch();
    } catch (err) {
      console.error('[EmailWorker] Error during batch processing:', err.message);
    }
  }, 5000);

  console.log('✅ Background Email Worker started successfully (every 5 seconds)');
};

const stopEmailWorker = () => {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('🛑 Background Email Worker stopped');
  }
};

module.exports = { startEmailWorker, stopEmailWorker, processBatch };
