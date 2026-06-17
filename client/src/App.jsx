import { useState, useEffect, useCallback } from 'react';
import { Target } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import MeetingImporter from './components/MeetingImporter.jsx';
import MeetingDetail from './components/MeetingDetail.jsx';
import CommitmentsTracker from './components/CommitmentsTracker.jsx';
import ManualMeetingImporter from './components/ManualMeetingImporter.jsx';
import LandingPage from './components/LandingPage.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import VerifyEmailScreen from './components/VerifyEmailScreen.jsx';
import EncryptionKeyScreen from './components/EncryptionKeyScreen.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import MyActionItems from './components/MyActionItems.jsx';
import ArchivedActionItems from './components/ArchivedActionItems.jsx';
import ActionItemsQueue from './components/ActionItemsQueue.jsx';
import VaultUnlockBanner from './components/VaultUnlockBanner.jsx';
import AppHeader from './components/AppHeader.jsx';
import { api } from './lib/api.js';

function AppShell({ header, children, scroll = false }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      overflow: 'hidden', background: 'var(--navy-950)',
    }}>
      {header}
      <div style={{ flex: 1, overflow: scroll ? 'auto' : 'hidden', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [pendingLogin, setPendingLogin] = useState(null);
  const [authStep, setAuthStep] = useState('landing');
  const [loginMode, setLoginMode] = useState('login');
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
  const [actionQueueRefresh, setActionQueueRefresh] = useState(0);

  const bumpActionQueue = useCallback(() => {
    setActionQueueRefresh((n) => n + 1);
  }, []);

  const loadAuth = useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('auth') === 'failed') setAuthError('Google sign-in failed. Try again.');
      const { user: u } = await api.getMe();
      setUser(u);
      if (u) {
        if (!u.vaultSetup || params.get('needsEncryptionSetup') === '1') {
          setAuthStep('setup');
        } else {
          setAuthStep('app');
        }
      } else if (params.get('loginVerify') === '1' && params.get('pendingLoginId')) {
        setPendingLogin({
          pendingLoginId: params.get('pendingLoginId'),
          email: params.get('email') || '',
          codePrefix: params.get('codePrefix') || '',
          needsEncryptionSetup: params.get('needsEncryptionSetup') === '1',
        });
        setAuthStep('login-verify');
      }
      if (params.get('auth') || params.get('loginVerify')) {
        window.history.replaceState({}, '', '/');
      }
      if (u?.vaultUnlocked) bumpActionQueue();
    } catch {
      setUser(null);
      setAuthStep('landing');
    } finally {
      setAuthLoading(false);
    }
  }, [bumpActionQueue]);

  function handleAuthSuccess(result) {
    const nextUser = result.user || result;
    setUser(nextUser);
    setPendingLogin(null);
    if (result.needsEncryptionSetup || !nextUser.vaultSetup) {
      setAuthStep('setup');
    } else {
      setAuthStep('app');
      bumpActionQueue();
    }
  }

  function handleLoginPending({ pendingLoginId, email, codePrefix, needsEncryptionSetup }) {
    setPendingLogin({ pendingLoginId, email, codePrefix, needsEncryptionSetup });
    setAuthStep('login-verify');
  }

  function handleRegisterPending({ pendingId, email, codePrefix }) {
    setPendingRegistration({ pendingId, email, codePrefix });
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
    setAuthStep('landing');
    setLoginMode('login');
    setPendingRegistration(null);
    setPendingLogin(null);
    setFathomMeetings([]);
    setDbMeetings([]);
    setView('welcome');
  }

  function handleGetStarted() {
    setLoginMode('register');
    setAuthStep('login');
  }

  function handleSignIn() {
    setLoginMode('login');
    setAuthStep('login');
  }

  function handlePublicBack() {
    if (authStep === 'login-verify') {
      setAuthStep('login');
      setPendingLogin(null);
    } else if (authStep === 'verify') {
      setAuthStep('landing');
      setPendingRegistration(null);
    } else {
      setAuthStep('landing');
    }
  }

  function handleLogoClick() {
    if (user && authStep === 'app') {
      setView('welcome');
    } else {
      setAuthStep('landing');
    }
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
    bumpActionQueue();
    handleOpenSaved(meetingId);
  }

  const publicHeader = (
    <AppHeader
      mode="public"
      authStep={authStep}
      onLogoClick={handleLogoClick}
      onGetStarted={handleGetStarted}
      onSignIn={handleSignIn}
      onBackHome={handlePublicBack}
    />
  );

  if (authLoading) {
    return (
      <AppShell header={<AppHeader mode="loading" />}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100%', color: 'var(--slate-300)',
        }}>
          <div className="spinner" style={{ marginRight: 10 }} /> Loading…
        </div>
      </AppShell>
    );
  }

  if (!user) {
    if (authStep === 'landing') {
      return (
        <AppShell header={publicHeader} scroll>
          <LandingPage onGetStarted={handleGetStarted} />
        </AppShell>
      );
    }
    if (authStep === 'verify' && pendingRegistration) {
      return (
        <AppShell header={publicHeader}>
          <VerifyEmailScreen
            mode="register"
            pendingId={pendingRegistration.pendingId}
            email={pendingRegistration.email}
            codePrefix={pendingRegistration.codePrefix}
            onVerified={handleVerified}
            onCodePrefixChange={(prefix) => setPendingRegistration((p) => ({ ...p, codePrefix: prefix }))}
          />
        </AppShell>
      );
    }
    if (authStep === 'login-verify' && pendingLogin) {
      return (
        <AppShell header={publicHeader}>
          <VerifyEmailScreen
            mode="login"
            pendingLoginId={pendingLogin.pendingLoginId}
            email={pendingLogin.email}
            codePrefix={pendingLogin.codePrefix}
            onVerified={handleAuthSuccess}
            onPendingLoginIdChange={(id) => setPendingLogin((p) => ({ ...p, pendingLoginId: id }))}
            onCodePrefixChange={(prefix) => setPendingLogin((p) => ({ ...p, codePrefix: prefix }))}
          />
        </AppShell>
      );
    }
    return (
      <AppShell header={publicHeader}>
        <LoginScreen
          initialMode={loginMode}
          authError={authError}
          onAuthSuccess={handleAuthSuccess}
          onRegisterPending={handleRegisterPending}
          onLoginPending={handleLoginPending}
        />
      </AppShell>
    );
  }

  if (authStep === 'setup' || !user.vaultSetup) {
    return (
      <AppShell header={<AppHeader mode="setup" onLogoClick={handleLogoClick} />}>
        <EncryptionKeyScreen
          onComplete={() => {
            setUser((u) => ({ ...u, vaultSetup: true, vaultUnlocked: true }));
            setAuthStep('app');
            bumpActionQueue();
          }}
        />
      </AppShell>
    );
  }

  const selectedId = view === 'import'
    ? (selectedFathomMeeting?.recording_id || selectedFathomMeeting?.id)
    : selectedDbMeetingId;

  const appHeader = (
    <AppHeader
      mode="app"
      user={user}
      view={view}
      syncing={syncing}
      onLogoClick={handleLogoClick}
      onViewChange={setView}
      onOpenSettings={() => setShowSettings(true)}
      onSyncFathom={syncFromFathom}
      onLogout={handleLogout}
    />
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {appHeader}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
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

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
            {user.vaultSetup && !user.vaultUnlocked && (
              <VaultUnlockBanner onUnlocked={(u) => setUser(u)} />
            )}

            <div style={{ flex: 1, overflow: 'hidden' }}>
              {view === 'user-guide' ? (
                <iframe
                  src="/docs/user-guide.html"
                  title="User Guide"
                  style={{ width: '100%', height: '100%', border: 'none', background: 'var(--navy-950)' }}
                />
              ) : view === 'my-actions' ? (
                <MyActionItems />
              ) : view === 'archive' ? (
                <ArchivedActionItems
                  onSelectMeeting={(id) => { setSelectedDbMeetingId(id); setSidebarTab('saved'); setView('detail'); }}
                  onChanged={bumpActionQueue}
                />
              ) : view === 'commitments' ? (
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
                  onDelete={() => { loadDbMeetings(); setView('welcome'); bumpActionQueue(); }}
                  onFolderChange={loadDbMeetings}
                  onActionItemsChanged={bumpActionQueue}
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

          <ActionItemsQueue
            refreshKey={actionQueueRefresh}
            onSelectMeeting={(id) => {
              setSelectedDbMeetingId(id);
              setSidebarTab('saved');
              setView('detail');
              bumpActionQueue();
            }}
          />
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
        Meetings are stored in your encrypted vault and organized into folders. Use <strong>Refresh</strong> to pull new meetings from Fathom.
      </p>

      {!user?.hasFathomKey && (
        <div style={{ padding: '12px 16px', background: 'var(--indigo-dim)', borderRadius: 8, marginBottom: 20, maxWidth: 480 }}>
          <p style={{ fontSize: 12, color: 'var(--slate-200)', marginBottom: 10 }}>
            Add your Fathom API key in Settings to sync meetings.
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenSettings}>Open Settings</button>
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
        <button type="button" className="btn btn-primary" onClick={onBrowseFathom}>Browse Meetings</button>
        <button type="button" className="btn btn-ghost" onClick={onManualImport}>Paste Summary</button>
        {dbCount > 0 && (
          <button type="button" className="btn btn-ghost" onClick={onViewCommitments}><Target size={14} /> Commitments</button>
        )}
      </div>
    </div>
  );
}
