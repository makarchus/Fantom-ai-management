#!/usr/bin/env bash
set -e

echo "🚀 Meeting Intelligence Setup"
echo "=============================="

# Check .env exists
if [ ! -f "server/.env" ]; then
  echo "❌ server/.env not found. Copy .env.example and fill in your credentials."
  exit 1
fi

source server/.env 2>/dev/null || true

if [ -z "$FATHOM_API_KEY" ]; then
  echo "⚠️  WARNING: FATHOM_API_KEY not set in server/.env"
  echo "   Generate one in Fathom → Settings → API Access"
fi

# Install deps
echo "📦 Installing dependencies..."
cd server && npm install --silent
cd ../client && npm install --silent
cd ..

# Run migrations
echo "🗄️  Running database migrations..."
cd server && node src/db/migrate.js
cd ..

echo ""
echo "✅ Setup complete! Run: npm run dev"
echo "   Frontend: http://localhost:5173"
echo "   API:      http://localhost:3001"
