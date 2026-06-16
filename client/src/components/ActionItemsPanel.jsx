import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, User, Calendar, Flag, Edit2, Save, X, Mail, CheckCircle2, Trash2, Circle } from 'lucide-react';
import { api } from '../lib/api.js';
import { NotesEditor, NotesDisplay } from './NotesEditor.jsx';
import AssigneeEmailPicker from './AssigneeEmailPicker.jsx';
import ActionItemComments from './ActionItemComments.jsx';

const PRIORITY_COLORS = {
  high: { color: 'var(--red)', bg: 'var(--red-dim)', label: 'High' },
  medium: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Medium' },
  low: { color: 'var(--slate-200)', bg: 'rgba(160,174,192,0.15)', label: 'Low' },
};

const TYPE_COLORS = {
  action: { color: 'var(--indigo-light)', bg: 'var(--indigo-dim)', label: 'Action' },
  next_step: { color: 'var(--green)', bg: 'var(--green-dim)', label: 'Next Step' },
  commitment: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Commitment' },
  decision: { color: 'var(--purple)', bg: 'var(--purple-dim)', label: 'Decision' },
};

function formatDateForInput(value) {
  if (!value) return '';
  const str = typeof value === 'string' ? value : (value instanceof Date ? value.toISOString() : String(value));
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function formatDateForDisplay(value) {
  const input = formatDateForInput(value);
  if (!input) return '';
  const [year, month, day] = input.split('-');
  return `${month}/${day}/${year}`;
}

function groupKey(item) {
  const emails = item.assignee_emails || [];
  if (emails.length) return emails[0];
  return item.assignee || 'Unassigned';
}

function ActionItem({ item, onUpdate, onRemove, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [removingEmail, setRemovingEmail] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function markComplete() {
    if (!confirm('Mark this action item complete? It will move to the Archive with its full progress history.')) return;
    setCompleting(true);
    try {
      await api.completeActionItem(item.id);
      onRemove?.(item.id);
      onChanged?.();
    } finally {
      setCompleting(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this action item permanently? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deleteActionItem(item.id);
      onRemove?.(item.id);
      onChanged?.();
    } finally {
      setDeleting(false);
    }
  }

  function startEdit() {
    setDraft({
      description: item.description,
      priority: item.priority,
      due_date: formatDateForInput(item.due_date),
      notes: item.notes || '',
      assignee_emails: item.assignee_emails || [],
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const { action_item: updated } = await api.updateActionItem(item.id, draft);
      onUpdate(updated);
      onChanged?.();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function removeAssignee(email) {
    if (!confirm(`Remove ${email} from this action item? They will be notified it is no longer required.`)) return;
    setRemovingEmail(email);
    try {
      const nextEmails = (item.assignee_emails || []).filter((e) => e !== email);
      const { action_item: updated } = await api.updateActionItem(item.id, { assignee_emails: nextEmails });
      onUpdate(updated);
      onChanged?.();
    } finally {
      setRemovingEmail(null);
    }
  }

  const p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
  const t = TYPE_COLORS[item.commitment_type] || TYPE_COLORS.action;
  const emails = item.assignee_emails || [];

  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid var(--navy-700)',
    }}>
      {!editing ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13,
                color: 'var(--white-soft)',
                lineHeight: 1.4,
              }}>
                {item.description}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                {item.status === 'in_progress' && (
                  <span className="badge badge-amber" style={{ fontSize: 10 }}>In progress</span>
                )}
                <span className="badge" style={{ background: t.bg, color: t.color, fontSize: 10 }}>
                  {t.label}
                </span>
                <span className="badge" style={{ background: p.bg, color: p.color, fontSize: 10 }}>
                  <Flag size={9} />{p.label}
                </span>
                {item.due_date && (
                  <span className="badge badge-slate" style={{ fontSize: 10 }}>
                    <Calendar size={9} />{formatDateForDisplay(item.due_date)}
                  </span>
                )}
              </div>
              {emails.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--slate-300)', marginBottom: 6 }}>
                    Assigned to
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {emails.map((email) => (
                      <span
                        key={email}
                        className="badge badge-indigo"
                        style={{
                          fontSize: 11,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          paddingRight: 6,
                        }}
                      >
                        <Mail size={10} />
                        {email}
                        <button
                          type="button"
                          title={`Remove ${email}`}
                          disabled={removingEmail === email}
                          onClick={() => removeAssignee(email)}
                          style={{
                            color: 'inherit',
                            opacity: removingEmail === email ? 0.5 : 0.85,
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <NotesDisplay notes={item.notes} />
              <ActionItemComments actionItemId={item.id} compact />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
              <button className="btn btn-ghost btn-sm" onClick={startEdit} style={{ padding: '3px 6px' }}>
                <Edit2 size={12} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={markComplete}
                disabled={completing}
                title="Mark complete and archive"
                style={{ padding: '3px 6px', color: 'var(--green)' }}
              >
                <CheckCircle2 size={12} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleDelete}
                disabled={deleting}
                title="Delete action item"
                style={{ padding: '3px 6px', color: 'var(--red)' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <textarea
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            rows={2}
            style={{ fontSize: 13, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label>Priority</label>
              <select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label>Due Date</label>
              <input
                type="date"
                value={formatDateForInput(draft.due_date)}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              />
            </div>
          </div>
          <AssigneeEmailPicker
            emails={draft.assignee_emails}
            onChange={(assignee_emails) => setDraft({ ...draft, assignee_emails })}
          />
          <div>
            <label style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>Notes</label>
            <NotesEditor
              value={draft.notes}
              onChange={(notes) => setDraft({ ...draft, notes })}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary btn-sm" onClick={saveEdit} disabled={saving}>
              {saving ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <Save size={11} />}
              Save
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>
              <X size={11} />Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ActionItemsPanel({ actionItems: initialItems, nextSteps: initialSteps, onChanged }) {
  const [items, setItems] = useState(initialItems || []);
  const [steps, setSteps] = useState(initialSteps || []);
  const [collapsed, setCollapsed] = useState({});

  useEffect(() => {
    setItems(initialItems || []);
    setSteps(initialSteps || []);
  }, [initialItems, initialSteps]);

  function updateItem(updated) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const byPerson = {};
  for (const item of items) {
    const person = groupKey(item);
    if (!byPerson[person]) byPerson[person] = [];
    byPerson[person].push(item);
  }

  const people = Object.keys(byPerson).sort();

  async function toggleStep(step) {
    const newStatus = step.status === 'done' ? 'pending' : 'done';
    await api.updateNextStep(step.id, { status: newStatus });
    setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, status: newStatus } : s)));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-100)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={14} color="var(--indigo-light)" />
          Action Items by Person
          <span className="badge badge-indigo">{items.length}</span>
        </div>

        {people.length === 0 ? (
          <div style={{ color: 'var(--slate-300)', fontSize: 13, padding: '20px 0' }}>No action items extracted.</div>
        ) : (
          people.map((person) => {
            const personItems = byPerson[person];
            const progressCount = personItems.filter((i) => i.status === 'in_progress').length;
            const isCollapsed = collapsed[person];
            const isEmail = person.includes('@');

            return (
              <div key={person} className="card" style={{ marginBottom: 10, overflow: 'hidden' }}>
                <button
                  onClick={() => setCollapsed((p) => ({ ...p, [person]: !p[person] }))}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px',
                    background: 'var(--navy-700)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: '50%',
                    background: 'var(--indigo-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 700, color: 'var(--indigo-light)',
                    flexShrink: 0,
                  }}>
                    {isEmail ? <Mail size={12} /> : (person[0]?.toUpperCase() || '?')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white-soft)' }}>{person}</div>
                    <div style={{ fontSize: 11, color: 'var(--slate-300)' }}>
                      {personItems.filter((i) => i.status === 'in_progress').length} in progress · {personItems.length} active
                    </div>
                  </div>
                  <div style={{
                    width: 60, height: 4,
                    background: 'var(--navy-600)',
                    borderRadius: 2,
                    overflow: 'hidden',
                    marginRight: 8,
                  }}>
                    <div style={{
                      width: `${personItems.length ? (progressCount / personItems.length) * 100 : 0}%`,
                      height: '100%',
                      background: 'var(--green)',
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  {isCollapsed ? <ChevronRight size={14} color="var(--slate-400)" /> : <ChevronDown size={14} color="var(--slate-400)" />}
                </button>

                {!isCollapsed && personItems.map((item) => (
                  <ActionItem key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} onChanged={onChanged} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {steps.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-100)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={14} color="var(--green)" />
            Next Steps
            <span className="badge badge-green">{steps.length}</span>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            {steps.map((step, i) => (
              <div key={step.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 14px',
                borderBottom: i < steps.length - 1 ? '1px solid var(--navy-700)' : 'none',
                opacity: step.status === 'done' ? 0.5 : 1,
              }}>
                <button
                  onClick={() => toggleStep(step)}
                  style={{ flexShrink: 0, marginTop: 1, color: step.status === 'done' ? 'var(--green)' : 'var(--slate-400)' }}
                >
                  {step.status === 'done' ? <CheckCircle2 size={15} /> : <Circle size={15} />}
                </button>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: 13, color: 'var(--white-soft)',
                    textDecoration: step.status === 'done' ? 'line-through' : 'none',
                  }}>
                    {step.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {step.owner && (
                      <span style={{ fontSize: 11, color: 'var(--slate-300)' }}>
                        <User size={9} style={{ display: 'inline', marginRight: 3 }} />{step.owner}
                      </span>
                    )}
                    {step.due_date && (
                      <span style={{ fontSize: 11, color: 'var(--slate-300)' }}>
                        <Calendar size={9} style={{ display: 'inline', marginRight: 3 }} />{step.due_date}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
