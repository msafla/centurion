#!/usr/bin/env sh
# Launches the CENTURION MCP stdio adapter against an already-running backend.
# The backend owns SQLite; this adapter only talks to it over loopback.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Data directory must match the running backend (demo by default).
export CENTURION_DATA_DIR="${CENTURION_DATA_DIR:-$ROOT/data/demo}"

# Prefer the Node 24 used by the project when present, else rely on PATH.
if [ -z "${NODE:-}" ]; then
  if [ -x /opt/node24/bin/node ]; then
    NODE=/opt/node24/bin/node
  else
    NODE=node
  fi
fi

exec "$NODE" "$ROOT/dist/mcp/server.js"
