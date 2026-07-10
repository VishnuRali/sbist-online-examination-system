require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Student = require('../models/Student');
const Exam = require('../models/Exam');

const inspect = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB Connected');

    const depts = await Department.find({});
    console.log('\n--- DEPARTMENTS IN DATABASE ---');
    for (const d of depts) {
      const studentCount = await Student.countDocuments({ department: d._id });
      const examCount = await Exam.countDocuments({ department: d._id });
      console.log(`ID: ${d._id} | Name: "${d.name}" | Code: "${d.code}" | Active: ${d.isActive} | Students: ${studentCount} | Exams: ${examCount}`);
    }
    
    mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
};

inspect();
