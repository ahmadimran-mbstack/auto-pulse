"""add_run_events_and_internal_trace

Revision ID: g7b8c9d0e1f2
Revises: ab12cd34ef56
Create Date: 2026-11-16 13:10:00.000000

Adds run_events table for live agent event streaming, plus internal_trace,
cancel_requested, and 'cancelled' status to generation_runs and playground_runs.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "g7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "ab12cd34ef56"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add internal_trace and cancel_requested to generation_runs and playground_runs
    op.add_column("generation_runs", sa.Column("internal_trace", postgresql.JSONB(), nullable=True))
    op.add_column(
        "generation_runs",
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("playground_runs", sa.Column("internal_trace", postgresql.JSONB(), nullable=True))
    op.add_column(
        "playground_runs",
        sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 2. Allow 'cancelled' in status check constraints
    op.drop_constraint("ck_generation_runs_status", "generation_runs", type_="check")
    op.create_check_constraint(
        "ck_generation_runs_status",
        "generation_runs",
        "status IN ('queued', 'started', 'running', 'succeeded', 'needs_review', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'cancelled', 'skipped')",
    )
    op.drop_constraint("ck_playground_runs_status", "playground_runs", type_="check")
    op.create_check_constraint(
        "ck_playground_runs_status",
        "playground_runs",
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'cancelled')",
    )

    # 3. Create run_events table for live timeline polling
    op.create_table(
        "run_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("agent", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.UniqueConstraint("run_id", "seq", name="uq_run_events_run_id_seq"),
    )
    op.create_index("ix_run_events_run_id", "run_events", ["run_id"])
    op.create_index("ix_run_events_user_id", "run_events", ["user_id"])
    op.create_index("ix_run_events_run_id_seq", "run_events", ["run_id", "seq"])


def downgrade() -> None:
    op.drop_index("ix_run_events_run_id_seq", table_name="run_events")
    op.drop_index("ix_run_events_user_id", table_name="run_events")
    op.drop_index("ix_run_events_run_id", table_name="run_events")
    op.drop_table("run_events")

    op.drop_constraint("ck_playground_runs_status", "playground_runs", type_="check")
    op.create_check_constraint(
        "ck_playground_runs_status",
        "playground_runs",
        "status IN ('queued', 'started', 'running', 'succeeded', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted')",
    )
    op.drop_constraint("ck_generation_runs_status", "generation_runs", type_="check")
    op.create_check_constraint(
        "ck_generation_runs_status",
        "generation_runs",
        "status IN ('queued', 'started', 'running', 'succeeded', 'needs_review', 'completed', 'failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted', 'skipped')",
    )

    op.drop_column("playground_runs", "cancel_requested")
    op.drop_column("playground_runs", "internal_trace")
    op.drop_column("generation_runs", "cancel_requested")
    op.drop_column("generation_runs", "internal_trace")

