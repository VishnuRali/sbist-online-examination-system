const test = require('node:test');
const assert = require('node:assert');

test('Multi-Section Exam support and eligibility tests', async (t) => {

  const normalizeSection = (value) => String(value || '')
    .trim()
    .replace(/section\s*/i, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();

  const checkEligibility = (studentSection, examSections, examSectionFallback = '') => {
    const normStudentSec = normalizeSection(studentSection);
    const targetSections = Array.isArray(examSections) && examSections.length > 0
      ? examSections.map(s => normalizeSection(s))
      : (examSectionFallback ? [normalizeSection(examSectionFallback)] : []);

    return targetSections.length === 0 ||
      targetSections.includes('ALL') ||
      targetSections.includes('') ||
      (normStudentSec !== '' && targetSections.includes(normStudentSec));
  };

  await t.test('Student in Section A should be eligible for exam assigned to Sections A and B', () => {
    const isEligible = checkEligibility('A', ['A', 'B']);
    assert.strictEqual(isEligible, true);
  });

  await t.test('Student in Section B should be eligible for exam assigned to Sections A and B', () => {
    const isEligible = checkEligibility('B', ['A', 'B']);
    assert.strictEqual(isEligible, true);
  });

  await t.test('Student in Section C should NOT be eligible for exam assigned to Sections A and B', () => {
    const isEligible = checkEligibility('C', ['A', 'B']);
    assert.strictEqual(isEligible, false);
  });

  await t.test('Student in Section C should be eligible for exam assigned to All Sections (empty sections array)', () => {
    const isEligible = checkEligibility('C', []);
    assert.strictEqual(isEligible, true);
  });

  await t.test('Student in Section C should be eligible for exam with legacy section string as empty (All sections)', () => {
    const isEligible = checkEligibility('C', null, '');
    assert.strictEqual(isEligible, true);
  });

  await t.test('Student in Section C should be eligible for exam with legacy section string matching C', () => {
    const isEligible = checkEligibility('C', null, 'C');
    assert.strictEqual(isEligible, true);
  });

  await t.test('Student in Section C should NOT be eligible for exam with legacy section string matching A', () => {
    const isEligible = checkEligibility('C', null, 'A');
    assert.strictEqual(isEligible, false);
  });

});
