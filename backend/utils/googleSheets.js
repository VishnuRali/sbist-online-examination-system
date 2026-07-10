const { google } = require('googleapis');
const Settings = require('../models/Settings');

// Helper to load credentials from DB or Env
const getGoogleConfig = async () => {
  const settings = await Settings.findOne();
  
  let spreadsheetId = process.env.GOOGLE_SHEET_ID;
  let serviceAccountJson = null;

  if (settings) {
    if (settings.googleSpreadsheetId) spreadsheetId = settings.googleSpreadsheetId;
    if (settings.googleServiceAccountJson) {
      try {
        serviceAccountJson = JSON.parse(settings.googleServiceAccountJson);
      } catch (e) {
        console.error('[GoogleSheets] Failed to parse service account JSON from DB:', e.message);
      }
    }
  }

  // Fallback to Env if JSON config not in DB
  if (!serviceAccountJson && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    serviceAccountJson = {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY,
    };
  }

  return { spreadsheetId, serviceAccountJson };
};

const isGoogleConfigured = async () => {
  const { spreadsheetId, serviceAccountJson } = await getGoogleConfig();
  return !!(spreadsheetId && serviceAccountJson && serviceAccountJson.client_email && serviceAccountJson.private_key);
};

const getSheetClient = async (serviceAccountJson) => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: serviceAccountJson.client_email,
      private_key: (serviceAccountJson.private_key || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  const authClient = await auth.getClient();
  return google.sheets({ version: 'v4', auth: authClient });
};

/**
 * Fetch all responses from the Google Form response sheet.
 *
 * Uses HEADER-BASED column mapping — reads the first row for column names,
 * builds a name→index map, then reads data by column name NOT by index.
 *
 * Expected column headers for "SBIT Online Examination Registration" form:
 *   Timestamp
 *   Student Name        (Short Answer)
 *   Email Address       (Email)
 *   Roll Number         (Short Answer)
 *   Phone Number        (Short Answer)
 *   Department          (Dropdown)
 *   Year                (Dropdown: 1 / 2 / 3 / 4)
 *   Semester            (Dropdown: 1 / 2)
 *   Section             (Dropdown: A / B / C)
 *   Academic Year       (Dropdown: e.g. 2026-27)
 *   Sync Status         (Written by this app — 'Synced')
 */
const fetchFormResponses = async () => {
  const { spreadsheetId, serviceAccountJson } = await getGoogleConfig();

  if (!spreadsheetId || !serviceAccountJson) {
    return { success: false, reason: 'Google Sheets configuration is missing', data: [] };
  }

  try {
    const sheets = await getSheetClient(serviceAccountJson);

    // Fetch all columns (A to Z is safe — Google Sheets returns only populated columns)
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1',
    });

    const rows = response.data.values || [];
    if (rows.length < 1) {
      return { success: true, data: [] }; // Completely empty
    }

    // ── Build header → column index map (case-insensitive, trimmed) ──────────
    const headerRow = rows[0];
    const colMap = {};
    headerRow.forEach((header, idx) => {
      const key = (header || '').trim().toLowerCase();
      colMap[key] = idx;
    });

    console.log('[GoogleSheets] Detected columns:', headerRow.map((h, i) => `${i}:"${h}"`).join(', '));

    // Helper: get cell value by header name (case-insensitive)
    const getCol = (row, headerName) => {
      const idx = colMap[headerName.toLowerCase()];
      if (idx === undefined) return '';
      return (row[idx] || '').trim();
    };

    // Detect the sync status column index (for writing 'Synced' back)
    const syncColIdx = colMap['sync status'] !== undefined
      ? colMap['sync status']
      : headerRow.length; // append new column if not present

    // Convert column index to A1 notation letter(s)
    const colIndexToLetter = (n) => {
      let s = '';
      while (n >= 0) {
        s = String.fromCharCode((n % 26) + 65) + s;
        n = Math.floor(n / 26) - 1;
      }
      return s;
    };
    const syncColLetter = colIndexToLetter(syncColIdx);

    if (rows.length <= 1) {
      return { success: true, data: [], syncColLetter }; // Only header row
    }

    const responses = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];

      const syncStatus = getCol(row, 'Sync Status').toLowerCase();

      // Skip already-synced rows
      if (syncStatus === 'synced' || syncStatus === 'yes') continue;

      const name         = getCol(row, 'Student Name');
      const email        = getCol(row, 'Email Address').toLowerCase();
      const rollNumber   = getCol(row, 'Roll Number');
      const phone        = getCol(row, 'Phone Number');
      const deptName     = getCol(row, 'Department');
      const year         = getCol(row, 'Year');
      const semester     = getCol(row, 'Semester');
      const section      = getCol(row, 'Section');
      const academicYear = getCol(row, 'Academic Year');
      const timestamp    = getCol(row, 'Timestamp');

      // Skip rows missing required fields
      if (!name || !email) continue;

      responses.push({
        responseId:    `row_${i + 1}`,
        rowIndex:      i + 1,          // 1-based row number in sheet
        syncColLetter,                 // For writing Synced back
        timestamp,
        name,
        email,
        rollNumber,
        phone,
        departmentName: deptName,
        year,
        semester,
        section,
        academicYear,
      });
    }

    return { success: true, data: responses, syncColLetter };
  } catch (error) {
    console.error('[GoogleSheets] Error fetching responses:', error.message);
    return { success: false, reason: error.message, data: [] };
  }
};

/**
 * Mark a specific row in the Google Sheet as synced.
 * Uses the dynamically detected sync column (not hardcoded to column K).
 */
const markRowAsSynced = async (rowIndex, syncColLetter = 'K') => {
  const { spreadsheetId, serviceAccountJson } = await getGoogleConfig();
  if (!spreadsheetId || !serviceAccountJson) return false;

  try {
    const sheets = await getSheetClient(serviceAccountJson);
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${syncColLetter}${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Synced']],
      },
    });
    return true;
  } catch (error) {
    console.error(`[GoogleSheets] Error marking row ${rowIndex} as synced:`, error.message);
    return false;
  }
};

/**
 * Verify access to the spreadsheet for testing connections
 */
const testSheetsConnection = async (testSpreadsheetId, testServiceAccountJsonString) => {
  try {
    let serviceAccountJson;
    try {
      serviceAccountJson = JSON.parse(testServiceAccountJsonString);
    } catch {
      return { success: false, reason: 'Invalid Service Account JSON format' };
    }

    if (!serviceAccountJson.client_email || !serviceAccountJson.private_key) {
      return { success: false, reason: 'Service Account JSON is missing client_email or private_key' };
    }

    const sheets = await getSheetClient(serviceAccountJson);
    const metadata = await sheets.spreadsheets.get({
      spreadsheetId: testSpreadsheetId,
    });

    // Fetch headers to verify column structure
    let headers = [];
    try {
      const headerResp = await sheets.spreadsheets.values.get({
        spreadsheetId: testSpreadsheetId,
        range: 'Sheet1!1:1',
      });
      headers = (headerResp.data.values || [[]])[0] || [];
    } catch(e) { /* ignore */ }

    return { 
      success: true, 
      title: metadata.data.properties.title,
      sheetsList: metadata.data.sheets.map(s => s.properties.title),
      detectedHeaders: headers,
    };
  } catch (error) {
    return { success: false, reason: error.message };
  }
};

module.exports = { 
  fetchFormResponses, 
  markRowAsSynced, 
  isGoogleConfigured, 
  testSheetsConnection,
  getGoogleConfig
};
