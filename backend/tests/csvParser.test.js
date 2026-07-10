const test = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');
const { parseStudentsFromCSV } = require('../utils/csvParser');

test('CSV Parser and Section Validation Unit Tests', async (t) => {

  const createExcelBuffer = (rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  await t.test('Successfully parse correct student row with Section A', () => {
    const buffer = createExcelBuffer([
      {
        'Student Name': 'Rali Vishnu Vardhan',
        'Email': 'abc@gmail.com',
        'Roll Number': '23M61A05B6',
        'Phone': '7095119246',
        'Department': 'Computer Science and Engineering',
        'Year': '4',
        'Semester': '1',
        'Section': 'A'
      }
    ]);

    const { students, errors } = parseStudentsFromCSV(buffer);
    assert.strictEqual(errors.length, 0);
    assert.strictEqual(students.length, 1);
    assert.strictEqual(students[0].name, 'Rali Vishnu Vardhan');
    assert.strictEqual(students[0].section, 'A');
  });

  await t.test('Section validation logic helper checks', () => {
    const validateSection = (section) => {
      const sectionVal = (section || '').trim().toUpperCase();
      if (!sectionVal) return { valid: false, reason: 'Section is missing' };
      if (!/^[A-Z]$/.test(sectionVal)) return { valid: false, reason: `Invalid section value: "${section}"` };
      return { valid: true, value: sectionVal };
    };

    assert.deepStrictEqual(validateSection('A'), { valid: true, value: 'A' });
    assert.deepStrictEqual(validateSection('b '), { valid: true, value: 'B' });
    assert.deepStrictEqual(validateSection(''), { valid: false, reason: 'Section is missing' });
    assert.deepStrictEqual(validateSection('AB'), { valid: false, reason: 'Invalid section value: "AB"' });
    assert.deepStrictEqual(validateSection('1'), { valid: false, reason: 'Invalid section value: "1"' });
  });

});
