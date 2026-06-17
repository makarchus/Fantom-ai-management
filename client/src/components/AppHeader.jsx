import {
  Sparkles, Target, RefreshCw, Settings, LogOut, Key, KeyRound, User,
  ListChecks, Archive, BookOpen, Lock, ArrowRight, Shield,
} from 'lucide-react';

export default function AppHeader({
  mode = 'public',
  user,
  view,
  syncing,
  authStep,
  onLogoClick,
  onGetStarted,
  onSignIn,
  onBackHome,
  onViewChange,
  onOpenSettings,
  onSyncFathom,
  onLogout,
}) {
  const logo = (
    <button
      type="button"
      onClick={onLogoClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'none', border: 'none', cursor: onLogoClick ? 'pointer' : 'default',
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: 'var(--indigo-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Sparkles size={18} color="var(--indigo-light)" />
      </div>
      <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--white-soft)' }}>Meeting Intelligence</span>
    </button>
  );

  const securityBadge = (
    <span
      className="badge"
      style={{
        fontSize: 10,
        padding: '5px 10px',
        background: 'var(--green-dim)',
        color: 'var(--green)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontWeight: 600,
      }}
      title="Meetings, transcripts, and API keys are AES-256 encrypted. Only you can decrypt your data."
    >
      <Lock size={11} />
      AES-256 encrypted · only you can read your data
    </span>
  );

  if (mode === 'loading') {
    return (
      <header style={headerStyle}>
        {logo}
        <div style={{ flex: 1 }} />
        {securityBadge}
      </header>
    );
  }

  if (mode === 'setup') {
    return (
      <header style={headerStyle}>
        {logo}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <span className="badge badge-indigo" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Shield size={12} /> Setting up your private encrypted vault
          </span>
        </div>
        {securityBadge}
      </header>
    );
  }

  if (mode === 'app') {
    return (
      <header style={headerStyle}>
        {logo}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className={`btn ${view === 'my-actions' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={() => onViewChange?.(view === 'my-actions' ? 'welcome' : 'my-actions')}
        >
          <ListChecks size={13} /> My Actions
        </button>
        <button
          type="button"
          className={`btn ${view === 'archive' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={() => onViewChange?.(view === 'archive' ? 'welcome' : 'archive')}
        >
          <Archive size={13} /> Archive
        </button>
        <button
          type="button"
          className={`btn ${view === 'commitments' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={() => onViewChange?.(view === 'commitments' ? 'welcome' : 'commitments')}
        >
          <Target size={13} /> Commitments
        </button>
        <button
          type="button"
          className={`btn ${view === 'user-guide' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
          onClick={() => onViewChange?.(view === 'user-guide' ? 'welcome' : 'user-guide')}
        >
          <BookOpen size={13} /> User Guide
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings} title="Settings">
          <Settings size={13} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onSyncFathom}
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
            background: user?.hasFathomKey ? 'var(--green-dim)' : 'var(--amber-dim)',
            color: user?.hasFathomKey ? 'var(--green)' : 'var(--amber)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {user?.hasFathomKey ? <Key size={10} /> : <KeyRound size={10} />}
          {user?.hasFathomKey ? 'Fathom connected' : 'No API key'}
        </span>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          paddingLeft: 8, borderLeft: '1px solid var(--navy-700)',
        }}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          ) : (
            <div style={{
              width: 24, height: 24, borderRadius: '50%', background: 'var(--indigo-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={12} color="var(--indigo-light)" />
            </div>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white-soft)' }}>
            {user?.name || user?.email}
          </span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout} title="Sign out">
          <LogOut size={13} />
        </button>
      </header>
    );
  }

  // public: landing, login, verify
  const showTrialCta = authStep === 'landing';

  return (
    <header style={headerStyle}>
      {logo}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 12px' }}>
        {securityBadge}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {showTrialCta ? (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSignIn}>Sign in</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={onGetStarted}>
              Start free trial <ArrowRight size={14} />
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBackHome}>
            ← Home
          </button>
        )}
      </div>
    </header>
  );
}

const headerStyle = {
  height: 'var(--header-h)',
  borderBottom: '1px solid var(--navy-700)',
  display: 'flex',
  alignItems: 'center',
  padding: '0 24px',
  gap: 12,
  flexShrink: 0,
  background: 'var(--navy-900)',
  zIndex: 20,
};
