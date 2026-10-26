#!/usr/bin/env bash
#
# Pull the latest Lexicon and restart the systemd service.
# Run on the server:  ~/lexicon/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")"            # project dir, wherever it was cloned
SERVICE="lexicon"

echo "→ pulling latest…"
before=$(git rev-parse HEAD)
git pull --ff-only
after=$(git rev-parse HEAD)

# Only reinstall when dependencies actually changed.
if ! git diff --quiet "$before" "$after" -- package.json package-lock.json; then
  echo "→ dependencies changed, installing…"
  npm install --no-audit --no-fund
else
  echo "→ dependencies unchanged, skipping install"
fi

echo "→ regenerating character data…"
npm run generate

# Build the Kannada dictionary once (gitignored, ~6 MB). Best-effort: the app works
# without it, and it only changes when the pinned Alar version is bumped — so a dead
# download link can never break a deploy.
if [ ! -f data/dictionary.json ]; then
  echo "→ building dictionary (first run)…"
  npm run dictionary || echo "⚠ dictionary build failed — continuing without auto-meanings"
fi

echo "→ restarting '$SERVICE' service…"
sudo systemctl restart "$SERVICE"

echo "✓ deployed ($after). verify: curl -I https://lexicon.rgbored.com"
