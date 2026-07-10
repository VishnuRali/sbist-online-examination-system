/**
 * Generate unique Student ID: SBIST + YEAR + DEPT_CODE + RANDOM
 * Example: SBIST2024CS001
 */
const generateStudentId = (departmentCode, year) => {
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `SBIST${year}${departmentCode.toUpperCase()}${rand}`;
};

/**
 * Generate a random password of given length
 */
const generatePassword = (length = 8) => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

/**
 * Shuffle an array (Fisher-Yates)
 */
const shuffleArray = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * Calculate grade from percentage
 */
const calculateGrade = (percentage) => {
  if (percentage >= 90) return 'O';
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'B+';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  return 'F';
};

module.exports = { generateStudentId, generatePassword, shuffleArray, calculateGrade };
