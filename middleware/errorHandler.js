/**
 * Centralized Global Error Handler Middleware
 */

module.exports = (err, req, res, _next) => {
  // Log the unhandled error for server monitoring
  console.error('💥 CENTRALIZED ERROR LOG:', {
    name: err.name,
    message: err.message,
    statusCode: err.statusCode,
    stack: err.stack,
  });

  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error.';

  // ── Handle Mongoose CastError (e.g. invalid ObjectId) ──────────────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}.`;
  }

  // ── Handle Mongoose ValidationError ─────────────────────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(el => el.message).join('. ');
  }

  // ── Handle Mongoose Duplicate Key Error (code 11000) ────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    const value = err.errmsg.match(/(["'])(\\?.)*?\1/);
    message = `Duplicate field value: ${value ? value[0] : ''}. Please use another value.`;
  }

  // ── Handle JWT Errors ───────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
  }

  // ── Send Response ───────────────────────────────────────────────────────────
  res.status(statusCode).json({
    status: 'error',
    message: isProduction && statusCode === 500 ? 'Internal server error.' : message,
    ...(isProduction ? {} : { stack: err.stack }),
  });
};
