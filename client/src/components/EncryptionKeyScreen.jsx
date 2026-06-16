import { useState } from 'react';
import { Key, ShieldAlert, Copy, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';

export default function EncryptionKeyScreen({ mode = 'setup', onComplete }) {
  const [encryptionKey, setEncryptionKey] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSetup() {
    setLoading(true);
    setError('');
    try {
      const result = await api.setupEncryption();
      setGeneratedKey(result.encryptionKey);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.unlockVault({ encryptionKey });
      onComplete?.(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (mode === 'setup' && !generatedKey) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 24, background: 'var(--navy-950)',
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <Key size={20} color="var(--indigo-light)" />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)' }}>
              Create your private encryption key
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--slate-300)', lineHeight: 1.6, marginBottom: 16 }}>
            Your data — including your Fathom API key and meeting content — is encrypted with a unique key
            that only you hold. We store a one-way verifier in the database, not the key itself.
          </p>
          <div style={{
            background: 'var(--amber-dim)', border: '1px solid var(--amber)',
            borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 10,
          }}>
            <ShieldAlert size={18} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>
              <strong>Important:</strong> Save your key in a password manager. If you lose it, your encrypted
              data cannot be recovered — not even by platform administrators.
            </p>
          </div>
          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSetup} disabled={loading}>
            {loading ? 'Generating…' : 'Generate my encryption key'}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'setup' && generatedKey) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 24, background: 'var(--navy-950)',
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 8 }}>
            Save your encryption key
          </h1>
          <p style={{ fontSize: 13, color: 'var(--slate-300)', marginBottom: 16, lineHeight: 1.5 }}>
            Copy this key now. It will not be shown again.
          </p>
          <div style={{
            background: 'var(--navy-800)', borderRadius: 8, padding: 14, marginBottom: 12,
            fontFamily: 'monospace', fontSize: 14, color: 'var(--green)', wordBreak: 'break-all',
          }}>
            {generatedKey}
          </div>
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginBottom: 16 }} onClick={copyKey}>
            {copied ? <><CheckCircle size={14} /> Copied</> : <><Copy size={14} /> Copy key</>}
          </button>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--slate-200)', marginBottom: 16 }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            I have saved my encryption key in a secure place. I understand it cannot be recovered if lost.
          </label>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            disabled={!confirmed}
            onClick={() => onComplete?.()}
          >
            Continue to app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 24, background: 'var(--navy-950)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Key size={24} color="var(--indigo-light)" style={{ marginBottom: 8 }} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 4 }}>
            Unlock your vault
          </h1>
          <p style={{ fontSize: 13, color: 'var(--slate-300)' }}>
            Enter your private encryption key to decrypt your data.
          </p>
        </div>
        <form onSubmit={handleUnlock}>
          <input
            type="password"
            value={encryptionKey}
            onChange={(e) => setEncryptionKey(e.target.value)}
            placeholder="Your encryption key (UUID)"
            required
            autoFocus
            style={{ marginBottom: 12 }}
          />
          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Unlocking…' : 'Unlock vault'}
          </button>
        </form>
      </div>
    </div>
  );
}
