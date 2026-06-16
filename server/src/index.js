import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../.env') });

import pool from './db/pool.js';
import { configurePassport } from './lib/passport.js';
import authRoutes from './routes/auth.js';
import settingsRoutes from './routes/settings.js';
import fathomRoutes from './routes/fathom.js';
import meetingsRoutes from './routes/meetings.js';
import processRoutes from './routes/process.js';
import actionItemsRoutes from './routes/actionItems.js';
import { logError, friendlyError } from './lib/httpErrors.js';

const app = express();
const PORT = process.env.PORT || 3001;
const PgSession = connectPgSimple(session);

configurePassport();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

app.use(session({
  store: new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
  },
}));

app.use(passport.initialize());
app.use(passport.session());

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/fathom', fathomRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/process', processRoutes);
app.use('/api/action-items', actionItemsRoutes);

// Unknown API routes
app.use('/api', (req, res) => {
  logError('API 404', new Error('Not found'), { method: req.method, path: req.originalUrl });
  res.status(404).json({
    error: friendlyError({ status: 404 }, 'api_route'),
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  logError('Unhandled', err, { method: req.method, path: req.originalUrl });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: friendlyError(err) });
});

app.listen(PORT, () => {
  console.log(`✅ Meeting Intelligence API running on http://localhost:${PORT}`);
  console.log(`   PostgreSQL: ${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`);
  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log('   ⚠️  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for Google login');
  }
});
