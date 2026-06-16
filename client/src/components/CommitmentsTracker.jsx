import { useEffect, useState } from 'react';
import { Target, Calendar, User, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api.js';
import { format, parseISO, isPast, isToday } from 'date-fns';

const PRIORITY_COLORS = {
  high: { color: 'var(--red)', bg: 'var(--red-dim)' },
  medium: { color: 'var(--amber)', bg: 'var(--amber-dim)' },
  low: { color: 'var(--slate-200)', bg: 'rgba(160,174,192,0.15)' },
};

export default function CommitmentsTracker({ onSelectMeeting }) {
  const [commitments, setCommitments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | pending | overdue

  useEffect(() => {
    api.getAllCommitments()
      .then((d) => setCommitments(d.commitments || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = commitments.filter((c) => {
    if (filter === 'pending') return c.status !== 'done';
    if (filter === 'overdue') {
      return c.status !== 'done' && c.due_date && isPast(parseISO(c.due_date)) && !isToday(parseISO(c.due_date));
    }
    return true;
  });

  // Group by assignee
  const byPerson = {};
  for (const c of filtered) {
    const person = c.assignee || 'Unknown';
    if (!byPerson[person]) byPerson[person] = [];
    byPerson[person].push(c);
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 30, color: 'var(--slate-300)' }}>
        <div className="spinner" />
        Loading commitments...
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Target size={20} color="var(--indigo-light)" />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)' }}>Commitments Tracker</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--slate-300)' }}>
          All commitments and next steps across every processed meeting.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Pending' },
          { id: 'overdue', label: 'Overdue' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`btn ${filter === f.id ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          >
            {f.label}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--slate-300)' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: 'var(--slate-300)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No commitments found.
        </div>
      ) : (
        Object.entries(byPerson).map(([person, items]) => (
          <div key={person} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 10,
              padding: '6px 0',
              borderBottom: '1px solid var(--navy-700)',
            }}>
              <div style={{
                width: 26, height: 26,
                borderRadius: '50%',
                background: 'var(--indigo-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, color: 'var(--indigo-light)',
              }}>
                {person[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--white-soft)' }}>{person}</span>
              <span className="badge badge-indigo" style={{ fontSize: 10 }}>
                {items.filter((i) => i.status !== 'done').length} open
              </span>
            </div>

            <div className="card" style={{ overflow: 'hidden' }}>
              {items.map((c, i) => {
                const p = PRIORITY_COLORS[c.priority] || PRIORITY_COLORS.medium;
                const isOverdue = c.due_date && isPast(parseISO(c.due_date)) && c.status !== 'done' && !isToday(parseISO(c.due_date));

                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '11px 14px',
                    borderBottom: i < items.length - 1 ? '1px solid var(--navy-700)' : 'none',
                    opacity: c.status === 'done' ? 0.5 : 1,
                    background: isOverdue ? 'rgba(239,68,68,0.04)' : 'transparent',
                  }}>
                    <div style={{
                      width: 3, height: 40, borderRadius: 2, flexShrink: 0,
                      background: p.color, alignSelf: 'center',
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 13, color: 'var(--white-soft)',
                        textDecoration: c.status === 'done' ? 'line-through' : 'none',
                        lineHeight: 1.4,
                      }}>
                        {c.description}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--slate-400)' }}>
                          From: <span style={{ color: 'var(--slate-200)' }}>{c.meeting_title}</span>
                        </span>
                        {c.due_date && (
                          <span style={{ fontSize: 11, color: isOverdue ? 'var(--red)' : 'var(--slate-300)', display: 'flex', alignItems: 'center', gap: 3 }}>
                            <Calendar size={9} />
                            {format(parseISO(c.due_date), 'MMM d')}
                            {isOverdue && ' (overdue)'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onSelectMeeting?.(c.meeting_id)}
                      className="btn btn-ghost btn-sm"
                      title="View meeting"
                      style={{ padding: '3px 6px', flexShrink: 0 }}
                    >
                      <ArrowUpRight size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
