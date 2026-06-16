import pool from '../db/pool.js';
import { DEFAULT_FOLDERS } from './folders.js';

const FOLDER_KEYWORDS = [
  {
    folderId: 'sales-clients',
    keywords: ['sales', 'demo', 'proposal', 'client', 'prospect', 'deal', 'rfp', 'pitch', 'discovery', '[ext]', 'external', 'banner', 'account exec'],
    categories: ['Client Call', 'Sales Demo', 'Discovery Call'],
  },
  {
    folderId: 'engineering-product',
    keywords: ['engineering', 'eng ', 'sprint', 'standup', 'retro', 'tech', 'product', 'roadmap', 'architecture', 'deploy', 'bug', 'api', 'dev', 'code review', 'scrum'],
    categories: ['Sprint Planning', 'Technical Review', 'Product Sync'],
  },
  {
    folderId: 'one-on-one-team',
    keywords: ['1:1', '1-1', 'one on one', 'one-on-one', 'weekly sync', 'team sync', 'check-in', 'check in', 'standup', 'all hands', 'team meeting', 'internal'],
    categories: ['1:1', 'Team Sync', 'Check-in'],
  },
  {
    folderId: 'leadership-strategy',
    keywords: ['board', 'strategy', 'okr', 'quarterly', 'qbr', 'executive', 'leadership', 'planning', 'budget', 'all-hands', 'vision', 'goals'],
    categories: ['Strategy', 'QBR', 'Leadership'],
  },
  {
    folderId: 'customer-success',
    keywords: ['customer success', 'cs ', 'onboarding', 'support', 'renewal', 'implementation', 'training', 'health check'],
    categories: ['Onboarding', 'Customer Review', 'Support'],
  },
  {
    folderId: 'vendor-partnerships',
    keywords: ['vendor', 'partner', 'integration', 'contract', 'procurement', 'supplier'],
    categories: ['Partnership', 'Vendor Review'],
  },
];

function pickCategory(folderId, title) {
  const rule = FOLDER_KEYWORDS.find((r) => r.folderId === folderId);
  if (!rule) return 'General';
  const t = title.toLowerCase();
  for (const cat of rule.categories) {
    if (t.includes(cat.toLowerCase().replace(/[^a-z0-9 ]/g, ''))) return cat;
  }
  return rule.categories[0];
}

export function categorizeWithRules({ title = '', summary = '', participants = [] }) {
  const text = `${title} ${summary}`.toLowerCase();
  let bestFolder = 'uncategorized';
  let bestScore = 0;

  for (const rule of FOLDER_KEYWORDS) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (text.includes(kw)) score += kw.length > 4 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestFolder = rule.folderId;
    }
  }

  const hasExternal = Array.isArray(participants)
    && participants.some((p) => p?.is_external || p?.isExternal);
  if (bestScore === 0 && (text.includes('[ext]') || hasExternal)) {
    bestFolder = 'sales-clients';
  }

  return {
    folder_id: bestFolder,
    category: pickCategory(bestFolder, title),
    source: 'rules',
  };
}

export async function categorizeWithAI(meetings) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || meetings.length === 0) return null;

  const folderList = DEFAULT_FOLDERS.filter((f) => f.id !== 'uncategorized')
    .map((f) => `- ${f.id}: ${f.name}`)
    .join('\n');

  const payload = meetings.map((m) => ({
    id: String(m.recording_id || m.id || m.fathom_id),
    title: m.title || 'Untitled',
    summary_snippet: (m.summary || m.default_summary?.markdown_formatted || '').slice(0, 400),
  }));

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You categorize meetings into folders for organization.
Available folder ids:
${folderList}
- uncategorized: Uncategorized

For each meeting return folder_id (exact id from list), category (short label like "Client Demo" or "Sprint Planning"), and confidence (0-1).
Respond ONLY with JSON array, no markdown:
[{"id":"123","folder_id":"sales-clients","category":"Client Discovery","confidence":0.9}]`,
    messages: [{
      role: 'user',
      content: `Categorize these meetings:\n${JSON.stringify(payload, null, 2)}`,
    }],
  });

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  if (!Array.isArray(parsed)) return null;

  const byId = {};
  for (const row of parsed) {
    if (row?.id && row?.folder_id) {
      byId[String(row.id)] = {
        folder_id: row.folder_id,
        category: row.category || 'General',
        source: 'anthropic',
        confidence: row.confidence ?? 0.8,
      };
    }
  }
  return byId;
}

export async function categorizeOne(meeting, { useAI = true } = {}) {
  if (useAI && process.env.ANTHROPIC_API_KEY) {
    try {
      const aiMap = await categorizeWithAI([meeting]);
      const id = String(meeting.recording_id || meeting.id || meeting.fathom_id);
      if (aiMap?.[id]) return aiMap[id];
    } catch (err) {
      console.warn('AI categorization failed, using rules:', err.message);
    }
  }

  return categorizeWithRules({
    title: meeting.title || meeting.meeting_title,
    summary: meeting.summary || meeting.default_summary?.markdown_formatted || '',
    participants: meeting.participants || meeting.calendar_invitees || [],
  });
}

export async function categorizeBatch(meetings, { useAI = true } = {}) {
  const results = {};
  const uncached = [];

  for (const meeting of meetings) {
    const id = String(meeting.recording_id || meeting.id || meeting.fathom_id);
    uncached.push({ ...meeting, _cid: id });
  }

  if (useAI && process.env.ANTHROPIC_API_KEY && uncached.length > 0) {
    const chunkSize = 15;
    for (let i = 0; i < uncached.length; i += chunkSize) {
      const chunk = uncached.slice(i, i + chunkSize);
      try {
        const aiMap = await categorizeWithAI(chunk);
        if (aiMap) Object.assign(results, aiMap);
      } catch (err) {
        console.warn('AI batch categorization chunk failed:', err.message);
      }
    }
  }

  for (const meeting of uncached) {
    const id = meeting._cid;
    if (!results[id]) {
      results[id] = categorizeWithRules({
        title: meeting.title || meeting.meeting_title,
        summary: meeting.summary || meeting.default_summary?.markdown_formatted || '',
        participants: meeting.participants || meeting.calendar_invitees || [],
      });
    }
  }

  return results;
}

export async function saveFathomCache(recordingId, title, folderId, category, source) {
  await pool.query(
    `INSERT INTO fathom_meeting_cache (recording_id, title, folder_id, category, source, categorized_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (recording_id) DO UPDATE SET
       title = EXCLUDED.title,
       folder_id = EXCLUDED.folder_id,
       category = EXCLUDED.category,
       source = EXCLUDED.source,
       categorized_at = NOW()`,
    [String(recordingId), title, folderId, category, source],
  );
}

export async function loadFathomCache(recordingIds) {
  if (!recordingIds.length) return {};
  const { rows } = await pool.query(
    'SELECT * FROM fathom_meeting_cache WHERE recording_id = ANY($1)',
    [recordingIds.map(String)],
  );
  const map = {};
  for (const row of rows) map[row.recording_id] = row;
  return map;
}

export async function applyCategoriesToMeetings(meetings, { force = false, useAI = true } = {}) {
  const ids = meetings.map((m) => String(m.recording_id || m.id));
  const cache = await loadFathomCache(ids);
  const toCategorize = force
    ? meetings
    : meetings.filter((m) => !cache[String(m.recording_id || m.id)]);

  let batchResults = {};
  if (toCategorize.length > 0) {
    batchResults = await categorizeBatch(toCategorize, { useAI });
    for (const meeting of toCategorize) {
      const id = String(meeting.recording_id || meeting.id);
      const cat = batchResults[id];
      if (!cat) continue;
      await saveFathomCache(
        id,
        meeting.title || meeting.meeting_title || 'Untitled',
        cat.folder_id,
        cat.category,
        cat.source,
      );
      cache[id] = { ...cat, recording_id: id };
    }
  }

  const folderNames = Object.fromEntries(DEFAULT_FOLDERS.map((f) => [f.id, f.name]));

  return meetings.map((meeting) => {
    const id = String(meeting.recording_id || meeting.id);
    const cached = cache[id];
    const folderId = cached?.folder_id || 'uncategorized';
    return {
      ...meeting,
      folder_id: folderId,
      folder_name: folderNames[folderId] || 'Uncategorized',
      category: cached?.category || null,
      category_source: cached?.source || null,
    };
  });
}

export async function assignMeetingFolder(meetingId, { title, summary, participants }, client = pool) {
  const cat = await categorizeOne({
    title,
    summary,
    participants,
    recording_id: meetingId,
  });

  await client.query(
    `UPDATE meetings SET folder_id = $1, category = $2, category_source = $3 WHERE id = $4`,
    [cat.folder_id, cat.category, cat.source, meetingId],
  );

  return cat;
}
