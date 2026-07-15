#!/usr/bin/env bash
# Container entrypoint for the Fiji IT Service Desk single-image build.
#
#   serve  (default) — ensure runtime dirs, generate a JWT_SECRET if none was
#                      provided, optionally seed on first boot, then run Uvicorn.
#   seed             — run the synthetic seed and exit.
#   <anything else>  — exec it verbatim (e.g. `bash`).
set -euo pipefail

PORT="${PORT:-8001}"

ensure_runtime() {
  mkdir -p /data/uploads /data/rustdesk
  # JWT_SECRET is a hard requirement (app.auth reads os.environ["JWT_SECRET"]).
  # For a keyless demo run, mint an ephemeral one so the container still boots;
  # a fixed value should be supplied via the environment for real use.
  if [[ -z "${JWT_SECRET:-}" ]]; then
    export JWT_SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
    echo "docker-entrypoint: JWT_SECRET not set — generated an ephemeral one (tokens reset on restart)." >&2
  fi
}

seed() {
  echo "docker-entrypoint: seeding synthetic demo data..." >&2
  SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-DevAdmin123!}" \
  SEED_TECH_PASSWORD="${SEED_TECH_PASSWORD:-DevTech123!}" \
  SEED_GUEST_PASSWORD="${SEED_GUEST_PASSWORD:-DevGuest123!}" \
    uv run python seed_data.py
}

cmd="${1:-serve}"
case "$cmd" in
  serve)
    ensure_runtime
    # Seed once when asked and the DB doesn't exist yet.
    if [[ "${SEED_ON_START:-false}" == "true" && ! -f /data/service_desk.db ]]; then
      seed || echo "docker-entrypoint: seed failed (continuing)." >&2
    fi
    exec uv run uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
    ;;
  seed)
    ensure_runtime
    seed
    ;;
  *)
    exec "$@"
    ;;
esac
