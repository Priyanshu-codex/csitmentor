const { transporter, fromEmail } = require('../config/mail');

/**
 * Sends a transactional email using the configured transporter.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} html - HTML email body content
 * @returns {Promise<object>} - Nodemailer send message info object
 */
async function sendEmail({ to, subject, html }) {
  const mailOptions = {
    from: `"CSIT Mentor Diary" <${fromEmail}>`,
    to,
    subject,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email successfully sent to ${to}. Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send email to ${to}:`, error.message);
    throw error;
  }
}

module.exports = {
  sendEmail,
};
