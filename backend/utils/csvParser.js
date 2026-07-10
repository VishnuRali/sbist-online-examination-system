const XLSX = require('xlsx');

/**
 * Maps CSV headers dynamically to student fields using common aliases.
 */
const parseStudentsFromCSV = (buffer) => {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const students = [];
    const errors = [];

    // Helper to find header value by matching aliases
    const getValue = (row, aliases) => {
      const matchedKey = Object.keys(row).find(k => 
        aliases.some(alias => k.toLowerCase().replace(/[\s_\-]/g, '').includes(alias))
      );
      return matchedKey ? row[matchedKey].toString().trim() : '';
    };

    rows.forEach((row, index) => {
      const rowNum = index + 2; // CSV rows start at 2 (1 is header)

      const name = getValue(row, ['fullname', 'name', 'studentname']);
      const rollNumber = getValue(row, ['rollnumber', 'rollno', 'roll']);
      const email = getValue(row, ['emailaddress', 'email', 'mail']).toLowerCase();
      const departmentName = getValue(row, ['department', 'dept']);
      const branch = getValue(row, ['branch', 'stream']);
      const year = getValue(row, ['year']);
      const semester = getValue(row, ['semester', 'sem']);
      const mobile = getValue(row, ['mobilenumber', 'mobile', 'mobileno', 'phone', 'contact']);
      let section = getValue(row, ['section', 'sec']);
      if (section) {
        section = section.replace(/\s+/g, '').toUpperCase();
      }

      if (!name) {
        errors.push(`Row ${rowNum}: Missing student name`);
        return;
      }
      if (!rollNumber) {
        errors.push(`Row ${rowNum}: Missing roll number`);
        return;
      }
      if (!email) {
        errors.push(`Row ${rowNum}: Missing email address`);
        return;
      }

      students.push({
        rowNum,
        name,
        rollNumber,
        email,
        departmentName: departmentName || 'General',
        branch: branch || '',
        year: year || '1',
        semester: semester || '1',
        mobile: mobile || '',
        section: section || '',
      });
    });

    return { students, errors };
  } catch (error) {
    console.error('[CSVParser] Parsing error:', error.message);
    return { students: [], errors: [`Failed to parse CSV file: ${error.message}`] };
  }
};

module.exports = { parseStudentsFromCSV };
