import { useState, useEffect } from 'react';
import { Key, LogIn, UserPlus } from 'lucide-react';
import { api } from '../lib/api.js';

export default function LoginScreen({
  initialMode = 'login',
  authError,
  onAuthSuccess,
  onRegisterPending,
  onLoginPending,
  onBack,
}) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => { setMode(initialMode); }, [initialMode]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(authError || '');
  const [loading, setLoading] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }
        const result = await api.register({ email, password, name });
        onRegisterPending?.({ pendingId: result.pendingId, email: result.email, codePrefix: result.codePrefix });
      } else {
        const result = await api.login({ email, password });
        onLoginPending?.({
          pendingLoginId: result.pendingLoginId,
          email: result.email,
          codePrefix: result.codePrefix,
          needsEncryptionSetup: result.needsEncryptionSetup,
        });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRecover(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.recoverVault({ email, encryptionKey: recoveryKey });
      onAuthSuccess?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (showRecover) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100%', padding: 24,
      }}>
        <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <Key size={24} color="var(--indigo-light)" style={{ marginBottom: 8 }} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 4 }}>
              Recover with encryption key
            </h1>
            <p style={{ fontSize: 13, color: 'var(--slate-300)', lineHeight: 1.5 }}>
              Use this only if you no longer have access to your email. Enter the private encryption key you saved at account setup.
            </p>
          </div>
          <form onSubmit={handleRecover}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Encryption key</label>
              <input
                type="password"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
                placeholder="Your saved encryption key (UUID)"
                required
              />
            </div>
            {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={loading}>
              {loading ? 'Recovering…' : 'Recover account'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={() => { setShowRecover(false); setError(''); }}>
              Back to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: 24,
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 48, height: 48, background: 'var(--indigo-dim)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            {mode === 'login' ? <LogIn size={22} color="var(--indigo-light)" /> : <UserPlus size={22} color="var(--indigo-light)" />}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 4 }}>
            Meeting Intelligence
          </h1>
          <p style={{ fontSize: 13, color: 'var(--slate-300)' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        <div style={{
          display: 'flex', background: 'var(--navy-800)', borderRadius: 8, padding: 3, marginBottom: 20,
        }}>
          {[
            { id: 'login', label: 'Sign In' },
            { id: 'register', label: 'Create Account' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setMode(tab.id); setError(''); }}
              style={{
                flex: 1, padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: mode === tab.id ? 'var(--indigo)' : 'transparent',
                color: mode === tab.id ? 'white' : 'var(--slate-200)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
              required
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>

          {mode === 'register' && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          {mode === 'register' && (
            <p style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 12, lineHeight: 1.5 }}>
              After sign-up, we will email you a verification code before your account is activated.
            </p>
          )}

          {mode === 'login' && (
            <p style={{ fontSize: 11, color: 'var(--slate-300)', marginBottom: 12, lineHeight: 1.5 }}>
              After password sign-in, we email a verification code every time (2FA).
            </p>
          )}

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 16 }} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Continue' : 'Send verification code'}
          </button>
        </form>

        {mode === 'login' && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginBottom: 16 }}
            onClick={() => setShowRecover(true)}
          >
            <Key size={13} /> Lost email access? Recover with encryption key
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--navy-600)' }} />
          <span style={{ fontSize: 11, color: 'var(--slate-300)' }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'var(--navy-600)' }} />
        </div>

        <a
          href={api.googleLoginUrl()}
          className="btn btn-ghost"
          style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}
        >
          Sign in with Google
        </a>

        {onBack && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={onBack}>
            ← Back to home
          </button>
        )}
      </div>
    </div>
  );
}
