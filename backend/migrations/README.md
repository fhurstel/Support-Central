# Database migrations (Alembic)

This project historically evolved its schema with
`Base.metadata.create_all()` plus idempotent startup `ALTER` guards in
`app/database.py`. Alembic is now adopted **additively** as the forward
migration mechanism. The startup `create_all()` is intentionally kept so the
app still self-bootstraps a fresh database; `create_all()` is idempotent and
becomes a no-op once the schema exists.

All Alembic commands run from the `backend/` directory and read the target
database from the `DATABASE_URL` environment variable (the same variable the
app uses). No database URL or secret is stored in `alembic.ini`.

## Baseline

`migrations/versions/0001_baseline_schema.py` is the baseline. Instead of
hand-transcribing every table, it builds the schema from `Base.metadata`, so
`alembic upgrade head` on a fresh database produces **exactly** what the
application's own `init_db()` creates. This was verified with
`alembic revision --autogenerate`, which reports no diff against the models.

## Adopting Alembic on an EXISTING database

The schema already exists (created by `create_all()`/`init_db()`), so do **not**
run `upgrade` — that would try to re-create existing tables. Instead record the
baseline as already applied, without running any DDL:

```bash
cd backend
DATABASE_URL=... uv run alembic stamp head
```

Back up the database first (see `docs/UPGRADE-RUNBOOK.md`).

## A fresh database

```bash
cd backend
DATABASE_URL=... uv run alembic upgrade head
```

This creates the full schema and records the baseline in one step.

## Creating a new migration

1. Change the SQLAlchemy models.
2. Autogenerate a revision:

   ```bash
   cd backend
   DATABASE_URL=<disposable-db> uv run alembic revision --autogenerate -m "describe change"
   ```

3. **Review and edit** the generated file. SQLite requires batch mode for most
   `ALTER` operations; `env.py` already sets `render_as_batch=True`.
4. Apply and verify against a fresh DB and against a copy of an older DB:

   ```bash
   uv run alembic upgrade head
   uv run python validate_schema.py
   ```

## Known modeling note

`tickets`, `leads`, and `knowledge_base` have mutually dependent foreign keys
(e.g. `tickets.kb_article_id` ↔ `knowledge_base.source_ticket_id`). Alembic's
autogenerate emits a `SAWarning` about unresolvable table-sort cycles. This is
harmless for the `create_all`-based baseline, but a future migration that adds
or drops these cross-links may need explicit `op.create_foreign_key(...)` /
`use_alter` handling rather than relying on autogenerate ordering.
