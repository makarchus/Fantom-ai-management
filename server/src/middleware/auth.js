export function requireAuth(req, res, next) {
  if (req.isAuthenticated?.() && req.user) return next();
  res.status(401).json({ error: 'Authentication required' });
}

export function getUserId(req) {
  return req.user?.id;
}

export { getVaultKey, isVaultUnlocked, requireVault } from '../lib/vault.js';

export async function getUserFathomKey(req) {
  const { getUserSecretsFromRequest } = await import('../lib/userSecrets.js');
  const secrets = await getUserSecretsFromRequest(req);
  return secrets.fathomApiKey || null;
}
