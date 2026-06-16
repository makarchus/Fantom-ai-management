import { useState } from 'react';
import { FileText, Search, ChevronDown, ChevronUp } from 'lucide-react';

export default function TranscriptViewer({ transcript }) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(false);

  if (!transcript) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '20px',
        color: 'var(--slate-300)',
        fontSize: 13,
      }}>
        <FileText size={16} />
        No transcript available for this meeting.
      </div>
    );
  }

  const content = transcript.content || '';
  const lines = content.split('\n').filter(Boolean);

  const filteredLines = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  function highlight(text) {
    if (!search) return text;
    const idx = text.toLowerCase().indexOf(search.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: 'rgba(99,102,241,0.4)', color: 'inherit', borderRadius: 2 }}>
          {text.slice(idx, idx + search.length)}
        </mark>
        {text.slice(idx + search.length)}
      </>
    );
  }

  const visibleLines = expanded ? filteredLines : filteredLines.slice(0, 30);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--slate-100)', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <FileText size={14} color="var(--indigo-light)" />
          Meeting Transcript
          <span className="badge badge-slate" style={{ fontSize: 10 }}>{lines.length} lines</span>
        </div>
        <div style={{ position: 'relative', width: 200 }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate-300)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transcript..."
            style={{ paddingLeft: 26, fontSize: 12, padding: '5px 5px 5px 26px' }}
          />
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          lineHeight: 1.7,
          padding: '16px',
          maxHeight: expanded ? '600px' : '400px',
          overflowY: 'auto',
          background: 'var(--navy-950)',
          borderRadius: 'var(--radius-lg)',
        }}>
          {filteredLines.length === 0 ? (
            <span style={{ color: 'var(--slate-300)' }}>No results for "{search}"</span>
          ) : (
            visibleLines.map((line, i) => {
              // Detect speaker pattern like "Name: ..." or "[00:00] Name: ..."
              const speakerMatch = line.match(/^(\[[\d:]+\]\s+)?([^:]+):\s(.+)$/);
              if (speakerMatch) {
                const [, timestamp, speaker, text] = speakerMatch;
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    {timestamp && (
                      <span style={{ color: 'var(--navy-500)', fontSize: 10, marginRight: 6 }}>{timestamp.trim()}</span>
                    )}
                    <span style={{ color: 'var(--indigo-light)', fontWeight: 500 }}>{speaker}:</span>
                    <span style={{ color: 'var(--slate-100)', marginLeft: 6 }}>{highlight(text)}</span>
                  </div>
                );
              }
              return (
                <div key={i} style={{ color: 'var(--slate-200)', marginBottom: 4 }}>
                  {highlight(line)}
                </div>
              );
            })
          )}
          {!expanded && filteredLines.length > 30 && (
            <div style={{ color: 'var(--slate-400)', marginTop: 8, fontSize: 11 }}>
              ... {filteredLines.length - 30} more lines
            </div>
          )}
        </div>

        {filteredLines.length > 30 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn btn-ghost"
            style={{
              width: '100%',
              borderTop: '1px solid var(--navy-700)',
              borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
              fontSize: 12,
              padding: '8px',
              justifyContent: 'center',
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Collapse' : `Show all ${filteredLines.length} lines`}
          </button>
        )}
      </div>

      {transcript.imported_at && (
        <div style={{ fontSize: 11, color: 'var(--slate-400)', marginTop: 8 }}>
          Imported {new Date(transcript.imported_at).toLocaleString()}
        </div>
      )}
    </div>
  );
}
