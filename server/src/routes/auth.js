import { Router } from 'express';
import passport from 'passport';
import { createLocalUser, formatUser } from '../lib/users.js';

const router = Router();
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

function loginUser(req, res, user) {
  req.login(user, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ user: formatUser(user) });
  });
}

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email?.trim()) return res.status(400).json({ error: 'Email is required' });
  if (!password) return res.status(400).json({ error: 'Password is required' });

  try {
    const user = await createLocalUser({ email, password, name });
    loginUser(req, res, user);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: info?.message || 'Invalid email or password' });
    loginUser(req, res, user);
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
    res.redirect(CLIENT_URL);
  });
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.json({ user: null });
  }
  res.json({ user: formatUser(req.user) });
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
