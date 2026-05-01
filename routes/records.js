const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { StudentRecord } = require('../models/Record');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// All routes require login
router.use(protect);

// ── GET /api/records — admin: all records; mentor: assigned students ──────────
// Declared BEFORE /:studentId so Express does not treat 'records' as a studentId.
// Only returns records whose linked user has role='student' — prevents admin/mentor
// accounts from ever appearing in the records list.
router.get('/', authorize('admin', 'mentor'), async (req, res) => {
  try {
    // Resolve the set of active student user IDs first
    const studentIds = await User.find({ role: 'student', isActive: true }).distinct('_id');

    let filter = { student: { $in: studentIds } };
    if (req.user.role === 'mentor') filter.mentor = req.user._id;

    const records = await StudentRecord.find(filter)
      .populate('student', 'name email role')
      .populate('mentor', 'name email role')
      .sort({ updatedAt: -1 });

    res.json({ status: 'success', count: records.length, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch records.' });
  }
});

// ── Helper: resolve studentId ─────────────────────────────────────────────────
// 'me' resolves to the logged-in user for ALL roles.
// Students always get their own record regardless of the param.
// Returns null if the param is not a valid ObjectId (caller must respond 400).
function resolveStudentId(req) {
  if (req.params.studentId === 'me' || req.user.role === 'student') {
    return req.user._id;
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.studentId)) {
    return null;
  }
  return req.params.studentId;
}

// ── Ensure a StudentRecord doc exists (race-condition safe) ───────────────────
// Uses findOneAndUpdate with upsert so concurrent requests never produce a
// duplicate-key error on the student unique index.
async function getOrCreateRecord(studentId) {
  const record = await StudentRecord.findOneAndUpdate(
    { student: studentId },
    { $setOnInsert: { student: studentId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return record;
}

async function isActiveStudentUser(studentId) {
  const user = await User.findById(studentId).select('role isActive');
  return !!(user && user.role === 'student' && user.isActive);
}

// ── Access guard: student can only see/edit own record ────────────────────────
function checkAccess(req, record) {
  if (req.user.role === 'student') {
    return record.student.toString() === req.user._id.toString();
  }
  return true; // admin & mentor can access all
}

// ════════════════════════════════════════════════════════════════════════════
//  GET /api/records/:studentId — fetch full record
// ════════════════════════════════════════════════════════════════════════════
router.get('/:studentId', async (req, res) => {
  try {
    const sid = resolveStudentId(req);
    if (!sid) {
      return res.status(400).json({ status: 'error', message: 'Invalid student ID.' });
    }

    if (req.user.role !== 'student' && !(await isActiveStudentUser(sid))) {
      return res.status(404).json({ status: 'error', message: 'Student user not found or is inactive.' });
    }

    const record = await getOrCreateRecord(sid);

    if (!checkAccess(req, record)) {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    res.json({ status: 'success', record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch record.' });
  }
});

// ── PATCH /api/records/:studentId/assign-mentor (admin only) ─────────────────
// IMPORTANT: declared BEFORE /:studentId/:section so Express matches it first.
router.patch('/:studentId/assign-mentor', authorize('admin'), async (req, res) => {
  try {
    const sid = req.params.studentId;
    if (!mongoose.Types.ObjectId.isValid(sid)) {
      return res.status(400).json({ status: 'error', message: 'Invalid student ID.' });
    }

    // Ensure the target user actually has the 'student' role
    const studentUser = await User.findById(sid).select('role isActive');
    if (!studentUser || !studentUser.isActive) {
      return res.status(404).json({ status: 'error', message: 'Student user not found or is inactive.' });
    }
    if (studentUser.role !== 'student') {
      return res.status(400).json({ status: 'error', message: 'Mentors can only be assigned to users with the student role.' });
    }

    const { mentorId } = req.body;
    if (!mentorId || !mongoose.Types.ObjectId.isValid(mentorId)) {
      return res.status(400).json({ status: 'error', message: 'A valid mentorId is required in the request body.' });
    }

    // Ensure the assigned user actually has the 'mentor' role (not admin or student)
    const mentorUser = await User.findById(mentorId).select('role isActive');
    if (!mentorUser || !mentorUser.isActive) {
      return res.status(404).json({ status: 'error', message: 'Mentor user not found or is inactive.' });
    }
    if (mentorUser.role !== 'mentor') {
      return res.status(400).json({ status: 'error', message: 'The specified user is not a mentor. Only users with the mentor role can be assigned.' });
    }

    // Use findOneAndUpdate to avoid a separate findOne + save round-trip
    const record = await StudentRecord.findOneAndUpdate(
      { student: sid },
      { $set: { mentor: mentorId } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ status: 'success', message: 'Mentor assigned.', record });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to assign mentor.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  PATCH /api/records/:studentId/:section — update a specific section
//
//  Sections students can write:
//    personal, family, academicCredentials, prizes, academicRecords,
//    participationRecords
//
//  Extra sections mentors/admins can write:
//    performanceChart, improvementChart, interactionRecords, overallScores
// ════════════════════════════════════════════════════════════════════════════

const SECTIONS = [
  'personal',
  'family',
  'academicCredentials',
  'prizes',
  'academicRecords',
  'performanceChart',
  'improvementChart',
  'participationRecords',
  'interactionRecords',
  'overallScores',
];

const STUDENT_WRITABLE = [
  'personal',
  'family',
  'academicCredentials',
  'prizes',
  'academicRecords',
  'participationRecords',
];

const MENTOR_WRITABLE = [
  ...STUDENT_WRITABLE,
  'performanceChart',
  'improvementChart',
  'interactionRecords',
  'overallScores',
];

router.patch('/:studentId/:section', async (req, res) => {
  try {
    const { section } = req.params;

    // 1. Validate section name
    if (!SECTIONS.includes(section)) {
      return res.status(400).json({ status: 'error', message: `Unknown section: ${section}` });
    }

    // 2. Role-based write permission
    if (req.user.role === 'student' && !STUDENT_WRITABLE.includes(section)) {
      return res.status(403).json({ status: 'error', message: 'Students cannot edit this section.' });
    }
    if (req.user.role === 'mentor' && !MENTOR_WRITABLE.includes(section)) {
      return res.status(403).json({ status: 'error', message: 'Mentors cannot edit this section.' });
    }

    // 3. Require req.body.data (even if empty array/object is fine)
    if (req.body.data === undefined) {
      return res.status(400).json({ status: 'error', message: 'Request body must include a "data" field.' });
    }

    // 4. Resolve and validate studentId
    const sid = resolveStudentId(req);
    if (!sid) {
      return res.status(400).json({ status: 'error', message: 'Invalid student ID.' });
    }

    if (req.user.role !== 'student' && !(await isActiveStudentUser(sid))) {
      return res.status(404).json({ status: 'error', message: 'Student user not found or is inactive.' });
    }

    // 5. Use findOneAndUpdate so the upsert + section write is a single atomic operation.
    //    This avoids the race condition where two simultaneous requests both
    //    find no document and then both try to create one (duplicate-key error).
    const record = await StudentRecord.findOneAndUpdate(
      { student: sid },
      {
        $set: { [section]: req.body.data },
        $setOnInsert: { student: sid },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    // 6. Access check — verify the record that was upserted belongs to this student
    if (!checkAccess(req, record)) {
      return res.status(403).json({ status: 'error', message: 'Access denied.' });
    }

    res.json({ status: 'success', message: `${section} saved.`, record });
  } catch (err) {
    console.error(err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ status: 'error', message: err.message });
    }
    res.status(500).json({ status: 'error', message: 'Failed to save section.' });
  }
});

module.exports = router;
