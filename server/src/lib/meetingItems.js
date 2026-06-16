import pool from '../db/pool.js';
import {
  decryptActionItemRow,
  decryptNextStepRow,
  encryptActionItemRow,
  encryptNextStepRow,
} from './dataCrypto.js';

/** Save extracted action items and next steps for a meeting (replaces existing). */
export async function persistExtraction(meetingId, extracted, vaultKey) {
  if (!extracted) return { action_items: [], next_steps: [] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM action_items WHERE meeting_id = $1', [meetingId]);
    await client.query('DELETE FROM next_steps WHERE meeting_id = $1', [meetingId]);

    for (const item of extracted.action_items || []) {
      const enc = encryptActionItemRow({
        assignee: item.assignee || 'Unassigned',
        assignee_emails: item.assignee_emails || [],
        description: item.description,
        notes: item.notes || null,
      }, vaultKey);
      await client.query(
        `INSERT INTO action_items (meeting_id, assignee_enc, assignee_emails_enc, description_enc, commitment_type, priority, due_date, notes_enc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          meetingId,
          enc.assignee_enc,
          enc.assignee_emails_enc,
          enc.description_enc,
          item.commitment_type || 'action',
          item.priority || 'medium',
          item.due_date || null,
          enc.notes_enc,
        ],
      );
    }

    for (const step of extracted.next_steps || []) {
      const enc = encryptNextStepRow({
        description: step.description,
        owner: step.owner || null,
      }, vaultKey);
      await client.query(
        `INSERT INTO next_steps (meeting_id, description_enc, owner_enc, due_date) VALUES ($1,$2,$3,$4)`,
        [meetingId, enc.description_enc, enc.owner_enc, step.due_date || null],
      );
    }

    await client.query('COMMIT');

    const [actionItems, nextSteps] = await Promise.all([
      pool.query(
        'SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY priority DESC, created_at',
        [meetingId],
      ),
      pool.query(
        'SELECT * FROM next_steps WHERE meeting_id = $1 ORDER BY due_date, created_at',
        [meetingId],
      ),
    ]);

    return {
      action_items: actionItems.rows.map((row) => decryptActionItemRow(row, vaultKey)),
      next_steps: nextSteps.rows.map((row) => decryptNextStepRow(row, vaultKey)),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
