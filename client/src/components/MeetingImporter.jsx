import { useState } from 'react';
import { Download, CheckCircle, FileText, Brain, AlertCircle, Database, ExternalLink } from 'lucide-react';
import { api } from '../lib/api.js';
import { format, parseISO } from 'date-fns';

const STEPS = [
  { id: 'summary', label: 'Loading summary from Fathom', icon: FileText },
  { id: 'process', label: 'Importing action items', icon: Brain },
  { id: 'save', label: 'Saving to database', icon: Download },
];

export default function MeetingImporter({
  fathomMeeting,
  savedMeetingId,
  savedProcessedAt,
  onImportComplete,
  onOpenSaved,
}) {
  const [step, setStep] = useState(null);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const fathomId = fathomMeeting?.recording_id || fathomMeeting?.id || fathomMeeting?.call_id;
  const title = fathomMeeting?.title || fathomMeeting?.call_title || fathomMeeting?.meeting_title || 'Untitled';
  const meetingDate = fathomMeeting?.started_at || fathomMeeting?.date || fathomMeeting?.meeting_date;
  const meetingId = savedMeetingId || `fathom_${fathomId}`;
  const alreadyImported = Boolean(savedMeetingId);

  async function handleImport() {
    if (alreadyImported) return;
    setError(null);
    setStep('summary');

    try {
      let summary = fathomMeeting?.default_summary?.markdown_formatted
        || fathomMeeting?.summary
        || '';

      if (!summary) {
        const summaryRes = await api.getFathomSummary(fathomId);
        summary = summaryRes.summary || '';
      }

      if (!summary) {
        throw new Error('Could not retrieve summary from Fathom. Try "Paste Summary" on the home screen.');
      }

      setStep('process');

      const processRes = await api.processMeeting({
        meetingId: `fathom_${fathomId}`,
        fathomId,
        title,
        meetingDate,
        summary,
        transcript: '',
        participants: fathomMeeting?.participants || fathomMeeting?.attendees || fathomMeeting?.calendar_invitees || [],
        fathomActionItems: Array.isArray(fathomMeeting?.action_items)
          ? fathomMeeting.action_items
          : [],
        folder_id: fathomMeeting?.folder_id,
        category: fathomMeeting?.category,
        folder_locked: fathomMeeting?.folder_locked,
      });

      setResults(processRes);
      setStep('done');
      onImportComplete?.(processRes.meetingId || meetingId);
    } catch (err) {
      if (err.status === 409 && err.data?.alreadyImported) {
        onOpenSaved?.(err.data.meetingId);
        return;
      }
      setError(err.message);
      setStep('error');
    }
  }

  const stepOrder = ['summary', 'process', 'save'];
  const currentStepIdx = stepOrder.indexOf(step);

  return (
    <div className="card fade-in" style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--slate-300)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
          Import Meeting
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)' }}>{title}</div>
        {meetingDate && (
          <div style={{ fontSize: 12, color: 'var(--slate-300)', marginTop: 4 }}>
            {format(parseISO(meetingDate), 'MMMM d, yyyy • h:mm a')}
          </div>
        )}
      </div>

      {alreadyImported && (
        <div className="fade-in">
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 12,
            padding: '14px 16px',
            background: 'var(--green-dim)',
            borderRadius: 8,
            border: '1px solid rgba(16,185,129,0.3)',
            marginBottom: 16,
          }}>
            <CheckCircle size={20} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>
                Already imported & processed
              </div>
              <p style={{ fontSize: 12, color: 'var(--slate-200)', lineHeight: 1.5, marginBottom: 12 }}>
                This meeting is in your Saved library.
                {savedProcessedAt && (
                  <> Processed {format(parseISO(savedProcessedAt), 'MMM d, yyyy • h:mm a')}.</>
                )}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => onOpenSaved?.(meetingId)}
                style={{ gap: 6 }}
              >
                <Database size={14} />
                View in Saved
                <ExternalLink size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {!alreadyImported && step === null && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--slate-200)', marginBottom: 20, lineHeight: 1.6 }}>
            This will import the summary and action items from Fathom (no separate AI key required).
          </p>
          <button className="btn btn-primary" onClick={handleImport} style={{ gap: 8 }}>
            <Download size={15} />
            Import & Process Meeting
          </button>
        </div>
      )}

      {!alreadyImported && step && step !== 'done' && step !== 'error' && (
        <div>
          <div style={{ marginBottom: 20 }}>
            {STEPS.map((s, i) => {
              const idx = stepOrder.indexOf(s.id);
              const isDone = idx < currentStepIdx;
              const isActive = idx === currentStepIdx;
              const Icon = s.icon;
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0',
                  borderBottom: i < STEPS.length - 1 ? '1px solid var(--navy-600)' : 'none',
                  opacity: idx > currentStepIdx ? 0.4 : 1,
                  transition: 'opacity 0.3s',
                }}>
                  <div style={{
                    width: 28, height: 28,
                    borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isDone ? 'var(--green-dim)' : isActive ? 'var(--indigo-dim)' : 'var(--navy-600)',
                    flexShrink: 0,
                  }}>
                    {isDone ? (
                      <CheckCircle size={14} color="var(--green)" />
                    ) : isActive ? (
                      <div className="spinner" style={{ width: 12, height: 12 }} />
                    ) : (
                      <Icon size={12} color="var(--slate-300)" />
                    )}
                  </div>
                  <span style={{
                    fontSize: 13,
                    color: isDone ? 'var(--green)' : isActive ? 'var(--white-soft)' : 'var(--slate-300)',
                    fontWeight: isActive ? 600 : 400,
                  }}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!alreadyImported && step === 'done' && results && (
        <div className="fade-in">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px',
            background: results.warning ? 'var(--amber-dim)' : 'var(--green-dim)',
            borderRadius: 8,
            border: results.warning
              ? '1px solid rgba(245,158,11,0.3)'
              : '1px solid rgba(16,185,129,0.3)',
            marginBottom: 16,
          }}>
            <CheckCircle size={18} color={results.warning ? 'var(--amber)' : 'var(--green)'} />
            <span style={{ fontSize: 13, fontWeight: 600, color: results.warning ? 'var(--amber)' : 'var(--green)' }}>
              {results.warning || 'Meeting imported successfully'}
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
      )}

      {!alreadyImported && step === 'error' && (
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-start',
          padding: '12px 16px',
          background: 'var(--red-dim)',
          borderRadius: 8,
          border: '1px solid rgba(239,68,68,0.3)',
        }}>
          <AlertCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Import failed</div>
            <div style={{ fontSize: 12, color: 'var(--slate-200)' }}>{error}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setStep(null); setError(null); }} style={{ marginTop: 10 }}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
