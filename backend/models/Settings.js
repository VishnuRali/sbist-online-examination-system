const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  gmailUser: {
    type: String,
    trim: true,
  },
  gmailAppPassword: {
    type: String,
    trim: true,
  },
  examPortalUrl: {
    type: String,
    trim: true,
    default: 'http://localhost:5173',
  },
  googleSpreadsheetId: {
    type: String,
    trim: true,
  },
  googleServiceAccountJson: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

module.exports = mongoose.model('Settings', SettingsSchema);
