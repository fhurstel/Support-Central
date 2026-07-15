# Fiji IT Service Desk — Claude Code Workspace

Complete editable source export of the Fiji IT Service Desk, prepared for direct import into Claude Code.

## Included

- React/Vite frontend source
- FastAPI/SQLAlchemy backend source
- Models, schemas, API routes, auth, migrations, and synthetic seed data
- Voice & AI settings integration
- RustDesk, Poppy AI, email, invoices, knowledge base, leads, clients, client members, tickets, Kanban, comments, timers, checklists, labels, attachments, and activity features
- Dependency lockfiles
- Sanitized environment templates
- Claude Code project instructions
- Architecture and upgrade runbook
- Example systemd and nginx deployment files
- Verification scripts

## Not included

For security and portability, the archive excludes all live secrets, `.env` files, production databases, customer records, uploads, provider keys, virtual environments, `node_modules`, generated builds, caches, and logs.

## Run in a container (single port)

For a virtualized/cloud container host — or anywhere you want one exposed port
and a real URL — build the single image. It compiles the SPA and serves it
together with the API from one Uvicorn process:

```bash
docker compose up --build
# open http://localhost:8001  (SPA + API, same origin, one port)
```

First boot seeds synthetic demo data. Log in with the demo accounts below. State
persists in the `fiji-data` volume. For real use, set a long random `JWT_SECRET`
(compose reads it from the environment) instead of the placeholder default.

For a durable public HTTPS instance with a real database (Fly.io or Render, data on a persistent volume), see **[deploy/DEPLOY.md](deploy/DEPLOY.md)**.

Plain Docker equivalent:

```bash
docker build -t fiji-it-service-desk .
docker run -p 8001:8001 -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e SEED_ON_START=true -v fiji-data:/data fiji-it-service-desk
```

Demo logins (first-boot seed): `admin@example.test` / `DevAdmin123!`,
`tech@example.test` / `DevTech123!`, `guest@example.test` / `DevGuest123!`
(override via `SEED_ADMIN_PASSWORD` etc.).

> Note on Claude Code cloud sessions: a web/cloud session's container has no
> inbound port forwarding, so a dev server there isn't reachable from your
> phone. Run this image on a host that exposes a port (your machine, a cloud
> VM, or any container platform), or `claude --teleport` the session into your
> local terminal and run it there.

## Start locally (two dev servers, hot reload)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
./scripts/setup.sh
./scripts/dev.sh
```

Open `http://localhost:5173`. The API runs at `http://127.0.0.1:8001`.

To create synthetic demo records:

```bash
cd backend
SEED_ADMIN_PASSWORD='choose-a-password' uv run python seed_data.py
```

Demo admin identity: `admin@example.test`.

## Verify

```bash
./scripts/check.sh
```

## Build

```bash
cd frontend
npm run build
```

The build is written to the repository-level `dist/` directory.

## Claude Code

Extract the archive, open this directory in Claude Code, and ask it to read `CLAUDE.md` before modifying anything.

Recommended first prompt:

> Read CLAUDE.md, docs/ARCHITECTURE.md, and docs/UPGRADE-RUNBOOK.md. Run the existing verification suite and inspect the current architecture. Do not modify production data or secrets. Then propose a tested upgrade plan for: [describe upgrade].
