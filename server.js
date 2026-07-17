require('dotenv').config();

// ── Validate environment variables at startup ───────────────────────────────
const requiredEnv = ['MONGO_URI', 'JWT_SECRET', 'ADMIN_REGISTRATION_KEY', 'MENTOR_REGISTRATION_KEY'];
const missingEnv = requiredEnv.filter(key => !process.env[key] || !process.env[key].trim());
if (missingEnv.length > 0) {
  console.error(`❌ CRITICAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const { isJwtConfigured } = require('./config/auth');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const recordRoutes = require('./routes/records');
const mentorProfileRoutes = require('./routes/mentorProfile');
const errorHandler = require('./middleware/errorHandler');

// ── Crash guards — log and exit cleanly so PM2/systemd can restart ────────────
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION — shutting down:', err.message);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION — shutting down:', err.message);
  process.exit(1);
});

// ── Connect to MongoDB ────────────────────────────────────────────────────────
connectDB();

const app = express();

// ── Trust reverse proxy (Nginx/Caddy) — needed for rate limiting by real IP ──
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // The frontend is a single legacy HTML file with one inline script.
      // Inline event attributes are lifted into delegated listeners on load, so
      // script-src-attr can stay locked down without breaking legacy controls.
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// ── CORS — allow your frontend origins ───────────────────────────────────────
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:5500')
  .split(',')
  .map(o => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

// ── Global rate limiter (100 req / 15 min per IP) ─────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ── Body parsers ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Logging (dev only) ────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

const path = require('path');

// ── Serve frontend static files (all environments) ───────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mentor-diary.html'));
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    authConfigured: isJwtConfigured(),
  });
});

// ── Auth rate limiter (10 req / 15 min per IP) ────────────────────────────────
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { status: 'error', message: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/mentor-profile', mentorProfileRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `Route ${req.originalUrl} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`🚀 CSIT Mentor Diary backend running on port ${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  // NOTE: Never log MONGO_URI — it contains credentials
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const mongoose = require('mongoose');

const gracefulShutdown = (signal) => {
  console.log(`\n⚠️ ${signal} received. Starting graceful shutdown...`);
  
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');
      
      mongoose.connection.close(false)
        .then(() => {
          console.log('Database connection closed.');
          process.exit(0);
        })
        .catch((err) => {
          console.error('Error during database disconnection:', err.message);
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }

  // Force close after 10s if connections are hanging
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
