"""Support ticket and message models."""

import datetime
from typing import Optional
import uuid

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    user_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    user_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(Text, nullable=False, server_default="medium")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    resolved_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_message_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "category IN ('bug', 'billing', 'linkedin_account', 'posts', 'feature_request', 'other')",
            name="ck_support_tickets_category",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'urgent')",
            name="ck_support_tickets_priority",
        ),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'resolved')",
            name="ck_support_tickets_status",
        ),
        Index("ix_support_tickets_user_last", "user_id", "last_message_at"),
        Index("ix_support_tickets_status_last", "status", "priority", "last_message_at"),
    )


class SupportTicketMessage(Base):
    __tablename__ = "support_ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("support_tickets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_type: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    attachment_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "author_type IN ('user', 'admin')",
            name="ck_support_messages_author_type",
        ),
        Index("ix_support_messages_ticket_created", "ticket_id", "created_at"),
    )
