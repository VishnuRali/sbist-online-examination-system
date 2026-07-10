const rateLimit = require('express-rate-limit');

const createLimiterLogger = (req) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const endpoint = req.originalUrl || req.url || 'unknown';
  const remaining = req.rateLimit?.remaining ?? 'unknown';
  const resetTime = req.rateLimit?.resetTime ? new Date(req.rateLimit.resetTime).toISOString() : 'unknown';

  console.warn('🔒 [RateLimiter] Blocked request', {
    ip,
    endpoint,
    remaining,
    resetTime,
  });
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 200 : 30,
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  store: new rateLimit.MemoryStore(),
  // Key by IP + identifier so students sharing the same public IP in a computer lab
  // don't consume each other's rate limit quota.
  keyGenerator: (req) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const identifier = req.body?.studentId || req.body?.email || '';
    const key = `${ip}:${identifier}`;
    console.log('🔑 [RateLimiter] Generated key:', { ip, identifier, key, body: req.body });
    return key;
  },
  handler: (req, res, next, options) => {
    createLimiterLogger(req);
    res.status(options.statusCode).json(options.message);
  },
});

const examLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  message: { success: false, message: 'Too many exam requests.' },
  standardHeaders: true,
  legacyHeaders: false,
  store: new rateLimit.MemoryStore(),
  // Key by authenticated user ID so exam auto-save requests from different students
  // don't count against each other when they share the same IP.
  keyGenerator: (req) => {
    // req.user is populated by the studentOnly middleware (which runs before this)
    const userId = req.user?.id || req.user?.studentId;
    const ip = req.ip || 'unknown';
    return userId ? `user:${userId}` : ip;
  },
});

module.exports = { loginLimiter, examLimiter };

