"""add entry_point, failed_stage, error_category, real_error to generation_runs

Revision ID: t9c0d1e2f3a4
Revises: s8b9c0d1e2f3
Create Date: 2026-11-24 21:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t9c0d1e2f3a4"
down_revision: Union[str, None] = "s8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("generation_runs", sa.Column("entry_point", sa.Text(), nullable=True))
    op.add_column("generation_runs", sa.Column("failed_stage", sa.Text(), nullable=True))
    op.add_column("generation_runs", sa.Column("error_category", sa.Text(), nullable=True))
    op.add_column("generation_runs", sa.Column("real_error", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("generation_runs", "real_error")
    op.drop_column("generation_runs", "error_category")
    op.drop_column("generation_runs", "failed_stage")
    op.drop_column("generation_runs", "entry_point")
