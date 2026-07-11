const crypto = require('crypto');

// Ensure exactly 32 bytes key from JWT_SECRET
const ENCRYPTION_KEY = Buffer.concat([
  Buffer.from(process.env.JWT_SECRET || 'sbit_super_secret_jwt_key_change_in_production_2024'),
  Buffer.alloc(32)
], 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return '';
  const textParts = text.split(':');
  if (textParts.length < 2) {
    return text; // Return plain text if not in encrypted format (backward compatibility)
  }
  try {
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    return text;
  }
}

module.exports = { encrypt, decrypt };
