const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://vv330418:SBIT12345@cluster0.vhpjegy.mongodb.net/sbist_exam?retryWrites=true&w=majority&appName=Cluster0';

// Define mini Student Schema to avoid dependency issues
const StudentSchema = new mongoose.Schema({
  studentId: String,
  email: String,
  password: { type: String, required: true },
  isActive: Boolean,
  isPasswordChanged: Boolean
}, { collection: 'students' });

const Student = mongoose.model('Student', StudentSchema);

async function run() {
  try {
    console.log('Connecting to database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    const targetId = 'SBIT4CSE9255';
    const passwordToTest = 'Nikhil1234';

    const students = await Student.find({
      $or: [
        { studentId: targetId },
        { email: targetId.toLowerCase() }
      ]
    });

    console.log(`Found ${students.length} document(s) matching ${targetId}:`);

    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const hash = student.password || '';
      const hashLength = hash.length;
      
      console.log(`\n--- Document ${i + 1} ---`);
      console.log(`_id: ${student._id}`);
      console.log(`studentId: ${student.studentId}`);
      console.log(`email: ${student.email}`);
      console.log(`isActive: ${student.isActive}`);
      console.log(`isPasswordChanged: ${student.isPasswordChanged}`);
      console.log(`password hash length: ${hashLength}`);

      let compareResult = false;
      let error = null;
      try {
        compareResult = await bcrypt.compare(passwordToTest, hash);
      } catch (err) {
        error = err.message;
      }

      console.log(`bcrypt.compare() result for "${passwordToTest}": ${compareResult}`);
      if (error) {
        console.log(`bcrypt error: ${error}`);
      }
    }

  } catch (error) {
    console.error('Error running check:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

run();
