"""add_run_lifecycle_and_reaper_fields

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-11-02 17:15:00.000000

Adds boot_id, last_progress_at, current_node, and error_reason columns to generation_runs
and playground_runs, and updates check constraints for honest lifecycle statuses.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add lifecycle columns to generation_runs
    op.add_column('generation_runs', sa.Column('boot_id', sa.Text(), nullable=True))
    op.add_column('generation_runs', sa.Column('last_progress_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('generation_runs', sa.Column('current_node', sa.Text(), nullable=True))
    op.add_column('generation_runs', sa.Column('error_reason', sa.Text(), nullable=True))

    # 2. Add lifecycle columns to playground_runs
    op.add_column('playground_runs', sa.Column('boot_id', sa.Text(), nullable=True))
    op.add_column('playground_runs', sa.Column('last_progress_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('playground_runs', sa.Column('current_node', sa.Text(), nullable=True))
    op.add_column('playground_runs', sa.Column('error_reason', sa.Text(), nullable=True))

    # 3. Update generation_runs status check constraint
    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )

    # 4. Update playground_runs status check constraint
    op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'running', 'completed', 'failed', 'failed_quality')",
    )

    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'skipped')",
    )

    op.drop_column('playground_runs', 'error_reason')
    op.drop_column('playground_runs', 'current_node')
    op.drop_column('playground_runs', 'last_progress_at')
    op.drop_column('playground_runs', 'boot_id')

    op.drop_column('generation_runs', 'error_reason')
    op.drop_column('generation_runs', 'current_node')
    op.drop_column('generation_runs', 'last_progress_at')
    op.drop_column('generation_runs', 'boot_id')

