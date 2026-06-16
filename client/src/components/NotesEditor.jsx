import { useRef } from 'react';
import { Bold, Italic, List } from 'lucide-react';
import MarkdownContent from './MarkdownContent.jsx';

function wrapSelection(textarea, before, after = before) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const next = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  return { next, cursor: start + before.length + selected.length + after.length };
}

export function NotesEditor({ value, onChange, rows = 6 }) {
  const ref = useRef(null);

  function applyFormat(before, after) {
    const el = ref.current;
    if (!el) return;
    const { next, cursor } = wrapSelection(el, before, after);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 4, marginBottom: 6,
        padding: '4px 6px', background: 'var(--navy-800)', borderRadius: '6px 6px 0 0',
        border: '1px solid var(--navy-600)', borderBottom: 'none',
      }}>
        {[
          { icon: Bold, label: 'Bold', action: () => applyFormat('**', '**') },
          { icon: Italic, label: 'Italic', action: () => applyFormat('_', '_') },
          { icon: List, label: 'List', action: () => applyFormat('\n- ', '') },
        ].map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={action}
            title={label}
            style={{ padding: '2px 6px' }}
          >
            <Icon size={12} />
          </button>
        ))}
        <span style={{ fontSize: 10, color: 'var(--slate-400)', marginLeft: 'auto', alignSelf: 'center' }}>
          Markdown supported
        </span>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder="Add context, links, or follow-up details…"
        style={{
          fontSize: 13,
          resize: 'vertical',
          width: '100%',
          borderRadius: '0 0 6px 6px',
          minHeight: 100,
        }}
      />
    </div>
  );
}

export function NotesDisplay({ notes }) {
  if (!notes?.trim()) return null;
  return (
    <div style={{
      fontSize: 12,
      color: 'var(--slate-200)',
      marginTop: 8,
      padding: '10px 12px',
      background: 'var(--navy-800)',
      borderRadius: 8,
      border: '1px solid var(--navy-600)',
      lineHeight: 1.5,
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--slate-300)', marginBottom: 6 }}>Notes</div>
      <MarkdownContent>{notes}</MarkdownContent>
    </div>
  );
}
