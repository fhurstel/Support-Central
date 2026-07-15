# Upgrade and Deployment Runbook

## Before coding

1. Create a branch.
2. Copy `backend/.env.example` to `backend/.env` and use a disposable database.
3. Run `./scripts/setup.sh` and `./scripts/check.sh`.
4. Record failing checks before making changes.
5. Never point development or tests at the live database.

## Database changes

1. Update the SQLAlchemy model.
2. Update Pydantic create/update/response schemas.
3. Update serializers/routes and frontend API/UI.
4. Generate and review an Alembic revision against a disposable DB:
   `cd backend && DATABASE_URL=<disposable> uv run alembic revision --autogenerate -m "…"`.
   Edit the generated file (SQLite needs batch mode; already configured). See `backend/migrations/README.md`.
5. Verify a fresh database: `alembic upgrade head`, then `uv run python validate_schema.py`.
6. Verify an older synthetic database upgrades without data loss (adopt with `alembic stamp head` if it predates Alembic, then `alembic upgrade head`).
7. Run schema validation (`validate_schema.py` covers every model/table).
8. Back up production before deployment.

> First-time adoption on an existing production database: `alembic stamp head`
> to record the baseline **without** DDL. Never run `alembic upgrade head`
> against a schema that already exists — it would try to re-create tables.

SQLite backup example:

```bash
sqlite3 /path/to/live.db '.backup /path/to/backups/service-desk-before-upgrade.db'
```

Never test a migration first on the live database.

## Backend verification

```bash
cd backend
uv sync --locked
uv run python -m compileall -q app
DATABASE_URL=sqlite+aiosqlite:///./data/check.db JWT_SECRET=local-check-only uv run python -c 'import app.main; print("backend import ok")'
```

Then start Uvicorn and verify `/healthz`, OpenAPI generation, authentication, authorization, and affected APIs.

## Frontend verification

```bash
cd frontend
npm ci
npm run build
```

Inspect browser console/network behavior for affected routes. Confirm all API calls use the shared API client and carry authorization.

## Production deployment

1. Enable maintenance window for schema-changing releases.
2. Back up database, settings JSON, and uploads.
3. Install backend dependencies from the lockfile.
4. Apply/verify schema migration before serving writes.
5. Restart API service.
6. Check `/healthz` and service logs.
7. Build frontend from the same release.
8. Cleanly sync top-level `dist/` into the nginx web root.
9. Verify live `index.html` references the newly built asset hash.
10. Perform authenticated smoke tests.

Example frontend deployment:

```bash
rsync -a --delete dist/ /var/www/fiji-it/
```

## Mandatory smoke test

- Login/logout
- Dashboard loads
- Leads list and conversion
- Clients and client members
- Create/open/edit ticket
- List <-> Kanban <-> detail navigation
- Start and stop timer
- Comment visibility
- Labels/checklists/attachments
- Invoice list/detail/action
- Knowledge base search
- Voice & AI settings load/save
- RustDesk page fails gracefully if disabled

## Rollback

- Frontend-only: restore prior static build.
- Backend-compatible: restore prior code/service package.
- Schema-changing: stop writes, restore the pre-upgrade database and matching backend, then restore matching frontend.
- Never run an older backend against a newer incompatible schema.

## Release evidence

Capture:

- commit/release identifier
- dependency lock changes
- database migration description
- check/build output
- health response
- smoke-test result
- deployed frontend asset hash
- rollback artifact locations
