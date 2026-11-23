"""add reminders_sent table and pending_plan columns for Phase 6

Revision ID: s8b9c0d1e2f3
Revises: r7a8b9c0d1e2
Create Date: 2026-11-23 15:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "s8b9c0d1e2f3"
down_revision: Union[str, None] = "r7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("subscriptions", sa.Column("pending_plan_id", sa.Text(), nullable=True))
    op.add_column("subscriptions", sa.Column("pending_billing_interval", sa.Text(), nullable=True))

    op.create_table(
        "reminders_sent",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("reminder_type", sa.Text(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "reminder_type", "target_date", name="uq_reminders_sent_user_type_date"),
    )
    op.create_index("ix_reminders_sent_user_id", "reminders_sent", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_reminders_sent_user_id", table_name="reminders_sent")
    op.drop_table("reminders_sent")
    op.drop_column("subscriptions", "pending_billing_interval")
    op.drop_column("subscriptions", "pending_plan_id")
