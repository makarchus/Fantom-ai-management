import { Router } from 'express';
import passport from 'passport';
import {
  formatUser,
  requestRegistration,
  resendVerificationCode,
  setupUserEncryption,
  verifyRegistration,
} from '../lib/users.js';
import { unlockVault, lockVault } from '../lib/vault.js';
import { deriveDataKey } from '../lib/encryption.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function loginUser(req, res, user, extra = {}) {
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: err.message });
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
        'Save this private encryption key in a secure place. Without it, your data cannot be recovered — not even by platform administrators.',
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

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
    res.json({ success: true, user: formatUser(req.user, req) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/lock-vault', (req, res) => {
  lockVault(req);
  res.json({ success: true, user: formatUser(req.user, req) });
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password' });

    if (!user.email_verified) {
      return res.status(403).json({ error: 'Email address is not verified' });
    }

    loginUser(req, res, user, {
      needsEncryptionSetup: !user.encryption_key_verifier,
      needsVaultUnlock: Boolean(user.encryption_key_verifier),
    });
  })(req, res, next);
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
  })(req, res, () => {
    if (!req.user?.encryption_key_verifier) {
      return res.redirect(`${CLIENT_URL}?auth=google&needsEncryptionSetup=1`);
    }
    res.redirect(`${CLIENT_URL}?auth=google&needsVaultUnlock=1`);
  });
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.json({ user: null });
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
