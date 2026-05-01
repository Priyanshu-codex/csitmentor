const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Verify JWT and attach req.user ───────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Accept token from Authorization header OR httpOnly cookie
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.csit_jwt) {
      token = req.cookies.csit_jwt;
    }

    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Not authenticated. Please log in.' });
    }

    // Verify
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user (ensures user still exists and is active)
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ status: 'error', message: 'User no longer exists or has been deactivated.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ status: 'error', message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ status: 'error', message: 'Invalid token.' });
  }
};

// ── Role-based access guard ───────────────────────────────────────────────────
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required role(s): ${roles.join(', ')}.`,
      });
    }
    next();
  };
};
