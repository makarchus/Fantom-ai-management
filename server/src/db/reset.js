import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

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

const resetSql = `
DROP TABLE IF EXISTS fathom_meetings CASCADE;
DROP TABLE IF EXISTS fathom_meeting_cache CASCADE;
DROP TABLE IF EXISTS action_items CASCADE;
DROP TABLE IF EXISTS next_steps CASCADE;
DROP TABLE IF EXISTS transcripts CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS pending_registrations CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS folders CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;
`;

function runMigrate() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['src/db/migrate.js'], {
      cwd: join(__dirname, '../..'),
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`migrate.js exited with code ${code}`));
    });
  });
}

async function reset() {
  const client = await pool.connect();
  try {
    console.log('⚠️  Resetting database — all users, meetings, and sessions will be deleted.');
    await client.query(resetSql);
    console.log('✅ Dropped existing tables.');
  } finally {
    client.release();
    await pool.end();
  }

  await runMigrate();
  console.log('✅ Fresh encrypted schema is ready.');
}

reset().catch((err) => {
  console.error('❌ Reset failed:', err.message);
  process.exit(1);
});
