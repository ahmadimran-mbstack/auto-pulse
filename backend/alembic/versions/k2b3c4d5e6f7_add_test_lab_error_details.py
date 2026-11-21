"""add error_details jsonb to test_lab_runs

Revision ID: k2b3c4d5e6f7
Revises: j1a2b3c4d5e6
Create Date: 2026-11-21 15:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "k2b3c4d5e6f7"
down_revision: Union[str, None] = "j1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "test_lab_runs",
        sa.Column(
            "error_details",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("test_lab_runs", "error_details")
