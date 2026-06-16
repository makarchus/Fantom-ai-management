# Meeting Intelligence

AI-powered meeting tracker that connects to **Fathom**, extracts action items and commitments by person, and stores everything in an **encrypted** local PostgreSQL database.

## Security model

- **Email 2FA on every sign-in** — password or Google OAuth, then a 6-digit code emailed each time
- **Encrypted at rest** — Fathom API keys, meeting summaries, action items, and transcripts use AES-256-GCM
- **Recovery key** — a private UUID is generated once at signup; save it only if you might lose email access

## Architecture

```
meeting-intelligence/
├── client/          React frontend (Vite, port 5173)
├── server/          Express API (Node.js, port 3001)
│   ├── .env         ← configure this
│   └── src/
│       ├── lib/encryption.js   User vault crypto
│       ├── routes/auth.js      Register, verify, sign-in 2FA
│       └── db/migrate.js       Schema migrations
└── docs/GMAIL_SETUP.md        Gmail App Password setup
```

## Prerequisites

- Node.js 18+
- PostgreSQL (local, port 5432)
- Gmail account with App Password (for registration emails) — see [docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md)
- Fathom account (optional, for API sync)
- Anthropic API key (optional, AI fallback)

## Setup

### 1. Configure environment

```bash
cp server/sample.env server/.env
```

Edit `server/.env` — at minimum set PostgreSQL, Gmail SMTP, and `SESSION_SECRET`. See `server/sample.env` for all variables.

**Gmail for email verification:** follow [docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md) to create a Google App Password and set `SMTP_*` variables.

### 2. Install and initialize

```bash
./setup.sh          # installs deps, creates DB if needed, runs migrations
# or fresh start (deletes all data):
npm run db:reset
```

### 3. Start the app

```bash
npm run dev
```

Open **http://localhost:5173**

## Sign-in flow

1. **Create account** — email + password, then verify with a 6-digit email code
2. **Save recovery key** — optional UUID shown once; only needed if you lose email access
3. **Sign in** — email + password (or Google), then enter the email verification code every time

## Fathom connection

Per-user Fathom API keys are stored **encrypted** in Settings after sign-in.

Generate a key in Fathom → Settings → API Access. See [Fathom API quickstart](https://developers.fathom.ai/quickstart).

## Database reset

To wipe all users, meetings, and categories and start fresh:

```bash
npm run db:reset
```

## Troubleshooting

**Verification email not sent** — Check `SMTP_*` in `server/.env` and [docs/GMAIL_SETUP.md](docs/GMAIL_SETUP.md).

**Lost email access** — Use “Recover with encryption key” on the sign-in screen with your saved recovery key.

**PostgreSQL connection refused** — Ensure Postgres is running and credentials in `.env` match.

**Fathom sync failed** — Add your Fathom API key in Settings after signing in.