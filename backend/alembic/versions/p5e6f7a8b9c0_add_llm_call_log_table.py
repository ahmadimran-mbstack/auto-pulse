"""add llm_call_log table for real token and cost logging

Revision ID: p5e6f7a8b9c0
Revises: n4d5e6f7a8b9
Create Date: 2026-11-23 13:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "p5e6f7a8b9c0"
down_revision: Union[str, None] = "n4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_call_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cost_micro_usd", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_llm_call_log_run_id", "llm_call_log", ["run_id"], unique=False)
    op.create_index("ix_llm_call_log_user_created", "llm_call_log", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_llm_call_log_user_created", table_name="llm_call_log")
    op.drop_index("ix_llm_call_log_run_id", table_name="llm_call_log")
    op.drop_table("llm_call_log")
