const cron = require('node-cron');
const Exam = require('../models/Exam');
const Student = require('../models/Student');
const EmailLog = require('../models/EmailLog');
const { sendReminderEmail } = require('../utils/emailService');

/**
 * Send reminder emails before exam starts.
 * Runs every minute.
 *
 * Duplicate-safety strategy (two layers):
 *   1. Mark the exam flag (reminderSentXx: true) BEFORE the loop begins.
 *      This prevents a second concurrent cron run from re-entering the loop.
 *   2. Check EmailLog per student before sending.
 *      This prevents double-sending if the flag update was delayed.
 */
const sendRemindersForWindow = async (windowStartMs, windowEndMs, flagField, type) => {
  const now = new Date();
  const windowStart = new Date(now.getTime() + windowStartMs);
  const windowEnd   = new Date(now.getTime() + windowEndMs);

  const upcomingExams = await Exam.find({
    status: 'scheduled',
    startTime: { $gte: windowStart, $lte: windowEnd },
    [flagField]: { $ne: true },
  }).populate('subject department');

  for (const exam of upcomingExams) {
    // ── Layer 1: Mark BEFORE sending to block concurrent cron runs ──
    await Exam.findByIdAndUpdate(exam._id, { [flagField]: true });

    const studentQuery = {
      department: exam.department._id,
      semester:   exam.semester,
      year:       exam.year,
      isActive:   true,
    };
    if (exam.section && exam.section !== '') {
      studentQuery.section = exam.section;
    }

    const students = await Student.find(studentQuery);
    let sentCount = 0, skipCount = 0, failCount = 0;

    for (const student of students) {
      try {
        // ── Layer 2: Check EmailLog for per-student deduplication ──
        const alreadySent = await EmailLog.findOne({
          exam:    exam._id,
          student: student._id,
          type,
          status:  'sent',
        });
        if (alreadySent) { skipCount++; continue; }

        await sendReminderEmail(student, exam, type);
        sentCount++;
      } catch (err) {
        failCount++;
        console.error(`[ReminderEmail] Failed for ${student.email}:`, err.message);
      }
    }

    if (students.length > 0) {
      console.log(
        `[ReminderEmail] ${type} → "${exam.title}": sent=${sentCount}, skipped=${skipCount}, failed=${failCount}/${students.length}`
      );
    }
  }
};

const checkAndSendReminders = async () => {
  try {
    // ── 30-minute reminder (primary) ─────────────────────────────────
    await sendRemindersForWindow(28 * 60000, 32 * 60000, 'reminderSent30m', 'reminder_30m');

    // ── 1-hour reminder ──────────────────────────────────────────────
    await sendRemindersForWindow((60 - 2) * 60000, (60 + 2) * 60000, 'reminderSent1h', 'reminder_1h');

    // ── 24-hour reminder ─────────────────────────────────────────────
    await sendRemindersForWindow((1440 - 2) * 60000, (1440 + 2) * 60000, 'reminderSent24h', 'reminder_24h');
  } catch (error) {
    console.error('[ReminderEmail] Cron error:', error.message);
  }
};

const runAutoRetries = async () => {
  try {
    const { retryEmailLog } = require('../utils/emailService');
    const now = new Date();
    const logsToRetry = await EmailLog.find({
      status: 'failed',
      nextAttemptAt: { $lte: now }
    });

    if (logsToRetry.length > 0) {
      console.log(`[AutoRetry] Found ${logsToRetry.length} email logs scheduled for retry`);
    }

    for (const log of logsToRetry) {
      try {
        await retryEmailLog(log);
      } catch (err) {
        console.error(`[AutoRetry] Error retrying log ${log._id}:`, err.message);
      }
    }
  } catch (error) {
    console.error('[AutoRetry] Cron error:', error.message);
  }
};

const startReminderEmailJob = () => {
  cron.schedule('* * * * *', checkAndSendReminders);
  cron.schedule('* * * * *', runAutoRetries); // Check and retry every minute
  console.log('✅ Reminder email and auto-retry crons started (every minute)');
};

module.exports = { startReminderEmailJob };
