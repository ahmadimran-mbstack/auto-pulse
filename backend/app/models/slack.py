import datetime
from typing import Optional
import uuid
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Index,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.session import Base


class SlackIntegration(Base):
    __tablename__ = "slack_integrations"

    # Unique integration record identifier
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # User ID from Neon Auth token (unique per user, indexed)
    user_id: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)

    # Slack workspace team ID and team name
    team_id: Mapped[str] = mapped_column(Text, nullable=False)
    team_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # The only Slack user allowed to approve posts for this user
    slack_user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # 1-to-1 DM channel ID with the installing Slack user
    dm_channel_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Fernet-encrypted bot access token
    bot_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)

    # Bot user ID (e.g. U12345678)
    bot_user_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Connection lifecycle status: connected or disconnected
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="connected"
    )

    # Short error message from Slack API if connection failed (no personal text or tokens)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Creation and update timestamps
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('connected', 'disconnected')",
            name="ck_slack_integrations_status",
        ),
    )


class SlackApprovalMessage(Base):
    __tablename__ = "slack_approval_messages"

    # Unique record identifier
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # The post to be approved (unique per post)
    post_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, unique=True
    )

    # User ID from Neon Auth token
    user_id: Mapped[str] = mapped_column(Text, nullable=False, index=True)

    # Slack DM channel ID
    channel_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Slack message timestamp (identifier of the posted message in the channel)
    message_ts: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Dispatch lifecycle status: sending, sent, or failed
    status: Mapped[str] = mapped_column(
        Text, nullable=False, server_default="sending"
    )

    # Creation and update timestamps
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('sending', 'sent', 'failed')",
            name="ck_slack_approval_messages_status",
        ),
        Index(
            "ix_slack_approval_messages_channel_message_ts",
            "channel_id",
            "message_ts",
        ),
    )
