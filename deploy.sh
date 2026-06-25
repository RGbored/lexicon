#!/data/data/com.termux/files/usr/bin/bash
#
# Pull the latest Lexicon and restart the service (Termux + tmux).
# Run from the phone:  ~/lexicon/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")"            # project dir, wherever it was cloned
SESSION="lexicon"

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

echo "→ restarting '$SESSION' service…"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" "$(pwd)/run.sh"

echo "✓ deployed ($after). verify: curl -I https://lexicon.rgbored.com"
