#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT/backend/.env" || ! -f "$ROOT/frontend/.env" ]]; then
  echo "Run ./scripts/setup.sh first." >&2
  exit 1
fi

cleanup() {
  jobs -pr | xargs -r kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(cd "$ROOT/backend" && uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload) &
(cd "$ROOT/frontend" && npm run dev) &
wait
