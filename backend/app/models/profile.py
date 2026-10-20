import datetime
from typing import List, Optional
from sqlalchemy import CheckConstraint, DateTime, SmallInteger, Text, Time, func, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base

# DAY 6: add cleanup when a user is deleted in Neon Auth


class Profile(Base):
    __tablename__ = "profiles"

    # User ID from Neon Auth token sub claim (TEXT, primary key, indexed)
    user_id: Mapped[str] = mapped_column(Text, primary_key=True, index=True)

    # DAY 4: these texts will go into LLM prompts, treat them as untrusted input
    display_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    role_title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    niche_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audience: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Topics to include and avoid (max 10 items, each max 40 chars)
    topics_include: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )
    topics_avoid: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )

    # Voice and style settings
    tone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    voice_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sample_posts: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Visual branding settings
    brand_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    brand_primary_hex: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    brand_accent_hex: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Delivery and schedule settings
    timezone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    post_time: Mapped[Optional[datetime.time]] = mapped_column(Time, nullable=True)
    post_days: Mapped[List[int]] = mapped_column(
        ARRAY(SmallInteger), nullable=False, server_default=text("'{}'")
    )
    approval_method: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="email"
    )

    # Onboarding tracking
    onboarding_step: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, server_default="0"
    )
    onboarding_completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps with timezone
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    # Database check constraints to protect data integrity at the storage level
    __table_args__ = (
        CheckConstraint(
            "tone IS NULL OR tone IN ('professional', 'friendly', 'direct', 'educational', 'inspiring')",
            name="ck_profiles_tone",
        ),
        CheckConstraint(
            "brand_primary_hex IS NULL OR brand_primary_hex ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_profiles_brand_primary_hex",
        ),
        CheckConstraint(
            "brand_accent_hex IS NULL OR brand_accent_hex ~ '^#[0-9A-Fa-f]{6}$'",
            name="ck_profiles_brand_accent_hex",
        ),
        CheckConstraint(
            "approval_method IN ('email', 'whatsapp')",
            name="ck_profiles_approval_method",
        ),
        CheckConstraint(
            "onboarding_step >= 0 AND onboarding_step <= 4",
            name="ck_profiles_onboarding_step",
        ),
        CheckConstraint(
            "post_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]",
            name="ck_profiles_post_days",
        ),
    )
