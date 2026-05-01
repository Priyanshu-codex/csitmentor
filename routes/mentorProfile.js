const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { MentorRecord } = require('../models/Record');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// ── Helper: resolve mentorId ('me' or explicit ID) ───────────────────────────
function resolveMentorId(req) {
  if (req.params.mentorId === 'me') return req.user._id;
  if (!mongoose.Types.ObjectId.isValid(req.params.mentorId)) return null;
  return req.params.mentorId;
}

// ── GET /api/mentor-profile/:mentorId ────────────────────────────────────────
// Access: mentor can read their own profile; admin can read any profile.
// Students are not permitted to access mentor profiles directly.
router.get('/:mentorId', async (req, res) => {
  try {
    const mid = resolveMentorId(req);
    if (!mid) {
      return res.status(400).json({ status: 'error', message: 'Invalid mentor ID.' });
    }

    // Students cannot access mentor profiles
    if (req.user.role === 'student') {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    // Mentors can only read their own profile
    if (req.user.role === 'mentor' && req.user._id.toString() !== mid.toString()) {
      return res.status(403).json({ status: 'error', message: 'Mentors can only view their own profile.' });
    }

    // Use findOneAndUpdate upsert to auto-create if missing (race-condition safe)
    const record = await MentorRecord.findOneAndUpdate(
      { mentor: mid },
      { $setOnInsert: { mentor: mid } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate('mentor', 'name email role');

    res.json({ status: 'success', record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch mentor profile.' });
  }
});

// ── PATCH /api/mentor-profile/:mentorId ──────────────────────────────────────
// Access: mentor can update their own profile; admin can update any profile.
router.patch('/:mentorId', async (req, res) => {
  try {
    const mid = resolveMentorId(req);
    if (!mid) {
      return res.status(400).json({ status: 'error', message: 'Invalid mentor ID.' });
    }

    // Only the mentor themselves or an admin can update
    if (req.user._id.toString() !== mid.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    // Require profile data
    if (req.body.profile === undefined) {
      return res.status(400).json({ status: 'error', message: 'Request body must include a "profile" field.' });
    }

    // Use findOneAndUpdate with upsert — atomic, no duplicate-key race condition.
    // Previously: findOne → new MentorRecord() → save() could create a duplicate
    // if two requests raced on a not-yet-existing record.
    const record = await MentorRecord.findOneAndUpdate(
      { mentor: mid },
      {
        $set: { profile: req.body.profile },
        $setOnInsert: { mentor: mid },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.json({ status: 'success', message: 'Mentor profile saved.', record });
  } catch (err) {
    console.error(err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ status: 'error', message: err.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to save mentor profile.' });
  }
});

module.exports = router;
