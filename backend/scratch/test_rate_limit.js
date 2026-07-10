require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const fetch = global.fetch;

const BASE_URL = 'http://127.0.0.1:5000/api';

const run = async () => {
  console.log('Sending login requests to see rate limiter behavior...');
  
  // Send 220 login requests in parallel/quick succession
  const promises = [];
  for (let i = 1; i <= 220; i++) {
    promises.push(
      fetch(`${BASE_URL}/auth/student/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: 'SBIST20260002', password: 'wrongpassword' })
      }).then(async res => {
        const data = await res.json();
        return { index: i, status: res.status, message: data.message || data };
      })
    );
  }

  const results = await Promise.all(promises);
  for (const r of results) {
    console.log(`Req ${r.index}: status = ${r.status}, message = ${JSON.stringify(r.message)}`);
  }
  
  process.exit(0);
};

run().catch(console.error);
