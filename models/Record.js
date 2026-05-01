const mongoose = require('mongoose');

// ── Personal Profile ─────────────────────────────────────────────────────────
const personalSchema = new mongoose.Schema({
  name: String,
  admissionNo: String,
  registrationNo: String,
  dateOfBirth: Date,
  age: String,
  bloodGroup: String,
  category: String,
  personalCell: String,
  residencePhone: String,
  email: String,
  address: String,
  // Branch / Department of the student (e.g. CSE, IT, Civil)
  branch: String,
  // Current semester of the student (e.g. '1' through '8')
  currentSemester: String,
  // Free-text certifications stored alongside personal info
  certifications: String,
  // Special interests and hobbies (from Co-Curricular panel)
  hobbies: String,
  // Profile photo stored as a base64 data URL (jpeg/png, capped at ~200KB)
  photoUrl: {
    type: String,
    validate: {
      validator: v => !v || v.length <= 300000, // ~220KB base64
      message: 'Profile photo exceeds the maximum allowed size (200KB).',
    },
  },
}, { _id: false });

// ── Family Profile ───────────────────────────────────────────────────────────
const siblingSchema = new mongoose.Schema({
  order: Number,
  name: String,
  relationship: String,
  education: String,
  occupation: String,
  mobile: String,
}, { _id: false });

const familySchema = new mongoose.Schema({
  fatherName: String,
  fatherMobile: String,
  fatherOccupation: String,
  fatherEducation: String,
  fatherIncome: String,
  motherName: String,
  motherMobile: String,
  motherOccupation: String,
  motherEducation: String,
  motherIncome: String,
  noOfSiblings: String,
  siblings: [siblingSchema],
  feesPaidBy: String,
  stayingAt: String,
  lgName: String,
  lgRelationship: String,
  lgContact: String,
  lgAddress: String,
}, { _id: false });

// ── Academic Credentials ─────────────────────────────────────────────────────
const credentialSchema = new mongoose.Schema({
  order: Number,
  examination: String,
  school: String,
  board: String,
  medium: String,
  year: String,
  passingYear: String,  // kept for backward-compatibility with existing data
  percentage: String,
  division: String,
}, { _id: false });

// ── Prizes / Achievements ─────────────────────────────────────────────────────
const prizeSchema = new mongoose.Schema({
  // Frontend-facing field names (category, institution, activity, prize)
  category: String,     // e.g. 'Academic', 'Co-Curricular', 'Extra-Curricular'
  institution: String,
  activity: String,
  prize: String,
  // Legacy fields kept for backward-compatibility
  sNo: Number,
  type: { type: String },
  activityName: String,
  level: String,
  achievement: String,
  year: String,
}, { _id: false });

// ── Academic Records (semester subjects) ─────────────────────────────────────
// Fields match the academic-rec-table in the frontend (data-field attributes).
const subjectRecordSchema = new mongoose.Schema({
  sNo: Number,
  semester: String,
  // Academic Records panel fields (data-field names used in the frontend)
  monthYear: String,       // Month/Year of exam
  theoryMarks: String,     // Theory Marks / %
  spi: String,             // Semester Performance Index
  practicalPct: String,    // Practical %
  backlogs: String,        // AC / Backlogs
  att: String,             // Attendance %
  ta: String,              // TA %
  ct1: String,             // Class Test 1
  ct2: String,             // Class Test 2
  // Performance / Improvement Chart panel fields
  subject: String,
  performanceCategory: String,
  attendance: String,
  classTest: String,
  ese: String,
  presentations: String,
  date: String,
}, { _id: false });

// ── Participation Records ─────────────────────────────────────────────────────
const participationSchema = new mongoose.Schema({
  // Frontend-facing field names
  semester: String,
  date: String,         // stored as string from date input (DD/MM/YY or ISO)
  type: String,         // type of event
  title: String,        // title of event
  venue: String,        // in-house or outside
  organizer: String,    // organized by
  award: String,        // award/position/participation
  details: String,      // any other detail
  // Legacy fields kept for backward-compatibility
  sNo: Number,
  activityName: String,
  level: String,
  achievement: String,
  remarks: String,
}, { _id: false });

// ── Interaction Records ───────────────────────────────────────────────────────
const interactionSchema = new mongoose.Schema({
  sNo: Number,
  date: String,           // stored as string from date input
  issueDiscussed: String,
  tgRemarks: String,
  followUpDate: String,   // stored as string from date input
  followUpRemark: String,
}, { _id: false });

// ── Overall Score ─────────────────────────────────────────────────────────────
const overallScoreSchema = new mongoose.Schema({
  semester: String,
  A: Number, // was regularly approached (wt 30)
  B: Number, // accepts advice (wt 20)
  C: Number, // accepts feedback (wt 10)
  D: Number, // exhibits integrity (wt 10)
  E: Number, // completed goals (wt 20)
  F: Number, // overall score by mentor (wt 10)
  total: Number,
  performance: { type: String, enum: ['Excellent', 'Very Good', 'Good', 'Satisfactory', ''] },
}, { _id: false });

// ── Mentor Profile ────────────────────────────────────────────────────────────
const mentorProfileSchema = new mongoose.Schema({
  designation: String,
  department: String,
  employeeId: String,
  contact: String,
}, { _id: false });

// ── ROOT: Student Record ──────────────────────────────────────────────────────
const studentRecordSchema = new mongoose.Schema(
  {
    // owner — the user account of the student
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    // assigned mentor
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // sections
    personal: { type: personalSchema, default: {} },
    family: { type: familySchema, default: {} },
    academicCredentials: { type: [credentialSchema], default: [] },
    prizes: { type: [prizeSchema], default: [] },
    academicRecords: { type: [subjectRecordSchema], default: [] },
    performanceChart: { type: [subjectRecordSchema], default: [] },
    improvementChart: { type: [subjectRecordSchema], default: [] },
    participationRecords: { type: [participationSchema], default: [] },
    interactionRecords: { type: [interactionSchema], default: [] },
    overallScores: { type: [overallScoreSchema], default: [] },
  },
  { timestamps: true }
);

// ── Mentor Profile record (one per mentor user) ───────────────────────────────
const mentorRecordSchema = new mongoose.Schema(
  {
    mentor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    profile: { type: mentorProfileSchema, default: {} },
  },
  { timestamps: true }
);

module.exports = {
  StudentRecord: mongoose.model('StudentRecord', studentRecordSchema),
  MentorRecord: mongoose.model('MentorRecord', mentorRecordSchema),
};
