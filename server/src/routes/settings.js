import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, getUserId, getVaultKey, requireVault } from '../middleware/auth.js';
import { syncFathomMeetingsForUser, getRecorderEmailForUser } from '../lib/fathomSync.js';
import { getUserSecrets, saveUserSecrets } from '../lib/userSecrets.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireVault, async (req, res) => {
  try {
    const vaultKey = getVaultKey(req);
    const secrets = await getUserSecrets(getUserId(req), vaultKey);
    const { rows } = await pool.query(
      `SELECT id, email, name, avatar_url, fathom_synced_at, fathom_api_key_enc
       FROM users WHERE id = $1`,
      [getUserId(req)],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      settings: {
        email: user.email,
        name: user.name,
        hasFathomKey: Boolean(user.fathom_api_key_enc),
        fathom_synced_at: user.fathom_synced_at,
        fathom_recorder_email: secrets.fathomRecorderEmail || user.email,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.patch('/', requireVault, async (req, res) => {
  const userId = getUserId(req);
  const vaultKey = getVaultKey(req);
  const { fathom_api_key: fathomApiKey, fathom_recorder_email: fathomRecorderEmail } = req.body;

  if (fathomApiKey === undefined && fathomRecorderEmail === undefined) {
    return res.status(400).json({ error: 'fathom_api_key or fathom_recorder_email is required' });
  }

  try {
    const prevSecrets = await getUserSecrets(userId, vaultKey);
    const trimmedKey = fathomApiKey !== undefined ? (fathomApiKey?.trim() || null) : prevSecrets.fathomApiKey;
    const trimmedRecorder = fathomRecorderEmail !== undefined
      ? (fathomRecorderEmail?.trim() || null)
      : prevSecrets.fathomRecorderEmail;

    const keyChanged = fathomApiKey !== undefined && trimmedKey !== prevSecrets.fathomApiKey;
    const recorderChanged = fathomRecorderEmail !== undefined
      && trimmedRecorder !== prevSecrets.fathomRecorderEmail;

    await saveUserSecrets(userId, vaultKey, {
      fathomApiKey: trimmedKey,
      fathomRecorderEmail: trimmedRecorder,
    });

    if (keyChanged || recorderChanged) {
      await pool.query('DELETE FROM fathom_meetings WHERE user_id = $1', [userId]);
    }

    let syncResult = null;
    const shouldSync = trimmedKey && (keyChanged || recorderChanged || !prevSecrets.fathomApiKey);
    if (shouldSync) {
      try {
        const recorderEmail = trimmedRecorder || req.user.email;
        syncResult = await syncFathomMeetingsForUser(userId, trimmedKey, {
          recorderEmail,
          vaultKey,
        });
      } catch (syncErr) {
        console.warn('Fathom sync after settings save failed:', syncErr.message);
        return res.json({
          success: true,
          settings: {
            hasFathomKey: Boolean(trimmedKey),
            fathom_recorder_email: trimmedRecorder || req.user.email,
          },
          syncWarning: syncErr.message,
        });
      }
    }

    res.json({
      success: true,
      settings: {
        hasFathomKey: Boolean(trimmedKey),
        fathom_recorder_email: trimmedRecorder || req.user.email,
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
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

export default router;
