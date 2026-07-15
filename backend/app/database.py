"""Database configuration and base model."""
import os
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_async_engine(DATABASE_URL, echo=False, pool_size=20, max_overflow=10)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


from sqlalchemy.exc import IntegrityError, SQLAlchemyError

async def get_db():
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise
        except SQLAlchemyError:
            await session.rollback()
            raise
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    # Ensure every model is registered on Base.metadata before create_all.
    # Deferred import (models import Base from this module, so a top-level
    # import would be circular). Without this, a caller that has not already
    # imported app.models would run create_all() against empty metadata and
    # silently create no tables.
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        def _ensure_rustdesk_connection_password(sync_conn):
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if not inspector.has_table('rustdesk_devices'):
                return
            columns = {col['name'] for col in inspector.get_columns('rustdesk_devices')}
            if 'connection_password' not in columns:
                sync_conn.execute(text('ALTER TABLE rustdesk_devices ADD COLUMN connection_password VARCHAR(255)'))

        await conn.run_sync(_ensure_rustdesk_connection_password)

        def _ensure_client_members_table(sync_conn):
            """Create client_members table if missing (newest table added to the system)."""
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if inspector.has_table('client_members'):
                return
            sync_conn.execute(text("""
                CREATE TABLE client_members (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    client_id INTEGER NOT NULL REFERENCES clients(id),
                    full_name VARCHAR(255) NOT NULL,
                    phone VARCHAR(50),
                    personal_phone VARCHAR(50),
                    direct_email VARCHAR(255),
                    role VARCHAR(100),
                    is_primary BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))

        await conn.run_sync(_ensure_client_members_table)

        def _ensure_ticket_kanban_columns(sync_conn):
            """Add kanban/trello-like columns to existing tickets table."""
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if not inspector.has_table('tickets'):
                return
            columns = {col['name'] for col in inspector.get_columns('tickets')}

            alter_stmts = [
                ('cover_color',              "ALTER TABLE tickets ADD COLUMN cover_color VARCHAR(20)"),
                ('cover_image_url',          "ALTER TABLE tickets ADD COLUMN cover_image_url VARCHAR(500)"),
                ('due_date',                 "ALTER TABLE tickets ADD COLUMN due_date TIMESTAMP"),
                ('start_date',               "ALTER TABLE tickets ADD COLUMN start_date TIMESTAMP"),
                ('position',                 "ALTER TABLE tickets ADD COLUMN position FLOAT DEFAULT 0.0"),
                ('is_archived',              "ALTER TABLE tickets ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"),
                ('archived_at',              "ALTER TABLE tickets ADD COLUMN archived_at TIMESTAMP"),
                ('completed_at',             "ALTER TABLE tickets ADD COLUMN completed_at TIMESTAMP"),
                ('estimated_hours',          "ALTER TABLE tickets ADD COLUMN estimated_hours FLOAT"),
                ('actual_hours',             "ALTER TABLE tickets ADD COLUMN actual_hours FLOAT DEFAULT 0.0"),
                ('checklist_total',          "ALTER TABLE tickets ADD COLUMN checklist_total INTEGER DEFAULT 0"),
                ('checklist_completed',      "ALTER TABLE tickets ADD COLUMN checklist_completed INTEGER DEFAULT 0"),
                ('attachment_count',         "ALTER TABLE tickets ADD COLUMN attachment_count INTEGER DEFAULT 0"),
                ('label_ids_json',           "ALTER TABLE tickets ADD COLUMN label_ids_json TEXT DEFAULT '[]'"),
                ('member_ids_json',          "ALTER TABLE tickets ADD COLUMN member_ids_json TEXT DEFAULT '[]'"),
                ('custom_fields_json',       "ALTER TABLE tickets ADD COLUMN custom_fields_json TEXT"),
                ('client_member_id',         "ALTER TABLE tickets ADD COLUMN client_member_id INTEGER"),
            ]

            for col_name, stmt in alter_stmts:
                if col_name not in columns:
                    try:
                        sync_conn.execute(text(stmt))
                    except Exception:
                        pass  # Column may have been added concurrently

        await conn.run_sync(_ensure_ticket_kanban_columns)

        def _ensure_comment_attachments(sync_conn):
            """Add attachments_json column to existing comments table."""
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if not inspector.has_table('comments'):
                return
            columns = {col['name'] for col in inspector.get_columns('comments')}
            if 'attachments_json' not in columns:
                try:
                    sync_conn.execute(text("ALTER TABLE comments ADD COLUMN attachments_json TEXT DEFAULT '[]'"))
                except Exception:
                    pass  # Column may have been added concurrently

        await conn.run_sync(_ensure_comment_attachments)

        def _ensure_kb_attachments(sync_conn):
            """Add attachments_json column to existing knowledge_base table."""
            from sqlalchemy import inspect, text
            inspector = inspect(sync_conn)
            if not inspector.has_table('knowledge_base'):
                return
            columns = {col['name'] for col in inspector.get_columns('knowledge_base')}
            if 'attachments_json' not in columns:
                try:
                    sync_conn.execute(text("ALTER TABLE knowledge_base ADD COLUMN attachments_json TEXT DEFAULT '[]'"))
                except Exception:
                    pass  # Column may have been added concurrently

        await conn.run_sync(_ensure_kb_attachments)
