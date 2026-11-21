"""add approval_lead_minutes, approval_send_at, reminder_sent_at, and skipped notice fields

Revision ID: m3c4d5e6f7a8
Revises: k2b3c4d5e6f7
Create Date: 2026-11-21 15:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "m3c4d5e6f7a8"
down_revision: Union[str, None] = "k2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing users keep 180 minutes (3 hours) so their effective timing does not change silently
    op.add_column(
        "profiles",
        sa.Column("approval_lead_minutes", sa.SmallInteger(), nullable=False, server_default="180"),
    )
    op.create_check_constraint(
        "ck_profiles_approval_lead_minutes",
        "profiles",
        "approval_lead_minutes IN (60, 180, 360, 720)",
    )

    op.add_column(
        "posts",
        sa.Column("approval_send_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "posts",
        sa.Column("scheduled_skipped_notified_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "approvals",
        sa.Column("reminder_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("approvals", "reminder_sent_at")
    op.drop_column("posts", "scheduled_skipped_notified_at")
    op.drop_column("posts", "approval_send_at")
    op.drop_constraint("ck_profiles_approval_lead_minutes", "profiles", type_="check")
    op.drop_column("profiles", "approval_lead_minutes")
