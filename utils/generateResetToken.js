const crypto = require('crypto');

/**
 * Generates a 32-byte secure hex token for resetting password
 * @returns {string} - Hex encoded secure random token
 */
function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = generateResetToken;
