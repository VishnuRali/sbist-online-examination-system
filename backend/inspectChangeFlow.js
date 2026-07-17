const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://vv330418:SBIT12345@cluster0.vhpjegy.mongodb.net/sbist_exam?retryWrites=true&w=majority&appName=Cluster0';

// Import the actual model
const Student = require('./models/Student');

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const targetId = 'SBIT4CSE9255';
    const student = await Student.findOne({ studentId: targetId });
    if (!student) {
      console.log('Student not found!');
      return;
    }

    console.log('\n--- Before Update ---');
    console.log(`_id: ${student._id}`);
    console.log(`password hash: ${student.password}`);
    console.log(`password length: ${student.password.length}`);
    console.log(`isPasswordChanged: ${student.isPasswordChanged}`);

    // Let's test if we update password to 'Nikhil1234'
    const newPasswordStr = 'Nikhil1234';
    student.password = newPasswordStr;
    student.isPasswordChanged = true;
    
    console.log('\nSaving student document...');
    await student.save();
    console.log('Saved successfully.');

    // Reload from DB
    const updatedStudent = await Student.findById(student._id);
    console.log('\n--- After Update & Reload ---');
    console.log(`password hash in DB: ${updatedStudent.password}`);
    console.log(`password length: ${updatedStudent.password.length}`);
    console.log(`isPasswordChanged: ${updatedStudent.isPasswordChanged}`);

    // Verify bcrypt.compare
    const match = await bcrypt.compare(newPasswordStr, updatedStudent.password);
    console.log(`bcrypt.compare("${newPasswordStr}", hash) result: ${match}`);

    // Let's check if the pre-save hook was somehow bypassed or if it hashed it correctly.
    const expectedPrefix = updatedStudent.password.startsWith('$2a$') || updatedStudent.password.startsWith('$2b$');
    console.log(`Is standard bcrypt hash format? ${expectedPrefix}`);

  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
