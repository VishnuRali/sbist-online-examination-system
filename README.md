# SBIT Online Examination System

A full-stack online examination platform developed for **Swarna Bharathi Institute of Science and Technology**.

The system helps faculty create and manage examinations, assign exams to selected student groups, monitor ongoing exams, automate notifications, and manage results from a centralized admin panel. Students can securely attend exams through a dedicated portal with automatic answer saving and anti-cheating controls.

## Project Overview

The SBIT Online Examination System was developed to simplify the examination process for both faculty and students.

The platform provides separate interfaces for administrators and students. Administrators can manage students, subjects, departments, examinations, questions, notifications, and results. Students can view assigned exams, enter an access code, attend exams, and view their results.

## Main Features

### Student Portal

- Login using Student ID or Roll Number
- Secure password authentication
- View upcoming, active, and completed exams
- Access-code verification before starting an exam
- Timed examinations
- Automatic answer saving
- Mark questions for review
- Resume an interrupted exam
- View results after publication
- Download examination results

### Admin Portal

- Dashboard with examination statistics
- Create, edit, publish, and manage exams
- Assign exams by department, year, semester, and section
- Add questions manually
- Import questions using Excel files
- Manage departments and subjects
- Manage student accounts
- Search and filter student records
- Activate or deactivate student accounts
- Monitor ongoing examinations
- View and export examination results
- Manage email notifications and delivery logs
- Configure examination settings

### Examination Security

The examination interface includes several controls to support fair examination practices:

- Question-order randomization
- Answer-option randomization
- Fullscreen monitoring
- Browser tab-switch detection
- Window focus-loss detection
- Copy, cut, and paste blocking
- Right-click blocking
- Text-selection blocking
- Restricted browser and developer-tool shortcuts
- Multiple exam-tab detection
- Configurable violation limits
- Automatic submission after the maximum violation limit
- Detailed violation history with timestamps
- Automatic submission when examination time expires

## Additional Features

- Student registration synchronization through Google Forms and Google Sheets
- Automated student credential emails
- Examination publication notifications
- Examination reminder emails
- Email delivery logs and retry support
- Single-subject and multi-subject examinations
- Section-wise student assignment
- Result analytics and report exports
- Role-based administration

## Technology Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | JWT, bcryptjs |
| Email | Brevo SMTP, Nodemailer |
| Integrations | Google Sheets API |
| Charts | Chart.js |
| Deployment | Vercel (frontend), Render (backend) |

## Project Structure

```
sbist-online-examination-system/
├── backend/
│   ├── controllers/
│   ├── jobs/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   └── server.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   └── student/
│   │   └── utils/
│   └── public/
│
├── package.json
└── README.md
```

## Local Setup

### Prerequisites

Install the following before running the project:

- Node.js 18 or later
- npm
- MongoDB Atlas account

### 1. Clone the repository

```bash
git clone https://github.com/VishnuRali/sbist-online-examination-system.git
cd sbist-online-examination-system
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

Create a `.env` file inside the `backend` folder and configure the required environment variables.

### 3. Install frontend dependencies

```bash
cd ../frontend
npm install
```

Create a `.env` file inside the `frontend` folder:

```
VITE_API_URL=http://localhost:5000/api
```

### 4. Run the application

Start the backend:

```bash
cd backend
npm run dev
```

Open another terminal and start the frontend:

```bash
cd frontend
npm run dev
```

The frontend will normally run at `http://localhost:5173`.

## Environment Variables

Sensitive credentials must be stored in environment variables and must not be committed to GitHub.

Important backend configuration includes:

```
MONGODB_URI=
JWT_SECRET=
FRONTEND_URL=
BREVO_SMTP_USER=
BREVO_SMTP_KEY=
GOOGLE_SHEET_ID=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
```

Use the environment example files in the project as a reference for the complete configuration.

## Deployment

**Backend — Render**
1. Create a new Web Service on Render and connect it to this repository, root directory `backend`
2. Add all environment variables listed above in the Render dashboard
3. Set the build command to `npm install` and the start command to `npm start`
4. In MongoDB Atlas, whitelist Render's outbound IPs (or allow `0.0.0.0/0`)

**Frontend — Vercel**
1. Import the repository into Vercel, set the root directory to `frontend`
2. Add `VITE_API_URL` pointing to your live Render backend URL (e.g. `https://your-app.onrender.com/api`)
3. Deploy — Vercel auto-builds on every push to `main`

After deploying, update `FRONTEND_URL` on Render to your Vercel domain so CORS and email links resolve correctly.

## Current Status

The major student, administrator, examination, monitoring, notification, and result-management modules are implemented.

The system is currently undergoing final testing and reliability improvements before institutional deployment.

Planned improvements include:

- Student identity watermark during examinations
- Improved offline and reconnection handling
- Enhanced online/offline monitoring
- Additional examination security reports
- Performance and concurrent-user testing

## Security

- Passwords are securely hashed before storage
- Authentication is handled using JSON Web Tokens
- Protected routes use role-based authorization
- Student sessions are validated by the backend
- API rate limiting and secure HTTP headers are enabled
- Examination violations are recorded with timestamps
- Sensitive credentials are stored outside the source code

## Developer

**Rali Vishnu Vardhan**
B.Tech — Computer Science and Engineering
Swarna Bharathi Institute of Science and Technology

GitHub: [VishnuRali](https://github.com/VishnuRali)

## License

This project was developed for academic and institutional use at Swarna Bharathi Institute of Science and Technology.

All rights reserved.
