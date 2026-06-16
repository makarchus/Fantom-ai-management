import pool from '../db/pool.js';
import { sendActionItemAssignmentEmail, sendActionItemUnassignmentEmail } from './email.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function normalizeEmail(email) {
  return email?.trim().toLowerCase() || '';
}

export function normalizeEmailList(emails = []) {
  const seen = new Set();
  const result = [];
  for (const raw of emails) {
    const email = normalizeEmail(raw);
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    result.push(email);
  }
  return result;
}

export async function findUserIdByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE lower(email) = $1',
    [normalized],
  );
  return rows[0]?.id || null;
}

/** Link pre-registration email assignments to a new or returning user account. */
export async function linkPendingAssignmentsToUser(userId, email) {
  const normalized = normalizeEmail(email);
  if (!userId || !normalized) return 0;

  const { rowCount } = await pool.query(
    `UPDATE action_item_assignments
     SET assignee_user_id = $1, updated_at = NOW()
     WHERE lower(assignee_email) = $2
       AND (assignee_user_id IS NULL OR assignee_user_id = $1)`,
    [userId, normalized],
  );
  return rowCount;
}

export async function getEmailSuggestions(userId) {
  const { rows } = await pool.query(
    `SELECT email FROM (
       SELECT DISTINCT assignee_email AS email
       FROM action_item_assignments
       WHERE owner_user_id = $1 OR assignee_user_id = $1
       UNION
       SELECT email FROM users WHERE id = $1
     ) suggestions
     WHERE email IS NOT NULL AND email <> ''
     ORDER BY email`,
    [userId],
  );
  return rows.map((r) => r.email).filter(Boolean);
}

export async function syncActionItemAssignments({
  actionItemId,
  meetingId,
  ownerUserId,
  ownerEmail,
  ownerName,
  assigneeEmails,
  item,
  meetingTitle,
  meetingDate,
  notifyNew = true,
}) {
  const emails = normalizeEmailList(assigneeEmails);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingRes = await client.query(
      'SELECT assignee_email, notified_at FROM action_item_assignments WHERE action_item_id = $1',
      [actionItemId],
    );
    const existingByEmail = new Map(
      existingRes.rows.map((r) => [normalizeEmail(r.assignee_email), r]),
    );

    const keepEmails = new Set(emails);
    const removedEmails = [];
    for (const [email] of existingByEmail) {
      if (!keepEmails.has(email)) {
        removedEmails.push(email);
        await client.query(
          'DELETE FROM action_item_assignments WHERE action_item_id = $1 AND assignee_email = $2',
          [actionItemId, email],
        );
      }
    }

    const ownerNorm = normalizeEmail(ownerEmail);
    const appUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const newNotifyEmails = [];

    for (const email of emails) {
      const assigneeUserId = await findUserIdByEmail(email);
      const prev = existingByEmail.get(email);
      const isNew = !prev;

      await client.query(
        `INSERT INTO action_item_assignments (
          action_item_id, meeting_id, owner_user_id, assignee_email, assignee_user_id,
          description, notes, meeting_title, meeting_date, priority, status, due_date,
          commitment_type, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (action_item_id, assignee_email) DO UPDATE SET
          assignee_user_id = EXCLUDED.assignee_user_id,
          description = EXCLUDED.description,
          notes = EXCLUDED.notes,
          meeting_title = EXCLUDED.meeting_title,
          meeting_date = EXCLUDED.meeting_date,
          priority = EXCLUDED.priority,
          status = EXCLUDED.status,
          due_date = EXCLUDED.due_date,
          commitment_type = EXCLUDED.commitment_type,
          updated_at = NOW()`,
        [
          actionItemId,
          meetingId,
          ownerUserId,
          email,
          assigneeUserId,
          item.description,
          item.notes || null,
          meetingTitle,
          meetingDate || null,
          item.priority || 'medium',
          item.status || 'pending',
          item.due_date || null,
          item.commitment_type || 'action',
        ],
      );

      if (notifyNew && isNew && email !== ownerNorm) {
        newNotifyEmails.push(email);
      }
    }

    await client.query('COMMIT');

    for (const email of removedEmails) {
      if (email === ownerNorm) continue;
      try {
        await sendActionItemUnassignmentEmail({
          to: email,
          assignerName: ownerName || ownerEmail,
          meetingTitle,
          meetingDate,
          description: item.description,
          appUrl,
        });
      } catch (err) {
        console.warn('[Action unassignment email]', email, err.message);
      }
    }

    for (const email of newNotifyEmails) {
      try {
        await sendActionItemAssignmentEmail({
          to: email,
          assignerName: ownerName || ownerEmail,
          meetingTitle,
          meetingDate,
          description: item.description,
          notes: item.notes,
          dueDate: item.due_date,
          priority: item.priority,
          appUrl,
        });
        await pool.query(
          `UPDATE action_item_assignments SET notified_at = NOW()
           WHERE action_item_id = $1 AND lower(assignee_email) = $2`,
          [actionItemId, email],
        );
      } catch (err) {
        console.warn('[Action assignment email]', email, err.message);
      }
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listAssignmentsForUser(userId, userEmail) {
  await linkPendingAssignmentsToUser(userId, userEmail);

  const { rows } = await pool.query(
    `SELECT a.*, u.name AS owner_name, u.email AS owner_email
     FROM action_item_assignments a
     JOIN users u ON u.id = a.owner_user_id
     WHERE (a.assignee_user_id = $1 OR lower(a.assignee_email) = lower($2))
       AND a.archived_at IS NULL
     ORDER BY a.meeting_date DESC NULLS LAST, a.created_at DESC`,
    [userId, userEmail],
  );
  return rows;
}

export async function updateAssignmentStatus(assignmentId, userId, userEmail, status) {
  if (status === 'done') {
    const err = new Error('Only the action item owner can mark it complete');
    err.status = 403;
    throw err;
  }

  const { rows } = await pool.query(
    `UPDATE action_item_assignments a SET status = $1, updated_at = NOW()
     WHERE a.id = $2 AND (a.assignee_user_id = $3 OR lower(a.assignee_email) = lower($4))
     RETURNING *`,
    [status, assignmentId, userId, userEmail],
  );
  const assignment = rows[0];
  if (!assignment) {
    const err = new Error('Assignment not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    'UPDATE action_items SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, assignment.action_item_id],
  );

  return assignment;
}

export async function syncAssignmentFieldsFromActionItem(actionItemId, item, meetingTitle, meetingDate) {
  await pool.query(
    `UPDATE action_item_assignments SET
      description = $1,
      notes = $2,
      meeting_title = $3,
      meeting_date = $4,
      priority = $5,
      status = $6,
      due_date = $7,
      commitment_type = $8,
      updated_at = NOW()
     WHERE action_item_id = $9`,
    [
      item.description,
      item.notes || null,
      meetingTitle,
      meetingDate || null,
      item.priority || 'medium',
      item.status || 'pending',
      item.due_date || null,
      item.commitment_type || 'action',
      actionItemId,
    ],
  );
}
