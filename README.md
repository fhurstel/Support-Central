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

## Start locally

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
