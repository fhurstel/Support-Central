# Architecture

## System overview

Browser -> nginx/static Vite SPA -> `/api/*` -> FastAPI/Uvicorn -> async SQLAlchemy -> SQLite.

Optional integrations are backend-mediated: SMTP, Poppy AI, Voice Agent settings, RustDesk, OpenRouter/NVIDIA model selection, and LiveKit-related service-to-service calls.

## Frontend

- `frontend/src/main.jsx`: browser bootstrap
- `frontend/src/App.jsx`: routing, layout, protected routes
- `frontend/src/context/AuthContext.jsx`: JWT user/session state
- `frontend/src/services/api.js`: canonical API request layer
- `frontend/src/pages/`: feature pages
- `frontend/src/components/`: shared components
- `frontend/src/index.css`: application styling

Primary pages cover dashboard, leads, clients, tickets/list/Kanban/detail, invoices, knowledge base, users, RustDesk, and Voice & AI settings.

## Backend

- `backend/app/main.py`: app, middleware, exception handling, router registration, health check
- `backend/app/database.py`: engine/session and startup schema compatibility guards
- `backend/app/models/__init__.py`: SQLAlchemy tables/enums/relationships
- `backend/app/schemas.py`: Pydantic request/response contracts
- `backend/app/auth/`: JWT and role dependencies
- `backend/app/api/routes/`: business APIs
- `backend/app/routes/`: auth and RustDesk APIs
- `backend/app/services/`: email and external services

## Data model domains

- Users and roles
- Leads
- Clients and client members
- Tickets, assignments, comments, time entries
- Kanban labels, checklists/items, attachments, activity
- Knowledge base and MCP sources
- Invoices
- RustDesk devices and remote sessions
- Call logs
- Voice & AI runtime settings

## Configuration

Backend reads `backend/.env`. Required values are `DATABASE_URL` and `JWT_SECRET`. All documented variables are in `backend/.env.example`.

Frontend environment variables are documented in `frontend/.env.example`.

Runtime data should be outside source control:

- SQLite database
- uploads
- voice-agent settings JSON
- RustDesk public key/web client files

## Build and deployment

Vite builds to top-level `dist/`. Nginx must serve that content with BrowserRouter fallback. FastAPI binds to loopback behind nginx. Example files are in `deploy/`.

## Migration strategy

Alembic is adopted as the forward migration mechanism (`backend/migrations/`, config in `backend/alembic.ini`, driven by `DATABASE_URL`). The baseline revision `0001_baseline` reproduces the current schema from `Base.metadata`, so `alembic upgrade head` on a fresh database is identical to what the app's `init_db()` builds (verified: `alembic revision --autogenerate` reports no diff).

Adoption is additive. `Base.metadata.create_all()` plus the idempotent `ALTER TABLE` guards in `database.py` are kept so the app still self-bootstraps a fresh database; `create_all()` is a no-op once tables exist and coexists with Alembic. `init_db()` now imports the models itself so `create_all()` never runs against empty metadata.

Existing databases adopt the baseline with `alembic stamp head` (records the baseline without running DDL — never `upgrade`, which would try to re-create existing tables). Fresh databases use `alembic upgrade head`. Renames, type changes, and constraints still need reviewed, hand-edited revisions (SQLite uses batch mode; `env.py` sets `render_as_batch=True`). See `backend/migrations/README.md`.

## Security boundaries

- Browser auth: JWT bearer token
- Admin/technician/guest role dependencies
- Voice integration: dedicated shared backend token
- Provider keys remain server-side
- Production database and uploads are never part of source archives
- RustDesk key file in this repository is a configurable path only; key material is excluded
