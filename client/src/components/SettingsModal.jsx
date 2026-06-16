import { useState, useEffect } from 'react';
import { Settings, X, Key, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';

export default function SettingsModal({ user, onClose, onSaved }) {
  const [fathomKey, setFathomKey] = useState('');
  const [recorderEmail, setRecorderEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    api.getSettings()
      .then(({ settings }) => {
        if (settings?.fathom_recorder_email) setRecorderEmail(settings.fathom_recorder_email);
      })
      .catch(() => {});
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = { fathom_recorder_email: recorderEmail.trim() || null };
      if (fathomKey.trim()) body.fathom_api_key = fathomKey.trim();
      else if (!user?.hasFathomKey) {
        setError('Fathom API key is required.');
        return;
      }

      const result = await api.updateSettings(body);
      const msg = result.initialSync
        ? `Saved! Synced ${result.initialSync.total} meetings for ${result.initialSync.recorderEmail || recorderEmail}.`
        : 'Settings saved.';
      setSuccess(msg);
      onSaved?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 24 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} color="var(--indigo-light)" />
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--white-soft)' }}>Settings</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--slate-300)' }}>
          Signed in as <strong style={{ color: 'var(--white-soft)' }}>{user?.email}</strong>
        </div>

        <form onSubmit={handleSave}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--slate-200)', marginBottom: 6 }}>
            <Key size={12} style={{ display: 'inline', marginRight: 4 }} />
            Fathom API Key
          </label>
          <p style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 8, lineHeight: 1.5 }}>
            Generate in Fathom → Settings → API Access. Only meetings you recorded are synced.
          </p>
          <input
            type="password"
            value={fathomKey}
            onChange={(e) => setFathomKey(e.target.value)}
            placeholder={user?.hasFathomKey ? 'Leave blank to keep current key' : 'Paste your Fathom API key'}
            style={{ marginBottom: 16 }}
          />

          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--slate-200)', marginBottom: 6 }}>
            Fathom recorder email
          </label>
          <p style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 8, lineHeight: 1.5 }}>
            Only meetings recorded by this email are downloaded. Use your Fathom login email if it differs from the account above.
          </p>
          <input
            type="email"
            value={recorderEmail}
            onChange={(e) => setRecorderEmail(e.target.value)}
            placeholder={user?.email || 'you@company.com'}
            style={{ marginBottom: 16 }}
          />

          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
          {success && (
            <p style={{ fontSize: 12, color: 'var(--green)', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
              <CheckCircle size={14} />{success}
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save & Sync'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
