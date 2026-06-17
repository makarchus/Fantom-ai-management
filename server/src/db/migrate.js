import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432', 10),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const migrations = `
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO folders (id, name, sort_order) VALUES
  ('sales-clients', 'Sales & Clients', 1),
  ('engineering-product', 'Engineering & Product', 2),
  ('one-on-one-team', '1:1 & Team Sync', 3),
  ('leadership-strategy', 'Leadership & Strategy', 4),
  ('customer-success', 'Customer Success', 5),
  ('vendor-partnerships', 'Vendors & Partnerships', 6),
  ('uncategorized', 'Uncategorized', 99)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pending_registrations (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT,
  password_hash TEXT NOT NULL,
  code_prefix   TEXT NOT NULL DEFAULT 'AA',
  code_hash     TEXT NOT NULL,
  attempts      INTEGER DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_registrations_email_lower
  ON pending_registrations (lower(email));

CREATE TABLE IF NOT EXISTS users (
  id                         TEXT PRIMARY KEY,
  google_id                  TEXT UNIQUE,
  email                      TEXT NOT NULL,
  name                       TEXT,
  avatar_url                 TEXT,
  password_hash              TEXT,
  auth_provider              TEXT DEFAULT 'local',
  email_verified             BOOLEAN DEFAULT false,
  encryption_key_salt        TEXT,
  encryption_key_verifier    TEXT,
  vault_setup_at             TIMESTAMPTZ,
  fathom_api_key_enc         TEXT,
  fathom_recorder_email_enc  TEXT,
  fathom_synced_at           TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);

CREATE TABLE IF NOT EXISTS meetings (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fathom_id       TEXT NOT NULL,
  title_enc       TEXT NOT NULL,
  meeting_date    TIMESTAMPTZ,
  duration_secs   INTEGER,
  participants_enc JSONB,
  summary_enc     TEXT,
  summary_raw_enc TEXT,
  processed_at    TIMESTAMPTZ,
  folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
  category        TEXT,
  category_source TEXT,
  folder_locked   BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, fathom_id)
);
CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_folder_id ON meetings(folder_id);

DROP TRIGGER IF EXISTS meetings_updated_at ON meetings;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS transcripts (
  id           SERIAL PRIMARY KEY,
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content_enc  TEXT NOT NULL,
  speakers_enc JSONB,
  imported_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_items (
  id               SERIAL PRIMARY KEY,
  meeting_id       TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  assignee_enc     TEXT NOT NULL,
  assignee_emails_enc TEXT,
  description_enc  TEXT NOT NULL,
  due_date         DATE,
  priority         TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  status           TEXT CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')) DEFAULT 'pending',
  commitment_type  TEXT CHECK (commitment_type IN ('action', 'next_step', 'decision', 'commitment')) DEFAULT 'action',
  notes_enc        TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS action_item_assignments (
  id                SERIAL PRIMARY KEY,
  action_item_id    INTEGER NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  meeting_id        TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  owner_user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_email    TEXT NOT NULL,
  assignee_user_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  description       TEXT NOT NULL,
  notes             TEXT,
  meeting_title     TEXT NOT NULL,
  meeting_date      TIMESTAMPTZ,
  priority          TEXT DEFAULT 'medium',
  status            TEXT DEFAULT 'pending',
  due_date          DATE,
  commitment_type   TEXT DEFAULT 'action',
  notified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (action_item_id, assignee_email)
);
CREATE INDEX IF NOT EXISTS idx_action_item_assignments_assignee_email
  ON action_item_assignments (assignee_email);
CREATE INDEX IF NOT EXISTS idx_action_item_assignments_assignee_user
  ON action_item_assignments (assignee_user_id);

ALTER TABLE action_items ADD COLUMN IF NOT EXISTS assignee_emails_enc TEXT;
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE action_item_assignments ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_key_stored_enc TEXT;

CREATE TABLE IF NOT EXISTS pending_logins (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_prefix   TEXT NOT NULL DEFAULT 'AA',
  code_hash     TEXT NOT NULL,
  attempts      INTEGER DEFAULT 0,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pending_logins_user ON pending_logins (user_id);

ALTER TABLE pending_registrations ADD COLUMN IF NOT EXISTS code_prefix TEXT NOT NULL DEFAULT 'AA';
ALTER TABLE pending_logins ADD COLUMN IF NOT EXISTS code_prefix TEXT NOT NULL DEFAULT 'AA';

CREATE TABLE IF NOT EXISTS action_item_comments (
  id              SERIAL PRIMARY KEY,
  action_item_id  INTEGER NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  author_user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_name     TEXT,
  author_email    TEXT NOT NULL,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_item_comments_item
  ON action_item_comments (action_item_id, created_at);

DROP TRIGGER IF EXISTS action_items_updated_at ON action_items;
CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS next_steps (
  id              SERIAL PRIMARY KEY,
  meeting_id      TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description_enc TEXT NOT NULL,
  owner_enc       TEXT,
  due_date        DATE,
  status          TEXT CHECK (status IN ('pending', 'done')) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fathom_meetings (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recording_id      TEXT NOT NULL,
  title_enc         TEXT NOT NULL,
  meeting_date      TIMESTAMPTZ,
  duration_secs     INTEGER,
  participants_enc  JSONB,
  summary_enc       TEXT,
  action_items_enc  JSONB,
  raw_payload_enc   JSONB,
  folder_id         TEXT REFERENCES folders(id) ON DELETE SET NULL,
  category          TEXT,
  category_source   TEXT,
  folder_locked     BOOLEAN DEFAULT false,
  synced_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, recording_id)
);
CREATE INDEX IF NOT EXISTS idx_fathom_meetings_user_folder ON fathom_meetings(user_id, folder_id);

CREATE TABLE IF NOT EXISTS fathom_meeting_cache (
  recording_id    TEXT PRIMARY KEY,
  title           TEXT,
  folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
  category        TEXT,
  source          TEXT,
  categorized_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fathom_cache_folder ON fathom_meeting_cache(folder_id);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🔄 Running database migrations...');
    await client.query(migrations);
    console.log('✅ Database schema ready.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
