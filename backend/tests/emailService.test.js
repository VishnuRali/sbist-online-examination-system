const test = require('node:test');
const assert = require('node:assert');
const emailService = require('../utils/emailService');

test('Email Service Exports Verification', async (t) => {

  await t.test('All required utility functions are correctly exported', () => {
    assert.strictEqual(typeof emailService.createTransporter, 'function', 'createTransporter should be exported');
    assert.strictEqual(typeof emailService.getReminderEmailHTML, 'function', 'getReminderEmailHTML should be exported');
    assert.strictEqual(typeof emailService.parseSmtpError, 'function', 'parseSmtpError should be exported');
    assert.strictEqual(typeof emailService.sendWelcomeEmail, 'function', 'sendWelcomeEmail should be exported');
    assert.strictEqual(typeof emailService.sendReminderEmail, 'function', 'sendReminderEmail should be exported');
  });

  await t.test('parseSmtpError returns clean descriptive messages', () => {
    const error1 = new Error('invalid credentials');
    error1.code = 'EAUTH';
    assert.match(emailService.parseSmtpError(error1), /Authentication failed/);

    const error2 = new Error('connection timeout');
    error2.code = 'ETIMEDOUT';
    assert.match(emailService.parseSmtpError(error2), /Connection timeout/);
  });

});
