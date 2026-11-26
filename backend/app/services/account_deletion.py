"""Shared account deletion service used by both self-serve DELETE /account and admin user deletion."""

import datetime
import logging
from typing import Any, Dict, Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.limiter import get_redis_client
from app.models.admin import DeletedAccount
from app.models.approval import Approval
from app.models.customization import (
    CustomizationDocument,
    CustomizationFact,
    CustomizationJob,
    CustomizationPostSample,
    CustomizationSettings,
    CustomizationVersion,
)
from app.models.post import GenerationRun, PlaygroundRun, Post, RunEvent
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.slack import SlackApprovalMessage, SlackIntegration
from app.models.social_connection import OAuthState, SocialConnection
from app.repositories import connection as connection_repo
from app.repositories import slack as slack_repo
from app.services.account_status import invalidate_user_status_cache
from app.services.analytics import invalidate_analytics_cache
from app.services.content_profile import invalidate_content_profile_cache
from app.services.run_lock import force_release_manual_run_lock

logger = logging.getLogger(__name__)


def clear_user_redis_keys(user_id: str) -> None:
    """Clear all per-user Redis keys and in-memory caches."""
    invalidate_content_profile_cache(user_id)
    invalidate_analytics_cache(user_id)
    invalidate_user_status_cache(user_id)
    client = get_redis_client()
    if client is None:
        return
    try:
        exact_keys = [
            f"rate_limit:slack_connect:{user_id}",
            f"rate_limit:slack_test:{user_id}",
            f"playground:{user_id}",
            f"manual_run_lock:{user_id}",
            f"content_profile:{user_id}",
            f"customization_ctx:{user_id}",
            f"effective_plan:{user_id}",
        ]
        for key in client.scan_iter(match=f"analytics:{user_id}:*"):
            exact_keys.append(key)
        if exact_keys:
            client.delete(*exact_keys)
    except Exception as exc:
        logger.warning(f"Redis cleanup warning during account deletion: {exc}")


def delete_user_account(
    db: Session,
    user_id: str,
    user_email: Optional[str],
    deleted_by: str,
    reason: Optional[str] = None,
    record_deleted_account: bool = False,
) -> Dict[str, Any]:
    """Delete a user's app data, revoke connections, clear caches, and remove their Neon Auth record.

    Preserves payments, email_logs, admin_audit_logs, support_tickets, and support_ticket_messages
    with user_id and email snapshot.
    """
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    clean_email = user_email.strip().lower() if user_email else None
    revoke_warnings: list[str] = []

    # 1. Stop any running or queued jobs for this user
    try:
        db.query(GenerationRun).filter(
            GenerationRun.user_id == user_id,
            GenerationRun.status.in_(["queued", "running", "started"]),
        ).update(
            {
                "status": "cancelled",
                "cancel_requested": True,
                "finished_at": now_utc,
            },
            synchronize_session=False,
        )
        db.query(PlaygroundRun).filter(
            PlaygroundRun.user_id == user_id,
            PlaygroundRun.status.in_(["queued", "running", "started"]),
        ).update(
            {
                "status": "cancelled",
                "cancel_requested": True,
                "finished_at": now_utc,
            },
            synchronize_session=False,
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(f"Failed stopping active runs during account delete: {exc}")
    force_release_manual_run_lock(user_id)

    # 2. Best-effort revoke and delete Slack and LinkedIn tokens
    try:
        slack_repo.disconnect_slack_integration(db, user_id=user_id)
    except Exception as exc:
        db.rollback()
        revoke_warnings.append(f"slack: {exc}")
        logger.warning(f"Best-effort Slack revoke failed during account delete: {exc}")

    try:
        connection_repo.disconnect_linkedin_connection(db, user_id=user_id)
    except Exception as exc:
        db.rollback()
        revoke_warnings.append(f"linkedin: {exc}")
        logger.warning(f"Best-effort LinkedIn revoke failed during account delete: {exc}")

    # 3. Delete all app data for this user in one transaction (preserve payments, email_logs, admin_audit_logs)
    counts: Dict[str, int] = {}
    try:
        if clean_email:
            db.execute(
                text("UPDATE payments SET user_email = :email WHERE user_id = :uid AND user_email IS NULL"),
                {"email": clean_email, "uid": user_id},
            )

        counts["slack_approval_messages"] = db.query(SlackApprovalMessage).filter(SlackApprovalMessage.user_id == user_id).delete(synchronize_session=False)
        counts["slack_integrations"] = db.query(SlackIntegration).filter(SlackIntegration.user_id == user_id).delete(synchronize_session=False)
        counts["oauth_states"] = db.query(OAuthState).filter(OAuthState.user_id == user_id).delete(synchronize_session=False)
        counts["social_connections"] = db.query(SocialConnection).filter(SocialConnection.user_id == user_id).delete(synchronize_session=False)
        counts["post_publications"] = db.query(PostPublication).filter(PostPublication.user_id == user_id).delete(synchronize_session=False)
        counts["approvals"] = db.query(Approval).filter(Approval.user_id == user_id).delete(synchronize_session=False)
        counts["run_events"] = db.query(RunEvent).filter(RunEvent.user_id == user_id).delete(synchronize_session=False)
        counts["playground_runs"] = db.query(PlaygroundRun).filter(PlaygroundRun.user_id == user_id).delete(synchronize_session=False)
        counts["generation_runs"] = db.query(GenerationRun).filter(GenerationRun.user_id == user_id).delete(synchronize_session=False)
        counts["posts"] = db.query(Post).filter(Post.user_id == user_id).delete(synchronize_session=False)
        counts["customization_jobs"] = db.query(CustomizationJob).filter(CustomizationJob.user_id == user_id).delete(synchronize_session=False)
        counts["customization_facts"] = db.query(CustomizationFact).filter(CustomizationFact.user_id == user_id).delete(synchronize_session=False)
        counts["customization_post_samples"] = db.query(CustomizationPostSample).filter(CustomizationPostSample.user_id == user_id).delete(synchronize_session=False)
        counts["customization_settings"] = db.query(CustomizationSettings).filter(CustomizationSettings.user_id == user_id).delete(synchronize_session=False)
        counts["customization_versions"] = db.query(CustomizationVersion).filter(CustomizationVersion.user_id == user_id).delete(synchronize_session=False)
        counts["customization_documents"] = db.query(CustomizationDocument).filter(CustomizationDocument.user_id == user_id).delete(synchronize_session=False)
        counts["profiles"] = db.query(Profile).filter(Profile.user_id == user_id).delete(synchronize_session=False)

        if record_deleted_account and clean_email:
            db.execute(
                pg_insert(DeletedAccount)
                .values(
                    email=clean_email,
                    user_id=user_id,
                    deleted_by=deleted_by,
                    reason=reason,
                )
                .on_conflict_do_nothing(index_elements=["email"])
            )

        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed deleting app data during account delete: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "delete_data_failed",
                "message": "Could not delete account data. Please try again.",
            },
        )

    # 4. Clear Redis keys, in-memory caches, and customization object storage
    clear_user_redis_keys(user_id)
    try:
        from app.services.customization.context import invalidate_customization_context_cache
        invalidate_customization_context_cache(user_id)
    except Exception:
        pass
    try:
        from app.services.storage import get_storage_backend
        get_storage_backend().delete_prefix(f"customization/{user_id}/")
    except Exception as exc:
        logger.warning(f"Best-effort customization storage cleanup failed for {user_id}: {exc}")

    # 5. Delete the Neon Auth user, sessions, accounts, and verification records
    auth_deleted = False
    try:
        if clean_email:
            db.execute(
                text("DELETE FROM neon_auth.verification WHERE identifier LIKE :pat"),
                {"pat": f"%{clean_email}%"},
            )
        db.execute(text('DELETE FROM neon_auth.invitation WHERE "inviterId"::text = :uid'), {"uid": user_id})
        db.execute(text('DELETE FROM neon_auth.member WHERE "userId"::text = :uid'), {"uid": user_id})
        db.execute(text('DELETE FROM neon_auth.session WHERE "userId"::text = :uid'), {"uid": user_id})
        db.execute(text('DELETE FROM neon_auth.account WHERE "userId"::text = :uid'), {"uid": user_id})
        db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :uid'), {"uid": user_id})
        db.commit()
        auth_deleted = True
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed deleting auth user after app data removal: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "code": "auth_delete_failed",
                "message": "App data was removed, but deleting the sign-in record failed. Please try again.",
            },
        )

    return {
        "deleted": True,
        "auth_deleted": auth_deleted,
        "deleted_counts": counts,
        "revoke_warnings": revoke_warnings,
    }
