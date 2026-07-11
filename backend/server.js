require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const examRoutes = require('./routes/exam');
const studentRoutes = require('./routes/student');
const resultRoutes = require('./routes/result');
const { examLimiter } = require('./middleware/rateLimiter');

const app = express();

// Security middleware
app.set('trust proxy', process.env.TRUST_PROXY === '1' || process.env.NODE_ENV === 'production');
app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS policy does not allow access from ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/exam', examRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/result', resultRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SBIT Examination API is running',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// MongoDB connection
const { logTargetDatabase, checkPasswordEncoding, analyzeMongoError } = require('./utils/dbDiag');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('❌ MongoDB Connection Failure: process.env.MONGODB_URI is not defined.');
    process.exit(1);
  }

  logTargetDatabase(uri);
  checkPasswordEncoding(uri);

  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB Atlas connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed!');
    analyzeMongoError(error);
    process.exit(1);
  }
};

connectDB().then(async () => {
  // One-time persistent backfill for legacy exams missing a valid 6-digit accessCode
  try {
    const Exam = require('./models/Exam');
    const { generateAccessCode } = require('./utils/generateId');
    const legacyExams = await Exam.find({
      $or: [
        { accessCode: { $exists: false } },
        { accessCode: null },
        { accessCode: '' },
        { accessCode: { $not: /^\d{6}$/ } }
      ]
    });
    if (legacyExams.length > 0) {
      console.log(`[Backfill] Found ${legacyExams.length} legacy exams missing a valid 6-digit access code. Backfilling...`);
      for (const exam of legacyExams) {
        const code = generateAccessCode();
        await Exam.findByIdAndUpdate(exam._id, { accessCode: code });
        console.log(`[Backfill] Exam "${exam.title}" (${exam._id}) updated with access code ${code}`);
      }
    }
  } catch (err) {
    console.error('[Backfill] Error during legacy exams backfill:', err.message);
  }

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    console.log(`📡 API: http://localhost:${PORT}/api`);

    // Start background cron jobs after DB connection
    try {
      const { startReminderEmailJob } = require('./jobs/reminderEmails');
      startReminderEmailJob();

      const { startGoogleFormSync } = require('./jobs/syncGoogleForm');
      startGoogleFormSync();

      const { startEmailWorker } = require('./jobs/emailWorker');
      startEmailWorker();

      const cron = require('node-cron');
      const Exam = require('./models/Exam');
      cron.schedule('* * * * *', async () => {
        try {
          const now = new Date();
          const activated = await Exam.updateMany(
            { status: 'scheduled', startTime: { $lte: now }, endTime: { $gt: now } },
            { $set: { status: 'active' } }
          );
          const completed = await Exam.updateMany(
            { status: 'active', endTime: { $lte: now } },
            { $set: { status: 'completed' } }
          );
          if (activated.modifiedCount > 0 || completed.modifiedCount > 0) {
            console.log(`[ExamStatus] activated=${activated.modifiedCount}, completed=${completed.modifiedCount}`);
          }
        } catch (e) {
          console.error('[ExamStatus] Cron error:', e.message);
        }
      });
      console.log('✅ Exam status auto-update cron started (every minute)');
    } catch (e) {
      console.warn('⚠️  Cron job failed to start:', e.message);
    }


    console.log('🎓 SBIT Online Examination System v2.0 ready!');
  });
});

module.exports = app;
