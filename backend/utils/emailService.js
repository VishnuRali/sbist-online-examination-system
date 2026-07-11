const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const nodemailer = require('nodemailer');
const Brevo = require('@getbrevo/brevo');
const EmailLog = require('../models/EmailLog');
const Settings = require('../models/Settings');

// Brevo Email API configuration
const getBrevoConfig = () => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'SBIT Examinations';

  return {
    apiKey,
    senderEmail,
    senderName
  };
};

// Send email using Brevo HTTPS API
const sendWithBrevo = async ({ to, subject, html, text }) => {
  const { apiKey, senderEmail, senderName } = getBrevoConfig();

  if (!apiKey || !senderEmail) {
    throw new Error(
      'Brevo is not configured. BREVO_API_KEY or BREVO_SENDER_EMAIL is missing.'
    );
  }

  const response = await fetch(
    'https://api.brevo.com/v3/smtp/email',
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: senderName,
          email: senderEmail
        },
        to: [
          {
            email: to
          }
        ],
        subject: subject,
        htmlContent: html,
        ...(text ? { textContent: text } : {})
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || `Brevo API request failed with status ${response.status}`
    );
  }

  return {
    success: true,
    messageId: data.messageId || 'Brevo email accepted'
  };
};

// Helper to load Gmail credentials from DB or Env
const getGmailConfig = async () => {
  const settings = await Settings.findOne();

  // 1. Saved active Mail Settings from DB
  let user = settings?.gmailUser;
  let pass = settings?.gmailAppPassword;

  const isDbConfigured = user && pass &&
    !user.includes('your_gmail') &&
    !pass.includes('your_16_char') &&
    user.trim() !== '' &&
    pass.trim() !== '';

  if (!isDbConfigured) {
    // 2. Env variables
    user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER;
    pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_APP_PASSWORD;
  }

  if (user) user = user.trim();
  if (pass) {
    const { decrypt } = require('./crypto');
    pass = decrypt(pass);
    pass = String(pass).replace(/\s+/g, '');
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const isGmail = host.toLowerCase().includes('gmail.com');

  if (isGmail && pass && pass.length !== 16) {
    throw new Error('Invalid Gmail App Password length');
  }

  const port = isGmail ? 587 : Number(process.env.SMTP_PORT || 465);
  const secure = isGmail ? false : (process.env.SMTP_SECURE !== undefined ? (String(process.env.SMTP_SECURE) === 'true') : true);
  const portalUrl = settings?.examPortalUrl || process.env.EXAM_URL || 'http://localhost:5173';

  return { user, pass, host, port, secure, portalUrl };
};

// Create transporter
const createTransporter = (user, pass, options = {}) => {
  if (user) user = user.trim();
  if (pass) {
    const { decrypt } = require('./crypto');
    pass = decrypt(pass);
    pass = String(pass).replace(/\s+/g, '');
  }

  const host = options.host || process.env.SMTP_HOST || 'smtp.gmail.com';
  const isGmail = host.toLowerCase().includes('gmail.com');

  if (isGmail && pass && pass.length !== 16) {
    throw new Error('Invalid Gmail App Password length');
  }

  const port = isGmail ? 587 : Number(options.port || process.env.SMTP_PORT || 465);
  const secure = isGmail ? false : (options.secure !== undefined
    ? options.secure
    : (process.env.SMTP_SECURE !== undefined ? (String(process.env.SMTP_SECURE) === 'true') : true));

  const isDev = process.env.NODE_ENV === 'development';

  const mailOptions = {
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: !isDev
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,   // 10 seconds
    socketTimeout: 20000      // 20 seconds
  };

  if (isGmail) {
    mailOptions.requireTLS = true;
    mailOptions.family = 4;
  }

  if (isDev) {
    mailOptions.debug = true;
    mailOptions.logger = true;
  }

  // Safe diagnostic logs (never logging password)
  const isConfigured = !!(user && pass && !user.includes('your_gmail') && !pass.includes('your_16_char') && user.trim() !== '' && pass.trim() !== '');
  const maskedUsername = user ? (user.includes('@')
    ? user.split('@')[0].slice(0, 3) + '***@' + user.split('@')[1]
    : user.slice(0, 3) + '***') : 'N/A';

  console.log('[SMTP DIAGNOSTICS]');
  console.log('  SMTP Configured:', isConfigured);
  console.log('  Host:', host);
  console.log('  Port:', port);
  console.log('  Secure Mode:', secure);
  console.log('  Username (Masked):', maskedUsername);

  return nodemailer.createTransport(mailOptions);
};

const isEmailConfigured = async () => {
  try {
    const { user, pass } = await getGmailConfig();
    return !!(user && pass && !user.includes('your_gmail') && !pass.includes('your_16_char') && user.trim() !== '' && pass.trim() !== '');
  } catch (err) {
    return false;
  }
};


// ==================== EMAIL TEMPLATES ====================

const getWelcomeEmailHTML = (student, portalUrl) => {
  const deptName = typeof student.department === 'object'
    ? (student.department?.name || 'N/A')
    : (student.department || 'N/A');

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }
  .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #1e3a8a, #4f46e5); color: white; padding: 32px 24px; text-align: center; }
  .header h1 { margin: 0; font-size: 22px; letter-spacing: 0.5px; }
  .header p { margin: 8px 0 0; opacity: 0.85; font-size: 14px; }
  .body { padding: 32px 24px; }
  .greeting { font-size: 17px; color: #1e293b; margin-bottom: 20px; }
  .credential-box { background: #0f172a; border-radius: 10px; padding: 20px; margin: 20px 0; }
  .credential-row { display: flex; justify-content: space-between; align-items: center; margin: 10px 0; padding-bottom: 10px; border-bottom: 1px solid #1e293b; }
  .credential-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .cred-label { color: #94a3b8; font-size: 13px; }
  .cred-value { color: #60a5fa; font-size: 15px; font-weight: 700; font-family: monospace; letter-spacing: 1px; }
  .info-box { background: #f0f7ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 20px; margin: 20px 0; }
  .info-row { display: flex; justify-content: space-between; margin: 8px 0; padding-bottom: 8px; border-bottom: 1px solid #dbeafe; }
  .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .info-label { color: #64748b; font-size: 13px; font-weight: 600; }
  .info-value { color: #1e293b; font-size: 13px; font-weight: 700; text-align: right; max-width: 60%; }
  .link-btn { display: block; background: linear-gradient(135deg, #2563eb, #4f46e5); color: white; text-decoration: none; text-align: center; padding: 14px 24px; border-radius: 8px; margin: 20px 0; font-weight: bold; font-size: 15px; }
  .warning { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; color: #92400e; }
  .footer { background: #f8fafc; padding: 20px 24px; text-align: center; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🎓 SWARNA BHARATHI INSTITUTE</h1>
    <p>OF SCIENCE AND TECHNOLOGY</p>
    <p style="margin-top:14px; font-size:16px; font-weight:bold;">SBIT Online Examination System</p>
  </div>
  <div class="body">
    <p class="greeting">Dear <strong>${student.name}</strong>,</p>
    <p style="color:#475569;">Your examination portal account has been created successfully. Please find your login credentials below.</p>

    <div class="credential-box">
      <p style="color:#94a3b8; font-size:12px; margin:0 0 12px; text-transform:uppercase; letter-spacing:1px;">🔐 Login Credentials</p>
      <div class="credential-row">
        <span class="cred-label">Student ID</span>
        <span class="cred-value">${student.studentId}</span>
      </div>
      <div class="credential-row">
        <span class="cred-label">Password</span>
        <span class="cred-value">${student.password}</span>
      </div>
    </div>

    <div class="info-box">
      <p style="color:#1e40af; font-size:12px; margin:0 0 12px; text-transform:uppercase; letter-spacing:1px; font-weight:700;">📋 Your Academic Details</p>
      <div class="info-row">
        <span class="info-label">Full Name</span>
        <span class="info-value">${student.name}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Department</span>
        <span class="info-value">${deptName}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Year</span>
        <span class="info-value">Year ${student.year}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Semester</span>
        <span class="info-value">Semester ${student.semester}</span>
      </div>
      ${student.section ? `
      <div class="info-row">
        <span class="info-label">Section</span>
        <span class="info-value">Section ${student.section}</span>
      </div>` : ''}
      ${student.academicYear ? `
      <div class="info-row">
        <span class="info-label">Academic Year</span>
        <span class="info-value">${student.academicYear}</span>
      </div>` : ''}
      ${student.rollNumber ? `
      <div class="info-row">
        <span class="info-label">Roll Number</span>
        <span class="info-value">${student.rollNumber}</span>
      </div>` : ''}
    </div>

    <a href="${portalUrl}" class="link-btn">
      🔗 Login to Exam Portal
    </a>

    <div class="warning">
      ⚠️ <strong>Important:</strong> Keep your Student ID and password confidential. Do not share them with anyone. Ensure you have a stable internet connection before starting any exam. Tab switching during the exam may result in automatic submission.
    </div>
  </div>
  <div class="footer">
    <p><strong>SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY</strong></p>
    <p>This is an automated message. Please do not reply to this email.</p>
    <p>Portal: ${portalUrl}</p>
  </div>
</div>
</body>
</html>
  `;
};

const getReminderEmailHTML = (student, exam, type, portalUrl) => {
  const typeLabels = {
    reminder_24h: '24 Hours',
    reminder_1h: '1 Hour',
    reminder_30m: '30 Minutes',
    custom: 'Soon',
  };
  const label = typeLabels[type] || '30 Minutes';
  const urgency = type === 'reminder_30m' ? '🔴' : type === 'reminder_1h' ? '🟡' : '🟢';
  const alertColor = type === 'reminder_30m' ? '#dc2626' : type === 'reminder_1h' ? '#d97706' : '#059669';

  const { formatEmailDate, formatTime } = require('./dateFormatter');

  const examDate = formatEmailDate(exam.startTime);
  const examTime = formatTime(exam.startTime);

  const beginsLabel = (label === 'Soon') ? 'Soon' : `in ${label}`;
  const beginsStrongLabel = (label === 'Soon') ? 'soon' : `in <strong>${label}</strong>`;
  const countdownLabel = (label === 'Soon') ? 'soon' : `in ${label}`;

  let subjectName = '';
  if (exam.examType === 'multi' && exam.subjects && exam.subjects.length > 0) {
    subjectName = exam.subjects.map(s => s.subjectName).join(', ');
  } else {
    subjectName = typeof exam.subject === 'object' ? (exam.subject?.name || 'N/A') : (exam.subject || 'N/A');
  }
  const deptName = typeof exam.department === 'object' ? (exam.department?.name || 'N/A') : (exam.department || 'N/A');
  const sectionLabel = student.section && student.section !== '' ? `Section ${student.section}` : (exam.section && exam.section !== '' ? `Section ${exam.section}` : 'All Sections');
  const instructions = (exam.instructions || '').trim();

  const infoRow = (label, value) => `
    <tr>
      <td style="padding:8px 12px;color:#64748b;font-size:13px;font-weight:600;width:38%;border-bottom:1px solid #e2e8f0;">${label}</td>
      <td style="padding:8px 12px;color:#1e293b;font-size:13px;font-weight:700;border-bottom:1px solid #e2e8f0;">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
<div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1);">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a8a,#4f46e5);color:white;padding:28px 24px;text-align:center;">
    <p style="margin:0;font-size:12px;letter-spacing:2px;opacity:0.8;text-transform:uppercase;">Swarna Bharathi Institute of Science and Technology</p>
    <h1 style="margin:8px 0 0;font-size:20px;font-weight:800;">SBIT Online Examination</h1>
  </div>

  <!-- Alert Banner -->
  <div style="background:${alertColor};color:white;text-align:center;padding:14px;font-weight:bold;font-size:17px;letter-spacing:0.5px;">
    ${urgency} EXAM REMINDER — Starts ${beginsLabel}
  </div>

  <!-- Body -->
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#1e293b;margin:0 0 6px;">Dear <strong>${student.name}</strong>,</p>
    <p style="color:#475569;font-size:14px;margin:0 0 20px;">
      Your upcoming examination begins ${beginsStrongLabel}. Please review the details below and log in on time.
    </p>

    <!-- Countdown box -->
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px;text-align:center;margin-bottom:20px;">
      <p style="margin:0;font-size:15px;font-weight:700;color:#92400e;">
        ⏰ Your examination begins ${countdownLabel.toLowerCase()}. Log in now and be prepared.
      </p>
    </div>

    <!-- Exam Details Table -->
    <p style="color:#1e40af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">📝 Exam Details</p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
      <tbody>
        ${infoRow('Student Name', student.name)}
        ${infoRow('Student ID', student.studentId)}
        ${infoRow('Roll Number', student.rollNumber || '—')}
        ${infoRow('Exam Title', exam.title)}
        ${infoRow('Subject', subjectName)}
        ${infoRow('Department', deptName)}
        ${infoRow('Year / Semester', `Year ${exam.year} &nbsp;|&nbsp; Semester ${exam.semester}`)}
        ${infoRow('Section', sectionLabel)}
        ${infoRow('Date', examDate)}
        ${infoRow('Start Time', examTime)}
        ${infoRow('Duration', `${exam.duration} Minutes`)}
        ${infoRow('Total Marks', String(exam.totalMarks || '—'))}
        ${infoRow('Pass Marks', String(exam.passMarks || '—'))}
      </tbody>
    </table>

    ${instructions ? `
    <!-- Instructions -->
    <p style="color:#1e40af;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">📋 Exam Instructions</p>
    <div style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:20px;font-size:13px;color:#1e293b;white-space:pre-wrap;">${instructions}</div>
    ` : ''}

    <!-- CTA Button -->
    <a href="${portalUrl}" style="display:block;background:linear-gradient(135deg,#2563eb,#4f46e5);color:white;text-decoration:none;text-align:center;padding:14px 24px;border-radius:8px;margin:0 0 16px;font-weight:bold;font-size:15px;">
      🔗 Login &amp; Start Exam Now
    </a>

    <!-- Warning -->
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px;font-size:12px;color:#92400e;">
      ⚠️ <strong>Important:</strong> Ensure a stable internet connection before starting. Tab switching, exiting fullscreen, or using keyboard shortcuts during the exam may result in automatic submission.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;padding:16px 24px;text-align:center;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0;">
    <p style="margin:0 0 4px;"><strong>SWARNA BHARATHI INSTITUTE OF SCIENCE AND TECHNOLOGY</strong></p>
    <p style="margin:0;">This is an automated reminder. Do not reply to this email. &nbsp;|&nbsp; Portal: ${portalUrl}</p>
  </div>

</div>
</body>
</html>`;
};

// ==================== SMTP ERROR PARSER & RETRY SYSTEM ====================

const parseSmtpError = (error) => {
  const msg = error?.message || String(error);
  if (msg.includes('Invalid Gmail App Password length') || msg.toLowerCase().includes('password length')) {
    return 'Invalid Gmail App Password length';
  }
  if (msg.includes('454') || msg.toLowerCase().includes('too many login attempts')) {
    return 'Gmail rate limit: Too many login attempts. Auto-retry scheduled.';
  }
  if (msg.includes('Username and Password not accepted') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('invalid credentials') || msg.includes('535 5.7.8')) {
    return 'Gmail authentication failed: verify Gmail address and App Password';
  }
  if (error?.code === 'ETIMEDOUT' || error?.code === 'TIMEOUT' || msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('time out')) {
    return 'SMTP connection timed out';
  }
  if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED' || error?.code === 'ENETUNREACH' || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('dns') || msg.includes('ENETUNREACH')) {
    return 'SMTP connection blocked or unreachable';
  }
  if (msg.toLowerCase().includes('limit exceeded') || msg.toLowerCase().includes('exceeded')) {
    return 'Daily limit exceeded: SMTP sending quota reached. Auto-retry scheduled.';
  }
  return msg;
};


// ==================== SEND FUNCTIONS ====================

const sendWelcomeEmail = async (student, exam = null) => {
  const { user, pass, host, port, secure, portalUrl } = await getGmailConfig();

  const log = new EmailLog({
    to: student.email,
    studentName: student.name,
    studentId: student.studentId,
    type: 'welcome',
    subject: 'SBIT Online Examination — Your Account Details',
    exam: exam ? exam._id : null,
    student: student._id,
    attemptedAt: new Date(),
    attempts: 1,
    department: student.department?._id || student.department || null,
    year: student.year || '',
    semester: student.semester || '',
    section: student.section || '',
  });

  if (!user || !pass) {
    console.log(`[Email] SMTP not configured. Skipping welcome email to ${student.email}`);
    log.status = 'failed';
    log.errorMessage = 'SMTP credentials not configured in settings/env';
    await log.save();
    return { success: false, reason: 'SMTP credentials not configured' };
  }

  try {
    await sendWithBrevo({
      to: student.email,
      subject: 'SBIT Online Examination — Your Account Details & Login Credentials',
      html: getWelcomeEmailHTML(student, portalUrl)
    });

    log.status = 'sent';
    log.sentAt = new Date();
    log.errorMessage = '';
    await log.save();
    console.log(`[Email] Welcome email sent to ${student.email}`);
    return { success: true };
  } catch (error) {
    log.status = 'failed';
    log.errorMessage = parseSmtpError(error);
    log.nextAttemptAt = new Date(Date.now() + 60000); // retry after 1 min (first backoff)
    await log.save();
    console.error(`[Email] Failed to send to ${student.email}: ${error.message}`);
    return { success: false, error: log.errorMessage };
  }
};

const sendReminderEmail = async (student, exam, type) => {
  const { user, pass, host, port, secure, portalUrl } = await getGmailConfig();
  const typeLabel = {
    reminder_24h: '24 Hours',
    reminder_1h: '1 Hour',
    reminder_30m: '30 Minutes',
  }[type] || '30 Minutes';

  const log = new EmailLog({
    to: student.email,
    studentName: student.name,
    studentId: student.studentId,
    type,
    subject: `SBIT Exam Reminder — Starts in ${typeLabel}: ${exam.title}`,
    exam: exam._id,
    student: student._id,
    attemptedAt: new Date(),
    attempts: 1,
    department: student.department?._id || student.department || null,
    year: student.year || '',
    semester: student.semester || '',
    section: student.section || '',
  });

  if (!user || !pass) {
    log.status = 'failed';
    log.errorMessage = 'SMTP credentials not configured in settings/env';
    await log.save();
    return { success: false };
  }

  try {
    const transporter = createTransporter(user, pass, { host, port, secure });
    await transporter.verify();
    await transporter.sendMail({
      from: `"SBIT Examinations" <${user}>`,
      to: student.email,
      subject: `SBIT Exam Reminder — Starts in ${typeLabel}: ${exam.title}`,
      html: getReminderEmailHTML(student, exam, type, portalUrl),
    });

    log.status = 'sent';
    log.sentAt = new Date();
    log.errorMessage = '';
    await log.save();
    return { success: true };
  } catch (error) {
    log.status = 'failed';
    log.errorMessage = parseSmtpError(error);
    log.nextAttemptAt = new Date(Date.now() + 60000); // retry after 1 min (first backoff)
    await log.save();
    return { success: false, error: error.message };
  }
};

const retryEmailLog = async (log) => {
  const Student = require('../models/Student');
  const Exam = require('../models/Exam');
  const { portalUrl } = await getGmailConfig();

  // Only retry failed emails
  if (log.status !== 'failed') {
    return {
      success: false,
      error: 'Email log is not in failed status'
    };
  }

  log.status = 'pending';
  await log.save();

  const student = await Student.findById(log.student).populate('department');

  const exam = log.exam
    ? await Exam.findById(log.exam).populate('subject department')
    : null;

  if (!student) {
    log.status = 'failed';
    log.errorMessage = 'Student not found in database';
    await log.save();

    return {
      success: false,
      error: 'Student not found'
    };
  }

  log.attempts = (log.attempts || 0) + 1;
  log.retried = true;
  log.attemptedAt = new Date();

  try {
    let html = '';

    if (log.type === 'welcome') {
      html = getWelcomeEmailHTML(student, portalUrl);
    } else {
      if (!exam) {
        log.status = 'failed';
        log.errorMessage = 'Exam not found in database';
        await log.save();

        return {
          success: false,
          error: 'Exam not found'
        };
      }

      html = getReminderEmailHTML(
        student,
        exam,
        log.type,
        portalUrl
      );
    }

    // Send using Brevo HTTPS API instead of Gmail SMTP
    const result = await sendWithBrevo({
      to: log.to,
      subject: log.subject,
      html
    });

    log.status = 'sent';
    log.sentAt = new Date();
    log.errorMessage = '';
    log.nextAttemptAt = null;

    if (result.messageId) {
      log.messageId = result.messageId;
    }

    await log.save();

    return {
      success: true,
      messageId: result.messageId
    };

  } catch (error) {
    log.status = 'failed';
    log.errorMessage = error.message || 'Brevo email retry failed';

    if (log.attempts < 4) {
      const backoffMinutes =
        [0, 1, 5, 15][log.attempts] || 15;

      log.nextAttemptAt = new Date(
        Date.now() + backoffMinutes * 60000
      );
    } else {
      log.nextAttemptAt = null;
    }

    await log.save();

    return {
      success: false,
      error: log.errorMessage
    };
  }
};

const retryAllFailedLogs = async () => {
  const failedLogs = await EmailLog.find({ status: 'failed' });
  let successCount = 0;
  let failCount = 0;

  for (const log of failedLogs) {
    try {
      const res = await retryEmailLog(log);
      if (res.success) successCount++;
      else failCount++;
    } catch (e) {
      failCount++;
    }
  }
  return { successCount, failCount, total: failedLogs.length };
};

const testSmtpConnection = async (testUser, testPass, recipientEmail = null) => {
  try {
    if (!process.env.BREVO_API_KEY) {
      return {
        success: false,
        reason: 'BREVO_API_KEY is not configured in Render'
      };
    }

    if (recipientEmail) {
      await sendWithBrevo({
        to: recipientEmail,
        subject: 'SBIT Exam Portal — Brevo Email Test',
        html: `
          <div style="font-family: sans-serif; padding: 24px; max-width: 500px; margin: auto;">
            <h2>✅ Brevo Email Connection Successful</h2>
            <p>This test email was sent successfully from the SBIT Online Examination Portal.</p>
            <p>Your Brevo email service is working correctly.</p>
          </div>
        `
      });
    }

    return {
      success: true,
      message: recipientEmail
        ? 'Brevo test email sent successfully'
        : 'Brevo API is configured'
    };
  } catch (error) {
    console.error('[Brevo] Test email failed:', error);

    return {
      success: false,
      reason: error.message,
      code: error.response?.statusCode || error.status || 'BREVO_ERROR'
    };
  }
};

const sendOtpEmail = async (email, name, otp) => {
  const { user, pass, host, port, secure } = await getGmailConfig();
  if (!user || !pass) {
    return { success: false, reason: 'SMTP credentials not configured' };
  }
  try {
    const transporter = createTransporter(user, pass, { host, port, secure });
    await transporter.verify();
    await transporter.sendMail({
      from: `"SBIT Examinations" <${user}>`,
      to: email,
      subject: 'SBIT Portal — Forgot Password OTP',
      html: `
        <div style="font-family: sans-serif; padding: 24px; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #4f46e5; margin-top: 0; font-size: 20px;">Forgot Password OTP</h2>
          <p style="color: #334155; font-size: 14px;">Dear ${name},</p>
          <p style="color: #334155; font-size: 14px;">You requested a password reset for your SBIT Exam Portal account.</p>
          <div style="background-color: #f8fafc; text-align: center; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <span style="font-size: 28px; font-weight: bold; color: #1e3a8a; letter-spacing: 4px;">${otp}</span>
          </div>
          <p style="color: #475569; font-size: 13px;">This OTP is valid for <strong>10 minutes</strong>. Do not share this OTP with anyone.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 11px; margin: 0;">If you did not request this, please ignore this email.</p>
        </div>
      `
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendReminderEmail,
  isEmailConfigured,
  testSmtpConnection,
  getGmailConfig,
  sendOtpEmail,
  retryEmailLog,
  retryAllFailedLogs,
  createTransporter,
  getReminderEmailHTML,
  parseSmtpError
};
