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

# Build dictionaries for all languages if any are missing (gitignored). Best-effort:
# the app works without them, and they only change when the pinned source versions
# are bumped — so a dead download link can never break a deploy.
if [ ! -f data/dictionary_kn.json ] || [ ! -f data/dictionary_ja.json ] || [ ! -f data/dictionary_de.json ]; then
  echo "→ building dictionaries…"
  npm run dictionary || echo "⚠ dictionary build failed — continuing without auto-meanings"
fi

echo "→ restarting '$SESSION' service…"
tmux kill-session -t "$SESSION" 2>/dev/null || true
tmux new-session -d -s "$SESSION" "$(pwd)/run.sh"

echo "✓ deployed ($after). verify: curl -I https://lexicon.rgbored.com"
