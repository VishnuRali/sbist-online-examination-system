require('dotenv').config();
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Department = require('../models/Department');
const Subject = require('../models/Subject');
const Exam = require('../models/Exam');
const { getAvailableExams } = require('../controllers/studentController');

const run = async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    const department = await Department.create({ name: 'Computer Science and Engineering', code: 'CSE' });
    const subject = await Subject.create({ name: 'Algorithms', code: 'CS101', department: department._id, semester: '1', year: '4' });
    const admin = await Admin.create({
      name: 'Test Admin',
      email: 'admin@test.com',
      password: 'Admin123!',
      employeeId: 'EMP001',
      mobile: '0000000000',
      department: 'Administration',
      role: 'admin',
    });
    const student = await Student.create({
      studentId: 'SBIST20260001',
      name: 'Test Student',
      email: 'student@test.com',
      password: 'TempPass1!',
      department: department._id,
      year: '4',
      semester: '1',
      section: 'A',
      role: 'student',
      isActive: true,
      isPasswordChanged: true,
    });
    const exam = await Exam.create({
      title: 'CSE Year 4 Semester 1 Section A Exam',
      subject: subject._id,
      department: department._id,
      semester: '1',
      year: '4',
      section: 'A',
      description: 'Test exam',
      duration: 60,
      totalMarks: 100,
      passMarks: 40,
      startTime: new Date(Date.now() - 5 * 60 * 1000),
      endTime: new Date(Date.now() + 55 * 60 * 1000),
      status: 'scheduled',
      createdBy: admin._id,
    });

    const req = { student: { _id: student._id } };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(data) { console.log('RES', this.statusCode || 200, JSON.stringify(data, null, 2)); },
    };

    await getAvailableExams(req, res);
  } catch (err) {
    console.error('TEST ERROR', err);
  } finally {
    await mongoose.disconnect();
    await mongod.stop();
  }
};

run();
