"""Subscription model storing each user's current plan and billing period."""

import datetime
from typing import Optional
import uuid

from sqlalchemy import CheckConstraint, Date, DateTime, Index, Integer, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[str] = mapped_column(Text, primary_key=True, index=True)
    plan_id: Mapped[str] = mapped_column(Text, nullable=False, server_default="trial")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="trialing")
    billing_interval: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trial_ends_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_start: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    current_period_end: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    provider_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_plan_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pending_billing_interval: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('trialing', 'active', 'expired', 'canceled')",
            name="ck_subscriptions_status",
        ),
        CheckConstraint(
            "billing_interval IS NULL OR billing_interval IN ('monthly', 'annual')",
            name="ck_subscriptions_billing_interval",
        ),
    )


class ReminderSent(Base):
    __tablename__ = "reminders_sent"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    reminder_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    sent_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "reminder_type",
            "target_date",
            name="uq_reminders_sent_user_type_date",
        ),
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    user_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    plan_id: Mapped[str] = mapped_column(Text, nullable=False)
    billing_interval: Mapped[str] = mapped_column(Text, nullable=False)
    amount_usd_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_pkr: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    transaction_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    submitted_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    reviewed_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="checkout")
    recorded_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voided_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    voided_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    void_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "billing_interval IN ('monthly', 'annual')",
            name="ck_payments_billing_interval",
        ),
        CheckConstraint(
            "method IN ('easypaisa', 'jazzcash', 'manual', 'cash', 'bank_transfer')",
            name="ck_payments_method",
        ),
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected', 'voided')",
            name="ck_payments_status",
        ),
        CheckConstraint(
            "source IN ('checkout', 'manual')",
            name="ck_payments_source",
        ),
        Index(
            "uq_payments_transaction_id_active",
            "transaction_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'approved', 'voided')"),
        ),
        Index(
            "uq_payments_method_transaction_id_active",
            "method",
            "transaction_id",
            unique=True,
            postgresql_where=text("status IN ('pending', 'approved', 'voided')"),
        ),
        Index(
            "uq_payments_user_pending",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
    )
