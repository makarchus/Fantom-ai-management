import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageSquare, Send } from 'lucide-react';
import { api } from '../lib/api.js';

function formatTimestamp(value) {
  if (!value) return '';
  try {
    return format(typeof value === 'string' ? parseISO(value) : new Date(value), 'MMM d, yyyy h:mm a');
  } catch {
    return String(value);
  }
}

export default function ActionItemComments({ actionItemId, compact = false }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { comments: rows } = await api.getActionItemComments(actionItemId);
      setComments(rows || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [actionItemId]);

  async function handleSubmit(e) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setSubmitting(true);
    setError(null);
    try {
      const { comment } = await api.addActionItemComment(actionItemId, text);
      setComments((prev) => [...prev, comment]);
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ marginTop: compact ? 8 : 12 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--slate-300)',
        marginBottom: 8,
      }}>
        <MessageSquare size={12} />
        Progress history
        {comments.length > 0 && (
          <span className="badge badge-slate" style={{ fontSize: 9 }}>{comments.length}</span>
        )}
      </div>

      {loading && (
        <div style={{ fontSize: 11, color: 'var(--slate-400)', padding: '4px 0' }}>Loading comments…</div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>{error}</div>
      )}

      {!loading && comments.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--slate-400)', marginBottom: 8 }}>
          No progress updates yet. Add a comment to track how this action is moving forward.
        </div>
      )}

      {comments.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          marginBottom: 10,
          maxHeight: compact ? 160 : 240,
          overflowY: 'auto',
        }}>
          {comments.map((c) => (
            <div
              key={c.id}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--navy-700)',
                border: '1px solid var(--navy-600)',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 4,
                fontSize: 10,
                color: 'var(--slate-300)',
              }}>
                <span style={{ fontWeight: 600, color: 'var(--indigo-light)' }}>{c.author_name}</span>
                <span>{formatTimestamp(c.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--white-soft)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                {c.body}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a progress update…"
          rows={compact ? 2 : 3}
          style={{ fontSize: 12, resize: 'vertical' }}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={submitting || !body.trim()}
          style={{ alignSelf: 'flex-start' }}
        >
          {submitting ? <div className="spinner" style={{ width: 10, height: 10 }} /> : <Send size={11} />}
          Add update
        </button>
      </form>
    </div>
  );
}
