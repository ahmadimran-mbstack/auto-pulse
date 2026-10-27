import logging
from typing import Optional
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.crypto import decrypt_text, encrypt_text
from app.models.profile import Profile
from app.models.slack import SlackIntegration
from app.services import slack as slack_service

logger = logging.getLogger(__name__)


def get_slack_integration(db: Session, user_id: str) -> Optional[SlackIntegration]:
    """Retrieve caller's Slack integration record."""
    stmt = select(SlackIntegration).where(SlackIntegration.user_id == user_id)
    return db.scalars(stmt).first()


def upsert_slack_integration(
    db: Session,
    user_id: str,
    team_id: str,
    team_name: Optional[str],
    slack_user_id: str,
    dm_channel_id: str,
    bot_token: str,
    bot_user_id: str,
) -> SlackIntegration:
    """
    Atomically upsert the Slack integration row by user_id in one statement,
    encrypting the bot token with Fernet.
    Also enables slack_approval_enabled on caller's profile.
    """
    bot_token_encrypted = encrypt_text(bot_token)

    insert_stmt = (
        pg_insert(SlackIntegration)
        .values(
            user_id=user_id,
            team_id=team_id,
            team_name=team_name,
            slack_user_id=slack_user_id,
            dm_channel_id=dm_channel_id,
            bot_token_encrypted=bot_token_encrypted,
            bot_user_id=bot_user_id,
            status="connected",
            last_error=None,
        )
        .on_conflict_do_update(
            index_elements=["user_id"],
            set_={
                "team_id": team_id,
                "team_name": team_name,
                "slack_user_id": slack_user_id,
                "dm_channel_id": dm_channel_id,
                "bot_token_encrypted": bot_token_encrypted,
                "bot_user_id": bot_user_id,
                "status": "connected",
                "last_error": None,
                "updated_at": func.now(),
            },
        )
        .returning(SlackIntegration)
    )

    integration = db.execute(insert_stmt).scalar_one()

    # Atomically enable slack_approval_enabled on profile
    db.execute(
        text(
            "UPDATE profiles SET slack_approval_enabled = true, updated_at = now() WHERE user_id = :user_id"
        ),
        {"user_id": user_id},
    )
    db.commit()

    return integration


def disconnect_slack_integration(db: Session, user_id: str) -> None:
    """
    Disconnects Slack integration: calls auth.revoke (best effort),
    deletes encrypted token, marks disconnected, and sets slack_approval_enabled to false.
    """
    integration = get_slack_integration(db, user_id=user_id)
    if not integration:
        return

    # Attempt best-effort revocation at Slack
    try:
        if integration.bot_token_encrypted:
            plain_token = decrypt_text(integration.bot_token_encrypted)
            slack_service.revoke_token_best_effort(plain_token)
    except Exception as exc:
        logger.debug(f"Slack token decryption for revoke failed: {exc}")

    # Remove encrypted token and set status disconnected
    integration.bot_token_encrypted = ""
    integration.status = "disconnected"
    integration.updated_at = func.now()

    # Set profile slack_approval_enabled to false
    db.execute(
        text(
            "UPDATE profiles SET slack_approval_enabled = false, updated_at = now() WHERE user_id = :user_id"
        ),
        {"user_id": user_id},
    )
    db.commit()
