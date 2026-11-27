"""email outbox queue, retries, and delivery metrics

Revision ID: b2c3d4e5f6b0
Revises: a1b2c3d4e5f7
Create Date: 2026-11-27 09:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "b2c3d4e5f6b0"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE email_logs
            ADD COLUMN IF NOT EXISTS subject TEXT NULL,
            ADD COLUMN IF NOT EXISTS max_attempts SMALLINT NOT NULL DEFAULT 5,
            ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS provider TEXT NULL,
            ADD COLUMN IF NOT EXISTS provider_response_ms INTEGER NULL,
            ADD COLUMN IF NOT EXISTS total_duration_ms INTEGER NULL,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        """
    )
    op.execute("ALTER TABLE email_logs ALTER COLUMN attempts SET DEFAULT 0")
    op.execute("ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_status_check")
    op.execute("ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS ck_email_logs_status")
    op.execute(
        """
        ALTER TABLE email_logs
            ADD CONSTRAINT ck_email_logs_status
            CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'unknown'))
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_email_logs_outbox ON email_logs (status, next_attempt_at, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_email_logs_outbox")
    op.execute("ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS ck_email_logs_status")
    op.execute(
        """
        ALTER TABLE email_logs
            ADD CONSTRAINT ck_email_logs_status
            CHECK (status IN ('sent', 'failed', 'skipped'))
        """
    )
    op.execute("ALTER TABLE email_logs ALTER COLUMN attempts SET DEFAULT 1")
    op.execute(
        """
        ALTER TABLE email_logs
            DROP COLUMN IF EXISTS updated_at,
            DROP COLUMN IF EXISTS total_duration_ms,
            DROP COLUMN IF EXISTS provider_response_ms,
            DROP COLUMN IF EXISTS provider,
            DROP COLUMN IF EXISTS sent_at,
            DROP COLUMN IF EXISTS locked_at,
            DROP COLUMN IF EXISTS next_attempt_at,
            DROP COLUMN IF EXISTS max_attempts,
            DROP COLUMN IF EXISTS subject
        """
    )
