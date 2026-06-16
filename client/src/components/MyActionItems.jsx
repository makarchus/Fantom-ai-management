import { useEffect, useState } from 'react';
import { Calendar, Flag, Mail, User } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { api } from '../lib/api.js';
import { NotesDisplay } from './NotesEditor.jsx';
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

export default function MyActionItems() {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { assignments: rows } = await api.getAssignedActionItems();
      setAssignments(rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: 'var(--slate-300)' }}>
        <div className="spinner" /> Loading your action items…
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: 40, color: 'var(--red)', fontSize: 13 }}>{error}</div>;
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 6 }}>
        My Action Items
      </h1>
      <p style={{ fontSize: 13, color: 'var(--slate-300)', marginBottom: 24, maxWidth: 560, lineHeight: 1.5 }}>
        Action items assigned to you. Add progress updates below each item — the owner marks items complete and archives them.
      </p>

      {assignments.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--slate-300)', fontSize: 13 }}>
          No active action items assigned to you yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
          {assignments.map((item) => {
            const p = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.medium;
            return (
              <div key={item.id} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--white-soft)', marginBottom: 4 }}>
                      {item.description}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--indigo-light)', marginBottom: 8 }}>
                      {item.meeting_title}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 11, color: 'var(--slate-300)' }}>
                      {item.status === 'in_progress' && (
                        <span className="badge badge-amber" style={{ fontSize: 10 }}>In progress</span>
                      )}
                      {item.meeting_date && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} />{formatDate(item.meeting_date)}
                        </span>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <User size={11} />Assigned by {item.owner_name || item.owner_email}
                      </span>
                      <span className="badge" style={{ background: p.bg, color: p.color, fontSize: 10 }}>
                        <Flag size={9} />{item.priority}
                      </span>
                      {item.due_date && (
                        <span className="badge badge-slate" style={{ fontSize: 10 }}>
                          Due {item.due_date}
                        </span>
                      )}
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={11} />{item.assignee_email}
                      </span>
                    </div>
                    <NotesDisplay notes={item.notes} />
                    <ActionItemComments actionItemId={item.action_item_id} />
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
