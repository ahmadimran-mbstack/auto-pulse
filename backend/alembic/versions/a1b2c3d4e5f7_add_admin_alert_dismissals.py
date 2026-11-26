"""Add admin_alert_dismissals table and seed initial failed_emails dismissal for existing admins."""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, Sequence[str], None] = "z5c6d7e8f9a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_alert_dismissals",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("admin_user_id", sa.Text(), nullable=False),
        sa.Column("alert_type", sa.Text(), nullable=False),
        sa.Column(
            "dismissed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("admin_user_id", "alert_type", name="uq_admin_alert_dismissal_user_type"),
    )
    op.create_index(
        "ix_admin_alert_dismissals_user_type",
        "admin_alert_dismissals",
        ["admin_user_id", "alert_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_alert_dismissals_user_type", table_name="admin_alert_dismissals")
    op.drop_table("admin_alert_dismissals")
