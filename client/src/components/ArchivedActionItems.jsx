import { useEffect, useState } from 'react';
import { Archive, Calendar, Flag, RotateCcw, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api.js';
import ActionItemComments from './ActionItemComments.jsx';

const PRIORITY_COLORS = {
  high: { color: 'var(--red)', bg: 'var(--red-dim)' },
  medium: { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  low: { color: 'var(--slate-200)', bg: 'rgba(160,174,192,0.15)' },
};

function formatDate(value) {
  if (!value) return null;
  try {
    return format(typeof value === 'string' ? parseISO(value) : new Date(value), 'MMM d, yyyy');
  } catch {
    return String(value);
  }
}

export default function ArchivedActionItems({ onSelectMeeting, onChanged }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reopeningId, setReopeningId] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { items: rows } = await api.getArchivedActionItems();
      setItems(rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleReopen(item) {
    if (item.source !== 'owned') return;
    setReopeningId(item.id);
    try {
      await api.reopenActionItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onChanged?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setReopeningId(null);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: 'var(--slate-300)' }}>
        <div className="spinner" /> Loading archive…
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: 40, color: 'var(--red)', fontSize: 13 }}>{error}</div>;
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Archive size={22} color="var(--indigo-light)" />
        Action Item Archive
      </h1>
      <p style={{ fontSize: 13, color: 'var(--slate-300)', marginBottom: 24, maxWidth: 560, lineHeight: 1.5 }}>
        Completed action items with full progress history. Owners can reopen items to continue work.
      </p>

      {items.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--slate-300)', fontSize: 13 }}>
          No archived action items yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 800 }}>
          {items.map((item) => {
            const p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
            return (
              <div key={`${item.source}-${item.assignment_id || item.id}`} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white-soft)', marginBottom: 4 }}>
                      {item.description}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--indigo-light)', marginBottom: 8 }}>
                      {item.meeting_title}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--slate-300)', marginBottom: 8 }}>
                      {item.archived_at && (
                        <span className="badge badge-green" style={{ fontSize: 10 }}>
                          Completed {formatDate(item.archived_at)}
                        </span>
                      )}
                      {item.source === 'assigned' && item.owner_name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <User size={11} />from {item.owner_name}
                        </span>
                      )}
                      <span className="badge" style={{ background: p.bg, color: p.color, fontSize: 10 }}>
                        <Flag size={9} />{item.priority}
                      </span>
                      {item.due_date && (
                        <span className="badge badge-slate" style={{ fontSize: 10 }}>
                          <Calendar size={9} />Due {item.due_date}
                        </span>
                      )}
                    </div>
                    <ActionItemComments actionItemId={item.id} compact />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {item.can_open_meeting && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onSelectMeeting?.(item.meeting_id)}
                      >
                        Open meeting
                      </button>
                    )}
                    {item.source === 'owned' && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={reopeningId === item.id}
                        onClick={() => handleReopen(item)}
                      >
                        <RotateCcw size={11} />
                        {reopeningId === item.id ? 'Reopening…' : 'Reopen'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
