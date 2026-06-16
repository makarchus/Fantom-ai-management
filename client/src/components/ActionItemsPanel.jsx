import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronRight, User, Calendar, Flag, Edit2, Save, X } from 'lucide-react';
import { api } from '../lib/api.js';

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

function ActionItem({ item, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const isDone = item.status === 'done';

  async function toggleDone() {
    const newStatus = isDone ? 'pending' : 'done';
    await api.updateActionItem(item.id, { status: newStatus });
    onUpdate({ ...item, status: newStatus });
  }

  function startEdit() {
    setDraft({ description: item.description, priority: item.priority, due_date: item.due_date || '', notes: item.notes || '' });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.updateActionItem(item.id, draft);
      onUpdate({ ...item, ...draft });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
  const t = TYPE_COLORS[item.commitment_type] || TYPE_COLORS.action;

  return (
    <div style={{
      padding: '12px 14px',
      borderBottom: '1px solid var(--navy-700)',
      opacity: isDone ? 0.6 : 1,
      transition: 'opacity 0.2s',
    }}>
      {!editing ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <button
              onClick={toggleDone}
              style={{ flexShrink: 0, marginTop: 2, color: isDone ? 'var(--green)' : 'var(--slate-400)' }}
            >
              {isDone ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 13,
                color: isDone ? 'var(--slate-300)' : 'var(--white-soft)',
                textDecoration: isDone ? 'line-through' : 'none',
                lineHeight: 1.4,
              }}>
                {item.description}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                <span className="badge" style={{ background: t.bg, color: t.color, fontSize: 10 }}>
                  {t.label}
                </span>
                <span className="badge" style={{ background: p.bg, color: p.color, fontSize: 10 }}>
                  <Flag size={9} />{p.label}
                </span>
                {item.due_date && (
                  <span className="badge badge-slate" style={{ fontSize: 10 }}>
                    <Calendar size={9} />{item.due_date}
                  </span>
                )}
              </div>
              {item.notes && (
                <div style={{ fontSize: 11, color: 'var(--slate-300)', marginTop: 6, fontStyle: 'italic' }}>
                  {item.notes}
                </div>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={startEdit} style={{ flexShrink: 0, padding: '3px 6px' }}>
              <Edit2 size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                value={draft.due_date}
                onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label>Notes</label>
            <input
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              placeholder="Additional context..."
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

export default function ActionItemsPanel({ actionItems: initialItems, nextSteps: initialSteps }) {
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

  // Group by assignee
  const byPerson = {};
  for (const item of items) {
    const person = item.assignee || 'Unassigned';
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
      {/* Action Items by Person */}
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
            const doneCount = personItems.filter((i) => i.status === 'done').length;
            const isCollapsed = collapsed[person];

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
                    {person[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--white-soft)' }}>{person}</div>
                    <div style={{ fontSize: 11, color: 'var(--slate-300)' }}>
                      {doneCount}/{personItems.length} completed
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
                      width: `${personItems.length ? (doneCount / personItems.length) * 100 : 0}%`,
                      height: '100%',
                      background: 'var(--green)',
                      borderRadius: 2,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  {isCollapsed ? <ChevronRight size={14} color="var(--slate-400)" /> : <ChevronDown size={14} color="var(--slate-400)" />}
                </button>

                {!isCollapsed && personItems.map((item) => (
                  <ActionItem key={item.id} item={item} onUpdate={updateItem} />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* Next Steps */}
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
