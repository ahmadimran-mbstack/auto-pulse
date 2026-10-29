"""drop_uq_posts_user_id_run_date

Revision ID: a1b2c3d4e5f6
Revises: 9c3d4e5f6a7b
Create Date: 2026-10-29 15:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '9c3d4e5f6a7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop unique constraint on (user_id, run_date) to allow multiple posts per day per user
    op.drop_constraint('uq_posts_user_id_run_date', 'posts', type_='unique')


def downgrade() -> None:
    op.create_unique_constraint('uq_posts_user_id_run_date', 'posts', ['user_id', 'run_date'])

