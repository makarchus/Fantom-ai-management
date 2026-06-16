#!/usr/bin/env bash
set -e

echo "🚀 Meeting Intelligence Setup"
echo "=============================="

# Check .env exists
if [ ! -f "server/.env" ]; then
  echo "❌ server/.env not found. Copy server/sample.env to server/.env and fill in your credentials."
  exit 1
fi

source server/.env 2>/dev/null || true

if [ -z "$FATHOM_API_KEY" ]; then
  echo "⚠️  WARNING: FATHOM_API_KEY not set in server/.env"
  echo "   Generate one in Fathom → Settings → API Access"
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-meeting_intelligence}"
PGUSER="${PGUSER:-postgres}"

# Install deps
echo "📦 Installing dependencies..."
cd server && npm install --silent
cd ../client && npm install --silent
cd ..

# Ensure PostgreSQL database exists
if command -v psql >/dev/null 2>&1; then
  echo "🗄️  Ensuring PostgreSQL database exists..."
  if ! PGPASSWORD="$PGPASSWORD" psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tc \
    "SELECT 1 FROM pg_database WHERE datname = '$PGDATABASE'" | grep -q 1; then
    PGPASSWORD="$PGPASSWORD" createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
    echo "   Created database: $PGDATABASE"
  fi
else
  echo "⚠️  psql not found — create the database manually:"
  echo "   psql -U $PGUSER -c \"CREATE DATABASE $PGDATABASE;\""
fi

# Run migrations
echo "🗄️  Running database migrations..."
cd server && node src/db/migrate.js
cd ..

echo ""
echo "✅ Setup complete! Run: npm run dev"
echo "   Frontend: http://localhost:5173"
echo "   API:      http://localhost:3001"
