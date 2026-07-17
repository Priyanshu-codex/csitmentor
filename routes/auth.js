const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const validator = require('validator');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  AuthConfigError,
  ONE_DAY_MS,
  getAuthCookieOptions,
  getJwtExpiresIn,
  getJwtSecret,
} = require('../config/auth');


// ── Helper: sign a JWT ────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ id: userId }, getJwtSecret(), {
    expiresIn: getJwtExpiresIn(),
  });
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role, adminKey, adminRegistrationKey, mentorRegistrationKey } = req.body;

    // Strict type validation to prevent TypeErrors / NoSQL injection
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Name, email, and password must be strings.' });
    }
    if (role !== undefined && typeof role !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Role must be a string.' });
    }
    if (adminKey !== undefined && typeof adminKey !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Admin key must be a string.' });
    }
    if (adminRegistrationKey !== undefined && typeof adminRegistrationKey !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Admin registration key must be a string.' });
    }
    if (mentorRegistrationKey !== undefined && typeof mentorRegistrationKey !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Mentor registration key must be a string.' });
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Validate required fields
    if (!trimmedName || !trimmedEmail || !password) {
      return res.status(400).json({ status: 'error', message: 'Name, email, and password are required.' });
    }

    if (!validator.isEmail(trimmedEmail)) {
      return res.status(400).json({ status: 'error', message: 'Please enter a valid email address.' });
    }

    // Password strength
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 8 characters with at least one uppercase letter and one number.',
      });
    }

    // Guard admin and mentor roles behind secret keys
    const requestedRole = ['admin', 'mentor', 'student'].includes(role) ? role : 'student';
    if (requestedRole === 'admin') {
      const aKey = adminKey || adminRegistrationKey;
      if (aKey !== process.env.ADMIN_REGISTRATION_KEY) {
        return res.status(403).json({ status: 'error', message: 'Invalid admin authorization key.' });
      }
    } else if (requestedRole === 'mentor') {
      if (mentorRegistrationKey !== process.env.MENTOR_REGISTRATION_KEY) {
        return res.status(403).json({ status: 'error', message: 'Invalid mentor authorization key.' });
      }
    }

    // Check duplicate email
    const existing = await User.findOne({ email: trimmedEmail });
    if (existing) {
      return res.status(409).json({ status: 'error', message: 'An account with this email already exists.' });
    }

    // Create user (password gets hashed by mongoose pre-save hook)
    const user = await User.create({ name: trimmedName, email: trimmedEmail, password, role: requestedRole });

    res.status(201).json({
      status: 'success',
      message: 'Account created successfully. You can now log in.',
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ status: 'error', message: 'Email already registered.' });
    }
    console.error('Register error:', err);
    res.status(500).json({ status: 'error', message: 'Server error during registration.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Strict type validation to prevent TypeErrors / NoSQL injection
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Email and password must be strings.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    // Fast-fail if email is not valid format (saves a database query)
    if (!validator.isEmail(trimmedEmail)) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    // Fetch user with password (normally excluded)
    const user = await User.findOne({ email: trimmedEmail }).select('+password');
    if (!user || !user.isActive) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    // Verify password
    const isMatch = await user.correctPassword(password);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials.' });
    }

    const token = signToken(user._id);

    User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } }).catch((updateErr) => {
      console.warn('Unable to update lastLogin:', updateErr.message);
    });

    // Also set httpOnly cookie for extra security
    res.cookie('csit_jwt', token, getAuthCookieOptions());

    res.json({
      status: 'success',
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      expiresAt: Date.now() + ONE_DAY_MS,
    });
  } catch (err) {
    if (err instanceof AuthConfigError) {
      console.error('Login configuration error:', err.message);
      return res.status(err.statusCode).json({ status: 'error', message: 'Authentication is not configured on the server.' });
    }
    console.error('Login error:', err);
    res.status(500).json({ status: 'error', message: 'Server error during login.' });
  }
});

// ── GET /api/auth/me  — validate token & return current user ─────────────────
router.get('/me', protect, async (req, res) => {
  res.json({
    status: 'success',
    user: { id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role },
  });
});

// ── POST /api/auth/logout — clear cookie ──────────────────────────────────────
router.post('/logout', protect, (req, res) => {
  res.clearCookie('csit_jwt');
  res.json({ status: 'success', message: 'Logged out successfully.' });
});

module.exports = router;
