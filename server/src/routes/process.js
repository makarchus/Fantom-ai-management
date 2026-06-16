import { Router } from 'express';
import pool from '../db/pool.js';
import { extractActionItems } from '../lib/extractActionItems.js';
import { persistExtraction } from '../lib/meetingItems.js';
import { categorizeWithRules } from '../lib/categorizeMeeting.js';
import { requireAuth, getUserId, getUserFathomKey } from '../middleware/auth.js';
import { fetchMeetingImportData } from '../lib/fathomSync.js';
import { sendError, logError } from '../lib/httpErrors.js';

const router = Router();
router.use(requireAuth);

router.post('/meeting', async (req, res) => {
  const userId = getUserId(req);
  const {
    meetingId,
    fathomId,
    title,
    meetingDate,
    summary,
    transcript,
    participants,
    fathomActionItems,
    folder_id: presetFolderId,
    category: presetCategory,
    folder_locked: presetLocked,
  } = req.body;

  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  const bareRecordingId = String(fathomId || meetingId).replace(/^fathom_/, '');
  const dbMeetingId = meetingId.startsWith('manual_')
    ? meetingId
    : (meetingId.startsWith('fathom_') ? meetingId : `fathom_${bareRecordingId}`);

  try {
    const existing = await pool.query(
      `SELECT id, processed_at FROM meetings
       WHERE user_id = $1 AND (id = $2 OR fathom_id = $3)`,
      [userId, dbMeetingId, bareRecordingId],
    );
    if (existing.rows.length) {
      return res.status(409).json({
        error: 'This meeting has already been imported and processed.',
        alreadyImported: true,
        meetingId: existing.rows[0].id,
        processed_at: existing.rows[0].processed_at,
      });
    }

    let summaryText = summary;
    let actionItems = fathomActionItems || [];
    const recordingId = bareRecordingId;
    const apiKey = getUserFathomKey(req);

    if (apiKey && recordingId) {
      const fresh = await fetchMeetingImportData(apiKey, recordingId, userId);
      if (fresh.summary) summaryText = fresh.summary;
      if (fresh.actionItems?.length) actionItems = fresh.actionItems;
    }

    if (!summaryText) {
      return res.status(400).json({ error: 'Meeting summary is required' });
    }

    const content = `## MEETING SUMMARY\n${summaryText}`;
    const extracted = await extractActionItems({ summary: summaryText, fathomActionItems: actionItems });

    let folderId = presetFolderId || null;
    let category = presetCategory || null;
    let categorySource = presetLocked ? 'manual' : null;
    let folderLocked = Boolean(presetLocked);

    if (!folderId) {
      const fathomRow = await pool.query(
        'SELECT folder_id, category, category_source, folder_locked FROM fathom_meetings WHERE user_id = $1 AND recording_id = $2',
        [userId, recordingId],
      );
      if (fathomRow.rows[0]) {
        folderId = fathomRow.rows[0].folder_id;
        category = fathomRow.rows[0].category;
        categorySource = fathomRow.rows[0].category_source;
        folderLocked = fathomRow.rows[0].folder_locked;
      } else {
        const cat = categorizeWithRules({
          title: title || 'Untitled Meeting',
          summary: summaryText,
          participants: participants || extracted?.participants_mentioned || [],
        });
        folderId = cat.folder_id;
        category = cat.category;
        categorySource = cat.source;
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO meetings (
          id, user_id, fathom_id, title, meeting_date, participants, summary, summary_raw,
          folder_id, category, category_source, folder_locked, processed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          summary_raw = EXCLUDED.summary_raw,
          participants = EXCLUDED.participants,
          processed_at = NOW(),
          updated_at = NOW(),
          folder_id = CASE WHEN meetings.folder_locked THEN meetings.folder_id ELSE EXCLUDED.folder_id END,
          category = CASE WHEN meetings.folder_locked THEN meetings.category ELSE EXCLUDED.category END,
          category_source = CASE WHEN meetings.folder_locked THEN meetings.category_source ELSE EXCLUDED.category_source END`,
        [
          dbMeetingId, userId, bareRecordingId, title || 'Untitled Meeting',
          meetingDate || null,
          JSON.stringify(participants || extracted?.participants_mentioned || []),
          summaryText || '', content,
          folderId, category, categorySource, folderLocked,
        ],
      );

      if (transcript) {
        await client.query(
          `INSERT INTO transcripts (meeting_id, content) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [dbMeetingId, transcript],
        );
      }

      await client.query('COMMIT');
    } catch (dbErr) {
      await client.query('ROLLBACK');
      throw dbErr;
    } finally {
      client.release();
    }

    const saved = await persistExtraction(dbMeetingId, extracted);
    const itemCount = saved.action_items.length;
    const stepCount = saved.next_steps.length;

      res.json({
        success: true,
        meetingId: dbMeetingId,
        source: extracted?.source || 'none',
        warning: (itemCount + stepCount) > 0
          ? null
          : 'Meeting saved. No action items were found in the Fathom summary yet.',
        category: { folder_id: folderId, category, source: categorySource },
        extracted: extracted || { action_items: [], next_steps: [], key_decisions: [] },
        counts: {
          action_items: itemCount,
          next_steps: stepCount,
          key_decisions: (extracted?.key_decisions || []).length,
        },
      });
  } catch (err) {
    return sendError(res, err, 'process_meeting', err.status);
  }
});

export default router;
