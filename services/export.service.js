const ExcelJS = require('exceljs');

// ── Theme & Styling Constants ────────────────────────────────────────────────
const PALETTE = {
  navy: '1B2A4A',       // Primary Header Fill (#1B2A4A)
  gold: 'D4AF37',       // Accent Gold
  headerText: 'FFFFFF', // White text for headers
  borderLight: 'E2E8F0',// Subtle border
  zebraRow: 'F8FAFC',   // Light striping
  textDark: '1E293B',   // Dark Slate text
};

// ── Date Formatting Helpers (Indian Standard DD-MM-YYYY) ─────────────────────
function formatDate(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) {
    // If it's already a clean string like "15/08/2023" or "2023-08-15"
    const s = String(val).trim();
    return s === 'Invalid Date' ? '' : s;
  }
  const pad = n => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatDateTime(val) {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}-${month}-${year} ${hours}:${minutes}`;
}

function clean(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number') return isNaN(val) ? '' : val;
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

// ── Backlog & Pass Helpers matching existing app logic ────────────────────────
function computeBacklogs(r) {
  const perf = r.performanceChart || [];
  const impr = r.improvementChart || [];
  let backlogs = 0;
  perf.forEach(fs => {
    if ((fs.performanceCategory || '').toUpperCase() !== 'FAIL') return;
    const cleared = impr.some(i =>
      (i.subject || '').toLowerCase() === (fs.subject || '').toLowerCase() &&
      (i.semester || '') === (fs.semester || '') &&
      (i.performanceCategory || '').toUpperCase() === 'PASS'
    );
    if (!cleared) backlogs++;
  });
  return backlogs;
}

function computePassCount(r) {
  return (r.performanceChart || [])
    .filter(s => (s.performanceCategory || '').toUpperCase() === 'PASS').length;
}

// ── Sheet Styler Helper ───────────────────────────────────────────────────────
function styleSheet(sheet, columns) {
  sheet.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 18,
  }));

  // Style Header Row
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PALETTE.navy },
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: PALETTE.headerText },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: PALETTE.navy } },
      left: { style: 'thin', color: { argb: '334155' } },
      bottom: { style: 'medium', color: { argb: PALETTE.gold } },
      right: { style: 'thin', color: { argb: '334155' } },
    };
  });

  // Freeze top row
  sheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' },
  ];

  // Auto filter across all columns
  if (columns.length > 0) {
    const lastColLetter = sheet.getColumn(columns.length).letter;
    sheet.autoFilter = `A1:${lastColLetter}1`;
  }
}

// ── Apply row styles & auto-adjust column widths ──────────────────────────────
function finalizeSheet(sheet, columns) {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Header already styled

    row.height = 20;
    const isEven = rowNumber % 2 === 0;

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colDef = columns[colNumber - 1];
      const align = colDef?.align || 'left';

      cell.font = {
        name: 'Calibri',
        size: 10,
        color: { argb: PALETTE.textDark },
      };

      cell.alignment = {
        vertical: 'middle',
        horizontal: align,
        wrapText: !!colDef?.wrap,
      };

      cell.border = {
        top: { style: 'thin', color: { argb: PALETTE.borderLight } },
        left: { style: 'thin', color: { argb: PALETTE.borderLight } },
        bottom: { style: 'thin', color: { argb: PALETTE.borderLight } },
        right: { style: 'thin', color: { argb: PALETTE.borderLight } },
      };

      if (isEven) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: PALETTE.zebraRow },
        };
      }
    });
  });

  // Adjust column width based on content if width wasn't hardcoded or needs padding
  columns.forEach((colDef, idx) => {
    const col = sheet.getColumn(idx + 1);
    let maxLen = (colDef.header || '').length;

    col.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
      if (rowNumber > 1 && cell.value) {
        const valStr = String(cell.value);
        if (!valStr.includes('\n')) {
          maxLen = Math.max(maxLen, valStr.length);
        }
      }
    });

    const targetWidth = Math.max(colDef.minWidth || 12, Math.min(colDef.maxWidth || 45, maxLen + 4));
    col.width = Math.max(col.width || 12, targetWidth);
  });
}

/**
 * Generate full TG Data Excel Workbook
 * @param {Array} records - Array of populated StudentRecord documents
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function generateTgWorkbook(records) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CSIT Mentor Diary — TG System';
  workbook.lastModifiedBy = 'Admin';
  workbook.created = new Date();
  workbook.modified = new Date();

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SHEET 1: TG Summary & Profiles
  // ─────────────────────────────────────────────────────────────────────────────
  // Detect any dynamic extra fields in personal across records (future-proofing)
  const standardPersonalKeys = new Set([
    'name', 'admissionNo', 'registrationNo', 'dateOfBirth', 'age',
    'bloodGroup', 'category', 'personalCell', 'residencePhone', 'email',
    'address', 'branch', 'currentSemester', 'certifications', 'hobbies',
    'photoUrl', '_id',
  ]);
  const extraPersonalKeys = new Set();
  records.forEach(r => {
    if (r.personal && typeof r.personal === 'object') {
      Object.keys(r.personal).forEach(k => {
        if (!standardPersonalKeys.has(k) && !k.startsWith('_') && typeof r.personal[k] !== 'function') {
          extraPersonalKeys.add(k);
        }
      });
    }
  });

  const sheet1Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Admission No', key: 'admNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Official Email', key: 'email', width: 26 },
    { header: 'Personal Email', key: 'personalEmail', width: 26 },
    { header: 'Mobile Number', key: 'mobile', width: 16, align: 'center' },
    { header: 'Residence Phone', key: 'resPhone', width: 16, align: 'center' },
    { header: 'Branch', key: 'branch', width: 14, align: 'center' },
    { header: 'Semester', key: 'semester', width: 12, align: 'center' },
    { header: 'Category', key: 'category', width: 12, align: 'center' },
    { header: 'Blood Group', key: 'bloodGroup', width: 12, align: 'center' },
    { header: 'Date of Birth', key: 'dob', width: 14, align: 'center' },
    { header: 'Age', key: 'age', width: 10, align: 'center' },
    { header: 'Address', key: 'address', width: 32, wrap: true },
    { header: 'Assigned Mentor / TG', key: 'mentorName', width: 24 },
    { header: 'Mentor Email', key: 'mentorEmail', width: 26 },
    { header: 'Subjects Recorded', key: 'subjectCount', width: 16, align: 'center' },
    { header: 'Passed Count', key: 'passedCount', width: 14, align: 'center' },
    { header: 'Backlog Count', key: 'backlogCount', width: 14, align: 'center' },
    { header: 'Academic Status', key: 'status', width: 18, align: 'center' },
    { header: 'Father Name', key: 'fatherName', width: 22 },
    { header: 'Father Mobile', key: 'fatherMobile', width: 16, align: 'center' },
    { header: 'Father Occupation', key: 'fatherOccupation', width: 18 },
    { header: 'Mother Name', key: 'motherName', width: 22 },
    { header: 'Mother Mobile', key: 'motherMobile', width: 16, align: 'center' },
    { header: 'Local Guardian', key: 'lgName', width: 20 },
    { header: 'LG Contact', key: 'lgContact', width: 16, align: 'center' },
    { header: 'Staying At', key: 'stayingAt', width: 16 },
    { header: 'Fees Paid By', key: 'feesPaidBy', width: 16 },
    { header: 'Certifications', key: 'certifications', width: 26, wrap: true },
    { header: 'Hobbies & Interests', key: 'hobbies', width: 26, wrap: true },
    { header: 'Account Status', key: 'accountStatus', width: 14, align: 'center' },
    { header: 'Record Created', key: 'createdAt', width: 18, align: 'center' },
    { header: 'Last Updated', key: 'updatedAt', width: 18, align: 'center' },
  ];

  // Append any extra dynamic personal fields
  extraPersonalKeys.forEach(extraKey => {
    const formattedHeader = extraKey
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase());
    sheet1Cols.push({
      header: formattedHeader,
      key: `extra_${extraKey}`,
      width: 18,
    });
  });

  const sheet1 = workbook.addWorksheet('TG Data');
  styleSheet(sheet1, sheet1Cols);

  records.forEach((r, idx) => {
    const s = r.student || {};
    const m = r.mentor || {};
    const p = r.personal || {};
    const f = r.family || {};

    const backlogs = computeBacklogs(r);
    const passed = computePassCount(r);
    const subjectCount = (r.performanceChart || []).length;
    const status = subjectCount === 0
      ? 'No Data'
      : (backlogs === 0 ? 'Cleared' : 'Backlog Pending');

    const rowData = {
      sNo: idx + 1,
      regNo: clean(p.registrationNo),
      admNo: clean(p.admissionNo),
      name: clean(p.name || s.name),
      email: clean(s.email),
      personalEmail: clean(p.email),
      mobile: clean(p.personalCell),
      resPhone: clean(p.residencePhone),
      branch: clean(p.branch),
      semester: clean(p.currentSemester),
      category: clean(p.category),
      bloodGroup: clean(p.bloodGroup),
      dob: formatDate(p.dateOfBirth),
      age: clean(p.age),
      address: clean(p.address),
      mentorName: clean(m.name || 'Unassigned'),
      mentorEmail: clean(m.email),
      subjectCount,
      passedCount: subjectCount > 0 ? passed : '',
      backlogCount: subjectCount > 0 ? backlogs : '',
      status,
      fatherName: clean(f.fatherName),
      fatherMobile: clean(f.fatherMobile),
      fatherOccupation: clean(f.fatherOccupation),
      motherName: clean(f.motherName),
      motherMobile: clean(f.motherMobile),
      lgName: clean(f.lgName),
      lgContact: clean(f.lgContact),
      stayingAt: clean(f.stayingAt),
      feesPaidBy: clean(f.feesPaidBy),
      certifications: clean(p.certifications),
      hobbies: clean(p.hobbies),
      accountStatus: s.isActive === false ? 'Deactivated' : 'Active',
      createdAt: formatDateTime(r.createdAt),
      updatedAt: formatDateTime(r.updatedAt),
    };

    extraPersonalKeys.forEach(extraKey => {
      rowData[`extra_${extraKey}`] = clean(p[extraKey]);
    });

    sheet1.addRow(rowData);
  });
  finalizeSheet(sheet1, sheet1Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. SHEET 2: Academic Details
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet2Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Branch', key: 'branch', width: 14, align: 'center' },
    { header: 'Semester', key: 'semester', width: 12, align: 'center' },
    { header: 'Exam Month/Year', key: 'monthYear', width: 16, align: 'center' },
    { header: 'Theory % / Marks', key: 'theoryMarks', width: 16, align: 'center' },
    { header: 'Practical %', key: 'practicalPct', width: 14, align: 'center' },
    { header: 'SPI', key: 'spi', width: 12, align: 'center' },
    { header: 'Backlogs', key: 'backlogs', width: 12, align: 'center' },
    { header: 'Attendance %', key: 'att', width: 14, align: 'center' },
    { header: 'TA %', key: 'ta', width: 12, align: 'center' },
    { header: 'Class Test 1', key: 'ct1', width: 14, align: 'center' },
    { header: 'Class Test 2', key: 'ct2', width: 14, align: 'center' },
  ];

  const sheet2 = workbook.addWorksheet('Academic Details');
  styleSheet(sheet2, sheet2Cols);

  let rowCounter2 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);
    const branch = clean(p.branch);

    (r.academicRecords || []).forEach(ar => {
      sheet2.addRow({
        sNo: rowCounter2++,
        regNo,
        name: studentName,
        branch,
        semester: clean(ar.semester),
        monthYear: clean(ar.monthYear),
        theoryMarks: clean(ar.theoryMarks),
        practicalPct: clean(ar.practicalPct),
        spi: clean(ar.spi),
        backlogs: clean(ar.backlogs),
        att: clean(ar.att),
        ta: clean(ar.ta),
        ct1: clean(ar.ct1),
        ct2: clean(ar.ct2),
      });
    });
  });
  finalizeSheet(sheet2, sheet2Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SHEET 3: Attendance & Subject Performance
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet3Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Branch', key: 'branch', width: 14, align: 'center' },
    { header: 'Chart Type', key: 'chartType', width: 16, align: 'center' },
    { header: 'Semester', key: 'semester', width: 12, align: 'center' },
    { header: 'Subject', key: 'subject', width: 24 },
    { header: 'Category (PASS/FAIL)', key: 'perfCategory', width: 20, align: 'center' },
    { header: 'Attendance %', key: 'attendance', width: 14, align: 'center' },
    { header: 'Class Test', key: 'classTest', width: 14, align: 'center' },
    { header: 'ESE', key: 'ese', width: 12, align: 'center' },
    { header: 'Presentations', key: 'presentations', width: 16, align: 'center' },
    { header: 'Date', key: 'date', width: 14, align: 'center' },
  ];

  const sheet3 = workbook.addWorksheet('Attendance & Performance');
  styleSheet(sheet3, sheet3Cols);

  let rowCounter3 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);
    const branch = clean(p.branch);

    (r.performanceChart || []).forEach(pc => {
      sheet3.addRow({
        sNo: rowCounter3++,
        regNo,
        name: studentName,
        branch,
        chartType: 'Performance',
        semester: clean(pc.semester),
        subject: clean(pc.subject),
        perfCategory: clean(pc.performanceCategory),
        attendance: clean(pc.attendance),
        classTest: clean(pc.classTest),
        ese: clean(pc.ese),
        presentations: clean(pc.presentations),
        date: formatDate(pc.date),
      });
    });

    (r.improvementChart || []).forEach(ic => {
      sheet3.addRow({
        sNo: rowCounter3++,
        regNo,
        name: studentName,
        branch,
        chartType: 'Improvement',
        semester: clean(ic.semester),
        subject: clean(ic.subject),
        perfCategory: clean(ic.performanceCategory),
        attendance: clean(ic.attendance),
        classTest: clean(ic.classTest),
        ese: clean(ic.ese),
        presentations: clean(ic.presentations),
        date: formatDate(ic.date),
      });
    });
  });
  finalizeSheet(sheet3, sheet3Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SHEET 4: Achievements & Prizes
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet4Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Category', key: 'category', width: 18 },
    { header: 'Activity / Competition', key: 'activity', width: 24 },
    { header: 'Institution / Venue', key: 'institution', width: 24 },
    { header: 'Prize / Position', key: 'prize', width: 20 },
    { header: 'Level', key: 'level', width: 14, align: 'center' },
    { header: 'Achievement Details', key: 'achievement', width: 24, wrap: true },
    { header: 'Year', key: 'year', width: 10, align: 'center' },
  ];

  const sheet4 = workbook.addWorksheet('Achievements');
  styleSheet(sheet4, sheet4Cols);

  let rowCounter4 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);

    (r.prizes || []).forEach(pz => {
      sheet4.addRow({
        sNo: rowCounter4++,
        regNo,
        name: studentName,
        category: clean(pz.category || pz.type),
        activity: clean(pz.activity || pz.activityName),
        institution: clean(pz.institution),
        prize: clean(pz.prize),
        level: clean(pz.level),
        achievement: clean(pz.achievement),
        year: clean(pz.year),
      });
    });
  });
  finalizeSheet(sheet4, sheet4Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. SHEET 5: Participation & Co-Curricular
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet5Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Semester', key: 'semester', width: 12, align: 'center' },
    { header: 'Date', key: 'date', width: 14, align: 'center' },
    { header: 'Event Type', key: 'type', width: 18 },
    { header: 'Title / Event Name', key: 'title', width: 26 },
    { header: 'Venue', key: 'venue', width: 18 },
    { header: 'Organizer', key: 'organizer', width: 22 },
    { header: 'Award / Position', key: 'award', width: 20 },
    { header: 'Details / Remarks', key: 'details', width: 28, wrap: true },
  ];

  const sheet5 = workbook.addWorksheet('Participation');
  styleSheet(sheet5, sheet5Cols);

  let rowCounter5 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);

    (r.participationRecords || []).forEach(pr => {
      sheet5.addRow({
        sNo: rowCounter5++,
        regNo,
        name: studentName,
        semester: clean(pr.semester),
        date: formatDate(pr.date),
        type: clean(pr.type),
        title: clean(pr.title || pr.activityName),
        venue: clean(pr.venue),
        organizer: clean(pr.organizer),
        award: clean(pr.award || pr.achievement),
        details: clean(pr.details || pr.remarks),
      });
    });
  });
  finalizeSheet(sheet5, sheet5Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SHEET 6: Remarks & Counseling Interactions
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet6Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Mentor / TG', key: 'mentorName', width: 22 },
    { header: 'Meeting Date', key: 'date', width: 14, align: 'center' },
    { header: 'Issue Discussed', key: 'issueDiscussed', width: 32, wrap: true },
    { header: 'TG Remarks / Advice', key: 'tgRemarks', width: 32, wrap: true },
    { header: 'Follow-up Date', key: 'followUpDate', width: 14, align: 'center' },
    { header: 'Follow-up Remarks', key: 'followUpRemark', width: 30, wrap: true },
  ];

  const sheet6 = workbook.addWorksheet('Remarks & Interactions');
  styleSheet(sheet6, sheet6Cols);

  let rowCounter6 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const m = r.mentor || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);
    const mentorName = clean(m.name || 'Unassigned');

    (r.interactionRecords || []).forEach(ir => {
      sheet6.addRow({
        sNo: rowCounter6++,
        regNo,
        name: studentName,
        mentorName,
        date: formatDate(ir.date),
        issueDiscussed: clean(ir.issueDiscussed),
        tgRemarks: clean(ir.tgRemarks),
        followUpDate: formatDate(ir.followUpDate),
        followUpRemark: clean(ir.followUpRemark),
      });
    });
  });
  finalizeSheet(sheet6, sheet6Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. SHEET 7: Overall Evaluation & Scores
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet7Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Semester', key: 'semester', width: 12, align: 'center' },
    { header: 'Regular Approach (A - 30)', key: 'scoreA', width: 18, align: 'center' },
    { header: 'Accepts Advice (B - 20)', key: 'scoreB', width: 18, align: 'center' },
    { header: 'Accepts Feedback (C - 10)', key: 'scoreC', width: 18, align: 'center' },
    { header: 'Exhibits Integrity (D - 10)', key: 'scoreD', width: 18, align: 'center' },
    { header: 'Completed Goals (E - 20)', key: 'scoreE', width: 18, align: 'center' },
    { header: 'Mentor Rating (F - 10)', key: 'scoreF', width: 18, align: 'center' },
    { header: 'Total Score (/100)', key: 'total', width: 16, align: 'center' },
    { header: 'Performance Rating', key: 'performance', width: 20, align: 'center' },
  ];

  const sheet7 = workbook.addWorksheet('Overall Scores');
  styleSheet(sheet7, sheet7Cols);

  let rowCounter7 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);

    (r.overallScores || []).forEach(sc => {
      sheet7.addRow({
        sNo: rowCounter7++,
        regNo,
        name: studentName,
        semester: clean(sc.semester),
        scoreA: clean(sc.A),
        scoreB: clean(sc.B),
        scoreC: clean(sc.C),
        scoreD: clean(sc.D),
        scoreE: clean(sc.E),
        scoreF: clean(sc.F),
        total: clean(sc.total),
        performance: clean(sc.performance),
      });
    });
  });
  finalizeSheet(sheet7, sheet7Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. SHEET 8: Academic Credentials (10th/12th/Diploma)
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet8Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Examination', key: 'exam', width: 20 },
    { header: 'School / College', key: 'school', width: 28 },
    { header: 'Board / University', key: 'board', width: 24 },
    { header: 'Medium', key: 'medium', width: 14, align: 'center' },
    { header: 'Passing Year', key: 'year', width: 14, align: 'center' },
    { header: 'Percentage / CGPA', key: 'percentage', width: 18, align: 'center' },
    { header: 'Division', key: 'division', width: 14, align: 'center' },
  ];

  const sheet8 = workbook.addWorksheet('Academic Credentials');
  styleSheet(sheet8, sheet8Cols);

  let rowCounter8 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);

    (r.academicCredentials || []).forEach(ac => {
      sheet8.addRow({
        sNo: rowCounter8++,
        regNo,
        name: studentName,
        exam: clean(ac.examination),
        school: clean(ac.school),
        board: clean(ac.board),
        medium: clean(ac.medium),
        year: clean(ac.year || ac.passingYear),
        percentage: clean(ac.percentage),
        division: clean(ac.division),
      });
    });
  });
  finalizeSheet(sheet8, sheet8Cols);

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. SHEET 9: Family & Guardian Profiles
  // ─────────────────────────────────────────────────────────────────────────────
  const sheet9Cols = [
    { header: 'S.No', key: 'sNo', width: 8, align: 'center' },
    { header: 'TG / Reg No', key: 'regNo', width: 16, align: 'center' },
    { header: 'Student Name', key: 'name', width: 24 },
    { header: 'Father Name', key: 'fatherName', width: 22 },
    { header: 'Father Mobile', key: 'fatherMobile', width: 16, align: 'center' },
    { header: 'Father Occupation', key: 'fatherOccupation', width: 18 },
    { header: 'Father Education', key: 'fatherEducation', width: 18 },
    { header: 'Father Income (p.a.)', key: 'fatherIncome', width: 18, align: 'center' },
    { header: 'Mother Name', key: 'motherName', width: 22 },
    { header: 'Mother Mobile', key: 'motherMobile', width: 16, align: 'center' },
    { header: 'Mother Occupation', key: 'motherOccupation', width: 18 },
    { header: 'Mother Education', key: 'motherEducation', width: 18 },
    { header: 'Mother Income (p.a.)', key: 'motherIncome', width: 18, align: 'center' },
    { header: 'No. of Siblings', key: 'noOfSiblings', width: 14, align: 'center' },
    { header: 'Siblings Summary', key: 'siblings', width: 30, wrap: true },
    { header: 'Local Guardian Name', key: 'lgName', width: 22 },
    { header: 'LG Relationship', key: 'lgRelationship', width: 16 },
    { header: 'LG Contact', key: 'lgContact', width: 16, align: 'center' },
    { header: 'LG Address', key: 'lgAddress', width: 30, wrap: true },
    { header: 'Staying At', key: 'stayingAt', width: 16 },
    { header: 'Fees Paid By', key: 'feesPaidBy', width: 16 },
  ];

  const sheet9 = workbook.addWorksheet('Family & Guardians');
  styleSheet(sheet9, sheet9Cols);

  let rowCounter9 = 1;
  records.forEach(r => {
    const p = r.personal || {};
    const s = r.student || {};
    const f = r.family || {};
    const studentName = clean(p.name || s.name);
    const regNo = clean(p.registrationNo);

    const siblingsSummary = (f.siblings || []).map(sib => {
      const parts = [clean(sib.name), clean(sib.relationship), clean(sib.education), clean(sib.occupation)].filter(Boolean);
      return parts.join(' - ');
    }).join('; ');

    sheet9.addRow({
      sNo: rowCounter9++,
      regNo,
      name: studentName,
      fatherName: clean(f.fatherName),
      fatherMobile: clean(f.fatherMobile),
      fatherOccupation: clean(f.fatherOccupation),
      fatherEducation: clean(f.fatherEducation),
      fatherIncome: clean(f.fatherIncome),
      motherName: clean(f.motherName),
      motherMobile: clean(f.motherMobile),
      motherOccupation: clean(f.motherOccupation),
      motherEducation: clean(f.motherEducation),
      motherIncome: clean(f.motherIncome),
      noOfSiblings: clean(f.noOfSiblings),
      siblings: siblingsSummary,
      lgName: clean(f.lgName),
      lgRelationship: clean(f.lgRelationship),
      lgContact: clean(f.lgContact),
      lgAddress: clean(f.lgAddress),
      stayingAt: clean(f.stayingAt),
      feesPaidBy: clean(f.feesPaidBy),
    });
  });
  finalizeSheet(sheet9, sheet9Cols);

  return workbook;
}

/**
 * Generate formatted export filename with current Indian standard time (or server time)
 * Format: CSIT_Mentor_Diary_TG_Data_YYYY-MM-DD_HH-mm.xlsx
 */
function getExportFilename() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `CSIT_Mentor_Diary_TG_Data_${year}-${month}-${day}_${hours}-${minutes}.xlsx`;
}

module.exports = {
  generateTgWorkbook,
  getExportFilename,
  formatDate,
  formatDateTime,
};
