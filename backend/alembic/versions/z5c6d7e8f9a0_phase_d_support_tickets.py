"""phase D: add support_tickets and support_ticket_messages tables

Revision ID: z5c6d7e8f9a0
Revises: y4b5c6d7e8f9
Create Date: 2026-11-26 13:08:00.000000

"""
from typing import Sequence, Union

from alembic import op


revision: str = "z5c6d7e8f9a0"
down_revision: Union[str, None] = "y4b5c6d7e8f9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS support_tickets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL,
            user_email TEXT NULL,
            user_name TEXT NULL,
            subject TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('bug', 'billing', 'linkedin_account', 'posts', 'feature_request', 'other')),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at TIMESTAMPTZ NULL,
            last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_user_id ON support_tickets (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_user_last ON support_tickets (user_id, last_message_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_tickets_status_last ON support_tickets (status, priority, last_message_at DESC)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS support_ticket_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
            author_type TEXT NOT NULL CHECK (author_type IN ('user', 'admin')),
            author_id TEXT NOT NULL,
            body TEXT NOT NULL,
            is_internal BOOLEAN NOT NULL DEFAULT false,
            attachment_key TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_messages_ticket_id ON support_ticket_messages (ticket_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_support_messages_ticket_created ON support_ticket_messages (ticket_id, created_at ASC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_support_messages_ticket_created")
    op.execute("DROP INDEX IF EXISTS ix_support_messages_ticket_id")
    op.execute("DROP TABLE IF EXISTS support_ticket_messages")
    op.execute("DROP INDEX IF EXISTS ix_support_tickets_status_last")
    op.execute("DROP INDEX IF EXISTS ix_support_tickets_user_last")
    op.execute("DROP INDEX IF EXISTS ix_support_tickets_user_id")
    op.execute("DROP TABLE IF EXISTS support_tickets")
