"""add subscriptions table and backfill existing users to internal plan

Revision ID: n4d5e6f7a8b9
Revises: m3c4d5e6f7a8
Create Date: 2026-11-23 13:26:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n4d5e6f7a8b9"
down_revision: Union[str, None] = "m3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("plan_id", sa.Text(), nullable=False, server_default="trial"),
        sa.Column("status", sa.Text(), nullable=False, server_default="trialing"),
        sa.Column("billing_interval", sa.Text(), nullable=True),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("provider_ref", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("user_id"),
        sa.CheckConstraint(
            "status IN ('trialing', 'active', 'expired', 'canceled')",
            name="ck_subscriptions_status",
        ),
        sa.CheckConstraint(
            "billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')",
            name="ck_subscriptions_billing_interval",
        ),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"], unique=False)

    # One-time idempotent backfill: every existing user gets the "internal" plan
    op.execute(
        """
        INSERT INTO subscriptions (user_id, plan_id, status, billing_interval, created_at, updated_at)
        SELECT user_id, 'internal', 'active', NULL, now(), now()
        FROM profiles
        ON CONFLICT (user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions")
    op.drop_table("subscriptions")
