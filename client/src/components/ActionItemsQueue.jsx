import { useEffect, useState } from 'react';
import { Flag, Calendar, AlertTriangle, ListOrdered, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { isPast, isToday, parseISO } from 'date-fns';
import { api } from '../lib/api.js';
import ActionItemComments from './ActionItemComments.jsx';

const PRIORITY_COLORS = {
  high: { color: 'var(--red)', bg: 'var(--red-dim)', label: 'High' },
  medium: { color: 'var(--amber)', bg: 'var(--amber-dim)', label: 'Medium' },
  low: { color: 'var(--slate-200)', bg: 'rgba(160,174,192,0.15)', label: 'Low' },
};

function formatDateForInput(value) {
  if (!value) return '';
  const str = typeof value === 'string' ? value : (value instanceof Date ? value.toISOString() : String(value));
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function isOverdue(item) {
  const due = formatDateForInput(item.due_date);
  if (!due || item.status === 'done' || item.status === 'cancelled') return false;
  try {
    const date = parseISO(due);
    return isPast(date) && !isToday(date);
  } catch {
    return false;
  }
}

function itemKey(item) {
  return `${item.source || 'owned'}-${item.assignment_id || item.id}-${item.meeting_id}`;
}

export default function ActionItemsQueue({ onSelectMeeting, refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getActionItemsQueue()
      .then(({ items: rows }) => {
        if (!cancelled) setItems(rows || []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  return (
    <aside style={{
      width: 320,
      flexShrink: 0,
      borderLeft: '1px solid var(--navy-700)',
      background: 'var(--navy-900)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--navy-700)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <ListOrdered size={16} color="var(--indigo-light)" />
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--white-soft)' }}>Action Queue</div>
          <div style={{ fontSize: 10, color: 'var(--slate-300)' }}>Click to view progress & add updates</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {loading && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--slate-300)', fontSize: 12, padding: 12 }}>
            <div className="spinner" style={{ width: 12, height: 12 }} /> Loading…
          </div>
        )}
        {error && <p style={{ fontSize: 12, color: 'var(--red)', padding: 8 }}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p style={{ fontSize: 12, color: 'var(--slate-300)', padding: 8 }}>No action items yet.</p>
        )}

        {items.map((item) => {
          const key = itemKey(item);
          const p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
          const overdue = isOverdue(item);
          const expanded = expandedId === key;
          const dueLabel = formatDateForInput(item.due_date);

          return (
            <div
              key={key}
              style={{
                marginBottom: 8,
                borderRadius: 10,
                border: `1px solid ${overdue ? 'var(--red)' : expanded ? 'var(--indigo)' : 'var(--navy-600)'}`,
                background: overdue ? 'var(--red-dim)' : 'var(--navy-800)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : key)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  {expanded ? <ChevronDown size={14} color="var(--slate-400)" /> : <ChevronRight size={14} color="var(--slate-400)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      {item.source === 'assigned' && (
                        <span className="badge badge-indigo" style={{ fontSize: 9 }}>Assigned to you</span>
                      )}
                      {item.status === 'in_progress' && (
                        <span className="badge badge-amber" style={{ fontSize: 9 }}>In progress</span>
                      )}
                      {item.owner_name && item.source === 'assigned' && (
                        <span style={{ fontSize: 10, color: 'var(--slate-300)' }}>from {item.owner_name}</span>
                      )}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--indigo-light)',
                      marginBottom: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {item.meeting_title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--white-soft)', lineHeight: 1.4, marginBottom: 8 }}>
                      {item.description}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <span className="badge" style={{ background: p.bg, color: p.color, fontSize: 10 }}>
                        <Flag size={9} />{p.label}
                      </span>
                      {dueLabel && (
                        <span className="badge badge-slate" style={{ fontSize: 10 }}>
                          <Calendar size={9} />{dueLabel}
                        </span>
                      )}
                      {overdue && (
                        <span className="badge" style={{ background: 'var(--red-dim)', color: 'var(--red)', fontSize: 10 }}>
                          <AlertTriangle size={9} />Overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>

              {expanded && (
                <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--navy-700)' }}>
                  {item.can_open_meeting && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 8, marginBottom: 4, fontSize: 11 }}
                      onClick={() => onSelectMeeting?.(item.meeting_id)}
                    >
                      <ExternalLink size={11} /> Open meeting
                    </button>
                  )}
                  <ActionItemComments actionItemId={item.id} compact />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
