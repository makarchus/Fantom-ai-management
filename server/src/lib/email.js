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

export async function sendLoginVerificationEmail({ to, code, name }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const displayName = name || to.split('@')[0];

  await getTransporter().sendMail({
    from: `"Meeting Intelligence" <${from}>`,
    to,
    subject: 'Your sign-in verification code',
    text: [
      `Hi ${displayName},`,
      '',
      `Your Meeting Intelligence sign-in code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
      '',
      'If you did not try to sign in, change your password and contact support.',
    ].join('\n'),
    html: `
      <p>Hi ${displayName},</p>
      <p>Your Meeting Intelligence sign-in verification code is:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      <p>If you did not try to sign in, change your password and contact support.</p>
    `,
  });
}

function formatMeetingDate(date) {
  if (!date) return 'Not specified';
  try {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return String(date);
  }
}

export async function sendActionItemAssignmentEmail({
  to,
  assignerName,
  meetingTitle,
  meetingDate,
  description,
  notes,
  dueDate,
  priority,
  appUrl,
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const when = formatMeetingDate(meetingDate);
  const due = dueDate ? `Due: ${dueDate}` : '';
  const notesBlock = notes?.trim()
    ? `\n\nNotes:\n${notes.replace(/<[^>]+>/g, '')}`
    : '';

  await getTransporter().sendMail({
    from: `"Meeting Intelligence" <${from}>`,
    to,
    subject: `Action item assigned: ${meetingTitle}`,
    text: [
      'You have been assigned an action item.',
      '',
      `Meeting: ${meetingTitle}`,
      `Date: ${when}`,
      `Assigned by: ${assignerName}`,
      `Priority: ${priority || 'medium'}`,
      due,
      '',
      `Action: ${description}`,
      notesBlock,
      '',
      `Open the app: ${appUrl}`,
    ].join('\n'),
    html: `
      <p>You have been assigned an action item.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Meeting</td><td><strong>${meetingTitle}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Date</td><td>${when}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Assigned by</td><td>${assignerName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Priority</td><td>${priority || 'medium'}</td></tr>
        ${dueDate ? `<tr><td style="padding:4px 12px 4px 0;color:#666">Due</td><td>${dueDate}</td></tr>` : ''}
      </table>
      <p style="font-size:15px"><strong>Action:</strong> ${description}</p>
      ${notes?.trim() ? `<div style="margin-top:12px;padding:12px;background:#f4f4f5;border-radius:8px"><strong>Notes</strong><br>${notes}</div>` : ''}
      <p style="margin-top:20px"><a href="${appUrl}">Open Meeting Intelligence</a></p>
    `,
  });
}

export async function sendActionItemUnassignmentEmail({
  to,
  assignerName,
  meetingTitle,
  meetingDate,
  description,
  appUrl,
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const when = formatMeetingDate(meetingDate);

  await getTransporter().sendMail({
    from: `"Meeting Intelligence" <${from}>`,
    to,
    subject: `Action item no longer required: ${meetingTitle}`,
    text: [
      'An action item you were assigned has been removed.',
      '',
      `Meeting: ${meetingTitle}`,
      `Date: ${when}`,
      `Updated by: ${assignerName}`,
      '',
      `Action (no longer required): ${description}`,
      '',
      `Open the app: ${appUrl}`,
    ].join('\n'),
    html: `
      <p>An action item you were assigned has been <strong>removed</strong> and is no longer required.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Meeting</td><td><strong>${meetingTitle}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Date</td><td>${when}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Updated by</td><td>${assignerName}</td></tr>
      </table>
      <p style="font-size:15px"><strong>Action:</strong> ${description}</p>
      <p style="margin-top:20px"><a href="${appUrl}">Open Meeting Intelligence</a></p>
    `,
  });
}
