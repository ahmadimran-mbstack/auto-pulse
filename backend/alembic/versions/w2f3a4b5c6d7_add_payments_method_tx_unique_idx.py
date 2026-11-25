"""add partial unique index on payments(method, transaction_id) for pending and approved rows

Revision ID: w2f3a4b5c6d7
Revises: v1e2f3a4b5c6
Create Date: 2026-11-25 13:12:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "w2f3a4b5c6d7"
down_revision: Union[str, None] = "v1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_method_transaction_id_active "
        "ON payments (method, transaction_id) WHERE status IN ('pending', 'approved')"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_payments_method_transaction_id_active")
