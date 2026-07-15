#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d)"
API_PID=""
cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

export DATABASE_URL="sqlite+aiosqlite:///$TMP/check.db"
export JWT_SECRET="local-check-only-not-for-production"
export UPLOAD_DIR="$TMP/uploads"
export VOICE_AGENT_SETTINGS_PATH="$TMP/voice-agent-settings.json"
export CORS_ORIGINS="http://localhost:5173"

mkdir -p "$UPLOAD_DIR"
(cd "$ROOT/backend" && uv sync --locked)
(cd "$ROOT/backend" && uv run python -m compileall -q app)
(cd "$ROOT/backend" && uv run python -c 'import app.main; print("backend import: ok")')
(cd "$ROOT/backend" && SEED_ADMIN_PASSWORD="check-admin-only" SEED_TECH_PASSWORD="check-tech-only" SEED_GUEST_PASSWORD="check-guest-only" uv run python seed_data.py)
(cd "$ROOT/backend" && uv run python validate_schema.py)

# Alembic: a fresh DB must build the full schema and land on the baseline head,
# and that schema must match the models. Uses a dedicated throwaway DB.
ALEMBIC_DB="sqlite+aiosqlite:///$TMP/alembic-check.db"
(cd "$ROOT/backend" && DATABASE_URL="$ALEMBIC_DB" uv run alembic upgrade head)
(cd "$ROOT/backend" && DATABASE_URL="$ALEMBIC_DB" uv run alembic current | grep -q '0001_baseline (head)')
(cd "$ROOT/backend" && DATABASE_URL="$ALEMBIC_DB" uv run python validate_schema.py)

(cd "$ROOT/backend" && uv run uvicorn app.main:app --host 127.0.0.1 --port 18001 >"$TMP/api.log" 2>&1) &
API_PID=$!
for _ in $(seq 1 40); do
  if curl -fs http://127.0.0.1:18001/healthz >"$TMP/health.json" 2>/dev/null; then break; fi
  sleep 0.25
done
curl -fsS http://127.0.0.1:18001/healthz
curl -fsS http://127.0.0.1:18001/openapi.json >/dev/null
kill "$API_PID" 2>/dev/null || true
API_PID=""

(cd "$ROOT/frontend" && npm ci)
(cd "$ROOT/frontend" && npm run build)

test -f "$ROOT/dist/index.html"
if grep -RIlE --exclude='check.sh' --exclude-dir=node_modules --exclude-dir=.venv --exclude-dir=dist \
  '(BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}|nvapi-[A-Za-z0-9_-]{20,})' "$ROOT" | grep -q .; then
  echo "Potential secret signature detected." >&2
  exit 1
fi

echo "All workspace checks passed."
