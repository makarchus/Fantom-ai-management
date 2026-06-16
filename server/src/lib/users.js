import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';

const SALT_ROUNDS = 12;

export function formatUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url,
    hasFathomKey: Boolean(user.fathom_api_key),
    fathom_synced_at: user.fathom_synced_at,
    auth_provider: user.auth_provider || (user.google_id ? 'google' : 'local'),
  };
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, google_id, email, name, avatar_url, fathom_api_key, fathom_synced_at, auth_provider, password_hash
     FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, google_id, email, name, avatar_url, fathom_api_key, fathom_synced_at, auth_provider, password_hash
     FROM users WHERE lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] || null;
}

export async function createLocalUser({ email, password, name }) {
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

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, name, password_hash, auth_provider)
     VALUES ($1, $2, $3, $4, 'local') RETURNING *`,
    [id, normalizedEmail, name?.trim() || normalizedEmail.split('@')[0], passwordHash],
  );
  return rows[0];
}

export async function verifyLocalPassword(user, password) {
  if (!user?.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

export async function upsertGoogleUser({ googleId, email, name, avatarUrl }) {
  const byGoogle = await pool.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  if (byGoogle.rows.length) {
    const { rows } = await pool.query(
      `UPDATE users SET email = $1, name = $2, avatar_url = $3, updated_at = NOW()
       WHERE google_id = $4 RETURNING *`,
      [email, name, avatarUrl, googleId],
    );
    return rows[0];
  }

  const byEmail = await findUserByEmail(email);
  if (byEmail) {
    const { rows } = await pool.query(
      `UPDATE users SET google_id = $1, name = COALESCE($2, name), avatar_url = $3,
       auth_provider = CASE WHEN auth_provider = 'local' THEN 'local' ELSE 'google' END,
       updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [googleId, name, avatarUrl, byEmail.id],
    );
    return rows[0];
  }

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO users (id, google_id, email, name, avatar_url, auth_provider)
     VALUES ($1, $2, $3, $4, $5, 'google') RETURNING *`,
    [id, googleId, email, name, avatarUrl],
  );
  return rows[0];
}
