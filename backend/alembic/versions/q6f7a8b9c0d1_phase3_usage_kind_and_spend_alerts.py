"""add generation_runs.usage_kind and spend_alerts table for Phase 3

Revision ID: q6f7a8b9c0d1
Revises: p5e6f7a8b9c0
Create Date: 2026-11-23 14:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "q6f7a8b9c0d1"
down_revision: Union[str, None] = "p5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "generation_runs",
        sa.Column("usage_kind", sa.Text(), server_default="scheduled", nullable=False),
    )
    op.execute(
        """
        UPDATE generation_runs g
        SET usage_kind = 'playground'
        FROM playground_runs p
        WHERE p.id = g.id
        """
    )
    op.create_index(
        "ix_generation_runs_user_kind_started",
        "generation_runs",
        ["user_id", "usage_kind", "started_at"],
        unique=False,
    )

    op.create_table(
        "spend_alerts",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "day", name="uq_spend_alerts_user_day"),
    )


def downgrade() -> None:
    op.drop_table("spend_alerts")
    op.drop_index("ix_generation_runs_user_kind_started", table_name="generation_runs")
    op.drop_column("generation_runs", "usage_kind")
