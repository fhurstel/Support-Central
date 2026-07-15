"""baseline: current full schema

This is the Alembic baseline for a project that historically evolved its schema
with ``Base.metadata.create_all()`` plus startup ALTER guards in
``app/database.py``. Rather than hand-transcribe ~18 tables (which would risk
drifting from the models), the baseline builds the schema directly from
``Base.metadata``. This guarantees that ``alembic upgrade head`` on a fresh
database produces exactly the same schema the application's own ``init_db()``
would create.

Adoption on an EXISTING database (schema already present):
    alembic stamp head        # record the baseline WITHOUT running DDL

Fresh database:
    alembic upgrade head      # create the schema and record the baseline

See migrations/README.md and docs/UPGRADE-RUNBOOK.md.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-14
"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _metadata():
    # Imported lazily so the module loads even when the app package layout
    # changes; keeps the revision self-contained.
    from app.database import Base
    import app.models  # noqa: F401  -- registers every model on Base.metadata

    return Base.metadata


def upgrade() -> None:
    _metadata().create_all(bind=op.get_bind())


def downgrade() -> None:
    _metadata().drop_all(bind=op.get_bind())
