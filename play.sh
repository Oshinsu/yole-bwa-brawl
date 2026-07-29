#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 fetch_three.py || true
PORT="${PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"
( sleep 1; python3 - "$URL" <<'PY'
import sys, webbrowser
webbrowser.open(sys.argv[1])
PY
) &
echo "YOLE: BWA BRAWL — TROPICAL MAYHEM V3.2 — http://127.0.0.1:${PORT}"
python3 -m http.server "$PORT" --bind 127.0.0.1
