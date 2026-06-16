# Meeting Intelligence

AI-powered meeting tracker that connects to **Fathom** via Microsoft SSO, extracts action items and commitments by person, and stores everything in a local PostgreSQL database.

## Architecture

```
meeting-intelligence/
├── client/          React frontend (Vite, port 5173)
└── server/          Express API (Node.js, port 3001)
    ├── .env         ← configure this
    └── src/
        ├── routes/
        │   ├── fathom.js     Fathom MCP bridge (via Claude AI)
        │   ├── meetings.js   CRUD for saved meetings
        │   └── process.js    AI extraction pipeline
        └── db/
            ├── pool.js       PostgreSQL connection
            └── migrate.js    Schema migrations
```

## Prerequisites

- Node.js 18+
- PostgreSQL (local, port 5432)
- Anthropic API key
- Fathom account (connected via Microsoft SSO)

## Setup

### 1. Configure environment

Edit `server/.env`:

```env
# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGDATABASE=meeting_intelligence
PGUSER=postgres
PGPASSWORD=your_password_here

# Fathom API (Fathom → Settings → API Access)
FATHOM_API_KEY=your_fathom_api_key_here

# Optional: only needed if Fathom has no action items and summary parsing fails
# ANTHROPIC_API_KEY=sk-ant-...

PORT=3001
```

### 2. Create the database

```bash
psql -U postgres -c "CREATE DATABASE meeting_intelligence;"
```

### 3. Run migrations

```bash
cd server && node src/db/migrate.js
```

### 4. Install dependencies

```bash
# From root
npm install
cd server && npm install
cd ../client && npm install
```

### 5. Start the app

```bash
# From root — starts both server and client
npm run dev
```

Open **http://localhost:5173**

## How It Works

### Fathom Connection
The server connects to Fathom via its REST API using `FATHOM_API_KEY`. Generate a key in Fathom → Settings → API Access.

### Import Flow
1. Browse Fathom meetings in the sidebar
2. Click a meeting → "Import & Process Meeting"
3. Server fetches summary and action items from Fathom
4. Action items are imported with assignee, description, and priority
5. All data saved to PostgreSQL

For **Paste Summary** (manual import), action items are parsed from the summary markdown. `ANTHROPIC_API_KEY` is optional — only used as a fallback if Fathom didn't provide items and parsing finds none.

### Database Schema

| Table | Purpose |
|-------|---------|
| `meetings` | Meeting metadata + AI summary |
| `action_items` | Per-person tasks/commitments |
| `next_steps` | Follow-up items |
| `transcripts` | Full transcript history |
| `commitments_view` | Cross-meeting commitment view |

### Commitments Tracker
The **Commitments Tracker** (top right button) shows all commitments across every processed meeting — filterable by status and overdue items — so nothing falls through the cracks.

## Troubleshooting

**"Fathom connection failed"** — Ensure `FATHOM_API_KEY` is set in `server/.env` and valid.

**"No meetings found in Fathom"** — Confirm your Fathom account has recorded meetings and the API key has access.

**PostgreSQL connection refused** — Check that Postgres is running and your credentials in `.env` match.
