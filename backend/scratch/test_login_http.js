require('dotenv').config();
const fetch = global.fetch;
const BASE_URL = 'http://127.0.0.1:5000/api/auth';

const login = async (path, body) => {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log(`REQUEST ${path} => ${res.status}`);
  console.log(JSON.stringify(data, null, 2));
  return res.status;
};

(async () => {
  try {
    console.log('Testing admin login...');
    await login('/admin/login', {
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    });
    console.log('Testing student login...');
    await login('/student/login', {
      studentId: 'RATE_LIMIT_TEST_2026',
      password: 'Test1234!'
    });
  } catch (err) {
    console.error('HTTP TEST ERROR', err);
    process.exit(1);
  }
})();
