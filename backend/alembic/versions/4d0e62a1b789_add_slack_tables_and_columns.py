"""add_slack_tables_and_columns

Revision ID: 4d0e62a1b789
Revises: 3c0581d046c4
Create Date: 2026-10-27 14:23:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '4d0e62a1b789'
down_revision: Union[str, Sequence[str], None] = '3c0581d046c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create slack_integrations table
    op.create_table(
        'slack_integrations',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('team_id', sa.Text(), nullable=False),
        sa.Column('team_name', sa.Text(), nullable=True),
        sa.Column('slack_user_id', sa.Text(), nullable=False),
        sa.Column('dm_channel_id', sa.Text(), nullable=False),
        sa.Column('bot_token_encrypted', sa.Text(), nullable=False),
        sa.Column('bot_user_id', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), server_default='connected', nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('connected', 'disconnected')", name='ck_slack_integrations_status'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_slack_integrations_user_id'),
    )
    op.create_index(op.f('ix_slack_integrations_user_id'), 'slack_integrations', ['user_id'], unique=True)

    # 2. Create slack_approval_messages table
    op.create_table(
        'slack_approval_messages',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('post_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.Text(), nullable=False),
        sa.Column('channel_id', sa.Text(), nullable=False),
        sa.Column('message_ts', sa.Text(), nullable=True),
        sa.Column('status', sa.Text(), server_default='sending', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint("status IN ('sending', 'sent', 'failed')", name='ck_slack_approval_messages_status'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('post_id', name='uq_slack_approval_messages_post_id'),
    )
    op.create_index(op.f('ix_slack_approval_messages_user_id'), 'slack_approval_messages', ['user_id'], unique=False)
    op.create_index(
        op.f('ix_slack_approval_messages_channel_message_ts'),
        'slack_approval_messages',
        ['channel_id', 'message_ts'],
        unique=False,
    )

    # 3. Add slack_approval_enabled to profiles
    op.add_column(
        'profiles',
        sa.Column('slack_approval_enabled', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )

    # 4. Add return_to to oauth_states
    op.add_column(
        'oauth_states',
        sa.Column('return_to', sa.Text(), server_default='dashboard', nullable=False),
    )
    op.create_check_constraint(
        'ck_oauth_states_return_to',
        'oauth_states',
        "return_to IN ('onboarding', 'dashboard')",
    )

    # 5. Add approval_source and decided_at to posts
    op.add_column('posts', sa.Column('approval_source', sa.Text(), nullable=True))
    op.add_column('posts', sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'decided_at')
    op.drop_column('posts', 'approval_source')
    op.drop_constraint('ck_oauth_states_return_to', 'oauth_states', type_='check')
    op.drop_column('oauth_states', 'return_to')
    op.drop_column('profiles', 'slack_approval_enabled')
    op.drop_index(op.f('ix_slack_approval_messages_channel_message_ts'), table_name='slack_approval_messages')
    op.drop_index(op.f('ix_slack_approval_messages_user_id'), table_name='slack_approval_messages')
    op.drop_table('slack_approval_messages')
    op.drop_index(op.f('ix_slack_integrations_user_id'), table_name='slack_integrations')
    op.drop_table('slack_integrations')
