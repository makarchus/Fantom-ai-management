import { Router } from 'express';
import { requireAuth, getUserId, getUserFathomKey } from '../middleware/auth.js';
import {
  listFathomMeetingsFromDb,
  syncFathomMeetingsForUser,
  moveFathomMeetingFolder,
  fetchFathomSummary,
  getRecorderEmailForUser,
} from '../lib/fathomSync.js';
import { listFolders } from '../lib/folders.js';
import { logError, sendError } from '../lib/httpErrors.js';

const router = Router();

router.use(requireAuth);

router.get('/status', (req, res) => {
  res.json({
    hasApiKey: Boolean(getUserFathomKey(req)),
    manualImportAvailable: true,
  });
});

// GET — read from local DB only (no Fathom API call)
router.get('/meetings', async (req, res) => {
  try {
    const userId = getUserId(req);
    const meetings = await listFathomMeetingsFromDb(userId);
    const hasKey = Boolean(getUserFathomKey(req));

    res.json({
      meetings,
      connected: hasKey,
      needsApiKey: !hasKey,
      total: meetings.length,
      fromCache: true,
      lastSyncedAt: req.user.fathom_synced_at,
    });
  } catch (err) {
    return sendError(res, err, 'fathom_list');
  }
});

// POST — user-initiated refresh from Fathom API
router.post('/meetings/sync', async (req, res) => {
  const apiKey = getUserFathomKey(req);
  if (!apiKey) {
    return res.status(400).json({ error: 'Add your Fathom API key in Settings first.' });
  }

  try {
    const userId = getUserId(req);
    const recorderEmail = await getRecorderEmailForUser(userId);
    const result = await syncFathomMeetingsForUser(userId, apiKey, { recorderEmail });
    req.user.fathom_synced_at = new Date().toISOString();
    res.json({
      meetings: result.meetings,
      connected: true,
      total: result.total,
      rateLimited: result.rateLimited,
      recorderEmail: result.recorderEmail,
      warning: result.rateLimited
        ? `Synced ${result.total} of your meetings. Fathom rate limit hit — click Refresh again in a few minutes.`
        : `Synced ${result.total} meetings recorded by ${result.recorderEmail}.`,
    });
  } catch (err) {
    const userId = getUserId(req);
    logError('POST /fathom/meetings/sync', err, { userId, status: err.status });
    const cached = await listFathomMeetingsFromDb(userId);
    if (cached.length) {
      return res.json({
        meetings: cached,
        connected: true,
        total: cached.length,
        rateLimited: err.status === 429,
        warning: err.status === 429
          ? 'Fathom rate limit hit. Showing cached meetings — try Refresh again in a few minutes.'
          : `Sync failed (${err.message}). Showing cached meetings.`,
      });
    }
    const status = err.status === 429 ? 429 : 500;
    res.status(status).json({
      error: err.status === 429
        ? 'Fathom rate limit exceeded. Wait a few minutes and try Refresh again.'
        : err.message,
    });
  }
});

router.patch('/meetings/:recordingId/folder', async (req, res) => {
  const { folder_id: folderId, category } = req.body;
  if (!folderId) return res.status(400).json({ error: 'folder_id is required' });

  try {
    const row = await moveFathomMeetingFolder(getUserId(req), req.params.recordingId, folderId, category);
    const folders = await listFolders();
    const folder = folders.find((f) => f.id === folderId);
    res.json({
      success: true,
      meeting: {
        recording_id: row.recording_id,
        folder_id: row.folder_id,
        folder_name: folder?.name,
        category: row.category,
        folder_locked: true,
      },
    });
  } catch (err) {
    return sendError(res, err, 'fathom_folder', err.status);
  }
});

router.get('/meetings/:fathomId/summary', async (req, res) => {
  const apiKey = getUserFathomKey(req);
  if (!apiKey) return res.status(400).json({ error: 'Add your Fathom API key in Settings first.' });

  try {
    const summary = await fetchFathomSummary(apiKey, req.params.fathomId);
    res.json({ summary });
  } catch (err) {
    logError('GET /fathom/meetings/:id/summary', err, {
      fathomId: req.params.fathomId,
      userId: getUserId(req),
      status: err.status,
      raw: err.raw,
    });
    return sendError(res, err, 'fathom_summary', err.status || 500);
  }
});

export default router;
