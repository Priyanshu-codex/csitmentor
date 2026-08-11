# Bug Fixes Applied

## Summary of All Issues Fixed

### 1. `routes/records.js` — `resolveStudentId` crashes on non-'me' string (CRITICAL)

**Bug:** When a mentor or admin called an endpoint with `/:studentId` where the ID was 
not `'me'` but was also not a valid MongoDB ObjectId (e.g. a typo, or a mentor 
accidentally calling `/api/records/me/personal`), Mongoose would throw a `CastError` 
and crash the request with a 500.

**Fix:** Added `mongoose.Types.ObjectId.isValid()` check. Returns `null` for invalid 
IDs; callers respond with a clean `400 Bad Request`.

---

### 2. `routes/records.js` — No input validation on `PATCH /:studentId/:section`

**Bug:** The section update handler accepted requests with no `data` field in the body,
silently setting the section to `undefined` and potentially corrupting the document.

**Fix:** Added an explicit check: `if (req.body.data === undefined)` → `400` error.

---

### 3. `routes/records.js` — `assign-mentor` missing `mentorId` validation

**Bug:** The assign-mentor endpoint didn't validate that `mentorId` was present or was a 
valid ObjectId, causing a Mongoose error if it was missing/invalid.

**Fix:** Added presence and `isValid()` checks for both `studentId` and `mentorId`.

---

### 4. `routes/mentorProfile.js` — GET endpoint had no authorization (SECURITY)

**Bug:** Any authenticated user (including students) could `GET /api/mentor-profile/:anyId`
and read any mentor's profile. No role or ownership check existed.

**Fix:** Students are blocked with `403`. Mentors can only read their own profile. 
Admins can read any profile.

---

### 5. `routes/mentorProfile.js` — Missing input validation on PATCH

**Bug:** The PATCH handler didn't check if `req.body.profile` was present, so calling 
it with an empty body would overwrite the profile with `undefined`.

**Fix:** Added `if (req.body.profile === undefined)` → `400` error.

---

### 6. `routes/mentorProfile.js` — No `mongoose` import / no ObjectId validation

**Bug:** Invalid mentor IDs passed to the route would cause Mongoose CastErrors.

**Fix:** Added `mongoose` import and `ObjectId.isValid()` guard via `resolveMentorId()`.

---

### 7. `routes/users.js` — Students couldn't view their own user profile (UX BUG)

**Bug:** `GET /api/users/:id` was guarded by `authorize('admin', 'mentor')`, so students 
had no way to fetch their own user info.

**Fix:** Added `GET /api/users/me` (declared before `/:id`) that returns `req.user` for 
any authenticated role.

---

### 8. `routes/users.js` — PATCH with empty body returned confusing 200

**Bug:** Calling `PATCH /api/users/:id` with an empty body (no valid fields) returned 
a 200 success with no changes made.

**Fix:** Added check: if `updates` is empty after filtering → `400 Bad Request`.

---

### 9. `routes/users.js` — Duplicate email on update not caught

**Bug:** The `catch` block in PATCH didn't handle Mongoose `11000` duplicate key errors,
returning a generic 500 instead of a meaningful 409.

**Fix:** Added `err.code === 11000` handling returning `409 Conflict`.

---

### 10. `routes/auth.js` — `GET /api/auth/test-email` was unauthenticated (CRITICAL SECURITY)

**Bug:** The test-email endpoint had no authentication or authorization guard.  
Any unauthenticated user could `GET /api/auth/test-email` to trigger SMTP calls,
wasting Brevo credits and potentially revealing server configuration.

**Fix:** Added `protect, authorize('admin')` middleware to the route handler.

---

### 11. `config/mail.js` — Developer's personal Gmail hardcoded as `fromEmail` fallback (SECURITY / PII)

**Bug:** `fromEmail: process.env.MAIL_FROM || 'priyanshumahobia22@gmail.com'`  
If `MAIL_FROM` env var was not set in production, all outgoing emails (including
password reset emails) would appear to come from the developer's personal address.

**Fix:** Replaced fallback with `noreply@csitdurg.in` (the institutional address).

---

### 12. `scripts/seed.js` — Hardcoded default admin password `Admin@2024` (SECURITY)

**Bug:** `password: process.env.ADMIN_PASSWORD || 'Admin@2024'`  
If `ADMIN_PASSWORD` was missing from `.env`, the seed script would silently create
an admin account with a well-known default password, with no warning.

**Fix:** Added a fail-fast guard:
```js
if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_PASSWORD.trim()) {
  console.error('❌ CRITICAL: ADMIN_PASSWORD environment variable is required.');
  process.exit(1);
}
```

---

### 13. `routes/records.js` — Oversized base64 photo bypassed schema validator (CORRECTNESS)

**Bug:** The `PATCH /:studentId/:section` handler wrote data to the database before
Mongoose schema validators ran. A large base64 `photoUrl` (>150KB) could be stored
to the DB if the JSON body parser accepted it, bypassing the Mongoose model validator.

**Fix:** Added an explicit pre-DB size check:
```js
if (section === 'personal' && req.body.data?.photoUrl?.length > 150000) {
  return res.status(400).json({ ... });
}
```

---

### 14. `routes/users.js` — N+1 database queries in deactivated-users list (PERFORMANCE)

**Bug:** The `GET /api/users/admin/deactivated-users` route looped over every deactivated
user and issued one separate `findOne()` database call per user to fetch their
student/mentor record — O(n) database round-trips.

**Fix:** Replaced sequential per-user `findOne()` calls with a single batched
`Promise.all()` using `$in` queries, then used an in-memory `Map` for O(1) lookups.
Response structure is identical; only performance changed.

---

### 15. `config/constants.js` — NEW: Centralized configuration constants (MAINTAINABILITY)

**Addition:** Created `config/constants.js` as the single source of truth for:
- `BRANCHES` — 7 branch definitions including AIDS  
- `SEMESTERS` — Semesters 1–8  
- `ACTIVITY_CATEGORIES` — Academic, Co-Curricular, Extra-Curricular, Sports, Technical  
- `RUBRIC_CRITERIA` — 6 parameters (A–F, total weight = 100, verified at startup)  
- `ACADEMIC_CONSTANTS` — Photo max size, semester count, rubric weight  

Includes a startup-time assertion: if the rubric weights don't sum to 100, the module
throws immediately so misconfigurations are caught before the server accepts requests.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your .env file
cp .env.example .env
# Edit .env — set MONGO_URI, JWT_SECRET, etc.

# 3. Seed the first admin account
npm run seed

# 4. Start the dev server
npm run dev
```

## API Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | /api/auth/register | Public | Register new user |
| POST | /api/auth/login | Public | Login |
| GET | /api/auth/me | Any auth | Get current user |
| POST | /api/auth/logout | Any auth | Logout |
| GET | /api/users | Admin | List all users |
| GET | /api/users/me | Any auth | Get own user profile |
| GET | /api/users/:id | Admin/Mentor | Get user by ID |
| PATCH | /api/users/:id | Self/Admin | Update user |
| DELETE | /api/users/:id | Admin | Deactivate user |
| GET | /api/records | Admin/Mentor | List records |
| GET | /api/records/:studentId | Any auth | Get student record |
| PATCH | /api/records/:studentId/assign-mentor | Admin | Assign mentor |
| PATCH | /api/records/:studentId/:section | Role-based | Update section |
| GET | /api/mentor-profile/:mentorId | Mentor(own)/Admin | Get mentor profile |
| PATCH | /api/mentor-profile/:mentorId | Mentor(own)/Admin | Update mentor profile |
