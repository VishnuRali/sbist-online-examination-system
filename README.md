# 🎓 SBIST Online Examination System

A full-stack, production-ready online examination platform built for **Swarna Bharathi Institute of Science and Technology (SBIST)**. Supports automated student registration via Google Forms, secure proctored exams with violation tracking, real-time admin dashboards, and automated credential delivery via email.

---

## ✨ Features

### 👨‍🎓 Student Portal
- **Secure Login** — Student ID + password only (no roll number login)
- **Exam Dashboard** — View upcoming, active, and completed exams filtered by department, year, semester, and section
- **Proctored Exams** — Tab-switch & fullscreen violation detection with configurable max violations
- **Auto-Submit** — Exam auto-submits on time expiry or max violations reached
- **Result Viewing** — View scores, grade, pass/fail status, and download PDF result
- **Randomization** — Questions and options can be randomized per exam

### 🛠️ Admin Panel
- **Dashboard** — Live analytics: total students, active exams, email stats, pass rates, charts
- **Exam Manager** — Create/edit exams with department, year, semester, and section targeting
- **Question Manager** — Add questions manually or bulk upload via Excel (.xlsx)
- **Student Manager** — View/search students, reset credentials, activate/deactivate accounts, export to Excel
- **Google Form Sync** — Manual and automatic (every 5 min) sync of student registrations from Google Sheets
- **Result Manager** — View all exam results, force-submit active students, export results as Excel/CSV/PDF
- **Department & Subject Manager** — Full CRUD for departments and subjects
- **Email Logs** — Track welcome email delivery status per student
- **System Settings** — Configure Gmail SMTP, Google Sheets API credentials, and exam portal URL via UI

### 🔐 Super Admin
- Create/manage admins with role-based access (Admin vs. Super Admin)
- Reset admin passwords, view activity logs
- Full access to all settings

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 |
| **Backend** | Node.js, Express 4, MongoDB Atlas, Mongoose 8 |
| **Authentication** | JWT (JSON Web Tokens), bcryptjs |
| **Email** | Nodemailer (Gmail SMTP + App Password) |
| **Google Integration** | Google Sheets API v4, Service Account |
| **File Processing** | ExcelJS (Excel export), PDFKit (PDF results), Multer (uploads) |
| **Security** | Helmet, express-rate-limit, CORS |
| **Scheduling** | node-cron (automatic Google Form sync every 5 minutes) |

---

## 📁 Project Structure

```
sbist-online-examination-system/
├── backend/                    # Express API server
│   ├── controllers/            # Route handlers
│   ├── jobs/                   # Cron jobs (Google Form sync, email reminders)
│   ├── middleware/             # JWT auth middleware
│   ├── models/                 # Mongoose schemas
│   ├── routes/                 # Express routes
│   ├── utils/                  # Helpers (email, Google Sheets, ID generation)
│   ├── seed-admin.js           # DB reset & Super Admin seed script
│   ├── verify-system.js        # Pre-flight system verification script
│   ├── server.js               # App entry point
│   └── .env.example            # Environment variable template
├── frontend/                   # React + Vite SPA
│   ├── src/
│   │   ├── components/         # Shared UI components
│   │   ├── pages/
│   │   │   ├── admin/          # Admin pages
│   │   │   ├── auth/           # Login page
│   │   │   └── student/        # Student exam pages
│   │   └── utils/              # API client, helpers
│   └── .env.example            # Frontend environment template
├── package.json                # Root scripts (run both servers concurrently)
└── README.md
```

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas account
- Gmail account with App Password enabled
- Google Cloud project with Sheets API enabled + Service Account

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/sbist-online-examination-system.git
cd sbist-online-examination-system
```

### 2. Configure Backend

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your values:

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/sbist_exam
JWT_SECRET=your_strong_random_secret
SUPER_ADMIN_EMAIL=admin@yourdomain.edu
SUPER_ADMIN_PASSWORD=YourSecurePassword123!
SUPER_ADMIN_EMPLOYEE_ID=SUPERADMIN
GMAIL_USER=notifications@yourdomain.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
GOOGLE_SHEET_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
```

### 3. Configure Frontend

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

### 4. Install Dependencies

```bash
# From the project root
cd backend && npm install
cd ../frontend && npm install
```

### 5. Seed the Database

```bash
cd backend
node seed-admin.js
```

This will:
- Wipe all existing data
- Seed 7 departments (CSE, CSE AI&ML, CSE DS, ECE, EEE, MECH, CIVIL)
- Create the Super Admin with your `.env` credentials
- Verify bcrypt hash matches before exiting

### 6. Verify System

```bash
node verify-system.js
```

### 7. Start the Application

```bash
# From the project root — runs both servers concurrently
npm run dev

# Or start separately:
npm run backend   # Express API on port 5000
npm run frontend  # Vite dev server on port 5173
```

---

## ⚙️ Configuration

### Google Form Setup

Create a Google Form titled **"SBIST Online Examination Registration"** with these fields in order:

| Column | Field | Type |
|--------|-------|------|
| B | Student Name | Short Answer |
| C | Email Address | Email |
| D | Roll Number | Short Answer |
| E | Phone Number | Short Answer |
| F | Department | Dropdown (CSE / CSE (AI & ML) / CSE (DS) / ECE / EEE / MECH / CIVIL) |
| G | Year | Dropdown (1 / 2 / 3 / 4) |
| H | Semester | Dropdown (1 / 2) |
| I | Section | Dropdown (A / B / C) |
| J | Academic Year | Short Answer (e.g. 2025-26) |
| K | Sync Status | *(Written by the app — leave empty)* |

Link the form to a Google Spreadsheet. Share the spreadsheet with your Service Account email (with Editor access).

### Gmail App Password

1. Enable 2-Factor Authentication on your Gmail account
2. Go to **Google Account → Security → App Passwords**
3. Generate a 16-character app password
4. Add it to `GMAIL_APP_PASSWORD` in `backend/.env`

---

## 📸 Screenshots

> *(Add screenshots of your deployed system here)*

| Admin Dashboard | Exam Manager | Student Exam |
|---|---|---|
| ![Dashboard](screenshots/dashboard.png) | ![Exams](screenshots/exams.png) | ![Student](screenshots/student.png) |

---

## 🚢 Deployment Guide

### Backend — Deploy to Railway / Render / VPS

1. Push backend to a platform (Railway, Render, etc.)
2. Add all environment variables from `.env.example`
3. Set `NODE_ENV=production`
4. Set `FRONTEND_URL` to your production frontend URL
5. MongoDB Atlas: whitelist the deployment server's IP (or use `0.0.0.0/0`)

### Frontend — Deploy to Vercel / Netlify

1. Set `VITE_API_URL` to your production backend URL (e.g. `https://api.yourdomain.com/api`)
2. Deploy the `frontend/` directory

### After Deployment

```bash
# Run seed script once on your production server:
node seed-admin.js
```

---

## 🔒 Security Notes

- `.env` files are **never committed** to version control
- All passwords are bcrypt-hashed (cost factor 12)
- JWT tokens expire after 24 hours
- Admin routes are protected by role-based middleware
- Rate limiting is applied to all API routes
- Helmet.js sets secure HTTP headers
- Student login is restricted to Student ID only (no roll number bypass)

---

## 📋 Available Scripts

### Root
| Command | Description |
|---|---|
| `npm run dev` | Start both backend and frontend concurrently |
| `npm run backend` | Start backend only |
| `npm run frontend` | Start frontend only |

### Backend
| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start production server |
| `node seed-admin.js` | Reset DB and create Super Admin |
| `node verify-system.js` | Verify all system checks |

### Frontend
| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## 📄 License

This project is proprietary software developed for **Swarna Bharathi Institute of Science and Technology**.  
All rights reserved © 2025 SBIST.

---

## 👨‍💻 Developed By

Built with ❤️ for the SBIST Examination Department.
