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
    const { search } = req.query;

    if (!search) {
      const users = await User.find({ isActive: true }).select('-password').sort({ createdAt: -1 });
      return res.json({ status: 'success', count: users.length, users });
    }

    const regex = new RegExp(search, 'i');

    // First search in User collection
    const userQuery = {
      isActive: true,
      $or: [
        { name: regex },
        { email: regex },
        { role: regex }
      ]
    };

    let matchedUsers = await User.find(userQuery).select('-password').sort({ createdAt: -1 });

    // Look for registration numbers, departments or branches, and cell phone numbers in student and mentor records
    const { StudentRecord, MentorRecord } = require('../models/Record');

    const [matchedStudentRecs, matchedMentorRecs] = await Promise.all([
      StudentRecord.find({
        $or: [
          { 'personal.registrationNo': regex },
          { 'personal.branch': regex },
          { 'personal.personalCell': regex }
        ]
      }).select('student'),
      MentorRecord.find({
        $or: [
          { 'profile.department': regex },
          { 'profile.contact': regex }
        ]
      }).select('mentor')
    ]);

    const extraUserIds = [
      ...matchedStudentRecs.map(rec => rec.student),
      ...matchedMentorRecs.map(rec => rec.mentor)
    ];

    if (extraUserIds.length > 0) {
      const extraUsers = await User.find({
        _id: { $in: extraUserIds },
        isActive: true
      }).select('-password');

      // Merge and remove duplicates
      const mergedMap = new Map();
      matchedUsers.forEach(u => mergedMap.set(u._id.toString(), u));
      extraUsers.forEach(u => mergedMap.set(u._id.toString(), u));
      matchedUsers = Array.from(mergedMap.values()).sort((a, b) => b.createdAt - a.createdAt);
    }

    res.json({ status: 'success', count: matchedUsers.length, users: matchedUsers });
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
    const user = await User.findByIdAndUpdate(req.params.id, {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: req.user._id,
    }, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });
    res.json({ status: 'success', message: 'User deactivated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to deactivate user.' });
  }
});

// ── PATCH /api/users/admin/users/:id/deactivate (admin only) ─────────────────────────
router.patch('/admin/users/:id/deactivate', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reasonType, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID.' });
    }
    if (req.user._id.toString() === id) {
      return res.status(400).json({ status: 'error', message: 'You cannot deactivate your own account.' });
    }

    const updates = {
      isActive: false,
      deactivatedAt: new Date(),
      deactivatedBy: req.user._id,
      deactivationReasonType: reasonType || 'Other',
      deactivationReason: reason || '',
    };

    const user = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    res.json({ status: 'success', message: 'User deactivated successfully.', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to deactivate user.' });
  }
});

// ── PATCH /api/users/admin/users/:id/activate (admin only) ───────────────────────────
router.patch('/admin/users/:id/activate', authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID.' });
    }

    const updates = {
      isActive: true,
      activatedAt: new Date(),
      activatedBy: req.user._id,
    };

    const user = await User.findByIdAndUpdate(id, updates, { new: true });
    if (!user) return res.status(404).json({ status: 'error', message: 'User not found.' });

    res.json({ status: 'success', message: 'User activated successfully.', user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to activate user.' });
  }
});

// ── GET /api/admin/deactivated-users (admin only) ──────────────────────────────
router.get('/admin/deactivated-users', authorize('admin'), async (req, res) => {
  try {
    const { search, role, department, sort, page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Initial filter for inactive users
    const filter = { isActive: false };

    if (role) {
      filter.role = role;
    }

    // Resolve users matching textual search (name, email)
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Determine sort order
    let sortObj = { deactivatedAt: -1 };
    if (sort === 'oldest') {
      sortObj = { deactivatedAt: 1 };
    }

    // Retrieve inactive users matching search and role filter
    let users = await User.find(filter)
      .populate('deactivatedBy', 'name email')
      .populate('activatedBy', 'name email')
      .sort(sortObj);

    // Fetch related records (Student/Mentor) in batch to prevent N+1 database queries
    const { StudentRecord, MentorRecord } = require('../models/Record');
    
    const studentUserIds = users.filter(u => u.role === 'student').map(u => u._id);
    const mentorUserIds = users.filter(u => u.role === 'mentor').map(u => u._id);

    const [studRecs, mentRecs] = await Promise.all([
      studentUserIds.length > 0 ? StudentRecord.find({ student: { $in: studentUserIds } }) : [],
      mentorUserIds.length > 0 ? MentorRecord.find({ mentor: { $in: mentorUserIds } }) : [],
    ]);

    const studMap = new Map(studRecs.map(r => [r.student.toString(), r]));
    const mentMap = new Map(mentRecs.map(r => [r.mentor.toString(), r]));

    let augmentedUsers = users.map(u => {
      let dept = '';
      let regNo = '';
      let phone = '';
      let photoUrl = '';

      if (u.role === 'student') {
        const studRec = studMap.get(u._id.toString());
        if (studRec && studRec.personal) {
          dept = studRec.personal.branch || '';
          regNo = studRec.personal.registrationNo || '';
          phone = studRec.personal.personalCell || '';
          photoUrl = studRec.personal.photoUrl || '';
        }
      } else if (u.role === 'mentor') {
        const mentRec = mentMap.get(u._id.toString());
        if (mentRec && mentRec.profile) {
          dept = mentRec.profile.department || '';
          phone = mentRec.profile.contact || '';
        }
      }

      return {
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        deactivatedAt: u.deactivatedAt,
        deactivatedBy: u.deactivatedBy ? { name: u.deactivatedBy.name, email: u.deactivatedBy.email } : null,
        deactivationReasonType: u.deactivationReasonType || '',
        deactivationReason: u.deactivationReason || '',
        department: dept,
        registrationNo: regNo,
        phone: phone,
        photoUrl: photoUrl,
      };
    });

    // Apply department filter in memory if specified
    if (department) {
      augmentedUsers = augmentedUsers.filter(u => u.department.toLowerCase().includes(department.toLowerCase()));
    }

    // Apply registration number search if search did not find it in user table but could match registrationNo
    if (search && augmentedUsers.length === 0) {
      // Let's do a search on registration number directly in StudentRecord
      const matchingStudRecs = await StudentRecord.find({
        'personal.registrationNo': { $regex: search, $options: 'i' }
      });
      const studentIds = matchingStudRecs.map(r => r.student.toString());
      
      // Query inactive users again using these IDs
      const regFilteredUsers = await User.find({ _id: { $in: studentIds }, isActive: false })
        .populate('deactivatedBy', 'name email')
        .populate('activatedBy', 'name email')
        .sort(sortObj);

      const regStudMap = new Map(matchingStudRecs.map(r => [r.student.toString(), r]));

      augmentedUsers = regFilteredUsers.map(u => {
        const studRec = regStudMap.get(u._id.toString());
        return {
          id: u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          createdAt: u.createdAt,
          deactivatedAt: u.deactivatedAt,
          deactivatedBy: u.deactivatedBy ? { name: u.deactivatedBy.name, email: u.deactivatedBy.email } : null,
          deactivationReasonType: u.deactivationReasonType || '',
          deactivationReason: u.deactivationReason || '',
          department: studRec?.personal?.branch || '',
          registrationNo: studRec?.personal?.registrationNo || '',
          phone: studRec?.personal?.personalCell || '',
          photoUrl: studRec?.personal?.photoUrl || '',
        };
      });
    }

    // Pagination
    const total = augmentedUsers.length;
    const paginatedUsers = augmentedUsers.slice(skip, skip + parseInt(limit));

    res.json({
      status: 'success',
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      users: paginatedUsers,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: 'error', message: 'Failed to fetch deactivated users.' });
  }
});

module.exports = router;
