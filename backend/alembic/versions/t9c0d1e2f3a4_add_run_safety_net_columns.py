"""add entry_point, failed_stage, error_category, real_error to generation_runs

Revision ID: t9c0d1e2f3a4
Revises: s8b9c0d1e2f3
Create Date: 2026-11-24 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "t9c0d1e2f3a4"
down_revision: Union[str, None] = "s8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS entry_point TEXT")
    op.execute("ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS failed_stage TEXT")
    op.execute("ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS error_category TEXT")
    op.execute("ALTER TABLE generation_runs ADD COLUMN IF NOT EXISTS real_error TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE generation_runs DROP COLUMN IF EXISTS real_error")
    op.execute("ALTER TABLE generation_runs DROP COLUMN IF EXISTS error_category")
    op.execute("ALTER TABLE generation_runs DROP COLUMN IF EXISTS failed_stage")
    op.execute("ALTER TABLE generation_runs DROP COLUMN IF EXISTS entry_point")
