#!/usr/bin/env bash
#
# Start the Lexicon server. Run by the lexicon systemd service on the server.
#
set -euo pipefail
cd "$(dirname "$0")"

[ -f data/characters.json ] || npm run generate   # first run only
# NODE_NO_WARNINGS silences the node:sqlite ExperimentalWarning (harmless).
PORT="${PORT:-3000}" NODE_NO_WARNINGS=1 node server.js
