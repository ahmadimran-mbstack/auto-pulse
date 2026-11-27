"""Admin audit logs, deleted accounts, and email delivery logs."""

import datetime
import uuid
from typing import Any, Dict, Optional

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, SmallInteger, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class AdminAuditLog(Base):
    __tablename__ = "admin_audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    actor_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    actor_email: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    before_state: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    email_status: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_admin_audit_logs_created_at", "created_at"),
        Index("ix_admin_audit_logs_target", "target_type", "target_id"),
        Index("ix_admin_audit_logs_action", "action"),
    )


class DeletedAccount(Base):
    __tablename__ = "deleted_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    deleted_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    deleted_by: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EmailLog(Base):
    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    to_email: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="queued")
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="0")
    max_attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, server_default="5")
    next_attempt_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locked_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sent_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_response_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    total_duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    provider_message_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, unique=True)
    payload: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'sending', 'sent', 'failed', 'skipped', 'unknown')",
            name="ck_email_logs_status",
        ),
        Index("ix_email_logs_user_created", "user_id", "created_at"),
        Index("ix_email_logs_status", "status"),
        Index("ix_email_logs_outbox", "status", "next_attempt_at", "created_at"),
    )


class AdminAlertDismissal(Base):
    __tablename__ = "admin_alert_dismissals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    admin_user_id: Mapped[str] = mapped_column(Text, nullable=False)
    alert_type: Mapped[str] = mapped_column(Text, nullable=False)
    dismissed_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("admin_user_id", "alert_type", name="uq_admin_alert_dismissal_user_type"),
        Index("ix_admin_alert_dismissals_user_type", "admin_user_id", "alert_type"),
    )
