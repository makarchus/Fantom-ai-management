import pool from '../db/pool.js';
import { normalizeEmail } from './actionAssignments.js';

export async function canAccessActionItem(actionItemId, userId, userEmail) {
  const { rows } = await pool.query(
    `SELECT ai.id
     FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE ai.id = $1
       AND (
         m.user_id = $2
         OR EXISTS (
           SELECT 1 FROM action_item_assignments a
           WHERE a.action_item_id = ai.id
             AND (a.assignee_user_id = $2 OR lower(a.assignee_email) = lower($3))
         )
       )`,
    [actionItemId, userId, userEmail],
  );
  return rows.length > 0;
}

export async function listComments(actionItemId, userId, userEmail) {
  const allowed = await canAccessActionItem(actionItemId, userId, userEmail);
  if (!allowed) {
    const err = new Error('Action item not found');
    err.status = 404;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT c.*, u.name AS author_display_name
     FROM action_item_comments c
     LEFT JOIN users u ON u.id = c.author_user_id
     WHERE c.action_item_id = $1
     ORDER BY c.created_at ASC`,
    [actionItemId],
  );

  return rows.map((row) => ({
    id: row.id,
    action_item_id: row.action_item_id,
    author_user_id: row.author_user_id,
    author_name: row.author_display_name || row.author_name || row.author_email,
    author_email: row.author_email,
    body: row.body,
    created_at: row.created_at,
  }));
}

export async function addComment(actionItemId, userId, userEmail, userName, body) {
  const text = body?.trim();
  if (!text) {
    const err = new Error('Comment body is required');
    err.status = 400;
    throw err;
  }

  const allowed = await canAccessActionItem(actionItemId, userId, userEmail);
  if (!allowed) {
    const err = new Error('Action item not found');
    err.status = 404;
    throw err;
  }

  const { rows } = await pool.query(
    `INSERT INTO action_item_comments (action_item_id, author_user_id, author_name, author_email, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [actionItemId, userId, userName || null, normalizeEmail(userEmail), text],
  );

  const comment = rows[0];

  await pool.query(
    `UPDATE action_items SET status = 'in_progress', updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [actionItemId],
  );
  await pool.query(
    `UPDATE action_item_assignments SET status = 'in_progress', updated_at = NOW()
     WHERE action_item_id = $1 AND status = 'pending'`,
    [actionItemId],
  );

  return {
    id: comment.id,
    action_item_id: comment.action_item_id,
    author_user_id: comment.author_user_id,
    author_name: userName || userEmail,
    author_email: comment.author_email,
    body: comment.body,
    created_at: comment.created_at,
  };
}
