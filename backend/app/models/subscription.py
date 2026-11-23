"""Subscription model storing each user's current plan and billing period."""

import datetime
from typing import Optional
import uuid

from sqlalchemy import CheckConstraint, Date, DateTime, Text, UniqueConstraint, func, text
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
