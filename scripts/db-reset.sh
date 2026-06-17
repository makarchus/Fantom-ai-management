#!/usr/bin/env bash
#
# Wipe all application data and recreate a fresh schema.
#
# Usage:
#   ./scripts/db-reset.sh          # interactive confirmation
#   ./scripts/db-reset.sh --yes    # skip confirmation
#   npm run db:reset               # same (via this script)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/server/.env"
SKIP_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    -y|--yes|--force) SKIP_CONFIRM=true ;;
    -h|--help)
      echo "Usage: $0 [--yes]"
      echo "  Drops all tables, then runs migrations for a fresh schema."
      exit 0
      ;;
  esac
done

echo "🗄️  Meeting Intelligence — database reset"
echo "=========================================="

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ server/.env not found. Copy server/sample.env to server/.env first."
  exit 1
fi

# shellcheck disable=SC1090
set -a
source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
set +a

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-meeting_intelligence}"
PGUSER="${PGUSER:-postgres}"

echo ""
echo "  Database: ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo ""
echo "  This will permanently delete:"
echo "    • All users and sessions"
echo "    • All meetings, transcripts, and Fathom cache"
echo "    • All action items, assignments, and comments"
echo ""
echo "  A fresh schema will be created immediately after."
echo ""

if [[ "$SKIP_CONFIRM" != true ]]; then
  read -rp "Type RESET to continue: " CONFIRM
  if [[ "$CONFIRM" != "RESET" ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

if command -v pg_isready >/dev/null 2>&1; then
  if ! pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not accepting connections."
    echo "   Start Postgres, or check PGHOST/PGPORT/PGUSER in server/.env"
    exit 1
  fi
fi

cd "$ROOT_DIR/server"
node src/db/reset.js

echo ""
echo "✅ Database reset complete."
