"""add test_lab_runs table and posts.is_test column

Revision ID: j1a2b3c4d5e6
Revises: h8c9d0e1f2a3
Create Date: 2026-11-21 14:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "j1a2b3c4d5e6"
down_revision: Union[str, None] = "h8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.create_table(
        "test_lab_runs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="scheduled"),
        sa.Column("topic_hint", sa.Text(), nullable=True),
        sa.Column("dry_run", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("generate_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approve_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("upload_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("generate_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("approve_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("upload_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("generate_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("generate_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approve_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("approve_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upload_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upload_finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("generate_error", sa.Text(), nullable=True),
        sa.Column("approve_error", sa.Text(), nullable=True),
        sa.Column("upload_error", sa.Text(), nullable=True),
        sa.Column("post_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "events",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_test_lab_runs_user_id", "test_lab_runs", ["user_id"])
    op.create_index(
        "uq_test_lab_runs_active_user",
        "test_lab_runs",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('scheduled', 'running')"),
    )


def downgrade() -> None:
    op.drop_index("uq_test_lab_runs_active_user", table_name="test_lab_runs")
    op.drop_index("ix_test_lab_runs_user_id", table_name="test_lab_runs")
    op.drop_table("test_lab_runs")
    op.drop_column("posts", "is_test")
