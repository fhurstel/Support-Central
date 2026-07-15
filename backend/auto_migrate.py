#!/usr/bin/env python3
"""
Auto-migrate: add missing columns from SQLAlchemy models to the SQLite database.

Safe to run multiple times — it only adds columns that do not yet exist and
never drops, renames, or retypes anything. It cannot express constraint,
type, or destructive changes; those still need a hand-written migration
(see the Alembic scaffolding under ``migrations/``).

Environment-driven:
  DATABASE_URL        SQLite target. Defaults to the local dev DB.
  AUTO_MIGRATE_YES=1  Required to actually write. Without it (and without the
                      --yes flag) the tool prints the planned changes and
                      exits without touching the database.

This tool originated as a production repair aid. Never run it against a live
database you have not backed up first, and never test a migration on the live
database — use a copy (see docs/UPGRADE-RUNBOOK.md).

Coverage is derived from ``Base.metadata`` (every mapped table), not a
hardcoded subset.
"""
import sys
import sqlite3
import os
from pathlib import Path
from sqlalchemy import String, Integer, Boolean, DateTime, Text, Float
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

_TYPE_MAP = {
    String: "TEXT",
    Text: "TEXT",
    DateTime: "TEXT",
    Integer: "INTEGER",
    Boolean: "INTEGER",
    Float: "REAL",
}


def get_db_columns(table_name):
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(f"PRAGMA table_info({table_name})")
        return {row[1] for row in cursor.fetchall()}
    finally:
        conn.close()


def table_exists(conn, table_name):
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    )
    return cur.fetchone() is not None


def sqlalchemy_type_to_sqlite(col):
    return _TYPE_MAP.get(type(col.type), "TEXT")


def plan_table(table):
    """Return list of (column, DDL) tuples for columns missing from the DB."""
    db_cols = get_db_columns(table.name)
    plan = []
    for col in table.columns:
        if col.name in db_cols:
            continue
        sqlite_type = sqlalchemy_type_to_sqlite(col)
        nullable = "" if col.nullable else "NOT NULL"
        default = ""
        if col.default is not None and getattr(col.default, "is_scalar", False):
            default_val = col.default.arg
            if isinstance(default_val, bool):
                default = f"DEFAULT {1 if default_val else 0}"
            elif isinstance(default_val, str):
                default = f"DEFAULT '{default_val}'"
            elif isinstance(default_val, (int, float)):
                default = f"DEFAULT {default_val}"
        ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {sqlite_type} {nullable} {default}".strip()
        while "  " in ddl:
            ddl = ddl.replace("  ", " ")
        plan.append((col.name, ddl))
    return plan


def main():
    sys.path.insert(0, str(BASE_DIR))
    os.environ.setdefault("DATABASE_URL", DATABASE_URL)

    from app.database import Base
    import app.models  # noqa: F401  -- registers every model on Base.metadata

    confirmed = "--yes" in sys.argv or os.getenv("AUTO_MIGRATE_YES") == "1"
    print(f"Target database: {DB_PATH}")
    print(f"Mode: {'APPLY' if confirmed else 'DRY-RUN (set AUTO_MIGRATE_YES=1 or pass --yes to apply)'}\n")

    conn = sqlite3.connect(DB_PATH)
    try:
        total_changes = 0
        for table in sorted(Base.metadata.tables.values(), key=lambda t: t.name):
            if not table_exists(conn, table.name):
                print(f"⏭️  {table.name}: table does not exist — create_all()/init_db() owns table creation, skipping")
                continue
            plan = plan_table(table)
            if not plan:
                print(f"✅ {table.name}: no changes needed")
                continue
            for col_name, ddl in plan:
                total_changes += 1
                print(f"  ➕ {table.name}.{col_name}")
                if confirmed:
                    try:
                        conn.execute(ddl)
                    except sqlite3.OperationalError as exc:
                        if "duplicate column" in str(exc).lower():
                            print("     (already exists, skipping)")
                        else:
                            print(f"     ❌ Error: {exc}")
                            conn.rollback()
                            sys.exit(1)
        if confirmed:
            conn.commit()
            print(f"\n✅ Applied {total_changes} column addition(s)")
        elif total_changes:
            print(f"\nℹ️  {total_changes} column(s) would be added. Re-run with --yes to apply.")
        else:
            print("\n✅ Database already matches models — nothing to do")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
