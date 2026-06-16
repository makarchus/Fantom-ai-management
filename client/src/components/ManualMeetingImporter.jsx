import { useState } from 'react';
import { Brain, CheckCircle, AlertCircle, ClipboardPaste } from 'lucide-react';
import { api } from '../lib/api.js';

export default function ManualMeetingImporter({ onImportComplete, onBack }) {
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [summary, setSummary] = useState('');
  const [step, setStep] = useState(null); // null | 'process' | 'done' | 'error'
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  async function handleImport(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Meeting title is required.');
      return;
    }
    if (!summary.trim()) {
      setError('Paste the meeting summary from Fathom.');
      return;
    }

    const meetingId = `manual_${Date.now()}`;
    setStep('process');

    try {
      const processRes = await api.processMeeting({
        meetingId,
        fathomId: meetingId,
        title: title.trim(),
        meetingDate: meetingDate || null,
        summary: summary.trim(),
        participants: [],
      });

      setResults(processRes);
      setStep('done');
      onImportComplete?.(meetingId);
    } catch (err) {
      setError(err.message);
      setStep('error');
    }
  }

  const fieldStyle = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--navy-700)',
    border: '1px solid var(--navy-600)',
    borderRadius: 8,
    color: 'var(--white-soft)',
    fontSize: 13,
    fontFamily: 'inherit',
  };

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--slate-300)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 6,
  };

  if (step === 'done' && results) {
    return (
      <div className="card fade-in" style={{ padding: 24, maxWidth: 640 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          background: 'var(--green-dim)',
          borderRadius: 8,
          border: '1px solid rgba(16,185,129,0.3)',
          marginBottom: 16,
        }}>
          <CheckCircle size={18} color="var(--green)" />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>
            Action items extracted successfully
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: 'Action Items', count: results.counts?.action_items, color: 'var(--indigo-light)' },
            { label: 'Next Steps', count: results.counts?.next_steps, color: 'var(--green)' },
            { label: 'Decisions', count: results.counts?.key_decisions, color: 'var(--amber)' },
          ].map((stat) => (
            <div key={stat.label} style={{
              flex: 1,
              background: 'var(--navy-700)',
              borderRadius: 8,
              padding: '12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: stat.color }}>{stat.count || 0}</div>
              <div style={{ fontSize: 11, color: 'var(--slate-300)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card fade-in" style={{ padding: 24, maxWidth: 720 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
          Import from Fathom
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)' }}>Paste meeting summary</div>
        <p style={{ fontSize: 13, color: 'var(--slate-300)', marginTop: 8, lineHeight: 1.6 }}>
          Open a recording at <a href="https://fathom.video" target="_blank" rel="noreferrer" style={{ color: 'var(--indigo-light)' }}>fathom.video</a>,
          copy the <strong>Summary</strong>, and paste it below. AI will extract action items by person — no API key or video needed.
        </p>
      </div>

      <form onSubmit={handleImport}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Meeting title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly sync with product team"
            style={fieldStyle}
            disabled={step === 'process'}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Date (optional)</label>
          <input
            type="datetime-local"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            style={fieldStyle}
            disabled={step === 'process'}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Meeting summary</label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Paste the Fathom AI summary here — including action items, next steps, etc."
            rows={12}
            style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.5 }}
            disabled={step === 'process'}
          />
        </div>

        {error && (
          <div style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '12px 16px',
            background: 'var(--red-dim)',
            borderRadius: 8,
            border: '1px solid rgba(239,68,68,0.3)',
            marginBottom: 16,
          }}>
            <AlertCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: 'var(--slate-200)' }}>{error}</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {onBack && (
            <button type="button" className="btn btn-ghost" onClick={onBack} disabled={step === 'process'}>
              Back
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={step === 'process'} style={{ gap: 8 }}>
            {step === 'process' ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Extracting action items...
              </>
            ) : (
              <>
                <Brain size={15} />
                Extract Action Items
              </>
            )}
          </button>
        </div>
      </form>

      <div style={{
        marginTop: 24,
        padding: '14px 16px',
        background: 'var(--navy-800)',
        borderRadius: 8,
        border: '1px solid var(--navy-600)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <ClipboardPaste size={14} color="var(--indigo-light)" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--white-soft)' }}>Quick steps</span>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--slate-300)', lineHeight: 1.7 }}>
          <li>Log in at fathom.video</li>
          <li>Open any recording</li>
          <li>Copy everything from the <strong>Summary</strong> tab</li>
          <li>Paste above and click Extract Action Items</li>
        </ol>
      </div>
    </div>
  );
}
