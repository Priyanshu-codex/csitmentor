# CSIT Mentor Diary — Backend

Teacher Guardian's Comprehensive Student Record System for Chhatrapati Shivaji Institute of Technology.

---

## Tech Stack

- **Runtime**: Node.js ≥ 18
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Auth**: JWT (httpOnly cookie + Bearer token)
- **Security**: Helmet, CORS, express-rate-limit, bcryptjs, trust proxy

---

## Project Structure

```
mentor-diary-backend/
├── config/
│   └── db.js                  # MongoDB connection (with retry logic)
├── middleware/
│   └── auth.js                # JWT protect + role-based authorize
├── models/
│   ├── User.js                # User schema (student / mentor / admin)
│   └── Record.js              # StudentRecord + MentorRecord schemas
├── public/
│   └── mentor-diary.html      # Frontend SPA (served by Express in production)
├── routes/
│   ├── auth.js                # /api/auth  — register, login, me, logout
│   ├── users.js               # /api/users — CRUD
│   ├── records.js             # /api/records — student records
│   └── mentorProfile.js       # /api/mentor-profile
├── scripts/
│   └── seed.js                # One-time admin bootstrap
├── server.js                  # Express entry point
├── package.json
├── .env.example
└── .gitignore
```

---

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set MONGO_URI, JWT_SECRET, ADMIN_REGISTRATION_KEY
```

Generate a strong JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Seed the first admin

```bash
npm run seed
```

Creates `admin@csit.edu.in`. **Change the password immediately after first login.**

### 4. Start the server

```bash
npm run dev    # Development — nodemon auto-restart, opens on port 5000
npm start      # Production
```

### 5. Open the app

- **Dev**: Open `public/mentor-diary.html` directly in your browser
- **Production**: Visit `http://yourdomain.com` — the backend serves the HTML automatically

---

## API Reference

All routes prefixed with `/api`.

### Auth `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | None | Create account (`name`, `email`, `password`, `role`, optional `adminKey`) |
| POST | `/login` | None | Login → JWT + httpOnly cookie |
| GET | `/me` | Bearer | Current user |
| POST | `/logout` | Bearer | Clear cookie |

### Users `/api/users`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/` | admin | List all active users |
| GET | `/:id` | admin, mentor | Get single user |
| PATCH | `/:id` | self or admin | Update name/email; admin can also set role/isActive |
| DELETE | `/:id` | admin | Soft-delete (deactivate) |

### Records `/api/records`

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/` | admin, mentor | List all records (mentor: own students only) |
| GET | `/:studentId` | any | Full student record (`me` = self) |
| PATCH | `/:studentId/assign-mentor` | admin | Assign mentor to student |
| PATCH | `/:studentId/:section` | role-based | Update one section |

**Section write permissions:**

| Section | Student | Mentor | Admin |
|---------|:-------:|:------:|:-----:|
| personal, family, academicCredentials, prizes, academicRecords, participationRecords | ✓ | ✓ | ✓ |
| performanceChart, improvementChart, interactionRecords, overallScores | — | ✓ | ✓ |

### Mentor Profile `/api/mentor-profile`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:mentorId` | Get profile (`me` = self) |
| PATCH | `/:mentorId` | Update (self or admin only) |

### Health

```
GET /api/health  →  { "status": "ok", "timestamp": "..." }
```

---

## Roles

| Role | Access |
|------|--------|
| `student` | Own personal/academic data only |
| `mentor` | Assigned students + own mentor profile |
| `admin` | Full access — users, all records, mentor assignment |

---

## Security Features

- Passwords hashed with bcrypt (cost factor 12)
- JWT in httpOnly cookie (`sameSite: strict` in production)
- Login rate-limited: 10 attempts / 15 min / IP
- Global rate limit: 100 req / 15 min / IP
- `trust proxy` enabled for accurate IP rate-limiting behind Nginx/Caddy
- Helmet security headers
- CORS restricted to `ALLOWED_ORIGINS`
- MongoDB URI never logged
- `uncaughtException` / `unhandledRejection` handlers ensure clean crash + restart

---

## Production Deployment

### Option A — Single VPS (recommended for this project)

```bash
# 1. Clone / upload project to server
# 2. Set environment
cp .env.example .env
# Edit .env: NODE_ENV=production, real MONGO_URI, strong JWT_SECRET

# 3. Install & seed
npm install --omit=dev
npm run seed

# 4. Run with PM2
npm install -g pm2
pm2 start server.js --name csit-diary
pm2 save
pm2 startup   # auto-start on reboot
```

Then put **Nginx** in front:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Then get a free SSL certificate:
```bash
sudo certbot --nginx -d yourdomain.com
```

### Option B — Railway / Render / Fly.io (easiest)

1. Push to GitHub
2. Connect repo to Railway/Render
3. Set env vars in their dashboard
4. Deploy — done

### Option C — MongoDB Atlas

Use Atlas for the database in both options:
```
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/csit_mentor_diary
```
