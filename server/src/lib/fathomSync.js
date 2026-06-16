import pool from '../db/pool.js';
import { categorizeWithRules } from './categorizeMeeting.js';
import { DEFAULT_FOLDERS } from './folders.js';
import { decryptFathomMeetingRow, encryptFathomMeetingRow } from './dataCrypto.js';
import { encryptString } from './encryption.js';
import { getUserSecrets } from './userSecrets.js';

const FATHOM_API_BASE = 'https://api.fathom.ai/external/v1';
const PAGE_DELAY_MS = 1200;
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fathomFetch(apiKey, path) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${FATHOM_API_BASE}${path}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Invalid response from Fathom API (HTTP ${res.status})`);
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const waitMs = Math.min(2000 * 2 ** attempt, 15000);
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) {
      const raw = data?.message || data?.error || `HTTP ${res.status}`;
      let message;
      if (res.status === 404) {
        message = path.includes('/summary')
          ? 'Fathom could not find a summary for this meeting yet. Click Refresh to sync, then try again.'
          : path.includes('/meetings/')
            ? 'This meeting was not found. It may have been deleted or not synced yet — try Refresh.'
            : 'The requested resource was not found.';
      } else if (res.status === 401) {
        message = 'Please sign in again to continue.';
      } else if (res.status === 429) {
        message = 'Fathom rate limit exceeded. Wait a few minutes and try Refresh.';
      } else if (data?.error) {
        message = data.error;
      } else {
        message = `Something went wrong (${raw}).`;
      }
      const err = new Error(message);
      err.status = res.status;
      err.raw = raw;
      throw err;
    }
    return data;
  }
  const err = new Error('Fathom API rate limit exceeded. Try again in a few minutes.');
  err.status = 429;
  throw err;
}

async function fetchAllFromFathom(apiKey, { recordedBy } = {}) {
  const allItems = [];
  let cursor = null;
  let rateLimited = false;

  for (;;) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (recordedBy) params.append('recorded_by[]', recordedBy);
    const qs = params.toString();
    const path = qs ? `/meetings?${qs}` : '/meetings';
    if (cursor) await sleep(PAGE_DELAY_MS);

    try {
      const data = await fathomFetch(apiKey, path);
      const pageItems = data.items || [];
      for (const item of pageItems) {
        if (recordedBy && item.recorded_by?.email) {
          if (item.recorded_by.email.toLowerCase() !== recordedBy.toLowerCase()) continue;
        }
        allItems.push(item);
      }
      cursor = data.next_cursor || null;
      if (!cursor) break;
    } catch (err) {
      if (err.status === 429) rateLimited = true;
      if (allItems.length > 0) break;
      throw err;
    }
  }

  return { items: allItems, rateLimited };
}

function mapFathomItem(m) {
  const start = m.recording_start_time || m.scheduled_start_time || m.created_at;
  const end = m.recording_end_time || m.scheduled_end_time;
  let duration_secs = null;
  if (start && end) duration_secs = Math.round((new Date(end) - new Date(start)) / 1000);

  const summary = m.default_summary?.markdown_formatted || null;

  return {
    recording_id: String(m.recording_id),
    recorded_by_email: m.recorded_by?.email || null,
    title: m.title || m.meeting_title || 'Untitled',
    meeting_date: start,
    duration_secs,
    participants: m.calendar_invitees || [],
    summary,
    action_items: m.action_items || [],
    raw_payload: m,
  };
}

const folderNames = Object.fromEntries(DEFAULT_FOLDERS.map((f) => [f.id, f.name]));

export async function getRecorderEmailForUser(userId, vaultKey) {
  const secrets = await getUserSecrets(userId, vaultKey);
  return secrets.fathomRecorderEmail?.trim() || null;
}

export async function listFathomMeetingsFromDb(userId, vaultKey) {
  const { rows } = await pool.query(
    `SELECT fm.*, f.name AS folder_name, f.sort_order AS folder_sort_order,
            m.id AS saved_meeting_id, m.processed_at AS saved_processed_at
     FROM fathom_meetings fm
     LEFT JOIN folders f ON f.id = fm.folder_id
     LEFT JOIN meetings m ON m.user_id = fm.user_id
       AND (m.fathom_id = fm.recording_id OR m.id = 'fathom_' || fm.recording_id)
     WHERE fm.user_id = $1
     ORDER BY f.sort_order ASC NULLS LAST, fm.meeting_date DESC NULLS LAST`,
    [userId],
  );

  return rows.map((row) => {
    const decrypted = decryptFathomMeetingRow(row, vaultKey);
    return {
      id: row.recording_id,
      recording_id: row.recording_id,
      title: decrypted.title,
      meeting_date: row.meeting_date,
      started_at: row.meeting_date,
      date: row.meeting_date,
      duration_secs: row.duration_secs,
      participants: decrypted.participants,
      default_summary: decrypted.summary ? { markdown_formatted: decrypted.summary } : null,
      action_items: decrypted.action_items,
      folder_id: row.folder_id,
      folder_name: row.folder_name || folderNames[row.folder_id] || 'Uncategorized',
      category: row.category,
      category_source: row.category_source,
      folder_locked: row.folder_locked,
      synced_at: row.synced_at,
      is_imported: Boolean(row.saved_meeting_id),
      saved_meeting_id: row.saved_meeting_id || null,
      saved_processed_at: row.saved_processed_at || null,
    };
  });
}

export async function syncFathomMeetingsForUser(userId, apiKey, options = {}) {
  const vaultKey = options.vaultKey;
  if (!vaultKey) {
    const err = new Error('Vault locked. Enter your private encryption key to continue.');
    err.status = 403;
    err.code = 'VAULT_LOCKED';
    throw err;
  }

  const recorderEmail = options.recorderEmail || await getRecorderEmailForUser(userId, vaultKey);
  if (!recorderEmail) {
    const err = new Error('Could not determine your Fathom recorder email. Add it in Settings.');
    err.status = 400;
    throw err;
  }

  console.log('[Fathom sync]', { userId, recorderEmail, filter: 'recorded_by[]' });

  const { items, rateLimited } = await fetchAllFromFathom(apiKey, { recordedBy: recorderEmail });
  const mappedItems = items.map(mapFathomItem);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existingRes = await client.query(
      'SELECT recording_id, folder_id, category, category_source, folder_locked FROM fathom_meetings WHERE user_id = $1',
      [userId],
    );
    const existing = Object.fromEntries(existingRes.rows.map((r) => [r.recording_id, r]));

    for (const item of mappedItems) {
      const prev = existing[item.recording_id];
      let folderId = prev?.folder_id || null;
      let category = prev?.category || null;
      let categorySource = prev?.category_source || null;
      const folderLocked = prev?.folder_locked || false;

      if (!folderLocked && !categorySource) {
        const cat = categorizeWithRules({
          title: item.title,
          summary: item.summary || '',
          participants: item.participants,
        });
        folderId = cat.folder_id;
        category = cat.category;
        categorySource = cat.source;
      }

      const encrypted = encryptFathomMeetingRow(item, vaultKey);

      await client.query(
        `INSERT INTO fathom_meetings (
          user_id, recording_id, title_enc, meeting_date, duration_secs,
          participants_enc, summary_enc, action_items_enc, raw_payload_enc,
          folder_id, category, category_source, folder_locked, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
        ON CONFLICT (user_id, recording_id) DO UPDATE SET
          title_enc = EXCLUDED.title_enc,
          meeting_date = EXCLUDED.meeting_date,
          duration_secs = EXCLUDED.duration_secs,
          participants_enc = EXCLUDED.participants_enc,
          summary_enc = EXCLUDED.summary_enc,
          action_items_enc = EXCLUDED.action_items_enc,
          raw_payload_enc = EXCLUDED.raw_payload_enc,
          synced_at = NOW(),
          folder_id = CASE WHEN fathom_meetings.folder_locked THEN fathom_meetings.folder_id ELSE EXCLUDED.folder_id END,
          category = CASE WHEN fathom_meetings.folder_locked THEN fathom_meetings.category ELSE EXCLUDED.category END,
          category_source = CASE WHEN fathom_meetings.folder_locked THEN fathom_meetings.category_source ELSE EXCLUDED.category_source END`,
        [
          userId, item.recording_id, encrypted.title_enc, item.meeting_date, item.duration_secs,
          encrypted.participants_enc, encrypted.summary_enc, encrypted.action_items_enc,
          encrypted.raw_payload_enc, folderId, category, categorySource, folderLocked,
        ],
      );
    }

    // Remove meetings no longer returned for this API key / recorder (full sync only)
    if (!rateLimited) {
      const syncedIds = mappedItems.map((item) => item.recording_id);
      if (syncedIds.length === 0) {
        await client.query('DELETE FROM fathom_meetings WHERE user_id = $1', [userId]);
      } else {
        await client.query(
          'DELETE FROM fathom_meetings WHERE user_id = $1 AND NOT (recording_id = ANY($2::text[]))',
          [userId, syncedIds],
        );
      }
    }

    await client.query('UPDATE users SET fathom_synced_at = NOW() WHERE id = $1', [userId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const meetings = await listFathomMeetingsFromDb(userId, vaultKey);
  return { meetings, rateLimited, total: meetings.length, recorderEmail };
}

export async function moveFathomMeetingFolder(userId, recordingId, folderId, category) {
  const { rows } = await pool.query(
    `UPDATE fathom_meetings
     SET folder_id = $1, category = $2, category_source = 'manual', folder_locked = true, synced_at = synced_at
     WHERE user_id = $3 AND recording_id = $4
     RETURNING *`,
    [folderId, category || null, userId, String(recordingId)],
  );
  if (!rows.length) {
    const err = new Error('Meeting not found in your local cache');
    err.status = 404;
    throw err;
  }
  return rows[0];
}

export async function fetchFathomSummary(apiKey, recordingId) {
  const data = await fathomFetch(apiKey, `/recordings/${recordingId}/summary`);
  const summaryObj = data.summary;
  return typeof summaryObj === 'string' ? summaryObj : summaryObj?.markdown_formatted || '';
}

/** Fetch fresh summary for a single meeting import (one API call). */
export async function fetchMeetingImportData(apiKey, recordingId, userId, vaultKey) {
  const rid = String(recordingId);
  let summary = '';

  const cached = await pool.query(
    'SELECT summary_enc FROM fathom_meetings WHERE user_id = $1 AND recording_id = $2',
    [userId, rid],
  );
  if (cached.rows[0]?.summary_enc) {
    const row = decryptFathomMeetingRow(cached.rows[0], vaultKey);
    summary = row.summary || '';
  }

  if (apiKey) {
    try {
      const fresh = await fetchFathomSummary(apiKey, rid);
      if (fresh) {
        summary = fresh;
        await pool.query(
          `UPDATE fathom_meetings SET summary_enc = $1 WHERE user_id = $2 AND recording_id = $3`,
          [encryptString(summary, vaultKey), userId, rid],
        );
      }
    } catch (err) {
      console.warn('[Fathom import] Summary fetch failed:', {
        recordingId: rid,
        userId,
        message: err.message,
        status: err.status,
        raw: err.raw,
      });
      if (!summary) throw err;
    }
  }

  return { summary, actionItems: [] };
}
