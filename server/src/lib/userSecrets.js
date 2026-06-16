import pool from '../db/pool.js';
import { decryptString, encryptString } from './encryption.js';
import { getVaultKey } from './vault.js';

export async function getUserSecrets(userId, vaultKey) {
  const { rows } = await pool.query(
    `SELECT fathom_api_key_enc, fathom_recorder_email_enc, email
     FROM users WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row) return { fathomApiKey: null, fathomRecorderEmail: null };

  return {
    fathomApiKey: row.fathom_api_key_enc
      ? decryptString(row.fathom_api_key_enc, vaultKey)
      : null,
    fathomRecorderEmail: row.fathom_recorder_email_enc
      ? decryptString(row.fathom_recorder_email_enc, vaultKey)
      : row.email,
  };
}

export async function getUserSecretsFromRequest(req) {
  const vaultKey = getVaultKey(req);
  if (!vaultKey) {
    const err = new Error('Vault locked. Enter your private encryption key to continue.');
    err.status = 403;
    err.code = 'VAULT_LOCKED';
    throw err;
  }
  return getUserSecrets(req.user.id, vaultKey);
}

export async function saveUserSecrets(userId, vaultKey, { fathomApiKey, fathomRecorderEmail }) {
  const fathom_api_key_enc = fathomApiKey
    ? encryptString(fathomApiKey, vaultKey)
    : null;
  const fathom_recorder_email_enc = fathomRecorderEmail
    ? encryptString(fathomRecorderEmail, vaultKey)
    : null;

  await pool.query(
    `UPDATE users SET
      fathom_api_key_enc = $1,
      fathom_recorder_email_enc = $2,
      updated_at = NOW()
     WHERE id = $3`,
    [fathom_api_key_enc, fathom_recorder_email_enc, userId],
  );
}

export function userHasFathomKey(user) {
  return Boolean(user?.fathom_api_key_enc);
}
