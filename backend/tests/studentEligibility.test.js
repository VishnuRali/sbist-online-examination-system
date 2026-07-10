const test = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { buildStudentEligibilityQuery } = require('../utils/studentEligibility');

test('Unified Student Eligibility Query Builder Unit Tests', async (t) => {

  const mockExam = {
    _id: new mongoose.Types.ObjectId(),
    department: new mongoose.Types.ObjectId(),
    year: '4',
    semester: '1',
    section: 'A',
    sections: ['A', 'B']
  };

  await t.test('Target "all" builds query matching exam department, year, semester, and sections array', async () => {
    const query = await buildStudentEligibilityQuery(mockExam, { target: 'all' });
    assert.strictEqual(query.isActive, true);
    assert.deepStrictEqual(query.department, mockExam.department);
    assert.strictEqual(query.year, '4');
    assert.strictEqual(query.semester, '1');
    assert.deepStrictEqual(query.section, { $in: ['A', 'B'] });
  });

  await t.test('Target "all" with empty sections array defaults to no section filter (All Sections)', async () => {
    const mockExamAllSec = { ...mockExam, sections: [], section: '' };
    const query = await buildStudentEligibilityQuery(mockExamAllSec, { target: 'all' });
    assert.strictEqual(query.section, undefined);
    assert.deepStrictEqual(query.department, mockExam.department);
  });

  await t.test('Target "student" matches custom studentId string or ObjectId', async () => {
    const queryId = await buildStudentEligibilityQuery(mockExam, { target: 'student', targetValue: 'SBIT1234' });
    assert.strictEqual(queryId.studentId, 'SBIT1234');
    assert.strictEqual(queryId.department, undefined);

    const studentObjectId = new mongoose.Types.ObjectId();
    const queryObjId = await buildStudentEligibilityQuery(mockExam, { target: 'student', targetValue: studentObjectId.toString() });
    assert.deepStrictEqual(queryObjId._id.toString(), studentObjectId.toString());
  });

  await t.test('Target "filter" builds query based on custom body filter options', async () => {
    const filterDept = new mongoose.Types.ObjectId();
    const options = {
      target: 'filter',
      departmentId: filterDept.toString(),
      year: '3',
      semester: '2',
      section: 'C'
    };
    const query = await buildStudentEligibilityQuery(mockExam, options);
    assert.strictEqual(query.department.toString(), filterDept.toString());
    assert.strictEqual(query.year, '3');
    assert.strictEqual(query.semester, '2');
    assert.strictEqual(query.section, 'C');
  });

  await t.test('Target "filter" with Section ALL excludes section property from filter', async () => {
    const options = {
      target: 'filter',
      section: 'ALL'
    };
    const query = await buildStudentEligibilityQuery(mockExam, options);
    assert.strictEqual(query.section, undefined);
  });

});
