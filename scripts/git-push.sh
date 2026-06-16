#!/usr/bin/env bash
# Push to GitHub as makarchus@yahoo.com — prompts for a Personal Access Token (not your password).
#
# Usage:
#   ./scripts/git-push.sh
#   npm run push
#
# Create a token: GitHub → Settings → Developer settings → Personal access tokens

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REMOTE_URL="${GIT_REMOTE_URL:-https://github.com/makarchus/Fantom-ai-management.git}"
GIT_USER="${GIT_PUSH_USER:-makarchus}"
GIT_EMAIL="${GIT_PUSH_EMAIL:-makarchus@yahoo.com}"
BRANCH="${GIT_PUSH_BRANCH:-$(git branch --show-current)}"

echo "Git push — ${GIT_EMAIL}"
echo "Repository: ${REMOTE_URL}"
echo "Branch:     ${BRANCH}"
echo ""
echo "Use a GitHub Personal Access Token (classic or fine-grained) with repo scope."
echo ""

read -rsp "GitHub token for ${GIT_EMAIL}: " TOKEN
echo ""

if [[ -z "${TOKEN}" ]]; then
  echo "Error: token cannot be empty." >&2
  exit 1
fi

# Strip github.com/ prefix if user pasted full URL
TOKEN="${TOKEN#https://}"
TOKEN="${TOKEN#http://}"
if [[ "${TOKEN}" == *"@"* ]]; then
  TOKEN="${TOKEN##*:}"
  TOKEN="${TOKEN%%@*}"
fi

PUSH_URL="https://${GIT_USER}:${TOKEN}@${REMOTE_URL#https://}"

echo "Pushing ${BRANCH}…"
git push "${PUSH_URL}" "HEAD:${BRANCH}"

echo ""
echo "Done."
