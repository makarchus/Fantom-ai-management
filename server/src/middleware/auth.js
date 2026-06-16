export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.() && req.user) return next();
  res.status(401).json({ error: 'Authentication required' });
}

export function getUserId(req) {
  return req.user?.id;
}

export function getUserFathomKey(req) {
  return req.user?.fathom_api_key || null;
}
