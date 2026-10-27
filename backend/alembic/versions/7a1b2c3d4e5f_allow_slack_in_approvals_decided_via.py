"""allow_slack_in_approvals_decided_via

Revision ID: 7a1b2c3d4e5f
Revises: 4d0e62a1b789
Create Date: 2026-10-27 15:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '7a1b2c3d4e5f'
down_revision: Union[str, Sequence[str], None] = '4d0e62a1b789'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_approvals_decided_via', 'approvals', type_='check')
    op.create_check_constraint(
        'ck_approvals_decided_via',
        'approvals',
        "decided_via IN ('email_link', 'dashboard', 'slack')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_approvals_decided_via', 'approvals', type_='check')
    op.create_check_constraint(
        'ck_approvals_decided_via',
        'approvals',
        "decided_via IN ('email_link', 'dashboard')",
    )
