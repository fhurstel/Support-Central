#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "$ROOT/backend/.env" ]]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "Created backend/.env — replace JWT_SECRET before non-local use."
fi
if [[ ! -f "$ROOT/frontend/.env" ]]; then
  cp "$ROOT/frontend/.env.example" "$ROOT/frontend/.env"
fi
mkdir -p "$ROOT/backend/data/uploads" "$ROOT/backend/data/rustdesk"
(cd "$ROOT/backend" && uv sync)
(cd "$ROOT/frontend" && npm ci)
echo "Setup complete. Run ./scripts/dev.sh"
