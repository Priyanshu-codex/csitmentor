/**
 * config/constants.js
 * Centralized Single Source of Truth for CSIT Mentor Diary constants.
 */

// ── Academic Branches ────────────────────────────────────────────────────────
// Stored database values must NOT be changed.
// Display labels can be formatted for UI presentation.
const BRANCHES = Object.freeze([
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'AIDS', name: 'Artificial Intelligence & Data Science' },
  { code: 'Civil', name: 'Civil Engineering' },
  { code: 'Mech', name: 'Mechanical Engineering' },
  { code: 'ECE', name: 'Electronics & Communication Engineering' },
  { code: 'EEE', name: 'Electrical & Electronics Engineering' },
]);

const BRANCH_CODES = Object.freeze(BRANCHES.map(b => b.code));

// ── Semesters ────────────────────────────────────────────────────────────────
const SEMESTERS = Object.freeze([
  { code: '1', name: 'Semester 1' },
  { code: '2', name: 'Semester 2' },
  { code: '3', name: 'Semester 3' },
  { code: '4', name: 'Semester 4' },
  { code: '5', name: 'Semester 5' },
  { code: '6', name: 'Semester 6' },
  { code: '7', name: 'Semester 7' },
  { code: '8', name: 'Semester 8' },
]);

const SEMESTER_CODES = Object.freeze(SEMESTERS.map(s => s.code));

// ── Activity Categories ──────────────────────────────────────────────────────
const ACTIVITY_CATEGORIES = Object.freeze([
  'Academic',
  'Co-Curricular',
  'Extra-Curricular',
  'Sports',
  'Technical',
]);

// ── Rubric Criteria & Weightage ──────────────────────────────────────────────
const RUBRIC_CRITERIA = Object.freeze([
  {
    id: 'A',
    wt: 30,
    param: 'Was your mentee regularly approached and talked with?',
    excellent: 'Detailed and extensive coverage regularly approach and talk',
    good: 'Good number of regularly approach and talk',
    avg: 'Average coverage of regularly approach and talk',
    acc: 'Moderate coverage of regularly approach and talk',
    unac: 'Minimal coverage of regularly approach and talk',
  },
  {
    id: 'B',
    wt: 20,
    param: 'Did/does your mentee accept advice and encouragement from you with respect to your independent goals?',
    excellent: 'Extensive acceptance on advice and encouragements',
    good: 'Good acceptance on advice and encouragements',
    avg: 'Average acceptance on advice and encouragements',
    acc: 'Moderate acceptance on advice and encouragements',
    unac: 'Minimal acceptance on advice and encouragements',
  },
  {
    id: 'C',
    wt: 10,
    param: 'The feedback and constructive criticism provided by you is accepted by your mentee?',
    excellent: 'Extensively accepted the feedback and constructive criticism',
    good: 'Acceptance level of feedback and constructive criticism was Good',
    avg: 'Average Acceptance of feedback and constructive criticism',
    acc: 'Moderate acceptance of the feedback and constructive criticism',
    unac: 'Minimal Acceptance of the feedback and constructive criticism',
  },
  {
    id: 'D',
    wt: 10,
    param: 'Did your mentee exhibit integrity?',
    excellent: 'Extensively accepted',
    good: 'Acceptance level was Good',
    avg: 'Average level only',
    acc: 'Moderate level only',
    unac: 'Minimal only',
  },
  {
    id: 'E',
    wt: 20,
    param: 'Did you and your mentee complete the goals planned?',
    excellent: 'Extensively complete the goals planned',
    good: 'Completion of the goals planned level was Good',
    avg: 'Completion of the goals planned level was Average level only',
    acc: 'Completion of the goals planned level was Moderate level only',
    unac: 'Completion of the goals planned level was Minimal only',
  },
  {
    id: 'F',
    wt: 10,
    param: 'Overall Score Given by Mentor from his/her feedback',
    excellent: 'Extensively accepted',
    good: 'Acceptance level was Good',
    avg: 'Average level only',
    acc: 'Moderate level only',
    unac: 'Minimal only',
  },
]);

// Validation check at startup to ensure total rubric weight equals 100
const TOTAL_RUBRIC_WEIGHT = RUBRIC_CRITERIA.reduce((sum, item) => sum + item.wt, 0);
if (TOTAL_RUBRIC_WEIGHT !== 100) {
  throw new Error(`CRITICAL: Rubric criteria total weight must equal 100, received ${TOTAL_RUBRIC_WEIGHT}`);
}

// ── General Academic Constants ───────────────────────────────────────────────
const ACADEMIC_CONSTANTS = Object.freeze({
  TOTAL_SEMESTERS: 8,
  PARAMETER_COUNT: RUBRIC_CRITERIA.length,
  RUBRIC_TOTAL_WEIGHT: TOTAL_RUBRIC_WEIGHT,
  PHOTO_MAX_SIZE_BYTES: 100 * 1024, // 100KB max profile image
});

module.exports = {
  BRANCHES,
  BRANCH_CODES,
  SEMESTERS,
  SEMESTER_CODES,
  ACTIVITY_CATEGORIES,
  RUBRIC_CRITERIA,
  ACADEMIC_CONSTANTS,
};
