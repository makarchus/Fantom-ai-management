import { Router } from 'express';
import pool from '../db/pool.js';
import { listFolders, createFolder, deleteFolderIfEmpty } from '../lib/folders.js';
import { categorizeWithRules } from '../lib/categorizeMeeting.js';
import { requireAuth, getUserId, getVaultKey, requireVault } from '../middleware/auth.js';
import { sendError, logError, friendlyError } from '../lib/httpErrors.js';
import { extractActionItems } from '../lib/extractActionItems.js';
import { persistExtraction } from '../lib/meetingItems.js';
import {
  decryptActionItemRow,
  decryptFathomMeetingRow,
  decryptMeetingRow,
  decryptNextStepRow,
  decryptTranscriptRow,
  encryptActionItemRow,
} from '../lib/dataCrypto.js';

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

router.get('/commitments/all', requireVault, async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const userId = getUserId(req);
    const { rows } = await pool.query(
      `SELECT ai.*, m.meeting_date, m.title_enc, m.id AS meeting_id
       FROM action_items ai
       JOIN meetings m ON m.id = ai.meeting_id
       WHERE m.user_id = $1 AND ai.commitment_type IN ('commitment', 'next_step')
       ORDER BY m.meeting_date DESC, ai.priority DESC`,
      [userId],
    );

    const commitments = rows.map((row) => {
      const item = decryptActionItemRow(row, vaultKey);
      const meeting = decryptMeetingRow({ title_enc: row.title_enc }, vaultKey);
      return {
        ...item,
        meeting_id: row.meeting_id,
        meeting_title: meeting.title,
        meeting_date: row.meeting_date,
      };
    });

    res.json({ commitments });
  } catch (err) {
    return sendError(res, err, 'commitments');
  }
});

router.get('/', requireVault, async (req, res) => {
  try {
    const userId = getUserId(req);
    const vaultKey = getVaultKey(req);
    const { q, folder_id: folderId } = req.query;
    const values = [userId];
    const conditions = ['m.user_id = $1'];

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

    let meetings = rows.map((row) => {
      const decrypted = decryptMeetingRow(row, vaultKey);
      return {
        ...decrypted,
        folder_name: row.folder_name,
        folder_sort_order: row.folder_sort_order,
        action_item_count: Number(row.action_item_count),
        next_step_count: Number(row.next_step_count),
        has_transcript: Number(row.has_transcript) > 0,
      };
    });

    if (q?.trim()) {
      const needle = q.trim().toLowerCase();
      meetings = meetings.filter((m) =>
        m.title?.toLowerCase().includes(needle)
        || m.summary?.toLowerCase().includes(needle)
        || m.category?.toLowerCase().includes(needle)
        || m.folder_name?.toLowerCase().includes(needle));
    }

    res.json({ meetings });
  } catch (err) {
    return sendError(res, err, 'meetings_list');
  }
});

router.get('/:id', requireVault, async (req, res) => {
  const { id } = req.params;
  const userId = getUserId(req);
  const vaultKey = getVaultKey(req);
  const bareId = id.replace(/^fathom_/, '');
  const prefixedId = id.startsWith('fathom_') || id.startsWith('manual_') ? id : `fathom_${bareId}`;

  try {
    const meetingRes = await pool.query(
      `SELECT m.*, f.name AS folder_name
       FROM meetings m
       LEFT JOIN folders f ON f.id = m.folder_id
       WHERE m.user_id = $1
         AND (m.id = $2 OR m.id = $3 OR m.fathom_id = $2 OR m.fathom_id = $4)`,
      [userId, id, prefixedId, bareId],
    );

    if (!meetingRes.rows.length) {
      logError('GET /meetings/:id', new Error('Meeting not found'), { id, prefixedId, bareId, userId });
      return res.status(404).json({ error: friendlyError({ status: 404 }, 'saved_meeting') });
    }

    const meeting = decryptMeetingRow(meetingRes.rows[0], vaultKey);
    meeting.folder_name = meetingRes.rows[0].folder_name;
    const lookupId = meeting.id;

    const [actionItems, nextSteps, transcriptRes] = await Promise.all([
      pool.query('SELECT * FROM action_items WHERE meeting_id = $1 ORDER BY priority DESC, created_at', [lookupId]),
      pool.query('SELECT * FROM next_steps WHERE meeting_id = $1 ORDER BY due_date, created_at', [lookupId]),
      pool.query('SELECT * FROM transcripts WHERE meeting_id = $1', [lookupId]),
    ]);

    let actionItemsRows = actionItems.rows.map((row) => decryptActionItemRow(row, vaultKey));
    let nextStepsRows = nextSteps.rows.map((row) => decryptNextStepRow(row, vaultKey));

    if (actionItemsRows.length === 0 && nextStepsRows.length === 0 && meeting.summary) {
      let fathomActionItems = [];
      if (meeting.fathom_id) {
        const cached = await pool.query(
          'SELECT action_items_enc FROM fathom_meetings WHERE user_id = $1 AND recording_id = $2',
          [userId, String(meeting.fathom_id)],
        );
        if (cached.rows[0]?.action_items_enc) {
          const fm = decryptFathomMeetingRow(cached.rows[0], vaultKey);
          fathomActionItems = fm.action_items || [];
        }
      }

      const extracted = await extractActionItems({
        summary: meeting.summary,
        fathomActionItems,
      });

      if (extracted?.action_items?.length || extracted?.next_steps?.length) {
        const saved = await persistExtraction(lookupId, extracted, vaultKey);
        actionItemsRows = saved.action_items;
        nextStepsRows = saved.next_steps;
      }
    }

    const transcript = transcriptRes.rows[0]
      ? decryptTranscriptRow(transcriptRes.rows[0], vaultKey)
      : null;

    res.json({
      meeting,
      action_items: actionItemsRows,
      next_steps: nextStepsRows,
      transcript,
    });
  } catch (err) {
    return sendError(res, err, 'meeting_detail');
  }
});

router.patch('/:id', requireVault, async (req, res) => {
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
    const meeting = decryptMeetingRow(rows[0], getVaultKey(req));
    res.json({ meeting });
  } catch (err) {
    return sendError(res, err, 'meeting_update');
  }
});

router.post('/organize', requireVault, async (req, res) => {
  const userId = getUserId(req);
  const vaultKey = getVaultKey(req);
  try {
    const { rows } = await pool.query(
      `SELECT id, title_enc, summary_enc, participants_enc FROM meetings
       WHERE user_id = $1 AND folder_locked = false AND category_source IS NULL`,
      [userId],
    );
    let updated = 0;

    for (const row of rows) {
      const meeting = decryptMeetingRow(row, vaultKey);
      const cat = categorizeWithRules({
        title: meeting.title,
        summary: meeting.summary,
        participants: meeting.participants,
      });
      await pool.query(
        `UPDATE meetings SET folder_id = $1, category = $2, category_source = $3
         WHERE id = $4 AND user_id = $5`,
        [cat.folder_id, cat.category, cat.source, row.id, userId],
      );
      updated += 1;
    }

    res.json({ success: true, updated });
  } catch (err) {
    return sendError(res, err, 'meetings_organize');
  }
});

router.patch('/action-items/:id', requireVault, async (req, res) => {
  const { id } = req.params;
  const vaultKey = getVaultKey(req);
  const { status, priority, due_date, notes, assignee, description } = req.body;
  const sets = [];
  const values = [];
  let idx = 1;

  if (status !== undefined) { sets.push(`status = $${idx++}`); values.push(status); }
  if (priority !== undefined) { sets.push(`priority = $${idx++}`); values.push(priority); }
  if (due_date !== undefined) { sets.push(`due_date = $${idx++}`); values.push(due_date); }
  if (notes !== undefined) {
    sets.push(`notes_enc = $${idx++}`);
    values.push(notes ? encryptActionItemRow({ assignee: 'x', description: 'x', notes }, vaultKey).notes_enc : null);
  }
  if (assignee !== undefined) {
    sets.push(`assignee_enc = $${idx++}`);
    values.push(encryptActionItemRow({ assignee, description: 'x' }, vaultKey).assignee_enc);
  }
  if (description !== undefined) {
    sets.push(`description_enc = $${idx++}`);
    values.push(encryptActionItemRow({ assignee: 'x', description }, vaultKey).description_enc);
  }

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
    res.json({ action_item: decryptActionItemRow(rows[0], vaultKey) });
  } catch (err) {
    return sendError(res, err, 'action_item_update');
  }
});

router.patch('/next-steps/:id', requireVault, async (req, res) => {
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
    res.json({ next_step: decryptNextStepRow(rows[0], getVaultKey(req)) });
  } catch (err) {
    return sendError(res, err, 'next_step_update');
  }
});

router.delete('/:id', requireVault, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM meetings WHERE id = $1 AND user_id = $2', [id, getUserId(req)]);
    res.json({ success: true });
  } catch (err) {
    return sendError(res, err, 'meeting_delete');
  }
});

export default router;
