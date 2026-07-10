const mongoose = require('mongoose');
require('dotenv').config();
const Student = require('../models/Student');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  const student = await Student.findOne();
  if (!student) {
    console.log('No student found');
    process.exit(0);
  }
  console.log('Student document keys:', Object.keys(student.toObject()));
  console.log('Has password field on Mongoose doc:', !!student.password);
  console.log('Password value:', student.password);
  
  const studentById = await Student.findById(student._id);
  console.log('Student by ID document keys:', Object.keys(studentById.toObject()));
  console.log('Has password field on studentById:', !!studentById.password);
  console.log('Password value on studentById:', studentById.password);

  await mongoose.disconnect();
}

test().catch(err => console.error(err));
