#!/usr/bin/env python3
"""
Database schema validator for Service Desk.

Run after ANY model change to ensure the live SQLite schema matches the
SQLAlchemy models. Read-only: it never alters the database.

Environment-driven:
  DATABASE_URL   SQLite target to validate. Defaults to the local dev DB.
                 Never point this at a production database for casual checks —
                 use a copy. This tool originated as a production repair aid.

Coverage is derived from ``Base.metadata`` (every mapped table), not a
hardcoded subset, so newly added models are validated automatically.
"""
import sys
import sqlite3
import os
from pathlib import Path
from sqlalchemy.engine import make_url

BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/service_desk.dev.db")

_url = make_url(DATABASE_URL)
if not _url.get_backend_name().startswith("sqlite"):
    raise RuntimeError(f"DATABASE_URL must be a SQLite URL, got backend '{_url.get_backend_name()}'")
_db_name = _url.database
if not _db_name:
    raise RuntimeError("DATABASE_URL must point to a SQLite database file")
DB_PATH = str(Path(_db_name) if Path(_db_name).is_absolute() else (BASE_DIR / _db_name).resolve())


def get_db_columns(table_name):
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(f"PRAGMA table_info({table_name})")
        return {row[1] for row in cursor.fetchall()}
    finally:
        conn.close()


def validate_table(table):
    """Compare a SQLAlchemy Table against the live DB. Returns True if consistent."""
    db_cols = get_db_columns(table.name)
    model_cols = {c.name for c in table.columns}

    if not db_cols:
        print(f"⚠️  {table.name}: table missing in DB (expected {len(model_cols)} columns)")
        return False

    missing_in_db = model_cols - db_cols
    extra_in_db = db_cols - model_cols

    if missing_in_db:
        print(f"❌ {table.name}: MISSING columns in DB: {sorted(missing_in_db)}")
        return False
    if extra_in_db:
        print(f"⚠️  {table.name}: EXTRA columns in DB (not in model): {sorted(extra_in_db)}")
    print(f"✅ {table.name}: schema matches model ({len(model_cols)} columns)")
    return True


def main():
    sys.path.insert(0, str(BASE_DIR))
    os.environ.setdefault("DATABASE_URL", DATABASE_URL)

    from app.database import Base
    import app.models  # noqa: F401  -- registers every model on Base.metadata

    print(f"Validating schema against: {DB_PATH}\n")

    tables = sorted(Base.metadata.tables.values(), key=lambda t: t.name)
    all_ok = True
    for table in tables:
        if not validate_table(table):
            all_ok = False

    if not all_ok:
        print("\n❌ SCHEMA MISMATCH DETECTED — run migration before restarting backend")
        sys.exit(1)
    print(f"\n✅ All {len(tables)} models match database schema")
    sys.exit(0)


if __name__ == "__main__":
    main()
