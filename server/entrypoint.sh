#!/bin/sh
# Creates the configured world on first run, then loads it on every later run.
# Any arguments are passed straight to blockheads_server (so `--help` works).
set -eu

BIN=/usr/local/bin/blockheads_server

if [ "$#" -gt 0 ]; then
    exec "$BIN" "$@"
fi

DATA="${BLOCKHEADS_DATA_DIR:-/data}"
WORLD="${BH_WORLD:-PRESERVED}"
PORT="${BH_PORT:-15151}"

set -- -p "$PORT"
if [ -d "$DATA/saves/$WORLD" ]; then
    set -- "$@" -o "$WORLD"
else
    set -- "$@" -n "$WORLD"
fi
[ -n "${BH_MAX_PLAYERS:-}" ] && set -- "$@" -m "$BH_MAX_PLAYERS"
[ -n "${BH_PRIVACY:-}" ] && set -- "$@" -P "$BH_PRIVACY"
[ -n "${BH_OWNER:-}" ] && set -- "$@" -u "$BH_OWNER"

printf 'blockheads-preserved: starting world=%s port=%s data=%s\n' "$WORLD" "$PORT" "$DATA"
exec "$BIN" "$@"
