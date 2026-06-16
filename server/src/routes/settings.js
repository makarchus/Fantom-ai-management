import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, getUserId } from '../middleware/auth.js';
import { syncFathomMeetingsForUser, getRecorderEmailForUser } from '../lib/fathomSync.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, name, avatar_url, fathom_api_key, fathom_synced_at, fathom_recorder_email
       FROM users WHERE id = $1`,
      [getUserId(req)],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      settings: {
        email: user.email,
        name: user.name,
        hasFathomKey: Boolean(user.fathom_api_key),
        fathom_synced_at: user.fathom_synced_at,
        fathom_recorder_email: user.fathom_recorder_email || user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', async (req, res) => {
  const userId = getUserId(req);
  const { fathom_api_key: fathomApiKey, fathom_recorder_email: fathomRecorderEmail } = req.body;

  if (fathomApiKey === undefined && fathomRecorderEmail === undefined) {
    return res.status(400).json({ error: 'fathom_api_key or fathom_recorder_email is required' });
  }

  try {
    const prev = await pool.query(
      'SELECT fathom_api_key, fathom_recorder_email, email FROM users WHERE id = $1',
      [userId],
    );
    const prevRow = prev.rows[0];
    const prevKey = prevRow?.fathom_api_key || null;

    const trimmedKey = fathomApiKey !== undefined ? (fathomApiKey?.trim() || null) : prevKey;
    const trimmedRecorder = fathomRecorderEmail !== undefined
      ? (fathomRecorderEmail?.trim() || null)
      : (prevRow?.fathom_recorder_email || null);

    const keyChanged = fathomApiKey !== undefined && trimmedKey !== prevKey;
    const recorderChanged = fathomRecorderEmail !== undefined
      && trimmedRecorder !== (prevRow?.fathom_recorder_email || null);

    const sets = ['updated_at = NOW()'];
    const values = [];
    let idx = 1;

    if (fathomApiKey !== undefined) {
      sets.push(`fathom_api_key = $${idx++}`);
      values.push(trimmedKey);
    }
    if (fathomRecorderEmail !== undefined) {
      sets.push(`fathom_recorder_email = $${idx++}`);
      values.push(trimmedRecorder);
    }

    values.push(userId);
    await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}`,
      values,
    );

    if (trimmedKey) req.user.fathom_api_key = trimmedKey;

    if (keyChanged || recorderChanged) {
      await pool.query('DELETE FROM fathom_meetings WHERE user_id = $1', [userId]);
    }

    let syncResult = null;
    const shouldSync = trimmedKey && (keyChanged || recorderChanged || !prevKey);
    if (shouldSync) {
      try {
        const recorderEmail = trimmedRecorder || prevRow?.email;
        syncResult = await syncFathomMeetingsForUser(userId, trimmedKey, { recorderEmail });
      } catch (syncErr) {
        console.warn('Fathom sync after settings save failed:', syncErr.message);
        return res.json({
          success: true,
          settings: {
            hasFathomKey: Boolean(trimmedKey),
            fathom_recorder_email: trimmedRecorder || prevRow?.email,
          },
          syncWarning: syncErr.message,
        });
      }
    }

    res.json({
      success: true,
      settings: {
        hasFathomKey: Boolean(trimmedKey),
        fathom_recorder_email: trimmedRecorder || prevRow?.email,
      },
      initialSync: syncResult
        ? {
            total: syncResult.total,
            rateLimited: syncResult.rateLimited,
            recorderEmail: syncResult.recorderEmail,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
