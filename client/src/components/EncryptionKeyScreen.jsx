import { useState } from 'react';
import { Key, ShieldAlert, Copy, CheckCircle } from 'lucide-react';
import { api } from '../lib/api.js';

export default function EncryptionKeyScreen({ onComplete }) {
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

  async function copyKey() {
    await navigator.clipboard.writeText(generatedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!generatedKey) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100%', padding: 24,
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <Key size={20} color="var(--indigo-light)" />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)' }}>
              Create your recovery encryption key
            </h1>
          </div>
          <p style={{ fontSize: 13, color: 'var(--slate-300)', lineHeight: 1.6, marginBottom: 16 }}>
            Your meeting data is encrypted. You sign in with email verification (2FA) each time.
            We also generate a private recovery key — save it only if you might lose email access.
          </p>
          <div style={{
            background: 'var(--amber-dim)', border: '1px solid var(--amber)',
            borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 10,
          }}>
            <ShieldAlert size={18} color="var(--amber)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--amber)', lineHeight: 1.5 }}>
              <strong>Important:</strong> Save this key in a password manager. You only need it to recover your account if you lose email access.
            </p>
          </div>
          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
          <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={handleSetup} disabled={loading}>
            {loading ? 'Generating…' : 'Generate my recovery key'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: 24,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, padding: 28 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 8 }}>
          Save your recovery key
        </h1>
        <p style={{ fontSize: 13, color: 'var(--slate-300)', marginBottom: 16, lineHeight: 1.5 }}>
          Copy this key now. It will not be shown again. You will not need it for normal sign-in.
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
          I have saved my recovery key. I understand it is only needed if I lose email access.
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
