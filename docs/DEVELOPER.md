# Meeting Intelligence — Developer & AI Agent Guide

This document is the canonical reference for developers and AI coding agents working on **Fantom-ai-management** (product name: **Meeting Intelligence**). Read this before making architectural changes.

## Product summary

Meeting Intelligence connects to **Fathom** (meeting recorder), imports transcripts and summaries, uses AI to extract **action items**, **commitments**, and **next steps**, and tracks accountability across teams. Data is **encrypted at rest** per user. Authentication uses **email 2FA on every sign-in**.

---

## Repository layout

```
Fantom-ai-management/
├── client/                 React 18 + Vite (port 5173)
│   ├── public/docs/        Static user guide (user-guide.html)
│   └── src/
│       ├── App.jsx         Root layout, auth routing, views
│       ├── lib/api.js      All API client calls
│       └── components/     UI modules (see Component map)
├── server/                 Express API (port 3001)
│   ├── sample.env          Environment template
│   └── src/
│       ├── index.js        Express app, session, route mounts
│       ├── db/migrate.js   Inline SQL migrations (no flyway)
│       ├── db/reset.js     Wipe + re-migrate
│       ├── routes/         HTTP handlers
│       ├── lib/            Business logic
│       └── middleware/     requireAuth, requireVault
├── docs/
│   ├── DEVELOPER.md        This file
│   ├── GMAIL_SETUP.md      SMTP setup for 2FA emails
│   └── user-guide.html     End-user documentation (also in client/public)
└── scripts/
    ├── db-reset.sh         Interactive DB wipe
    ├── git-push.sh         Token-prompt git push
    └── services.sh         Start/stop API, client, Postgres
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, lucide-react, date-fns |
| Backend | Node.js, Express, Passport (local + Google OAuth) |
| Database | PostgreSQL |
| Sessions | express-session + connect-pg-simple |
| Encryption | AES-256-GCM, scrypt-derived keys per user |
| Email | nodemailer + Gmail SMTP |
| AI | Anthropic Claude (categorization, action-item extraction fallback) |
| External | Fathom API (meeting sync) |

---

## Environment variables

Copy `server/sample.env` → `server/.env`.

| Variable | Required | Purpose |
|----------|----------|---------|
| `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` | Yes | PostgreSQL |
| `SESSION_SECRET` | Yes | Session cookie signing |
| `ENCRYPTION_STORAGE_KEY` | Recommended | Encrypts stored recovery keys at rest |
| `CLIENT_URL` | Yes | CORS origin (default `http://localhost:5173`) |
| `SMTP_*` | Yes for 2FA | Gmail App Password for verification emails |
| `GOOGLE_CLIENT_ID/SECRET` | Optional | Google OAuth sign-in |
| `FATHOM_API_KEY` | Optional global | Per-user keys preferred (Settings UI) |
| `ANTHROPIC_API_KEY` | Optional | AI categorization & extraction |

---

## Authentication flow

### Registration
1. `POST /api/auth/register` → creates `pending_registrations`, emails 6-digit code with **2-letter prefix** (e.g. `K7-123456`)
2. `POST /api/auth/verify-email` → creates `users` row, logs in, returns `needsEncryptionSetup: true`
3. `POST /api/auth/setup-encryption` → generates UUID recovery key (shown once), stores encrypted key server-side, unlocks vault in session

### Sign-in (always 2FA)
1. `POST /api/auth/login` (password) or Google OAuth callback → emails code, returns `pendingLoginId` + `codePrefix` (HTTP 202)
2. `POST /api/auth/verify-login` → verifies code, logs in, **auto-unlocks vault** from stored encrypted key
3. No vault-unlock screen in normal flow

### Recovery (no email access)
- `POST /api/auth/recover-vault` — email + encryption UUID, bypasses 2FA
- Link on login screen: "Lost email access? Recover with encryption key"

### Verification code prefix
- Stored in `pending_registrations.code_prefix` and `pending_logins.code_prefix`
- UI shows prefix; user enters 6 digits only
- Resend generates **new** prefix (old emails identifiable)

---

## Encryption model

| Data | Storage |
|------|---------|
| Meeting titles, summaries, transcripts | `action_items.*_enc` encrypted with user's vault key |
| Fathom API key per user | `users.fathom_api_key_enc` |
| Recovery UUID | Shown once to user; `encryption_key_stored_enc` on server (encrypted with `ENCRYPTION_STORAGE_KEY`) |
| Assignee inbox | `action_item_assignments` plaintext copy (assignees may not have owner's vault) |
| Progress comments | `action_item_comments` plaintext |

Vault key lives in session (`req.session.vaultKeyB64`) after login. Routes using `requireVault` need unlocked session.

Key files: `server/src/lib/encryption.js`, `vault.js`, `dataCrypto.js`

---

## Database schema (tables)

| Table | Purpose |
|-------|---------|
| `users` | Accounts, encryption verifiers, Fathom credentials |
| `user_sessions` | express-session store |
| `pending_registrations` | Email verify during signup |
| `pending_logins` | Email 2FA during sign-in |
| `meetings` | Encrypted saved meetings (owner) |
| `transcripts` | Encrypted transcript content |
| `action_items` | Encrypted action items linked to meetings |
| `action_item_assignments` | Per-email assignee rows (cross-user visibility) |
| `action_item_comments` | Progress history thread per action item |
| `next_steps` | Encrypted next steps |
| `folders` | Meeting categories |
| `fathom_meetings` | Encrypted Fathom cache per user |
| `fathom_meeting_cache` | Shared categorization cache |

Run migrations: `npm run db:migrate`  
Reset all data: `npm run db:reset` or `./scripts/db-reset.sh`

---

## API reference

Base URL: `http://localhost:3001/api`  
Auth: session cookie (`credentials: 'include'` on client)

### Auth (`/api/auth`)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Start registration, send code |
| POST | `/verify-email` | — | Complete registration |
| POST | `/resend-code` | — | Resend registration code |
| POST | `/login` | — | Password check → send 2FA code (202) |
| POST | `/verify-login` | — | Complete sign-in |
| POST | `/resend-login-code` | — | Resend sign-in code |
| POST | `/setup-encryption` | session | First-time vault setup |
| POST | `/recover-vault` | — | Recovery login with UUID key |
| POST | `/unlock-vault` | session | Legacy one-time key migration |
| GET | `/me` | session | Current user + vault status |
| POST | `/logout` | session | End session |
| GET | `/google` | — | OAuth redirect |
| GET | `/google/callback` | — | OAuth → 2FA email |

### Settings (`/api/settings`)
| PATCH | `/` | session | Update Fathom API key, recorder email |

### Fathom (`/api/fathom`) — requireAuth + vault for sync
| GET | `/meetings` | List cached Fathom meetings from DB |
| POST | `/meetings/sync` | Pull from Fathom API |
| PATCH | `/meetings/:id/folder` | Move Fathom meeting to folder |
| GET | `/meetings/:id/summary` | Fetch summary |

### Meetings (`/api/meetings`) — requireVault for most
| GET | `/` | List saved meetings |
| GET | `/:id` | Meeting detail + action items + transcript |
| PATCH | `/:id` | Update folder/category |
| DELETE | `/:id` | Delete meeting |
| GET | `/folders` | List folders |
| POST | `/folders` | Create folder |
| DELETE | `/folders/:id` | Delete empty folder |
| POST | `/organize` | AI auto-categorize |
| GET | `/commitments/all` | All commitments across meetings |
| PATCH | `/action-items/:id` | Owner updates action item |
| POST | `/action-items/:id/complete` | Owner archives as complete |
| POST | `/action-items/:id/reopen` | Owner reopens archived item |
| DELETE | `/action-items/:id` | Owner deletes action item |
| PATCH | `/next-steps/:id` | Update next step status |

### Action items (`/api/action-items`)
| GET | `/queue` | requireVault — sidebar queue (owned + assigned) |
| GET | `/archive` | requireVault — completed items |
| GET | `/assigned` | Assignee inbox |
| GET | `/email-suggestions` | Autocomplete assignee emails |
| GET | `/:id/comments` | Progress history |
| POST | `/:id/comments` | Add progress comment |
| PATCH | `/assigned/:id` | Assignee status (not `done` — owner only) |

### Process (`/api/process`)
| POST | `/meeting` | Import/process Fathom meeting into DB |

---

## Action item lifecycle

```
Extract/import → action_items (encrypted, owner)
              → action_item_assignments (per assignee email)
              → email notification on new assignment

Assignee adds comment → action_item_comments
                     → status → in_progress

Owner marks complete → archived_at set, removed from active views
                    → visible in Archive with full comment history

Owner deletes → CASCADE assignments + comments
```

**Pre-registration assignees:** `linkPendingAssignmentsToUser()` on login/register matches email in `action_item_assignments`.

**Queue sort:** overdue first → priority → due date (`actionItemsQueue.js`).

---

## Client component map

| Component | Role |
|-----------|------|
| `LandingPage.jsx` | Marketing splash, pricing, signup CTA |
| `LoginScreen.jsx` | Sign in / register |
| `VerifyEmailScreen.jsx` | 2FA code entry with prefix display |
| `EncryptionKeyScreen.jsx` | One-time recovery key setup |
| `Sidebar.jsx` | Fathom + saved meetings, folders |
| `MeetingImporter.jsx` | Import Fathom meeting into DB |
| `MeetingDetail.jsx` | Summary, transcript, action items tabs |
| `ActionItemsPanel.jsx` | Owner edit, assign, complete, delete, comments |
| `ActionItemsQueue.jsx` | Right sidebar — expandable queue |
| `MyActionItems.jsx` | Assignee full-page view |
| `ArchivedActionItems.jsx` | Completed items + history |
| `ActionItemComments.jsx` | Progress thread UI |
| `AssigneeEmailPicker.jsx` | Multi-email assignee autocomplete |
| `CommitmentsTracker.jsx` | Cross-meeting commitments |
| `SettingsModal.jsx` | Fathom API key, recorder email |

### App views (`view` state)
`welcome` | `detail` | `import` | `manual-import` | `my-actions` | `archive` | `commitments`

---

## AI / extraction pipeline

1. **Fathom sync** — `fathomSync.js` pulls recordings into `fathom_meetings`
2. **Import** — `process/meeting` decrypts summary, runs `extractActionItems.js`
3. **Extraction** — Claude or rule-based parsing of summary + Fathom action items JSON
4. **Persist** — `meetingItems.js` → encrypted rows + `syncActionItemAssignments`
5. **Categorize** — `categorizeMeeting.js` assigns folders (rules + optional Claude)

---

## Commands

```bash
./setup.sh              # Install, create DB, migrate
npm run dev             # API + client concurrently
npm run db:migrate      # Apply schema changes
npm run db:reset        # Wipe + fresh schema
npm run services -- status
```

---

## Common tasks for AI agents

### Add a new API endpoint
1. Add handler in `server/src/routes/*.js`
2. Use `requireAuth` / `requireVault` as needed
3. Add client method in `client/src/lib/api.js`
4. Document in this file

### Add a DB column
1. Add `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `migrate.js`
2. Update `reset.js` DROP order if new table
3. Run `npm run db:migrate`

### Add encrypted field
1. Add `*_enc` column
2. Extend `encryptActionItemRow` / `decryptActionItemRow` in `dataCrypto.js`
3. For assignee visibility, sync plaintext to `action_item_assignments` in `actionAssignments.js`

### Test auth locally
- Requires working `SMTP_*` in `.env` (see `docs/GMAIL_SETUP.md`)
- Dev server: `npm run dev` from project root

---

## Security notes for contributors

- Never commit `server/.env`
- Do not log encryption keys or SMTP passwords
- Assignee assignment rows are intentionally plaintext for cross-user access without vault sharing
- `requireVault` returns 403 `VAULT_LOCKED` if session has no vault key

---

## Pricing (product — UI only, no billing backend yet)

Documented on landing page. Implementation is marketing/display only:

| Tier | Price | Trial | Commitment |
|------|-------|-------|------------|
| Solo | $5.99/mo (full features) | 3 months free | Monthly |
| Team (5–25) | $3.99/user/mo | 3 months free | Monthly or annual |
| Business (25–100) | $2.99/user/mo | 3 months free | **1-year minimum** |
| Enterprise (100+) | Custom | Negotiated | **1-year minimum**, volume discount |

---

## Related docs

- [Gmail SMTP setup](./GMAIL_SETUP.md)
- [User guide](../client/public/docs/user-guide.html) (also served at `/docs/user-guide.html`)
