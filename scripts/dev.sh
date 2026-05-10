#!/usr/bin/env bash
# Polygents dev launcher: backend on :8001, frontend on :5173.
# Logs go to scripts/.logs/{backend,frontend}.log
# Ctrl+C stops both.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="$ROOT/scripts/.logs"
mkdir -p "$LOG_DIR"

cleanup() {
  echo
  echo "[dev] stopping..."
  [[ -n "${BACK_PID:-}" ]] && kill "$BACK_PID" 2>/dev/null || true
  [[ -n "${FRONT_PID:-}" ]] && kill "$FRONT_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "[dev] backend  -> http://127.0.0.1:8001  (log: $LOG_DIR/backend.log)"
(
  cd "$ROOT/backend"
  # NOTE: --reload disabled on Windows: watchfiles forces a Selector event loop,
  # which breaks asyncio subprocess (claude-agent-sdk launches `claude` CLI).
  exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
) >"$LOG_DIR/backend.log" 2>&1 &
BACK_PID=$!

echo "[dev] frontend -> http://127.0.0.1:5173  (log: $LOG_DIR/frontend.log)"
(
  cd "$ROOT/frontend"
  if [[ ! -d node_modules ]]; then
    echo "[dev] installing frontend deps..."
    npm install
  fi
  exec npm run dev
) >"$LOG_DIR/frontend.log" 2>&1 &
FRONT_PID=$!

echo "[dev] both running. tail logs with:"
echo "       tail -f $LOG_DIR/backend.log"
echo "       tail -f $LOG_DIR/frontend.log"
echo "[dev] press Ctrl+C to stop."

wait
