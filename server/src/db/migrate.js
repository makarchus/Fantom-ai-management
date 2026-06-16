import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST,
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

const migrations = `
-- Meetings table: stores imported Fathom meetings
CREATE TABLE IF NOT EXISTS meetings (
  id            TEXT PRIMARY KEY,
  fathom_id     TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  meeting_date  TIMESTAMPTZ,
  duration_secs INTEGER,
  participants  JSONB DEFAULT '[]',
  summary       TEXT,
  summary_raw   TEXT,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Transcripts table: full transcript per meeting
CREATE TABLE IF NOT EXISTS transcripts (
  id          SERIAL PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  speakers    JSONB DEFAULT '[]',
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

-- Action items table: per-person commitments extracted from meetings
CREATE TABLE IF NOT EXISTS action_items (
  id           SERIAL PRIMARY KEY,
  meeting_id   TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  assignee     TEXT NOT NULL,
  description  TEXT NOT NULL,
  due_date     DATE,
  priority     TEXT CHECK (priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  status       TEXT CHECK (status IN ('pending', 'in_progress', 'done', 'cancelled')) DEFAULT 'pending',
  commitment_type TEXT CHECK (commitment_type IN ('action', 'next_step', 'decision', 'commitment')) DEFAULT 'action',
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Next steps table: follow-up items from meetings
CREATE TABLE IF NOT EXISTS next_steps (
  id          SERIAL PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  owner       TEXT,
  due_date    DATE,
  status      TEXT CHECK (status IN ('pending', 'done')) DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Commitments view: union of action items flagged as commitments
CREATE OR REPLACE VIEW commitments_view AS
  SELECT
    ai.id,
    ai.meeting_id,
    m.title AS meeting_title,
    m.meeting_date,
    ai.assignee,
    ai.description,
    ai.due_date,
    ai.priority,
    ai.status,
    ai.commitment_type,
    ai.notes,
    ai.created_at
  FROM action_items ai
  JOIN meetings m ON m.id = ai.meeting_id
  WHERE ai.commitment_type IN ('commitment', 'next_step');

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS meetings_updated_at ON meetings;
CREATE TRIGGER meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS action_items_updated_at ON action_items;
CREATE TRIGGER action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Folders for organizing meetings
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

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS category_source TEXT;

CREATE INDEX IF NOT EXISTS idx_meetings_folder_id ON meetings(folder_id);
CREATE INDEX IF NOT EXISTS idx_meetings_title_search ON meetings (lower(title));

-- Cache AI/rule categorization for Fathom meetings not yet imported
CREATE TABLE IF NOT EXISTS fathom_meeting_cache (
  recording_id    TEXT PRIMARY KEY,
  title           TEXT,
  folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
  category        TEXT,
  source          TEXT,
  categorized_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fathom_cache_folder ON fathom_meeting_cache(folder_id);

-- Users (Google OAuth + local credentials)
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  google_id       TEXT UNIQUE,
  email           TEXT NOT NULL,
  name            TEXT,
  avatar_url      TEXT,
  password_hash   TEXT,
  auth_provider   TEXT DEFAULT 'local',
  fathom_api_key  TEXT,
  fathom_synced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS fathom_recorder_email TEXT;
ALTER TABLE users ALTER COLUMN google_id DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));

-- Express sessions (connect-pg-simple)
CREATE TABLE IF NOT EXISTS user_sessions (
  sid    VARCHAR NOT NULL PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expire ON user_sessions (expire);

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS folder_locked BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON meetings(user_id);

-- Local Fathom meeting catalog per user (avoids repeated API calls)
CREATE TABLE IF NOT EXISTS fathom_meetings (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recording_id    TEXT NOT NULL,
  title           TEXT NOT NULL,
  meeting_date    TIMESTAMPTZ,
  duration_secs   INTEGER,
  participants    JSONB DEFAULT '[]',
  summary         TEXT,
  action_items    JSONB DEFAULT '[]',
  raw_payload     JSONB,
  folder_id       TEXT REFERENCES folders(id) ON DELETE SET NULL,
  category        TEXT,
  category_source TEXT,
  folder_locked   BOOLEAN DEFAULT false,
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, recording_id)
);
CREATE INDEX IF NOT EXISTS idx_fathom_meetings_user_folder ON fathom_meetings(user_id, folder_id);

-- Assign legacy meetings (imported before per-user auth) to the sole account
UPDATE meetings m
SET user_id = u.id
FROM (SELECT id FROM users ORDER BY created_at LIMIT 1) u
WHERE m.user_id IS NULL
  AND (SELECT COUNT(*)::int FROM users) = 1;
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
