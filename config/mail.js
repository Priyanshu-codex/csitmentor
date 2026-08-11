const nodemailer = require('nodemailer');

const mailConfig = {
  host: process.env.BREVO_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.BREVO_PORT || '587', 10),
  secure: false, // 587 uses STARTTLS which starts insecure then upgrades
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
};

const transporter = nodemailer.createTransport(mailConfig);

module.exports = {
  transporter,
  fromEmail: process.env.MAIL_FROM || 'noreply@csitdurg.in',
};

