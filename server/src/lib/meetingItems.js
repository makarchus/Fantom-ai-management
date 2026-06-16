import pool from '../db/pool.js';

/** Save extracted action items and next steps for a meeting (replaces existing). */
export async function persistExtraction(meetingId, extracted) {
  if (!extracted) return { action_items: [], next_steps: [] };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM action_items WHERE meeting_id = $1', [meetingId]);
    await client.query('DELETE FROM next_steps WHERE meeting_id = $1', [meetingId]);

    for (const item of extracted.action_items || []) {
      await client.query(
        `INSERT INTO action_items (meeting_id, assignee, description, commitment_type, priority, due_date, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          meetingId,
          item.assignee || 'Unassigned',
          item.description,
          item.commitment_type || 'action',
          item.priority || 'medium',
          item.due_date || null,
          item.notes || null,
        ],
      );
    }

    for (const step of extracted.next_steps || []) {
      await client.query(
        `INSERT INTO next_steps (meeting_id, description, owner, due_date) VALUES ($1,$2,$3,$4)`,
        [meetingId, step.description, step.owner || null, step.due_date || null],
      );
    }

    await client.query('COMMIT');

    const [actionItems, nextSteps] = await Promise.all([
      pool.query(
        'SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY priority DESC, assignee, created_at',
        [meetingId],
      ),
      pool.query(
        'SELECT * FROM next_steps WHERE meeting_id = $1 ORDER BY due_date, created_at',
        [meetingId],
      ),
    ]);

    return { action_items: actionItems.rows, next_steps: nextSteps.rows };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
