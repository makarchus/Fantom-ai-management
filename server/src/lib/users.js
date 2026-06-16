import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import {
  createKeyVerifier,
  encryptForStorage,
  generateEncryptionKey,
  generateUserSalt,
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode,
  verifyEncryptionKey,
} from './encryption.js';
import { sendVerificationEmail, sendLoginVerificationEmail } from './email.js';
import { linkPendingAssignmentsToUser } from './actionAssignments.js';
import { isVaultUnlocked } from './vault.js';
import { userHasFathomKey } from './userSecrets.js';

const SALT_ROUNDS = 12;
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

const USER_SELECT = `
  id, google_id, email, name, avatar_url, auth_provider, email_verified,
  encryption_key_salt, encryption_key_verifier, encryption_key_stored_enc, vault_setup_at,
  fathom_api_key_enc, fathom_recorder_email_enc, fathom_synced_at, password_hash
`;

export function formatUser(user, req = null) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    hasFathomKey: userHasFathomKey(user),
    fathom_synced_at: user.fathom_synced_at,
    auth_provider: user.auth_provider || (user.google_id ? 'google' : 'local'),
    email_verified: Boolean(user.email_verified),
    vaultSetup: Boolean(user.encryption_key_verifier),
    vaultUnlocked: req ? isVaultUnlocked(req) : false,
  };
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT ${USER_SELECT} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${USER_SELECT} FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] || null;
}

export async function requestRegistration({ email, password, name }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  if (!password || password.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 400;
    throw err;
  }

  const pending = await pool.query(
    'SELECT id FROM pending_registrations WHERE lower(email) = lower($1)',
    [normalizedEmail],
  );
  if (pending.rows.length) {
    await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pending.rows[0].id]);
  }

  const pendingId = randomUUID();
  const code = generateVerificationCode();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await pool.query(
    `INSERT INTO pending_registrations (id, email, name, password_hash, code_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pendingId, normalizedEmail, name?.trim() || null, passwordHash, hashVerificationCode(code, pendingId), expiresAt],
  );

  await sendVerificationEmail({
    to: normalizedEmail,
    code,
    name: name?.trim(),
  });

  return {
    pendingId,
    email: normalizedEmail,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function verifyRegistration({ pendingId, code }) {
  const { rows } = await pool.query(
    'SELECT * FROM pending_registrations WHERE id = $1',
    [pendingId],
  );
  const pending = rows[0];
  if (!pending) {
    const err = new Error('Registration request not found. Please register again.');
    err.status = 404;
    throw err;
  }

  if (new Date(pending.expires_at) < new Date()) {
    await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pendingId]);
    const err = new Error('Verification code expired. Please register again.');
    err.status = 410;
    throw err;
  }

  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pendingId]);
    const err = new Error('Too many failed attempts. Please register again.');
    err.status = 429;
    throw err;
  }

  if (!verifyVerificationCode(code, pendingId, pending.code_hash)) {
    await pool.query(
      'UPDATE pending_registrations SET attempts = attempts + 1 WHERE id = $1',
      [pendingId],
    );
    const err = new Error('Invalid verification code');
    err.status = 401;
    throw err;
  }

  const existing = await findUserByEmail(pending.email);
  if (existing) {
    await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pendingId]);
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }

  const id = randomUUID();
  const { rows: created } = await pool.query(
    `INSERT INTO users (id, email, name, password_hash, auth_provider, email_verified)
     VALUES ($1, $2, $3, $4, 'local', true)
     RETURNING ${USER_SELECT}`,
    [id, pending.email, pending.name || pending.email.split('@')[0], pending.password_hash],
  );

  await pool.query('DELETE FROM pending_registrations WHERE id = $1', [pendingId]);
  await linkPendingAssignmentsToUser(id, pending.email);
  return created[0];
}

export async function setupUserEncryption(userId) {
  const user = await findUserById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  if (user.encryption_key_verifier) {
    const err = new Error('Encryption vault is already set up');
    err.status = 409;
    throw err;
  }

  const encryptionKey = generateEncryptionKey();
  const salt = generateUserSalt();
  const verifier = createKeyVerifier(encryptionKey, salt);
  const storedEnc = encryptForStorage(encryptionKey);

  const { rows } = await pool.query(
    `UPDATE users SET
      encryption_key_salt = $1,
      encryption_key_verifier = $2,
      encryption_key_stored_enc = $3,
      vault_setup_at = NOW(),
      updated_at = NOW()
     WHERE id = $4
     RETURNING ${USER_SELECT}`,
    [salt, verifier, storedEnc, userId],
  );

  return { user: rows[0], encryptionKey };
}

export async function storeEncryptionKeyForUser(userId, encryptionKey) {
  const storedEnc = encryptForStorage(encryptionKey);
  await pool.query(
    `UPDATE users SET encryption_key_stored_enc = $1, updated_at = NOW() WHERE id = $2`,
    [storedEnc, userId],
  );
}

export async function requestLoginVerification(user) {
  if (!user?.id || !user?.email) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  await pool.query('DELETE FROM pending_logins WHERE user_id = $1', [user.id]);

  const pendingLoginId = randomUUID();
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await pool.query(
    `INSERT INTO pending_logins (id, user_id, code_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [pendingLoginId, user.id, hashVerificationCode(code, pendingLoginId), expiresAt],
  );

  await sendLoginVerificationEmail({
    to: user.email,
    code,
    name: user.name,
  });

  return {
    pendingLoginId,
    email: user.email,
    expiresAt: expiresAt.toISOString(),
    needsEncryptionSetup: !user.encryption_key_verifier,
  };
}

export async function verifyLoginCode({ pendingLoginId, code }) {
  const { rows } = await pool.query(
    'SELECT * FROM pending_logins WHERE id = $1',
    [pendingLoginId],
  );
  const pending = rows[0];
  if (!pending) {
    const err = new Error('Login verification expired. Please sign in again.');
    err.status = 404;
    throw err;
  }

  if (new Date(pending.expires_at) < new Date()) {
    await pool.query('DELETE FROM pending_logins WHERE id = $1', [pendingLoginId]);
    const err = new Error('Verification code expired. Please sign in again.');
    err.status = 410;
    throw err;
  }

  if (pending.attempts >= MAX_CODE_ATTEMPTS) {
    await pool.query('DELETE FROM pending_logins WHERE id = $1', [pendingLoginId]);
    const err = new Error('Too many failed attempts. Please sign in again.');
    err.status = 429;
    throw err;
  }

  if (!verifyVerificationCode(code, pendingLoginId, pending.code_hash)) {
    await pool.query(
      'UPDATE pending_logins SET attempts = attempts + 1 WHERE id = $1',
      [pendingLoginId],
    );
    const err = new Error('Invalid verification code');
    err.status = 401;
    throw err;
  }

  const user = await findUserById(pending.user_id);
  if (!user) {
    await pool.query('DELETE FROM pending_logins WHERE id = $1', [pendingLoginId]);
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  await pool.query('DELETE FROM pending_logins WHERE id = $1', [pendingLoginId]);
  await linkPendingAssignmentsToUser(user.id, user.email);
  return user;
}

export async function resendLoginCode(pendingLoginId) {
  const { rows } = await pool.query(
    'SELECT user_id FROM pending_logins WHERE id = $1',
    [pendingLoginId],
  );
  if (!rows[0]) {
    const err = new Error('Login verification expired. Please sign in again.');
    err.status = 404;
    throw err;
  }
  const user = await findUserById(rows[0].user_id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return requestLoginVerification(user);
}

export async function recoverVaultAccess(email, encryptionKey) {
  const user = await findUserByEmail(email);
  if (!user?.encryption_key_verifier) {
    const err = new Error('No vault found for this account');
    err.status = 404;
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

  await storeEncryptionKeyForUser(user.id, encryptionKey);
  const refreshed = await findUserById(user.id);
  return refreshed;
}

export async function verifyLocalPassword(user, password) {
  if (!user?.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

export async function upsertGoogleUser({ googleId, email, name, avatarUrl }) {
  const byGoogle = await pool.query(`SELECT ${USER_SELECT} FROM users WHERE google_id = $1`, [googleId]);
  if (byGoogle.rows.length) {
    const { rows } = await pool.query(
      `UPDATE users SET email = $1, name = $2, avatar_url = $3, email_verified = true, updated_at = NOW()
       WHERE google_id = $4 RETURNING ${USER_SELECT}`,
      [email, name, avatarUrl, googleId],
    );
    await linkPendingAssignmentsToUser(rows[0].id, email);
    return rows[0];
  }

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    const { rows } = await pool.query(
      `UPDATE users SET google_id = $1, name = COALESCE($2, name), avatar_url = $3,
       email_verified = true,
       auth_provider = CASE WHEN auth_provider = 'local' THEN 'local' ELSE 'google' END,
       updated_at = NOW()
       WHERE id = $4 RETURNING ${USER_SELECT}`,
      [googleId, name, avatarUrl, byEmail.id],
    );
    await linkPendingAssignmentsToUser(byEmail.id, email);
    return rows[0];
  }

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO users (id, google_id, email, name, avatar_url, auth_provider, email_verified)
     VALUES ($1, $2, $3, $4, $5, 'google', true)
     RETURNING ${USER_SELECT}`,
    [id, googleId, email, name, avatarUrl],
  );
  await linkPendingAssignmentsToUser(id, email);
  return rows[0];
}

export async function resendVerificationCode(pendingId) {
  const { rows } = await pool.query(
    'SELECT * FROM pending_registrations WHERE id = $1',
    [pendingId],
  );
  const pending = rows[0];
  if (!pending) {
    const err = new Error('Registration request not found');
    err.status = 404;
    throw err;
  }

  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await pool.query(
    `UPDATE pending_registrations
     SET code_hash = $1, expires_at = $2, attempts = 0
     WHERE id = $3`,
    [hashVerificationCode(code, pendingId), expiresAt, pendingId],
  );

  await sendVerificationEmail({
    to: pending.email,
    code,
    name: pending.name,
  });

  return { expiresAt: expiresAt.toISOString() };
}
