import { deriveDataKey, verifyEncryptionKey, decryptFromStorage } from './encryption.js';

export function getVaultKey(req) {
  if (!req.session?.vaultKeyB64) return null;
  return Buffer.from(req.session.vaultKeyB64, 'base64');
}

export function isVaultUnlocked(req) {
  return Boolean(getVaultKey(req));
}

export function unlockVault(req, encryptionKey, user) {
  if (!user?.encryption_key_salt || !user?.encryption_key_verifier) {
    const err = new Error('Encryption vault is not set up for this account');
    err.status = 400;
    throw err;
  }

  const valid = verifyEncryptionKey(
    encryptionKey,
    user.encryption_key_salt,
    user.encryption_key_verifier,
  );
  if (!valid) {
    const err = new Error('Invalid encryption key');
    err.status = 401;
    throw err;
  }

  const dataKey = deriveDataKey(encryptionKey, user.encryption_key_salt);
  req.session.vaultKeyB64 = dataKey.toString('base64');
  req.session.vaultUnlockedAt = Date.now();
}

/** Auto-unlock vault after email 2FA using server-stored encrypted key. */
export function autoUnlockVault(req, user) {
  if (!user?.encryption_key_stored_enc || !user?.encryption_key_verifier) return false;
  try {
    const encryptionKey = decryptFromStorage(user.encryption_key_stored_enc);
    if (!encryptionKey) return false;
    unlockVault(req, encryptionKey, user);
    return true;
  } catch {
    return false;
  }
}

export function lockVault(req) {
  delete req.session.vaultKeyB64;
  delete req.session.vaultUnlockedAt;
}

export function requireVault(req, res, next) {
  if (!isVaultUnlocked(req)) {
    return res.status(403).json({
      error: 'Vault locked. Enter your private encryption key to continue.',
      code: 'VAULT_LOCKED',
    });
  }
  next();
}
