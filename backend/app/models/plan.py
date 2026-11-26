"""Plan model storing subscription plans, pricing in cents, limits, and metadata."""

import datetime
from typing import List, Optional

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))

    monthly_price_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    annual_price_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    annual_monthly_equivalent_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    plan_length_days: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("30"))

    linkedin_profiles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    scheduled_posts_per_period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    playground_runs_per_period: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    playground_runs_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    max_post_days_per_week: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    approval_email: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    approval_slack: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    docs_token_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    analytics_level: Mapped[str] = mapped_column(Text, nullable=False, server_default="none")
    support_label: Mapped[str] = mapped_column(Text, nullable=False, server_default="email")
    daily_spend_limit_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_popular: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    rate_limit_tier: Mapped[str] = mapped_column(Text, nullable=False, server_default="starter")
    extra_features: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("1"))
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "analytics_level IN ('none', 'basic', 'full')",
            name="ck_plans_analytics_level",
        ),
        CheckConstraint(
            "rate_limit_tier IN ('trial', 'starter', 'pro', 'business', 'internal')",
            name="ck_plans_rate_limit_tier",
        ),
        Index("ix_plans_public_sort", "is_active", "is_public", "sort_order"),
    )
