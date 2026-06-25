#!/data/data/com.termux/files/usr/bin/bash
#
# Start the Lexicon server (Termux). Used by init_server.sh and deploy.sh.
#
set -euo pipefail
cd "$(dirname "$0")"

[ -f data/characters.json ] || npm run generate   # first run only
# NODE_NO_WARNINGS silences the node:sqlite ExperimentalWarning (harmless).
PORT="${PORT:-3000}" NODE_NO_WARNINGS=1 node server.js
