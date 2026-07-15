# syntax=docker/dockerfile:1
#
# Fiji IT Service Desk — single-image, single-port container.
# Builds the React/Vite SPA, then serves it together with the FastAPI API from
# one Uvicorn process on $PORT (default 8001). This is the shape cloud and
# container hosts expect: one exposed port, SPA + API same-origin.

# ── Stage 1: build the frontend ────────────────────────────────────────────────
FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.js writes to ../dist -> /build/dist
RUN npm run build

# ── Stage 2: backend runtime (bundles uv + Python 3.10 per backend/.python-version)
FROM ghcr.io/astral-sh/uv:python3.10-bookworm-slim AS runtime
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

WORKDIR /app/backend

# Install dependencies first (cached unless the lockfile changes).
COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-install-project

# Application source.
COPY backend/ ./
# Built SPA lands at /app/dist, which app.main resolves via parents[2]/dist.
COPY --from=frontend /build/dist /app/dist

# Runtime defaults. Override JWT_SECRET and CORS_ORIGINS for anything but a
# throwaway demo. Persistent state lives under /data (declare it a volume).
ENV FRONTEND_DIST=/app/dist \
    DATABASE_URL=sqlite+aiosqlite:////data/service_desk.db \
    UPLOAD_DIR=/data/uploads \
    VOICE_AGENT_SETTINGS_PATH=/data/voice-agent-settings.json \
    RUSTDESK_KEY_FILE=/data/rustdesk/id_ed25519.pub \
    CORS_ORIGINS=http://localhost:8001 \
    PORT=8001

VOLUME ["/data"]
EXPOSE 8001

COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["serve"]
