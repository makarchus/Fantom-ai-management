import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const err = new Error(
      'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS in server/.env. See docs/GMAIL_SETUP.md.',
    );
    err.status = 503;
    throw err;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  return transporter;
}

export async function sendVerificationEmail({ to, code, name }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const displayName = name || to.split('@')[0];

  await getTransporter().sendMail({
    from: `"Meeting Intelligence" <${from}>`,
    to,
    subject: 'Your verification code',
    text: [
      `Hi ${displayName},`,
      '',
      `Your Meeting Intelligence verification code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>Hi ${displayName},</p>
      <p>Your Meeting Intelligence verification code is:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}
