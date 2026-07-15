# CLAUDE.md — Fiji IT Service Desk

This repository is the complete editable source workspace for the Fiji IT Service Desk. Treat it as a production business application, not a prototype.

## Objective

Make upgrades without breaking authentication, database compatibility, ticket workflows, timers, client-member assignment, invoices, Voice & AI settings, RustDesk, or the deployed SPA.

## Stack and entry points

- Frontend: React 18 + Vite 5 + React Router + plain CSS
- Frontend entry: `frontend/index.html` -> `frontend/src/main.jsx` -> `frontend/src/App.jsx`
- Frontend API client: `frontend/src/services/api.js`
- Backend: FastAPI + async SQLAlchemy + SQLite + Pydantic v2
- Backend ASGI entry: `backend/app/main.py`, object `app`
- Models: `backend/app/models/__init__.py`
- Schemas: `backend/app/schemas.py`
- Database startup/migrations: `backend/app/database.py`
- Frontend build output: repository-level `dist/` because `vite.config.js` uses `outDir: '../dist'`

## First-run commands

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd backend && uv sync && mkdir -p data/uploads
cd ../frontend && npm ci
```

Run in two terminals:

```bash
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
cd frontend && npm run dev
```

Health check: `curl -fsS http://127.0.0.1:8001/healthz`

## Mandatory engineering rules

1. Never commit `.env`, databases, uploads, keys, tokens, passwords, provider credentials, generated `dist`, `node_modules`, or `.venv`.
2. Never use production/customer data in tests. Use synthetic `.test` identities and 555 numbers.
3. Use the shared frontend API client in `frontend/src/services/api.js`; do not add bare `fetch('/api/...')` calls that omit JWT auth.
4. Preserve API compatibility unless an upgrade explicitly includes coordinated frontend and backend changes.
5. Every new SQLAlchemy column needs a migration path for existing SQLite databases. `create_all()` does not alter existing tables.
6. Update all four layers together: SQLAlchemy model, Pydantic schema, API route/serializer, React UI/API types.
7. In async SQLAlchemy endpoints, eagerly load relationships with `selectinload` and resolve relationship values while the session is active.
8. Enum values are case-sensitive. Match the enum values, not enum member names.
9. Keep uploads durable and configurable through `UPLOAD_DIR`; do not revert to `/tmp`.
10. Never log token/key prefixes and never restore a public credential-debug endpoint.
11. Voice-agent auth uses dedicated `VOICE_BACKEND_TOKEN(S)`. Do not reuse LiveKit or provider API keys for backend authentication.
12. Error handlers may log full server-side details but must not expose secrets or internals to clients.
13. The app uses BrowserRouter. Production nginx must keep SPA fallback: `try_files $uri $uri/ /index.html`.
14. A successful Vite build is not a deployment. Production serves a separate web root; sync `dist/` and verify the live bundle hash.
15. Run verification before declaring any upgrade complete.

## Required verification after changes

```bash
./scripts/check.sh
```

For database changes, also test both:

- a fresh empty SQLite database
- a copy of an older synthetic schema upgraded through `init_db()`

For workflow changes, test at minimum:

- login and role authorization
- lead -> client/ticket conversion
- ticket create/edit/list/kanban/detail
- client and client-member assignment
- comments and visibility
- timer start/stop and elapsed time
- labels/checklists/attachments/activity
- invoices
- Voice & AI settings
- RustDesk behavior when integration is disabled

## Production deployment shape

- API: systemd, Uvicorn on `127.0.0.1:8001`
- Frontend: nginx static web root
- `/api/` and `/healthz`: proxied to Uvicorn
- Runtime database/settings/uploads: persistent path outside the source tree
- Example templates: `deploy/`

## Important known risks

- Alembic is now adopted with a baseline revision (`backend/migrations/`, `0001_baseline`). The startup `create_all()` + SQLite guards in `database.py` are intentionally kept as an idempotent bootstrap; they coexist with Alembic. Existing databases adopt the baseline with `alembic stamp head`; fresh databases use `alembic upgrade head`. See `backend/migrations/README.md`.
- `validate_schema.py` and `auto_migrate.py` are now driven by `Base.metadata` (all tables) and remain `DATABASE_URL`-driven; `auto_migrate.py` dry-runs unless `AUTO_MIGRATE_YES=1`/`--yes`. They are still SQLite-only repair aids — never point them at an un-backed-up live database.
- `frontend/src/main.js` has been removed; `main.jsx` is the sole canonical entry.
- AuthProvider is now supplied once, by `main.jsx`; `App.jsx` no longer re-wraps it.
- Optional RustDesk, Poppy, email, LiveKit, OpenRouter, and NVIDIA integrations must fail gracefully when unconfigured.

## Upgrade workflow

1. Read `docs/ARCHITECTURE.md` and `docs/UPGRADE-RUNBOOK.md`.
2. Create a branch and record the current health/build baseline.
3. Write or update tests before changing behavior.
4. Implement the smallest coherent change across backend/frontend/database.
5. Run `./scripts/check.sh`.
6. Review the diff for secrets, hardcoded paths, schema drift, and API incompatibility.
7. Back up production DB/runtime files before deployment.
8. Deploy backend and frontend as one coordinated release when contracts changed.
9. Verify health, auth, core workflow, logs, and deployed asset hash.
10. Roll back immediately if schema or workflow verification fails.
