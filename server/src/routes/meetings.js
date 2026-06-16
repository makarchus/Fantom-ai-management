import { Router } from 'express';
import pool from '../db/pool.js';
import { listFolders, createFolder, deleteFolderIfEmpty } from '../lib/folders.js';
import { categorizeWithRules } from '../lib/categorizeMeeting.js';
import { requireAuth, getUserId } from '../middleware/auth.js';
import { sendError, logError, friendlyError } from '../lib/httpErrors.js';
import { extractActionItems } from '../lib/extractActionItems.js';
import { persistExtraction } from '../lib/meetingItems.js';

const router = Router();
router.use(requireAuth);

router.get('/folders', async (req, res) => {
  try {
    const folders = await listFolders();
    res.json({ folders });
  } catch (err) {
    return sendError(res, err, 'meetings_folders');
  }
});

router.post('/folders', async (req, res) => {
  const { name } = req.body;
  try {
    const folder = await createFolder(name);
    res.status(201).json({ folder });
  } catch (err) {
    return sendError(res, err, 'folder_create', err.status);
  }
});

router.delete('/folders/:folderId', async (req, res) => {
  try {
    await deleteFolderIfEmpty(req.params.folderId);
    res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'folder_delete', err.status);
  }
});

router.get('/commitments/all', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cv.* FROM commitments_view cv
       JOIN meetings m ON m.id = cv.meeting_id
       WHERE m.user_id = $1
       ORDER BY cv.meeting_date DESC, cv.priority DESC`,
      [getUserId(req)],
    );
    res.json({ commitments: rows });
  } catch (err) {
    return sendError(res, err, 'commitments');
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { q, folder_id: folderId } = req.query;
    const values = [userId];
    const conditions = ['m.user_id = $1'];

    if (q?.trim()) {
      values.push(`%${q.trim()}%`);
      const idx = values.length;
      conditions.push(`(
        m.title ILIKE $${idx}
        OR m.summary ILIKE $${idx}
        OR m.category ILIKE $${idx}
        OR f.name ILIKE $${idx}
      )`);
    }

    if (folderId) {
      values.push(folderId);
      conditions.push(`m.folder_id = $${values.length}`);
    }

    const { rows } = await pool.query(`
      SELECT
        m.*,
        f.name AS folder_name,
        f.sort_order AS folder_sort_order,
        COUNT(DISTINCT ai.id) AS action_item_count,
        COUNT(DISTINCT ns.id) AS next_step_count,
        COUNT(DISTINCT t.id) AS has_transcript
      FROM meetings m
      LEFT JOIN folders f ON f.id = m.folder_id
      LEFT JOIN action_items ai ON ai.meeting_id = m.id
      LEFT JOIN next_steps ns ON ns.meeting_id = m.id
      LEFT JOIN transcripts t ON t.meeting_id = m.id
      WHERE ${conditions.join(' AND ')}
      GROUP BY m.id, f.name, f.sort_order
      ORDER BY f.sort_order ASC NULLS LAST, m.meeting_date DESC NULLS LAST, m.created_at DESC
    `, values);

    res.json({ meetings: rows });
  } catch (err) {
    return sendError(res, err, 'meetings_list');
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const bareId = id.replace(/^fathom_/, '');
  const prefixedId = id.startsWith('fathom_') || id.startsWith('manual_') ? id : `fathom_${bareId}`;

  try {
    let meetingRes = await pool.query(
      `SELECT m.*, f.name AS folder_name
       FROM meetings m
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE (m.id = $2 OR m.id = $3 OR m.fathom_id = $2 OR m.fathom_id = $4)
         AND (m.user_id = $1 OR m.user_id IS NULL)`,
      [userId, id, prefixedId, bareId],
    );

    if (meetingRes.rows.length && meetingRes.rows[0].user_id == null) {
      await pool.query('UPDATE meetings SET user_id = $1 WHERE id = $2 AND user_id IS NULL', [
        userId,
        meetingRes.rows[0].id,
      ]);
      meetingRes.rows[0].user_id = userId;
    }

    if (!meetingRes.rows.length) {
      logError('GET /meetings/:id', new Error('Meeting not found'), { id, prefixedId, bareId, userId });
      return res.status(404).json({ error: friendlyError({ status: 404 }, 'saved_meeting') });
    }

    const meeting = meetingRes.rows[0];
    const lookupId = meeting.id;

    const [actionItems, nextSteps, transcriptRes] = await Promise.all([
      pool.query('SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY priority DESC, assignee, created_at', [lookupId]),
      pool.query('SELECT * FROM next_steps WHERE meeting_id = $1 ORDER BY due_date, created_at', [lookupId]),
      pool.query('SELECT content, speakers, imported_at FROM transcripts WHERE meeting_id = $1', [lookupId]),
    ]);

    let actionItemsRows = actionItems.rows;
    let nextStepsRows = nextSteps.rows;

    // Re-extract from summary when items are missing (e.g. legacy imports or improved parser)
    if (actionItemsRows.length === 0 && nextStepsRows.length === 0 && meeting.summary) {
      let fathomActionItems = [];
      if (meeting.fathom_id) {
        const cached = await pool.query(
          'SELECT action_items FROM fathom_meetings WHERE user_id = $1 AND recording_id = $2',
          [userId, String(meeting.fathom_id)],
        );
        const raw = cached.rows[0]?.action_items;
        if (Array.isArray(raw)) fathomActionItems = raw;
        else if (typeof raw === 'string') {
          try { fathomActionItems = JSON.parse(raw); } catch { /* ignore */ }
        }
      }

      const extracted = await extractActionItems({
        summary: meeting.summary,
        fathomActionItems,
      });

      if (extracted?.action_items?.length || extracted?.next_steps?.length) {
        const saved = await persistExtraction(lookupId, extracted);
        actionItemsRows = saved.action_items;
        nextStepsRows = saved.next_steps;
      }
    }

    res.json({
      meeting,
      action_items: actionItemsRows,
      next_steps: nextStepsRows,
      transcript: transcriptRes.rows[0] || null,
    });
  } catch (err) {
    return sendError(res, err, 'meeting_detail');
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const { folder_id: folderId, category } = req.body;

  const sets = [];
  const values = [];
  let idx = 1;

  if (folderId !== undefined) {
    sets.push(`folder_id = $${idx++}`);
    values.push(folderId || null);
  }
  if (category !== undefined) {
    sets.push(`category = $${idx++}`);
    values.push(category);
  }
  if (folderId !== undefined || category !== undefined) {
    sets.push(`category_source = $${idx++}`);
    values.push('manual');
    sets.push(`folder_locked = $${idx++}`);
    values.push(true);
  }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(id, userId);
  try {
    const { rows } = await pool.query(
      `UPDATE meetings SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} RETURNING *`,
      values,
    );
    if (!rows.length) {
      logError('PATCH /meetings/:id', new Error('Meeting not found'), { id, userId });
      return res.status(404).json({ error: friendlyError({ status: 404 }, 'saved_meeting') });
    }
    res.json({ meeting: rows[0] });
  } catch (err) {
    return sendError(res, err, 'meeting_update');
  }
});

router.post('/organize', async (req, res) => {
  const userId = getUserId(req);
  try {
    const { rows } = await pool.query(
      `SELECT id, title, summary, participants FROM meetings
       WHERE user_id = $1 AND folder_locked = false AND category_source IS NULL`,
      [userId],
    );
    let updated = 0;

    for (const meeting of rows) {
      const participants = typeof meeting.participants === 'string'
        ? JSON.parse(meeting.participants)
        : meeting.participants;
      const cat = categorizeWithRules({
        title: meeting.title,
        summary: meeting.summary,
        participants,
      });
      await pool.query(
        `UPDATE meetings SET folder_id = $1, category = $2, category_source = $3
         WHERE id = $4 AND user_id = $5`,
        [cat.folder_id, cat.category, cat.source, meeting.id, userId],
      );
      updated += 1;
    }

    res.json({ success: true, updated });
  } catch (err) {
    return sendError(res, err, 'meetings_organize');
  }
});

router.patch('/action-items/:id', async (req, res) => {
  const { id } = req.params;
  const { status, priority, due_date, notes, assignee, description } = req.body;
  const sets = [];
  const values = [];
  let idx = 1;

  if (status !== undefined) { sets.push(`status = $${idx++}`); values.push(status); }
  if (priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(priority); }
  if (due_date !== undefined) { sets.push(`due_date = $${idx++}`); values.push(due_date); }
  if (notes !== undefined) { sets.push(`notes = $${idx++}`); values.push(notes); }
  if (assignee !== undefined) { sets.push(`assignee = $${idx++}`); values.push(assignee); }
  if (description !== undefined) { sets.push(`description = $${idx++}`); values.push(description); }

  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });

  values.push(id);
  try {
    const { rows } = await pool.query(
      `UPDATE action_items SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!rows.length) {
      logError('PATCH /action-items/:id', new Error('Action item not found'), { id });
      return res.status(404).json({ error: 'That action item was not found. Try refreshing the page.' });
    }
    res.json({ action_item: rows[0] });
  } catch (err) {
    return sendError(res, err, 'action_item_update');
  }
});

router.patch('/next-steps/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE next_steps SET status = $1 WHERE id = $2 RETURNING *',
      [status, id],
    );
    if (!rows.length) {
      logError('PATCH /next-steps/:id', new Error('Next step not found'), { id });
      return res.status(404).json({ error: 'That next step was not found. Try refreshing the page.' });
    }
    res.json({ next_step: rows[0] });
  } catch (err) {
    return sendError(res, err, 'next_step_update');
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM meetings WHERE id = $1 AND user_id = $2', [id, getUserId(req)]);
    res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'meeting_delete');
  }
});

export default router;
