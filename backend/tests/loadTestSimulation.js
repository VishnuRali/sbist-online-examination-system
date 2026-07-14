import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:5001/api';

// Configurable target VUs via environment variables (defaulting to 200)
const TARGET_VUS = __ENV.VUS ? parseInt(__ENV.VUS, 10) : 200;

export const options = {
  stages: [
    { duration: '1m', target: TARGET_VUS }, // Ramp up login & start exam
    { duration: '5m', target: TARGET_VUS }, // Sustain autosave & monitor polling
    { duration: '30s', target: TARGET_VUS }, // Spike final submission
    { duration: '30s', target: 0 },         // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'], // 95% of requests must complete under 1.0s
    http_req_failed: ['rate<0.01'],    // Failure rate must be under 1%
  },
};

export function setup() {
  // Return mock tokens and settings for student login
  return {
    studentCredentials: Array.from({ length: 200 }, (_, i) => ({
      studentId: `SBIT${1000 + i}`,
      password: 'password123',
    })),
    examId: '60d5ec4f0f1b2c001f8e4a9d',
  };
}

export default function (data) {
  const vuIndex = __VU - 1;
  const creds = data.studentCredentials[vuIndex % data.studentCredentials.length];
  const examId = data.examId;

  // 1. Simultaneous student login
  const loginRes = http.post(`${BASE_URL}/auth/student/login`, JSON.stringify({
    loginId: creds.studentId,
    password: creds.password,
  }), { headers: { 'Content-Type': 'application/json' } });

  check(loginRes, {
    'login success (200)': (r) => r.status === 200,
    'has token': (r) => r.json().token !== undefined,
  });

  const token = loginRes.json().token;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  // Stagger start exam within a small window
  sleep(Math.random() * 5);

  // 2. Simultaneous exam start
  const startRes = http.post(`${BASE_URL}/student/exams/${examId}/start`, JSON.stringify({
    accessCode: '123456',
  }), { headers });

  check(startRes, {
    'start exam success (200)': (r) => r.status === 200,
    'has resultId': (r) => r.json().result !== undefined,
  });

  const resultId = startRes.json().result._id;

  // 3. Sustained autosaving with random edits
  const loopStartTime = Date.now();
  let lastState = { answers: {}, currentQuestion: 0 };
  let iteration = 0;

  while (Date.now() - loopStartTime < 300000) { // 5 minutes
    iteration++;
    // Simulate answer change on 20% of intervals (80% unchanged-state skipping)
    const changed = Math.random() < 0.2;
    const body = { resultId };

    if (changed) {
      const qId = `q${Math.floor(Math.random() * 5) + 1}`;
      const option = ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)];
      lastState.answers[qId] = option;
      lastState.currentQuestion = Math.floor(Math.random() * 5);

      body.answers = lastState.answers;
      body.currentQuestion = lastState.currentQuestion;
    } else {
      // Sending same payload will trigger client-side skipping, but load test
      // must hit the endpoint occasionally to simulate concurrent autosaves.
      // We stagger calls to simulate the subset of active editors.
    }

    if (changed || iteration % 6 === 0) { // Hit backend on changes or every 30s as heartbeat
      const saveRes = http.post(`${BASE_URL}/student/exams/save-progress`, JSON.stringify(body), { headers });
      check(saveRes, {
        'save progress success (200)': (r) => r.status === 200,
      });
    }

    // 4. Occasional Anti-Cheat violation reporting (1% chance per tick)
    if (Math.random() < 0.01) {
      const violationRes = http.post(`${BASE_URL}/student/exams/violation`, JSON.stringify({
        resultId,
        violationType: 'tab-switch',
      }), { headers });
      check(violationRes, {
        'violation reported': (r) => r.status === 200,
      });
    }

    // 5. Admin Live Monitor polling (poll every 5 seconds for VU #1 representing admin)
    if (__VU === 1) {
      const monitorRes = http.get(`${BASE_URL}/admin/live-monitor?examId=${examId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`, // Admin token mock
        }
      });
      check(monitorRes, {
        'live monitor success (200)': (r) => r.status === 200,
      });
    }

    sleep(5); // 5-second tick
  }

  // 6. Simultaneous final submission
  const submitRes = http.post(`${BASE_URL}/student/exams/submit`, JSON.stringify({
    resultId,
    answers: lastState.answers,
    reviewList: [],
  }), { headers });

  check(submitRes, {
    'submit exam success (200)': (r) => r.status === 200,
    'success field is true': (r) => r.json().success === true,
  });
}
