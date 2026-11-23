"""make llm_call_log user_id and kind nullable for untracked calls

Revision ID: r7a8b9c0d1e2
Revises: q6f7a8b9c0d1
Create Date: 2026-11-23 14:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r7a8b9c0d1e2"
down_revision: Union[str, None] = "q6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("llm_call_log", "user_id", existing_type=sa.Text(), nullable=True)
    op.alter_column("llm_call_log", "kind", existing_type=sa.Text(), nullable=True)


def downgrade() -> None:
    op.alter_column("llm_call_log", "kind", existing_type=sa.Text(), nullable=False)
    op.alter_column("llm_call_log", "user_id", existing_type=sa.Text(), nullable=False)
