import { useState, useEffect, useCallback } from 'react';
import { Target, RefreshCw, Settings, LogOut, Key, KeyRound, User } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import MeetingImporter from './components/MeetingImporter.jsx';
import MeetingDetail from './components/MeetingDetail.jsx';
import CommitmentsTracker from './components/CommitmentsTracker.jsx';
import ManualMeetingImporter from './components/ManualMeetingImporter.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import VerifyEmailScreen from './components/VerifyEmailScreen.jsx';
import EncryptionKeyScreen from './components/EncryptionKeyScreen.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import { api } from './lib/api.js';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [authStep, setAuthStep] = useState('login');
  const [showSettings, setShowSettings] = useState(false);

  const [sidebarTab, setSidebarTab] = useState('fathom');
  const [fathomMeetings, setFathomMeetings] = useState([]);
  const [dbMeetings, setDbMeetings] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loadingFathom, setLoadingFathom] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fathomError, setFathomError] = useState(null);
  const [fathomWarning, setFathomWarning] = useState(null);

  const [view, setView] = useState('welcome');
  const [selectedFathomMeeting, setSelectedFathomMeeting] = useState(null);
  const [selectedDbMeetingId, setSelectedDbMeetingId] = useState(null);

  const loadAuth = useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'failed') setAuthError('Google sign-in failed. Try again.');
      const { user: u } = await api.getMe();
      setUser(u);
      if (u) {
        if (!u.vaultSetup || params.get('needsEncryptionSetup') === '1') {
          setAuthStep('setup');
        } else if (!u.vaultUnlocked || params.get('needsVaultUnlock') === '1') {
          setAuthStep('unlock');
        } else {
          setAuthStep('app');
        }
      }
      if (params.get('auth')) window.history.replaceState({}, '', '/');
    } catch {
      setUser(null);
      setAuthStep('login');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  function handleAuthSuccess(result) {
    const nextUser = result.user || result;
    setUser(nextUser);
    if (result.needsEncryptionSetup || !nextUser.vaultSetup) {
      setAuthStep('setup');
    } else if (result.needsVaultUnlock || !nextUser.vaultUnlocked) {
      setAuthStep('unlock');
    } else {
      setAuthStep('app');
    }
  }

  function handleRegisterPending({ pendingId, email }) {
    setPendingRegistration({ pendingId, email });
    setAuthStep('verify');
  }

  function handleVerified(result) {
    setPendingRegistration(null);
    handleAuthSuccess(result);
  }

  const loadDbMeetings = useCallback(async () => {
    try {
      const [{ meetings }, { folders: folderList }] = await Promise.all([
        api.getMeetings(),
        api.getFolders(),
      ]);
      setDbMeetings(meetings);
      setFolders(folderList);
    } catch (e) {
      console.warn('Could not load DB meetings:', e.message);
    }
  }, []);

  // Load from local DB only — no Fathom API call
  const loadFathomFromDb = useCallback(async () => {
    setLoadingFathom(true);
    setFathomError(null);
    setFathomWarning(null);
    try {
      const data = await api.listFathomMeetings();
      setFathomMeetings(data.meetings || []);
      if (data.warning) setFathomWarning(data.warning);
    } catch (e) {
      setFathomError(e.message);
    } finally {
      setLoadingFathom(false);
    }
  }, []);

  // User-initiated sync from Fathom API
  const syncFromFathom = useCallback(async () => {
    if (!user?.hasFathomKey) {
      setShowSettings(true);
      return;
    }
    setSyncing(true);
    setFathomError(null);
    setFathomWarning(null);
    try {
      const data = await api.syncFathomMeetings();
      setFathomMeetings(data.meetings || []);
      if (data.warning) setFathomWarning(data.warning);
      setUser((u) => ({ ...u, fathom_synced_at: new Date().toISOString() }));
    } catch (e) {
      setFathomError(e.message);
    } finally {
      setSyncing(false);
    }
  }, [user?.hasFathomKey]);

  useEffect(() => { loadAuth(); }, [loadAuth]);

  useEffect(() => {
    if (user?.vaultUnlocked) {
      loadDbMeetings();
      loadFathomFromDb();
    }
  }, [user?.vaultUnlocked, loadDbMeetings, loadFathomFromDb]);

  async function handleLogout() {
    await api.logout();
    setUser(null);
    setAuthStep('login');
    setPendingRegistration(null);
    setFathomMeetings([]);
    setDbMeetings([]);
    setView('welcome');
  }

  async function handleMoveFolder(meeting, tab, folderId) {
    const folder = folders.find((f) => f.id === folderId);
    try {
      if (tab === 'fathom') {
        const id = meeting.recording_id || meeting.id;
        await api.moveFathomFolder(id, { folder_id: folderId, category: folder?.name });
        setFathomMeetings((prev) => prev.map((m) => {
          const mid = m.recording_id || m.id;
          if (String(mid) !== String(id)) return m;
          return { ...m, folder_id: folderId, folder_name: folder?.name, folder_locked: true, category_source: 'manual' };
        }));
      } else {
        await api.updateMeeting(meeting.id, { folder_id: folderId, category: folder?.name });
        await loadDbMeetings();
      }
    } catch (e) {
      console.error('[Move folder]', e.message);
      alert(e.message || 'Could not move meeting to that folder. Try Refresh and try again.');
    }
  }

  function handleOpenSaved(meetingId) {
    setSelectedDbMeetingId(meetingId);
    setSidebarTab('saved');
    setView('detail');
  }

  function handleSidebarSelect(meeting, tab) {
    if (tab === 'fathom') {
      if (meeting.is_imported && meeting.saved_meeting_id) {
        handleOpenSaved(meeting.saved_meeting_id);
        return;
      }
      setSelectedFathomMeeting(meeting);
      setView('import');
    } else {
      setSelectedDbMeetingId(meeting.id);
      setView('detail');
    }
  }

  function handleImportComplete(meetingId) {
    loadDbMeetings();
    loadFathomFromDb();
    handleOpenSaved(meetingId);
  }

  if (authLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--slate-300)' }}>
        <div className="spinner" style={{ marginRight: 10 }} /> Loading…
      </div>
    );
  }

  if (!user || authStep === 'login') {
    return (
      <LoginScreen
        authError={authError}
        onAuthSuccess={handleAuthSuccess}
        onRegisterPending={handleRegisterPending}
      />
    );
  }

  if (authStep === 'verify' && pendingRegistration) {
    return (
      <VerifyEmailScreen
        pendingId={pendingRegistration.pendingId}
        email={pendingRegistration.email}
        onVerified={handleVerified}
        onBack={() => { setAuthStep('login'); setPendingRegistration(null); }}
      />
    );
  }

  if (authStep === 'setup') {
    return (
      <EncryptionKeyScreen
        mode="setup"
        onComplete={() => {
          setUser((u) => ({ ...u, vaultSetup: true, vaultUnlocked: true }));
          setAuthStep('app');
        }}
      />
    );
  }

  if (authStep === 'unlock') {
    return (
      <EncryptionKeyScreen
        mode="unlock"
        onComplete={(nextUser) => {
          setUser(nextUser);
          setAuthStep('app');
        }}
      />
    );
  }

  if (!user.vaultUnlocked) {
    return (
      <EncryptionKeyScreen
        mode="unlock"
        onComplete={(nextUser) => {
          setUser(nextUser);
          setAuthStep('app');
        }}
      />
    );
  }

  if (!user) return <LoginScreen authError={authError} onAuthSuccess={handleAuthSuccess} onRegisterPending={handleRegisterPending} />;

  const selectedId = view === 'import'
    ? (selectedFathomMeeting?.recording_id || selectedFathomMeeting?.id)
    : selectedDbMeetingId;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        dbMeetings={dbMeetings}
        fathomMeetings={fathomMeetings}
        folders={folders}
        loadingFathom={loadingFathom}
        syncing={syncing}
        hasFathomKey={user.hasFathomKey}
        selectedId={selectedId}
        onSelect={handleSidebarSelect}
        activeTab={sidebarTab}
        onTabChange={(tab) => { setSidebarTab(tab); setView('welcome'); }}
        onMoveFolder={handleMoveFolder}
        onOpenSettings={() => setShowSettings(true)}
        onFoldersChange={loadDbMeetings}
        onOpenSaved={handleOpenSaved}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          height: 'var(--header-h)', borderBottom: '1px solid var(--navy-700)',
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12,
          flexShrink: 0, background: 'var(--navy-900)',
        }}>
          <div style={{ flex: 1 }} />
          <button className={`btn ${view === 'commitments' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            onClick={() => setView(view === 'commitments' ? 'welcome' : 'commitments')}>
            <Target size={13} /> Commitments
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)} title="Settings">
            <Settings size={13} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={syncFromFathom}
            disabled={syncing}
            title="Refresh meetings from Fathom"
          >
            <RefreshCw size={13} className={syncing ? 'spin' : ''} />
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>
          <span
            className="badge"
            style={{
              fontSize: 10,
              padding: '4px 8px',
              background: user.hasFathomKey ? 'var(--green-dim)' : 'var(--amber-dim)',
              color: user.hasFathomKey ? 'var(--green)' : 'var(--amber)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
            title={user.hasFathomKey ? 'Fathom API key configured' : 'Fathom API key not set'}
          >
            {user.hasFathomKey ? <Key size={10} /> : <KeyRound size={10} />}
            {user.hasFathomKey ? 'Fathom connected' : 'No API key'}
          </span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 8,
            borderLeft: '1px solid var(--navy-700)',
          }}>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
            ) : (
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'var(--indigo-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={12} color="var(--indigo-light)" />
              </div>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white-soft)' }}>
              {user.name || user.email}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Sign out">
            <LogOut size={13} />
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          {view === 'commitments' ? (
            <div style={{ height: '100%', overflowY: 'auto' }}>
              <CommitmentsTracker onSelectMeeting={(id) => { setSelectedDbMeetingId(id); setSidebarTab('saved'); setView('detail'); }} />
            </div>
          ) : view === 'import' && selectedFathomMeeting ? (
            <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
              <MeetingImporter
                fathomMeeting={selectedFathomMeeting}
                savedMeetingId={selectedFathomMeeting.saved_meeting_id}
                savedProcessedAt={selectedFathomMeeting.saved_processed_at}
                onImportComplete={handleImportComplete}
                onOpenSaved={handleOpenSaved}
              />
            </div>
          ) : view === 'manual-import' ? (
            <div style={{ height: '100%', overflowY: 'auto', padding: 24 }}>
              <ManualMeetingImporter onImportComplete={handleImportComplete} onBack={() => setView('welcome')} />
            </div>
          ) : view === 'detail' && selectedDbMeetingId ? (
            <MeetingDetail
              meetingId={selectedDbMeetingId}
              folders={folders}
              onBack={() => { setView('welcome'); setSidebarTab('saved'); }}
              onDelete={() => { loadDbMeetings(); setView('welcome'); }}
              onFolderChange={loadDbMeetings}
            />
          ) : (
            <WelcomeScreen
              user={user}
              dbCount={dbMeetings.length}
              fathomCount={fathomMeetings.length}
              fathomError={fathomError}
              fathomWarning={fathomWarning}
              onOpenSettings={() => setShowSettings(true)}
              onBrowseFathom={() => setSidebarTab('fathom')}
              onManualImport={() => setView('manual-import')}
              onViewCommitments={() => setView('commitments')}
            />
          )}
        </div>
      </div>

      {showSettings && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            setUser((u) => ({ ...u, hasFathomKey: true }));
            loadFathomFromDb();
          }}
        />
      )}
    </div>
  );
}

function WelcomeScreen({
  user, dbCount, fathomCount, fathomError, fathomWarning,
  onOpenSettings, onBrowseFathom, onManualImport, onViewCommitments,
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: 40, textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 10 }}>
        Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
      </h1>
      <p style={{ fontSize: 14, color: 'var(--slate-300)', maxWidth: 480, lineHeight: 1.6, marginBottom: 24 }}>
        Meetings are stored locally and organized into folders. Use <strong>Refresh</strong> to pull new meetings from Fathom.
      </p>

      {!user?.hasFathomKey && (
        <div style={{ padding: '12px 16px', background: 'var(--indigo-dim)', borderRadius: 8, marginBottom: 20, maxWidth: 480 }}>
          <p style={{ fontSize: 12, color: 'var(--slate-200)', marginBottom: 10 }}>
            Add your Fathom API key in Settings to sync meetings.
          </p>
          <button className="btn btn-primary btn-sm" onClick={onOpenSettings}>Open Settings</button>
        </div>
      )}

      {fathomWarning && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 16 }}>{fathomWarning}</p>
      )}
      {fathomError && (
        <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 16 }}>{fathomError}</p>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        {[
          { value: fathomCount, label: 'Fathom (cached)', color: 'var(--indigo-light)' },
          { value: dbCount, label: 'Saved', color: 'var(--green)' },
        ].map((s) => (
          <div key={s.label} style={{ background: 'var(--navy-800)', border: '1px solid var(--navy-600)', borderRadius: 12, padding: '20px 28px', minWidth: 120 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: 'var(--slate-300)', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={onBrowseFathom}>Browse Meetings</button>
        <button className="btn btn-ghost" onClick={onManualImport}>Paste Summary</button>
        {dbCount > 0 && (
          <button className="btn btn-ghost" onClick={onViewCommitments}><Target size={14} /> Commitments</button>
        )}
      </div>
    </div>
  );
}
