import { useState } from 'react';
import { Key } from 'lucide-react';
import { api } from '../lib/api.js';

/** One-time prompt for accounts created before auto-unlock was enabled. */
export default function VaultUnlockBanner({ onUnlocked }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await api.unlockVault({ encryptionKey: key });
      onUnlocked?.(result.user);
      setKey('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      padding: '10px 24px',
      background: 'var(--amber-dim)',
      borderBottom: '1px solid var(--amber)',
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 12,
    }}>
      <Key size={16} color="var(--amber)" />
      <span style={{ fontSize: 12, color: 'var(--amber)', flex: 1, minWidth: 200 }}>
        Enter your recovery encryption key once to enable automatic access after sign-in.
      </span>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Recovery key"
          style={{ width: 220, fontSize: 12 }}
          required
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
          {loading ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <span style={{ fontSize: 11, color: 'var(--red)', width: '100%' }}>{error}</span>}
    </div>
  );
}
