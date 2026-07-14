# SWARNA BHARATHI INSTITUTE Online Examination System - k6 Load Test Plan

This document outlines the load testing strategy and script using `k6` to validate that the optimized system reliably supports 150–200 concurrent students taking a live timed exam simultaneously.

## Target Load Profile
- **Simultaneous Users**: 150-200 concurrent student virtual users (VUs).
- **Duration**: ~45 minutes (simulating a standard exam duration).
- **Phases**:
  1. **Login Spike**: All students log in within a 2-minute window.
  2. **Simultaneous Exam Start**: All students click "Start Exam" within a 15-second window.
  3. **Sustained Autosave**: Every VU posts to `/save-progress` exactly every 5 seconds.
  4. **Admin Live Monitor Polling**: Simulated admin VUs polling `/live-monitor` every 5 seconds.
  5. **Simultaneous Final Submission**: All students submit their exam within a 1-minute window at the end of the test.

---

## k6 Test Script (`load-test.js`)

Below is the complete `k6` script to execute this load profile.

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:5001/api'; // Update to target staging environment URL

export const options = {
  stages: [
    { duration: '2m', target: 200 },  // Ramp up to 200 concurrent student logins
    { duration: '10m', target: 200 }, // Sustain 200 concurrent exam-taking activity (autosave)
    { duration: '1m', target: 200 },  // Final submissions phase
    { duration: '1m', target: 0 },    // Ramp down/cooldown
  ],
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests must complete under 1.5s
    http_req_failed: ['rate<0.01'],    // Less than 1% of requests can fail
  },
};

// Setup: Load student credentials & prep exam
export function setup() {
  // Pre-seed 200 mock students and fetch their authentication credentials or tokens
  // Return list of credentials/tokens to share with VUs
  return {
    studentCredentials: Array.from({ length: 200 }, (_, i) => ({
      studentId: `SBIT${1000 + i}`,
      password: 'password123',
    })),
    examId: '60d5ec4f0f1b2c001f8e4a9d', // Target staging exam ID
  };
}

export default function (data) {
  const vuIndex = __VU - 1;
  const creds = data.studentCredentials[vuIndex % data.studentCredentials.length];
  const examId = data.examId;

  // 1. LOGIN PHASE
  let loginRes = http.post(`${BASE_URL}/auth/student/login`, JSON.stringify({
    loginId: creds.studentId,
    password: creds.password,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'has token': (r) => r.json().token !== undefined,
  });

  const token = loginRes.json().token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Sleep briefly to stagger Start Exam slightly
  sleep(Math.random() * 5);

  // 2. EXAM START
  let startRes = http.post(`${BASE_URL}/student/exams/${examId}/start`, JSON.stringify({
    accessCode: '123456',
  }), { headers });

  check(startRes, {
    'start exam is 200': (r) => r.status === 200,
    'has resultId': (r) => r.json().result !== undefined,
  });

  const resultId = startRes.json().result._id;

  // 3. SUSTAINED ACTIVITY & AUTOSAVE LOOP (Sustained for 10 minutes)
  const startTime = Date.now();
  const autosaveIntervalSec = 5;

  while (Date.now() - startTime < 600000) { // 10 minutes loop
    const randomOption = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
    const qId = `q${Math.floor(Math.random() * 5) + 1}`;

    let saveRes = http.post(`${BASE_URL}/student/exams/save-progress`, JSON.stringify({
      resultId,
      answers: { [qId]: randomOption },
      currentQuestion: Math.floor(Math.random() * 5),
      reviewList: [],
    }), { headers });

    check(saveRes, {
      'autosave status is 200': (r) => r.status === 200,
    });

    sleep(autosaveIntervalSec); // Strict 5s interval matching frontend autoSave
  }

  // 4. FINAL SUBMISSION
  let submitRes = http.post(`${BASE_URL}/student/exams/submit`, JSON.stringify({
    resultId,
    answers: {}, // final answers sent on submit
    reviewList: [],
  }), { headers });

  check(submitRes, {
    'final submission is 200': (r) => r.status === 200,
    'graded status exists': (r) => r.json().success === true,
  });
}
```

---

## Instructions for Execution
1. Install k6 locally on a testing node (non-production environment):
   ```bash
   # On macOS/Linux:
   brew install k6
   
   # On Windows:
   choco install k6
   ```
2. Run the load test using:
   ```bash
   k6 run load-test.js
   ```
3. Monitor Render backend CPU/Memory usage metrics and MongoDB Atlas connections & disk IOPS during the test execution.
