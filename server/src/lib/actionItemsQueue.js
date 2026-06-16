import pool from '../db/pool.js';
import { decryptActionItemRow, decryptMeetingRow } from './dataCrypto.js';
import { linkPendingAssignmentsToUser } from './actionAssignments.js';

function parseDueDate(value) {
  if (!value) return null;
  const str = typeof value === 'string' ? value : String(value);
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sortActionItemsQueue(items) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const priorityRank = { high: 3, medium: 2, low: 1 };

  function score(item) {
    const due = parseDueDate(item.due_date);
    const isDone = item.status === 'done' || item.status === 'cancelled';
    const isOverdue = Boolean(due && due < today && !isDone);
    return {
      isDone,
      isOverdue,
      overdueMs: isOverdue ? today.getTime() - due.getTime() : 0,
      priority: priorityRank[item.priority] || 2,
      dueTime: due ? due.getTime() : 0,
    };
  }

  return [...items].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    if (sa.isDone !== sb.isDone) return sa.isDone ? 1 : -1;
    if (sa.isOverdue !== sb.isOverdue) return sa.isOverdue ? -1 : 1;
    if (sa.isOverdue && sb.isOverdue && sa.overdueMs !== sb.overdueMs) {
      return sb.overdueMs - sa.overdueMs;
    }
    if (sa.priority !== sb.priority) return sb.priority - sa.priority;
    if (sa.dueTime !== sb.dueTime) return sb.dueTime - sa.dueTime;
    return String(a.meeting_title || '').localeCompare(String(b.meeting_title || ''));
  });
}

async function listOwnedActionItems(userId, vaultKey) {
  const { rows } = await pool.query(
    `SELECT ai.*, m.id AS meeting_id, m.title_enc, m.meeting_date
     FROM action_items ai
     JOIN meetings m ON m.id = ai.meeting_id
     WHERE m.user_id = $1 AND ai.archived_at IS NULL`,
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
      source: 'owned',
      can_open_meeting: true,
    };
  });
}

async function listAssignedActionItems(userId, userEmail) {
  const { rows } = await pool.query(
    `SELECT a.*, u.name AS owner_name, m.user_id AS meeting_owner_id
     FROM action_item_assignments a
     JOIN users u ON u.id = a.owner_user_id
     LEFT JOIN meetings m ON m.id = a.meeting_id
     WHERE (a.assignee_user_id = $1 OR lower(a.assignee_email) = lower($2))
       AND a.archived_at IS NULL`,
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
    source: 'assigned',
    owner_name: row.owner_name,
    can_open_meeting: row.meeting_owner_id === userId,
  }));
}

export async function listActionItemsQueue(userId, userEmail, vaultKey) {
  await linkPendingAssignmentsToUser(userId, userEmail);

  const [owned, assigned] = await Promise.all([
    listOwnedActionItems(userId, vaultKey),
    listAssignedActionItems(userId, userEmail),
  ]);

  const ownedIds = new Set(owned.map((item) => item.id));
  const assignedOnly = assigned.filter((item) => !ownedIds.has(item.id));

  return sortActionItemsQueue([...owned, ...assignedOnly]);
}

// Backwards-compatible alias
export const listOwnedActionItemsQueue = listActionItemsQueue;
