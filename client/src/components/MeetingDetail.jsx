import { useEffect, useState } from 'react';
import { FileText, CheckSquare, ArrowLeft, Clock, Users, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';
import ActionItemsPanel from './ActionItemsPanel.jsx';
import TranscriptViewer from './TranscriptViewer.jsx';
import MarkdownContent from './MarkdownContent.jsx';
import { format, parseISO } from 'date-fns';

const TABS = [
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'actions', label: 'Action Items', icon: CheckSquare },
  { id: 'transcript', label: 'Transcript', icon: FileText },
];

export default function MeetingDetail({ meetingId, folders, onBack, onDelete, onFolderChange, onActionItemsChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!meetingId) return;
    setLoading(true);
    setError(null);
    api.getMeeting(meetingId)
      .then((result) => {
        setData(result);
        setActiveTab(result.meeting?.summary ? 'summary' : 'actions');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [meetingId]);

  async function handleDelete() {
    if (!confirm('Delete this meeting and all related data?')) return;
    await api.deleteMeeting(meetingId);
    onDelete?.();
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, color: 'var(--slate-300)' }}>
        <div className="spinner" />Loading meeting...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 40, maxWidth: 480 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--red)', marginBottom: 8 }}>
          Could not load meeting
        </div>
        <p style={{ fontSize: 13, color: 'var(--slate-200)', lineHeight: 1.6, marginBottom: 16 }}>
          {error || 'This saved meeting was not found. It may have been deleted.'}
        </p>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft size={13} /> Back to meetings
        </button>
      </div>
    );
  }

  const { meeting, action_items, next_steps, transcript } = data;
  const totalItems = action_items.length + next_steps.length;
  const doneCount = action_items.filter((i) => i.status === 'done').length + next_steps.filter((s) => s.status === 'done').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Meeting header */}
      <div style={{
        padding: '20px 24px 0',
        borderBottom: '1px solid var(--navy-700)',
        flexShrink: 0,
      }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12, gap: 5 }}>
          <ArrowLeft size={12} />Back
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', lineHeight: 1.3, marginBottom: 6 }}>
              {meeting.title}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              {folders?.length > 0 && (
                <select
                  value={meeting.folder_id || 'uncategorized'}
                  onChange={async (e) => {
                    await api.updateMeeting(meetingId, { folder_id: e.target.value });
                    onFolderChange?.();
                    const folder = folders.find((f) => f.id === e.target.value);
                    setData((d) => ({
                      ...d,
                      meeting: { ...d.meeting, folder_id: e.target.value, folder_name: folder?.name, folder_locked: true },
                    }));
                  }}
                  style={{ fontSize: 11, padding: '4px 8px', maxWidth: 200 }}
                >
                  {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              )}
              {meeting.folder_locked && (
                <span className="badge badge-slate" style={{ fontSize: 10 }}>Manual folder</span>
              )}
              {meeting.meeting_date && (
                <span style={{ fontSize: 12, color: 'var(--slate-300)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />
                  {format(parseISO(meeting.meeting_date), 'MMMM d, yyyy')}
                </span>
              )}
              {meeting.participants && JSON.parse(typeof meeting.participants === 'string' ? meeting.participants : '[]').length > 0 && (
                <span style={{ fontSize: 12, color: 'var(--slate-300)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={11} />
                  {JSON.parse(typeof meeting.participants === 'string' ? meeting.participants : '[]').join(', ')}
                </span>
              )}
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={handleDelete}>
            <Trash2 size={12} />Delete
          </button>
        </div>

        {/* Progress bar */}
        {totalItems > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: 'var(--slate-300)' }}>Overall progress</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
                {doneCount}/{totalItems} done
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--navy-600)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${(doneCount / totalItems) * 100}%`,
                height: '100%',
                background: 'var(--green)',
                borderRadius: 2,
                transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: 'none' }}>
          {TABS.filter((tab) => tab.id !== 'summary' || meeting.summary).filter((tab) => tab.id !== 'transcript' || transcript).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px',
                  fontSize: 13, fontWeight: 600,
                  color: isActive ? 'var(--indigo-light)' : 'var(--slate-300)',
                  borderBottom: isActive ? '2px solid var(--indigo)' : '2px solid transparent',
                  transition: 'all 0.15s',
                  marginBottom: -1,
                }}
              >
                <Icon size={13} />
                {tab.label}
                {tab.id === 'actions' && totalItems > 0 && (
                  <span className={`badge ${isActive ? 'badge-indigo' : 'badge-slate'}`} style={{ fontSize: 10 }}>
                    {totalItems}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {activeTab === 'summary' && meeting.summary && (
          <div className="fade-in card" style={{ padding: '20px 22px' }}>
            <MarkdownContent>{meeting.summary}</MarkdownContent>
          </div>
        )}
        {activeTab === 'actions' && (
          <div className="fade-in">
            <ActionItemsPanel
              actionItems={action_items}
              nextSteps={next_steps}
              onChanged={onActionItemsChanged}
            />
          </div>
        )}
        {activeTab === 'transcript' && (
          <div className="fade-in">
            <TranscriptViewer transcript={transcript} />
          </div>
        )}
      </div>
    </div>
  );
}
