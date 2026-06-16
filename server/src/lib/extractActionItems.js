/** Map Fathom API action_items to our extraction shape */
export function fromFathomActionItems(fathomItems = []) {
  const action_items = fathomItems
    .filter((item) => item?.description)
    .map((item) => ({
      assignee: item.assignee?.name || item.assignee?.email || 'Unassigned',
      description: item.description,
      commitment_type: 'action',
      priority: 'medium',
      due_date: null,
      notes: item.recording_playback_url
        ? `Fathom @ ${item.recording_timestamp || '—'}`
        : null,
    }));

  const participants_mentioned = [
    ...new Set(action_items.map((i) => i.assignee).filter((n) => n && n !== 'Unassigned')),
  ];

  return {
    action_items,
    next_steps: [],
    key_decisions: [],
    participants_mentioned,
    source: 'fathom_api',
  };
}

function stripBold(text) {
  return text.replace(/\*\*/g, '').trim();
}

/** Extract label text from a markdown link bullet, e.g. `- [**Action:** Do X](url)` */
function parseLinkedBullet(line) {
  const match = line.match(/^\s*-\s+\[([^\]]+)\]\([^)]+\)/);
  if (!match) return null;
  return stripBold(match[1]);
}

function addActionItem(list, seen, assignee, description, commitmentType = 'action') {
  const desc = description?.trim();
  if (!desc || desc.length < 3) return;
  const person = assignee?.trim() || 'Unassigned';
  const key = `${person}:${desc}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    assignee: person,
    description: desc,
    commitment_type: commitmentType,
    priority: 'medium',
    due_date: null,
    notes: null,
  });
}

function addNextStep(list, seen, owner, description) {
  const desc = description?.trim();
  if (!desc || desc.length < 3) return;
  const key = `step:${owner || ''}:${desc}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ description: desc, owner: owner || null, due_date: null });
}

/** Parse action items from Fathom summary markdown (no LLM) */
export function parseSummaryActionItems(summary) {
  if (!summary) return null;

  const action_items = [];
  const next_steps = [];
  const seen = new Set();

  // Classic "## Action Items" / bullet sections
  const headingPatterns = [
    /#+\s*Action Items?\b([\s\S]*?)(?=\n#+\s|\Z)/i,
    /\*\*Action Items?\*\*([\s\S]*?)(?=\n#+\s|\n\*\*[A-Z]|\Z)/i,
  ];

  for (const pattern of headingPatterns) {
    const section = summary.match(pattern)?.[1];
    if (!section) continue;

    for (const line of section.split('\n')) {
      const linked = parseLinkedBullet(line);
      const bold = line.match(/^\s*[-*•]\s+\*\*([^*]+)\*\*[:\s-]+(.+)/);
      const plain = line.match(/^\s*[-*•]\s+(.+)/);
      const text = linked || (bold ? `${bold[1]}: ${bold[2]}` : plain?.[1]?.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))?.trim();
      if (!text || text.length < 3) continue;

      const ownerMatch = text.match(/^([^:]{2,40}):\s*(.+)$/);
      addActionItem(
        action_items,
        seen,
        ownerMatch ? ownerMatch[1].trim() : 'Unassigned',
        ownerMatch ? ownerMatch[2].trim() : text,
      );
    }
  }

  // Fathom inline `[**Action:** ...](url)` anywhere in the summary
  for (const line of summary.split('\n')) {
    const linked = parseLinkedBullet(line);
    if (!linked) continue;

    const actionMatch = linked.match(/^Action:\s*(.+)$/i);
    if (actionMatch) {
      addActionItem(action_items, seen, 'Unassigned', actionMatch[1], 'action');
      continue;
    }

    const decisionMatch = linked.match(/^Decision:\s*(.+)$/i);
    if (decisionMatch) {
      addActionItem(action_items, seen, 'Unassigned', decisionMatch[1], 'decision');
    }
  }

  // Fathom "## Next Steps" with person headers: `- [**Neil:**](url)` + nested tasks
  const nextSection = summary.match(/#+\s*Next Steps?\b([\s\S]*?)(?=\n##\s|$)/i)?.[1];
  if (nextSection) {
    let currentPerson = null;

    for (const line of nextSection.split('\n')) {
      const linked = parseLinkedBullet(line);
      if (!linked) continue;

      const personHeader = linked.match(/^([^:]+):\s*$/);
      if (personHeader) {
        currentPerson = personHeader[1].trim();
        continue;
      }

      if (currentPerson) {
        addActionItem(action_items, seen, currentPerson, linked, 'action');
      } else {
        addActionItem(action_items, seen, 'Unassigned', linked, 'next_step');
        addNextStep(next_steps, seen, null, linked);
      }
    }
  }

  if (action_items.length === 0 && next_steps.length === 0) return null;

  const participants_mentioned = [
    ...new Set([
      ...action_items.map((i) => i.assignee),
      ...next_steps.map((s) => s.owner),
    ].filter((n) => n && n !== 'Unassigned')),
  ];

  return {
    action_items,
    next_steps,
    key_decisions: [],
    participants_mentioned,
    source: 'summary_parse',
  };
}

/** Claude extraction — only when ANTHROPIC_API_KEY is set (optional fallback) */
export async function extractWithAnthropic(summary) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey });
  const content = `## MEETING SUMMARY\n${summary}`;

  const systemPrompt = `You are an expert meeting analyst. Extract action items, commitments, and next steps from the meeting summary.

For each item identified, provide:
- assignee: the person responsible (use their name exactly as mentioned, or "Team" if shared)
- description: clear, actionable description of what needs to be done
- commitment_type: one of "action" | "next_step" | "decision" | "commitment"
- priority: one of "high" | "medium" | "low"
- due_date: ISO date string if mentioned, otherwise null
- notes: any relevant context or dependencies

Respond ONLY with valid JSON — no markdown, no backticks, no preamble:
{
  "action_items": [{"assignee":"...","description":"...","commitment_type":"action","priority":"medium","due_date":null,"notes":null}],
  "next_steps": [{"description":"...","owner":null,"due_date":null}],
  "key_decisions": [],
  "participants_mentioned": []
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: `Analyze this meeting content:\n\n${content}` }],
  });

  const rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const clean = rawText.replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(clean);
  return { ...parsed, source: 'anthropic' };
}

/** Pick best extraction: Fathom API → summary parse → Anthropic */
export async function extractActionItems({ summary, fathomActionItems }) {
  if (fathomActionItems?.length) {
    const fromApi = fromFathomActionItems(fathomActionItems);
    if (fromApi.action_items.length) return fromApi;
  }

  const fromSummary = parseSummaryActionItems(summary);
  if (fromSummary?.action_items?.length || fromSummary?.next_steps?.length) return fromSummary;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await extractWithAnthropic(summary);
    } catch (err) {
      console.warn('Anthropic extraction failed:', err.message);
    }
  }

  return null;
}
