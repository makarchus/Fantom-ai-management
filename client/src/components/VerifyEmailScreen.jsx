import { useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';

export default function VerifyEmailScreen({
  mode = 'register',
  pendingId,
  pendingLoginId,
  email,
  onVerified,
  onPendingLoginIdChange,
  onBack,
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loginPendingId, setLoginPendingId] = useState(pendingLoginId);

  const isLogin = mode === 'login';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = isLogin
        ? await api.verifyLogin({ pendingLoginId: loginPendingId, code })
        : await api.verifyEmail({ pendingId, code });
      onVerified?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setError('');
    try {
      if (isLogin) {
        const result = await api.resendLoginCode({ pendingLoginId: loginPendingId });
        setLoginPendingId(result.pendingLoginId);
        onPendingLoginIdChange?.(result.pendingLoginId);
      } else {
        await api.resendCode({ pendingId });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 24, background: 'var(--navy-950)',
    }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, padding: 28 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 48, height: 48, background: 'var(--indigo-dim)', borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <Mail size={22} color="var(--indigo-light)" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--white-soft)', marginBottom: 4 }}>
            {isLogin ? 'Verify sign-in' : 'Verify your email'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--slate-300)', lineHeight: 1.5 }}>
            We sent a 6-digit code to <strong style={{ color: 'var(--white-soft)' }}>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>
            Verification code
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            required
            autoFocus
            style={{ marginBottom: 12, letterSpacing: '0.25em', textAlign: 'center', fontSize: 18 }}
          />

          {error && <p style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</p>}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={loading}>
            {loading ? 'Verifying…' : isLogin ? 'Verify & Sign In' : 'Verify & Continue'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={handleResend}
          disabled={resending}
        >
          <RefreshCw size={14} /> {resending ? 'Sending…' : 'Resend code'}
        </button>

        <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={onBack}>
          Back to sign in
        </button>
      </div>
    </div>
  );
}
