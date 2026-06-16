import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'meeting_intelligence',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL error:', err);
});

export default pool;
