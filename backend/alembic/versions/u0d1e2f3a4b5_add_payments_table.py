"""add payments table for manual QR billing

Revision ID: u0d1e2f3a4b5
Revises: t9c0d1e2f3a4
Create Date: 2026-11-24 22:10:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "u0d1e2f3a4b5"
down_revision: Union[str, None] = "t9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS payments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            plan_id TEXT NOT NULL,
            billing_interval TEXT NOT NULL CHECK (billing_interval IN ('monthly', 'annual')),
            amount_usd_cents INTEGER NOT NULL,
            amount_pkr INTEGER NOT NULL,
            method TEXT NOT NULL CHECK (method IN ('easypaisa', 'jazzcash')),
            transaction_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_by TEXT NULL,
            reviewed_at TIMESTAMPTZ NULL,
            reject_reason TEXT NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments (user_id)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_transaction_id_active "
        "ON payments (transaction_id) WHERE status IN ('pending', 'approved')"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_user_pending "
        "ON payments (user_id) WHERE status = 'pending'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_payments_user_pending")
    op.execute("DROP INDEX IF EXISTS uq_payments_transaction_id_active")
    op.execute("DROP INDEX IF EXISTS ix_payments_user_id")
    op.execute("DROP TABLE IF EXISTS payments")
