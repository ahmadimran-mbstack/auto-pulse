"""add_failed_quality_status_to_runs

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-11-02 14:40:00.000000

Update check constraints on generation_runs and playground_runs to permit 'failed_quality' status.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update generation_runs status check constraint
    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'skipped')",
    )

    # 2. Update playground_runs status check constraint
    op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'running', 'completed', 'failed', 'failed_quality')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'running', 'completed', 'failed')",
    )

    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'skipped')",
    )

