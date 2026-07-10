require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fetch = global.fetch;

const BASE_URL = 'http://127.0.0.1:5000/api';

const run = async () => {
  // First, verify student is rate limited (should be)
  const studentRes = await fetch(`${BASE_URL}/auth/student/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId: 'SBIST20260002', password: 'Test1234!' })
  });
  const studentData = await studentRes.json();
  console.log('STUDENT LOGIN status:', studentRes.status, studentData);

  // Now, try admin login
  const adminRes = await fetch(`${BASE_URL}/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sbist.edu', password: 'wrongpassword' })
  });
  const adminData = await adminRes.json();
  console.log('ADMIN LOGIN status:', adminRes.status, adminData);
  
  process.exit(0);
};

run().catch(console.error);
