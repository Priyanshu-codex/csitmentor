const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

// ── GET /api/users — list all users (admin only) ─────────────────────────────
router.get('/', authorize('admin'), async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).select('-password').sort({ createdAt: -1 });
    res.json({ status: 'success', count: users.length, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch users.' });
  }
});

// ── GET /api/users/me — get own user profile (any role) ──────────────────────
// Declared BEFORE /:id so 'me' is not treated as an ObjectId.
router.get('/me', (req, res) => {
  const u = req.user;
  res.json({
    status: 'success',
    user: { id: u._id, name: u.name, email: u.email, role: u.role },
  });
});

// ── GET /api/users/:id — get single user (admin or mentor only) ───────────────
router.get('/:id', authorize('admin', 'mentor'), async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid user ID.' });
  }
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    res.json({ status: 'success', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch user.' });
  }
});

// ── PATCH /api/users/:id — update user ───────────────────────────────────────
// Any user can update their own name/email.
// Admin can also update role and isActive for any user.
router.patch('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ status: 'error', message: 'Invalid user ID.' });
  }
  try {
    const isSelf = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    const allowed = ['name', 'email'];
    if (isAdmin) allowed.push('role', 'isActive');

    const updates = {};
    allowed.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (isSelf && updates.isActive === false) {
      return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields provided for update.' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).select('-password');

    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    res.json({ status: 'success', user });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ status: 'error', message: 'Email already in use.' });
    }
    res.status(500).json({ status: 'error', message: 'Failed to update user.' });
  }
});

// ── DELETE /api/users/:id — soft-delete / deactivate (admin only) ─────────────
router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID.' });
    }
    if (req.user._id.toString() === req.params.id) {
      return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    res.json({ status: 'success', message: 'User deactivated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to deactivate user.' });
  }
});

module.exports = router;
