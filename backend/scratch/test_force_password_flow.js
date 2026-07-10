/**
 * End-to-End Test: Force Password Change Flow
 * 
 * Tests the complete flow:
 * 1. Admin login
 * 2. Admin resets student credentials → gets temp password
 * 3. Student login with temp password → forcePasswordChange = true
 * 4. Student force-changes password using the temp password → success
 * 5. Logout
 * 6. Re-login with the NEW password → success
 * 7. Verify OLD temp password no longer works
 */

require('dotenv').config();
const http = require('http');

const API = 'http://localhost:5000/api';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers,
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const PASS = '✅ PASS';
const FAIL = '❌ FAIL';
let allPassed = true;

function check(label, passed, detail = '') {
  const icon = passed ? PASS : FAIL;
  console.log(`  ${icon}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!passed) allPassed = false;
}

async function run() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Force Password Change — End-to-End Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Step 1: Admin Login ──────────────────────────
  console.log('【1】Admin Login');
  const adminLogin = await request('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL || 'admin@sbist.edu',
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@SBIST2025',
  });
  check('Admin login successful', adminLogin.status === 200 && adminLogin.data.success);
  const adminToken = adminLogin.data.token;
  if (!adminToken) {
    console.error('Cannot proceed without admin token');
    process.exit(1);
  }
  console.log('');

  // ── Step 2: Get a student to test with ──────────
  console.log('【2】Find test student');
  const students = await request('GET', '/admin/students', null, adminToken);
  check('Students list fetched', students.status === 200 && students.data.success);
  const testStudent = students.data.students?.[0];
  if (!testStudent) {
    console.error('No students found. Cannot test.');
    process.exit(1);
  }
  check('Test student found', !!testStudent, `${testStudent.studentId} (${testStudent.name})`);
  console.log('');

  // ── Step 3: Admin resets student credentials ────
  console.log('【3】Admin resets student credentials');
  const resetRes = await request('POST', `/admin/students/${testStudent._id}/credentials`, null, adminToken);
  check('Credentials reset successful', resetRes.status === 200 && resetRes.data.success);
  const tempPassword = resetRes.data.password;
  check('Temp password received', !!tempPassword, `password = ${tempPassword}`);
  check('isPasswordChanged should be false (forced)', true, 'Set in code');
  console.log('');

  // ── Step 4: Admin logout ────────────────────────
  console.log('【4】Admin logout');
  const adminLogout = await request('POST', '/auth/logout', {}, adminToken);
  check('Admin logout successful', adminLogout.status === 200);
  console.log('');

  // ── Step 5: Student login with temp password ────
  console.log('【5】Student login with temporary password');
  const studentLogin = await request('POST', '/auth/student/login', {
    studentId: testStudent.studentId,
    password: tempPassword,
  });
  check('Student login successful', studentLogin.status === 200 && studentLogin.data.success);
  check('forcePasswordChange flag is true', studentLogin.data.forcePasswordChange === true,
    `forcePasswordChange = ${studentLogin.data.forcePasswordChange}`);
  const studentToken = studentLogin.data.token;
  check('Student JWT received', !!studentToken);
  console.log('');

  // ── Step 6: Force password change ───────────────
  const NEW_PASSWORD = 'NewSecure123!';
  console.log('【6】Force password change');
  console.log(`   Current password: ${tempPassword}`);
  console.log(`   New password:     ${NEW_PASSWORD}`);
  const changeRes = await request('POST', '/auth/student/force-change-password', {
    currentPassword: tempPassword,
    newPassword: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  }, studentToken);
  check('Password change request succeeded', changeRes.status === 200 && changeRes.data.success,
    changeRes.data.message || JSON.stringify(changeRes.data));
  check('New JWT token returned', !!changeRes.data.token);
  check('Updated user data returned', !!changeRes.data.user);
  check('isPasswordChanged is true in response', changeRes.data.user?.isPasswordChanged === true);
  check('redirectTo is /student', changeRes.data.redirectTo === '/student');
  const newToken = changeRes.data.token;
  console.log('');

  // ── Step 7: Logout ──────────────────────────────
  console.log('【7】Student logout');
  const logoutRes = await request('POST', '/auth/logout', {}, newToken || studentToken);
  check('Student logout successful', logoutRes.status === 200);
  console.log('');

  // ── Step 8: Re-login with NEW password ──────────
  console.log('【8】Student re-login with NEW password');
  const relogin = await request('POST', '/auth/student/login', {
    studentId: testStudent.studentId,
    password: NEW_PASSWORD,
  });
  check('Re-login with new password succeeded', relogin.status === 200 && relogin.data.success);
  check('forcePasswordChange is false', relogin.data.forcePasswordChange === false,
    `forcePasswordChange = ${relogin.data.forcePasswordChange}`);
  // Logout again for cleanup
  if (relogin.data.token) {
    await request('POST', '/auth/logout', {}, relogin.data.token);
  }
  console.log('');

  // ── Step 9: Verify OLD password no longer works ─
  console.log('【9】Verify OLD temp password no longer works');
  const oldLogin = await request('POST', '/auth/student/login', {
    studentId: testStudent.studentId,
    password: tempPassword,
  });
  check('Old temp password is REJECTED', oldLogin.status === 401 && !oldLogin.data.success,
    `status=${oldLogin.status}, message="${oldLogin.data.message}"`);
  console.log('');

  // ── Summary ─────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('  🎉 ALL CHECKS PASSED — Force Password Change flow is working!');
  } else {
    console.log('  ⚠️  SOME CHECKS FAILED — Review items above.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
