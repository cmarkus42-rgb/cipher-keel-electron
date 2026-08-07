#!/usr/bin/env bash
# stop.sh — stop the app started by launch.sh and clean up anything it spawned.
#
# cipher keel creates real tmux sessions. Leaving them behind pollutes the developer's
# machine and confuses the next run's `tmux list-sessions`, so this kills the app AND
# any session it created. Session names created by the app are prefixed `keel-`
# (see deriveSessionName in src/main/session/session-context.ts) — user sessions
# from other tools are left alone.
#
# Usage: ./stop.sh
# Env:   KEEL_CDP_PORT (default 9222)

set -uo pipefail

PORT="${KEEL_CDP_PORT:-9222}"

pkill -f "remote-debugging-port=${PORT}" 2>/dev/null && echo "[stop] app killed" \
  || echo "[stop] no app on port ${PORT}"

killed=0
while read -r name; do
  [ -z "$name" ] && continue
  tmux kill-session -t "$name" 2>/dev/null && killed=$((killed + 1))
done < <(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^keel-' || true)

echo "[stop] tmux sessions removed: ${killed}"
