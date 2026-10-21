"""create_approvals_and_publications

Revision ID: 3c0581d046c4
Revises: 62f73e0cdccc
Create Date: 2026-10-21 15:59:34.098772

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3c0581d046c4'
down_revision: Union[str, Sequence[str], None] = '62f73e0cdccc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create approvals table
    op.create_table('approvals',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.Text(), nullable=False),
    sa.Column('post_id', sa.UUID(), nullable=False),
    sa.Column('channel', sa.Text(), server_default='email', nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('send_attempts', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('send_error', sa.Text(), nullable=True),
    sa.Column('decision', sa.Text(), nullable=True),
    sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('decided_via', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("channel IN ('email', 'whatsapp')", name='ck_approvals_channel'),
    sa.CheckConstraint("decided_via IN ('email_link', 'dashboard')", name='ck_approvals_decided_via'),
    sa.CheckConstraint("decision IN ('approved', 'rejected')", name='ck_approvals_decision'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('post_id', name='uq_approvals_post_id'),
    sa.UniqueConstraint('token_hash', name='uq_approvals_token_hash')
    )
    op.create_index(op.f('ix_approvals_user_id'), 'approvals', ['user_id'], unique=False)

    # Create post_publications table
    op.create_table('post_publications',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('user_id', sa.Text(), nullable=False),
    sa.Column('post_id', sa.UUID(), nullable=False),
    sa.Column('platform', sa.Text(), nullable=False),
    sa.Column('status', sa.Text(), server_default='pending', nullable=False),
    sa.Column('attempts', sa.SmallInteger(), server_default='0', nullable=False),
    sa.Column('not_before', sa.DateTime(timezone=True), nullable=True),
    sa.Column('claimed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('error_code', sa.Text(), nullable=True),
    sa.Column('error_detail', sa.Text(), nullable=True),
    sa.Column('external_id', sa.Text(), nullable=True),
    sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("platform IN ('linkedin')", name='ck_post_publications_platform'),
    sa.CheckConstraint("status IN ('pending', 'publishing', 'published', 'failed')", name='ck_post_publications_status'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('post_id', 'platform', name='uq_post_publications_post_id_platform')
    )
    op.create_index(op.f('ix_post_publications_user_id'), 'post_publications', ['user_id'], unique=False)

    # Add publish_at to posts table
    op.add_column('posts', sa.Column('publish_at', sa.DateTime(timezone=True), nullable=True))

    # Replace status check constraint on posts to include 'expired'
    op.drop_constraint('ck_posts_status', 'posts', type_='check')
    op.create_check_constraint(
        'ck_posts_status',
        'posts',
        "status IN ('draft', 'awaiting_approval', 'approved', 'rejected', 'publishing', 'published', 'failed', 'expired')"
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Revert status check constraint on posts
    op.drop_constraint('ck_posts_status', 'posts', type_='check')
    op.create_check_constraint(
        'ck_posts_status',
        'posts',
        "status IN ('draft', 'awaiting_approval', 'approved', 'rejected', 'publishing', 'published', 'failed')"
    )

    op.drop_column('posts', 'publish_at')
    op.drop_index(op.f('ix_post_publications_user_id'), table_name='post_publications')
    op.drop_table('post_publications')
    op.drop_index(op.f('ix_approvals_user_id'), table_name='approvals')
    op.drop_table('approvals')
