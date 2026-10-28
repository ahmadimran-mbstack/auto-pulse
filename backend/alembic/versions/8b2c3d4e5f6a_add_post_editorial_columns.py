"""add_post_editorial_columns

Revision ID: 8b2c3d4e5f6a
Revises: 7a1b2c3d4e5f
Create Date: 2026-10-28 14:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '8b2c3d4e5f6a'
down_revision: Union[str, Sequence[str], None] = '7a1b2c3d4e5f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('posts', sa.Column('angle', sa.Text(), nullable=True))
    op.add_column('posts', sa.Column('hook_type', sa.Text(), nullable=True))
    op.add_column('posts', sa.Column('post_format', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('posts', 'post_format')
    op.drop_column('posts', 'hook_type')
    op.drop_column('posts', 'angle')
