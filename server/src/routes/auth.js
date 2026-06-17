import { Router } from 'express';
import passport from 'passport';
import {
  formatUser,
  requestRegistration,
  resendVerificationCode,
  setupUserEncryption,
  verifyRegistration,
  requestLoginVerification,
  verifyLoginCode,
  recoverVaultAccess,
  resendLoginCode,
} from '../lib/users.js';
import { autoUnlockVault, unlockVault } from '../lib/vault.js';
import { deriveDataKey } from '../lib/encryption.js';
import { linkPendingAssignmentsToUser } from '../lib/actionAssignments.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function loginUser(req, res, user, extra = {}) {
  linkPendingAssignmentsToUser(user.id, user.email).catch((err) => {
    console.warn('[Auth] link assignments failed:', err.message);
  });
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    if (user.encryption_key_verifier) {
      autoUnlockVault(req, user);
    }
    res.json({
      user: formatUser(user, req),
      ...extra,
    });
  });
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });
  if (!password) return res.status(400).json({ error: 'Password is required' });

  try {
    const result = await requestRegistration({ email, password, name });
    res.status(202).json({
      message: 'Verification code sent to your email.',
      pendingId: result.pendingId,
      email: result.email,
      codePrefix: result.codePrefix,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/verify-email', async (req, res) => {
  const { pendingId, code } = req.body;
  if (!pendingId || !code) {
    return res.status(400).json({ error: 'pendingId and code are required' });
  }

  try {
    const user = await verifyRegistration({ pendingId, code });
    loginUser(req, res, user, { needsEncryptionSetup: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/resend-code', async (req, res) => {
  const { pendingId } = req.body;
  if (!pendingId) return res.status(400).json({ error: 'pendingId is required' });

  try {
    const result = await resendVerificationCode(pendingId);
    res.json({
      message: 'A new verification code was sent.',
      expiresAt: result.expiresAt,
      codePrefix: result.codePrefix,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/resend-login-code', async (req, res) => {
  const { pendingLoginId } = req.body;
  if (!pendingLoginId) return res.status(400).json({ error: 'pendingLoginId is required' });

  try {
    const result = await resendLoginCode(pendingLoginId);
    res.json({
      message: 'A new sign-in code was sent.',
      pendingLoginId: result.pendingLoginId,
      expiresAt: result.expiresAt,
      codePrefix: result.codePrefix,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/setup-encryption', async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { user, encryptionKey } = await setupUserEncryption(req.user.id);
    const dataKey = deriveDataKey(encryptionKey, user.encryption_key_salt);
    req.session.vaultKeyB64 = dataKey.toString('base64');
    req.session.vaultUnlockedAt = Date.now();

    res.json({
      encryptionKey,
      user: formatUser(user, req),
      warning:
        'Save this private encryption key in a secure place. You only need it to recover your data if you lose email access.',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Recovery only — for users without email access who have their encryption key. */
router.post('/recover-vault', async (req, res) => {
  const { email, encryptionKey } = req.body;
  if (!email?.trim() || !encryptionKey?.trim()) {
    return res.status(400).json({ error: 'email and encryptionKey are required' });
  }

  try {
    const user = await recoverVaultAccess(email, encryptionKey);
    loginUser(req, res, user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** Legacy: unlock with encryption key while signed in (e.g. old accounts before stored key). */
router.post('/unlock-vault', async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { encryptionKey } = req.body;
  if (!encryptionKey?.trim()) {
    return res.status(400).json({ error: 'encryptionKey is required' });
  }

  try {
    unlockVault(req, encryptionKey, req.user);
    const { storeEncryptionKeyForUser } = await import('../lib/users.js');
    await storeEncryptionKeyForUser(req.user.id, encryptionKey);
    res.json({ success: true, user: formatUser(req.user, req) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', async (err, user, info) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password' });

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Email address is not verified' });
    }

    try {
      const pending = await requestLoginVerification(user);
      res.status(202).json({
        message: 'Sign-in verification code sent to your email.',
        pendingLoginId: pending.pendingLoginId,
        email: pending.email,
        codePrefix: pending.codePrefix,
        expiresAt: pending.expiresAt,
        needsEncryptionSetup: pending.needsEncryptionSetup,
      });
    } catch (loginErr) {
      res.status(loginErr.status || 500).json({ error: loginErr.message });
    }
  })(req, res, next);
});

router.post('/verify-login', async (req, res) => {
  const { pendingLoginId, code } = req.body;
  if (!pendingLoginId || !code) {
    return res.status(400).json({ error: 'pendingLoginId and code are required' });
  }

  try {
    const user = await verifyLoginCode({ pendingLoginId, code });
    loginUser(req, res, user, {
      needsEncryptionSetup: !user.encryption_key_verifier,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google OAuth not configured on server' });
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  passport.authenticate('google', {
    failureRedirect: `${CLIENT_URL}?auth=failed`,
    session: false,
  }, async (err, user) => {
    if (err || !user) {
      return res.redirect(`${CLIENT_URL}?auth=failed`);
    }

    try {
      const pending = await requestLoginVerification(user);
      const params = new URLSearchParams({
        loginVerify: '1',
        pendingLoginId: pending.pendingLoginId,
        email: pending.email,
        codePrefix: pending.codePrefix,
      });
      if (pending.needsEncryptionSetup) params.set('needsEncryptionSetup', '1');
      res.redirect(`${CLIENT_URL}?${params.toString()}`);
    } catch (loginErr) {
      console.error('[Google login 2FA]', loginErr.message);
      res.redirect(`${CLIENT_URL}?auth=failed`);
    }
  })(req, res, next);
});

router.get('/me', async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.json({ user: null });
  }
  try {
    await linkPendingAssignmentsToUser(req.user.id, req.user.email);
    if (req.user.encryption_key_verifier && !req.session?.vaultKeyB64) {
      autoUnlockVault(req, req.user);
    }
  } catch (err) {
    console.warn('[Auth] link assignments on /me failed:', err.message);
  }
  res.json({ user: formatUser(req.user, req) });
});

router.post('/logout', (req, res) => {
  req.logout?.((err) => {
    if (err) return res.status(500).json({ error: err.message });
    req.session?.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ success: true });
    });
  });
});

export default router;
