import { useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { api } from '../lib/api.js';

export default function VerifyEmailScreen({
  mode = 'register',
  pendingId,
  pendingLoginId,
  email,
  codePrefix: initialCodePrefix,
  onVerified,
  onPendingLoginIdChange,
  onCodePrefixChange,
  onBack,
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [loginPendingId, setLoginPendingId] = useState(pendingLoginId);
  const [codePrefix, setCodePrefix] = useState(initialCodePrefix || '');

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
        setCodePrefix(result.codePrefix || '');
        onPendingLoginIdChange?.(result.pendingLoginId);
        onCodePrefixChange?.(result.codePrefix);
      } else {
        const result = await api.resendCode({ pendingId });
        setCodePrefix(result.codePrefix || '');
        onCodePrefixChange?.(result.codePrefix);
      }
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%', padding: 24,
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
            We sent a code to <strong style={{ color: 'var(--white-soft)' }}>{email}</strong>
          </p>
        </div>

        {codePrefix && (
          <div style={{
            textAlign: 'center',
            marginBottom: 20,
            padding: '14px 16px',
            borderRadius: 10,
            background: 'var(--indigo-dim)',
            border: '1px solid var(--indigo)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--slate-300)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Enter the code with this prefix
            </div>
            <div style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: '0.2em',
              color: 'var(--indigo-light)',
              fontFamily: 'monospace',
            }}>
              {codePrefix}
            </div>
            <div style={{ fontSize: 11, color: 'var(--slate-300)', marginTop: 8, lineHeight: 1.4 }}>
              In your inbox, find the email titled <em>[{codePrefix}]</em> and enter its 6-digit code below.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--slate-200)', marginBottom: 4 }}>
            6-digit code{codePrefix ? ` for ${codePrefix}` : ''}
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
          <RefreshCw size={14} /> {resending ? 'Sending…' : 'Resend code (new prefix)'}
        </button>

        {onBack && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={onBack}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
