import pool from '../db/pool.js';
import { decryptActionItemRow, decryptMeetingRow } from './dataCrypto.js';
import { linkPendingAssignmentsToUser } from './actionAssignments.js';

export async function archiveActionItem(actionItemId, ownerUserId) {
  const itemRes = await pool.query(
    `SELECT ai.*, m.user_id, m.title_enc, m.meeting_date
     FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE ai.id = $1`,
    [actionItemId],
  );
  const row = itemRes.rows[0];
  if (!row || row.user_id !== ownerUserId) {
    const err = new Error('Action item not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    `UPDATE action_items SET status = 'done', archived_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [actionItemId],
  );
  await pool.query(
    `UPDATE action_item_assignments SET status = 'done', archived_at = NOW(), updated_at = NOW()
     WHERE action_item_id = $1`,
    [actionItemId],
  );

  return row;
}

export async function unarchiveActionItem(actionItemId, ownerUserId) {
  const itemRes = await pool.query(
    `SELECT ai.id, m.user_id FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE ai.id = $1`,
    [actionItemId],
  );
  if (!itemRes.rows[0] || itemRes.rows[0].user_id !== ownerUserId) {
    const err = new Error('Action item not found');
    err.status = 404;
    throw err;
  }

  await pool.query(
    `UPDATE action_items SET status = 'in_progress', archived_at = NULL, updated_at = NOW()
     WHERE id = $1`,
    [actionItemId],
  );
  await pool.query(
    `UPDATE action_item_assignments SET status = 'in_progress', archived_at = NULL, updated_at = NOW()
     WHERE action_item_id = $1`,
    [actionItemId],
  );
}

export async function deleteActionItem(actionItemId, ownerUserId) {
  const itemRes = await pool.query(
    `SELECT ai.id, m.user_id FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE ai.id = $1`,
    [actionItemId],
  );
  if (!itemRes.rows[0] || itemRes.rows[0].user_id !== ownerUserId) {
    const err = new Error('Action item not found');
    err.status = 404;
    throw err;
  }

  await pool.query('DELETE FROM action_items WHERE id = $1', [actionItemId]);
}

async function listOwnedArchived(userId, vaultKey) {
  const { rows } = await pool.query(
    `SELECT ai.*, m.id AS meeting_id, m.title_enc, m.meeting_date
     FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE m.user_id = $1 AND ai.archived_at IS NOT NULL
     ORDER BY ai.archived_at DESC`,
    [userId],
  );

  return rows.map((row) => {
    const item = decryptActionItemRow(row, vaultKey);
    const meeting = decryptMeetingRow(row, vaultKey);
    return {
      ...item,
      meeting_id: row.meeting_id,
      meeting_title: meeting.title,
      meeting_date: row.meeting_date,
      archived_at: row.archived_at,
      source: 'owned',
      can_open_meeting: true,
    };
  });
}

async function listAssignedArchived(userId, userEmail) {
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS owner_name, m.user_id AS meeting_owner_id
     FROM action_item_assignments a
     JOIN users u ON u.id = a.owner_user_id
     LEFT JOIN meetings m ON m.id = a.meeting_id
     WHERE (a.assignee_user_id = $1 OR lower(a.assignee_email) = lower($2))
       AND a.archived_at IS NOT NULL
     ORDER BY a.archived_at DESC`,
    [userId, userEmail],
  );

  return rows.map((row) => ({
    id: row.action_item_id,
    assignment_id: row.id,
    meeting_id: row.meeting_id,
    meeting_title: row.meeting_title,
    meeting_date: row.meeting_date,
    description: row.description,
    notes: row.notes,
    priority: row.priority,
    status: row.status,
    due_date: row.due_date,
    commitment_type: row.commitment_type,
    archived_at: row.archived_at,
    source: 'assigned',
    owner_name: row.owner_name,
    can_open_meeting: row.meeting_owner_id === userId,
  }));
}

export async function listArchivedActionItems(userId, userEmail, vaultKey) {
  await linkPendingAssignmentsToUser(userId, userEmail);

  const [owned, assigned] = await Promise.all([
    listOwnedArchived(userId, vaultKey),
    listAssignedArchived(userId, userEmail),
  ]);

  const ownedIds = new Set(owned.map((item) => item.id));
  const assignedOnly = assigned.filter((item) => !ownedIds.has(item.id));
  return [...owned, ...assignedOnly];
}
