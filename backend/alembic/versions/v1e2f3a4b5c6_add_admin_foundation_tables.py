"""add admin foundation tables and profile account_status columns

Revision ID: v1e2f3a4b5c6
Revises: u0d1e2f3a4b5
Create Date: 2026-11-25 12:50:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "v1e2f3a4b5c6"
down_revision: Union[str, None] = "u0d1e2f3a4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
            ADD COLUMN IF NOT EXISTS status_reason TEXT NULL,
            ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS status_changed_by TEXT NULL
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'ck_profiles_account_status'
            ) THEN
                ALTER TABLE profiles
                    ADD CONSTRAINT ck_profiles_account_status
                    CHECK (account_status IN ('active', 'suspended', 'disabled'));
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        ALTER TABLE payments
            ADD COLUMN IF NOT EXISTS user_email TEXT NULL
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            actor_id TEXT NULL,
            actor_email TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NULL,
            target_email TEXT NULL,
            reason TEXT NULL,
            before_state JSONB NULL,
            after_state JSONB NULL,
            email_status TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_created_at ON admin_audit_logs (created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_target ON admin_audit_logs (target_type, target_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_admin_audit_logs_action ON admin_audit_logs (action)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS deleted_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT NOT NULL UNIQUE,
            user_id TEXT NULL,
            deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_by TEXT NOT NULL,
            reason TEXT NULL
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS email_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NULL,
            to_email TEXT NOT NULL,
            type TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
            error TEXT NULL,
            attempts SMALLINT NOT NULL DEFAULT 1,
            provider_message_id TEXT NULL,
            idempotency_key TEXT NULL UNIQUE,
            payload JSONB NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_logs_user_created ON email_logs (user_id, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_email_logs_status ON email_logs (status)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS email_logs")
    op.execute("DROP TABLE IF EXISTS deleted_accounts")
    op.execute("DROP TABLE IF EXISTS admin_audit_logs")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS user_email")
    op.execute("ALTER TABLE profiles DROP CONSTRAINT IF EXISTS ck_profiles_account_status")
    op.execute(
        """
        ALTER TABLE profiles
            DROP COLUMN IF EXISTS status_changed_by,
            DROP COLUMN IF EXISTS status_changed_at,
            DROP COLUMN IF EXISTS status_reason,
            DROP COLUMN IF EXISTS account_status
        """
    )
