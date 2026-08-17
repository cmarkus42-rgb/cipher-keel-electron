#!/usr/bin/env bash
# launch.sh — build cipher keel, start it on a scratch profile, wait until drivable.
#
# Every verification in Phase 6 needed the same preamble, so it lives here instead of
# being retyped: build, clear a stale instance, launch with a throwaway user-data-dir
# and a debug port, wait for CDP, then wait again for the deferred service init.
#
# A scratch profile matters: it keeps the real ~/Library/Application Support profile
# untouched, and it lets you prove "fresh start" behaviour (no graph.db yet).
#
# Usage:  ./launch.sh [profile-dir]        default: /tmp/keel-verify
# Env:    KEEL_CDP_PORT (default 9222), KEEL_INIT_WAIT (default 9 seconds),
#         KEEL_KEEP_PROFILE (default unset — wipe the profile; set to 1 to keep it)
#
# By default the profile directory is wiped before every launch, which is right for
# almost every check but makes it impossible to test "the app starts with a config
# that already exists" — the class every migration belongs to. Set KEEL_KEEP_PROFILE=1
# to skip the wipe and launch against whatever is already at PROFILE (a hand-written
# legacy config, a config with a broken entry). The log is still cleared either way.
#
# Prints the profile dir and log path, then returns while the app keeps running.
# Stop it with stop.sh.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROFILE="${1:-/tmp/keel-verify}"
PORT="${KEEL_CDP_PORT:-9222}"
INIT_WAIT="${KEEL_INIT_WAIT:-9}"
LOG="${PROFILE}.log"

cd "$REPO"

echo "[launch] building…"
npm run build >/dev/null

# A stale instance would hold the port and you would silently drive the wrong app.
pkill -f "remote-debugging-port=${PORT}" 2>/dev/null || true
sleep 1

rm -f "$LOG"
if [ "${KEEL_KEEP_PROFILE:-0}" = "1" ]; then
  echo "[launch] KEEL_KEEP_PROFILE=1 — profile kept: ${PROFILE}"
  mkdir -p "$PROFILE"
else
  rm -rf "$PROFILE"
  mkdir -p "$PROFILE"
fi

echo "[launch] starting on port ${PORT}, profile ${PROFILE}"
./node_modules/.bin/electron . \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE" \
  > "$LOG" 2>&1 &

if ! timeout 40 bash -c \
  "until curl -s http://127.0.0.1:${PORT}/json/list >/dev/null 2>&1; do sleep 0.3; done"
then
  echo "[launch] CDP never came up — see $LOG" >&2
  exit 1
fi

# Service init is deferred behind setImmediate so the window paints first. Querying
# before it settles gives a misleading all-degraded snapshot.
sleep "$INIT_WAIT"

echo "[launch] ready"
echo "  profile: $PROFILE"
echo "  log:     $LOG"
