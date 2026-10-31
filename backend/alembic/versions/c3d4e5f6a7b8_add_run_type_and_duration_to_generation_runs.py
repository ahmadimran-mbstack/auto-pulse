"""add_run_type_and_duration_to_generation_runs

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-10-31 14:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add run_type, duration, and result to generation_runs
    op.add_column('generation_runs', sa.Column('run_type', sa.Text(), server_default='scheduled', nullable=False))
    op.add_column('generation_runs', sa.Column('duration', sa.Float(), nullable=True))
    op.add_column('generation_runs', sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # 2. Update status check constraint to include 'queued', 'running', 'completed'
    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'skipped')",
    )

    # 3. Replace unconditional unique constraint with partial unique index for scheduled runs
    op.drop_constraint('uq_generation_runs_user_id_run_date', 'generation_runs', type_='unique')
    op.create_index(
        'uq_generation_runs_scheduled_user_date',
        'generation_runs',
        ['user_id', 'run_date'],
        unique=True,
        postgresql_where=sa.text("run_type = 'scheduled'"),
    )


def downgrade() -> None:
    op.drop_index('uq_generation_runs_scheduled_user_date', table_name='generation_runs')
    op.create_unique_constraint('uq_generation_runs_user_id_run_date', 'generation_runs', ['user_id', 'run_date'])

    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('started', 'succeeded', 'failed', 'skipped')",
    )

    op.drop_column('generation_runs', 'result')
    op.drop_column('generation_runs', 'duration')
    op.drop_column('generation_runs', 'run_type')

