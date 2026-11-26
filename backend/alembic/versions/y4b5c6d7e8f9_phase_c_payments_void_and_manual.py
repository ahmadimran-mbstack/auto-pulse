"""phase C: extend payments constraints, add manual record & void columns, rebuild tx unique indexes

Revision ID: y4b5c6d7e8f9
Revises: x3a4b5c6d7e8
Create Date: 2026-11-26 13:02:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "y4b5c6d7e8f9"
down_revision: Union[str, None] = "x3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'checkout',
            ADD COLUMN IF NOT EXISTS recorded_by TEXT NULL,
            ADD COLUMN IF NOT EXISTS note TEXT NULL,
            ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS voided_by TEXT NULL,
            ADD COLUMN IF NOT EXISTS void_reason TEXT NULL
        """
    )

    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT ck_payments_method "
        "CHECK (method IN ('easypaisa', 'jazzcash', 'manual', 'cash', 'bank_transfer'))"
    )

    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_status")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT ck_payments_status "
        "CHECK (status IN ('pending', 'approved', 'rejected', 'voided'))"
    )

    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_source")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT ck_payments_source "
        "CHECK (source IN ('checkout', 'manual'))"
    )

    op.execute("DROP INDEX IF EXISTS uq_payments_transaction_id_active")
    op.execute(
        "CREATE UNIQUE INDEX uq_payments_transaction_id_active "
        "ON payments (transaction_id) WHERE status IN ('pending', 'approved', 'voided')"
    )

    op.execute("DROP INDEX IF EXISTS uq_payments_method_transaction_id_active")
    op.execute(
        "CREATE UNIQUE INDEX uq_payments_method_transaction_id_active "
        "ON payments (method, transaction_id) WHERE status IN ('pending', 'approved', 'voided')"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_payments_method_transaction_id_active")
    op.execute(
        "CREATE UNIQUE INDEX uq_payments_method_transaction_id_active "
        "ON payments (method, transaction_id) WHERE status IN ('pending', 'approved')"
    )
    op.execute("DROP INDEX IF EXISTS uq_payments_transaction_id_active")
    op.execute(
        "CREATE UNIQUE INDEX uq_payments_transaction_id_active "
        "ON payments (transaction_id) WHERE status IN ('pending', 'approved')"
    )
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_source")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_status")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT ck_payments_status "
        "CHECK (status IN ('pending', 'approved', 'rejected'))"
    )
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS ck_payments_method")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT ck_payments_method "
        "CHECK (method IN ('easypaisa', 'jazzcash'))"
    )
    op.execute(
        """
        ALTER TABLE payments
            DROP COLUMN IF EXISTS void_reason,
            DROP COLUMN IF EXISTS voided_by,
            DROP COLUMN IF EXISTS voided_at,
            DROP COLUMN IF EXISTS note,
            DROP COLUMN IF EXISTS recorded_by,
            DROP COLUMN IF EXISTS source
        """
    )
