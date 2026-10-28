"""add_agent_loop_columns_and_playground_runs

Revision ID: 9c3d4e5f6a7b
Revises: 8b2c3d4e5f6a
Create Date: 2026-10-28 15:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9c3d4e5f6a7b'
down_revision: Union[str, Sequence[str], None] = '8b2c3d4e5f6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add ai_score and needs_review to posts
    op.add_column('posts', sa.Column('ai_score', sa.SmallInteger(), nullable=True))
    op.add_column('posts', sa.Column('needs_review', sa.Boolean(), server_default=sa.text('false'), nullable=False))

    # 2. Add agent_trace, current_step, round to generation_runs
    op.add_column('generation_runs', sa.Column('agent_trace', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('generation_runs', sa.Column('current_step', sa.Text(), nullable=True))
    op.add_column('generation_runs', sa.Column('round', sa.SmallInteger(), server_default='0', nullable=False))

    # 3. Create playground_runs table
    op.create_table(
        'playground_runs',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), server_default='queued', nullable=False),
        sa.Column('current_step', sa.Text(), nullable=True),
        sa.Column('round', sa.SmallInteger(), server_default='0', nullable=False),
        sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('trace', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("status IN ('queued', 'running', 'completed', 'failed')", name='ck_playground_runs_status'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_playground_runs')),
    )
    op.create_index('ix_playground_runs_user_id', 'playground_runs', ['user_id'], unique=False)
    op.create_index('ix_playground_runs_user_id_created_at', 'playground_runs', ['user_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_playground_runs_user_id_created_at', table_name='playground_runs')
    op.drop_index('ix_playground_runs_user_id', table_name='playground_runs')
    op.drop_table('playground_runs')

    op.drop_column('generation_runs', 'round')
    op.drop_column('generation_runs', 'current_step')
    op.drop_column('generation_runs', 'agent_trace')

    op.drop_column('posts', 'needs_review')
    op.drop_column('posts', 'ai_score')
