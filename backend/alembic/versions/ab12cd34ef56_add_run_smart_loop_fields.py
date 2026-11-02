"""add_run_smart_loop_fields

Revision ID: ab12cd34ef56
Revises: f6a7b8c9d0e1
Create Date: 2026-11-02 18:20:00.000000

Adds current_topic_index, current_round, and best_draft columns to generation_runs
and playground_runs, and updates check constraints for 'needs_review' and 'succeeded'.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'ab12cd34ef56'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    # 1. Add smart loop columns to generation_runs if not present
    gen_cols = [c['name'] for c in insp.get_columns('generation_runs')]
    if 'current_topic_index' not in gen_cols:
        op.add_column('generation_runs', sa.Column('current_topic_index', sa.Integer(), nullable=False, server_default='0'))
    if 'current_round' not in gen_cols:
        op.add_column('generation_runs', sa.Column('current_round', sa.Integer(), nullable=False, server_default='0'))
    if 'best_draft' not in gen_cols:
        op.add_column('generation_runs', sa.Column('best_draft', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # 2. Add smart loop columns to playground_runs if not present
    play_cols = [c['name'] for c in insp.get_columns('playground_runs')]
    if 'current_topic_index' not in play_cols:
        op.add_column('playground_runs', sa.Column('current_topic_index', sa.Integer(), nullable=False, server_default='0'))
    if 'current_round' not in play_cols:
        op.add_column('playground_runs', sa.Column('current_round', sa.Integer(), nullable=False, server_default='0'))
    if 'best_draft' not in play_cols:
        op.add_column('playground_runs', sa.Column('best_draft', postgresql.JSONB(astext_type=sa.Text()), nullable=True))

    # 3. Update generation_runs status check constraint
    gen_constraints = [c['name'] for c in insp.get_check_constraints('generation_runs')]
    if 'ck_generation_runs_status' in gen_constraints:
        op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'needs_review', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )

    # 4. Update playground_runs status check constraint
    play_constraints = [c['name'] for c in insp.get_check_constraints('playground_runs')]
    if 'ck_playground_runs_status' in play_constraints:
        op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'started', 'running', 'succeeded', 'needs_review', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_playground_runs_status', 'playground_runs', type_='check')
    op.create_check_constraint(
        'ck_playground_runs_status',
        'playground_runs',
        "status IN ('queued', 'started', 'running', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )

    op.drop_constraint('ck_generation_runs_status', 'generation_runs', type_='check')
    op.create_check_constraint(
        'ck_generation_runs_status',
        'generation_runs',
        "status IN ('queued', 'started', 'running', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )

    op.drop_column('playground_runs', 'best_draft')
    op.drop_column('playground_runs', 'current_round')
    op.drop_column('playground_runs', 'current_topic_index')

    op.drop_column('generation_runs', 'best_draft')
    op.drop_column('generation_runs', 'current_round')
    op.drop_column('generation_runs', 'current_topic_index')
