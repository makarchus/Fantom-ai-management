# Meeting Intelligence

AI-powered meeting accountability platform — connects to **Fathom**, extracts action items, assigns work by email, and tracks progress until done. Encrypted storage with email 2FA on every sign-in.

**Live app:** `npm run dev` → [http://localhost:5173](http://localhost:5173)

---

## Documentation

| Document | Audience | Description |
|----------|----------|-------------|
| [**Developer & AI Guide**](./docs/DEVELOPER.md) | Engineers, AI agents | Full architecture, API reference, schema, auth flows |
| [**User Guide**](./client/public/docs/user-guide.html) | End users | Available after sign-in via header **User Guide** (also at `/docs/user-guide.html`) |
| [**Gmail SMTP Setup**](./docs/GMAIL_SETUP.md) | DevOps | Email 2FA configuration |

---

## Quick start

```bash
cp server/sample.env server/.env   # edit PostgreSQL, SMTP, SESSION_SECRET
./setup.sh
npm run dev
```

Open **http://localhost:5173** — landing page with pricing and signup.

---

## Key features

- **Fathom sync** — import meetings, summaries, transcripts
- **AI extraction** — action items, commitments, next steps
- **Assignments** — multi-email assignees, notifications, cross-user inbox
- **Action queue** — overdue-first sidebar with progress comments
- **Archive** — owner completes items with full resolution history
- **Security** — email 2FA every login, AES-256 encryption, recovery key

---

## Pricing (product)

| Plan | Price | Trial | Commitment |
|------|-------|-------|------------|
| Solo | $5.99/mo (full features) | 3 months free | Monthly |
| Team (5–25) | $3.99/user/mo | 3 months free | Monthly/annual |
| Business (25–100) | $2.99/user/mo | 3 months free | **1-year minimum** |
| Enterprise (100+) | Custom | Pilot | **1-year minimum**, volume discount |

*Billing UI is on the landing page; payment integration is not yet implemented.*

---

## Commands

```bash
npm run dev              # API + client
npm run db:migrate       # Apply schema
npm run db:reset         # Wipe database (interactive)
./scripts/db-reset.sh    # Same with RESET confirmation
npm run services -- status
```

---

## Troubleshooting

See [Developer Guide — Troubleshooting](./docs/DEVELOPER.md) and [User Guide](./client/public/docs/user-guide.html).
